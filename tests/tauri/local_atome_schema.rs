use super::*;
const ADOLE_SCHEMA_SQL: &str = include_str!("../../database/schema.sql");

#[test]
fn legacy_news_survives_upgrade_before_thread_indexes() {
    let database = Connection::open_in_memory().unwrap();
    database
        .execute_batch(
            "CREATE TABLE news_publications (
            news_id TEXT PRIMARY KEY, author_id TEXT NOT NULL, project_id TEXT,
            title TEXT, summary TEXT, tags_json TEXT NOT NULL DEFAULT '[]',
            audience_json TEXT NOT NULL DEFAULT '\"all\"', payload_json TEXT,
            media_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE news_reports (
            news_id TEXT NOT NULL, reporter_id TEXT NOT NULL, reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY(news_id, reporter_id)
         );
         INSERT INTO news_publications (news_id, author_id, title, payload_json)
            VALUES ('publication', 'owner', 'Kept title', '{\"sentinel\":true}');
         INSERT INTO news_reports (news_id, reporter_id, reason)
            VALUES ('publication', 'reader', 'Kept report');",
        )
        .unwrap();
    for _ in 0..2 {
        prepare_legacy_columns(&database).unwrap();
        database
            .execute_batch(ADOLE_SCHEMA_SQL)
            .expect("canonical schema over legacy news");
    }
    let kept: (String, String, Option<String>, Option<i64>) = database.query_row(
        "SELECT title, payload_json, thread_ref, anchor_ms FROM news_publications WHERE news_id='publication'",
        [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    ).unwrap();
    assert_eq!(
        kept,
        (
            "Kept title".into(),
            "{\"sentinel\":true}".into(),
            None,
            None
        )
    );
    let report: (String, Option<String>) = database
        .query_row(
            "SELECT reason, dismissed_at FROM news_reports WHERE news_id='publication'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(report, ("Kept report".into(), None));
    let index_columns = database
        .prepare("PRAGMA index_info(idx_news_publications_thread)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(2))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(index_columns, ["thread_ref", "root_id"]);
    for column in [
        "thread_ref",
        "root_id",
        "parent_id",
        "anchor_ms",
        "retired_at",
        "replies_closed_at",
    ] {
        database
            .prepare(&format!("SELECT {column} FROM news_publications"))
            .unwrap();
    }
}

#[test]
fn fresh_and_current_schemas_prepare_idempotently() {
    let database = Connection::open_in_memory().unwrap();
    prepare_legacy_columns(&database).unwrap();
    database.execute_batch(ADOLE_SCHEMA_SQL).unwrap();
    database.execute("INSERT INTO news_publications (news_id, author_id, thread_ref, root_id, anchor_ms) VALUES ('reply', 'owner', 'thread', 'origin', 89)", []).unwrap();
    for _ in 0..2 {
        prepare_legacy_columns(&database).unwrap();
        database.execute_batch(ADOLE_SCHEMA_SQL).unwrap();
    }
    let preserved: (String, String, i64) = database
        .query_row(
            "SELECT thread_ref, root_id, anchor_ms FROM news_publications WHERE news_id='reply'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(preserved, ("thread".into(), "origin".into(), 89));
}

#[test]
fn legacy_auth_device_keys_gain_v1_columns_before_canonical_indexes() {
    let database = Connection::open_in_memory().expect("memory database");
    database
        .execute_batch(
            "CREATE TABLE auth_device_keys (
                key_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, public_key TEXT NOT NULL,
                enrolled_ms INTEGER NOT NULL, restricted_until_ms INTEGER NOT NULL, revoked_ms INTEGER
             );
             INSERT INTO auth_device_keys VALUES ('legacy-key', 'user', '{}', 1, 1, NULL);",
        )
        .expect("legacy auth_device_keys schema");
    prepare_legacy_columns(&database).expect("pre-schema migration");
    database
        .execute_batch(ADOLE_SCHEMA_SQL)
        .expect("canonical schema over a legacy key table");
    let role: String = database
        .query_row(
            "SELECT key_role FROM auth_device_keys WHERE key_id = 'legacy-key'",
            [],
            |row| row.get(0),
        )
        .expect("legacy key kept");
    assert_eq!(role, "session");
}

#[test]
fn legacy_events_gain_sync_columns_before_canonical_indexes() {
    let database = Connection::open_in_memory().expect("memory database");
    database
        .execute_batch(
            "CREATE TABLE events (
                id TEXT PRIMARY KEY, ts TEXT NOT NULL, atome_id TEXT,
                project_id TEXT, kind TEXT NOT NULL, payload TEXT,
                actor TEXT, tx_id TEXT, gesture_id TEXT
             );
             INSERT INTO events (id, ts, kind) VALUES ('legacy-event', '2026-08-28T00:00:00Z', 'set');",
        )
        .expect("legacy events schema");

    prepare_legacy_columns(&database).expect("pre-schema migration");
    database
        .execute_batch(ADOLE_SCHEMA_SQL)
        .expect("canonical schema after migration");

    let columns = database
        .prepare("PRAGMA table_info(events)")
        .expect("events columns")
        .query_map([], |row| row.get::<_, String>(1))
        .expect("events column rows")
        .filter_map(Result::ok)
        .collect::<HashSet<_>>();
    for required in [
        "stream_id",
        "sequence",
        "source",
        "lww_decisions",
        "projection",
    ] {
        assert!(columns.contains(required), "missing {required}");
    }
    let historical_count: i64 = database
        .query_row(
            "SELECT COUNT(*) FROM events WHERE id = 'legacy-event'",
            [],
            |row| row.get(0),
        )
        .expect("historical event count");
    assert_eq!(historical_count, 1);
}
