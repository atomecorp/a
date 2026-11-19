// A person's notification stack (server/notificationStack.js, ported): the
// `message_stack` of their user atome in the central database, read and rewritten in
// one immediate transaction so no two writers (this server, another process on the same
// database) lose each other's changes. Each write is an ordinary
// commit of the user atome by its owner. A pushed notice keeps the read, archived,
// to-do and urgent flags its earlier copy had; the unread and unarchived ones are all
// kept, the others only within the last `max_keep`.
use super::contract;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use atome_store::append::{AppendOptions, ConflictMode, iso_now};
use atome_store::{CommitOutcome, commit_events};
use rusqlite::{OptionalExtension, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const STACK_KEYS: [&str; 5] = [
    "message_stack",
    "messageStack",
    "notification_stack",
    "notificationStack",
    "notifications",
];
const FLAGS: [&str; 4] = ["unread", "archived", "todo", "urgent"];

pub struct NotificationStack {
    pub(super) central: Central,
}

fn missing(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

// `String(item?.id || item?.message_id)`.
fn item_id(item: &JsonValue) -> Option<String> {
    js::first(item, &["id", "message_id"]).map(js::string)
}

// `normalizeStackValue`: an array, or the `items`/`data` array of an object, JSON text or not.
fn stack_of(value: &JsonValue) -> Vec<JsonValue> {
    let nested = |object: &JsonValue| match js::first(object, &["items", "data"]) {
        Some(JsonValue::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    match value {
        JsonValue::Array(items) => items.clone(),
        JsonValue::String(text) if !text.is_empty() => {
            match serde_json::from_str::<JsonValue>(text) {
                Ok(JsonValue::Array(items)) => items,
                Ok(parsed @ JsonValue::Object(_)) => nested(&parsed),
                _ => Vec::new(),
            }
        }
        JsonValue::Object(_) => nested(value),
        _ => Vec::new(),
    }
}

// `getAtome(userId)` read for its stack (`resolveStack`); None when the user atome is gone.
fn user_stack(db: &rusqlite::Connection, user_id: &str) -> Result<Option<Vec<JsonValue>>, String> {
    let exists = db
        .query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
            params![user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Ok(None);
    }
    let mut statement = db
        .prepare_cached(
            "SELECT particle_key, particle_value FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
        )
        .map_err(|e| e.to_string())?;
    let mut data = JsonMap::new();
    let rows = statement
        .query_map(params![user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (key, raw) = row.map_err(|e| e.to_string())?;
        if !STACK_KEYS.contains(&key.as_str()) {
            continue;
        }
        let raw = raw.unwrap_or_default();
        let value = serde_json::from_str(&raw).unwrap_or(JsonValue::String(raw));
        data.insert(key, value);
    }
    let data = JsonValue::Object(data);
    Ok(Some(
        js::first(&data, &STACK_KEYS)
            .map(stack_of)
            .unwrap_or_default(),
    ))
}

// `writeStack`: the stack committed on the user atome by its owner.
fn write_stack(
    db: &rusqlite::Connection,
    user_id: &str,
    stack: &[JsonValue],
) -> Result<(), String> {
    let event = json!({
        "atome_id": user_id, "kind": "set",
        "payload": { "scope": "global", "props": { "message_stack": stack, "notification_stack": stack } },
        "actor": { "type": "user", "id": user_id }, "source": "communication.notifications",
    });
    let options = AppendOptions {
        source: None,
        tx_id: None,
        conflict_mode: ConflictMode::Interactive,
        stored_truth: false,
    };
    match commit_events(db, &[event], user_id, &options)? {
        CommitOutcome::Committed(_) => Ok(()),
        CommitOutcome::Refused { decision, .. } => Err(decision.reason.to_string()),
    }
}

// The fields an origin keeps, each object's own (R-190 §5 bis): where a network's message or
// comment came from and how a reply goes back.
const ORIGIN_KEYS: [&str; 8] = [
    "network",
    "account",
    "kind",
    "thread",
    "remote_id",
    "post",
    "author",
    "reply",
];
const ORIGIN_POST_KEYS: [&str; 5] = ["id", "url", "title", "job_id", "thumbnail_url"];
const ORIGIN_AUTHOR_KEYS: [&str; 4] = ["id", "name", "handle", "avatar_url"];
const ORIGIN_REPLY_KEYS: [&str; 3] = ["mode", "until", "private_until"];

// An object's listed fields, its other ones dropped; a nested object only where it is one.
fn kept_fields(value: &JsonValue, keys: &[&str]) -> JsonValue {
    let mut kept = JsonMap::new();
    for key in keys {
        let Some(field) = value.get(*key) else {
            continue;
        };
        let nested = match *key {
            "post" => Some(&ORIGIN_POST_KEYS[..]),
            "author" => Some(&ORIGIN_AUTHOR_KEYS[..]),
            "reply" => Some(&ORIGIN_REPLY_KEYS[..]),
            _ => None,
        };
        let field = match (nested, field) {
            (Some(keys), JsonValue::Object(_)) => kept_fields(field, keys),
            (Some(_), _) => JsonValue::Null,
            (None, JsonValue::Object(_) | JsonValue::Array(_)) => JsonValue::Null,
            (None, scalar) => scalar.clone(),
        };
        kept.insert((*key).into(), field);
    }
    JsonValue::Object(kept)
}

// A notice's `origin`: an object with its listed fields only, else null.
fn origin_of(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(origin @ JsonValue::Object(_)) => kept_fields(origin, &ORIGIN_KEYS),
        _ => JsonValue::Null,
    }
}

// `normalizeNotification`: the stored shape of a notice, or None without an id.
fn normalized(input: &JsonValue) -> Result<Option<JsonValue>, String> {
    let Some(id) = js::first(input, &["message_id", "messageId", "id"]).cloned() else {
        return Ok(None);
    };
    let or =
        |keys: &[&str], fallback: JsonValue| js::first(input, keys).cloned().unwrap_or(fallback);
    let flag = |key: &str| input.get(key) == Some(&JsonValue::Bool(true));
    let atome_ids = match js::first(input, &["atome_ids", "atomeIds"]) {
        Some(ids @ JsonValue::Array(_)) => ids.clone(),
        _ => json!([]),
    };
    let severity = match input.get("severity").and_then(JsonValue::as_str) {
        Some("critical") => "critical",
        Some("warning") => "warning",
        _ => "info",
    };
    let publication = match input.get("publication") {
        Some(publication @ (JsonValue::Object(_) | JsonValue::Array(_))) => publication.clone(),
        _ => JsonValue::Null,
    };
    Ok(Some(json!({
        "id": id, "message_id": id,
        "kind": or(&["kind", "command", "type"], json!("message")),
        "subject": or(&["subject"], json!("")),
        "message": or(&["message", "text"], json!("")),
        "atome_ids": atome_ids,
        "mode": or(&["mode", "share_mode", "shareMode"], JsonValue::Null),
        "share_type": or(&["share_type", "shareType"], JsonValue::Null),
        "request_atome_id": or(&["request_atome_id", "requestAtomeId"], JsonValue::Null),
        "share_id": or(&["share_id", "shareId"], JsonValue::Null),
        "from_id": or(&["from_id", "fromId"], JsonValue::Null),
        "from_name": or(&["from_name", "fromName"], JsonValue::Null),
        "from_phone": or(&["from_phone", "fromPhone"], JsonValue::Null),
        "to_user_id": or(&["to_user_id", "toUserId"], JsonValue::Null),
        "to_phone": or(&["to_phone", "toPhone"], JsonValue::Null),
        "timestamp": or(&["timestamp", "date"], json!(iso_now())),
        "unread": input.get("unread") != Some(&JsonValue::Bool(false)),
        "status": or(&["status"], JsonValue::Null),
        "archived": flag("archived"),
        "todo": flag("todo"),
        "urgent": flag("urgent"),
        "priority": contract::priority(input.get("priority"))?,
        "action": contract::action(input.get("action"))?,
        "severity": severity,
        "publication": publication,
        "room_id": or(&["room_id", "roomId"], JsonValue::Null),
        "reason": or(&["reason"], JsonValue::Null),
        "call_mode": or(&["call_mode"], JsonValue::Null),
        "expires_at": or(&["expires_at"], JsonValue::Null),
        "starts_at": or(&["starts_at", "startsAt"], JsonValue::Null),
        "ends_at": or(&["ends_at", "endsAt"], JsonValue::Null),
        "origin": origin_of(input.get("origin")),
    })))
}

// `array.slice(-keep)`.
fn last(items: &[JsonValue], keep: i64) -> &[JsonValue] {
    let length = items.len() as i64;
    let start = if keep > 0 {
        (length - keep).max(0)
    } else {
        (-keep).min(length)
    };
    &items[start as usize..]
}

// `pushToStack`: the stack with the notice in, its earlier copy's flags kept.
fn pushed(
    db: &rusqlite::Connection,
    user_id: &str,
    input: &JsonValue,
    max_keep: i64,
) -> Result<JsonValue, String> {
    let Some(mut notice) = normalized(input)? else {
        return Ok(missing("invalid_notification"));
    };
    let Some(existing) = user_stack(db, user_id)? else {
        return Ok(missing("user_atome_missing"));
    };
    let id = js::string(&notice["id"]);
    if let Some(previous) = existing
        .iter()
        .find(|item| item_id(item).as_deref() == Some(id.as_str()))
    {
        for flag in FLAGS {
            notice[flag] = json!(previous.get(flag) == Some(&JsonValue::Bool(true)));
        }
    }
    let mut deduped: Vec<JsonValue> = existing
        .into_iter()
        .filter(|item| item_id(item).is_some_and(|item| item != id))
        .collect();
    deduped.push(notice.clone());
    let pending = |item: &JsonValue| {
        item.get("unread") != Some(&JsonValue::Bool(false))
            && item.get("archived") != Some(&JsonValue::Bool(true))
    };
    let retained: std::collections::HashSet<String> = deduped
        .iter()
        .filter(|item| pending(item))
        .chain(last(&deduped, max_keep))
        .filter_map(item_id)
        .collect();
    let stack: Vec<JsonValue> = deduped
        .into_iter()
        .filter(|item| item_id(item).is_some_and(|id| retained.contains(&id)))
        .collect();
    write_stack(db, user_id, &stack)?;
    Ok(json!({ "ok": true, "count": stack.len(), "stack": stack, "notification": notice }))
}

// The id a request names, `null` when it names none (`String(...)` when compared).
fn named(id: Option<&JsonValue>) -> Option<&JsonValue> {
    id.filter(|id| js::truthy(Some(id)))
}

impl NotificationStack {
    pub fn new(central: Central) -> Self {
        Self { central }
    }

    /// `readNotificationStack`.
    pub async fn read(&self, user_id: &str) -> Result<JsonValue, String> {
        if user_id.is_empty() {
            return Ok(missing("missing_user"));
        }
        let user = user_id.to_string();
        self.central
            .transaction(move |db| {
                Ok(match user_stack(db, &user)? {
                    Some(stack) => json!({ "ok": true, "count": stack.len(), "stack": stack }),
                    None => missing("user_atome_missing"),
                })
            })
            .await
    }

    /// `pushNotificationToUserStack` without its push delivery, which stays its caller's:
    /// the stored notice comes back as `notification`.
    pub async fn push(
        &self,
        user_id: &str,
        notification: JsonValue,
        max_keep: i64,
    ) -> Result<JsonValue, String> {
        if user_id.is_empty() || !js::truthy(Some(&notification)) {
            return Ok(missing("missing_user_or_notification"));
        }
        let user = user_id.to_string();
        self.central
            .transaction(move |db| pushed(db, &user, &notification, max_keep))
            .await
    }

    /// `publishOwnNotification`: a retry of the same notice answers it as stored; the same
    /// id with another content, or from another sender, is refused.
    pub async fn publish_own(
        &self,
        user_id: &str,
        notification: JsonValue,
    ) -> Result<JsonValue, String> {
        let user = user_id.to_string();
        self.central
            .transaction(move |db| {
                let Some(stack) = user_stack(db, &user)? else {
                    return Ok(missing("user_atome_missing"));
                };
                let id = js::string(&notification["id"]);
                if let Some(existing) = stack.iter().find(|item| item_id(item).as_deref() == Some(id.as_str())) {
                    let same = |key: &str| existing.get(key) == notification.get(key);
                    if existing.get("from_id") != Some(&json!(user)) || !same("kind") || !same("message") || !same("action") {
                        return Err("notification_id_conflict".into());
                    }
                    return Ok(json!({ "ok": true, "duplicate": true, "notification": existing, "stack": stack }));
                }
                let result = pushed(db, &user, &notification, 200)?;
                let mut answer = JsonMap::new();
                answer.insert("ok".into(), result["ok"].clone());
                if let Some(stack) = result.get("stack").and_then(JsonValue::as_array) {
                    if let Some(own) = stack.iter().find(|item| item["id"] == notification["id"]) {
                        answer.insert("notification".into(), own.clone());
                    }
                    answer.insert("stack".into(), json!(stack));
                }
                if let Some(error) = result.get("error") {
                    answer.insert("error".into(), error.clone());
                }
                Ok(JsonValue::Object(answer))
            })
            .await
    }

    /// `updateNotificationInUserStack`: only the flags and the status change.
    pub async fn update(
        &self,
        user_id: &str,
        id: Option<&JsonValue>,
        patch: &JsonValue,
    ) -> Result<JsonValue, String> {
        let Some(id) = named(id).filter(|_| !user_id.is_empty()).map(js::string) else {
            return Ok(missing("missing_user_or_notification_id"));
        };
        let mut allowed = JsonMap::new();
        for flag in FLAGS {
            if let Some(value @ JsonValue::Bool(_)) = patch.get(flag) {
                allowed.insert(flag.into(), value.clone());
            }
        }
        if let Some(status) = patch.get("status") {
            let status = if js::truthy(Some(status)) {
                status.clone()
            } else {
                JsonValue::Null
            };
            allowed.insert("status".into(), status);
        }
        let user = user_id.to_string();
        self.central
            .transaction(move |db| {
                let Some(stack) = user_stack(db, &user)? else {
                    return Ok(missing("user_atome_missing"));
                };
                if allowed.is_empty() {
                    return Ok(missing("notification_patch_empty"));
                }
                let mut updated = None;
                let next: Vec<JsonValue> = stack
                    .into_iter()
                    .map(|mut item| {
                        if item_id(&item).as_deref() == Some(id.as_str())
                            && let JsonValue::Object(fields) = &mut item
                        {
                            fields.extend(allowed.clone());
                            updated = Some(item.clone());
                        }
                        item
                    })
                    .collect();
                let Some(updated) = updated else {
                    return Ok(missing("notification_not_found"));
                };
                write_stack(db, &user, &next)?;
                Ok(json!({ "ok": true, "count": next.len(), "stack": next, "notification": updated }))
            })
            .await
    }

    /// `removeNotificationFromUserStack`: out of this person's own stack only.
    pub async fn remove(&self, user_id: &str, id: Option<&JsonValue>) -> Result<JsonValue, String> {
        let Some(id) = named(id).filter(|_| !user_id.is_empty()).cloned() else {
            return Ok(missing("missing_user_or_notification_id"));
        };
        let user = user_id.to_string();
        self.central
            .transaction(move |db| {
                let Some(stack) = user_stack(db, &user)? else {
                    return Ok(missing("user_atome_missing"));
                };
                let wanted = js::string(&id);
                let before = stack.len();
                let next: Vec<JsonValue> = stack
                    .into_iter()
                    .filter(|item| item_id(item).is_none_or(|item| item != wanted))
                    .collect();
                if next.len() == before {
                    return Ok(missing("notification_not_found"));
                }
                write_stack(db, &user, &next)?;
                Ok(json!({ "ok": true, "count": next.len(), "stack": next, "removed_id": id }))
            })
            .await
    }
}

#[cfg(test)]
mod origin_tests {
    use super::*;

    #[test]
    fn a_notice_keeps_its_origin_fields_only() {
        let notice = json!({ "id": "n", "kind": "social-comment", "origin": {
            "network": "instagram", "account": "178", "kind": "comment", "thread": "m1",
            "remote_id": "c1", "token": "secret",
            "post": { "id": "m1", "url": "https://x", "title": null, "job_id": null,
                "thumbnail_url": "https://i.ytimg.com/vi/m1/hqdefault.jpg", "extra": 1 },
            "author": { "id": "u", "name": "Ann", "handle": "ann", "avatar_url": null, "email": "e" },
            "reply": { "mode": "comment", "until": null, "private_until": "2026-11-23T00:00:00.000Z" } } });
        let stored = normalized(&notice).unwrap().unwrap();
        let origin = &stored["origin"];
        assert_eq!(origin["network"], "instagram");
        assert!(origin.get("token").is_none());
        assert!(origin["post"].get("extra").is_none());
        assert_eq!(
            origin["post"]["thumbnail_url"],
            "https://i.ytimg.com/vi/m1/hqdefault.jpg"
        );
        assert!(origin["author"].get("email").is_none());
        assert_eq!(origin["reply"]["private_until"], "2026-11-23T00:00:00.000Z");
        let plain = normalized(&json!({ "id": "p", "origin": "x" }))
            .unwrap()
            .unwrap();
        assert_eq!(plain["origin"], JsonValue::Null);
    }
}
