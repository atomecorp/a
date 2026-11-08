// The remote projection socket's health (ported from the retired Swift client's probe): the
// connection checks asked while one ping is unanswered send no second ping, and a socket that
// stays OPEN without answering is replaced by a new connection.
use super::local_atome::create_state;
use super::local_atome_state::RemoteSyncCredential;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn connection_checks_coalesce_and_an_unresponsive_socket_is_replaced() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let (connections, first_pings, registered) = (
        Arc::new(AtomicUsize::new(0)),
        Arc::new(AtomicUsize::new(0)),
        Arc::new(AtomicUsize::new(0)),
    );
    // Once the first socket falls silent, the pings it receives are counted: while one is
    // unanswered, neither a connection check nor the periodic maintenance sends another.
    let silent = Arc::new(AtomicBool::new(false));
    let (count, pings, ready, quiet) = (
        connections.clone(),
        first_pings.clone(),
        registered.clone(),
        silent.clone(),
    );
    let server = tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let connection = count.fetch_add(1, Ordering::SeqCst) + 1;
            let (pings, ready, quiet) = (pings.clone(), ready.clone(), quiet.clone());
            tokio::spawn(async move {
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                while let Some(Ok(Message::Text(text))) = socket.next().await {
                    let message: Value = serde_json::from_str(&text).unwrap();
                    let reply = match message["type"].as_str().unwrap_or("") {
                        "auth" => Some(
                            json!({"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]}),
                        ),
                        "register" => {
                            Some(json!({"type":"registered","principal_id":"remote","streams":[]}))
                        }
                        "subscribe" => {
                            ready.store(connection, Ordering::SeqCst);
                            Some(
                                json!({"type":"replay-complete","subscription_id":message["subscription_id"],"streams":[]}),
                            )
                        }
                        "ping" if connection == 1 && quiet.load(Ordering::SeqCst) => {
                            pings.fetch_add(1, Ordering::SeqCst);
                            None
                        }
                        "ping" => Some(json!({"type":"pong"})),
                        _ => None,
                    };
                    if let Some(reply) = reply {
                        socket
                            .send(Message::Text(reply.to_string().into()))
                            .await
                            .unwrap();
                    }
                }
            });
        }
    });

    let directory = tempfile::tempdir().unwrap();
    let state = create_state(
        directory.path().join("state"),
        directory.path().to_path_buf(),
        "DELETE",
    )
    .unwrap();
    let url = format!("http://127.0.0.1:{port}");
    state.remote_sync_credentials.lock().unwrap().insert(
        "local-user".into(),
        RemoteSyncCredential {
            remote_user_id: "remote".into(),
            token: "token".into(),
            remote_url: url.clone(),
            environment_fingerprint: String::new(),
        },
    );
    let client = tokio::spawn(super::local_atome_ws_sync::run(
        state.clone(),
        url,
        "/ws/sync".into(),
        "local-user".into(),
    ));
    tokio::time::timeout(Duration::from_secs(5), async {
        while registered.load(Ordering::SeqCst) != 1 {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("the first socket's subscriptions settled");
    // Silent from now on: the replies already sent land before the checks.
    silent.store(true, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(300)).await;
    for _ in 0..3 {
        super::broadcast_sync_event(
            json!({"type":"sync:connection-check","local_user_id":"local-user"}),
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    // The unanswered ping is given 10 s, then the socket is replaced.
    tokio::time::timeout(Duration::from_secs(30), async {
        while connections.load(Ordering::SeqCst) < 2 {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("a new connection replaces the silent one");
    assert_eq!(first_pings.load(Ordering::SeqCst), 1);
    client.abort();
    server.abort();
}

// A new device's restore: the server answers in order, so the pong of a ping sent during the
// replay comes after every event already queued for the device, and a phone persists them for
// minutes. The connection must live through that backlog (frames are its proof of life) and
// the whole replay must land on one connection, its events grouped in few transactions.
#[tokio::test]
async fn a_replay_longer_than_the_ping_deadline_completes_on_one_connection() {
    const STREAMS: usize = 20_000;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let connections = Arc::new(AtomicUsize::new(0));
    let count = connections.clone();
    let server = tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            count.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                let socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                let (mut out, mut incoming) = socket.split();
                // The device's queue: written as fast as the device reads, never holding the reader.
                let (queue, mut queued) = tokio::sync::mpsc::unbounded_channel::<Value>();
                tokio::spawn(async move {
                    while let Some(frame) = queued.recv().await {
                        if out
                            .send(Message::Text(frame.to_string().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                });
                while let Some(Ok(Message::Text(text))) = incoming.next().await {
                    let message: Value = serde_json::from_str(&text).unwrap();
                    match message["type"].as_str().unwrap_or("") {
                        "auth" => {
                            let _ = queue.send(json!({"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]}));
                        }
                        "register" => {
                            let streams: Vec<String> =
                                (0..STREAMS).map(|i| format!("stream-{i:05}")).collect();
                            let _ = queue.send(json!({"type":"registered","principal_id":"remote","streams":streams}));
                        }
                        "subscribe" => {
                            for entry in message["streams"].as_array().unwrap() {
                                let stream = entry["stream"].as_str().unwrap();
                                if entry["cursor"].as_i64().unwrap_or(0) > 0
                                    || stream == "directory.public"
                                {
                                    continue;
                                }
                                let _ = queue.send(json!({"type":"event","stream":stream,"sequence":1,
                                    "event_id":format!("event-{stream}"),"atome_id":format!("atom-{stream}"),"kind":"set",
                                    "timestamp":"2026-11-08T00:00:00Z","patch":{"props":{"type":"shape","left":1,"top":2}}}));
                            }
                            let _ = queue.send(json!({"type":"replay-complete","subscription_id":message["subscription_id"],"streams":[]}));
                        }
                        "ping" => {
                            let _ = queue.send(json!({"type":"pong"}));
                        }
                        _ => {}
                    }
                }
            });
        }
    });

    let directory = tempfile::tempdir().unwrap();
    let state = create_state(
        directory.path().join("state"),
        directory.path().to_path_buf(),
        "DELETE",
    )
    .unwrap();
    let url = format!("http://127.0.0.1:{port}");
    state.remote_sync_credentials.lock().unwrap().insert(
        "local-user".into(),
        RemoteSyncCredential {
            remote_user_id: "remote".into(),
            token: "token".into(),
            remote_url: url.clone(),
            environment_fingerprint: String::new(),
        },
    );
    let started = std::time::Instant::now();
    let client = tokio::spawn(super::local_atome_ws_sync::run(
        state.clone(),
        url,
        "/ws/sync".into(),
        "local-user".into(),
    ));
    let restored = || {
        state
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM remote_sync_stream_cursors WHERE local_user_id = 'local-user' AND last_sequence = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap() as usize
    };
    // The status tells the restore's progress while it runs (streams still awaited among those
    // subscribed), then nothing awaited once every stream arrived.
    let progress = || super::local_atome_sync_progress::read(&state, "local-user");
    let mut seen_midway = false;
    tokio::time::timeout(Duration::from_secs(120), async {
        while restored() < STREAMS {
            let status = progress();
            let (total, waiting) = (
                status["restore_total"].as_u64().unwrap_or(0),
                status["restore_waiting"].as_u64().unwrap_or(0),
            );
            seen_midway |= total > STREAMS as u64 && waiting > 0 && waiting < total;
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("restored {} of {STREAMS} streams", restored()));
    assert!(seen_midway, "no progress published during the restore");
    tokio::time::timeout(Duration::from_secs(5), async {
        while progress()["restore_waiting"].as_u64() != Some(0) {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("restore still awaited: {}", progress()));
    eprintln!(
        "restore of {STREAMS} streams: {:?}, connections {}",
        started.elapsed(),
        connections.load(Ordering::SeqCst)
    );
    assert_eq!(connections.load(Ordering::SeqCst), 1);
    client.abort();
    server.abort();
}

// The server checks a batch's streams before its first frame and answers in order: for a large
// account that silence outlasts the ping's 10 s. The connection waits for its replay (the 90 s
// silence bound judges it), never cut before a first event and started over.
#[tokio::test]
async fn a_batch_slower_than_the_ping_deadline_is_awaited() {
    const STREAMS: usize = 600;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let connections = Arc::new(AtomicUsize::new(0));
    let count = connections.clone();
    let server = tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            count.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                let mut first = true;
                while let Some(Ok(Message::Text(text))) = socket.next().await {
                    let message: Value = serde_json::from_str(&text).unwrap();
                    let mut replies = Vec::new();
                    match message["type"].as_str().unwrap_or("") {
                        "auth" => replies.push(json!({"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]})),
                        "register" => replies.push(json!({"type":"registered","principal_id":"remote",
                            "streams":(0..STREAMS).map(|i| format!("stream-{i:04}")).collect::<Vec<_>>()})),
                        "subscribe" => {
                            if std::mem::take(&mut first) {
                                tokio::time::sleep(Duration::from_secs(25)).await;
                            }
                            for entry in message["streams"].as_array().unwrap() {
                                let stream = entry["stream"].as_str().unwrap();
                                if stream != "directory.public" {
                                    replies.push(json!({"type":"event","stream":stream,"sequence":1,
                                        "event_id":format!("event-{stream}"),"atome_id":format!("atom-{stream}"),"kind":"set",
                                        "timestamp":"2026-11-08T00:00:00Z","patch":{"props":{"type":"shape","left":1,"top":2}}}));
                                }
                            }
                            replies.push(json!({"type":"replay-complete","subscription_id":message["subscription_id"],"streams":[]}));
                        }
                        "ping" => replies.push(json!({"type":"pong"})),
                        _ => {}
                    }
                    for reply in replies {
                        if socket
                            .send(Message::Text(reply.to_string().into()))
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }
                }
            });
        }
    });
    let directory = tempfile::tempdir().unwrap();
    let state = create_state(
        directory.path().join("state"),
        directory.path().to_path_buf(),
        "DELETE",
    )
    .unwrap();
    let url = format!("http://127.0.0.1:{port}");
    state.remote_sync_credentials.lock().unwrap().insert(
        "local-user".into(),
        RemoteSyncCredential {
            remote_user_id: "remote".into(),
            token: "token".into(),
            remote_url: url.clone(),
            environment_fingerprint: String::new(),
        },
    );
    let client = tokio::spawn(super::local_atome_ws_sync::run(
        state.clone(),
        url,
        "/ws/sync".into(),
        "local-user".into(),
    ));
    let restored = || {
        state.db.lock().unwrap()
            .query_row("SELECT COUNT(*) FROM remote_sync_stream_cursors WHERE local_user_id = 'local-user' AND last_sequence = 1", [], |row| row.get::<_, i64>(0))
            .unwrap() as usize
    };
    tokio::time::timeout(Duration::from_secs(60), async {
        while restored() < STREAMS {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("restored {} of {STREAMS} streams", restored()));
    assert_eq!(connections.load(Ordering::SeqCst), 1);
    client.abort();
    server.abort();
}
