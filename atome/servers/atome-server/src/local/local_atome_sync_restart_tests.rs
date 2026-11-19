// What a local server keeps across a restart and hands back to its views (ported from the retired
// Swift probes `ios_sync_restart`, `ios_sync_recovery` and the tombstone check of
// known-bug-solutions/local-server-tombstones-in-lists): a replay cut before it settles resumes
// from its durable cursor, an unchanged import pass writes and queues nothing, and a deleted
// atome leaves the listings unless they ask for it.
use super::local_atome::{handle_events_message, handle_state_current_message};
use super::local_atome_ws_sync_replay_tests::{
    cursor, event_count, open_state, shape_event, start_client, until,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio_tungstenite::tungstenite::Message;

const USER: &str = "restart-user-0000-4000-8000-000000000001";

#[tokio::test]
async fn a_replay_cut_before_it_settles_resumes_from_its_durable_cursor_after_a_restart() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let resumed = Arc::new(Mutex::new(None::<Value>));
    let seen = resumed.clone();
    let server = tokio::spawn(async move {
        for connection in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            while let Some(Ok(Message::Text(text))) = socket.next().await {
                let message: Value = serde_json::from_str(&text).unwrap();
                let mut replies = Vec::new();
                match message["type"].as_str().unwrap_or("") {
                    "auth" => replies.push(json!({"type":"welcome","capabilities":["subscribe-batch","subscribe-batch-settlement"]})),
                    "register" => replies.push(json!({"type":"registered","principal_id":"remote","streams":["stream-r"]})),
                    // The first process dies with its replay under way: no replay-complete.
                    "subscribe" if connection == 0 => {
                        replies.push(shape_event("stream-r", 1, "restart-shape"));
                        replies.push(shape_event("stream-r", 2, "restart-shape"));
                    }
                    "subscribe" => {
                        *seen.lock().unwrap() = Some(message.clone());
                        // A server resending what was already held, then the rest.
                        replies.push(shape_event("stream-r", 2, "restart-shape"));
                        replies.push(shape_event("stream-r", 3, "restart-shape"));
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
        }
    });
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    let client = start_client(&state, port, USER);
    until("the first two events persisted", 10, || {
        cursor(&state, USER, "stream-r") == 2
    })
    .await;
    // The process ends: its client and its database go.
    client.abort();
    let _ = client.await;
    drop(state);

    let state = open_state(directory.path());
    assert_eq!(cursor(&state, USER, "stream-r"), 2);
    let client = start_client(&state, port, USER);
    until("the replay settled after the restart", 10, || {
        cursor(&state, USER, "stream-r") == 3
    })
    .await;
    let subscribe = resumed.lock().unwrap().clone().unwrap();
    let entry = subscribe["streams"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["stream"] == "stream-r")
        .cloned()
        .unwrap();
    assert_eq!(entry["cursor"], 2, "resumed from {subscribe}");
    assert_eq!(event_count(&state, "stream-r"), 3);
    let left: i64 = state
        .db
        .lock()
        .unwrap()
        .query_row(
            "SELECT json_extract(properties, '$.left') FROM state_current WHERE atome_id = 'restart-shape'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(left, 3);
    client.abort();
    server.abort();
}

async fn commit(state: &super::local_atome::LocalAtomeState, event: Value) {
    let response =
        handle_events_message(json!({ "action": "commit", "event": event }), USER, state).await;
    assert!(response.success, "commit refused: {:?}", response.error);
}

fn seed_user(state: &super::local_atome::LocalAtomeState) {
    state.db.lock().unwrap().execute(
        "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at) VALUES (?1, 'user', ?1, ?1, '2026-11-16T00:00:00Z', '2026-11-16T00:00:00Z')",
        [USER],
    ).unwrap();
}

fn count(state: &super::local_atome::LocalAtomeState, sql: &str) -> i64 {
    state
        .db
        .lock()
        .unwrap()
        .query_row(sql, [USER], |row| row.get(0))
        .unwrap()
}

// An import pass rewrote every origin it found unchanged: each rewrite appended an event and
// queued a delivery, and the outbox grew to hundreds of thousands of rows. A set that changes
// nothing reaches neither the history nor the outbox; a real change still does.
#[tokio::test]
async fn an_unchanged_import_pass_queues_no_delivery() {
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    seed_user(&state);
    let origin = json!({ "kind": "set", "atome_id": "origin-1",
        "props": { "type": "import_origin", "source_key": "contacts", "external_id": "42" } });
    commit(&state, origin.clone()).await;
    let queued = "SELECT COUNT(*) FROM sync_queue WHERE json_extract(payload, '$.actor.id') = ?1";
    let events = "SELECT COUNT(*) FROM events WHERE json_extract(actor, '$.id') = ?1";
    let (first_queue, first_events) = (count(&state, queued), count(&state, events));
    assert_eq!(first_queue, 1);
    for _ in 0..3 {
        commit(&state, origin.clone()).await;
    }
    commit(
        &state,
        json!({ "kind": "set", "atome_id": "origin-1", "props": { "type": "import_origin" } }),
    )
    .await;
    assert_eq!(count(&state, queued), first_queue);
    assert_eq!(count(&state, events), first_events);
    commit(
        &state,
        json!({ "kind": "set", "atome_id": "origin-1", "props": { "external_id": "43" } }),
    )
    .await;
    assert_eq!(count(&state, queued), first_queue + 1);
}

async fn listed(state: &super::local_atome::LocalAtomeState, extra: Value) -> Vec<String> {
    let mut message = json!({ "action": "list", "project_id": "tomb-project", "limit": 100 });
    for (key, value) in extra.as_object().unwrap() {
        message[key] = value.clone();
    }
    let response = handle_state_current_message(message, USER, state).await;
    let states = response.data.unwrap()["states"].as_array().unwrap().clone();
    states
        .iter()
        .map(|entry| entry["atome_id"].as_str().unwrap().to_string())
        .collect()
}

// A template's deleted cells were listed as live by the local servers, and their copies
// stacked on the Dashboard. A tombstone stays in the history, out of the default listing.
#[tokio::test]
async fn a_deleted_atome_leaves_the_listing_unless_tombstones_are_asked_for() {
    let directory = tempfile::tempdir().unwrap();
    let state = open_state(directory.path());
    seed_user(&state);
    commit(
        &state,
        json!({ "kind": "set", "atome_id": "tomb-project",
        "props": { "type": "project", "name": "Template" } }),
    )
    .await;
    for cell in ["cell-kept", "cell-deleted"] {
        commit(
            &state,
            json!({ "kind": "set", "atome_id": cell, "project_id": "tomb-project",
            "props": { "type": "shape", "left": 1 } }),
        )
        .await;
    }
    commit(
        &state,
        json!({ "kind": "delete", "atome_id": "cell-deleted", "project_id": "tomb-project" }),
    )
    .await;
    let live = listed(&state, json!({})).await;
    assert!(live.contains(&"cell-kept".to_string()), "{live:?}");
    assert!(!live.contains(&"cell-deleted".to_string()), "{live:?}");
    let all = listed(&state, json!({ "include_deleted": true })).await;
    assert!(all.contains(&"cell-deleted".to_string()), "{all:?}");
}
