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
    pub owner_id: String,
    pub data: serde_json::Value,
    pub sync_status: String,
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
// =============================================================================

pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("adole.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    let _ = conn.execute_batch("PRAGMA journal_mode = WAL;");

    // Table 1: atomes
    conn.execute(
        "CREATE TABLE IF NOT EXISTS atomes (
            atome_id TEXT PRIMARY KEY,
            atome_type TEXT NOT NULL,
            parent_id TEXT,
            owner_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT,
            sync_status TEXT DEFAULT 'local',
            FOREIGN KEY(parent_id) REFERENCES atomes(atome_id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_type ON atomes(atome_type)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_sync ON atomes(sync_status)",
        [],
    )?;

    // Table 2: particles
    conn.execute(
        "CREATE TABLE IF NOT EXISTS particles (
            particle_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            particle_key TEXT NOT NULL,
            particle_value TEXT,
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

    // Table 3: particles_versions (history)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS particles_versions (
            version_id INTEGER PRIMARY KEY AUTOINCREMENT,
            particle_id INTEGER NOT NULL,
            atome_id TEXT NOT NULL,
            particle_key TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Table 4: permissions
    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            particle_key TEXT,
            principal_id TEXT NOT NULL,
            can_read INTEGER DEFAULT 1,
            can_write INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            can_share INTEGER DEFAULT 0,
            granted_by TEXT,
            granted_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT,
            FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
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

    // Table 5: sync_queue
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
            atome_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            next_retry_at TEXT
        )",
        [],
    )?;

    println!("ADOLE v3.0 database initialized: {:?}", db_path);

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
        "delete" => handle_delete(message, user_id, state, request_id).await,
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
    let atome_id = message
        .get("atome_id")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let atome_type = message
        .get("atome_type")
        .and_then(|v| v.as_str())
        .unwrap_or("generic");

    let parent_id = message.get("parent_id").and_then(|v| v.as_str());
    let data = message
        .get("data")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let now = Utc::now().to_rfc3339();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Insert atome
    if let Err(e) = db.execute(
        "INSERT INTO atomes (atome_id, atome_type, parent_id, owner_id, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'pending')",
        rusqlite::params![&atome_id, atome_type, parent_id, user_id, &now],
    ) {
        return error_response(request_id, &e.to_string());
    }

    // Insert particles from data
    if let Some(obj) = data.as_object() {
        for (key, value) in obj {
            let value_str = serde_json::to_string(value).unwrap_or_default();
            let _ = db.execute(
                "INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![&atome_id, key, &value_str, &now],
            );
        }
    }

    let atome = AtomeData {
        atome_id: atome_id.clone(),
        atome_type: atome_type.into(),
        parent_id: parent_id.map(String::from),
        owner_id: user_id.into(),
        data,
        sync_status: "pending".into(),
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
    let atome_id = match message.get("atome_id").and_then(|v| v.as_str()) {
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
    let atome_type = message.get("atomeType")
        .or_else(|| message.get("atome_type"))
        .and_then(|v| v.as_str());
    let owner_id = message.get("ownerId").and_then(|v| v.as_str());
    let limit = message.get("limit").and_then(|v| v.as_i64()).unwrap_or(100);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    
    println!("[Atome List Debug] atome_type={:?}, owner_id={:?}, user_id={}", atome_type, owner_id, user_id);

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Determine effective owner - if anonymous or not specified, query by type only
    let effective_owner = match owner_id.or(Some(user_id)) {
        Some(id) if id != "anonymous" && !id.is_empty() => Some(id),
        _ => None,
    };

    // Build query based on whether we have an owner or just a type
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (effective_owner, atome_type)
    {
        (Some(owner), Some(t)) => {
            // Filter by both owner and type
            (
                format!(
                    "SELECT atome_id FROM atomes WHERE owner_id = ?1 AND atome_type = ?2 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ),
                vec![Box::new(owner.to_string()), Box::new(t.to_string())]
            )
        }
        (Some(owner), None) => {
            // Filter by owner only
            (
                format!(
                    "SELECT atome_id FROM atomes WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
                ),
                vec![Box::new(owner.to_string())]
            )
        }
        (None, Some(t)) => {
            // Filter by type only (e.g., list all users)
            (
                format!(
                    "SELECT atome_id FROM atomes WHERE atome_type = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                    limit, offset
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
        if let Ok(atome) = load_atome(&db, &id, None) {
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
    let atome_id = match message.get("atome_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let data = message
        .get("data")
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
    let atome_id = match message.get("atome_id").and_then(|v| v.as_str()) {
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
    let atome_id = match message.get("atome_id").and_then(|v| v.as_str()) {
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

            // Upsert particle
            let _ = db.execute(
                "INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                    particle_value = excluded.particle_value,
                    updated_at = excluded.updated_at",
                rusqlite::params![atome_id, key, &value_str, &now],
            );

            // Record history
            if let Some(old) = old_value {
                let particle_id: i64 = db
                    .query_row(
                        "SELECT particle_id FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
                        rusqlite::params![atome_id, key],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let _ = db.execute(
                    "INSERT INTO particles_versions (particle_id, atome_id, particle_key, old_value, new_value, changed_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![particle_id, atome_id, key, &old, &value_str, &now],
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
    let query = if owner_filter.is_some() {
        "SELECT atome_id, atome_type, parent_id, owner_id, sync_status, created_at, updated_at, deleted_at
         FROM atomes WHERE atome_id = ?1 AND owner_id = ?2 AND deleted_at IS NULL"
    } else {
        "SELECT atome_id, atome_type, parent_id, owner_id, sync_status, created_at, updated_at, deleted_at
         FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL"
    };

    let row: (
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        Option<String>,
    ) = if let Some(owner) = owner_filter {
        db.query_row(query, rusqlite::params![atome_id, owner], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            ))
        })
    } else {
        db.query_row(query, rusqlite::params![atome_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
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
        sync_status: row.4,
        created_at: row.5,
        updated_at: row.6,
        deleted_at: row.7,
        data: serde_json::Value::Object(data_map),
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
