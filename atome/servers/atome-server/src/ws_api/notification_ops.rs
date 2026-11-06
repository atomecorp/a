// The `notification-stack` family of `/ws/api` (server/wsNotificationOperations.js,
// ported): a person reads their own stack, publishes a calendar or system notice to
// themself, marks or removes one of theirs. The connection says who it is
// (identity.rs `connection_of`, its device session checked first); the stack is
// social/notification_stack.rs.
use super::Connection;
use crate::social::contract;
use crate::vault_router::js;
use atome_store::append::iso_now;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KIND: &str = "notification-stack";

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

// `Number.isFinite(Date.parse(text))` for the ISO forms a client writes.
fn parses_as_date(text: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(text).is_ok()
        || chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%.f").is_ok()
        || chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M").is_ok()
        || chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_ok()
}

// `normalizeOwnNotification`: a calendar or system notice, from and to its author.
fn own_notice(input: Option<&JsonValue>, user_id: &str) -> Result<JsonValue, String> {
    let invalid = || "notification_payload_invalid".to_string();
    let input = input
        .filter(|input| js::truthy(Some(input)))
        .ok_or_else(invalid)?;
    let kind = input
        .get("kind")
        .and_then(JsonValue::as_str)
        .filter(|kind| ["calendar", "system"].contains(kind));
    let id = input
        .get("id")
        .and_then(JsonValue::as_str)
        .filter(|id| !id.is_empty() && utf16_len(id) <= 200);
    let message = input
        .get("message")
        .and_then(JsonValue::as_str)
        .filter(|message| utf16_len(message) <= 8000);
    let subject = match input.get("subject") {
        None | Some(JsonValue::Null) => Some(None),
        Some(JsonValue::String(subject)) if utf16_len(subject) <= 200 => Some(Some(subject)),
        Some(_) => None,
    };
    let (Some(kind), Some(id), Some(message), Some(subject)) = (kind, id, message, subject) else {
        return Err(invalid());
    };
    let timestamp = match input.get("timestamp").and_then(JsonValue::as_str) {
        Some(timestamp) if parses_as_date(timestamp) => timestamp.to_string(),
        _ => iso_now(),
    };
    Ok(json!({
        "id": id, "kind": kind, "message": message,
        "subject": subject.filter(|subject| !subject.is_empty()).map_or("", String::as_str),
        "timestamp": timestamp, "from_id": user_id, "to_user_id": user_id,
        "priority": "normal", "severity": "info",
        "action": contract::action(input.get("action"))?,
    }))
}

async fn result(
    connection: &Connection,
    message: &JsonValue,
    user_id: &str,
) -> Result<JsonValue, String> {
    let stack = &connection.ws_api.social.stack;
    match message.get("action").and_then(JsonValue::as_str) {
        Some("read") => stack.read(user_id).await,
        Some("publish") => {
            stack
                .publish_own(user_id, own_notice(message.get("notification"), user_id)?)
                .await
        }
        Some(action @ ("update" | "remove")) => {
            let id = js::first(message, &["notificationId", "notification_id", "id"]);
            if action == "remove" {
                return stack.remove(user_id, id).await;
            }
            let patch = message
                .get("patch")
                .filter(|patch| patch.is_object() || patch.is_array());
            stack.update(user_id, id, patch.unwrap_or(&json!({}))).await
        }
        _ => Err("notification_stack_action_unsupported".into()),
    }
}

// `{ type, requestId, success, ...result }`.
fn envelope(message: &JsonValue, success: bool, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("notification-stack-response"));
    if let Some(request_id) = js::first(message, &["requestId", "request_id"]) {
        reply.insert("requestId".into(), request_id.clone());
    }
    reply.insert("success".into(), json!(success));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let front = connection
        .connection_of(json!({ "message": message, "current": true }))
        .await;
    let outcome = match front {
        Ok(front) if front.get("session_error").is_some() => {
            connection.reply(front["session_error"].clone()).await;
            return;
        }
        Ok(front) => match front.get("principal").and_then(JsonValue::as_str) {
            Some(user) if front.get("provisioned") == Some(&json!(true)) => {
                result(&connection, &message, user).await
            }
            _ => Err("communication_auth_unavailable".into()),
        },
        Err(error) => Err(error),
    };
    let reply = match outcome {
        Ok(result) => {
            let success = result.get("ok") == Some(&json!(true));
            envelope(&message, success, result)
        }
        Err(error) => envelope(&message, false, json!({ "ok": false, "error": error })),
    };
    connection.reply(reply).await;
}
