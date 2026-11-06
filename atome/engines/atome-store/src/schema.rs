// The canonical schema (database/schema.sql) and the columns older databases lack.
use super::*;

/// Brings a connection to the canonical schema: foreign keys, the columns an
/// older database lacks (before the canonical indexes need them), then
/// `database/schema.sql`. The journal mode is the opener's: a vault process keeps
/// WAL, the iOS app group cannot (an idle WAL handle keeps its locks there).
pub fn prepare_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    crate::legacy_columns::prepare_legacy_columns(conn)?;
    conn.execute_batch(ADOLE_SCHEMA_SQL)?;
    ensure_permissions_columns(conn)?;
    ensure_snapshot_columns(conn)?;
    ensure_state_current_columns(conn)?;
    Ok(())
}

pub const ADOLE_SCHEMA_SQL: &str = include_str!("../../../../database/schema.sql");
pub const ADOLE_SCHEMA_TABLES: &str = "atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state";

pub fn schema_hash() -> String {
    let mut hasher = Sha256::new();
    hasher.update(ADOLE_SCHEMA_SQL.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn schema_tables() -> &'static str {
    ADOLE_SCHEMA_TABLES
}

pub fn ensure_permissions_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(permissions)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut names = HashSet::new();
    for name in rows.filter_map(|r| r.ok()) {
        names.insert(name);
    }

    if !names.contains("can_create") {
        conn.execute(
            "ALTER TABLE permissions ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    if !names.contains("share_mode") {
        conn.execute(
            "ALTER TABLE permissions ADD COLUMN share_mode TEXT DEFAULT 'real-time'",
            [],
        )?;
    }
    if !names.contains("conditions") {
        conn.execute("ALTER TABLE permissions ADD COLUMN conditions TEXT", [])?;
    }

    Ok(())
}

pub fn ensure_snapshot_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(snapshots)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut names = HashSet::new();
    for name in rows.filter_map(|r| r.ok()) {
        names.insert(name);
    }

    if !names.contains("project_id") {
        conn.execute("ALTER TABLE snapshots ADD COLUMN project_id TEXT", [])?;
    }
    if !names.contains("state_blob") {
        conn.execute("ALTER TABLE snapshots ADD COLUMN state_blob TEXT", [])?;
    }
    if !names.contains("label") {
        conn.execute("ALTER TABLE snapshots ADD COLUMN label TEXT", [])?;
    }
    if !names.contains("actor") {
        conn.execute("ALTER TABLE snapshots ADD COLUMN actor TEXT", [])?;
    }

    Ok(())
}

pub fn ensure_state_current_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(state_current)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut names = HashSet::new();
    for name in rows.filter_map(|r| r.ok()) {
        names.insert(name);
    }

    if !names.contains("owner_id") {
        conn.execute("ALTER TABLE state_current ADD COLUMN owner_id TEXT", [])?;
    }

    let _ = conn.execute(
        "UPDATE state_current
         SET owner_id = (
            SELECT owner_id FROM atomes WHERE atomes.atome_id = state_current.atome_id
         )
         WHERE owner_id IS NULL
           AND EXISTS (
             SELECT 1 FROM atomes
             WHERE atomes.atome_id = state_current.atome_id
               AND atomes.owner_id IS NOT NULL
           )",
        [],
    );

    Ok(())
}
