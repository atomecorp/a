// The `direct-message`, `conversation` and `visio` families of `/ws/api` (server/
// wsCommunicationOperations.js `handleWsCommunication`, ported): decided by
// social/direct_messages.rs, for the account the connection is (ws_api/identity.rs); a sent
// message goes to the recipient's live connections or their queue (social/live.rs); the push to
// the recipient's devices leaves after the answer. A call's frame (`visio`) is the SFU's
// (visio/), for this connection.
use super::Connection;
use crate::social::live;
use crate::social::push::Audience;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KINDS: [&str; 3] = ["direct-message", "conversation", "visio"];

fn envelope(message: &JsonValue, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert(
        "type".into(),
        json!(format!("{}-response", js::text(message.get("type")))),
    );
    if let Some(request_id) = js::first(message, &["requestId", "request_id"]) {
        reply.insert("requestId".into(), request_id.clone());
    }
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

// The answer's fields, and the notice to push to `target` once it has left.
async fn result(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<(JsonValue, Option<(String, JsonValue)>), String> {
    let social = &connection.ws_api.social;
    if message.get("type") == Some(&json!("visio")) {
        return Ok((call(connection, user, message).await?, None));
    }
    if message.get("type") == Some(&json!("conversation")) {
        return Ok((social.messages.conversation(user, message).await?, None));
    }
    let sent = social.messages.send(&social.stack, user, message).await?;
    let Some(frame) = sent.deliver else {
        return Ok((sent.result, None));
    };
    let (delivery, queue_size) = live::deliver(&sent.target, &frame).await;
    let delivered = delivery.delivered;
    let mut result = json!({ "delivered": delivered, "recipientConnections": delivery.recipient_connections,
        "queued": !delivered, "queueSize": queue_size });
    if let (Some(result), JsonValue::Object(fields)) = (result.as_object_mut(), sent.result) {
        result.extend(fields);
    }
    Ok((result, sent.push.map(|notice| (sent.target, notice))))
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
    let (fields, push) = match outcome {
        Ok((JsonValue::Object(result), push)) => {
            let mut fields = JsonMap::new();
            fields.insert("success".into(), json!(true));
            fields.extend(result);
            (JsonValue::Object(fields), push)
        }
        Ok((_, push)) => (json!({ "success": true }), push),
        Err(error) => {
            let error = if error.is_empty() {
                "communication_failed".to_string()
            } else {
                error
            };
            (json!({ "success": false, "error": error }), None)
        }
    };
    connection.reply(envelope(&message, fields)).await;
    if let Some((target, notice)) = push {
        // Its outcome reaches nobody: the message is delivered and answered.
        let _ = connection
            .ws_api
            .social
            .push
            .deliver(&target, &notice, &Audience::default())
            .await;
    }
}

/// A call's frame, the SFU's, for this connection and the device key its session holds.
#[cfg(feature = "visio")]
async fn call(
    connection: &Connection,
    user: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let device_key = connection
        .identity
        .held()
        .claims
        .as_ref()
        .and_then(|claims| claims.pointer("/cnf/kid"))
        .and_then(JsonValue::as_str)
        .map(String::from);
    let caller = crate::visio::Caller {
        user: user.to_string(),
        live: connection.live,
        sender: connection.sender(),
        device_key,
    };
    crate::visio::answer(caller, message.get("action"), message.get("input")).await
}

/// A server built without the SFU (the `visio` feature) refuses every call.
#[cfg(not(feature = "visio"))]
async fn call(
    _connection: &Connection,
    _user: &str,
    _message: &JsonValue,
) -> Result<JsonValue, String> {
    Err("visio_unavailable".into())
}
