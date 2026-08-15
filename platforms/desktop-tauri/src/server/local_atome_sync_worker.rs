use super::local_atome::{
    list_sync_queue_for_actor, mark_sync_queue_done, mark_sync_queue_error, mark_sync_queue_syncing,
    LocalAtomeState, RemoteSyncCredential,
};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value as JsonValue};
use tokio::time::{sleep, timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message as TungsteniteMessage};
use uuid::Uuid;

const TARGET_SERVER: &str = "fastify";

fn compute_backoff_ms(attempts: i64) -> i64 {
    let base_ms = std::env::var("SQUIRREL_SYNC_BACKOFF_MS")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(1000);
    let max_ms = std::env::var("SQUIRREL_SYNC_BACKOFF_MAX_MS")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(60000);
    if attempts <= 1 {
        return base_ms;
    }
    base_ms
        .saturating_mul(2_i64.pow((attempts - 1) as u32))
        .min(max_ms)
}

fn actor_id(event: &JsonValue) -> Option<&str> {
    event
        .pointer("/actor/id")
        .or_else(|| event.get("actor_id"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn credential_for_event(state: &LocalAtomeState, event: &JsonValue) -> Option<RemoteSyncCredential> {
    let local_user_id = actor_id(event)?;
    state
        .remote_sync_credentials
        .lock()
        .ok()?
        .get(local_user_id)
        .cloned()
}

fn remove_local_identity_aliases(map: &mut serde_json::Map<String, JsonValue>) {
    for key in [
        "owner", "ownerId", "owner_id", "creator", "creatorId", "creator_id",
        "_pending_owner_id",
    ] {
        map.remove(key);
    }
}

pub(crate) fn normalize_outbound_event(
    mut event: JsonValue,
    remote_user_id: &str,
) -> Result<JsonValue, String> {
    let object = event
        .as_object_mut()
        .ok_or_else(|| "invalid_sync_event".to_string())?;
    object.insert(
        "actor".to_string(),
        json!({ "type": "user", "id": remote_user_id }),
    );
    remove_local_identity_aliases(object);

    if let Some(payload) = object.get_mut("payload").and_then(JsonValue::as_object_mut) {
        remove_local_identity_aliases(payload);
        if let Some(props) = payload.get_mut("props").and_then(JsonValue::as_object_mut) {
            remove_local_identity_aliases(props);
        }
    }
    Ok(event)
}

fn retry_at(attempts: i64, final_fail: bool) -> Option<String> {
    if final_fail {
        return None;
    }
    Some(
        Utc::now()
            .checked_add_signed(chrono::Duration::milliseconds(compute_backoff_ms(attempts)))
            .unwrap_or_else(Utc::now)
            .to_rfc3339(),
    )
}

fn record_error(
    state: &LocalAtomeState,
    queue_id: i64,
    attempts: i64,
    max_attempts: i64,
    message: &str,
) {
    let final_fail = attempts >= max_attempts;
    if let Ok(db) = state.db.lock() {
        let _ = mark_sync_queue_error(
            &db,
            queue_id,
            attempts,
            if message.is_empty() { "Sync failed" } else { message },
            retry_at(attempts, final_fail),
            final_fail,
        );
    }
}

async fn send_event(
    remote_url: &str,
    credential: &RemoteSyncCredential,
    event: JsonValue,
) -> Result<(), String> {
    let response = request_remote(
        remote_url,
        credential,
        json!({
            "type": "events",
            "action": "commit",
            "sync_source": "axum",
            "event": event
        }),
    ).await?;
    if response.get("success").and_then(JsonValue::as_bool) == Some(true) {
        Ok(())
    } else {
        Err(response.get("error").and_then(JsonValue::as_str).unwrap_or("WebSocket sync failed").to_string())
    }
}

async fn request_remote(
    remote_url: &str,
    credential: &RemoteSyncCredential,
    mut request: JsonValue,
) -> Result<JsonValue, String> {
    let request_id = Uuid::new_v4().to_string();
    let ws_url = format!(
        "{}/ws/api",
        remote_url
            .trim_end_matches('/')
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1)
    );
    let object = request.as_object_mut().ok_or_else(|| "invalid_remote_request".to_string())?;
    object.insert("requestId".to_string(), JsonValue::String(request_id.clone()));
    object.insert("token".to_string(), JsonValue::String(credential.token.clone()));

    timeout(Duration::from_secs(10), async {
        let (mut socket, _) = connect_async(&ws_url)
            .await
            .map_err(|error| error.to_string())?;
        socket
            .send(TungsteniteMessage::Text(request.to_string()))
            .await
            .map_err(|error| error.to_string())?;
        while let Some(message) = socket.next().await {
            let message = message.map_err(|error| error.to_string())?;
            let TungsteniteMessage::Text(text) = message else {
                continue;
            };
            let response: JsonValue =
                serde_json::from_str(&text).map_err(|error| error.to_string())?;
            if response.get("requestId").and_then(JsonValue::as_str) == Some(request_id.as_str()) {
                return Ok(response);
            }
        }
        Err("WebSocket connection closed".to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn pull_remote_projection(
    state: &LocalAtomeState,
    remote_url: &str,
    local_user_id: &str,
    credential: &RemoteSyncCredential,
) -> Result<(), String> {
    const PAGE_SIZE: usize = 500;
    let mut states = Vec::new();
    let mut offset = 0usize;
    loop {
        let response = request_remote(remote_url, credential, json!({
            "type": "state-current",
            "action": "list",
            "include_shared": true,
            "limit": PAGE_SIZE,
            "offset": offset
        })).await?;
        if response.get("success").and_then(JsonValue::as_bool) != Some(true) {
            return Err(response.get("error").and_then(JsonValue::as_str).unwrap_or("Remote state pull failed").to_string());
        }
        let page = response.get("states")
            .or_else(|| response.pointer("/data/states"))
            .and_then(JsonValue::as_array).cloned().unwrap_or_default();
        let page_len = page.len();
        states.extend(page);
        if page_len < PAGE_SIZE { break; }
        offset += page_len;
    }

    let cursor = state.db.lock().ok().and_then(|db| {
        super::local_atome_remote_projection::cursor_for(&db, local_user_id)
    });
    let mut events = Vec::new();
    let mut event_offset = 0usize;
    loop {
        let response = request_remote(remote_url, credential, json!({
            "type": "sync",
            "action": "pull",
            "since": cursor.clone(),
            "limit": PAGE_SIZE,
            "offset": event_offset
        })).await?;
        if response.get("success").and_then(JsonValue::as_bool) != Some(true) {
            return Err(response.get("error").and_then(JsonValue::as_str).unwrap_or("Remote event pull failed").to_string());
        }
        let page = response.get("changes")
            .or_else(|| response.pointer("/data/changes"))
            .and_then(JsonValue::as_array).cloned().unwrap_or_default();
        let page_len = page.len();
        events.extend(page);
        if page_len < PAGE_SIZE { break; }
        event_offset += page_len;
    }

    let mut db = state.db.lock().map_err(|_| "local_projection_database_unavailable".to_string())?;
    super::local_atome_remote_projection::reconcile_remote_states(
        &mut db, local_user_id, &credential.remote_user_id, &states
    )?;
    super::local_atome_remote_projection::persist_remote_events(
        &mut db, local_user_id, &credential.remote_user_id, &events
    )
}

pub async fn run(state: LocalAtomeState, remote_url: String) {
    if remote_url.trim().is_empty() {
        return;
    }

    loop {
        let credentials = state
            .remote_sync_credentials
            .lock()
            .map(|credentials| credentials.iter().map(|(id, credential)| (id.clone(), credential.clone())).collect::<Vec<_>>())
            .unwrap_or_default();
        if credentials.is_empty() {
            sleep(Duration::from_millis(500)).await;
            continue;
        }
        for (local_user_id, credential) in &credentials {
            let _ = pull_remote_projection(&state, &remote_url, local_user_id, credential).await;
        }
        let actor_ids = credentials.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>();
        let mut items = match state.db.lock() {
            Ok(db) => actor_ids
                .iter()
                .flat_map(|actor_id| {
                    list_sync_queue_for_actor(&db, TARGET_SERVER, actor_id, 50)
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        items.sort_by_key(|item| item.queue_id);
        for item in items {
            let payload: JsonValue = match serde_json::from_str::<JsonValue>(&item.payload) {
                Ok(value) if value.is_object() => value,
                _ => {
                    record_error(
                        &state,
                        item.queue_id,
                        item.attempts + 1,
                        item.max_attempts,
                        "Invalid payload",
                    );
                    continue;
                }
            };
            let Some(credential) = credential_for_event(&state, &payload) else {
                continue;
            };
            let attempts = item.attempts + 1;
            if let Ok(db) = state.db.lock() {
                let _ = mark_sync_queue_syncing(&db, item.queue_id, attempts);
            }
            let event = match normalize_outbound_event(payload, &credential.remote_user_id) {
                Ok(value) => value,
                Err(error) => {
                    record_error(&state, item.queue_id, attempts, item.max_attempts, &error);
                    continue;
                }
            };
            match send_event(&remote_url, &credential, event).await {
                Ok(()) => {
                    if let Ok(db) = state.db.lock() {
                        let _ = mark_sync_queue_done(&db, item.queue_id);
                    }
                }
                Err(error) => {
                    record_error(&state, item.queue_id, attempts, item.max_attempts, &error);
                }
            }
        }

        let poll_ms = std::env::var("SQUIRREL_SYNC_POLL_MS")
            .ok().and_then(|value| value.parse::<u64>().ok()).unwrap_or(5000);
        sleep(Duration::from_millis(poll_ms)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_outbound_event;
    use crate::server::local_atome::list_sync_queue_for_actor;
    use rusqlite::Connection;
    use serde_json::json;

    #[test]
    fn outbound_event_replaces_local_actor_and_removes_local_identity_aliases() {
        let normalized = normalize_outbound_event(
            json!({
                "id": "event-1",
                "atome_id": "shape-1",
                "kind": "set",
                "actor": { "type": "user", "id": "local-user" },
                "payload": {
                    "props": {
                        "owner_id": "local-user",
                        "creator_id": "local-user",
                        "left": 12
                    }
                }
            }),
            "remote-user",
        )
        .expect("event must normalize");

        assert_eq!(normalized.pointer("/actor/id"), Some(&json!("remote-user")));
        assert_eq!(normalized.pointer("/payload/props/left"), Some(&json!(12)));
        assert!(normalized.pointer("/payload/props/owner_id").is_none());
        assert!(normalized.pointer("/payload/props/creator_id").is_none());
    }

    #[test]
    fn actor_queue_is_not_starved_by_other_principals() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(
            "CREATE TABLE sync_queue (
                queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload TEXT NOT NULL,
                target_server TEXT NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                next_retry_at TEXT,
                created_at TEXT NOT NULL
            );"
        ).expect("queue schema");
        for index in 0..75 {
            db.execute(
                "INSERT INTO sync_queue (payload, target_server, status, attempts, max_attempts, created_at)
                 VALUES (?1, 'fastify', 'pending', 0, 5, ?2)",
                rusqlite::params![json!({"id":format!("other-{index}"),"actor":{"id":"other"}}).to_string(), format!("2026-08-14T00:00:{index:02}Z")],
            ).expect("other queue item");
        }
        db.execute(
            "INSERT INTO sync_queue (payload, target_server, status, attempts, max_attempts, created_at)
             VALUES (?1, 'fastify', 'pending', 0, 5, '2026-08-14T01:00:00Z')",
            [json!({"id":"active","actor":{"id":"active-user"}}).to_string()],
        ).expect("active queue item");

        let items = list_sync_queue_for_actor(&db, "fastify", "active-user", 50).expect("actor queue");
        assert_eq!(items.len(), 1);
        let event: serde_json::Value = serde_json::from_str(&items[0].payload).unwrap();
        assert_eq!(event.get("id"), Some(&json!("active")));
    }
}
