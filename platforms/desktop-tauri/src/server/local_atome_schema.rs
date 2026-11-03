use rusqlite::{Connection, OptionalExtension};
use std::collections::HashSet;

pub(crate) fn prepare_legacy_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    ensure_event_sync_columns(conn)?;
    ensure_auth_device_key_columns(conn)?;
    ensure_auth_recovery_columns(conn)?;
    ensure_legacy_columns(
        conn,
        "news_publications",
        &[
            (
                "thread_ref",
                "ALTER TABLE news_publications ADD COLUMN thread_ref TEXT",
            ),
            (
                "root_id",
                "ALTER TABLE news_publications ADD COLUMN root_id TEXT",
            ),
            (
                "parent_id",
                "ALTER TABLE news_publications ADD COLUMN parent_id TEXT",
            ),
            (
                "anchor_ms",
                "ALTER TABLE news_publications ADD COLUMN anchor_ms INTEGER",
            ),
            (
                "retired_at",
                "ALTER TABLE news_publications ADD COLUMN retired_at TEXT",
            ),
            (
                "replies_closed_at",
                "ALTER TABLE news_publications ADD COLUMN replies_closed_at TEXT",
            ),
        ],
    )?;
    ensure_legacy_columns(
        conn,
        "news_reports",
        &[(
            "dismissed_at",
            "ALTER TABLE news_reports ADD COLUMN dismissed_at TEXT",
        )],
    )
}

// Adds the columns a table created by an older schema lacks (no-op when the
// table does not exist yet: the canonical schema creates it whole).
fn ensure_legacy_columns(
    conn: &Connection,
    table: &str,
    columns: &[(&str, &str)],
) -> Result<(), rusqlite::Error> {
    let exists = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !exists {
        return Ok(());
    }

    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    let names = rows.collect::<Result<HashSet<_>, _>>()?;
    for (column, ddl) in columns {
        if !names.contains(*column) {
            conn.execute(ddl, [])?;
        }
    }
    Ok(())
}

fn ensure_event_sync_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    ensure_legacy_columns(
        conn,
        "events",
        &[
            ("stream_id", "ALTER TABLE events ADD COLUMN stream_id TEXT"),
            ("sequence", "ALTER TABLE events ADD COLUMN sequence INTEGER"),
            ("source", "ALTER TABLE events ADD COLUMN source TEXT"),
            (
                "lww_decisions",
                "ALTER TABLE events ADD COLUMN lww_decisions TEXT",
            ),
            (
                "projection",
                "ALTER TABLE events ADD COLUMN projection TEXT",
            ),
        ],
    )
}

fn ensure_auth_device_key_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    ensure_legacy_columns(conn, "auth_device_keys", &[
        ("key_role", "ALTER TABLE auth_device_keys ADD COLUMN key_role TEXT NOT NULL DEFAULT 'session'"),
        ("device_id", "ALTER TABLE auth_device_keys ADD COLUMN device_id TEXT"),
        ("assurance", "ALTER TABLE auth_device_keys ADD COLUMN assurance TEXT NOT NULL DEFAULT 'software'"),
        ("device_class", "ALTER TABLE auth_device_keys ADD COLUMN device_class TEXT NOT NULL DEFAULT 'personal'"),
        ("platform", "ALTER TABLE auth_device_keys ADD COLUMN platform TEXT"),
        ("label", "ALTER TABLE auth_device_keys ADD COLUMN label TEXT"),
        ("enrolled_by", "ALTER TABLE auth_device_keys ADD COLUMN enrolled_by TEXT"),
        ("credential_id", "ALTER TABLE auth_device_keys ADD COLUMN credential_id TEXT"),
        ("sign_count", "ALTER TABLE auth_device_keys ADD COLUMN sign_count INTEGER NOT NULL DEFAULT 0"),
        ("last_seen_ms", "ALTER TABLE auth_device_keys ADD COLUMN last_seen_ms INTEGER"),
        ("connection_proof", "ALTER TABLE auth_device_keys ADD COLUMN connection_proof INTEGER NOT NULL DEFAULT 0"),
    ])
}

// A recovery code names its account by itself (`lookup`, indexed by the canonical
// schema) and carries the account's wrapped backup keys; pairing seals them too.
// Mirrors database/adole_schema_migrations.js#prepareAdoleSchemaColumns.
fn ensure_auth_recovery_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    ensure_legacy_columns(conn, "auth_recovery_codes", &[
        ("lookup", "ALTER TABLE auth_recovery_codes ADD COLUMN lookup TEXT"),
        ("backup_keys", "ALTER TABLE auth_recovery_codes ADD COLUMN backup_keys TEXT"),
    ])?;
    ensure_legacy_columns(conn, "auth_pair_requests", &[
        ("requester_backup_key", "ALTER TABLE auth_pair_requests ADD COLUMN requester_backup_key TEXT"),
        ("backup_keys", "ALTER TABLE auth_pair_requests ADD COLUMN backup_keys TEXT"),
    ])
}

#[cfg(test)]
#[path = "../../../../tests/tauri/local_atome_schema.rs"]
mod tests;
