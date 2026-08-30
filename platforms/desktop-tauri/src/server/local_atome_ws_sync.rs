use super::broadcast_sync_event;
use super::local_atome::LocalAtomeState;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value as JsonValue};
use std::collections::HashMap;
use tokio::time::{interval, sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message as TungsteniteMessage};

fn sync_url(remote_url: &str, delivery_path: &str) -> String {
    format!(
        "{}{}",
        remote_url.trim_end_matches('/')
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1),
        delivery_path
    )
}

fn credential_for(
    state: &LocalAtomeState,
    local_user_id: &str,
) -> Option<super::local_atome::RemoteSyncCredential> {
    state.remote_sync_credentials.lock().ok()?.get(local_user_id).cloned()
}

async fn send_json<S>(sink: &mut S, payload: JsonValue) -> Result<(), String>
where
    S: futures_util::Sink<TungsteniteMessage> + Unpin,
    S::Error: std::fmt::Display,
{
    sink.send(TungsteniteMessage::Text(payload.to_string()))
        .await.map_err(|error| error.to_string())
}

fn available_streams(state: &LocalAtomeState, local_user_id: &str) -> Vec<(String, i64)> {
    state.db.lock().ok().and_then(|db| {
        super::local_atome_remote_projection::stream_cursors(&db, local_user_id).ok()
    }).unwrap_or_default()
}

fn persist_before_delivery(
    state: &LocalAtomeState,
    local_user_id: &str,
    remote_user_id: &str,
    event: &JsonValue,
) -> Result<bool, String> {
    let mut db = state.db.lock().map_err(|_| "local_projection_database_unavailable".to_string())?;
    super::local_atome_remote_projection::persist_ws_event(
        &mut db, local_user_id, remote_user_id, event,
    )
}

async fn connected_session(
    state: &LocalAtomeState,
    remote_url: &str,
    delivery_path: &str,
    local_user_id: &str,
) -> Result<(), String> {
    let credential = credential_for(state, local_user_id)
        .ok_or_else(|| "remote_sync_credential_unavailable".to_string())?;
    let endpoint = if credential.remote_url.is_empty() { remote_url } else { credential.remote_url.as_str() };
    let (socket, _) = connect_async(sync_url(endpoint, delivery_path)).await.map_err(|error| error.to_string())?;
    let (mut sink, mut source) = socket.split();
    send_json(&mut sink, json!({ "type":"auth", "token":credential.token })).await?;

    let mut subscriptions = HashMap::<String, i64>::new();
    let mut registered = false;

    let mut maintenance = interval(Duration::from_secs(10));
    loop {
        tokio::select! {
            _ = maintenance.tick() => {
                let current = credential_for(state, local_user_id);
                if current.as_ref().map(|entry| (
                    entry.token.as_str(), entry.remote_url.as_str(), entry.environment_fingerprint.as_str()
                )) != Some((
                    credential.token.as_str(), credential.remote_url.as_str(), credential.environment_fingerprint.as_str()
                )) {
                    return Err("remote_sync_credential_changed".to_string());
                }
                if registered {
                    for (stream, cursor) in available_streams(state, local_user_id) {
                        if subscriptions.contains_key(&stream) { continue; }
                        send_json(&mut sink, json!({
                            "type":"subscribe", "stream":stream, "cursor":cursor
                        })).await?;
                        subscriptions.insert(stream, cursor);
                    }
                    send_json(&mut sink, json!({ "type":"ping" })).await?;
                }
            }
            incoming = source.next() => {
                let message = incoming.ok_or_else(|| "sync_socket_closed".to_string())?
                    .map_err(|error| error.to_string())?;
                let TungsteniteMessage::Text(text) = message else { continue; };
                let payload: JsonValue = serde_json::from_str(&text).map_err(|error| error.to_string())?;
                match payload.get("type").and_then(JsonValue::as_str).unwrap_or("") {
                    "welcome" => {
                        send_json(&mut sink, json!({
                            "type":"register",
                            "source":format!("tauri:{}", local_user_id),
                            "capabilities":["sqlite-projection", "offline-lww"]
                        })).await?;
                    }
                    "registered" => {
                        registered = true;
                        let local_cursors: HashMap<String, i64> = available_streams(state, local_user_id)
                            .into_iter().collect();
                        let mut announced = vec!["directory.public".to_string()];
                        announced.extend(payload.get("streams").and_then(JsonValue::as_array)
                            .into_iter().flatten().filter_map(JsonValue::as_str).map(str::to_string));
                        announced.extend(local_cursors.keys().cloned());
                        announced.sort();
                        announced.dedup();
                        for stream in announced {
                            if subscriptions.contains_key(&stream) { continue; }
                            let cursor = *local_cursors.get(&stream).unwrap_or(&0);
                            send_json(&mut sink, json!({
                                "type":"subscribe", "stream":stream, "cursor":cursor
                            })).await?;
                            subscriptions.insert(stream, cursor);
                        }
                    }
                    "stream-available" => {
                        let Some(stream) = payload.get("stream").and_then(JsonValue::as_str) else { continue; };
                        if subscriptions.contains_key(stream) { continue; }
                        let cursor = available_streams(state, local_user_id).into_iter()
                            .find(|(candidate, _)| candidate == stream).map(|(_, value)| value).unwrap_or(0);
                        send_json(&mut sink, json!({
                            "type":"subscribe", "stream":stream, "cursor":cursor
                        })).await?;
                        subscriptions.insert(stream.to_string(), cursor);
                    }
                    "event" => {
                        let stream = payload.get("stream").and_then(JsonValue::as_str)
                            .ok_or_else(|| "remote_event_stream_required".to_string())?;
                        let sequence = payload.get("sequence").and_then(JsonValue::as_i64)
                            .ok_or_else(|| "remote_event_sequence_invalid".to_string())?;
                        let inserted = persist_before_delivery(
                            state, local_user_id, &credential.remote_user_id, &payload,
                        )?;
                        if inserted { broadcast_sync_event(payload.clone()); }
                        send_json(&mut sink, json!({
                            "type":"ack", "stream":stream, "sequence":sequence
                        })).await?;
                        subscriptions.insert(stream.to_string(), sequence);
                    }
                    "revoked" => {
                        if let Some(stream) = payload.get("stream").and_then(JsonValue::as_str) {
                            subscriptions.remove(stream);
                        }
                        broadcast_sync_event(payload);
                    }
                    "error" => {
                        let code = payload.get("code").and_then(JsonValue::as_str).unwrap_or("sync_error");
                        if matches!(code, "authentication_expired" | "authentication_invalid") {
                            return Err(code.to_string());
                        }
                        broadcast_sync_event(payload);
                    }
                    _ => {}
                }
            }
        }
    }
}

pub(super) async fn run(
    state: LocalAtomeState, remote_url: String, delivery_path: String, local_user_id: String,
) {
    let mut failures = 0u32;
    loop {
        if credential_for(&state, &local_user_id).is_none() {
            sleep(Duration::from_millis(500)).await;
            continue;
        }
        if let Err(error) = connected_session(&state, &remote_url, &delivery_path, &local_user_id).await {
            failures = failures.saturating_add(1);
            broadcast_sync_event(json!({
                "type":"sync:connection-error", "code":error, "local_user_id":local_user_id
            }));
        } else {
            failures = 0;
        }
        let delay = 500u64.saturating_mul(2u64.saturating_pow(failures.min(6))).min(30_000);
        sleep(Duration::from_millis(delay)).await;
    }
}
