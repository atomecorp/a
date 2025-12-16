// =============================================================================
// LOCAL ATOME MODULE - ADOLE v3.0 WebSocket-based storage for Tauri
// =============================================================================
// All operations via WebSocket messages, no HTTP routes
// Schema: atomes + particles (unified with Fastify)
// =============================================================================

use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

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
            snapshot_data TEXT NOT NULL,
            snapshot_type TEXT DEFAULT 'manual',
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

    // =========================================================================
    // Table 5: permissions - Granular access control (per atome or particle)
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

    // =========================================================================
    // Table 6: sync_queue - Persistent synchronization queue
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
    // Table 7: sync_state - Synchronization state per atome (with hash)
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

    println!("ADOLE v3.0 database initialized (7 tables): {:?}", db_path);

    Ok(conn)
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

    // Insert or replace atome (upsert for sync operations)
    if let Err(e) = db.execute(
        "INSERT OR REPLACE INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, created_at, updated_at, last_sync, created_source, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?4, COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?1), ?5), ?5, NULL, 'tauri', 'pending')",
        rusqlite::params![&atome_id, atome_type, parent_id, user_id, &now],
    ) {
        println!("[Create Debug] Insert error: {}", e);
        return error_response(request_id, &e.to_string());
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

    println!(
        "[Create Debug] Successfully created/updated atome: {}",
        atome_id
    );

    let atome = AtomeData {
        atome_id: atome_id.clone(),
        atome_type: atome_type.into(),
        parent_id: parent_id.map(String::from),
        owner_id: Some(user_id.into()),
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
    let atome_id = match message.get("atomeId").or_else(|| message.get("atome_id")).and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    match load_atome(&db, atome_id, Some(user_id)) {
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
    let effective_owner = match (owner_id.or(Some(user_id)), atome_type) {
        (Some(_), Some("user")) => {
            // For user listing, ignore owner filtering to get all users
            None
        }
        (Some(id), _) if id != "anonymous" && !id.is_empty() => Some(id),
        _ => None,
    };

    // Build WHERE clause for deleted_at based on includeDeleted
    let deleted_clause = if include_deleted {
        ""
    } else {
        "AND deleted_at IS NULL"
    };

    // Build query based on whether we have an owner or just a type
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (effective_owner, atome_type)
    {
        (Some(owner), Some(t)) => {
            // Filter by both owner and type
            (
                format!(
                    "SELECT atome_id, deleted_at FROM atomes WHERE owner_id = ?1 AND atome_type = ?2 {} ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    deleted_clause, limit, offset
                ),
                vec![Box::new(owner.to_string()), Box::new(t.to_string())]
            )
        }
        (Some(owner), None) => {
            // Filter by owner only
            (
                format!(
                    "SELECT atome_id, deleted_at FROM atomes WHERE owner_id = ?1 {} ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    deleted_clause, limit, offset
                ),
                vec![Box::new(owner.to_string())]
            )
        }
        (None, Some(t)) => {
            // Filter by type only (e.g., list all users)
            (
                format!(
                    "SELECT atome_id, deleted_at FROM atomes WHERE atome_type = ?1 {} ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    deleted_clause, limit, offset
                ),
                vec![Box::new(t.to_string())]
            )
        }
        (None, None) => {
            // No filter - return empty
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

    // Verify atome exists
    let owner: Result<String, _> = db.query_row(
        "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    // Only allow update if user is the owner
    // user_id is extracted from JWT token in mod.rs, so it's verified
    match owner {
        Ok(o) if o != user_id => {
            return error_response(request_id, "Access denied: only owner can modify")
        }
        Err(_) => return error_response(request_id, "Atome not found"),
        _ => {}
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

    // Soft delete with ownership check
    let result = db.execute(
        "UPDATE atomes SET deleted_at = ?1, sync_status = 'pending' 
         WHERE atome_id = ?2 AND owner_id = ?3 AND deleted_at IS NULL",
        rusqlite::params![&now, atome_id, user_id],
    );

    match result {
        Ok(0) => error_response(request_id, "Atome not found or access denied"),
        Ok(_) => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: true,
            error: None,
            data: None,
            atomes: None,
            count: None,
        },
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

    // Verify ownership
    let owner: Result<String, _> = db.query_row(
        "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match owner {
        Ok(o) if o != user_id => return error_response(request_id, "Access denied"),
        Err(_) => return error_response(request_id, "Atome not found"),
        _ => {}
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

    Ok(AtomeData {
        atome_id: row.0,
        atome_type: row.1,
        parent_id: row.2,
        owner_id: row.3,
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
