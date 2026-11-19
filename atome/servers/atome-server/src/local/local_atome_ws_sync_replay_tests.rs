// The replay of the account's server through the real `/ws/sync` client (ported from the retired
// Swift client's `ios_sync_batch_subscribe` probe, known-bug-solutions/ios-outbox-backlog-
// unchanged-import-origins and sync-replay-storm-idle-heat): subscriptions go in bounded batches,
// an event is acknowledged only once it is durable, and a reconnection with nothing new replays
// and announces nothing.
use super::local_atome::{LocalAtomeState, create_state};
use super::local_atome_state::RemoteSyncCredential;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

const WELCOME: &str =
    r#"{"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]}"#;

pub(super) fn open_state(directory: &std::path::Path) -> LocalAtomeState {
    create_state(directory.join("state"), directory.to_path_buf(), "DELETE").unwrap()
}

pub(super) fn start_client(
    state: &LocalAtomeState,
    port: u16,
    user: &str,
) -> tokio::task::JoinHandle<()> {
    let url = format!("http://127.0.0.1:{port}");
    state.remote_sync_credentials.lock().unwrap().insert(
        user.into(),
        RemoteSyncCredential {
            remote_user_id: "remote".into(),
            token: "token".into(),
            remote_url: url.clone(),
            environment_fingerprint: String::new(),
        },
    );
    tokio::spawn(super::local_atome_ws_sync::run(
        state.clone(),
        url,
        "/ws/sync".into(),
        user.into(),
    ))
}

pub(super) fn shape_event(stream: &str, sequence: i64, atome: &str) -> Value {
    json!({"type":"event","event_id":format!("{stream}-{sequence}"),"stream":stream,"sequence":sequence,
        "atome_id":atome,"kind":"set","timestamp":"2026-11-16T00:00:00Z",
        "patch":{"props":{"type":"shape","left":sequence}}})
}

pub(super) fn cursor(state: &LocalAtomeState, user: &str, stream: &str) -> i64 {
    state
        .db
        .lock()
        .unwrap()
        .query_row(
            "SELECT COALESCE(MAX(last_sequence), 0) FROM remote_sync_stream_cursors WHERE local_user_id = ?1 AND stream_id = ?2",
            [user, stream],
            |row| row.get(0),
        )
        .unwrap()
}

pub(super) fn event_count(state: &LocalAtomeState, stream: &str) -> i64 {
    state
        .db
        .lock()
        .unwrap()
        .query_row(
            "SELECT COUNT(*) FROM events WHERE stream_id = ?1",
            [stream],
            |row| row.get(0),
        )
        .unwrap()
}

pub(super) async fn until(what: &str, seconds: u64, mut done: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(seconds), async {
        while !done() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("{what}"));
}

// The streams every `sync:projection-ready` of `user` named, one list per announcement.
fn projections_of(user: &'static str) -> Arc<Mutex<Vec<Vec<String>>>> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let mut events = super::sync_event_sender().subscribe();
    let sink = seen.clone();
    tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(event) => {
                    if event["type"] == "sync:projection-ready" && event["local_user_id"] == user {
                        let streams = event["streams"].as_array().unwrap().iter();
                        let streams = streams.map(|s| s.as_str().unwrap().to_string()).collect();
                        sink.lock().unwrap().push(streams);
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            }
        }
    });
    seen
}

#[tokio::test]
async fn an_announced_account_is_subscribed_in_bounded_batches_and_projected_per_applied_stream() {
    const USER: &str = "batch-user";
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let batches = Arc::new(Mutex::new(Vec::<Value>::new()));
    let seen = batches.clone();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
        while let Some(Ok(Message::Text(text))) = socket.next().await {
            let message: Value = serde_json::from_str(&text).unwrap();
            let mut replies = Vec::new();
            match message["type"].as_str().unwrap_or("") {
                "auth" => replies.push(serde_json::from_str(WELCOME).unwrap()),
                "register" => replies.push(json!({"type":"registered","principal_id":"remote",
                    "streams":(0..1200).map(|i| format!("stream-{i:04}")).collect::<Vec<_>>()})),
                "subscribe" => {
                    let first = seen.lock().unwrap().is_empty();
                    seen.lock().unwrap().push(message.clone());
                    if first {
                        replies.push(shape_event("stream-0001", 1, "batch-shape"));
                    }
                    replies.push(json!({"type":"replay-complete","subscription_id":message["subscription_id"],
                        "settled_streams":message["streams"]}));
                }
                "ping" => replies.push(json!({"type":"pong"})),
                _ => {}
            }
            for reply in replies {
                socket
                    .send(Message::Text(reply.to_string().into()))
                    .await
                    .unwrap();
            }
        }
    });
    let projections = projections_of(USER);
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    let client = start_client(&state, port, USER);
    until("three batches answered", 10, || {
        batches.lock().unwrap().len() == 3
    })
    .await;
    until("the applied stream projected", 5, || {
        projections.lock().unwrap().len() >= 2
    })
    .await;
    // One more projection tick: nothing else may be announced.
    tokio::time::sleep(Duration::from_millis(700)).await;
    let batches = batches.lock().unwrap().clone();
    // 1 200 announced streams plus directory.public: three messages, never 1 201.
    let sizes: Vec<usize> = batches
        .iter()
        .map(|batch| batch["streams"].as_array().unwrap().len())
        .collect();
    assert_eq!(sizes, vec![500, 500, 201]);
    assert!(batches.iter().all(|batch| batch.get("stream").is_none()));
    let ids: std::collections::HashSet<&str> = batches
        .iter()
        .map(|batch| batch["subscription_id"].as_str().unwrap())
        .collect();
    assert_eq!(ids.len(), 3);
    // The registration names what the home awaits once; then only the stream an event changed.
    let projections = projections.lock().unwrap().clone();
    assert_eq!(projections[0].len(), 1201);
    assert_eq!(
        projections[1..].to_vec(),
        vec![vec!["stream-0001".to_string()]]
    );
    assert_eq!(cursor(&state, USER, "stream-0001"), 1);
    client.abort();
    server.abort();
}

// A replay interleaved with `acked` and `pong` answers: every ack the device sends names an
// event already committed to its database, and the whole replay lands once.
#[tokio::test]
async fn a_replay_is_acknowledged_only_once_its_events_are_durable() {
    const USER: &str = "ack-user";
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    let acks = Arc::new(Mutex::new(Vec::<(i64, i64)>::new()));
    let (seen, durable) = (acks.clone(), state.clone());
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
        while let Some(Ok(Message::Text(text))) = socket.next().await {
            let message: Value = serde_json::from_str(&text).unwrap();
            let mut replies = Vec::new();
            match message["type"].as_str().unwrap_or("") {
                "auth" => replies.push(serde_json::from_str(WELCOME).unwrap()),
                "register" => replies.push(
                    json!({"type":"registered","principal_id":"remote","streams":["stream-1"]}),
                ),
                "ack" => {
                    let sequence = message["sequence"].as_i64().unwrap();
                    let stored = cursor(&durable, USER, "stream-1");
                    seen.lock().unwrap().push((sequence, stored));
                    replies.push(json!({"type":"acked","stream":"stream-1","sequence":sequence}));
                }
                "subscribe" => {
                    for sequence in 1..=150 {
                        let atome = format!("run-shape-{}", sequence % 10);
                        replies.push(shape_event("stream-1", sequence, &atome));
                        if sequence % 10 == 0 {
                            replies.push(json!({"type":"acked","stream":"stream-1","sequence":0}));
                            replies.push(json!({"type":"pong"}));
                        }
                    }
                    replies.push(json!({"type":"replay-complete","subscription_id":message["subscription_id"],
                        "settled_streams":message["streams"]}));
                }
                "ping" => replies.push(json!({"type":"pong"})),
                _ => {}
            }
            for reply in replies {
                socket
                    .send(Message::Text(reply.to_string().into()))
                    .await
                    .unwrap();
            }
        }
    });
    let client = start_client(&state, port, USER);
    until("every event acknowledged", 15, || {
        acks.lock()
            .unwrap()
            .iter()
            .any(|(sequence, _)| *sequence == 150)
    })
    .await;
    let acks = acks.lock().unwrap().clone();
    assert_eq!(acks.len(), 150);
    for (sequence, stored) in &acks {
        assert!(
            stored >= sequence,
            "ack {sequence} sent before its commit ({stored})"
        );
    }
    assert_eq!(event_count(&state, "stream-1"), 150);
    assert_eq!(cursor(&state, USER, "stream-1"), 150);
    client.abort();
    server.abort();
}

// The idle-heat storm: each reconnection replayed every stream from zero and announced every
// one of them again. A reconnection resumes each stream from its durable cursor; what a server
// sends again is already held, so nothing is written, nothing applied, nothing announced.
#[tokio::test]
async fn a_reconnection_with_nothing_new_replays_and_announces_nothing() {
    const USER: &str = "storm-user";
    const STREAMS: usize = 50;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let subscribed = Arc::new(Mutex::new(Vec::<Vec<Value>>::new()));
    let seen = subscribed.clone();
    let server = tokio::spawn(async move {
        for _ in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            while let Some(Ok(Message::Text(text))) = socket.next().await {
                let message: Value = serde_json::from_str(&text).unwrap();
                let mut replies = Vec::new();
                match message["type"].as_str().unwrap_or("") {
                    "auth" => replies.push(serde_json::from_str(WELCOME).unwrap()),
                    "register" => replies.push(json!({"type":"registered","principal_id":"remote",
                        "streams":(0..STREAMS).map(|i| format!("stream-{i:02}")).collect::<Vec<_>>()})),
                    "subscribe" => {
                        let entries = message["streams"].as_array().unwrap().clone();
                        seen.lock().unwrap().push(entries.clone());
                        // Both connections send the same three events of every stream.
                        for entry in &entries {
                            let stream = entry["stream"].as_str().unwrap();
                            if stream == "directory.public" {
                                continue;
                            }
                            for sequence in 1..=3 {
                                replies.push(shape_event(stream, sequence, &format!("atom-{stream}")));
                            }
                        }
                        replies.push(json!({"type":"replay-complete","subscription_id":message["subscription_id"],
                            "settled_streams":entries}));
                    }
                    "ping" => replies.push(json!({"type":"pong"})),
                    _ => {}
                }
                for reply in replies {
                    socket
                        .send(Message::Text(reply.to_string().into()))
                        .await
                        .unwrap();
                }
            }
        }
    });
    let projections = projections_of(USER);
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    let client = start_client(&state, port, USER);
    let all_at_three = |state: &LocalAtomeState| {
        (0..STREAMS).all(|i| cursor(state, USER, &format!("stream-{i:02}")) == 3)
    };
    until("the first replay persisted", 15, || all_at_three(&state)).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    let first = projections.lock().unwrap().len();
    let events_before = event_count_all(&state);
    // The connection drops (the app sent to the background, the network gone).
    client.abort();
    let _ = client.await;
    let client = start_client(&state, port, USER);
    until("the second connection subscribed", 10, || {
        subscribed.lock().unwrap().len() >= 2
    })
    .await;
    tokio::time::sleep(Duration::from_millis(1200)).await;
    let subscribed = subscribed.lock().unwrap().clone();
    for entry in &subscribed[1] {
        let expected = if entry["stream"] == "directory.public" {
            0
        } else {
            3
        };
        assert_eq!(entry["cursor"], expected, "resumed cursor of {entry}");
    }
    assert_eq!(event_count_all(&state), events_before);
    // The second registration names the account's streams once; no event applied anything.
    let projections = projections.lock().unwrap().clone();
    assert_eq!(projections.len(), first + 1, "{:?}", &projections[first..]);
    client.abort();
    server.abort();
}

fn event_count_all(state: &LocalAtomeState) -> i64 {
    state
        .db
        .lock()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
        .unwrap()
}
