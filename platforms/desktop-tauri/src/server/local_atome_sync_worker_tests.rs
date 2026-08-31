use super::{
    compute_backoff_ms, is_syncable_event, normalize_outbound_event, prune_local_only_queue,
    recover_interrupted_queue, resolve_sync_source, resolve_sync_target, retry_at,
    should_enqueue_sync,
};
use crate::server::local_atome::{list_sync_queue_for_actor, EventRecord};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn local_commits_default_to_fastify_without_environment_variables() {
    let target = resolve_sync_target(&json!({ "type": "events", "action": "commit" }));
    assert_eq!(target.as_deref(), Some("fastify"));
    assert!(should_enqueue_sync(&target, &None));
}

#[test]
fn transport_failures_keep_retrying_with_a_capped_backoff() {
    assert!(retry_at(500, false).is_some());
    assert!(retry_at(500, true).is_none());
    assert_eq!(compute_backoff_ms(500), 60000);
}

#[test]
fn inbound_fastify_events_are_not_echo_queued() {
    let message = json!({
        "type": "events",
        "action": "commit",
        "sync_source": "fastify"
    });
    let target = resolve_sync_target(&message);
    let source = resolve_sync_source(&message);
    assert!(!should_enqueue_sync(&target, &source));
}

#[test]
fn tool_ui_records_are_device_local_and_pruned_from_the_remote_queue() {
    let event = EventRecord {
        id: "tool-event".to_string(),
        ts: "2026-08-31T00:00:00Z".to_string(),
        atome_id: Some("tool_ui.home.panel".to_string()),
        project_id: None,
        kind: "set".to_string(),
        payload: Some(json!({ "props": { "open": true } })),
        actor: Some(json!({ "id": "local-user" })),
        tx_id: None,
        gesture_id: None,
    };
    assert!(!is_syncable_event(&event));

    let db = Connection::open_in_memory().expect("memory db");
    db.execute_batch(
        "CREATE TABLE sync_queue (
            queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT,
            payload TEXT NOT NULL,
            target_server TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL,
            max_attempts INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        INSERT INTO sync_queue (atome_id, payload, target_server, status, attempts, max_attempts, created_at)
        VALUES ('tool_ui.home.panel', '{}', 'fastify', 'pending', 0, 5, datetime('now'));
        INSERT INTO sync_queue (atome_id, payload, target_server, status, attempts, max_attempts, created_at)
        VALUES ('project-user', '{}', 'fastify', 'pending', 0, 5, datetime('now'));",
    )
    .expect("queue fixtures");
    assert_eq!(prune_local_only_queue(&db), Ok(1));
    let remaining: String = db
        .query_row("SELECT atome_id FROM sync_queue", [], |row| row.get(0))
        .expect("remaining sync item");
    assert_eq!(remaining, "project-user");
}

#[test]
fn interrupted_delivery_is_requeued_on_worker_start() {
    let db = Connection::open_in_memory().expect("memory db");
    db.execute_batch(
        "CREATE TABLE sync_queue (
            queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT,
            payload TEXT NOT NULL,
            target_server TEXT NOT NULL,
            status TEXT NOT NULL,
            next_retry_at TEXT
        );
        INSERT INTO sync_queue (atome_id, payload, target_server, status, next_retry_at)
        VALUES ('project', '{}', 'fastify', 'syncing', '2099-01-01T00:00:00Z');",
    )
    .expect("queue fixture");
    assert_eq!(recover_interrupted_queue(&db), Ok(1));
    let recovered: (String, Option<String>) = db
        .query_row(
            "SELECT status, next_retry_at FROM sync_queue WHERE atome_id = 'project'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("recovered queue row");
    assert_eq!(recovered, ("pending".to_string(), None));
}

#[test]
fn outbound_event_replaces_local_actor_and_removes_local_identity_aliases() {
    let normalized = normalize_outbound_event(
        json!({
            "id": "event-1",
            "atome_id": "shape-1",
            "kind": "set",
            "actor": { "type": "user", "id": "local-user" },
            "payload": {
                "parent_id": "project-1",
                "props": {
                    "owner_id": "local-user",
                    "creator_id": "local-user",
                    "left": 12
                }
            }
        }),
        "local-user",
        "remote-user",
    )
    .expect("event must normalize");

    assert_eq!(normalized.pointer("/actor/id"), Some(&json!("remote-user")));
    assert_eq!(normalized.get("atome_id"), Some(&json!("shape-1")));
    assert_eq!(normalized.get("parent_id"), Some(&json!("project-1")));
    assert_eq!(normalized.pointer("/payload/props/left"), Some(&json!(12)));
    assert!(normalized.pointer("/payload/props/owner_id").is_none());
    assert!(normalized.pointer("/payload/props/creator_id").is_none());
}

#[test]
fn outbound_user_profile_targets_the_remote_principal() {
    let normalized = normalize_outbound_event(
        json!({
            "id": "profile-event",
            "atome_id": "local-user",
            "kind": "set",
            "actor": { "type": "user", "id": "local-user" },
            "payload": { "props": { "eve_profile": { "access": "public" } } }
        }),
        "local-user",
        "remote-user",
    )
    .expect("profile event must normalize");

    assert_eq!(normalized.get("atome_id"), Some(&json!("remote-user")));
    assert_eq!(normalized.pointer("/actor/id"), Some(&json!("remote-user")));
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
        );",
    )
    .expect("queue schema");
    for index in 0..75 {
        db.execute(
            "INSERT INTO sync_queue (payload, target_server, status, attempts, max_attempts, created_at)
             VALUES (?1, 'fastify', 'pending', 0, 5, ?2)",
            rusqlite::params![
                json!({"id":format!("other-{index}"),"actor":{"id":"other"}}).to_string(),
                format!("2026-08-14T00:00:{index:02}Z")
            ],
        )
        .expect("other queue item");
    }
    db.execute(
        "INSERT INTO sync_queue (payload, target_server, status, attempts, max_attempts, created_at)
         VALUES (?1, 'fastify', 'pending', 0, 5, '2026-08-14T01:00:00Z')",
        [json!({"id":"active","actor":{"id":"active-user"}}).to_string()],
    )
    .expect("active queue item");

    let items =
        list_sync_queue_for_actor(&db, "fastify", "active-user", 50).expect("actor queue");
    assert_eq!(items.len(), 1);
    let event: serde_json::Value = serde_json::from_str(&items[0].payload).unwrap();
    assert_eq!(event.get("id"), Some(&json!("active")));
}
