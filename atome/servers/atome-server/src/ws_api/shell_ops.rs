// The `shell` family of `/ws/api` (server/ws_api_message_handlers.js `handleWsShellRequest`,
// ported): the connection checks the device session and says which account is attached to it,
// with its expiry (identity.rs `connection_of`, `expiry`); the command itself runs under
// dev/shell.rs's policy, for the account as the central database names it.
use super::Connection;
use crate::dev::shell::{self, Caller};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KIND: &str = "shell";

fn envelope(message: &JsonValue, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("shell-response"));
    if let Some(request_id) = js::first(message, &["requestId", "request_id"]) {
        reply.insert("requestId".into(), request_id.clone());
    }
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

async fn result(
    connection: &Connection,
    message: &JsonValue,
    user: String,
) -> Result<JsonValue, String> {
    let id = user.clone();
    let account = connection
        .ws_api
        .sessions
        .central()
        .transaction(move |db| crate::auth::accounts::find_by_id(db, &id))
        .await?;
    let caller = match account {
        Some(account) => Caller {
            id: js::string(&account["user_id"]),
            username: account.get("username").cloned(),
        },
        None => Caller {
            id: user,
            username: None,
        },
    };
    let project_root = std::env::current_dir().map_err(|e| e.to_string())?;
    shell::execute(&project_root, message, &caller).await
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let front = connection
        .connection_of(json!({ "message": message, "current": false, "expiry": true }))
        .await;
    let front = match front {
        Ok(front) if front.get("session_error").is_some() => {
            connection.reply(front["session_error"].clone()).await;
            return;
        }
        Ok(front) => front,
        Err(error) => {
            let failed = envelope(&message, json!({ "success": false, "error": error }));
            connection.reply(failed).await;
            return;
        }
    };
    let attached = front["principal"].as_str().filter(|user| !user.is_empty());
    let expires = front["exp_ms"]
        .as_f64()
        .filter(|ms| *ms != 0.0 && !ms.is_nan());
    let expired = expires.is_some_and(|ms| chrono::Utc::now().timestamp_millis() as f64 >= ms);
    let Some(user) = attached.filter(|_| !expired) else {
        let error = if attached.is_some() {
            "ws/api authentication expired (re-auth required)"
        } else {
            "Unauthenticated ws/api connection"
        };
        let refused = envelope(&message, json!({ "success": false, "error": error }));
        connection.reply(refused).await;
        return;
    };
    let reply = match result(&connection, &message, user.to_string()).await {
        Ok(result) => envelope(&message, result),
        Err(error) => envelope(&message, json!({ "success": false, "error": error })),
    };
    connection.reply(reply).await;
}
