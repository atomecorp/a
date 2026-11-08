use super::local_atome_ws_subscriptions::Subscriptions;
use super::{
    broadcast_sync_event,
    local_atome::{LocalAtomeState, RemoteSyncCredential},
    local_atome_sync_progress as progress,
};
use futures_util::{FutureExt, SinkExt, StreamExt};
use serde_json::{Value, json};
use std::collections::HashSet;
use tokio::time::{Duration, Instant, interval, sleep};
use tokio_tungstenite::tungstenite::Message;

fn credential_for(state: &LocalAtomeState, user: &str) -> Option<RemoteSyncCredential> {
    state
        .remote_sync_credentials
        .lock()
        .ok()?
        .get(user)
        .cloned()
}
pub(super) async fn send_json<S>(sink: &mut S, payload: Value) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    sink.send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|error| error.to_string())
}
// At most this many frames already received are read together (one transaction for their events).
const RECEIVED_GROUP: usize = 256;

fn available_streams(state: &LocalAtomeState, user: &str) -> Result<Vec<(String, i64)>, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "local_projection_database_unavailable")?;
    super::local_atome_remote_projection::stream_cursors(&db, user)
}

// The events received together: persisted in one transaction, then acknowledged one by one.
async fn persist_received<S>(
    state: &LocalAtomeState,
    user: &str,
    credential: &RemoteSyncCredential,
    sink: &mut S,
    applied: &mut HashSet<String>,
    events: Vec<Value>,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    if events.is_empty() {
        return Ok(());
    }
    let inserted = {
        let mut db = state
            .db
            .lock()
            .map_err(|_| "local_projection_database_unavailable")?;
        let inserted = super::local_atome_remote_projection::persist_ws_events(
            &mut db,
            user,
            &credential.remote_user_id,
            &events,
        )?;
        // A media deleted elsewhere: its copy on this device goes (local_atome_media_removal.rs, D36).
        for (event, inserted) in events.iter().zip(&inserted) {
            if *inserted && event["kind"].as_str() == Some("delete") {
                super::local_atome_media_removal::remove_deleted_media(
                    &db,
                    state.storage_root(),
                    event["atome_id"].as_str(),
                )?;
            }
        }
        inserted
    };
    for (event, inserted) in events.iter().zip(inserted) {
        let stream = event["stream"]
            .as_str()
            .ok_or("remote_event_stream_required")?;
        let sequence = event["sequence"]
            .as_i64()
            .ok_or("remote_event_sequence_invalid")?;
        if inserted {
            applied.insert(stream.to_string());
        }
        send_json(
            sink,
            json!({"type":"ack","stream":stream,"sequence":sequence}),
        )
        .await?;
    }
    Ok(())
}

async fn connected_session(
    state: &LocalAtomeState,
    remote_url: &str,
    path: &str,
    user: &str,
    failures: &mut u32,
) -> Result<(), String> {
    let credential = credential_for(state, user).ok_or("remote_sync_credential_unavailable")?;
    let endpoint = if credential.remote_url.is_empty() {
        remote_url
    } else {
        &credential.remote_url
    };
    progress::publish(
        state,
        user,
        &credential,
        "connecting",
        "unknown",
        progress::Replay::default(),
        None,
    );
    let url = format!(
        "{}{}",
        endpoint
            .trim_end_matches('/')
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1),
        path
    );
    let (socket, _) = crate::tls::connect_ws(url, None).await?;
    let (mut sink, mut source) = socket.split();
    send_json(&mut sink, json!({"type":"auth","token":credential.token})).await?;
    let mut subscriptions = Subscriptions::default();
    let mut registered = false;
    let mut replay_error: Option<String> = None;
    let mut last_received = Instant::now();
    let mut health_probe: Option<Instant> = None;
    let mut published_waiting = 0;
    let mut connection_checks = super::sync_event_sender().subscribe();
    let mut maintenance = interval(Duration::from_secs(10));
    let mut projection_tick = interval(Duration::from_millis(500));
    // The durable metadata projection is also the media recovery source. A slow
    // file never holds a replay acknowledgement or the socket heartbeat open.
    let media_recovery = async {
        loop {
            if let Err(error) = super::local_atome_sync_media::recover_inbound_media(
                state,
                endpoint,
                user,
                &credential,
            )
            .await
            {
                eprintln!("[sync-media] recovery deferred: {error}");
            }
            sleep(Duration::from_secs(30)).await;
        }
    };
    tokio::pin!(media_recovery);
    loop {
        tokio::select! {
            _ = &mut media_recovery => {},
            // The socket is let go with the vault: nothing is projected in background time.
            _ = state.db.quiesced() => return Err("local_vault_quiesced".into()),
            _ = projection_tick.tick() => {
                // While its subscriptions replay, the server answers in order after them (checking a
                // batch's streams can outlast the ping's 10 s): the 90 s silence bound judges it then.
                if subscriptions.settled() && health_probe.is_some_and(|sent| sent.elapsed() >= Duration::from_secs(10)) {
                    return Err("sync_heartbeat_timeout".into());
                }
                progress::projection(user, subscriptions.applied.drain().collect());
                // A restore's progress, told at the projection's pace while its streams arrive.
                if subscriptions.waiting.len() != published_waiting {
                    published_waiting = subscriptions.waiting.len();
                    let restore = if replay_error.is_some() { "error" } else { "receiving" };
                    progress::publish(state, user, &credential, "connected", restore, subscriptions.replay(), replay_error.as_deref());
                }
            }
            Ok(notice) = connection_checks.recv() => {
                if registered && health_probe.is_none() && notice["type"] == "sync:connection-check" && notice["local_user_id"] == user {
                    send_json(&mut sink, json!({"type":"ping"})).await?;
                    health_probe = Some(Instant::now());
                }
            }
            _ = maintenance.tick() => {
                let current = credential_for(state, user);
                if current.as_ref().map(|entry| (&entry.token, &entry.remote_url, &entry.environment_fingerprint))
                    != Some((&credential.token, &credential.remote_url, &credential.environment_fingerprint)) {
                    return Err("remote_sync_credential_changed".into());
                }
                if last_received.elapsed() > Duration::from_secs(90) { return Err("sync_heartbeat_timeout".into()); }
                if registered {
                    subscriptions.subscribe(&mut sink, available_streams(state, user)?, vec![]).await?;
                    if health_probe.is_none() {
                        send_json(&mut sink, json!({"type":"ping"})).await?;
                        health_probe = Some(Instant::now());
                    }
                }
            }
            incoming = source.next() => {
                // The frames already here are read together: their events go in one transaction.
                // Any frame proves the socket alive: the pong waits behind the replay already
                // queued for this device, which a phone takes minutes to persist.
                let mut frames = vec![incoming.ok_or("sync_socket_closed")?.map_err(|error| error.to_string())?];
                let mut closed = false;
                while frames.len() < RECEIVED_GROUP {
                    match source.next().now_or_never() {
                        Some(Some(message)) => frames.push(message.map_err(|error| error.to_string())?),
                        Some(None) => { closed = true; break; }
                        None => break,
                    }
                }
                last_received = Instant::now();
                health_probe = None;
                let mut events = Vec::new();
                for message in frames {
                    let Message::Text(text) = message else { continue; };
                    let payload: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
                    if payload["type"] == "event" {
                        if let Some(stream) = payload["stream"].as_str() { subscriptions.waiting.remove(stream); }
                        events.push(payload);
                        continue;
                    }
                    persist_received(state, user, &credential, &mut sink, &mut subscriptions.applied, std::mem::take(&mut events)).await?;
                    match payload["type"].as_str().unwrap_or("") {
                        "welcome" => {
                            let capabilities = payload["capabilities"].as_array();
                            subscriptions.batch = capabilities.is_some_and(|items| items.iter().any(|item| item == "subscribe-batch"));
                            subscriptions.settlement = capabilities.is_some_and(|items| items.iter().any(|item| item == "subscribe-batch-settlement"));
                            send_json(&mut sink, json!({"type":"register","source":format!("tauri:{user}"),"capabilities":["sqlite-projection","offline-lww"]})).await?;
                        }
                        "registered" => {
                            if payload["principal_id"].as_str() != Some(credential.remote_user_id.as_str()) { return Err("sync_principal_mismatch".into()); }
                            registered = true;
                            // A connection that reached its account resets the delay: a long restore
                            // cut by the network starts again at once, not after 30 s.
                            *failures = 0;
                            let announced = payload["streams"].as_array().into_iter().flatten().filter_map(Value::as_str).map(str::to_string).collect();
                            subscriptions.subscribe(&mut sink, available_streams(state, user)?, announced).await?;
                            progress::projection(user, subscriptions.streams.iter().cloned().collect());
                            published_waiting = subscriptions.waiting.len();
                            progress::publish(state, user, &credential, "connected", "receiving", subscriptions.replay(), None);
                        }
                        "stream-available" => {
                            if let Some(stream) = payload["stream"].as_str() {
                                subscriptions.subscribe(&mut sink, available_streams(state, user)?, vec![stream.to_string()]).await?;
                            }
                        }
                        "replay-complete" => {
                            if !subscriptions.settle(&payload) { continue; }
                            subscriptions.send_ready(&mut sink).await?;
                            progress::projection(user, subscriptions.applied.drain().collect());
                            let restore = if replay_error.is_some() { "error" } else if subscriptions.settled() { "ready" } else { "receiving" };
                            published_waiting = subscriptions.waiting.len();
                            progress::publish(state, user, &credential, "connected", restore, subscriptions.replay(), replay_error.as_deref());
                        }
                        "revoked" => {
                            if let Some(stream) = payload["stream"].as_str() { subscriptions.streams.remove(stream); subscriptions.waiting.remove(stream); }
                            // A revoked single replay has no replay-complete. A batch still has one.
                            if !subscriptions.batch { subscriptions.settle(&payload); }
                            broadcast_sync_event(payload);
                        }
                        "error" => {
                            let code = payload["code"].as_str().unwrap_or("sync_error");
                            if matches!(code, "authentication_expired" | "authentication_invalid") { return Err(code.to_string()); }
                            if code == "stream_access_denied" && !subscriptions.batch { subscriptions.settle(&payload); }
                            replay_error = Some(code.to_string());
                            progress::publish(state, user, &credential, "connected", "error", subscriptions.replay(), replay_error.as_deref());
                        }
                        _ => {}
                    }
                }
                persist_received(state, user, &credential, &mut sink, &mut subscriptions.applied, events).await?;
                if closed { return Err("sync_socket_closed".into()); }
            }
        }
    }
}

pub(super) async fn run(state: LocalAtomeState, remote_url: String, path: String, user: String) {
    let mut failures = 0u32;
    loop {
        state.db.foreground().await;
        if credential_for(&state, &user).is_none() {
            sleep(Duration::from_millis(500)).await;
            continue;
        }
        if let Err(error) =
            connected_session(&state, &remote_url, &path, &user, &mut failures).await
        {
            if error == "remote_sync_credential_changed" || error == "local_vault_quiesced" {
                failures = 0;
                continue;
            }
            failures = failures.saturating_add(1);
            if let Some(credential) = credential_for(&state, &user) {
                let auth = matches!(
                    error.as_str(),
                    "authentication_expired" | "authentication_invalid"
                );
                let projection_error = error.starts_with("local_projection")
                    || error.starts_with("remote_event")
                    || error.contains("database");
                progress::publish(
                    &state,
                    &user,
                    &credential,
                    if auth {
                        "auth_required"
                    } else {
                        "disconnected"
                    },
                    if projection_error { "error" } else { "unknown" },
                    progress::Replay::default(),
                    Some(&error),
                );
            }
        }
        sleep(Duration::from_millis(
            500u64
                .saturating_mul(2u64.saturating_pow(failures.min(6)))
                .min(30_000),
        ))
        .await;
    }
}
