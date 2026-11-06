//! The central database's schema, brought up at the server's start as Fastify's
//! `initDatabase` brings it up (database/adole_db_core.js#openDatabase, database/driver.js and
//! database/adole_schema_migrations.js with the schema modules it runs, ported): the
//! connection's pragmas, the columns an older file lacks, `database/schema.sql` and
//! `database/auth_security_schema.sql` read from the project root (the one text Tauri, the vaults
//! and the tests share), the server's own tables, the data migrations, then the chain's
//! fingerprint in `PRAGMA user_version`, which skips the whole chain at the next start when
//! nothing it is made of changed.
use crate::social::conditions;
use atome_store::{ensure_legacy_columns, prepare_legacy_columns};
use rusqlite::{Connection, OptionalExtension, params, types::Value as SqlValue};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, path::Path, time::Duration};

mod service_tables;
mod social_tables;

// What the chain is made of besides the two schema files: a change to any of them runs it again
// (the store's file holds the column lists it shares with the vaults).
const CHAIN_SOURCES: [&str; 4] = [
    include_str!("mod.rs"),
    include_str!("social_tables.rs"),
    include_str!("service_tables.rs"),
    include_str!("../../../../engines/atome-store/src/legacy_columns.rs"),
];

// `users_view` dropped and made again in one transaction: between two separate statements the
// view every account lookup reads would not exist (`refreshUsersView`).
const USERS_VIEW: &str = r#"BEGIN;
        DROP VIEW IF EXISTS users_view;
        CREATE VIEW users_view AS
        SELECT a.atome_id AS user_id,
            MAX(CASE WHEN p.particle_key = 'username' THEN JSON_EXTRACT(p.particle_value, '$') END) AS username,
            MAX(CASE WHEN p.particle_key = 'password_hash' THEN JSON_EXTRACT(p.particle_value, '$') END) AS password_hash,
            a.created_at, a.updated_at, a.last_sync, a.created_source
        FROM atomes a LEFT JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'user' AND a.deleted_at IS NULL
        GROUP BY a.atome_id;
    COMMIT;"#;

// The document a stored condition that no longer validates is replaced by (`migratePermissionConditions`).
const UNMIGRATABLE_CONDITIONS: &str =
    r#"{"schemaVersion":1,"invalid":true,"reason":"legacy_condition_unmigratable"}"#;

/// Brings the central database at `path` (created when missing) to the shape Fastify's
/// `initDatabase` leaves it in, reading the schema files under `project_root/database`. Call it
/// once, before anything opens the file. The chain runs only when the file's `user_version`
/// is not this chain's fingerprint.
pub fn prepare(path: &Path, project_root: &Path) -> Result<(), String> {
    let read = |name: &str| {
        let file = project_root.join("database").join(name);
        std::fs::read_to_string(&file)
            .map_err(|e| format!("central_schema_read_failed:{}:{e}", file.display()))
    };
    let schema = read("schema.sql")?;
    let auth_schema = read("auth_security_schema.sql")?;
    if let Some(directory) = path.parent() {
        std::fs::create_dir_all(directory)
            .map_err(|e| format!("central_database_open_failed:{e}"))?;
    }
    let failed = |e: rusqlite::Error| format!("central_schema_failed:{e}");
    let db = Connection::open(path).map_err(|e| format!("central_database_open_failed:{e}"))?;
    // database/driver.js: better-sqlite3's five seconds of patience, foreign keys, WAL.
    db.busy_timeout(Duration::from_secs(5)).map_err(failed)?;
    db.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(failed)?;
    let journal: String = db
        .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
        .map_err(failed)?;
    if journal != "wal" {
        return Err(format!("central_schema_wal_refused:{journal}"));
    }
    let expected = fingerprint(&schema, &auth_schema);
    let current: i32 = db
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(failed)?;
    if current == expected {
        return Ok(());
    }
    migrate(&db, &schema, &auth_schema).map_err(failed)?;
    db.execute_batch(&format!("PRAGMA user_version = {expected};"))
        .map_err(failed)
}

// A SHA-256 of the chain's sources, in the negative half of `user_version`: Fastify writes its
// own fingerprint (of the JS sources) in the positive half and 0 is a new file, so neither
// takes the other's mark for its own. Each, finding the other's, runs its idempotent chain again.
fn fingerprint(schema: &str, auth_schema: &str) -> i32 {
    let mut hash = Sha256::new();
    for source in [schema, auth_schema].into_iter().chain(CHAIN_SOURCES) {
        hash.update(source.as_bytes());
        hash.update([0]);
    }
    let digest = hash.finalize();
    -i32::from_be_bytes([digest[0] & 0x7f, digest[1], digest[2], digest[3]]) - 1
}

// `openDatabase`'s chain then `runAdoleSchemaMigrations`, in their order: an older table gains
// its columns before the canonical indexes name them, and once more after the schema files.
fn migrate(db: &Connection, schema: &str, auth_schema: &str) -> rusqlite::Result<()> {
    prepare_columns(db)?;
    db.execute_batch(schema)?;
    db.execute_batch(auth_schema)?;
    ensure_legacy_columns(
        db,
        "auth_push_installations",
        &[(
            "provider",
            "ALTER TABLE auth_push_installations ADD COLUMN provider TEXT NOT NULL DEFAULT 'apns'",
        )],
    )?;
    prepare_columns(db)?;
    migrate_permission_conditions(db)?;
    sync_event_tables(db)?;
    run(db, &social_tables::COMMUNICATION)?;
    backfill_event_sequences(db)?;
    principal_identity_tables(db)?;
    run(db, &service_tables::SERVICES)?;
    db.execute_batch(USERS_VIEW)
}

fn run(db: &Connection, statements: &[&str]) -> rusqlite::Result<()> {
    statements
        .iter()
        .try_for_each(|statement| db.execute_batch(statement))
}

// `prepareAdoleSchemaColumns`: each column added only to a table that exists (a new file
// receives the whole table from the schema). The events' first four come before the store's
// list so that an old table gains them in the JS order.
fn prepare_columns(db: &Connection) -> rusqlite::Result<()> {
    ensure_legacy_columns(
        db,
        "events",
        &[
            (
                "project_id",
                "ALTER TABLE events ADD COLUMN project_id TEXT",
            ),
            ("actor", "ALTER TABLE events ADD COLUMN actor TEXT"),
            ("tx_id", "ALTER TABLE events ADD COLUMN tx_id TEXT"),
            (
                "gesture_id",
                "ALTER TABLE events ADD COLUMN gesture_id TEXT",
            ),
        ],
    )?;
    prepare_legacy_columns(db)?;
    ensure_legacy_columns(
        db,
        "permissions",
        &[
            (
                "can_create",
                "ALTER TABLE permissions ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0",
            ),
            (
                "share_mode",
                "ALTER TABLE permissions ADD COLUMN share_mode TEXT DEFAULT 'real-time'",
            ),
            (
                "conditions",
                "ALTER TABLE permissions ADD COLUMN conditions TEXT",
            ),
        ],
    )?;
    ensure_legacy_columns(
        db,
        "snapshots",
        &[
            (
                "project_id",
                "ALTER TABLE snapshots ADD COLUMN project_id TEXT",
            ),
            (
                "state_blob",
                "ALTER TABLE snapshots ADD COLUMN state_blob TEXT",
            ),
            ("label", "ALTER TABLE snapshots ADD COLUMN label TEXT"),
            ("actor", "ALTER TABLE snapshots ADD COLUMN actor TEXT"),
        ],
    )?;
    ensure_legacy_columns(
        db,
        "particles_versions",
        &[(
            "event_id",
            "ALTER TABLE particles_versions ADD COLUMN event_id TEXT",
        )],
    )?;
    // A projection made before it had an owner takes its atome's, once, when the column comes.
    let (columns, owner): (i64, Option<i64>) = db.query_row(
        "SELECT COUNT(*), SUM(name = 'owner_id') FROM pragma_table_info('state_current')",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if columns > 0 && owner == Some(0) {
        db.execute_batch(
            "ALTER TABLE state_current ADD COLUMN owner_id TEXT;
             UPDATE state_current SET owner_id = (SELECT owner_id FROM atomes WHERE atomes.atome_id = state_current.atome_id) WHERE owner_id IS NULL;",
        )?;
    }
    Ok(())
}

// Every stored condition rewritten as its normalized document; one that no longer validates
// is kept as an invalid document, which denies. An empty one is no condition and becomes NULL:
// Fastify stored it as the text `null`, which the next start turned into a denying document.
fn migrate_permission_conditions(db: &Connection) -> rusqlite::Result<()> {
    let rows = db
        .prepare("SELECT permission_id, conditions FROM permissions WHERE conditions IS NOT NULL")?
        .query_map([], |row| {
            Ok((row.get::<_, SqlValue>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (permission, stored) in rows {
        let migrated = match conditions::normalize(Some(&JsonValue::String(stored.clone()))) {
            Ok(None) => {
                db.execute(
                    "UPDATE permissions SET conditions = NULL WHERE permission_id = ?",
                    params![permission],
                )?;
                continue;
            }
            Ok(Some(document)) => serde_json::to_string(&document)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?,
            Err(_) => UNMIGRATABLE_CONDITIONS.to_string(),
        };
        if migrated != stored {
            db.execute(
                "UPDATE permissions SET conditions = ? WHERE permission_id = ?",
                params![migrated, permission],
            )?;
        }
    }
    Ok(())
}

// `ensureSyncEventTables`: the share requests gain the rights model's sharing chain and their
// readable and writable property lists, the directory's profiles their face and card.
fn sync_event_tables(db: &Connection) -> rusqlite::Result<()> {
    run(db, &social_tables::SYNC_STREAMS)?;
    ensure_legacy_columns(
        db,
        "sync_share_requests",
        &[
            (
                "parent_share_id",
                "ALTER TABLE sync_share_requests ADD COLUMN parent_share_id TEXT",
            ),
            (
                "readable_properties_json",
                "ALTER TABLE sync_share_requests ADD COLUMN readable_properties_json TEXT",
            ),
            (
                "writable_properties_json",
                "ALTER TABLE sync_share_requests ADD COLUMN writable_properties_json TEXT",
            ),
        ],
    )?;
    run(db, &social_tables::SHARES)?;
    ensure_legacy_columns(
        db,
        "directory_public_profiles",
        &[
            (
                "user_face",
                "ALTER TABLE directory_public_profiles ADD COLUMN user_face TEXT",
            ),
            (
                "card_json",
                "ALTER TABLE directory_public_profiles ADD COLUMN card_json TEXT",
            ),
        ],
    )?;
    run(db, &social_tables::DIRECTORY_EVENTS)
}

// An event written before streams existed joins its scope's stream (the project's, else the
// atome's, else the global one), numbered after the stream's last sequence, oldest first.
fn backfill_event_sequences(db: &Connection) -> rusqlite::Result<()> {
    let rows = db
        .prepare(
            "SELECT id, atome_id, project_id FROM events
             WHERE stream_id IS NULL OR sequence IS NULL
             ORDER BY ts ASC, id ASC",
        )?
        .query_map([], |row| {
            Ok((
                row.get::<_, SqlValue>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut streams: HashMap<String, String> = HashMap::new();
    for (event, atome, project) in rows {
        let atome = atome.filter(|id| !id.is_empty());
        let project = project.filter(|id| !id.is_empty());
        let scope = match (&project, &atome) {
            (Some(project), _) => format!("project:{project}"),
            (None, Some(atome)) => format!("atome:{atome}"),
            (None, None) => "global".to_string(),
        };
        let stream = match streams.get(&scope) {
            Some(stream) => stream.clone(),
            None => {
                let stream = db
                    .query_row(
                        "SELECT stream_id FROM sync_streams WHERE scope_key = ?",
                        [&scope],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .optional()?
                    .flatten()
                    .filter(|id| !id.is_empty())
                    .unwrap_or_else(|| format!("legacy:{scope}"));
                db.execute(
                    "INSERT OR IGNORE INTO sync_streams (stream_id, scope_key, project_id, atome_id)
                     VALUES (?, ?, ?, ?)",
                    params![
                        stream,
                        scope,
                        project,
                        if project.is_some() { None } else { atome }
                    ],
                )?;
                streams.insert(scope, stream.clone());
                stream
            }
        };
        let last = db
            .query_row(
                "SELECT last_sequence FROM sync_stream_sequences WHERE stream_id = ?",
                [&stream],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        let sequence = last.unwrap_or(0) + 1;
        db.execute(
            "INSERT INTO sync_stream_sequences (stream_id, last_sequence) VALUES (?, ?)
             ON CONFLICT(stream_id) DO UPDATE SET last_sequence = excluded.last_sequence",
            params![stream, sequence],
        )?;
        db.execute(
            "UPDATE events SET stream_id = ?, sequence = ? WHERE id = ?",
            params![stream, sequence, event],
        )?;
    }
    db.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_events_stream_sequence ON events(stream_id, sequence)",
    )
}

// `ensurePrincipalIdentityTables`. A national spelling (`06…`) escaped the unique index beside
// its E.164 twin and never matched a lookup: its region is unknown, so it is retired, never
// rewritten, and the record stays for audit.
fn principal_identity_tables(db: &Connection) -> rusqlite::Result<()> {
    run(db, &service_tables::PHONE_CREDENTIALS)?;
    let active = db
        .prepare(
            "SELECT credential_id, normalized_phone FROM principal_phone_credentials WHERE revoked_at IS NULL",
        )?
        .query_map([], |row| Ok((row.get::<_, SqlValue>(0)?, row.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let now = crate::vault_router::js::iso(chrono::Utc::now().timestamp_millis());
    for (credential, phone) in active {
        if crate::auth::device_sessions::e164(Some(&JsonValue::String(phone))).is_none() {
            db.execute(
                "UPDATE principal_phone_credentials SET revoked_at = ?, revoked_reason = 'not_e164', updated_at = ?
                 WHERE credential_id = ?",
                params![now, now, credential],
            )?;
        }
    }
    run(db, &service_tables::IDENTITY)?;
    ensure_legacy_columns(
        db,
        "guest_adoption_payloads",
        &[(
            "profile_event_json",
            "ALTER TABLE guest_adoption_payloads ADD COLUMN profile_event_json TEXT",
        )],
    )?;
    run(db, &service_tables::GUEST_ADOPTION_FILES)
}
