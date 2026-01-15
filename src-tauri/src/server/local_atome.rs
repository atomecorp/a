// =============================================================================
// LOCAL ATOME MODULE - ADOLE v3.0 WebSocket-based storage for Tauri
// =============================================================================
// All operations via WebSocket messages, no HTTP routes
// Schema: atomes + particles (unified with Fastify)
// =============================================================================

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;
use crate::server::broadcast_sync_event;

// =============================================================================
// STATE & TYPES
// =============================================================================

#[derive(Clone)]
pub struct LocalAtomeState {
    pub db: Arc<Mutex<Connection>>,
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

// =============================================================================
// DATABASE INITIALIZATION - ADOLE v3.0 Schema
// UNIFIED with Fastify (database/schema.sql) - Same 7 tables
// =============================================================================

pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("adole.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    let _ = conn.execute_batch("PRAGMA journal_mode = WAL;");

    // =========================================================================
    // Table 1: atomes - Represents EVERYTHING (users, documents, folders, etc.)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS atomes (
            atome_id TEXT PRIMARY KEY,
            atome_type TEXT NOT NULL,
            parent_id TEXT,
            owner_id TEXT,
            creator_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT,
            last_sync TEXT,
            created_source TEXT DEFAULT 'unknown',
            sync_status TEXT DEFAULT 'local',
            FOREIGN KEY(parent_id) REFERENCES atomes(atome_id) ON DELETE SET NULL,
            FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_sync_status ON atomes(sync_status)",
        [],
    )?;

    // =========================================================================
    // Table 2: particles - Properties of atomes (dynamic key-value system)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS particles (
            particle_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            particle_key TEXT NOT NULL,
            particle_value TEXT,
            value_type TEXT DEFAULT 'string',
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
            UNIQUE(atome_id, particle_key)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_particles_atome ON particles(atome_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_particles_key ON particles(particle_key)",
        [],
    )?;

    // =========================================================================
    // Table 3: particles_versions - Full history of all particle modifications
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS particles_versions (
            version_id INTEGER PRIMARY KEY AUTOINCREMENT,
            particle_id INTEGER NOT NULL,
            atome_id TEXT NOT NULL,
            particle_key TEXT NOT NULL,
            version INTEGER NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_by TEXT,
            changed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(particle_id) REFERENCES particles(particle_id) ON DELETE CASCADE,
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_particles_versions_particle ON particles_versions(particle_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_particles_versions_atome ON particles_versions(atome_id)",
        [],
    )?;

    // =========================================================================
    // Table 4: snapshots - Complete snapshots of an atome at a point in time
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS snapshots (
            snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            project_id TEXT,
            snapshot_data TEXT NOT NULL,
            state_blob TEXT,
            label TEXT,
            snapshot_type TEXT DEFAULT 'manual',
            actor TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_atome ON snapshots(atome_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id)",
        [],
    )?;

    // =========================================================================
    // Table 5: events - Append-only event log
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            ts TEXT NOT NULL DEFAULT (datetime('now')),
            atome_id TEXT,
            project_id TEXT,
            kind TEXT NOT NULL,
            payload TEXT,
            actor TEXT,
            tx_id TEXT,
            gesture_id TEXT
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, ts)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_atome_ts ON events(atome_id, ts)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_tx ON events(tx_id)",
        [],
    )?;

    // =========================================================================
    // Table 6: state_current - Materialized projection cache
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS state_current (
            atome_id TEXT PRIMARY KEY,
            project_id TEXT,
            properties TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            version INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_state_current_project ON state_current(project_id)",
        [],
    )?;

    // =========================================================================
    // Table 7: permissions - Granular access control (per atome or particle)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            particle_key TEXT,
            principal_id TEXT NOT NULL,
            can_read INTEGER NOT NULL DEFAULT 1,
            can_write INTEGER NOT NULL DEFAULT 0,
            can_delete INTEGER NOT NULL DEFAULT 0,
            can_share INTEGER NOT NULL DEFAULT 0,
            can_create INTEGER NOT NULL DEFAULT 0,
            share_mode TEXT DEFAULT 'real-time',
            conditions TEXT,
            granted_by TEXT,
            granted_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT,
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
            FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_permissions_atome ON permissions(atome_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal_id)",
        [],
    )?;

    ensure_permissions_columns(&conn)?;
    ensure_snapshot_columns(&conn)?;

    // =========================================================================
    // Table 8: sync_queue - Persistent synchronization queue
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            target_server TEXT NOT NULL DEFAULT 'fastify',
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            last_attempt_at TEXT,
            next_retry_at TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at)",
        [],
    )?;

    // =========================================================================
    // Table 9: sync_state - Synchronization state per atome (with hash)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state (
            atome_id TEXT PRIMARY KEY,
            local_hash TEXT,
            remote_hash TEXT,
            local_version INTEGER DEFAULT 0,
            remote_version INTEGER DEFAULT 0,
            last_sync_at TEXT,
            sync_status TEXT DEFAULT 'unknown',
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    println!("ADOLE v3.0 database initialized (9 tables): {:?}", db_path);

    Ok(conn)
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

    match action {
        "create" => handle_create(message, user_id, state, request_id).await,
        "get" => handle_get(message, user_id, state, request_id).await,
        "list" => handle_list(message, user_id, state, request_id).await,
        "update" => handle_update(message, user_id, state, request_id).await,
        "delete" | "soft-delete" => handle_delete(message, user_id, state, request_id).await,
        "alter" => handle_alter(message, user_id, state, request_id).await,
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
    _user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    match action {
        "get" => handle_state_current_get(message, state, request_id).await,
        "list" => handle_state_current_list(message, state, request_id).await,
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
    // Debug: print received message
    println!(
        "[Create Debug] Received message: {}",
        serde_json::to_string_pretty(&message).unwrap_or_default()
    );

    // Support multiple field names for ID: id, atomeId, atome_id
    let atome_id = message
        .get("id")
        .or_else(|| message.get("atomeId"))
        .or_else(|| message.get("atome_id"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    println!("[Create Debug] Using atome_id: {}", atome_id);

    // Support multiple field names for type: atomeType, atome_type
    let atome_type = message
        .get("atomeType")
        .or_else(|| message.get("atome_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("generic");

    // Support multiple field names for parent: parentId, parent_id
    let parent_id = message
        .get("parentId")
        .or_else(|| message.get("parent_id"))
        .and_then(|v| v.as_str());

    // Support multiple field names for owner: userId, ownerId, owner_id
    // This allows sync operations to preserve the original owner
    let owner_id = message
        .get("userId")
        .or_else(|| message.get("ownerId"))
        .or_else(|| message.get("owner_id"))
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

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    if let Some(parent) = parent_id {
        if !can_create(&db, parent, user_id) {
            return error_response(request_id, "Access denied");
        }
    }

    // Insert or replace atome (upsert for sync operations)
    // Uses owner_id from message if provided, otherwise uses the logged-in user
    let mut insert_owner_id: Option<String> = None;
    let mut pending_owner_id: Option<String> = None;
    let mut insert_parent_id: Option<String> = parent_id.map(String::from);
    let mut pending_parent_id: Option<String> = None;

    if !owner_id.is_empty() && owner_id != "anonymous" {
        let owner_id_string = owner_id.to_string();
        let owner_exists = db.query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ?1",
            rusqlite::params![&owner_id_string],
            |_| Ok(()),
        ).is_ok();

        if owner_id_string == atome_id || !owner_exists {
            pending_owner_id = Some(owner_id_string);
        } else {
            insert_owner_id = Some(owner_id_string);
        }
    }

    if let Some(parent) = parent_id {
        let parent_string = parent.to_string();
        let parent_exists = db.query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ?1",
            rusqlite::params![&parent_string],
            |_| Ok(()),
        ).is_ok();

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
                println!("[Create Debug] Insert error: {}", e2);
                return error_response(request_id, &e2.to_string());
            }
        } else {
            println!("[Create Debug] Insert error: {}", e);
            return error_response(request_id, &e.to_string());
        }
    }

    if let Some(pending_owner) = pending_owner_id.as_ref() {
        let pending_value = serde_json::to_string(pending_owner).unwrap_or_else(|_| format!("\"{}\"", pending_owner));
        let _ = db.execute(
            "INSERT OR REPLACE INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?1, '_pending_owner_id', ?2, 'string', 1, ?3, ?3)",
            rusqlite::params![&atome_id, pending_value, &now],
        );
    }

    if let Some(pending_parent) = pending_parent_id.as_ref() {
        let pending_value = serde_json::to_string(pending_parent).unwrap_or_else(|_| format!("\"{}\"", pending_parent));
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
                println!(
                    "[Create Debug] Pending references resolved: {} ok, {} failed ({} total)",
                    summary.resolved, summary.failed, summary.total
                );
            } else if summary.resolved > 0 {
                println!("[Create Debug] Resolved {} pending references", summary.resolved);
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
    if let Err(err) = upsert_state_current_from_patch(&db, &atome_id, atome_type, parent_id, patch, &now) {
        println!("[Create Debug] state_current update failed: {}", err);
    }

    if let Some(parent) = parent_id {
        if let Err(err) = inherit_permissions_from_parent(&db, parent, &atome_id, Some(owner_id), user_id) {
            println!("[Create Debug] Permission inheritance failed: {}", err);
        }
    }

    println!(
        "[Create Debug] Successfully created/updated atome: {} with owner: {}",
        atome_id, owner_id
    );

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
    // Support both camelCase (atomeId) and snake_case (atome_id)
    let atome_id = match message
        .get("atomeId")
        .or_else(|| message.get("atome_id"))
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
    // Support both camelCase (atomeType) and snake_case (atome_type)
    let atome_type = message
        .get("atomeType")
        .or_else(|| message.get("atome_type"))
        .and_then(|v| v.as_str());
    let owner_id = message.get("ownerId").and_then(|v| v.as_str());
    let parent_id = message
        .get("parentId")
        .or_else(|| message.get("parent_id"))
        .or_else(|| message.get("parent"))
        .and_then(|v| v.as_str());
    let include_deleted = message
        .get("includeDeleted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    println!(
        "[Atome List Debug] atome_type={:?}, owner_id={:?}, user_id={}, includeDeleted={}",
        atome_type, owner_id, user_id, include_deleted
    );

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Determine effective owner - if anonymous or not specified, query by type only
    // SPECIAL CASE: For atome_type = 'user', always query all users regardless of owner
    // SPECIAL CASE: If ownerId = "*" or "all", query all atomes regardless of owner (for sync)
    let effective_owner = match (owner_id, atome_type) {
        // Sync mode: "*" or "all" means list all atomes
        (Some("*"), _) | (Some("all"), _) => None,
        // For user listing, ignore owner filtering to get all users
        (_, Some("user")) => None,
        // If ownerId is explicitly provided (not "*" or "all"), use it
        (Some(id), _) if !id.is_empty() && id != "anonymous" => Some(id),
        // No ownerId provided - default to logged-in user
        (None, _) => Some(user_id),
        _ => None,
    };

    // Build query based on whether we have an owner or just a type
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (effective_owner, atome_type) {
        (Some(owner), atome_type) => {
            let mut query = String::from(
                "SELECT DISTINCT a.atome_id
                 FROM atomes a
                 LEFT JOIN permissions perm
                   ON perm.atome_id = a.atome_id
                  AND perm.principal_id = ?1
                  AND perm.can_read = 1
                  AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
                 WHERE (a.owner_id = ?2 OR perm.permission_id IS NOT NULL
                   OR EXISTS (
                     SELECT 1 FROM particles p2
                     WHERE p2.atome_id = a.atome_id
                       AND p2.particle_key = '_pending_owner_id'
                       AND p2.particle_value = ?3
                   ))",
            );
            let pending_owner = serde_json::to_string(owner).unwrap_or_else(|_| format!("\"{}\"", owner));
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
        if let Ok(atome) = load_atome_with_deleted(&db, &id, None, include_deleted) {
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
    // Support both camelCase (atomeId) and snake_case (atome_id)
    let atome_id = match message
        .get("atomeId")
        .or_else(|| message.get("atome_id"))
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
    if let Err(err) = upsert_state_current_from_patch(&db, atome_id, &meta_type, meta_parent.as_deref(), patch, &now) {
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
    // Support both camelCase and snake_case
    let atome_id = match message
        .get("atomeId")
        .or_else(|| message.get("atome_id"))
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
    // Support both camelCase and snake_case
    let atome_id = match message
        .get("atomeId")
        .or_else(|| message.get("atome_id"))
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
    if let Err(err) = upsert_state_current_from_patch(&db, atome_id, &meta_type, meta_parent.as_deref(), patch, &now) {
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
struct EventRecord {
    id: String,
    ts: String,
    atome_id: Option<String>,
    project_id: Option<String>,
    kind: String,
    payload: Option<JsonValue>,
    actor: Option<JsonValue>,
    tx_id: Option<String>,
    gesture_id: Option<String>,
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
                    "atomeId": atome_id
                }));
            }
            return;
        }
    };
    let payload = format_sync_atome(&atome);
    broadcast_sync_event(json!({
        "type": sync_event_type(&event.kind),
        "atome": payload,
        "atomeId": atome_id
    }));
}

async fn handle_event_commit(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
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
        insert_event_record(conn, &normalized)?;
        let _ = apply_event_to_state_current(conn, &normalized)?;
        apply_event_to_atomes(conn, &normalized, user_id)?;
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
    let body = message.get("events").or_else(|| message.get("event")).cloned();
    let events = match body {
        Some(JsonValue::Array(list)) => list,
        _ => return error_response(request_id, "Missing events array"),
    };

    let tx_id = message
        .get("tx_id")
        .or_else(|| message.get("txId"))
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
        for evt in normalized_events.iter() {
            insert_event_record(conn, evt)?;
            let _ = apply_event_to_state_current(conn, evt)?;
            apply_event_to_atomes(conn, evt, user_id)?;
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
    _user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message
        .get("project_id")
        .or_else(|| message.get("projectId"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let atome_id = message
        .get("atome_id")
        .or_else(|| message.get("atomeId"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let tx_id = message
        .get("tx_id")
        .or_else(|| message.get("txId"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let gesture_id = message
        .get("gesture_id")
        .or_else(|| message.get("gestureId"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let since = message.get("since").and_then(|v| v.as_str()).map(String::from);
    let until = message.get("until").and_then(|v| v.as_str()).map(String::from);
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let order = message.get("order").and_then(|v| v.as_str()).unwrap_or("asc");

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
    let order_clause = if order.eq_ignore_ascii_case("desc") { "DESC" } else { "ASC" };

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
        Ok(iter) => iter.filter_map(|r| r.ok()).collect::<Vec<_>>(),
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
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("atomeId"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let row: Option<(String, Option<String>, Option<String>, String, i64)> = db
        .query_row(
            "SELECT atome_id, project_id, properties, updated_at, version FROM state_current WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()
        .unwrap_or(None);

    let state_payload = row.map(|(id, project_id, properties, updated_at, version)| {
        json!({
            "atome_id": id,
            "project_id": project_id,
            "properties": parse_json_value(properties.as_ref()),
            "updated_at": updated_at,
            "version": version
        })
    });

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
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message
        .get("project_id")
        .or_else(|| message.get("projectId"))
        .and_then(|v| v.as_str());
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let (query, params): (String, Vec<rusqlite::types::Value>) = if let Some(pid) = project_id {
        (
            "SELECT atome_id, project_id, properties, updated_at, version FROM state_current WHERE project_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?".to_string(),
            vec![
                rusqlite::types::Value::from(pid.to_string()),
                rusqlite::types::Value::from(limit),
                rusqlite::types::Value::from(offset),
            ],
        )
    } else {
        (
            "SELECT atome_id, project_id, properties, updated_at, version FROM state_current ORDER BY updated_at DESC LIMIT ? OFFSET ?".to_string(),
            vec![
                rusqlite::types::Value::from(limit),
                rusqlite::types::Value::from(offset),
            ],
        )
    };

    let mut stmt = match db.prepare(&query) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            let properties: Option<String> = row.get(2)?;
            Ok(json!({
                "atome_id": row.get::<_, String>(0)?,
                "project_id": row.get::<_, Option<String>>(1)?,
                "properties": parse_json_value(properties.as_ref()),
                "updated_at": row.get::<_, String>(3)?,
                "version": row.get::<_, i64>(4)?
            }))
        })
        .map_err(|e| e.to_string());

    let states = match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect::<Vec<_>>(),
        Err(e) => return error_response(request_id, &e),
    };

    let payload = json!({ "states": states });
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
        .or_else(|| event.get("atomeId"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let project_id = event
        .get("project_id")
        .or_else(|| event.get("projectId"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let payload = resolve_event_payload(event);

    let actor = event
        .get("actor")
        .cloned()
        .or_else(|| Some(json!({ "type": "user", "id": user_id })));

    let tx_id = event
        .get("tx_id")
        .or_else(|| event.get("txId"))
        .and_then(|v| v.as_str())
        .map(String::from)
        .or(default_tx_id);

    let gesture_id = event
        .get("gesture_id")
        .or_else(|| event.get("gestureId"))
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
        .or_else(|| patch.get("projectId"))
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
    if !patch.contains_key("type") && !patch.contains_key("atome_type") && !patch.contains_key("kind") {
        patch.insert("type".to_string(), JsonValue::String(atome_type.to_string()));
    }
    if let Some(parent) = parent_id {
        if !patch.contains_key("parent_id") && !patch.contains_key("parentId") {
            patch.insert("parent_id".to_string(), JsonValue::String(parent.to_string()));
        }
    }
    if let Some(project) = project_id {
        if !patch.contains_key("project_id") && !patch.contains_key("projectId") {
            patch.insert("project_id".to_string(), JsonValue::String(project.to_string()));
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
    let payload_patch = ensure_state_patch_fields(
        patch,
        atome_type,
        parent_id,
        project_id.as_deref(),
    );
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
    if !patch.contains_key("type") && !patch.contains_key("atome_type") && !patch.contains_key("kind") {
        let meta: Result<Option<(Option<String>, Option<String>)>, _> = db
            .query_row(
                "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?1",
                rusqlite::params![atome_id],
                |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional();
        if let Ok(Some((meta_type, meta_parent))) = meta {
            if let Some(meta_type) = meta_type {
                patch.insert("type".to_string(), JsonValue::String(meta_type));
            }
            if let Some(meta_parent) = meta_parent {
                if !patch.contains_key("parent_id") && !patch.contains_key("parentId") {
                    patch.insert("parent_id".to_string(), JsonValue::String(meta_parent));
                }
            }
        }
    }

    let existing: Option<(Option<String>, i64, Option<String>)> = db
        .query_row(
            "SELECT properties, version, project_id FROM state_current WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut current_props = parse_json_map(existing.as_ref().and_then(|row| row.0.as_ref()));
    for (key, value) in patch.into_iter() {
        current_props.insert(key, value);
    }

    let next_version = existing.as_ref().map(|row| row.1 + 1).unwrap_or(1);
    let project_id = event
        .project_id
        .clone()
        .or_else(|| existing.as_ref().and_then(|row| row.2.clone()));

    let props_json = serde_json::to_string(&current_props).map_err(|e| e.to_string())?;

    if existing.is_some() {
        db.execute(
            "UPDATE state_current SET properties = ?1, updated_at = ?2, version = ?3, project_id = COALESCE(?4, project_id) WHERE atome_id = ?5",
            rusqlite::params![props_json, event.ts, next_version, project_id, atome_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO state_current (atome_id, project_id, properties, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![atome_id, project_id, props_json, event.ts, next_version],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(Some(json!({
        "atome_id": atome_id,
        "project_id": project_id,
        "properties": JsonValue::Object(current_props),
        "updated_at": event.ts,
        "version": next_version
    })))
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
    let atome_type = atome_type.unwrap_or_else(|| "atome".to_string());

    let parent_id = patch
        .get("parent_id")
        .or_else(|| patch.get("parentId"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    let existing: Option<(String, Option<String>)> = db
        .query_row(
            "SELECT atome_id, atome_type FROM atomes WHERE atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

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

fn insert_event_record(db: &Connection, event: &EventRecord) -> Result<(), String> {
    let payload_json: Option<String> = match &event.payload {
        Some(payload) => Some(serde_json::to_string(payload).map_err(|e| e.to_string())?),
        None => None,
    };
    let actor_json: Option<String> = match &event.actor {
        Some(actor) => Some(serde_json::to_string(actor).map_err(|e| e.to_string())?),
        None => None,
    };
    db.execute(
        "INSERT INTO events (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            event.id,
            event.ts,
            event.atome_id,
            event.project_id,
            event.kind,
            payload_json,
            actor_json,
            event.tx_id,
            event.gesture_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn event_with_actor(event: EventRecord) -> JsonValue {
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
    let mut stmt = db
        .prepare("SELECT particle_key, particle_value FROM particles WHERE atome_id = ?1")
        .map_err(|e| e.to_string())?;

    let particles = stmt
        .query_map(rusqlite::params![atome_id], |row| {
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

#[derive(Debug)]
struct PermissionRow {
    can_read: i64,
    can_write: i64,
    can_delete: i64,
    can_share: i64,
    can_create: i64,
    expires_at: Option<String>,
    conditions: Option<String>,
}

fn parse_conditions(raw: &Option<String>) -> Option<serde_json::Value> {
    let value = raw.as_ref()?.trim();
    if value.is_empty() {
        return None;
    }
    serde_json::from_str(value).ok()
}

fn coerce_number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        serde_json::Value::String(s) => {
            if let Ok(num) = s.parse::<f64>() {
                return Some(num);
            }
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis() as f64);
            }
            None
        }
        _ => None,
    }
}

fn coerce_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        _ => value.to_string(),
    }
}

fn resolve_path<'a>(path: &str, context: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
    let mut current = context;
    for part in path.split('.') {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(part)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

fn compare_values(actual: Option<&serde_json::Value>, op: &str, expected: &serde_json::Value) -> bool {
    let actual = match actual {
        Some(val) => val,
        None => {
            return match op {
                "eq" => expected.is_null(),
                "ne" => !expected.is_null(),
                _ => false,
            };
        }
    };

    if op == "in" {
        if let serde_json::Value::Array(values) = expected {
            let left_num = coerce_number(actual);
            if let Some(left) = left_num {
                return values
                    .iter()
                    .filter_map(coerce_number)
                    .any(|candidate| candidate == left);
            }
            let left_str = coerce_string(actual);
            return values.iter().any(|candidate| coerce_string(candidate) == left_str);
        }
        return false;
    }

    let left_num = coerce_number(actual);
    let right_num = coerce_number(expected);
    if let (Some(left), Some(right)) = (left_num, right_num) {
        return match op {
            "eq" => left == right,
            "ne" => left != right,
            "gt" => left > right,
            "gte" => left >= right,
            "lt" => left < right,
            "lte" => left <= right,
            _ => false,
        };
    }

    let left_str = coerce_string(actual);
    let right_str = coerce_string(expected);
    match op {
        "eq" => left_str == right_str,
        "ne" => left_str != right_str,
        "gt" => left_str > right_str,
        "gte" => left_str >= right_str,
        "lt" => left_str < right_str,
        "lte" => left_str <= right_str,
        _ => false,
    }
}

fn evaluate_condition_node(node: &serde_json::Value, context: &serde_json::Value) -> bool {
    if node.is_null() {
        return true;
    }

    if let serde_json::Value::Array(children) = node {
        return children.iter().all(|child| evaluate_condition_node(child, context));
    }

    let obj = match node.as_object() {
        Some(map) => map,
        None => return true,
    };

    if let Some(serde_json::Value::Array(children)) = obj.get("all") {
        return children.iter().all(|child| evaluate_condition_node(child, context));
    }

    if let Some(serde_json::Value::Array(children)) = obj.get("any") {
        return children.iter().any(|child| evaluate_condition_node(child, context));
    }

    if obj.get("after").is_some() || obj.get("before").is_some() {
        let now = Utc::now().timestamp_millis() as f64;
        if let Some(after) = obj.get("after").and_then(coerce_number) {
            if now < after {
                return false;
            }
        }
        if let Some(before) = obj.get("before").and_then(coerce_number) {
            if now > before {
                return false;
            }
        }
        return true;
    }

    if let (Some(field), Some(op)) = (obj.get("field"), obj.get("op")) {
        if let (Some(field_str), Some(op_str)) = (field.as_str(), op.as_str()) {
            let actual = resolve_path(field_str, context);
            let expected = obj.get("value").unwrap_or(&serde_json::Value::Null);
            return compare_values(actual, op_str, expected);
        }
    }

    if let Some(serde_json::Value::Object(user_rules)) = obj.get("user") {
        return user_rules.iter().all(|(key, rule)| {
            let actual = resolve_path(&format!("user.{}", key), context);
            if let Some(rule_obj) = rule.as_object() {
                if let Some(op) = rule_obj.get("op").and_then(|v| v.as_str()) {
                    let expected = rule_obj.get("value").unwrap_or(&serde_json::Value::Null);
                    return compare_values(actual, op, expected);
                }
            }
            compare_values(actual, "eq", rule)
        });
    }

    if let Some(serde_json::Value::Object(atome_rules)) = obj.get("atome") {
        return atome_rules.iter().all(|(key, rule)| {
            let actual = resolve_path(&format!("atome.{}", key), context);
            if let Some(rule_obj) = rule.as_object() {
                if let Some(op) = rule_obj.get("op").and_then(|v| v.as_str()) {
                    let expected = rule_obj.get("value").unwrap_or(&serde_json::Value::Null);
                    return compare_values(actual, op, expected);
                }
            }
            compare_values(actual, "eq", rule)
        });
    }

    true
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
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)))
        .map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for row in rows.filter_map(|r| r.ok()) {
        total += 1;
        let (atome_id, particle_key, particle_value) = row;
        let pending_id: Option<String> = serde_json::from_str(&particle_value).ok().or(Some(particle_value.clone()));

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

        let exists = db.query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ?1",
            rusqlite::params![&pending_id],
            |_| Ok(()),
        ).is_ok();

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

    Ok(PendingResolveSummary { resolved, failed, total })
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
        if !child_owner_id.map(|id| id == parent_owner_id).unwrap_or(false) {
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

fn fetch_permission(db: &Connection, atome_id: &str, principal_id: &str) -> Option<PermissionRow> {
    db.query_row(
        "SELECT can_read, can_write, can_delete, can_share, can_create, expires_at, conditions
         FROM permissions
         WHERE atome_id = ?1 AND principal_id = ?2 AND (particle_key IS NULL OR particle_key = '')
         ORDER BY particle_key DESC LIMIT 1",
        rusqlite::params![atome_id, principal_id],
        |row| {
            Ok(PermissionRow {
                can_read: row.get(0)?,
                can_write: row.get(1)?,
                can_delete: row.get(2)?,
                can_share: row.get(3)?,
                can_create: row.get(4)?,
                expires_at: row.get(5)?,
                conditions: row.get(6)?,
            })
        },
    )
    .ok()
}

fn is_permission_active(
    db: &Connection,
    permission: &PermissionRow,
    principal_id: &str,
    atome_id: &str,
) -> bool {
    if let Some(expires_at) = &permission.expires_at {
        if let Ok(expiry) = chrono::DateTime::parse_from_rfc3339(expires_at) {
            if Utc::now() > expiry.with_timezone(&Utc) {
                return false;
            }
        }
    }

    let conditions = match parse_conditions(&permission.conditions) {
        Some(value) => value,
        None => return true,
    };

    let user_data = load_atome_with_deleted(db, principal_id, None, true)
        .map(|atome| atome.data)
        .unwrap_or_else(|_| serde_json::json!({}));
    let atome_data = load_atome_with_deleted(db, atome_id, None, true)
        .map(|atome| atome.data)
        .unwrap_or_else(|_| serde_json::json!({}));

    let context = serde_json::json!({
        "now": Utc::now().timestamp_millis(),
        "user": user_data,
        "atome": atome_data
    });

    evaluate_condition_node(&conditions, &context)
}

fn can_read(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    if let Some(owner_id) = get_owner_id(db, atome_id) {
        if owner_id == principal_id {
            return true;
        }
    }

    let perm = match fetch_permission(db, atome_id, principal_id) {
        Some(row) => row,
        None => return false,
    };

    if perm.can_read != 1 {
        return false;
    }
    is_permission_active(db, &perm, principal_id, atome_id)
}

fn can_write(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    if let Some(owner_id) = get_owner_id(db, atome_id) {
        if owner_id == principal_id {
            return true;
        }
    }

    let perm = match fetch_permission(db, atome_id, principal_id) {
        Some(row) => row,
        None => return false,
    };

    if perm.can_write != 1 {
        return false;
    }
    is_permission_active(db, &perm, principal_id, atome_id)
}

fn can_delete(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    if let Some(owner_id) = get_owner_id(db, atome_id) {
        if owner_id == principal_id {
            return true;
        }
    }

    let perm = match fetch_permission(db, atome_id, principal_id) {
        Some(row) => row,
        None => return false,
    };

    if perm.can_delete != 1 {
        return false;
    }
    is_permission_active(db, &perm, principal_id, atome_id)
}

fn can_create(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    if let Some(owner_id) = get_owner_id(db, atome_id) {
        if owner_id == principal_id {
            return true;
        }
    }

    let perm = match fetch_permission(db, atome_id, principal_id) {
        Some(row) => row,
        None => return false,
    };

    if perm.can_create != 1 && perm.can_share != 1 {
        return false;
    }
    is_permission_active(db, &perm, principal_id, atome_id)
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

pub fn create_state(data_dir: PathBuf) -> LocalAtomeState {
    let conn = init_database(&data_dir).expect("Failed to initialize ADOLE database");
    LocalAtomeState {
        db: Arc::new(Mutex::new(conn)),
    }
}
