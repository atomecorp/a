// The remote projection socket's health (ported from the retired Swift client's probe): the
// connection checks asked while one ping is unanswered send no second ping, and a socket that
// stays OPEN without answering is replaced by a new connection.
use super::local_atome::create_state;
use super::local_atome_state::RemoteSyncCredential;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
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
    let (count, pings, ready) = (connections.clone(), first_pings.clone(), registered.clone());
    let server = tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let connection = count.fetch_add(1, Ordering::SeqCst) + 1;
            let (pings, ready) = (pings.clone(), ready.clone());
            tokio::spawn(async move {
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                while let Some(Ok(Message::Text(text))) = socket.next().await {
                    let message: Value = serde_json::from_str(&text).unwrap();
                    let reply = match message["type"].as_str().unwrap_or("") {
                        "auth" => Some(
                            json!({"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]}),
                        ),
                        "register" => {
                            ready.store(connection, Ordering::SeqCst);
                            Some(json!({"type":"registered","principal_id":"remote","streams":[]}))
                        }
                        "subscribe" => Some(
                            json!({"type":"replay-complete","subscription_id":message["subscription_id"],"streams":[]}),
                        ),
                        "ping" if connection == 1 => {
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
    .expect("registered on the first socket");
    tokio::time::sleep(Duration::from_millis(100)).await;
    for _ in 0..3 {
        super::broadcast_sync_event(
            json!({"type":"sync:connection-check","local_user_id":"local-user"}),
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    // The unanswered ping is given 10 s, then the socket is replaced.
    tokio::time::timeout(Duration::from_secs(20), async {
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
