// The `share` family of `/ws/api` (server/ws_api_message_handlers.js `handleWsShareRequest`
// and server/sharing_message_api.js `handleShareMessage`, ported): every share's life is the
// canonical engine's (social/sharing/), a property's privacy rule its owner's
// (social/privacy_rules.rs), for the account the connection is (identity.rs); people are told
// live and each notice is delivered live or to its queue (social/live.rs); the pushes to the
// devices leave after the answer. The central permission reads (`get-atome`, `accessible`,
// `check`), which no client calls, are retired: they are answered as any unknown action.
use super::Connection;
use crate::social::live;
use crate::social::push::Audience;
use crate::social::sharing::Effect;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KIND: &str = "share";

// The engine's actions (`CANONICAL_SHARE_ACTIONS`), read lowered.
const CANONICAL: [&str; 18] = [
    "request",
    "respond",
    "publish",
    "create",
    "revoke",
    "inbox",
    "shared-with-me",
    "my-shares",
    "sent",
    "pending",
    "policy",
    "update-rights",
    "with-peer",
    "list-view",
    "accept-version",
    "refuse-version",
    "detach",
    "announce",
];

fn reply(fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("share-response"));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

// `{ requestId, …fields }`, the id left out when the message carries none.
fn with_request(request_id: Option<&JsonValue>, fields: JsonValue) -> JsonValue {
    let mut out = JsonMap::new();
    if let Some(id) = request_id {
        out.insert("requestId".into(), id.clone());
    }
    if let JsonValue::Object(fields) = fields {
        out.extend(fields);
    }
    JsonValue::Object(out)
}

// `handleShareMessage(message, userId)`: its `requestId` is the message's own.
async fn decided(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
    out: &mut Vec<Effect>,
) -> JsonValue {
    let request_id = message.get("requestId");
    let failed =
        |error: String| with_request(request_id, json!({ "success": false, "error": error }));
    let action = message.get("action");
    let lowered = if js::truthy(action) {
        js::string(&message["action"]).to_lowercase()
    } else {
        String::new()
    };
    let social = &connection.ws_api.social;
    if CANONICAL.contains(&lowered.as_str()) {
        return match social.sharing.handle(message, user, out).await {
            Ok(result) => {
                let mut fields =
                    json!({ "success": result.get("ok") != Some(&json!(false)), "data": result });
                if let (Some(fields), Some(result)) = (fields.as_object_mut(), result.as_object()) {
                    fields.extend(result.clone());
                }
                with_request(request_id, fields)
            }
            Err(error) => failed(error),
        };
    }
    let atome_id = message
        .get("atome_id")
        .filter(|id| js::truthy(Some(id)))
        .map(js::string);
    let central = connection.ws_api.sessions.central();
    match action.and_then(JsonValue::as_str) {
        // §12.5: output rules on one's own data, restrictive only.
        Some("privacy-rule-set") => {
            let key = message
                .get("particle_key")
                .filter(|key| js::truthy(Some(key)))
                .map(js::string);
            let (Some(atome_id), Some(key)) = (atome_id, key) else {
                return failed("Missing atome_id or particle_key".into());
            };
            let (actor, conditions) = (user.to_string(), message.get("conditions").cloned());
            let result = central
                .transaction(move |db| {
                    crate::social::privacy_rules::set(
                        db,
                        &atome_id,
                        &key,
                        conditions.as_ref(),
                        &actor,
                    )
                })
                .await;
            match result {
                Ok(result) if result["ok"] == json!(true) => {
                    let mut fields = json!({ "success": true });
                    if let (Some(fields), Some(result)) =
                        (fields.as_object_mut(), result.as_object())
                    {
                        fields.extend(result.clone());
                    }
                    with_request(request_id, fields)
                }
                Ok(result) => failed(js::string(&result["error"])),
                Err(error) => failed(error),
            }
        }
        Some("privacy-rule-list") => {
            let Some(atome_id) = atome_id else {
                return failed("Missing atome_id".into());
            };
            let actor = user.to_string();
            match central
                .transaction(move |db| crate::social::privacy_rules::list(db, &atome_id, &actor))
                .await
            {
                Ok(result) if result["ok"] == json!(true) => with_request(
                    request_id,
                    json!({ "success": true, "rules": result["rules"] }),
                ),
                Ok(result) => failed(js::string(&result["error"])),
                Err(error) => failed(error),
            }
        }
        _ => failed(format!("Unknown action: {}", js::text(action))),
    }
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let request_id = js::first(&message, &["requestId", "request_id"]).cloned();
    let refused = |error: &str| {
        reply(with_request(
            request_id.as_ref(),
            json!({ "success": false, "error": error }),
        ))
    };
    // The token the request carries binds the connection (as an atome request does): a share sent
    // right after a reconnection, before the socket's own auth, was refused (`share_request_auth_required`).
    let front = match connection
        .connection_of(json!({ "message": message, "signed": true }))
        .await
    {
        Ok(front) => front,
        Err(error) => return connection.reply(refused(&error)).await,
    };
    if let Some(session_error) = front.get("session_error") {
        return connection.reply(session_error.clone()).await;
    }
    let signed = front
        .get("principal")
        .and_then(JsonValue::as_str)
        .map(str::to_string);
    let Some(user) = signed.clone().or_else(|| connection.attached()) else {
        return connection
            .reply(refused("share_request_auth_required"))
            .await;
    };
    let provisioned = if signed.is_some() {
        front.get("provisioned") == Some(&json!(true))
    } else {
        connection.provisioned(&user).await.unwrap_or(false)
    };
    if !provisioned {
        return connection
            .reply(refused("remote_account_not_provisioned"))
            .await;
    }
    let social = &connection.ws_api.social;
    // First contact and blocks: a share request is a peer-to-peer communication; blocked by the
    // recipient, it seems to succeed and nothing is made.
    let action = js::text(message.get("action")).to_lowercase();
    if action == "request" || action == "create" {
        let target = social
            .sharing
            .target_id(&message)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();
        let (sender, central) = (user.clone(), connection.ws_api.sessions.central());
        let verdict = central
            .transaction(move |db| crate::social::relations::can_communicate(db, &sender, &target))
            .await;
        match verdict {
            Ok(verdict) if verdict["ok"] == json!(true) => {}
            Ok(verdict) if verdict["silent"] == json!(true) => {
                let fields = json!({ "success": true, "ok": true, "requests": [], "streams": [] });
                return connection
                    .reply(reply(with_request(request_id.as_ref(), fields)))
                    .await;
            }
            Ok(verdict) => {
                return connection
                    .reply(refused(&js::string(&verdict["error"])))
                    .await;
            }
            Err(error) => return connection.reply(refused(&error)).await,
        }
    }
    let mut effects = Vec::new();
    let answer = decided(&connection, &message, &user, &mut effects).await;
    let mut pushes = Vec::new();
    for effect in effects {
        match effect {
            Effect::Tell(target, payload) => {
                live::tell(&target, &payload).await;
            }
            Effect::Notice(notice) => {
                live::deliver(&notice.target, &notice.frame).await;
                if let Some(push) = notice.push {
                    pushes.push((notice.target, push));
                }
            }
        }
    }
    connection.reply(reply(answer)).await;
    for (target, push) in pushes {
        // Its outcome reaches nobody: the notice is stored and answered.
        let _ = social
            .push
            .deliver(&target, &push, &Audience::default())
            .await;
    }
}
