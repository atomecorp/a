// The `atome` requests of `/ws/api` but its history (server/ws_api_atome_request.js, ported): the
// device session first (ws_api_connection.js), a mutation's request id taken twice within 3 s
// answered as a duplicate, the requester (identity.rs `requester`) and their account, every
// mutation refused (mutations go through `events` commits), then the reads of the central
// database: one atome (reads.rs), the listing (list.rs), the ownership transfer (transfer.rs),
// one particle or all the readable ones. The `sync` reads of the same database are sync.rs.
mod list;
mod reads;
mod sync;
mod transfer;

pub(super) use sync::{acknowledge, pending};

use super::Connection;
use crate::vault_router::js;
use reads::{bound, particle, particles, readable, readable_properties, stored_atome};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

const DUPLICABLE: [&str; 5] = ["create", "update", "alter", "delete", "soft-delete"];
const REFUSED: [&str; 8] = [
    "create",
    "update",
    "alter",
    "delete",
    "soft-delete",
    "set-particle",
    "delete-particle",
    "realtime",
];

// `{ type: 'atome-response', requestId, … }`, the request id as `requestId || request_id` gives it
// (left out when that is undefined).
fn reply(message: &JsonValue, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("atome-response"));
    let request_id = match message.get("requestId") {
        Some(id) if js::truthy(Some(id)) => Some(id),
        _ => message.get("request_id"),
    };
    if let Some(id) = request_id {
        reply.insert("requestId".into(), id.clone());
    }
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

fn refused(message: &JsonValue, error: &str) -> JsonValue {
    reply(message, json!({ "success": false, "error": error }))
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    if let Err(refused) = connection.session_holds(&message).await {
        return connection.reply(refused).await;
    }
    // `data.action || ''`: compared as a string, written as `String(action)`.
    let action = message
        .get("action")
        .filter(|action| js::truthy(Some(action)));
    let shown = action.map_or_else(String::new, |action| js::text(Some(action)));
    let action = action
        .and_then(JsonValue::as_str)
        .unwrap_or_default()
        .to_string();
    let request_id = js::first(&message, &["requestId"])
        .or_else(|| message.get("request_id").filter(|id| js::truthy(Some(id))));
    if let Some(id) = request_id
        && DUPLICABLE.contains(&action.as_str())
        && connection
            .mutations
            .lock()
            .expect("mutations")
            .duplicate(id, crate::auth::now_ms())
    {
        let duplicate = reply(&message, json!({ "success": true, "duplicate": true }));
        return connection.reply(duplicate).await;
    }
    let Some(requester) = connection.requester(&message).await else {
        return connection
            .reply(refused(&message, "atome_request_auth_required"))
            .await;
    };
    match connection.provisioned(&requester).await {
        Ok(true) => {}
        Ok(false) => {
            return connection
                .reply(refused(&message, "remote_account_not_provisioned"))
                .await;
        }
        // Fastify's handler rejected outside its own catch: nothing answers.
        Err(error) => return eprintln!("[ws/api] atome request failed: {error}"),
    }
    if REFUSED.contains(&action.as_str()) {
        return connection
            .reply(refused(&message, "canonical_event_commit_required"))
            .await;
    }
    let central = connection.router().central().clone();
    let asked = message.clone();
    let answered = central
        .committed(move |db| read(db, (&action, &shown), &asked, &requester))
        .await
        .and_then(|answered| answered);
    connection
        .reply(match answered {
            Ok(fields) => reply(&message, fields),
            Err(error) => refused(&message, &error),
        })
        .await;
}

// The read `action` (and how it is written) of `message` answers `requester` with these fields.
fn read(
    db: &rusqlite::Connection,
    (action, shown): (&str, &str),
    message: &JsonValue,
    requester: &str,
) -> Result<JsonValue, String> {
    let denied = json!({ "success": false, "error": "Access denied" });
    match action {
        "get" => {
            let id = js::first(message, &["atome_id"]).or_else(|| message.get("id"));
            let atome_id = bound(id);
            if js::truthy(id) && !readable(db, &atome_id.clone()?, requester, None)? {
                return Ok(json!({ "success": false, "ok": false, "error": "Access denied" }));
            }
            let atome = stored_atome(db, &atome_id?)?;
            let found = !atome.is_null();
            Ok(json!({ "success": found, "ok": found, "atome": atome }))
        }
        "transfer-owner" => Ok(match transfer::transfer(db, message, requester)? {
            transfer::Transfer::Refused(error) => json!({ "success": false, "error": error }),
            transfer::Transfer::Done(data) => json!({ "success": true, "data": data }),
        }),
        "list" if requester == "anonymous" => {
            Ok(json!({ "success": false, "error": "Unauthorized" }))
        }
        "list" => Ok(json!({ "success": true, "atomes": list::list(db, message, requester)? })),
        "get-particle" => {
            let (atome_id, key) = (bound(message.get("atome_id"))?, message.get("key"));
            let readable_key = match bound(key)? {
                rusqlite::types::Value::Text(key) => {
                    readable(db, &atome_id, requester, Some(&key))?
                }
                rusqlite::types::Value::Null => readable(db, &atome_id, requester, None)?,
                // A number is bound as a double: no property row names it, the atome's own decides.
                _ => readable(db, &atome_id, requester, None)?,
            };
            if !readable_key {
                return Ok(denied);
            }
            let value = particle(db, &atome_id, &bound(key)?)?;
            Ok(json!({ "success": true, "value": value }))
        }
        "get-particles" => {
            let atome_id = bound(message.get("atome_id"))?;
            let properties = particles(db, &atome_id)?;
            let properties = readable_properties(db, &atome_id, properties, requester)?;
            if properties.is_empty() {
                return Ok(denied);
            }
            Ok(json!({ "success": true, "particles": properties }))
        }
        _ => Ok(json!({ "success": false, "error": format!("Unknown atome action: {shown}") })),
    }
}
