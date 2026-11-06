// The `contact` family of `/ws/api` (server/ws_api_message_handlers.js
// `handleWsContactRequest`, ported): requests, answers, blocks, the book's preferences
// and the contacts' list, decided by social/relations.rs, for the account the connection
// is (identity.rs `connection_of`); what a decision sets off is carried out here — the
// peer notified (social/live.rs); the contacts' cards are the directory's (social/directory/).
// A request answers after the guard's floor, its effects inside it.
use super::Connection;
use crate::social::request_guard;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KIND: &str = "contact";

fn envelope(message: &JsonValue, success: bool, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("contact-response"));
    if let Some(request_id) = js::first(message, &["requestId", "request_id"]) {
        reply.insert("requestId".into(), request_id.clone());
    }
    reply.insert("success".into(), json!(success));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

/// What a relation decision sets off, in order: a peer notified, an accepted request's note
/// made the conversation's first message.
pub(super) async fn carry(connection: &Connection, effects: Vec<JsonValue>) -> Result<(), String> {
    for effect in effects {
        match effect["effect"].as_str() {
            Some("notify") => {}
            Some("accepted") => {
                connection.ws_api.social.messages.accepted(&effect).await?;
                continue;
            }
            _ => return Err("relation_effect_unknown".into()),
        }
        let sender = js::text(effect.get("sender"));
        connection
            .ws_api
            .social
            .notifier
            .notify(
                &js::text(effect.get("target")),
                Some(sender.as_str()).filter(|sender| !sender.is_empty()),
                &effect["notification"],
            )
            .await?;
    }
    Ok(())
}

/// `list`'s `people`: each accepted contact by the name and photo their card shares.
pub(super) async fn with_people(
    connection: &Connection,
    mut result: JsonValue,
) -> Result<JsonValue, String> {
    let directory = &connection.ws_api.social.directory;
    let mut people = Vec::new();
    for peer in result["contacts"].as_array().into_iter().flatten() {
        let Some(card) = directory.source_profile(&js::string(peer)).await? else {
            continue;
        };
        if !card.display_name.is_empty() {
            people.push(json!({ "principal_id": peer, "display_name": card.display_name, "user_face": card.user_face }));
        }
    }
    result["people"] = json!(people);
    Ok(result)
}

async fn result(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let relations = &connection.ws_api.social.relations;
    let action = message.get("action");
    let peer = js::first(message, &["userId", "toUserId", "fromUserId", "peerId"]);
    // A request with a number reaches the account of that number: its id may be a book card's.
    let by_phone = action == Some(&json!("request")) && js::truthy(message.get("phone"));
    if let Some(peer) = peer
        && action != Some(&json!("list"))
        && !by_phone
        && !relations.provisioned(&js::string(peer)).await?
    {
        return Err("contact_target_invalid".into());
    }
    let lowered = js::first(message, &["action"])
        .map(js::string)
        .unwrap_or_default()
        .to_lowercase();
    let started = request_guard::now_ms();
    let decided = async {
        let decided = relations.handle(message.clone(), user.to_string()).await?;
        carry(connection, decided.effects).await?;
        match lowered.as_str() {
            "list" => with_people(connection, decided.result).await,
            _ => Ok(decided.result),
        }
    }
    .await;
    if lowered == "request" {
        request_guard::settle(started).await;
    }
    decided
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let front = connection
        .connection_of(json!({ "message": message, "current": false }))
        .await;
    let user = match front {
        Ok(front) if front.get("session_error").is_some() => {
            connection.reply(front["session_error"].clone()).await;
            return;
        }
        Ok(front) => front
            .get("principal")
            .and_then(JsonValue::as_str)
            .filter(|_| front.get("provisioned") == Some(&json!(true)))
            .map(str::to_string),
        Err(error) => {
            connection
                .reply(envelope(&message, false, json!({ "error": error })))
                .await;
            return;
        }
    };
    let Some(user) = user else {
        let refused = envelope(&message, false, json!({ "error": "contact_auth_required" }));
        connection.reply(refused).await;
        return;
    };
    let reply = match result(&connection, &message, &user).await {
        Ok(result) => envelope(&message, result.get("ok") != Some(&json!(false)), result),
        Err(error) => envelope(&message, false, json!({ "error": error })),
    };
    connection.reply(reply).await;
}
