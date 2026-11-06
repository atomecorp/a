// Scheduled sends (server/scheduled_sends.js and ws_scheduled_sends.js, ported; user decisions of
// 28 Oct. 2026, todo: publication programmée): what an owner asked to leave at a time — a
// publication to the eVe feed, messages to people, a share to the social networks, or the update
// of one already sent. The server holds it and its clock sends it through the very paths a live
// send takes (channels.rs), so a sleeping device never holds it back. Until its time the owner
// replaces it at will (Q2: what leaves is the content at its time). Late (the owner's device
// reached the server after the time) it leaves at once and the owner is told (Q3); a channel
// refusing (a network's session expired) is told too, the touch reopening it in the Agenda.
// `scheduled-send` frames of `/ws/api` are an account's (projection_ops.rs); fire.rs sends one and
// holds the clock.
mod channels;
mod fire;
mod store;

use super::WsApi;
use super::projection_ops::response;
use crate::vault_router::js;
use atome_store::intent::js_stringify;
pub(super) use fire::clock;
use fire::fire;
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, LazyLock};
use store::{Saved, Store};
use tokio::sync::Notify;

pub(super) const KIND: &str = "scheduled-send";
const MAX_PAYLOAD_CHARS: usize = 1_000_000;
const KINDS: [&str; 2] = ["send", "update"];

// A send saved: the clock looks again at the next due time.
static ARMED: LazyLock<Notify> = LazyLock::new(Notify::new);

// `String(value ?? '').trim()`.
fn text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::trim(&js::text(Some(value))).to_string(),
    }
}

// `new Date(text(value)).toISOString()`, '' for no date.
fn iso(value: Option<&JsonValue>) -> String {
    js::date(Some(&json!(text(value))))
        .map(js::iso)
        .unwrap_or_default()
}

// `JSON.parse(value)` of a stored column, `fallback` when empty or unreadable.
fn parse(value: &JsonValue, fallback: JsonValue) -> JsonValue {
    value
        .as_str()
        .filter(|text| !text.is_empty())
        .and_then(|text| serde_json::from_str(text).ok())
        .unwrap_or(fallback)
}

fn or_null(value: &JsonValue) -> JsonValue {
    if js::truthy(Some(value)) {
        value.clone()
    } else {
        JsonValue::Null
    }
}

fn public_row(row: &JsonValue) -> JsonValue {
    json!({ "send_id": row["send_id"], "kind": row["kind"], "parent_id": or_null(&row["parent_id"]),
        "title": row["title"], "due_at": row["due_at"], "state": row["state"],
        "payload": parse(&row["payload_json"], json!({})), "result": parse(&row["result_json"], JsonValue::Null),
        "done_at": or_null(&row["done_at"]), "updated_at": row["updated_at"] })
}

// `typeof value === 'object' && value`.
fn object(value: Option<&JsonValue>) -> bool {
    matches!(value, Some(JsonValue::Object(_) | JsonValue::Array(_)))
}

fn truthy(value: Option<&JsonValue>) -> bool {
    js::truthy(value)
}

fn filled(value: Option<&JsonValue>) -> bool {
    value
        .and_then(JsonValue::as_array)
        .is_some_and(|items| !items.is_empty())
}

// What a send carries: at least one channel, each in the shape its live path takes.
fn invalid(payload: Option<&JsonValue>) -> Option<&'static str> {
    if !object(payload) {
        return Some("scheduled_payload_required");
    }
    let payload = payload?;
    let (news, forums) = (payload.get("news"), payload.get("forums"));
    let (messages, social) = (payload.get("messages"), payload.get("social"));
    if !truthy(news) && !filled(forums) && !filled(messages) && !truthy(social) {
        return Some("scheduled_channel_required");
    }
    if truthy(news) && !object(news?.get("publication")) {
        return Some("scheduled_news_publication_required");
    }
    // A forum's post: a News whose audience is the forum, named for the owner (`name`).
    let forum_invalid = |entry: &JsonValue| {
        !truthy(Some(entry))
            || !object(entry.get("publication"))
            || !entry
                .get("audience")
                .and_then(|audience| audience.get("forum"))
                .is_some_and(JsonValue::is_string)
    };
    if truthy(forums)
        && forums?
            .as_array()
            .is_none_or(|all| all.iter().any(forum_invalid))
    {
        return Some("scheduled_forum_invalid");
    }
    let message_invalid = |entry: &JsonValue| {
        !truthy(Some(entry))
            || !entry.get("message").is_some_and(JsonValue::is_string)
            || !(truthy(entry.get("toUserId")) || truthy(entry.get("toPhone")))
    };
    if truthy(messages)
        && messages?
            .as_array()
            .is_none_or(|all| all.iter().any(message_invalid))
    {
        return Some("scheduled_message_invalid");
    }
    // The networks: what to prepare at the time (a send), or the new text of the posts its parent
    // published (an update).
    if truthy(social) {
        let social = social?;
        let destinations = social["destinations"].as_array();
        let content = truthy(social.get("content")) && object(social.get("content"));
        if destinations.is_none_or(|all| all.is_empty() || all.len() > 8)
            || (!content && !social["text"].is_string())
        {
            return Some("scheduled_social_invalid");
        }
    }
    if js_stringify(payload).encode_utf16().count() > MAX_PAYLOAD_CHARS {
        return Some("scheduled_payload_too_large");
    }
    None
}

fn store(ws_api: &WsApi) -> Store<'_> {
    Store(ws_api.sessions.central())
}

async fn save(ws_api: &WsApi, owner: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let send_id = text(message.get("send_id"));
    let kind = Some(text(message.get("kind")))
        .filter(|kind| !kind.is_empty())
        .unwrap_or_else(|| "send".into());
    let due = iso(message.get("due_at"));
    if send_id.is_empty() || send_id.encode_utf16().count() > 200 {
        return Err("scheduled_send_id_required".into());
    }
    if !KINDS.contains(&kind.as_str()) {
        return Err("scheduled_kind_invalid".into());
    }
    if due.is_empty() {
        return Err("scheduled_due_invalid".into());
    }
    if let Some(error) = invalid(message.get("payload")) {
        return Err(error.into());
    }
    let store = store(ws_api);
    if let Some(existing) = store.get(&send_id).await? {
        if existing["owner_id"] != owner {
            return Err("scheduled_send_not_owned".into());
        }
        if existing["state"] != "pending" {
            return Err("scheduled_send_already_done".into());
        }
    }
    let parent_id = Some(text(message.get("parent_id"))).filter(|id| !id.is_empty());
    if kind == "update" {
        let parent = match &parent_id {
            Some(parent_id) => store.get(parent_id).await?,
            None => None,
        };
        if parent.is_none_or(|parent| parent["owner_id"] != owner) {
            return Err("scheduled_update_parent_required".into());
        }
    }
    let title = js::slice(&text(message.get("title")), 200);
    let saved = Saved {
        send_id: &send_id,
        owner_id: owner,
        kind: &kind,
        parent_id: parent_id.as_deref(),
        title: &title,
        due_at: &due,
        payload: &message["payload"],
    };
    store.put(saved).await?;
    ARMED.notify_one();
    let send = store.get(&send_id).await?.unwrap_or(JsonValue::Null);
    Ok(json!({ "ok": true, "send": public_row(&send) }))
}

async fn owned(
    ws_api: &WsApi,
    owner: &str,
    send_id: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    match store(ws_api).get(&text(send_id)).await? {
        Some(row) if row["owner_id"] == owner => Ok(row),
        _ => Err("scheduled_send_not_found".into()),
    }
}

async fn cancel(ws_api: &WsApi, owner: &str, message: &JsonValue) -> Result<JsonValue, String> {
    let row = owned(ws_api, owner, message.get("send_id")).await?;
    if row["state"] != "pending" {
        return Err("scheduled_send_already_done".into());
    }
    let store = store(ws_api);
    let send_id = js::text(row.get("send_id"));
    store.finish(&send_id, "pending", "cancelled", None).await?;
    // Its planned updates go with it.
    for child in store.children(&send_id).await? {
        if child["state"] == "pending" {
            let child_id = js::text(child.get("send_id"));
            store
                .finish(&child_id, "pending", "cancelled", None)
                .await?;
        }
    }
    let send = store.get(&send_id).await?.unwrap_or(JsonValue::Null);
    Ok(json!({ "ok": true, "send": public_row(&send) }))
}

async fn send_now(
    ws_api: &Arc<WsApi>,
    owner: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let row = owned(ws_api, owner, message.get("send_id")).await?;
    if row["state"] != "pending" {
        return Err("scheduled_send_already_done".into());
    }
    Ok(json!({ "ok": true, "send": fire(ws_api, &row).await? }))
}

async fn handle(
    ws_api: &Arc<WsApi>,
    message: &JsonValue,
    owner: &str,
) -> Result<JsonValue, String> {
    let action = text(message.get("action"));
    match action.as_str() {
        "save" => save(ws_api, owner, message).await,
        "cancel" => cancel(ws_api, owner, message).await,
        "send-now" => send_now(ws_api, owner, message).await,
        "read" => {
            let row = owned(ws_api, owner, message.get("send_id")).await?;
            Ok(json!({ "ok": true, "send": public_row(&row) }))
        }
        "list" => {
            let since = Some(iso(message.get("since"))).filter(|since| !since.is_empty());
            let rows = store(ws_api).of_owner(owner, since.as_deref()).await?;
            let sends: Vec<JsonValue> = rows.iter().map(public_row).collect();
            Ok(json!({ "ok": true, "sends": sends }))
        }
        "" => Err("scheduled_action_unsupported:missing".into()),
        other => Err(format!("scheduled_action_unsupported:{other}")),
    }
}

/// A `scheduled-send` frame of `owner`'s, answered.
pub(super) async fn frame(ws_api: &Arc<WsApi>, message: &JsonValue, owner: &str) -> JsonValue {
    match handle(ws_api, message, owner).await {
        Ok(result) => {
            let success = result.get("ok") != Some(&json!(false));
            response(KIND, message, success, result)
        }
        Err(error) => {
            let error = if error.is_empty() {
                "scheduled_failed".to_string()
            } else {
                error
            };
            response(KIND, message, false, json!({ "error": error }))
        }
    }
}
