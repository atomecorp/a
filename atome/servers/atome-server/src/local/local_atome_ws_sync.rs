use super::{
    broadcast_sync_event,
    local_atome::{LocalAtomeState, RemoteSyncCredential},
    local_atome_sync_progress as progress,
};
use futures_util::{FutureExt, SinkExt, StreamExt};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
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
async fn send_json<S>(sink: &mut S, payload: Value) -> Result<(), String>
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

#[derive(Default)]
struct Subscriptions {
    streams: HashSet<String>,
    pending: HashMap<String, Vec<String>>,
    order: VecDeque<String>,
    applied: HashSet<String>,
    // Streams subscribed at cursor 0 not received yet: a restore's remaining work.
    waiting: HashSet<String>,
    batch: bool,
    settlement: bool,
}
impl Subscriptions {
    async fn subscribe<S>(
        &mut self,
        sink: &mut S,
        cursors: Vec<(String, i64)>,
        announced: Vec<String>,
    ) -> Result<(), String>
    where
        S: futures_util::Sink<Message> + Unpin,
        S::Error: std::fmt::Display,
    {
        let mut known: HashMap<String, i64> = cursors.into_iter().collect();
        known.entry("directory.public".into()).or_insert(0);
        for stream in &announced {
            known.entry(stream.clone()).or_insert(0);
        }
        // The server's order is kept (the account's own record, its profile, comes first:
        // a new device's home awaits it); the streams it does not name follow by id.
        let rank: HashMap<&str, usize> = announced
            .iter()
            .enumerate()
            .rev()
            .map(|(index, stream)| (stream.as_str(), index))
            .collect();
        let mut fresh: Vec<_> = known
            .into_iter()
            .filter(|(stream, _)| !self.streams.contains(stream))
            .collect();
        fresh.sort_by(|a, b| {
            let place = |stream: &str| rank.get(stream).copied().unwrap_or(usize::MAX);
            place(&a.0).cmp(&place(&b.0)).then_with(|| a.0.cmp(&b.0))
        });
        for batch in fresh.chunks(if self.batch { 500 } else { 1 }) {
            let id = if self.batch {
                uuid::Uuid::new_v4().to_string()
            } else {
                batch[0].0.clone()
            };
            let mut message = if self.batch {
                json!({"type":"subscribe", "streams":batch.iter().map(|(stream,cursor)| json!({"stream":stream,"cursor":cursor})).collect::<Vec<_>>()})
            } else {
                json!({"type":"subscribe","stream":batch[0].0,"cursor":batch[0].1})
            };
            if self.batch && self.settlement {
                message["subscription_id"] = json!(id);
            }
            send_json(sink, message).await?;
            let streams: Vec<String> = batch.iter().map(|(stream, _)| stream.clone()).collect();
            self.waiting.extend(
                batch
                    .iter()
                    .filter(|(_, cursor)| *cursor == 0)
                    .map(|(stream, _)| stream.clone()),
            );
            self.streams.extend(streams.iter().cloned());
            self.pending.insert(id.clone(), streams);
            self.order.push_back(id);
        }
        Ok(())
    }
    fn settle(&mut self, message: &Value) -> bool {
        if self.batch && self.settlement && message.get("subscription_id").is_none() {
            return false;
        }
        let id = message
            .get("subscription_id")
            .or_else(|| message.get("stream"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| self.order.front().cloned());
        let Some(id) = id else {
            return false;
        };
        let Some(streams) = self.pending.remove(&id) else {
            return false;
        };
        for stream in &streams {
            self.waiting.remove(stream);
        }
        self.order.retain(|entry| entry != &id);
        true
    }
    fn replay(&self) -> progress::Replay {
        progress::Replay {
            pending: self.pending.len(),
            total: self.streams.len(),
            waiting: self.waiting.len(),
        }
    }
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
                if subscriptions.pending.is_empty() && health_probe.is_some_and(|sent| sent.elapsed() >= Duration::from_secs(10)) {
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
                            progress::projection(user, subscriptions.applied.drain().collect());
                            let restore = if replay_error.is_some() { "error" } else if subscriptions.pending.is_empty() { "ready" } else { "receiving" };
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn batches_are_bounded_correlated_and_settled_once() {
        let sent = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = sent.clone();
        let mut sink = Box::pin(futures_util::sink::unfold(
            captured,
            |captured, message: Message| async move {
                if let Message::Text(text) = message {
                    captured
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(&text).unwrap());
                }
                Ok::<_, std::convert::Infallible>(captured)
            },
        ));
        let mut state = Subscriptions {
            batch: true,
            settlement: true,
            ..Default::default()
        };
        state
            .subscribe(
                &mut sink,
                vec![],
                (0..1200).map(|index| format!("stream-{index}")).collect(),
            )
            .await
            .unwrap();
        let messages = sent.lock().unwrap().clone();
        assert_eq!(
            messages
                .iter()
                .map(|message| message["streams"].as_array().unwrap().len())
                .collect::<Vec<_>>(),
            vec![500, 500, 201]
        );
        for message in messages {
            let reply = json!({"subscription_id":message["subscription_id"]});
            assert!(state.settle(&reply));
            assert!(!state.settle(&reply));
        }
        assert!(state.pending.is_empty());
        state
            .subscribe(&mut sink, vec![], vec!["stream-1".into()])
            .await
            .unwrap();
        assert_eq!(sent.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn the_announced_order_is_kept_before_the_known_streams() {
        let sent = Arc::new(Mutex::new(Vec::<Value>::new()));
        let captured = sent.clone();
        let mut sink = Box::pin(futures_util::sink::unfold(
            captured,
            |captured, message: Message| async move {
                if let Message::Text(text) = message {
                    captured
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(&text).unwrap());
                }
                Ok::<_, std::convert::Infallible>(captured)
            },
        ));
        let mut state = Subscriptions {
            batch: true,
            ..Default::default()
        };
        state
            .subscribe(
                &mut sink,
                vec![("0-known".into(), 7)],
                vec!["f-profile".into(), "1-other".into(), "0-known".into()],
            )
            .await
            .unwrap();
        let streams = sent.lock().unwrap()[0]["streams"].clone();
        assert_eq!(
            streams
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| (
                    entry["stream"].as_str().unwrap().to_string(),
                    entry["cursor"].as_i64().unwrap()
                ))
                .collect::<Vec<_>>(),
            vec![
                ("f-profile".to_string(), 0),
                ("1-other".to_string(), 0),
                ("0-known".to_string(), 7),
                ("directory.public".to_string(), 0)
            ]
        );
    }

    #[test]
    fn an_unrelated_receipt_cannot_complete_another_subscription() {
        let mut state = Subscriptions::default();
        state
            .pending
            .insert("expected".into(), vec!["stream".into()]);
        state.order.push_back("expected".into());
        assert!(!state.settle(&json!({"subscription_id":"old-socket"})));
        assert_eq!(state.pending.len(), 1);
        assert!(state.settle(&json!({"streams":[]})));
    }
}
