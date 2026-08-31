// =============================================================================
// LOCAL ATOME MODULE - ADOLE v3.0 storage for Tauri
// =============================================================================
// WebSocket-first operations with HTTP parity handlers.
// Schema: atomes + particles (unified with Fastify, source: database/schema.sql)
// =============================================================================
use crate::server::broadcast_sync_event;
use super::local_atome_sync_worker::{
    enqueue_sync_event, is_syncable_event, resolve_sync_source, resolve_sync_target,
    should_enqueue_sync,
};
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

macro_rules! println {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::println!($($arg)*);
        }
    };
}

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

const ADOLE_SCHEMA_SQL: &str = include_str!("../../../../database/schema.sql");
const ADOLE_SCHEMA_TABLES: &str =
    "atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state";

fn is_uuid_v4(value: &str) -> bool {
    Uuid::parse_str(value)
        .map(|uuid| uuid.get_version_num() == 4)
        .unwrap_or(false)
}

pub fn schema_hash() -> String {
    let mut hasher = Sha256::new();
    hasher.update(ADOLE_SCHEMA_SQL.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn schema_tables() -> &'static str {
    ADOLE_SCHEMA_TABLES
}

pub fn filter_sync_event_for_user(
    state: &LocalAtomeState,
    user_id: &str,
    payload: &JsonValue,
) -> Option<JsonValue> {
    let event_type = payload.get("type").and_then(|value| value.as_str())?;
    if !event_type.starts_with("atome:") && event_type != "atome-sync" {
        return None;
    }
    let atome_id = payload
        .get("atome_id")
        .or_else(|| payload.pointer("/atome/atome_id"))
        .and_then(|value| value.as_str())?;
    let db = state.db.lock().ok()?;
    let mut atome = payload.get("atome").cloned().unwrap_or(JsonValue::Null);
    if let Some(object) = atome.as_object_mut() {
        let source = object.get("properties").or_else(|| object.get("data")).cloned().unwrap_or_else(|| json!({}));
        let projected = source.as_object().map(|properties| {
            properties.iter().filter_map(|(key, value)| {
                super::local_atome_security::can_observe(&db, atome_id, user_id, key)
                    .then(|| (key.clone(), value.clone()))
            }).collect::<JsonMap<_, _>>()
        }).unwrap_or_default();
        if projected.is_empty() {
            return None;
        }
        object.insert("properties".to_string(), JsonValue::Object(projected.clone()));
        if object.contains_key("data") {
            object.insert("data".to_string(), JsonValue::Object(projected));
        }
    } else if !super::local_atome_security::can_read(&db, atome_id, user_id, None) {
        return None;
    }
    Some(json!({
        "type": "event",
        "eventType": event_type,
        "payload": {
            "atome_id": atome_id,
            "atome": atome
        },
        "timestamp": Utc::now().to_rfc3339()
    }))
}

// =============================================================================
// STATE & TYPES
// =============================================================================

#[derive(Clone)]
pub struct LocalAtomeState {
    pub db: Arc<Mutex<Connection>>,
    storage_root: PathBuf,
    pub recent_request_ids: Arc<Mutex<DedupeCache>>,
    pub recent_fingerprints: Arc<Mutex<FingerprintCache>>,
    pub(crate) remote_sync_credentials: Arc<Mutex<HashMap<String, RemoteSyncCredential>>>,
}

impl LocalAtomeState {
    pub(crate) fn storage_root(&self) -> &Path {
        &self.storage_root
    }
}

#[derive(Clone)]
pub(crate) struct RemoteSyncCredential {
    pub(crate) remote_user_id: String,
    pub(crate) token: String,
    pub(crate) remote_url: String,
    pub(crate) environment_fingerprint: String,
}

pub(crate) fn configure_remote_sync_credential(
    state: &LocalAtomeState,
    local_user_id: &str,
    remote_user_id: &str,
    token: &str,
    remote_url: &str,
    environment_fingerprint: &str,
) -> Result<(), String> {
    if local_user_id.trim().is_empty()
        || remote_user_id.trim().is_empty()
        || token.trim().is_empty()
        || remote_url.trim().is_empty()
    {
        return Err("invalid_remote_sync_credential".to_string());
    }
    let mut credentials = state
        .remote_sync_credentials
        .lock()
        .map_err(|_| "remote_sync_credentials_unavailable".to_string())?;
    credentials.insert(
        local_user_id.to_string(),
        RemoteSyncCredential {
            remote_user_id: remote_user_id.to_string(),
            token: token.to_string(),
            remote_url: remote_url.trim_end_matches('/').to_string(),
            environment_fingerprint: environment_fingerprint.to_string(),
        },
    );
    Ok(())
}

pub(crate) fn clear_remote_sync_credential(
    state: &LocalAtomeState,
    local_user_id: &str,
) -> Result<(), String> {
    let mut credentials = state
        .remote_sync_credentials
        .lock()
        .map_err(|_| "remote_sync_credentials_unavailable".to_string())?;
    credentials.remove(local_user_id);
    Ok(())
}

fn move_guest_downloads(storage_root: &Path, from_owner_id: &str, to_owner_id: &str) -> Result<(), String> {
    let source_root = storage_root.join("data").join("users").join(from_owner_id).join("Downloads");
    let target_root = storage_root.join("data").join("users").join(to_owner_id).join("Downloads");
    let mut pending = vec![(source_root.clone(), target_root.clone())];
    while let Some((source_dir, target_dir)) = pending.pop() {
        let entries = match std::fs::read_dir(&source_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            let source_path = entry.path();
            let target_path = target_dir.join(entry.file_name());
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_dir() {
                pending.push((source_path, target_path));
                continue;
            }
            if !kind.is_file() { return Err("guest_adoption_file_invalid".to_string()); }
            match std::fs::metadata(&target_path) {
                Ok(_) => return Err("guest_adoption_file_collision".to_string()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
            std::fs::rename(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AtomeData {
    pub atome_id: String,
    pub atome_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator_id: Option<String>,
    pub data: serde_json::Value,
    pub sync_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WsResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "requestId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atomes: Option<Vec<AtomeData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
}

pub(crate) struct DedupeCache {
    order: VecDeque<String>,
    set: HashSet<String>,
    limit: usize,
}

impl DedupeCache {
    fn new(limit: usize) -> Self {
        Self {
            order: VecDeque::new(),
            set: HashSet::new(),
            limit,
        }
    }

    fn is_duplicate(&mut self, key: &str) -> bool {
        if key.is_empty() {
            return false;
        }
        if self.set.contains(key) {
            return true;
        }
        self.set.insert(key.to_string());
        self.order.push_back(key.to_string());
        while self.order.len() > self.limit {
            if let Some(oldest) = self.order.pop_front() {
                self.set.remove(&oldest);
            }
        }
        false
    }
}

pub(crate) struct FingerprintCache {
    order: VecDeque<(String, i64)>,
    map: HashMap<String, i64>,
    limit: usize,
    ttl_ms: i64,
}

impl FingerprintCache {
    fn new(limit: usize, ttl_ms: i64) -> Self {
        Self {
            order: VecDeque::new(),
            map: HashMap::new(),
            limit,
            ttl_ms,
        }
    }

    fn was_seen(&mut self, key: &str, now_ms: i64) -> bool {
        self.prune(now_ms);
        self.map
            .get(key)
            .map(|ts| now_ms - *ts <= self.ttl_ms)
            .unwrap_or(false)
    }

    fn remember(&mut self, key: &str, now_ms: i64) {
        self.prune(now_ms);
        self.map.insert(key.to_string(), now_ms);
        self.order.push_back((key.to_string(), now_ms));
        while self.map.len() > self.limit {
            if let Some((oldest, ts)) = self.order.pop_front() {
                if self.map.get(&oldest) == Some(&ts) {
                    self.map.remove(&oldest);
                }
            }
        }
    }

    fn prune(&mut self, now_ms: i64) {
        while let Some((key, ts)) = self.order.front().cloned() {
            if now_ms - ts <= self.ttl_ms && self.map.len() <= self.limit {
                break;
            }
            self.order.pop_front();
            if self.map.get(&key) == Some(&ts) {
                self.map.remove(&key);
            }
        }
    }
}

fn sync_debug_enabled() -> bool {
    std::env::var("SYNC_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn sync_debug(message: &str) {
    if sync_debug_enabled() {
        println!("[SyncDebug] {}", message);
    }
}

#[cfg(test)]
fn is_guest_workspace_principal(db: &Connection, user_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1 AND status = 'active' LIMIT 1",
        rusqlite::params![user_id],
        |_| Ok(()),
    )
    .is_ok()
}

fn is_guest_workspace_or_adopted_principal(db: &Connection, user_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1 AND status IN ('active', 'adopted') LIMIT 1",
        rusqlite::params![user_id],
        |_| Ok(()),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

fn should_dedupe_request_id(state: &LocalAtomeState, request_id: &Option<String>) -> bool {
    let Some(id) = request_id.as_deref() else {
        return false;
    };
    let mut cache = match state.recent_request_ids.lock() {
        Ok(cache) => cache,
        Err(_) => return false,
    };
    cache.is_duplicate(id)
}

fn create_fingerprint(
    atome_id: &str,
    atome_type: &str,
    parent_id: Option<&str>,
    owner_id: &str,
    data: &JsonValue,
) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    atome_id.hash(&mut hasher);
    atome_type.hash(&mut hasher);
    parent_id.unwrap_or("").hash(&mut hasher);
    owner_id.hash(&mut hasher);
    serde_json::to_string(data)
        .unwrap_or_default()
        .hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

// =============================================================================
// DATABASE INITIALIZATION - ADOLE v3.0 Schema
// UNIFIED with Fastify (database/schema.sql) - Same 9 tables + views
// =============================================================================

pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("adole.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    let _ = conn.execute_batch("PRAGMA journal_mode = WAL;");

    // A legacy Tauri database already owns `events`, so CREATE TABLE IF NOT
    // EXISTS cannot add the sync envelope columns. Add them before executing
    // the canonical schema because that schema creates the stream/sequence
    // index immediately afterwards.
    ensure_event_sync_columns(&conn)?;
    conn.execute_batch(ADOLE_SCHEMA_SQL)?;

    ensure_permissions_columns(&conn)?;
    ensure_snapshot_columns(&conn)?;
    ensure_state_current_columns(&conn)?;
    super::local_atome_remote_projection::ensure_schema(&conn)?;

    println!(
        "ADOLE v3.0 database initialized (schema hash={}): {:?}",
        schema_hash(),
        db_path
    );

    Ok(conn)
}

fn ensure_event_sync_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let events_exists = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !events_exists {
        return Ok(());
    }

    let mut statement = conn.prepare("PRAGMA table_info(events)")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    let names = rows.filter_map(Result::ok).collect::<HashSet<_>>();
    for (column, ddl) in [
        ("stream_id", "ALTER TABLE events ADD COLUMN stream_id TEXT"),
        ("sequence", "ALTER TABLE events ADD COLUMN sequence INTEGER"),
        ("source", "ALTER TABLE events ADD COLUMN source TEXT"),
        ("lww_decisions", "ALTER TABLE events ADD COLUMN lww_decisions TEXT"),
        ("projection", "ALTER TABLE events ADD COLUMN projection TEXT"),
    ] {
        if !names.contains(column) {
            conn.execute(ddl, [])?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod event_sync_schema_migration_tests {
    use super::*;

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

        ensure_event_sync_columns(&database).expect("pre-schema migration");
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
        for required in ["stream_id", "sequence", "source", "lww_decisions", "projection"] {
            assert!(columns.contains(required), "missing {required}");
        }
        let historical_count: i64 = database
            .query_row("SELECT COUNT(*) FROM events WHERE id = 'legacy-event'", [], |row| row.get(0))
            .expect("historical event count");
        assert_eq!(historical_count, 1);
    }
}

fn ensure_permissions_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
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

fn ensure_snapshot_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
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

fn ensure_state_current_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
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

// =============================================================================
// WEBSOCKET MESSAGE HANDLER
// =============================================================================

pub async fn handle_atome_message(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    if matches!(
        action,
        "create" | "update" | "delete" | "soft-delete" | "alter"
    ) {
        if should_dedupe_request_id(state, &request_id) {
            sync_debug(&format!(
                "dedupe request_id action={} request_id={:?} user_id={}",
                action, request_id, user_id
            ));
            return WsResponse {
                msg_type: "atome-response".into(),
                request_id,
                success: true,
                error: None,
                data: None,
                atomes: None,
                count: None,
            };
        }
    }

    match action {
        "create" => handle_create(message, user_id, state, request_id).await,
        "get" => handle_get(message, user_id, state, request_id).await,
        "list" => handle_list(message, user_id, state, request_id).await,
        "update" => handle_update(message, user_id, state, request_id).await,
        "delete" | "soft-delete" => handle_delete(message, user_id, state, request_id).await,
        "alter" => handle_alter(message, user_id, state, request_id).await,
        "transfer-owner" => handle_transfer_owner(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

async fn handle_transfer_owner(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let from_owner_id = message
        .get("fromOwnerId")
        .or_else(|| message.get("from_owner_id"))
        .or_else(|| message.get("fromOwner"))
        .and_then(|v| v.as_str());
    let to_owner_id = message
        .get("toOwnerId")
        .or_else(|| message.get("to_owner_id"))
        .or_else(|| message.get("toOwner"))
        .and_then(|v| v.as_str());
    let include_creator = message
        .get("includeCreator")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let adoption_confirmed = message
        .get("adoption_confirmed")
        .or_else(|| message.get("adoptionConfirmed"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let adoption_operation = message
        .get("operation_id")
        .or_else(|| message.get("operationId"))
        .and_then(|v| v.as_str())
        .filter(|value| !value.trim().is_empty());

    let from_owner_id = match from_owner_id {
        Some(id) if !id.is_empty() => id,
        _ => return error_response(request_id, "Missing from_owner_id"),
    };
    let to_owner_id = match to_owner_id {
        Some(id) if !id.is_empty() => id,
        _ => return error_response(request_id, "Missing to_owner_id"),
    };

    if to_owner_id != user_id {
        return error_response(
            request_id,
            "Access denied - target owner must be current user",
        );
    }

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let source_is_guest = is_guest_workspace_or_adopted_principal(&db, from_owner_id);
    let guest_workspace = from_owner_id != user_id && source_is_guest;
    if from_owner_id != user_id && !guest_workspace {
        return error_response(request_id, "Access denied - source owner must be an active guest workspace");
    }
    if guest_workspace && !adoption_confirmed {
        return error_response(request_id, "guest_adoption_confirmation_required");
    }
    if guest_workspace && !adoption_operation.is_some_and(is_uuid_v4) {
        return error_response(request_id, "guest_adoption_operation_required");
    }
    if guest_workspace {
        let existing = db.query_row(
            "SELECT status, adopted_principal_id FROM guest_workspace_principals
             WHERE guest_principal_id = ?1 AND adoption_operation_digest = ?2",
            rusqlite::params![from_owner_id, adoption_operation],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        ).optional();
        match existing {
            Ok(Some((status, adopted_principal_id))) if status == "adopted" => {
                if adopted_principal_id.as_deref() != Some(to_owner_id) {
                    return error_response(request_id, "guest_adoption_operation_conflict");
                }
                let storage_root = state.storage_root.clone();
                drop(db);
                if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id) {
                    return error_response(request_id, &error);
                }
                return WsResponse {
                    msg_type: "atome-response".into(), request_id, success: true, error: None,
                    data: Some(json!({ "updated": 0, "replayed": true, "adopted": true })), atomes: None, count: Some(0),
                };
            }
            Ok(_) => {}
            Err(error) => return error_response(request_id, &error.to_string()),
        }
    }

    let pending_owner =
        serde_json::to_string(from_owner_id).unwrap_or_else(|_| format!("\"{}\"", from_owner_id));

    let mut query = String::from(
        "SELECT DISTINCT a.atome_id
         FROM atomes a
         LEFT JOIN particles p
           ON p.atome_id = a.atome_id
          AND p.particle_key = '_pending_owner_id'
         WHERE a.atome_type NOT IN ('user', 'guest_workspace')
           AND (a.owner_id = ?1",
    );
    if include_creator {
        query.push_str(" OR a.creator_id = ?1");
    }
    query.push_str(" OR (a.owner_id IS NULL AND p.particle_value = ?2))");

    let mut ids: Vec<String> = Vec::new();
    if let Ok(mut stmt) = db.prepare(&query) {
        let rows = stmt.query_map(rusqlite::params![from_owner_id, pending_owner], |row| {
            row.get::<_, String>(0)
        });
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                ids.push(row);
            }
        }
    }

    if ids.is_empty() {
        if guest_workspace {
            if let Err(error) = with_transaction(&db, |tx| {
                tx.execute(
                    "UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?1,
                     adoption_operation_digest = ?2, adopted_at = ?3
                     WHERE guest_principal_id = ?4 AND status = 'active'",
                    rusqlite::params![to_owner_id, adoption_operation, Utc::now().to_rfc3339(), from_owner_id],
                ).map_err(|error| error.to_string())?;
                Ok(())
            }) {
                return error_response(request_id, &error);
            }
            let storage_root = state.storage_root.clone();
            drop(db);
            if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id) {
                return error_response(request_id, &error);
            }
        }
        return WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(json!({ "updated": 0, "project_id": null })),
            atomes: None,
            count: Some(0),
        };
    }

    let now = Utc::now().to_rfc3339();
    let placeholders = vec!["?"; ids.len()].join(", ");
    let mut project_ids = HashSet::new();
    if let Ok(mut stmt) = db.prepare(&format!(
        "SELECT DISTINCT project_id FROM state_current WHERE atome_id IN ({}) AND project_id IS NOT NULL",
        placeholders
    )) {
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        if let Ok(rows) = stmt.query_map(params.as_slice(), |row| row.get::<_, String>(0)) {
            for row in rows.flatten() {
                if !row.trim().is_empty() {
                    project_ids.insert(row);
                }
            }
        }
    }
    let recovered_project_id = if project_ids.len() == 1 {
        project_ids.iter().next().cloned()
    } else {
        None
    };

    let result = with_transaction(&db, |tx| {
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(4 + ids.len());
        params.push(Box::new(to_owner_id.to_string()));
        params.push(Box::new(if include_creator { 1 } else { 0 }));
        params.push(Box::new(to_owner_id.to_string()));
        params.push(Box::new(now.clone()));
        for id in &ids {
            params.push(Box::new(id.clone()));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "UPDATE atomes SET owner_id = ?, creator_id = CASE WHEN ? THEN ? ELSE creator_id END,
                 updated_at = ?, sync_status = 'pending' WHERE atome_id IN ({})",
                placeholders
            ),
            params_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        let mut params_state: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(2 + ids.len());
        params_state.push(Box::new(to_owner_id.to_string()));
        params_state.push(Box::new(now.clone()));
        for id in &ids {
            params_state.push(Box::new(id.clone()));
        }
        let params_state_refs: Vec<&dyn rusqlite::ToSql> =
            params_state.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "UPDATE state_current SET owner_id = ?, updated_at = ? WHERE atome_id IN ({})",
                placeholders
            ),
            params_state_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        if guest_workspace {
            tx.execute("UPDATE permissions SET principal_id = ?1 WHERE principal_id = ?2", rusqlite::params![to_owner_id, from_owner_id])
                .map_err(|e| e.to_string())?;
            tx.execute("UPDATE permissions SET granted_by = ?1 WHERE granted_by = ?2", rusqlite::params![to_owner_id, from_owner_id])
                .map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?1,
                 adoption_operation_digest = ?2, adopted_at = ?3
                 WHERE guest_principal_id = ?4 AND status = 'active'",
                rusqlite::params![to_owner_id, adoption_operation, now, from_owner_id],
            ).map_err(|e| e.to_string())?;
        }

        let mut params_particles: Vec<Box<dyn rusqlite::ToSql>> = Vec::with_capacity(ids.len());
        for id in &ids {
            params_particles.push(Box::new(id.clone()));
        }
        let params_particles_refs: Vec<&dyn rusqlite::ToSql> =
            params_particles.iter().map(|p| p.as_ref()).collect();
        tx.execute(
            &format!(
                "DELETE FROM particles WHERE particle_key = '_pending_owner_id' AND atome_id IN ({})",
                placeholders
            ),
            params_particles_refs.as_slice(),
        )
        .map_err(|e| e.to_string())?;

        if let Some(project_id) = recovered_project_id.as_ref() {
            for key in ["currentProjectId", "current_project_id"] {
                let value_json = serde_json::to_string(project_id).unwrap_or_default();
                tx.execute(
                    "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, 'string', 1, ?4, ?4)
                     ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                        particle_value = excluded.particle_value,
                        value_type = excluded.value_type,
                        version = version + 1,
                        updated_at = excluded.updated_at",
                    rusqlite::params![to_owner_id, key, value_json, now],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    });

    if let Err(err) = result {
        return error_response(request_id, &err);
    }
    if guest_workspace {
        let storage_root = state.storage_root.clone();
        drop(db);
        if let Err(error) = move_guest_downloads(&storage_root, from_owner_id, to_owner_id) {
            return error_response(request_id, &error);
        }
    }
    WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(json!({ "updated": ids.len(), "project_id": recovered_project_id })),
            atomes: None,
            count: Some(ids.len() as i64),
    }
}

// =============================================================================
// EVENTS + STATE_CURRENT MESSAGE HANDLERS
// =============================================================================

pub async fn handle_events_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    if matches!(action, "commit" | "commit-batch") {
        if should_dedupe_request_id(state, &request_id) {
            sync_debug(&format!(
                "dedupe events action={} request_id={:?} user_id={}",
                action, request_id, user_id
            ));
            return WsResponse {
                msg_type: "events-response".into(),
                request_id,
                success: true,
                error: None,
                data: None,
                atomes: None,
                count: None,
            };
        }
    }

    match action {
        "commit" => handle_event_commit(message, user_id, state, request_id).await,
        "commit-batch" => handle_event_commit_batch(message, user_id, state, request_id).await,
        "list" => handle_event_list(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "events-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

pub async fn handle_state_current_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    match action {
        "get" => handle_state_current_get(message, user_id, state, request_id).await,
        "list" => handle_state_current_list(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "state-current-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

// =============================================================================
// ATOME OPERATIONS
// =============================================================================

async fn handle_create(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    // Accept canonical ADOLE v3.0 field names (snake_case)
    let atome_id = message
        .get("id")
        .or_else(|| message.get("atome_id"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Canonical atome type field
    let atome_type = message
        .get("atome_type")
        .and_then(|v| v.as_str())
        .unwrap_or("generic");

    // Canonical parent field
    let parent_id = message.get("parent_id").and_then(|v| v.as_str());

    // Canonical owner field (sync operations may override)
    let owner_value = message.get("owner_id").or_else(|| message.get("user_id"));
    let owner_id = owner_value
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty() && *s != "anonymous")
        .unwrap_or(user_id);

    // Support multiple field names for data: particles, data
    let data = message
        .get("particles")
        .or_else(|| message.get("data"))
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let now = Utc::now().to_rfc3339();
    let now_ms = Utc::now().timestamp_millis();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let sync_mode = message
        .get("sync")
        .and_then(|v| v.as_bool())
        .or_else(|| {
            message
                .get("sync")
                .and_then(|v| v.as_str())
                .map(|s| s.eq_ignore_ascii_case("true") || s == "1")
        })
        .unwrap_or(false);

    if let Some(parent) = parent_id {
        if !can_create(&db, parent, user_id) && !sync_mode {
            return error_response(request_id, "Access denied");
        }
    }

    let fingerprint = create_fingerprint(&atome_id, atome_type, parent_id, owner_id, &data);
    if let Ok(mut cache) = state.recent_fingerprints.lock() {
        if cache.was_seen(&fingerprint, now_ms) {
            sync_debug(&format!(
                "dedupe create payload atome_id={} request_id={:?} user_id={}",
                atome_id, request_id, user_id
            ));
            let existing = load_atome(&db, &atome_id, None)
                .ok()
                .map(|atome| serde_json::to_value(&atome).unwrap());
            return WsResponse {
                msg_type: "atome-response".into(),
                request_id,
                success: true,
                error: None,
                data: existing,
                atomes: None,
                count: None,
            };
        }
    }

    sync_debug(&format!(
        "create atome_id={} type={} owner_id={} sync={} request_id={:?}",
        atome_id, atome_type, owner_id, sync_mode, request_id
    ));

    // Insert or replace atome (upsert for sync operations)
    // Uses owner_id from message if provided, otherwise uses the logged-in user
    let mut insert_owner_id: Option<String> = None;
    let mut pending_owner_id: Option<String> = None;
    let mut insert_parent_id: Option<String> = parent_id.map(String::from);
    let mut pending_parent_id: Option<String> = None;

    if !owner_id.is_empty() && owner_id != "anonymous" {
        let owner_id_string = owner_id.to_string();
        let owner_exists = db
            .query_row(
                "SELECT 1 FROM atomes WHERE atome_id = ?1",
                rusqlite::params![&owner_id_string],
                |_| Ok(()),
            )
            .is_ok();

        if owner_id_string == atome_id || !owner_exists {
            pending_owner_id = Some(owner_id_string);
        } else {
            insert_owner_id = Some(owner_id_string);
        }
    }

    if let Some(parent) = parent_id {
        let parent_string = parent.to_string();
        let parent_exists = db
            .query_row(
                "SELECT 1 FROM atomes WHERE atome_id = ?1",
                rusqlite::params![&parent_string],
                |_| Ok(()),
            )
            .is_ok();

        if parent_string == atome_id || !parent_exists {
            pending_parent_id = Some(parent_string);
            insert_parent_id = None;
        }
    }

    let insert_owner_param = insert_owner_id.as_deref();
    let insert_parent_param = insert_parent_id.as_deref();

    let insert_result = db.execute(
        "INSERT OR REPLACE INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, last_sync, created_source, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?1), ?6), ?6, NULL, 'tauri', 'pending')",
        rusqlite::params![&atome_id, atome_type, insert_parent_param, insert_owner_param, user_id, &now],
    );

    if let Err(e) = insert_result {
        let err_msg = e.to_string();
        if err_msg.contains("FOREIGN KEY constraint failed") {
            if pending_owner_id.is_none() && !owner_id.is_empty() && owner_id != "anonymous" {
                pending_owner_id = Some(owner_id.to_string());
            }
            if pending_parent_id.is_none() {
                if let Some(parent) = parent_id {
                    pending_parent_id = Some(parent.to_string());
                }
            }

            let owner_id_null: Option<String> = None;
            let parent_id_null: Option<String> = None;
            if let Err(e2) = db.execute(
                "INSERT OR REPLACE INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, last_sync, created_source, sync_status)
                 VALUES (?1, ?2, ?3, ?4, ?5, COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?1), ?6), ?6, NULL, 'tauri', 'pending')",
                rusqlite::params![&atome_id, atome_type, parent_id_null, owner_id_null, user_id, &now],
            ) {
                eprintln!("[Create Debug] Insert error: {}", e2);
                return error_response(request_id, &e2.to_string());
            }
        } else {
            eprintln!("[Create Debug] Insert error: {}", e);
            return error_response(request_id, &e.to_string());
        }
    }

    if let Some(pending_owner) = pending_owner_id.as_ref() {
        let pending_value = serde_json::to_string(pending_owner)
            .unwrap_or_else(|_| format!("\"{}\"", pending_owner));
        let _ = db.execute(
            "INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?1, '_pending_owner_id', ?2, 'string', 1, ?3, ?3)",
            rusqlite::params![&atome_id, pending_value, &now],
        );
    }

    if let Some(pending_parent) = pending_parent_id.as_ref() {
        let pending_value = serde_json::to_string(pending_parent)
            .unwrap_or_else(|_| format!("\"{}\"", pending_parent));
        let _ = db.execute(
            "INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?1, '_pending_parent_id', ?2, 'string', 1, ?3, ?3)",
            rusqlite::params![&atome_id, pending_value, &now],
        );
    }

    // Try to resolve pending references now that we inserted the row.
    if let Ok(summary) = resolve_pending_references(&db) {
        if summary.total > 0 {
            if summary.failed > 0 {
                sync_debug(&format!(
                    "[Create Debug] Pending references resolved: {} ok, {} failed ({} total)",
                    summary.resolved, summary.failed, summary.total
                ));
            } else if summary.resolved > 0 {
                sync_debug(&format!(
                    "[Create Debug] Resolved {} pending references",
                    summary.resolved
                ));
            }
        }
    }

    // Insert or replace particles from data
    if let Some(obj) = data.as_object() {
        for (key, value) in obj {
            let value_str = serde_json::to_string(value).unwrap_or_default();
            let value_type = match value {
                serde_json::Value::String(_) => "string",
                serde_json::Value::Number(_) => "number",
                serde_json::Value::Bool(_) => "boolean",
                serde_json::Value::Array(_) | serde_json::Value::Object(_) => "json",
                _ => "string",
            };
            let _ = db.execute(
                "INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT version + 1 FROM particles WHERE atome_id = ?1 AND particle_key = ?2), 1), COALESCE((SELECT created_at FROM particles WHERE atome_id = ?1 AND particle_key = ?2), ?5), ?5)",
                rusqlite::params![&atome_id, key, &value_str, value_type, &now],
            );
        }
    }

    let patch = match data.as_object() {
        Some(obj) => obj.clone(),
        None => JsonMap::new(),
    };
    if let Err(err) =
        upsert_state_current_from_patch(&db, &atome_id, atome_type, parent_id, patch, &now)
    {
        eprintln!("[Create Debug] state_current update failed: {}", err);
    }

    if let Some(parent) = parent_id {
        if let Err(err) =
            inherit_permissions_from_parent(&db, parent, &atome_id, Some(owner_id), user_id)
        {
            eprintln!("[Create Debug] Permission inheritance failed: {}", err);
        }
    }

    if let Ok(mut cache) = state.recent_fingerprints.lock() {
        cache.remember(&fingerprint, now_ms);
    }

    sync_debug(&format!(
        "create upserted atome_id={} owner_id={}",
        atome_id, owner_id
    ));

    let atome = AtomeData {
        atome_id: atome_id.clone(),
        atome_type: atome_type.into(),
        parent_id: parent_id.map(String::from),
        owner_id: Some(owner_id.into()),
        creator_id: Some(user_id.into()),
        data,
        sync_status: "pending".into(),
        created_source: Some("tauri".into()),
        last_sync: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    };

    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(serde_json::to_value(&atome).unwrap()),
        atomes: None,
        count: None,
    }
}

async fn handle_get(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    if !can_read(&db, atome_id, user_id) {
        return error_response(request_id, "Access denied");
    }

    match load_atome(&db, atome_id, None) {
        Ok(atome) => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(serde_json::to_value(&atome).unwrap()),
            atomes: None,
            count: None,
        },
        Err(e) => error_response(request_id, &e),
    }
}

async fn handle_list(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    // Canonical atome type field
    let atome_type = message
        .get("atome_type")
        .or_else(|| message.get("type"))
        .and_then(|v| v.as_str());
    let owner_id = message
        .get("owner_id")
        .or_else(|| message.get("user_id"))
        .and_then(|v| v.as_str());
    let parent_id = message
        .get("parent_id")
        .or_else(|| message.get("parent"))
        .and_then(|v| v.as_str());
    let include_deleted = message
        .get("include_deleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let excluded_particle_keys: HashSet<String> = message
        .get("exclude_particle_keys")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    let atome_list_debug_enabled = std::env::var("ATOME_LIST_DEBUG")
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "on"
        })
        .unwrap_or(false);
    if atome_list_debug_enabled {
        println!(
            "[Atome List Debug] atome_type={:?}, owner_id={:?}, user_id={}, includeDeleted={}",
            atome_type, owner_id, user_id, include_deleted
        );
    }

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Determine effective owner - if anonymous or not specified, query by type only
    // SPECIAL CASE: For atome_type = 'user', always query all users regardless of owner
    // SPECIAL CASE: If owner_id = "*" or "all", query all atomes regardless of owner (for sync)
    let effective_owner = match (owner_id, atome_type) {
        // Sync mode: "*" or "all" means list all atomes
        (Some("*"), _) | (Some("all"), _) => None,
        // For user listing, ignore owner filtering to get all users
        (_, Some("user")) => None,
        // If owner_id is explicitly provided (not "*" or "all"), use it
        (Some(id), _) if !id.is_empty() && id != "anonymous" => Some(id),
        // No owner_id provided - default to logged-in user
        (None, _) => Some(user_id),
        _ => None,
    };

    // Build query based on whether we have an owner or just a type
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (effective_owner, atome_type)
    {
        (Some(owner), atome_type) => {
            let mut query = String::from(
                "SELECT DISTINCT a.atome_id
                 FROM atomes a
                 LEFT JOIN permissions perm
                   ON perm.atome_id = a.atome_id
                  AND perm.principal_id = ?1
                  AND perm.can_read = 1
                  AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
                 WHERE (a.owner_id = ?2 OR a.creator_id = ?1 OR perm.permission_id IS NOT NULL
                   OR EXISTS (
                     SELECT 1 FROM particles p2
                     WHERE p2.atome_id = a.atome_id
                       AND p2.particle_key = '_pending_owner_id'
                       AND p2.particle_value = ?3
                   ))",
            );
            let pending_owner =
                serde_json::to_string(owner).unwrap_or_else(|_| format!("\"{}\"", owner));
            let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
                Box::new(owner.to_string()),
                Box::new(owner.to_string()),
                Box::new(pending_owner),
            ];
            if let Some(t) = atome_type {
                query.push_str(" AND a.atome_type = ?");
                params.push(Box::new(t.to_string()));
            }
            if let Some(parent) = parent_id {
                query.push_str(" AND a.parent_id = ?");
                params.push(Box::new(parent.to_string()));
            }
            if !include_deleted {
                query.push_str(" AND a.deleted_at IS NULL");
            }
            query.push_str(&format!(
                " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                limit, offset
            ));
            (query, params)
        }
        (None, Some(t)) => {
            if t == "user" {
                let mut query = String::from(
                    "SELECT DISTINCT a.atome_id
                     FROM atomes a
                     LEFT JOIN particles p
                       ON a.atome_id = p.atome_id
                      AND p.particle_key = 'visibility'
                     WHERE a.atome_type = 'user'
                       AND (p.particle_value IS NULL OR p.particle_value = '\"public\"')",
                );
                if !include_deleted {
                    query.push_str(" AND a.deleted_at IS NULL");
                }
                query.push_str(&format!(
                    " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ));
                (query, Vec::new())
            } else {
                let mut query = String::from("SELECT DISTINCT a.atome_id FROM atomes a WHERE 1=1");
                let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
                query.push_str(" AND a.atome_type = ?");
                params.push(Box::new(t.to_string()));
                if let Some(parent) = parent_id {
                    query.push_str(" AND a.parent_id = ?");
                    params.push(Box::new(parent.to_string()));
                }
                if !include_deleted {
                    query.push_str(" AND a.deleted_at IS NULL");
                }
                query.push_str(&format!(
                    " ORDER BY a.updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ));
                (query, params)
            }
        }
        (None, None) => {
            return WsResponse {
                msg_type: "atome-response".into(),
                request_id,
                success: true,
                error: None,
                data: None,
                atomes: Some(Vec::new()),
                count: Some(0),
            };
        }
    };

    let mut stmt = match db.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let atome_ids: Vec<String> = stmt
        .query_map(params_refs.as_slice(), |row| row.get(0))
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    let mut atomes = Vec::new();
    for id in atome_ids {
        if let Some(owner) = effective_owner {
            if !can_read(&db, &id, owner) {
                continue;
            }
        }
        if let Ok(atome) = load_atome_with_deleted_excluding(
            &db,
            &id,
            None,
            include_deleted,
            &excluded_particle_keys,
        ) {
            atomes.push(atome);
        }
    }

    let count = atomes.len() as i64;

    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: true,
        error: None,
        data: None,
        atomes: Some(atomes),
        count: Some(count),
    }
}

async fn handle_update(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    // Support both camelCase (particles) and snake_case (data)
    let data = message
        .get("particles")
        .or_else(|| message.get("data"))
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let now = Utc::now().to_rfc3339();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let exists: Result<String, _> = db.query_row(
        "SELECT atome_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match exists {
        Err(_) => return error_response(request_id, "Atome not found"),
        Ok(_) => {}
    }

    if !can_write(&db, atome_id, user_id) {
        return error_response(request_id, "Access denied");
    }

    // Update atome timestamp
    let _ = db.execute(
        "UPDATE atomes SET updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
        rusqlite::params![&now, atome_id],
    );

    // Update particles (upsert)
    if let Some(obj) = data.as_object() {
        for (key, value) in obj {
            let value_str = serde_json::to_string(value).unwrap_or_default();
            let _ = db.execute(
                "INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                    particle_value = excluded.particle_value,
                    updated_at = excluded.updated_at",
                rusqlite::params![atome_id, key, &value_str, &now],
            );
        }
    }

    let meta = db
        .query_row(
            "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional();
    let (meta_type, meta_parent) = match meta {
        Ok(Some((meta_type, meta_parent))) => (meta_type, meta_parent),
        _ => ("generic".to_string(), None),
    };
    let patch = match data.as_object() {
        Some(obj) => obj.clone(),
        None => JsonMap::new(),
    };
    if let Err(err) = upsert_state_current_from_patch(
        &db,
        atome_id,
        &meta_type,
        meta_parent.as_deref(),
        patch,
        &now,
    ) {
        println!("[Update Debug] state_current update failed: {}", err);
    }

    match load_atome(&db, atome_id, None) {
        Ok(atome) => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(serde_json::to_value(&atome).unwrap()),
            atomes: None,
            count: None,
        },
        Err(e) => error_response(request_id, &e),
    }
}

async fn handle_delete(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let now = Utc::now().to_rfc3339();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let exists: Result<String, _> = db.query_row(
        "SELECT atome_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match exists {
        Err(_) => return error_response(request_id, "Atome not found"),
        Ok(_) => {}
    }

    if !can_delete(&db, atome_id, user_id) {
        return error_response(request_id, "Access denied");
    }

    let result = db.execute(
        "UPDATE atomes SET deleted_at = ?1, sync_status = 'pending'
         WHERE atome_id = ?2 AND deleted_at IS NULL",
        rusqlite::params![&now, atome_id],
    );

    match result {
        Ok(0) => error_response(request_id, "Atome not found or access denied"),
        Ok(_) => {
            let delete_event = EventRecord {
                id: Uuid::new_v4().to_string(),
                ts: now.clone(),
                atome_id: Some(atome_id.to_string()),
                project_id: None,
                kind: "delete".into(),
                payload: None,
                actor: None,
                tx_id: None,
                gesture_id: None,
            };
            let _ = apply_event_to_state_current(&db, &delete_event);

            WsResponse {
                msg_type: "atome-response".into(),
                request_id,
                success: true,
                error: None,
                data: None,
                atomes: None,
                count: None,
            }
        }
        Err(e) => error_response(request_id, &e.to_string()),
    }
}

async fn handle_alter(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    // ADOLE alter = update specific particles without replacing the whole data
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let particles = message
        .get("particles")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let now = Utc::now().to_rfc3339();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let exists: Result<String, _> = db.query_row(
        "SELECT atome_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match exists {
        Err(_) => return error_response(request_id, "Atome not found"),
        Ok(_) => {}
    }

    if !can_write(&db, atome_id, user_id) {
        return error_response(request_id, "Access denied");
    }

    // Update timestamp
    let _ = db.execute(
        "UPDATE atomes SET updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
        rusqlite::params![&now, atome_id],
    );

    // Alter specific particles with history
    if let Some(obj) = particles.as_object() {
        for (key, value) in obj {
            // Get old value for history
            let old_value: Option<String> = db
                .query_row(
                    "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                    rusqlite::params![atome_id, key],
                    |row| row.get(0),
                )
                .ok();

            let value_str = serde_json::to_string(value).unwrap_or_default();
            let value_type = match value {
                serde_json::Value::String(_) => "string",
                serde_json::Value::Number(_) => "number",
                serde_json::Value::Bool(_) => "boolean",
                serde_json::Value::Array(_) | serde_json::Value::Object(_) => "json",
                _ => "string",
            };

            // Get current version before update
            let current_version: i64 = db
                .query_row(
                    "SELECT version FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                    rusqlite::params![atome_id, key],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            let new_version = current_version + 1;

            // Upsert particle with version and value_type
            let _ = db.execute(
                "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
                 ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                    particle_value = excluded.particle_value,
                    value_type = excluded.value_type,
                    version = version + 1,
                    updated_at = excluded.updated_at",
                rusqlite::params![atome_id, key, &value_str, value_type, &now],
            );

            // Record history with version and changed_by
            if let Some(old) = old_value {
                let particle_id: i64 = db
                    .query_row(
                        "SELECT particle_id FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                        rusqlite::params![atome_id, key],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let _ = db.execute(
                    "INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![particle_id, atome_id, key, new_version, &old, &value_str, user_id, &now],
                );
            }
        }
    }

    let meta = db
        .query_row(
            "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional();
    let (meta_type, meta_parent) = match meta {
        Ok(Some((meta_type, meta_parent))) => (meta_type, meta_parent),
        _ => ("generic".to_string(), None),
    };
    let patch = match particles.as_object() {
        Some(obj) => obj.clone(),
        None => JsonMap::new(),
    };
    if let Err(err) = upsert_state_current_from_patch(
        &db,
        atome_id,
        &meta_type,
        meta_parent.as_deref(),
        patch,
        &now,
    ) {
        println!("[Alter Debug] state_current update failed: {}", err);
    }

    match load_atome(&db, atome_id, None) {
        Ok(atome) => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: Some(serde_json::to_value(&atome).unwrap()),
            atomes: None,
            count: None,
        },
        Err(e) => error_response(request_id, &e),
    }
}

// =============================================================================
// EVENTS + STATE_CURRENT OPERATIONS
// =============================================================================

#[derive(Debug, Clone)]
pub(super) struct EventRecord {
    pub(super) id: String,
    pub(super) ts: String,
    pub(super) atome_id: Option<String>,
    pub(super) project_id: Option<String>,
    pub(super) kind: String,
    pub(super) payload: Option<JsonValue>,
    pub(super) actor: Option<JsonValue>,
    pub(super) tx_id: Option<String>,
    pub(super) gesture_id: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct SyncQueueItem {
    pub(super) queue_id: i64,
    pub(super) payload: String,
    pub(super) attempts: i64,
}

fn sync_event_type(kind: &str) -> &'static str {
    if kind.eq_ignore_ascii_case("delete") {
        "atome:deleted"
    } else {
        "atome:updated"
    }
}

fn format_sync_atome(atome: &AtomeData) -> JsonValue {
    json!({
        "id": atome.atome_id,
        "atome_id": atome.atome_id,
        "type": atome.atome_type,
        "atome_type": atome.atome_type,
        "parent_id": atome.parent_id,
        "owner_id": atome.owner_id,
        "created_at": atome.created_at,
        "updated_at": atome.updated_at,
        "properties": atome.data,
        "data": atome.data
    })
}

fn emit_atome_sync_from_event(db: &Connection, event: &EventRecord) {
    if event.kind.eq_ignore_ascii_case("snapshot") {
        return;
    }
    let atome_id = match event.atome_id.as_ref() {
        Some(id) => id,
        None => return,
    };
    let include_deleted = event.kind.eq_ignore_ascii_case("delete");
    let atome = match load_atome_with_deleted(db, atome_id, None, include_deleted) {
        Ok(entry) => entry,
        Err(_) => {
            if include_deleted {
                broadcast_sync_event(json!({
                    "type": "atome:deleted",
                    "atome_id": atome_id
                }));
            }
            return;
        }
    };
    let payload = format_sync_atome(&atome);
    broadcast_sync_event(json!({
        "type": sync_event_type(&event.kind),
        "atome": payload,
        "atome_id": atome_id
    }));
}

async fn handle_event_commit(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let sync_target = resolve_sync_target(&message);
    let sync_source = resolve_sync_source(&message);
    let event = match message.get("event") {
        Some(v) => v,
        None => return error_response(request_id, "Missing event payload"),
    };

    let normalized = match normalize_event_input(event, user_id, None) {
        Ok(v) => v,
        Err(e) => return error_response(request_id, &e),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let result = with_transaction(&db, |conn| {
        let decision = super::local_atome_security::authorize_event(conn, &normalized, user_id, None);
        if !decision.allowed {
            return Err(format!("{}:{}", decision.reason, decision.denied_keys.join(",")));
        }
        let inserted = insert_event_record(conn, &normalized)?;
        if inserted {
            let _ = apply_event_to_state_current(conn, &normalized)?;
            apply_event_to_atomes(conn, &normalized, user_id)?;
            if is_syncable_event(&normalized) && should_enqueue_sync(&sync_target, &sync_source) {
                if let Some(target) = sync_target.as_ref() {
                    let _ = enqueue_sync_event(conn, &normalized, target);
                }
            }
        }
        Ok(())
    });

    if let Err(e) = result {
        return error_response(request_id, &e);
    }

    emit_atome_sync_from_event(&db, &normalized);

    let payload = json!({ "event": event_with_actor(normalized) });
    WsResponse {
        msg_type: "events-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}

async fn handle_event_commit_batch(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let sync_target = resolve_sync_target(&message);
    let sync_source = resolve_sync_source(&message);
    let body = message
        .get("events")
        .or_else(|| message.get("event"))
        .cloned();
    let events = match body {
        Some(JsonValue::Array(list)) => list,
        _ => return error_response(request_id, "Missing events array"),
    };

    let tx_id = message
        .get("tx_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut normalized_events = Vec::with_capacity(events.len());
    for evt in events.iter() {
        let normalized = match normalize_event_input(evt, user_id, tx_id.clone()) {
            Ok(v) => v,
            Err(e) => return error_response(request_id, &e),
        };
        normalized_events.push(normalized);
    }

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let result = with_transaction(&db, |conn| {
        let create_ids = super::local_atome_security::batch_create_ids(conn, &normalized_events, user_id);
        for evt in normalized_events.iter() {
            let decision = super::local_atome_security::authorize_event(conn, evt, user_id, Some(&create_ids));
            if !decision.allowed {
                return Err(format!("{}:{}", decision.reason, decision.denied_keys.join(",")));
            }
        }
        for evt in normalized_events.iter() {
            let inserted = insert_event_record(conn, evt)?;
            if inserted {
                let _ = apply_event_to_state_current(conn, evt)?;
                apply_event_to_atomes(conn, evt, user_id)?;
                if is_syncable_event(evt) && should_enqueue_sync(&sync_target, &sync_source) {
                    if let Some(target) = sync_target.as_ref() {
                        let _ = enqueue_sync_event(conn, evt, target);
                    }
                }
            }
        }
        Ok(())
    });

    if let Err(e) = result {
        return error_response(request_id, &e);
    }

    let mut emitted = HashSet::new();
    for evt in normalized_events.iter() {
        if let Some(atome_id) = evt.atome_id.as_ref() {
            if emitted.insert(atome_id.clone()) {
                emit_atome_sync_from_event(&db, evt);
            }
        }
    }

    let events_payload: Vec<JsonValue> = normalized_events
        .into_iter()
        .map(event_with_actor)
        .collect();

    let payload = json!({ "events": events_payload });
    WsResponse {
        msg_type: "events-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}

async fn handle_event_list(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message
        .get("project_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let atome_id = message
        .get("atome_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let tx_id = message
        .get("tx_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let gesture_id = message
        .get("gesture_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let since = message
        .get("since")
        .and_then(|v| v.as_str())
        .map(String::from);
    let until = message
        .get("until")
        .and_then(|v| v.as_str())
        .map(String::from);
    let limit = message
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let order = message
        .get("order")
        .and_then(|v| v.as_str())
        .unwrap_or("asc");

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(pid) = project_id {
        conditions.push("project_id = ?".to_string());
        params.push(pid);
    }
    if let Some(aid) = atome_id {
        conditions.push("atome_id = ?".to_string());
        params.push(aid);
    }
    if let Some(tid) = tx_id {
        conditions.push("tx_id = ?".to_string());
        params.push(tid);
    }
    if let Some(gid) = gesture_id {
        conditions.push("gesture_id = ?".to_string());
        params.push(gid);
    }
    if let Some(since_val) = since {
        conditions.push("ts >= ?".to_string());
        params.push(since_val);
    }
    if let Some(until_val) = until {
        conditions.push("ts <= ?".to_string());
        params.push(until_val);
    }

    let where_clause = if conditions.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let order_clause = if order.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let query = format!(
        "SELECT id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id
         FROM events {} ORDER BY ts {} LIMIT ? OFFSET ?",
        where_clause, order_clause
    );

    let mut stmt = match db.prepare(&query) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let mut query_params: Vec<rusqlite::types::Value> = params
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect();
    query_params.push(rusqlite::types::Value::from(limit));
    query_params.push(rusqlite::types::Value::from(offset));

    let rows = stmt
        .query_map(rusqlite::params_from_iter(query_params), |row| {
            let payload: Option<String> = row.get(5)?;
            let actor: Option<String> = row.get(6)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "ts": row.get::<_, String>(1)?,
                "atome_id": row.get::<_, Option<String>>(2)?,
                "project_id": row.get::<_, Option<String>>(3)?,
                "kind": row.get::<_, String>(4)?,
                "payload": parse_json_value(payload.as_ref()),
                "actor": parse_json_value(actor.as_ref()),
                "tx_id": row.get::<_, Option<String>>(7)?,
                "gesture_id": row.get::<_, Option<String>>(8)?
            }))
        })
        .map_err(|e| e.to_string());

    let events = match rows {
        Ok(iter) => iter
            .filter_map(|row| row.ok())
            .filter_map(|event| {
                super::local_atome_security::project_event_for_read(&db, &event, user_id)
            })
            .collect::<Vec<_>>(),
        Err(e) => return error_response(request_id, &e),
    };

    let payload = json!({ "events": events });
    WsResponse {
        msg_type: "events-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}

async fn handle_state_current_get(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let row: Option<(String, Option<String>, Option<String>, Option<String>, String, i64, Option<String>)> = db
        .query_row(
            "SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id WHERE sc.atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )
        .optional()
        .unwrap_or(None);

    let state_payload = row.and_then(
        |(id, owner_id, project_id, properties, updated_at, version, parent_id)| {
            let properties = parse_json_value(properties.as_ref());
            let projected = super::local_atome_security::project_properties_for_read(
                &db, &id, user_id, &properties
            );
            let keys = projected.as_object()
                .map(|value| value.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            if keys.is_empty() {
                return None;
            }
            Some(json!({
                "atome_id": id,
                "owner_id": owner_id,
                "project_id": project_id,
                "parent_id": parent_id,
                "properties": projected,
                "capabilities": super::local_atome_security::project_capabilities_for_read(
                    &db, &id, user_id, keys.into_iter()
                ),
                "updated_at": updated_at,
                "version": version
            }))
        },
    );

    let payload = json!({ "state": state_payload });
    WsResponse {
        msg_type: "state-current-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}

async fn handle_state_current_list(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message.get("project_id").and_then(|v| v.as_str());
    let atome_type = message
        .get("atome_type")
        .or_else(|| message.get("atomeType"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let limit = message
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let include_total = message
        .get("include_total")
        .or_else(|| message.get("includeTotal"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let exclude_system = message
        .get("exclude_system")
        .or_else(|| message.get("excludeSystem"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let mut conditions = vec![
        "(sc.owner_id = ? OR EXISTS (
            SELECT 1 FROM permissions p
            WHERE p.atome_id = sc.atome_id AND p.principal_id = ?
              AND p.can_read = 1
        ))".to_string()
    ];
    let mut scope_params = vec![
        rusqlite::types::Value::from(user_id.to_string()),
        rusqlite::types::Value::from(user_id.to_string())
    ];
    if let Some(pid) = project_id {
        conditions.insert(0, "sc.project_id = ?".to_string());
        scope_params.insert(0, rusqlite::types::Value::from(pid.to_string()));
    }
    if let Some(kind) = atome_type {
        conditions.push(
            "(LOWER(COALESCE(a.atome_type, '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) = ? OR LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) = ?)".to_string()
        );
        scope_params.push(rusqlite::types::Value::from(kind.clone()));
        scope_params.push(rusqlite::types::Value::from(kind.clone()));
        scope_params.push(rusqlite::types::Value::from(kind));
    }
    if exclude_system {
        conditions.push("LOWER(COALESCE(a.atome_type, '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push("LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'".to_string());
    }
    let where_clause = format!(" WHERE {}", conditions.join(" AND "));
    let query = format!(
        "SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id{} ORDER BY sc.updated_at DESC LIMIT ? OFFSET ?",
        where_clause
    );
    let mut params = scope_params;
    params.push(rusqlite::types::Value::from(limit));
    params.push(rusqlite::types::Value::from(offset));

    let mut stmt = match db.prepare(&query) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            let properties: Option<String> = row.get(3)?;
            Ok(json!({
                "atome_id": row.get::<_, String>(0)?,
                "owner_id": row.get::<_, Option<String>>(1)?,
                "project_id": row.get::<_, Option<String>>(2)?,
                "parent_id": row.get::<_, Option<String>>(6)?,
                "properties": parse_json_value(properties.as_ref()),
                "updated_at": row.get::<_, String>(4)?,
                "version": row.get::<_, i64>(5)?
            }))
        })
        .map_err(|e| e.to_string());

    let states = match rows {
        Ok(iter) => iter.filter_map(|row| row.ok()).filter_map(|mut current| {
            let atome_id = current.get("atome_id")?.as_str()?.to_string();
            let projected = super::local_atome_security::project_properties_for_read(
                &db,
                &atome_id,
                user_id,
                current.get("properties").unwrap_or(&JsonValue::Null),
            );
            let keys = projected.as_object()?.keys().cloned().collect::<Vec<_>>();
            if keys.is_empty() {
                return None;
            }
            current["properties"] = projected;
            current["capabilities"] = super::local_atome_security::project_capabilities_for_read(
                &db, &atome_id, user_id, keys.into_iter()
            );
            Some(current)
        }).collect::<Vec<_>>(),
        Err(e) => return error_response(request_id, &e),
    };
    let total = states.len() as i64;

    let payload = if include_total {
        json!({ "states": states, "total": total })
    } else {
        json!({ "states": states })
    };
    WsResponse {
        msg_type: "state-current-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: include_total.then_some(total),
    }
}

#[cfg(test)]
mod state_current_type_filter_tests {
    use super::*;

    fn state() -> LocalAtomeState {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        LocalAtomeState {
            db: Arc::new(Mutex::new(db)),
            storage_root: PathBuf::new(),
            recent_request_ids: Arc::new(Mutex::new(DedupeCache::new(32))),
            recent_fingerprints: Arc::new(Mutex::new(FingerprintCache::new(32, 750))),
            remote_sync_credentials: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[tokio::test]
    async fn project_filter_runs_before_limit_and_accepts_canonical_kind() {
        let state = state();
        {
            let db = state.db.lock().expect("database lock");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('owner', 'user', NULL, 'owner', '2025-12-31T00:00:00Z')",
                [],
            ).expect("owner atome");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('old-project', 'generic', 'owner', 'owner', '2026-01-01T00:00:00Z')",
                [],
            ).expect("project atome");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('old-project', 'owner', 'old-project', '{\"kind\":\"project\",\"name\":\"Old project\"}', '2026-01-01T00:00:00Z', 1)",
                [],
            ).expect("project state");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, updated_at) VALUES ('new-shape', 'shape', 'owner', 'owner', '2026-02-01T00:00:00Z')",
                [],
            ).expect("shape atome");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('new-shape', 'owner', 'old-project', '{\"kind\":\"shape\"}', '2026-02-01T00:00:00Z', 1)",
                [],
            ).expect("shape state");
        }

        let response = handle_state_current_list(
            json!({ "atome_type": "project", "limit": 1 }),
            "owner",
            &state,
            None,
        ).await;

        assert!(response.success, "{:?}", response.error);
        let states = response.data
            .as_ref()
            .and_then(|data| data.get("states"))
            .and_then(JsonValue::as_array)
            .expect("states");
        assert_eq!(states.len(), 1);
        assert_eq!(states[0].get("atome_id"), Some(&json!("old-project")));
    }
}

fn normalize_event_input(
    event: &JsonValue,
    user_id: &str,
    default_tx_id: Option<String>,
) -> Result<EventRecord, String> {
    let kind = event
        .get("kind")
        .or_else(|| event.get("event"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if kind.is_empty() {
        return Err("Missing event kind".to_string());
    }

    let id = event
        .get("id")
        .or_else(|| event.get("event_id"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let ts = event
        .get("ts")
        .or_else(|| event.get("timestamp"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    let atome_id = event
        .get("atome_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    let global_scope = event.get("scope").and_then(|v| v.as_str()) == Some("global");
    let project_id = if global_scope {
        None
    } else {
        event
            .get("project_id")
            .and_then(|v| v.as_str())
            .map(String::from)
    };

    let mut payload = resolve_event_payload(event);
    // `parent_id` is structural event metadata, never an Atome property. Preserve
    // it in the envelope so Axum applies it to `atomes.parent_id` and projects it
    // at the root of state_current. Without this normalization, a Tauri batch can
    // create a Molecule while silently leaving its members at the project root.
    if let Some(parent_id) = event.get("parent_id").and_then(|value| value.as_str()) {
        let mut object = payload
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();
        object.insert("parent_id".to_string(), JsonValue::String(parent_id.to_string()));
        payload = Some(JsonValue::Object(object));
    }
    if global_scope {
        let mut object = payload.and_then(|value| value.as_object().cloned()).unwrap_or_default();
        object.insert("scope".to_string(), JsonValue::String("global".to_string()));
        payload = Some(JsonValue::Object(object));
    }

    let actor = Some(json!({ "type": "user", "id": user_id }));

    let tx_id = event
        .get("tx_id")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or(default_tx_id);

    let gesture_id = event
        .get("gesture_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(EventRecord {
        id,
        ts,
        atome_id,
        project_id,
        kind,
        payload,
        actor,
        tx_id,
        gesture_id,
    })
}

fn resolve_event_payload(event: &JsonValue) -> Option<JsonValue> {
    if let Some(payload) = event.get("payload") {
        return Some(payload.clone());
    }
    let props = event
        .get("props")
        .or_else(|| event.get("properties"))
        .or_else(|| event.get("patch"))
        .or_else(|| event.get("delta"));
    props.map(|value| json!({ "props": value.clone() }))
}

fn event_parent_id(event: &EventRecord) -> Option<&str> {
    event
        .payload
        .as_ref()?
        .get("parent_id")?
        .as_str()
}

pub(super) fn list_sync_queue_for_actor(
    db: &Connection,
    target_server: &str,
    actor_id: &str,
    limit: i64,
) -> Result<Vec<SyncQueueItem>, String> {
    let mut stmt = db
        .prepare(
            "SELECT queue_id, payload, attempts
             FROM sync_queue
             WHERE target_server = ?1
               AND json_extract(payload, '$.actor.id') = ?2
               AND status IN ('pending', 'error')
               AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday('now'))
             ORDER BY created_at ASC, queue_id ASC
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![target_server, actor_id, limit], |row| {
            Ok(SyncQueueItem {
                queue_id: row.get(0)?,
                payload: row.get(1)?,
                attempts: row.get::<_, i64>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub(super) fn mark_sync_queue_syncing(db: &Connection, queue_id: i64, attempts: i64) -> Result<(), String> {
    db.execute(
        "UPDATE sync_queue SET status = 'syncing', attempts = ?1, last_attempt_at = datetime('now') WHERE queue_id = ?2",
        rusqlite::params![attempts, queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) fn mark_sync_queue_error(
    db: &Connection,
    queue_id: i64,
    attempts: i64,
    error_message: &str,
    next_retry_at: Option<String>,
    final_fail: bool,
) -> Result<(), String> {
    let status = if final_fail { "failed" } else { "error" };
    db.execute(
        "UPDATE sync_queue SET status = ?1, attempts = ?2, error_message = ?3, next_retry_at = ?4 WHERE queue_id = ?5",
        rusqlite::params![status, attempts, error_message, next_retry_at, queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) fn mark_sync_queue_done(db: &Connection, queue_id: i64) -> Result<(), String> {
    db.execute(
        "DELETE FROM sync_queue WHERE queue_id = ?1",
        rusqlite::params![queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod sync_queue_retry_tests {
    use super::*;

    #[test]
    fn rfc3339_retry_dates_are_compared_as_dates_not_text() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        db.execute_batch(
            "INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('past', 'project', 'tauri', 'local');
             INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('future', 'project', 'tauri', 'local');",
        )
        .expect("atome fixtures");
        let payload = json!({ "actor": { "id": "local-user" } }).to_string();
        db.execute(
            "INSERT INTO sync_queue (
                atome_id, operation, payload, target_server, status, attempts, max_attempts,
                next_retry_at, created_at
             ) VALUES ('past', 'events:commit', ?1, 'fastify', 'error', 1, 5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 second'), datetime('now'))",
            [&payload],
        )
        .expect("past retry");
        db.execute(
            "INSERT INTO sync_queue (
                atome_id, operation, payload, target_server, status, attempts, max_attempts,
                next_retry_at, created_at
             ) VALUES ('future', 'events:commit', ?1, 'fastify', 'error', 1, 5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour'), datetime('now'))",
            [&payload],
        )
        .expect("future retry");

        let ready = list_sync_queue_for_actor(&db, "fastify", "local-user", 10)
            .expect("ready retries");
        assert_eq!(ready.len(), 1);
        let queued_id: String = db
            .query_row(
                "SELECT atome_id FROM sync_queue WHERE queue_id = ?1",
                [ready[0].queue_id],
                |row| row.get(0),
            )
            .expect("queued retry id");
        assert_eq!(queued_id, "past");
    }
}

fn extract_event_patch(
    kind: &str,
    payload: &Option<JsonValue>,
    ts: &str,
) -> Option<JsonMap<String, JsonValue>> {
    if kind == "delete" {
        let mut map = JsonMap::new();
        map.insert("__deleted".to_string(), JsonValue::Bool(true));
        map.insert("deleted_at".to_string(), JsonValue::String(ts.to_string()));
        return Some(map);
    }

    let payload_value = payload.as_ref()?;
    let payload_obj = match payload_value {
        JsonValue::Object(map) => Some(map.clone()),
        JsonValue::String(raw) => {
            let parsed: JsonValue = serde_json::from_str(raw).ok()?;
            if let JsonValue::Object(map) = parsed {
                Some(map)
            } else {
                None
            }
        }
        _ => None,
    }?;

    for key in ["props", "properties", "patch", "delta"] {
        if let Some(JsonValue::Object(map)) = payload_obj.get(key) {
            return Some(map.clone());
        }
    }

    None
}

fn resolve_state_project_id(
    patch: &JsonMap<String, JsonValue>,
    atome_id: &str,
    atome_type: &str,
    parent_id: Option<&str>,
) -> Option<String> {
    let project_id = patch
        .get("project_id")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    if project_id.is_some() {
        return project_id;
    }
    if atome_type == "project" {
        return Some(atome_id.to_string());
    }
    parent_id.map(|v| v.to_string())
}

fn ensure_state_patch_fields(
    mut patch: JsonMap<String, JsonValue>,
    atome_type: &str,
    parent_id: Option<&str>,
    project_id: Option<&str>,
) -> JsonMap<String, JsonValue> {
    if !patch.contains_key("type")
        && !patch.contains_key("atome_type")
        && !patch.contains_key("kind")
    {
        patch.insert(
            "type".to_string(),
            JsonValue::String(atome_type.to_string()),
        );
    }
    if let Some(parent) = parent_id {
        if !patch.contains_key("parent_id") {
            patch.insert(
                "parent_id".to_string(),
                JsonValue::String(parent.to_string()),
            );
        }
    }
    if let Some(project) = project_id {
        if !patch.contains_key("project_id") {
            patch.insert(
                "project_id".to_string(),
                JsonValue::String(project.to_string()),
            );
        }
    }
    patch
}

fn upsert_state_current_from_patch(
    db: &Connection,
    atome_id: &str,
    atome_type: &str,
    parent_id: Option<&str>,
    patch: JsonMap<String, JsonValue>,
    ts: &str,
) -> Result<(), String> {
    let project_id = resolve_state_project_id(&patch, atome_id, atome_type, parent_id);
    let payload_patch =
        ensure_state_patch_fields(patch, atome_type, parent_id, project_id.as_deref());
    let event = EventRecord {
        id: Uuid::new_v4().to_string(),
        ts: ts.to_string(),
        atome_id: Some(atome_id.to_string()),
        project_id: project_id.clone(),
        kind: "set".into(),
        payload: Some(json!({ "props": JsonValue::Object(payload_patch) })),
        actor: None,
        tx_id: None,
        gesture_id: None,
    };
    let _ = apply_event_to_state_current(db, &event)?;
    Ok(())
}

fn apply_event_to_state_current(
    db: &Connection,
    event: &EventRecord,
) -> Result<Option<JsonValue>, String> {
    let atome_id = match event.atome_id.as_ref() {
        Some(id) => id,
        None => return Ok(None),
    };

    let mut patch = match extract_event_patch(&event.kind, &event.payload, &event.ts) {
        Some(p) => p,
        None => return Ok(None),
    };
    if !patch.contains_key("type")
        && !patch.contains_key("atome_type")
        && !patch.contains_key("kind")
    {
        let meta: Result<Option<Option<String>>, _> = db
            .query_row(
                "SELECT atome_type FROM atomes WHERE atome_id = ?1",
                rusqlite::params![atome_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional();
        if let Ok(Some(meta_type)) = meta {
            if let Some(meta_type) = meta_type {
                patch.insert("type".to_string(), JsonValue::String(meta_type));
            }
        }
    }

    let existing: Option<(Option<String>, i64, Option<String>, Option<String>)> = db
        .query_row(
            "SELECT properties, version, project_id, owner_id FROM state_current WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let owner_id_from_patch = patch
        .get("owner_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut current_props = parse_json_map(existing.as_ref().and_then(|row| row.0.as_ref()));
    for (key, value) in patch.into_iter() {
        current_props.insert(key, value);
    }

    let next_version = existing.as_ref().map(|row| row.1 + 1).unwrap_or(1);
    let global_scope = event
        .payload
        .as_ref()
        .and_then(|payload| payload.as_object())
        .and_then(|payload| payload.get("scope"))
        .and_then(|scope| scope.as_str())
        == Some("global");
    let project_id = if global_scope {
        None
    } else {
        event
            .project_id
            .clone()
            .or_else(|| existing.as_ref().and_then(|row| row.2.clone()))
    };

    let owner_id = owner_id_from_patch
        .or_else(|| {
            db.query_row(
                "SELECT owner_id FROM atomes WHERE atome_id = ?1",
                rusqlite::params![atome_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .ok()
            .flatten()
            .flatten()
        })
        .or_else(|| resolve_event_actor_user_id(event))
        .or_else(|| existing.as_ref().and_then(|row| row.3.clone()));

    let props_json = serde_json::to_string(&current_props).map_err(|e| e.to_string())?;

    if existing.is_some() {
        db.execute(
            "UPDATE state_current SET properties = ?1, updated_at = ?2, version = ?3, project_id = ?4, owner_id = COALESCE(?5, owner_id) WHERE atome_id = ?6",
            rusqlite::params![props_json, event.ts, next_version, project_id, owner_id, atome_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![atome_id, owner_id, project_id, props_json, event.ts, next_version],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(Some(json!({
        "atome_id": atome_id,
        "owner_id": owner_id,
        "project_id": project_id,
        "properties": JsonValue::Object(current_props),
        "updated_at": event.ts,
        "version": next_version
    })))
}

fn resolve_event_actor_user_id(event: &EventRecord) -> Option<String> {
    let actor = event.actor.as_ref()?;
    if let Some(raw) = actor.as_str() {
        let value = raw.trim();
        if !value.is_empty() && value != "anonymous" {
            return Some(value.to_string());
        }
        return None;
    }
    let object = actor.as_object()?;
    for key in ["id", "user_id", "userId", "atome_id", "atomeId"] {
        if let Some(raw) = object.get(key).and_then(|value| value.as_str()) {
            let value = raw.trim();
            if !value.is_empty() && value != "anonymous" {
                return Some(value.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod state_current_owner_tests {
    use super::*;

    fn test_event(actor: Option<JsonValue>) -> EventRecord {
        EventRecord {
            id: "event_test_1".to_string(),
            ts: "2026-04-19T00:00:00Z".to_string(),
            atome_id: Some("atome_test_1".to_string()),
            project_id: Some("project_test_1".to_string()),
            kind: "set".to_string(),
            payload: Some(json!({
                "props": {
                    "kind": "shape",
                    "left": "10px",
                    "top": "20px",
                    "project_id": "project_test_1"
                }
            })),
            actor,
            tx_id: None,
            gesture_id: None,
        }
    }

    #[test]
    fn resolves_actor_user_id_from_object() {
        let event = test_event(Some(json!({ "type": "user", "id": "user_test_1" })));
        assert_eq!(
            resolve_event_actor_user_id(&event),
            Some("user_test_1".to_string())
        );
    }

    #[test]
    fn state_current_uses_actor_owner_when_atome_row_is_missing() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");

        let event = test_event(Some(json!({ "type": "user", "id": "user_test_1" })));
        apply_event_to_state_current(&db, &event)
            .expect("state_current projection")
            .expect("projection payload");

        let owner_id: Option<String> = db
            .query_row(
                "SELECT owner_id FROM state_current WHERE atome_id = ?1",
                rusqlite::params!["atome_test_1"],
                |row| row.get(0),
            )
            .expect("owner row");

        assert_eq!(owner_id, Some("user_test_1".to_string()));
    }

    #[test]
    fn auth_incomplete_local_owner_is_migrable() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, created_at, updated_at) VALUES (?1, 'user', ?2, ?2)",
            rusqlite::params!["local_owner_1", "2026-04-19T00:00:00Z"],
        )
        .expect("insert local owner");

        db.execute(
            "INSERT INTO guest_workspace_principals (guest_principal_id, status) VALUES (?1, 'active')",
            rusqlite::params!["local_owner_1"],
        )
        .unwrap();
        assert!(is_guest_workspace_principal(&db, "local_owner_1"));
    }

    #[test]
    fn credentialed_local_owner_is_not_migrable() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, created_at, updated_at) VALUES (?1, 'user', ?2, ?2)",
            rusqlite::params!["real_owner_1", "2026-04-19T00:00:00Z"],
        )
        .expect("insert real owner");
        db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value) VALUES (?1, 'phone', ?2)",
            rusqlite::params!["real_owner_1", "\"33333333\""],
        )
        .expect("insert phone");

        assert!(!is_guest_workspace_principal(&db, "real_owner_1"));
    }

    #[test]
    fn guest_adoption_operation_requires_uuid_v4() {
        assert!(is_uuid_v4("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_uuid_v4("550e8400-e29b-11d4-a716-446655440000"));
        assert!(!is_uuid_v4("not-a-uuid"));
    }

    #[tokio::test]
    async fn guest_adoption_transfers_active_references_and_downloads_without_rewriting_history() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let target_id = Uuid::new_v4().to_string();
        let guest_id = Uuid::new_v4().to_string();
        let operation_id = Uuid::new_v4().to_string();
        let state = create_state(workspace.path().join("state"), workspace.path().to_path_buf());
        {
            let db = state.db.lock().expect("database lock");
            let now = "2026-07-31T00:00:00Z";
            db.execute("INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at) VALUES (?1, 'user', ?1, ?1, ?2, ?2)", rusqlite::params![target_id, now]).unwrap();
            db.execute("INSERT INTO atomes (atome_id, atome_type, created_at, updated_at) VALUES (?1, 'guest_workspace', ?2, ?2)", rusqlite::params![guest_id, now]).unwrap();
            db.execute("INSERT INTO guest_workspace_principals (guest_principal_id, status) VALUES (?1, 'active')", rusqlite::params![guest_id]).unwrap();
            assert!(is_guest_workspace_principal(&db, &guest_id));
            db.execute("INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at) VALUES (?1, 'project', ?2, ?2, ?3, ?3)", rusqlite::params!["guest_adoption_project", guest_id, now]).unwrap();
            db.execute("INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES (?1, ?2, ?1, '{}', ?3, 1)", rusqlite::params!["guest_adoption_project", guest_id, now]).unwrap();
            db.execute("INSERT INTO permissions (atome_id, principal_id, granted_by, granted_at) VALUES (?1, ?2, ?2, ?3)", rusqlite::params!["guest_adoption_project", guest_id, now]).unwrap();
            db.execute(
                "INSERT INTO events (
                    id, ts, atome_id, kind, actor, stream_id, sequence, source
                 ) VALUES ('guest_adoption_event', ?1, ?2, 'set', ?3, 'tauri:guest-adoption', 1, 'tauri')",
                rusqlite::params![now, "guest_adoption_project", json!({ "type": "guest", "id": guest_id }).to_string()]
            ).unwrap();
            db.execute("INSERT INTO snapshots (atome_id, snapshot_data, actor, created_by, created_at) VALUES (?1, '{}', ?2, ?3, ?4)", rusqlite::params!["guest_adoption_project", json!({ "type": "guest", "id": guest_id }).to_string(), guest_id, now]).unwrap();
            db.execute("INSERT INTO sync_queue (atome_id, operation, payload, target_server, status, attempts, max_attempts, created_at) VALUES (?1, 'commit', '{}', 'fastify', 'pending', 0, 5, ?2)", rusqlite::params!["guest_adoption_project", now]).unwrap();
        }
        let source_dir = workspace.path().join("data").join("users").join(&guest_id).join("Downloads");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::write(source_dir.join("guest.txt"), "guest content").unwrap();
        let request = json!({
            "action": "transfer-owner", "from_owner_id": guest_id, "to_owner_id": target_id,
            "adoption_confirmed": true, "operation_id": operation_id
        });
        let response = handle_transfer_owner(request.clone(), &target_id, &state, None).await;
        assert!(response.success, "{:?}", response.error);
        let replay = handle_transfer_owner(request, &target_id, &state, None).await;
        assert!(replay.success, "{:?}", replay.error);
        let target_file = workspace.path().join("data").join("users").join(&target_id).join("Downloads").join("guest.txt");
        assert_eq!(std::fs::read_to_string(target_file).unwrap(), "guest content");
        let db = state.db.lock().expect("database lock");
        let owner: String = db.query_row("SELECT owner_id FROM atomes WHERE atome_id = 'guest_adoption_project'", [], |row| row.get(0)).unwrap();
        let state_owner: String = db.query_row("SELECT owner_id FROM state_current WHERE atome_id = 'guest_adoption_project'", [], |row| row.get(0)).unwrap();
        let permission: String = db.query_row("SELECT principal_id FROM permissions WHERE atome_id = 'guest_adoption_project'", [], |row| row.get(0)).unwrap();
        let event_actor: String = db.query_row("SELECT actor FROM events WHERE id = 'guest_adoption_event'", [], |row| row.get(0)).unwrap();
        let snapshot_actor: String = db.query_row("SELECT actor FROM snapshots WHERE atome_id = 'guest_adoption_project'", [], |row| row.get(0)).unwrap();
        let queue_count: i64 = db.query_row("SELECT COUNT(*) FROM sync_queue WHERE atome_id = 'guest_adoption_project'", [], |row| row.get(0)).unwrap();
        assert_eq!(owner, target_id);
        assert_eq!(state_owner, target_id);
        assert_eq!(permission, target_id);
        assert!(event_actor.contains(&guest_id));
        assert!(snapshot_actor.contains(&guest_id));
        assert_eq!(queue_count, 1);
    }

    #[test]
    fn list_projection_can_exclude_heavy_preview_particles_before_serialization() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, created_at, updated_at) VALUES (?1, 'user', ?2, ?2)",
            rusqlite::params!["user_test_1", "2026-07-17T00:00:00Z"],
        )
        .expect("insert owner");
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, created_at, updated_at) VALUES (?1, 'project', ?2, ?3, ?3)",
            rusqlite::params!["project_preview_test", "user_test_1", "2026-07-17T00:00:00Z"],
        )
        .expect("insert project");
        db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value) VALUES (?1, 'name', ?2)",
            rusqlite::params!["project_preview_test", "\"Visible project\""],
        )
        .expect("insert name");
        db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value) VALUES (?1, 'preview_url', ?2)",
            rusqlite::params!["project_preview_test", "\"data:image/webp;base64,heavy\""],
        )
        .expect("insert preview");

        let excluded = HashSet::from(["preview_url".to_string()]);
        let project = load_atome_with_deleted_excluding(
            &db,
            "project_preview_test",
            Some("user_test_1"),
            false,
            &excluded,
        )
        .expect("load lightweight project");
        let data = project.data.as_object().expect("project data");

        assert_eq!(data.get("name"), Some(&json!("Visible project")));
        assert!(!data.contains_key("preview_url"));
    }
}

#[cfg(test)]
mod property_commit_security_tests {
    use super::*;

    fn state() -> LocalAtomeState {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        for (id, owner) in [("owner", "owner"), ("member", "member"), ("secure", "owner")] {
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES (?1, 'shape', ?2, ?2)",
                rusqlite::params![id, owner],
            ).expect("atome fixture");
        }
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, properties, version) VALUES ('secure', 'owner', '{\"content\":\"before\",\"secret\":\"sealed\"}', 1)",
            [],
        ).expect("state fixture");
        db.execute(
            "INSERT INTO permissions (atome_id, particle_key, principal_id, can_read, can_write) VALUES ('secure', 'content', 'member', 1, 1)",
            [],
        ).expect("permission fixture");
        LocalAtomeState {
            db: Arc::new(Mutex::new(db)),
            storage_root: PathBuf::new(),
            recent_request_ids: Arc::new(Mutex::new(DedupeCache::new(32))),
            recent_fingerprints: Arc::new(Mutex::new(FingerprintCache::new(32, 750))),
            remote_sync_credentials: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn commit_message(id: &str, props: JsonValue) -> JsonValue {
        json!({
            "type": "events",
            "action": "commit",
            "sync_target": "fastify",
            "event": {
                "id": id,
                "kind": "set",
                "atome_id": "secure",
                "actor": { "id": "owner" },
                "payload": { "props": props }
            }
        })
    }

    #[test]
    fn current_user_state_is_republished_to_the_remote_principal() {
        let state = state();
        {
            let db = state.db.lock().expect("database lock");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES (?1, 'user', ?1, ?1)",
                ["local-user"],
            )
            .expect("profile atome fixture");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, properties, version) VALUES (?1, ?1, ?2, 7)",
                rusqlite::params![
                    "local-user",
                    r#"{"eve_profile":{"access":"public","name":"Visible"},"phone":"private"}"#
                ],
            )
            .expect("profile state fixture");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES ('local-project', 'project', 'local-user', 'local-user')",
                [],
            )
            .expect("project atome fixture");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('local-project', 'local-user', 'local-project', '{\"kind\":\"project\",\"name\":\"Projet test\"}', '2026-08-31T09:59:00Z', 2)",
                [],
            )
            .expect("project state fixture");
            db.execute(
                "INSERT INTO events (id, ts, atome_id, project_id, kind, actor, stream_id, sequence, source) VALUES ('project-event', '2026-08-31T09:59:00Z', 'local-project', 'local-project', 'set', '{\"id\":\"local-user\"}', 'tauri:local-user:local-project', 1, 'tauri')",
                [],
            )
            .expect("project event fixture");
            db.execute(
                "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, parent_id) VALUES ('local-child', 'text', 'local-user', 'local-user', 'local-project')",
                [],
            )
            .expect("child atome fixture");
            db.execute(
                "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES ('local-child', 'local-user', 'local-project', '{\"kind\":\"text\",\"content\":\"complete\"}', '2026-08-31T10:00:00Z', 3)",
                [],
            )
            .expect("child state fixture");
            db.execute(
                "INSERT INTO events (id, ts, atome_id, project_id, kind, actor, stream_id, sequence, source) VALUES ('child-event', '2026-08-31T10:00:00Z', 'local-child', 'local-project', 'set', '{\"id\":\"local-user\"}', 'tauri:local-user:local-project', 2, 'tauri')",
                [],
            )
            .expect("child event fixture");
        }
        assert_eq!(
            crate::server::local_atome_sync_worker::enqueue_current_user_state_sync(
                &state,
                "local-user",
                "remote-user",
            ),
            Ok(3)
        );
        let db = state.db.lock().expect("database lock");
        let payload: String = db.query_row(
            "SELECT payload FROM sync_queue WHERE atome_id = 'local-user'",
            [],
            |row| row.get(0),
        ).expect("queued profile payload");
        let event: JsonValue = serde_json::from_str(&payload).expect("profile event json");
        assert!(event
            .get("id")
            .and_then(JsonValue::as_str)
            .is_some_and(|id| id.starts_with("remote-state-bootstrap-v2:remote-user:local-user:")));
        assert_eq!(event.get("atome_id"), Some(&json!("local-user")));
        assert_eq!(event.pointer("/payload/props/eve_profile/access"), Some(&json!("public")));
        let child_payload: String = db.query_row(
            "SELECT payload FROM sync_queue WHERE atome_id = 'local-child'",
            [],
            |row| row.get(0),
        ).expect("queued child payload");
        let child: JsonValue = serde_json::from_str(&child_payload).expect("child event json");
        assert_eq!(child.get("project_id"), Some(&json!("local-project")));
        assert_eq!(child.pointer("/payload/parent_id"), Some(&json!("local-project")));
        assert_eq!(child.pointer("/payload/props/content"), Some(&json!("complete")));
    }

    #[tokio::test]
    async fn denied_mixed_commit_has_no_event_state_or_queue_side_effect() {
        let state = state();
        let allowed = handle_events_message(
            commit_message("allowed-event", json!({"content":"after"})),
            "member",
            &state,
        ).await;
        assert!(allowed.success, "allowed property commit: {:?}", allowed.error);
        assert_eq!(
            allowed.data.as_ref().and_then(|data| data.pointer("/event/actor/id")).and_then(JsonValue::as_str),
            Some("member"),
            "the authenticated principal owns the audit identity"
        );

        let denied = handle_events_message(
            commit_message("denied-event", json!({"content":"partial","secret":"leak"})),
            "member",
            &state,
        ).await;
        assert!(!denied.success);
        assert!(denied.error.as_deref().unwrap_or_default().starts_with("property_write_denied:secret"));

        let db = state.db.lock().unwrap();
        let properties: String = db.query_row(
            "SELECT properties FROM state_current WHERE atome_id = 'secure'", [], |row| row.get(0)
        ).unwrap();
        let properties = serde_json::from_str::<JsonValue>(&properties).unwrap();
        assert_eq!(properties.get("content"), Some(&json!("after")));
        assert_eq!(properties.get("secret"), Some(&json!("sealed")));
        let denied_events: i64 = db.query_row(
            "SELECT COUNT(*) FROM events WHERE id = 'denied-event'", [], |row| row.get(0)
        ).unwrap();
        let queued: i64 = db.query_row(
            "SELECT COUNT(*) FROM sync_queue", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(denied_events, 0);
        assert_eq!(queued, 1, "only the authorized commit reaches the sync queue");
    }

    #[tokio::test]
    async fn batch_parent_id_creates_persistent_molecule_membership() {
        let state = state();
        {
            let db = state.db.lock().expect("database lock");
            for id in ["project", "image", "sound"] {
                db.execute(
                    "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES (?1, 'shape', 'owner', 'owner')",
                    rusqlite::params![id],
                )
                .expect("fixture atome");
            }
        }

        let response = handle_events_message(
            json!({
                "type": "events",
                "action": "commit-batch",
                "events": [
                    {
                        "id": "molecule-create",
                        "kind": "set",
                        "atome_id": "molecule",
                        "project_id": "project",
                        "parent_id": "project",
                        "type": "group",
                        "payload": { "props": { "kind": "group" } }
                    },
                    {
                        "id": "image-absorb",
                        "kind": "set",
                        "atome_id": "image",
                        "project_id": "project",
                        "parent_id": "molecule",
                        "payload": { "props": {} }
                    },
                    {
                        "id": "sound-absorb",
                        "kind": "set",
                        "atome_id": "sound",
                        "project_id": "project",
                        "parent_id": "molecule",
                        "payload": { "props": {} }
                    }
                ]
            }),
            "owner",
            &state,
        )
        .await;
        assert!(response.success, "molecule batch failed: {:?}", response.error);

        {
            let db = state.db.lock().expect("database lock");
            for id in ["image", "sound"] {
                let properties: String = db
                    .query_row(
                        "SELECT properties FROM state_current WHERE atome_id = ?1",
                        rusqlite::params![id],
                        |row| row.get(0),
                    )
                    .expect("state_current properties");
                let atome_parent: String = db
                    .query_row(
                        "SELECT parent_id FROM atomes WHERE atome_id = ?1",
                        rusqlite::params![id],
                        |row| row.get(0),
                    )
                    .expect("atome parent");
                assert_eq!(atome_parent, "molecule");
                assert!(
                    !parse_json_value(Some(&properties)).get("parent_id").is_some(),
                    "parent_id must remain envelope metadata"
                );
            }
        }

        let listed = handle_state_current_list(
            json!({ "project_id": "project", "include_total": true }),
            "owner",
            &state,
            None,
        )
        .await;
        assert!(listed.success, "state_current list failed: {:?}", listed.error);
        let states = listed
            .data
            .as_ref()
            .and_then(|data| data.get("states"))
            .and_then(JsonValue::as_array)
            .expect("state_current states");
        for id in ["image", "sound"] {
            let state = states
                .iter()
                .find(|entry| entry.get("atome_id").and_then(JsonValue::as_str) == Some(id))
                .expect("member state");
            assert_eq!(state.get("parent_id"), Some(&json!("molecule")));
        }
    }
}

fn apply_event_to_atomes(
    db: &Connection,
    event: &EventRecord,
    user_id: &str,
) -> Result<(), String> {
    let atome_id = match event.atome_id.as_ref() {
        Some(id) => id,
        None => return Ok(()),
    };

    let patch = match extract_event_patch(&event.kind, &event.payload, &event.ts) {
        Some(p) => p,
        None => return Ok(()),
    };

    let mut atome_type = None;
    if let Some(JsonValue::String(value)) = patch.get("type") {
        if !value.trim().is_empty() {
            atome_type = Some(value.trim().to_string());
        }
    }
    if atome_type.is_none() {
        if let Some(JsonValue::String(value)) = patch.get("kind") {
            if !value.trim().is_empty() {
                atome_type = Some(value.trim().to_string());
            }
        }
    }
    if atome_type.is_none() {
        if let Some(JsonValue::String(value)) = patch.get("atome_type") {
            if !value.trim().is_empty() {
                atome_type = Some(value.trim().to_string());
            }
        }
    }
    let mut atome_type = atome_type.unwrap_or_else(|| "atome".to_string());
    if atome_type == "atome" {
        let has_user_identity = patch.contains_key("phone")
            || patch.contains_key("username")
            || patch.contains_key("password_hash")
            || patch.contains_key("visibility");
        if has_user_identity {
            atome_type = "user".to_string();
        }
    }

    let parent_id = event_parent_id(event)
        .or_else(|| patch.get("parent_id").and_then(JsonValue::as_str))
        .map(String::from);

    let existing: Option<(String, String)> = db
        .query_row(
            "SELECT atome_id, atome_type FROM atomes WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((_id, existing_type)) = existing.as_ref() {
        if atome_type == "user" && existing_type != "user" {
            let _ = db.execute(
                "UPDATE atomes SET atome_type = 'user', updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
                rusqlite::params![event.ts, atome_id],
            );
        }
    }

    if existing.is_some() {
        if event.kind == "delete" {
            let _ = db.execute(
                "UPDATE atomes SET deleted_at = ?1, updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
                rusqlite::params![event.ts, atome_id],
            );
        } else {
            let _ = db.execute(
                "UPDATE atomes SET updated_at = ?1, sync_status = 'pending', parent_id = COALESCE(?2, parent_id) WHERE atome_id = ?3",
                rusqlite::params![event.ts, parent_id, atome_id],
            );
        }
    } else {
        let _ = db.execute(
            "INSERT INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, last_sync, created_source, sync_status)
             VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5, NULL, 'tauri', 'pending')",
            rusqlite::params![atome_id, atome_type, parent_id, user_id, event.ts],
        );
    }

    if event.kind == "delete" {
        return Ok(());
    }

    for (key, value) in patch.into_iter() {
        if key.starts_with("__") {
            continue;
        }
        let value_str = serde_json::to_string(&value).unwrap_or_default();
        let _ = db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                particle_value = excluded.particle_value,
                updated_at = excluded.updated_at",
            rusqlite::params![atome_id, key, value_str, event.ts],
        );
    }

    Ok(())
}

fn insert_event_record(db: &Connection, event: &EventRecord) -> Result<bool, String> {
    let exists: Option<i64> = db
        .query_row(
            "SELECT 1 FROM events WHERE id = ?1",
            rusqlite::params![event.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_some() {
        return Ok(false);
    }
    let payload_json: Option<String> = match &event.payload {
        Some(payload) => Some(serde_json::to_string(payload).map_err(|e| e.to_string())?),
        None => None,
    };
    let actor_json: Option<String> = match &event.actor {
        Some(actor) => Some(serde_json::to_string(actor).map_err(|e| e.to_string())?),
        None => None,
    };
    let actor_id = event.actor.as_ref()
        .and_then(|actor| actor.get("id"))
        .and_then(JsonValue::as_str)
        .unwrap_or("local");
    let scope_id = event.project_id.as_deref().or(event.atome_id.as_deref()).unwrap_or("account");
    let stream_id = format!("tauri:{}:{}", actor_id, scope_id);
    let sequence = db.query_row(
        "SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE stream_id = ?1",
        [&stream_id],
        |row| row.get::<_, i64>(0),
    ).map_err(|error| error.to_string())?;
    db.execute(
        "INSERT INTO events (
            id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id,
            stream_id, sequence, source
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'tauri')",
        rusqlite::params![
            event.id,
            event.ts,
            event.atome_id,
            event.project_id,
            event.kind,
            payload_json,
            actor_json,
            event.tx_id,
            event.gesture_id,
            stream_id,
            sequence
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

pub(super) fn event_with_actor(event: EventRecord) -> JsonValue {
    json!({
        "id": event.id,
        "ts": event.ts,
        "atome_id": event.atome_id,
        "project_id": event.project_id,
        "kind": event.kind,
        "payload": event.payload,
        "actor": event.actor,
        "tx_id": event.tx_id,
        "gesture_id": event.gesture_id
    })
}

fn parse_json_map(raw: Option<&String>) -> JsonMap<String, JsonValue> {
    if let Some(value) = raw {
        if let Ok(parsed) = serde_json::from_str::<JsonValue>(value) {
            if let JsonValue::Object(map) = parsed {
                return map;
            }
        }
    }
    JsonMap::new()
}

fn parse_json_value(raw: Option<&String>) -> JsonValue {
    if let Some(value) = raw {
        if let Ok(parsed) = serde_json::from_str::<JsonValue>(value) {
            return parsed;
        }
    }
    JsonValue::Null
}

fn with_transaction<F>(db: &Connection, work: F) -> Result<(), String>
where
    F: FnOnce(&Connection) -> Result<(), String>,
{
    db.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;
    match work(db) {
        Ok(result) => {
            db.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            let _ = db.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// =============================================================================
// HELPERS
// =============================================================================

fn load_atome(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
) -> Result<AtomeData, String> {
    load_atome_with_deleted(db, atome_id, owner_filter, false)
}

fn load_atome_with_deleted(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
    include_deleted: bool,
) -> Result<AtomeData, String> {
    load_atome_with_deleted_excluding(
        db,
        atome_id,
        owner_filter,
        include_deleted,
        &HashSet::new(),
    )
}

fn load_atome_with_deleted_excluding(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
    include_deleted: bool,
    excluded_particle_keys: &HashSet<String>,
) -> Result<AtomeData, String> {
    let deleted_clause = if include_deleted {
        ""
    } else {
        "AND deleted_at IS NULL"
    };

    let query = if owner_filter.is_some() {
        format!(
            "SELECT atome_id, atome_type, parent_id, owner_id, creator_id, sync_status, created_source, last_sync, created_at, updated_at, deleted_at
             FROM atomes WHERE atome_id = ?1 AND owner_id = ?2 {}",
            deleted_clause
        )
    } else {
        format!(
            "SELECT atome_id, atome_type, parent_id, owner_id, creator_id, sync_status, created_source, last_sync, created_at, updated_at, deleted_at
             FROM atomes WHERE atome_id = ?1 {}",
            deleted_clause
        )
    };

    let row: (
        String,         // atome_id
        String,         // atome_type
        Option<String>, // parent_id
        Option<String>, // owner_id
        Option<String>, // creator_id
        String,         // sync_status
        Option<String>, // created_source
        Option<String>, // last_sync
        String,         // created_at
        String,         // updated_at
        Option<String>, // deleted_at
    ) = if let Some(owner) = owner_filter {
        db.query_row(&query, rusqlite::params![atome_id, owner], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
            ))
        })
    } else {
        db.query_row(&query, rusqlite::params![atome_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
            ))
        })
    }
    .map_err(|e| e.to_string())?;

    // Load particles
    let mut data_map = serde_json::Map::new();
    let mut particle_query = String::from(
        "SELECT particle_key, particle_value FROM particles WHERE atome_id = ?1",
    );
    let mut particle_params: Vec<Box<dyn rusqlite::ToSql>> =
        vec![Box::new(atome_id.to_string())];
    if !excluded_particle_keys.is_empty() {
        let placeholders = excluded_particle_keys
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        particle_query.push_str(&format!(" AND particle_key NOT IN ({})", placeholders));
        for key in excluded_particle_keys {
            particle_params.push(Box::new(key.clone()));
        }
    }
    let mut stmt = db
        .prepare(&particle_query)
        .map_err(|e| e.to_string())?;
    let particle_param_refs: Vec<&dyn rusqlite::ToSql> =
        particle_params.iter().map(|param| param.as_ref()).collect();

    let particles = stmt
        .query_map(particle_param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for p in particles.filter_map(|r| r.ok()) {
        let (key, value_str) = p;
        if let Ok(value) = serde_json::from_str(&value_str) {
            data_map.insert(key, value);
        } else {
            data_map.insert(key, serde_json::Value::String(value_str));
        }
    }

    let mut owner_id = row.3;
    if owner_id.is_none() {
        owner_id = get_pending_owner_id(db, &row.0);
    }
    let mut parent_id = row.2;
    if parent_id.is_none() {
        parent_id = get_pending_parent_id(db, &row.0);
    }

    Ok(AtomeData {
        atome_id: row.0,
        atome_type: row.1,
        parent_id,
        owner_id,
        creator_id: row.4,
        data: serde_json::Value::Object(data_map),
        sync_status: row.5,
        created_source: row.6,
        last_sync: row.7,
        created_at: row.8,
        updated_at: row.9,
        deleted_at: row.10,
    })
}

fn get_pending_owner_id(db: &Connection, atome_id: &str) -> Option<String> {
    let raw: Result<String, _> = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = '_pending_owner_id' LIMIT 1",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match raw {
        Ok(value) => serde_json::from_str(&value).ok().or(Some(value)),
        Err(_) => None,
    }
}

fn get_pending_parent_id(db: &Connection, atome_id: &str) -> Option<String> {
    let raw: Result<String, _> = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = '_pending_parent_id' LIMIT 1",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match raw {
        Ok(value) => serde_json::from_str(&value).ok().or(Some(value)),
        Err(_) => None,
    }
}

struct PendingResolveSummary {
    resolved: usize,
    failed: usize,
    total: usize,
}

fn resolve_pending_references(db: &Connection) -> Result<PendingResolveSummary, String> {
    let now = Utc::now().to_rfc3339();
    let mut resolved = 0usize;
    let mut failed = 0usize;

    let mut stmt = db
        .prepare(
            "SELECT atome_id, particle_key, particle_value
             FROM particles
             WHERE particle_key IN ('_pending_owner_id', '_pending_parent_id')",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for row in rows.filter_map(|r| r.ok()) {
        total += 1;
        let (atome_id, particle_key, particle_value) = row;
        let pending_id: Option<String> = serde_json::from_str(&particle_value)
            .ok()
            .or(Some(particle_value.clone()));

        let pending_id = match pending_id {
            Some(id) if !id.is_empty() && id != "anonymous" => id,
            _ => {
                let _ = db.execute(
                    "DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                    rusqlite::params![&atome_id, &particle_key],
                );
                resolved += 1;
                continue;
            }
        };

        let exists = db
            .query_row(
                "SELECT 1 FROM atomes WHERE atome_id = ?1",
                rusqlite::params![&pending_id],
                |_| Ok(()),
            )
            .is_ok();

        if exists {
            if particle_key == "_pending_owner_id" {
                let _ = db.execute(
                    "UPDATE atomes SET owner_id = ?1, updated_at = ?2, sync_status = 'pending' WHERE atome_id = ?3",
                    rusqlite::params![&pending_id, &now, &atome_id],
                );
            } else if particle_key == "_pending_parent_id" {
                let _ = db.execute(
                    "UPDATE atomes SET parent_id = ?1, updated_at = ?2, sync_status = 'pending' WHERE atome_id = ?3",
                    rusqlite::params![&pending_id, &now, &atome_id],
                );
            }

            let _ = db.execute(
                "DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                rusqlite::params![&atome_id, &particle_key],
            );
            resolved += 1;
        } else {
            failed += 1;
        }
    }

    Ok(PendingResolveSummary {
        resolved,
        failed,
        total,
    })
}

fn get_owner_id(db: &Connection, atome_id: &str) -> Option<String> {
    let owner: Option<String> = db
        .query_row(
            "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
            rusqlite::params![atome_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if owner.is_some() {
        owner
    } else {
        get_pending_owner_id(db, atome_id)
    }
}

fn upsert_permission(
    db: &Connection,
    atome_id: &str,
    principal_id: &str,
    can_read: i64,
    can_write: i64,
    can_delete: i64,
    can_share: i64,
    can_create: i64,
    share_mode: Option<String>,
    conditions: Option<String>,
    expires_at: Option<String>,
    granted_by: &str,
) -> Result<(), rusqlite::Error> {
    let existing: Option<i64> = db
        .query_row(
            "SELECT permission_id FROM permissions
             WHERE atome_id = ?1 AND principal_id = ?2
               AND (particle_key IS NULL OR particle_key = '')
             LIMIT 1",
            rusqlite::params![atome_id, principal_id],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(permission_id) = existing {
        db.execute(
            "UPDATE permissions SET
                can_read = ?1,
                can_write = ?2,
                can_delete = ?3,
                can_share = ?4,
                can_create = ?5,
                share_mode = COALESCE(?6, share_mode),
                conditions = COALESCE(?7, conditions),
                expires_at = COALESCE(?8, expires_at)
             WHERE permission_id = ?9",
            rusqlite::params![
                can_read,
                can_write,
                can_delete,
                can_share,
                can_create,
                share_mode,
                conditions,
                expires_at,
                permission_id
            ],
        )?;
    } else {
        let now = Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO permissions (
                atome_id,
                particle_key,
                principal_id,
                can_read,
                can_write,
                can_delete,
                can_share,
                can_create,
                share_mode,
                conditions,
                granted_by,
                granted_at,
                expires_at
            ) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                atome_id,
                principal_id,
                can_read,
                can_write,
                can_delete,
                can_share,
                can_create,
                share_mode,
                conditions,
                granted_by,
                now,
                expires_at
            ],
        )?;
    }

    Ok(())
}

fn inherit_permissions_from_parent(
    db: &Connection,
    parent_id: &str,
    child_id: &str,
    child_owner_id: Option<&str>,
    grantor_id: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = db.prepare(
        "SELECT principal_id, can_read, can_write, can_delete, can_share, can_create,
                share_mode, conditions, expires_at, granted_by
         FROM permissions
         WHERE atome_id = ?1
           AND (expires_at IS NULL OR expires_at > datetime('now'))",
    )?;

    let rows = stmt.query_map(rusqlite::params![parent_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
        ))
    })?;

    for row in rows {
        let (
            principal_id,
            can_read,
            can_write,
            can_delete,
            can_share,
            can_create,
            share_mode,
            conditions,
            expires_at,
            granted_by,
        ) = row?;

        if child_owner_id.map(|id| id == principal_id).unwrap_or(false) {
            continue;
        }

        let grantor = granted_by.as_deref().unwrap_or(grantor_id);
        upsert_permission(
            db,
            child_id,
            &principal_id,
            can_read,
            can_write,
            can_delete,
            can_share,
            can_create,
            share_mode,
            conditions,
            expires_at,
            grantor,
        )?;
    }

    if let Some(parent_owner_id) = get_owner_id(db, parent_id) {
        if !child_owner_id
            .map(|id| id == parent_owner_id)
            .unwrap_or(false)
        {
            upsert_permission(
                db,
                child_id,
                &parent_owner_id,
                1,
                1,
                1,
                1,
                1,
                Some("real-time".into()),
                None,
                None,
                grantor_id,
            )?;
        }
    }

    Ok(())
}

fn can_read(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    super::local_atome_security::can_read(db, atome_id, principal_id, None)
}

fn can_write(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    super::local_atome_security::can_write(db, atome_id, principal_id, None)
}

fn can_delete(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    super::local_atome_security::can_delete(db, atome_id, principal_id, None)
}

fn can_create(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    super::local_atome_security::can_create(db, atome_id, principal_id)
}

fn error_response(request_id: Option<String>, error: &str) -> WsResponse {
    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: false,
        error: Some(error.into()),
        data: None,
        atomes: None,
        count: None,
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

pub fn create_state(data_dir: PathBuf, storage_root: PathBuf) -> LocalAtomeState {
    let conn = init_database(&data_dir).expect("Failed to initialize ADOLE database");
    LocalAtomeState {
        db: Arc::new(Mutex::new(conn)),
        storage_root,
        recent_request_ids: Arc::new(Mutex::new(DedupeCache::new(2000))),
        recent_fingerprints: Arc::new(Mutex::new(FingerprintCache::new(5000, 750))),
        remote_sync_credentials: Arc::new(Mutex::new(HashMap::new())),
    }
}
