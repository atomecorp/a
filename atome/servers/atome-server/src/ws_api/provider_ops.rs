// The `ai-provider` family of `/ws/api`, answered by providers/: the connection checks the device
// session and says which account the message's token names (identity.rs `connection_of`, signed),
// the same question every later check asks again; a voice session's watcher reads the account the connection
// is attached to (`current`) for as long as the connection lives.
use super::Connection;
use crate::providers::{self, Link, Relay};
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, Weak};

pub(super) const KIND: &str = "ai-provider";

struct Call<'a> {
    connection: &'a Arc<Connection>,
    message: &'a JsonValue,
}

// The account the front reads: `Err` when the token cannot be read; the session's own refusal
// is answered as it is.
async fn signed(
    connection: &Connection,
    message: &JsonValue,
) -> Result<Result<Option<String>, ()>, JsonValue> {
    let front = connection
        .connection_of(json!({ "message": message, "signed": true }))
        .await
        .map_err(|_| JsonValue::Null)?;
    if let Some(session_error) = front.get("session_error") {
        return Err(session_error.clone());
    }
    if front.get("unreadable") == Some(&json!(true)) {
        return Ok(Err(()));
    }
    Ok(Ok(front
        .get("principal")
        .and_then(JsonValue::as_str)
        .filter(|_| front.get("provisioned") == Some(&json!(true)))
        .map(str::to_string)))
}

impl Link for Call<'_> {
    async fn check(&self, principal: &str) -> providers::Done<()> {
        match signed(self.connection, self.message).await {
            Ok(Ok(Some(current))) if current == principal => Ok(()),
            _ => Err("provider_principal_changed".into()),
        }
    }

    async fn send(&self, frame: JsonValue) {
        self.connection.reply(frame).await;
    }

    async fn atome(&self, frame: JsonValue) -> JsonValue {
        let mut frame = frame;
        frame["token"] = self
            .message
            .get("token")
            .cloned()
            .unwrap_or(JsonValue::Null);
        frame["requestId"] = json!(uuid::Uuid::new_v4().to_string());
        super::atome_ops::reply(self.connection, &frame).await
    }

    fn files(&self) -> providers::Files {
        self.connection.ws_api.files()
    }

    fn relay(&self) -> Relay {
        let watched: Weak<Connection> = Arc::downgrade(self.connection);
        let sender = watched.clone();
        Relay {
            principal: Box::new(move || {
                let watched = watched.clone();
                Box::pin(async move {
                    let connection = watched.upgrade()?;
                    let front = connection
                        .connection_of(json!({ "message": {}, "current": true }))
                        .await
                        .ok()?;
                    front
                        .get("principal")
                        .and_then(JsonValue::as_str)
                        .map(str::to_string)
                })
            }),
            send: Box::new(move |frame| {
                let sender = sender.clone();
                Box::pin(async move {
                    if let Some(connection) = sender.upgrade() {
                        connection.reply(frame).await;
                    }
                })
            }),
        }
    }
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let principal = match signed(&connection, &message).await {
        Ok(principal) => principal,
        Err(JsonValue::Null) => Err(()),
        Err(session_error) => {
            connection.reply(session_error).await;
            return;
        }
    };
    let call = Call {
        connection: &connection,
        message: &message,
    };
    let reply = providers::answer(
        &connection.ws_api.providers,
        &connection.providers,
        &call,
        &message,
        principal,
    )
    .await;
    connection.reply(reply).await;
}
