use super::local_atome::{
    event_with_actor, list_sync_queue_for_actor, mark_sync_queue_done, mark_sync_queue_error,
    mark_sync_queue_syncing, EventRecord, LocalAtomeState, RemoteSyncCredential,
};
pub(crate) use super::local_atome_sync_bootstrap::enqueue_current_user_state_sync;
use super::local_atome_sync_media::upload_outbound_media;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use rusqlite::Connection;
use serde_json::{json, Value as JsonValue};
use std::{collections::HashSet, sync::OnceLock};
use tokio::sync::Notify;
use tokio::time::{sleep, timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message as TungsteniteMessage};
use uuid::Uuid;

const TARGET_SERVER: &str = "fastify";
const SYNC_DELIVERY_PATH: &str = "/ws/sync";
static SYNC_QUEUE_NOTIFY: OnceLock<Notify> = OnceLock::new();

fn sync_queue_notify() -> &'static Notify {
    SYNC_QUEUE_NOTIFY.get_or_init(Notify::new)
}

pub(super) fn resolve_sync_target(message: &JsonValue) -> Option<String> {
    message
        .get("sync_target")
        .or_else(|| message.get("syncTarget"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase)
        .or_else(|| Some(TARGET_SERVER.to_string()))
}

pub(super) fn resolve_sync_source(message: &JsonValue) -> Option<String> {
    message
        .get("sync_source")
        .or_else(|| message.get("syncSource"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase)
}

pub(super) fn should_enqueue_sync(sync_target: &Option<String>, sync_source: &Option<String>) -> bool {
    match (sync_target, sync_source) {
        (Some(target), Some(source)) => target != source,
        (Some(_), None) => true,
        _ => false,
    }
}

pub(super) fn is_syncable_event(event: &EventRecord) -> bool {
    let atome_id = event.atome_id.as_deref().unwrap_or("").to_ascii_lowercase();
    !atome_id.starts_with("tool.ui.") && !atome_id.starts_with("tool_ui.")
}

fn prune_local_only_queue(db: &Connection) -> Result<usize, String> {
    db.execute(
        "DELETE FROM sync_queue
         WHERE lower(COALESCE(atome_id, '')) LIKE 'tool.ui.%'
            OR lower(COALESCE(atome_id, '')) LIKE 'tool_ui.%'",
        [],
    )
    .map_err(|error| error.to_string())
}

fn recover_interrupted_queue(db: &Connection) -> Result<usize, String> {
    db.execute(
        "UPDATE sync_queue
         SET status = 'pending', next_retry_at = NULL
         WHERE target_server = ?1 AND status = 'syncing'",
        [TARGET_SERVER],
    )
    .map_err(|error| error.to_string())
}

pub(super) fn enqueue_sync_event(
    db: &Connection,
    event: &EventRecord,
    target_server: &str,
) -> Result<(), String> {
    let payload_json =
        serde_json::to_string(&event_with_actor(event.clone())).map_err(|error| error.to_string())?;
    db.execute(
        "INSERT INTO sync_queue (atome_id, operation, payload, target_server, status, attempts, max_attempts, created_at)
         VALUES (?1, 'events:commit', ?2, ?3, 'pending', 0, 5, datetime('now'))",
        rusqlite::params![event.atome_id, payload_json, target_server],
    )
    .map_err(|error| error.to_string())?;
    sync_queue_notify().notify_one();
    Ok(())
}

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
        .saturating_mul(2_i64.saturating_pow((attempts - 1).clamp(0, 30) as u32))
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
    local_user_id: &str,
    remote_user_id: &str,
) -> Result<JsonValue, String> {
    let object = event
        .as_object_mut()
        .ok_or_else(|| "invalid_sync_event".to_string())?;
    object.insert(
        "actor".to_string(),
        json!({ "type": "user", "id": remote_user_id }),
    );
    if let Some(parent_id) = object
        .get("payload")
        .and_then(|payload| payload.get("parent_id"))
        .and_then(JsonValue::as_str)
        .map(str::to_string)
    {
        object.insert("parent_id".to_string(), JsonValue::String(parent_id));
    }
    if object.get("atome_id").and_then(JsonValue::as_str) == Some(local_user_id) {
        object.insert("atome_id".to_string(), JsonValue::String(remote_user_id.to_string()));
    }
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
    message: &str,
    terminal: bool,
) {
    let final_fail = terminal;
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
    state: &LocalAtomeState,
    remote_url: &str,
    local_user_id: &str,
    credential: &RemoteSyncCredential,
    event: JsonValue,
) -> Result<(), String> {
    let response = request_remote(
        remote_url,
        credential,
        json!({
            "type":"sync",
            "action":"push",
            "source":format!("tauri:{}", local_user_id),
            "events":[event]
        }),
    ).await?;
    if response.get("success").and_then(JsonValue::as_bool) == Some(true) {
        if let Some(changes) = response.get("changes").and_then(JsonValue::as_array) {
            let db = state.db.lock().map_err(|_| "local_projection_database_unavailable".to_string())?;
            for change in changes {
                if let Some(stream) = change.get("stream_id").or_else(|| change.get("stream"))
                    .and_then(JsonValue::as_str) {
                    super::local_atome_remote_projection::register_stream(
                        &db, local_user_id, &credential.remote_user_id, stream,
                    )?;
                }
            }
        }
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

pub async fn run(state: LocalAtomeState, remote_url: String) {
    if remote_url.trim().is_empty() {
        return;
    }

    if let Ok(db) = state.db.lock() {
        let _ = recover_interrupted_queue(&db);
        let _ = prune_local_only_queue(&db);
    }

    let mut inbound_started = HashSet::<String>::new();
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
        for (local_user_id, _) in &credentials {
            if inbound_started.insert(local_user_id.clone()) {
                tokio::spawn(super::local_atome_ws_sync::run(
                    state.clone(), remote_url.clone(), SYNC_DELIVERY_PATH.to_string(), local_user_id.clone(),
                ));
            }
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
                        "Invalid payload",
                        true,
                    );
                    continue;
                }
            };
            let Some(credential) = credential_for_event(&state, &payload) else {
                continue;
            };
            let Some(local_user_id) = actor_id(&payload).map(str::to_string) else {
                continue;
            };
            let attempts = item.attempts + 1;
            if let Ok(db) = state.db.lock() {
                let _ = mark_sync_queue_syncing(&db, item.queue_id, attempts);
            }
            let mut event = match normalize_outbound_event(payload, &local_user_id, &credential.remote_user_id) {
                Ok(value) => value,
                Err(error) => {
                    record_error(&state, item.queue_id, attempts, &error, true);
                    continue;
                }
            };
            let endpoint = if credential.remote_url.is_empty() {
                remote_url.as_str()
            } else {
                credential.remote_url.as_str()
            };
            if let Err(error) = upload_outbound_media(
                &state,
                endpoint,
                &local_user_id,
                &credential,
                &mut event,
            )
            .await
            {
                record_error(&state, item.queue_id, attempts, &error, false);
                continue;
            }
            match send_event(&state, endpoint, &local_user_id, &credential, event).await {
                Ok(()) => {
                    if let Ok(db) = state.db.lock() {
                        let _ = mark_sync_queue_done(&db, item.queue_id);
                    }
                }
                Err(error) => {
                    record_error(&state, item.queue_id, attempts, &error, false);
                }
            }
        }

        let queue_idle_interval_ms = std::env::var("SQUIRREL_SYNC_QUEUE_INTERVAL_MS")
            .ok().and_then(|value| value.parse::<u64>().ok()).unwrap_or(5000);
        tokio::select! {
            _ = sync_queue_notify().notified() => {}
            _ = sleep(Duration::from_millis(queue_idle_interval_ms)) => {}
        }
    }
}

#[cfg(test)]
#[path = "local_atome_sync_worker_tests.rs"]
mod tests;
