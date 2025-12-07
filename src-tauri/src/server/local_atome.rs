// =============================================================================
// LOCAL ATOME MODULE - SQLite-based atome storage for Tauri
// =============================================================================
// This module provides CRUD operations for atomes stored locally in SQLite
// Mirrors the API of server/atomeRoutes.orm.js for Fastify
// =============================================================================

use axum::{
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::Utc;
use jsonwebtoken::{decode, DecodingKey, Validation};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

// =============================================================================
// CONSTANTS & TYPES
// =============================================================================

/// Default tenant ID for local storage
const DEFAULT_TENANT_ID: &str = "local-tenant";

#[derive(Clone)]
pub struct LocalAtomeState {
    pub db: Arc<Mutex<Connection>>,
    pub jwt_secret: String,
}

// =============================================================================
// JWT CLAIMS (shared with local_auth)
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,      // User ID
    username: String,
    phone: String,
    exp: usize,
    iat: usize,
}

// =============================================================================
// REQUEST/RESPONSE TYPES (ADOLE-compliant)
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateAtomeRequest {
    pub id: Option<String>,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(rename = "type", default = "default_type")]
    pub atome_type: String,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub properties: Option<serde_json::Value>,
    #[serde(default)]
    pub snapshot: Option<serde_json::Value>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(rename = "parentId", alias = "parent_id")]
    pub parent_id: Option<String>,
    #[serde(rename = "logicalClock", alias = "logical_clock", default = "default_version")]
    pub logical_clock: i64,
    #[serde(rename = "deviceId", alias = "device_id")]
    pub device_id: Option<String>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

fn default_kind() -> String { "generic".to_string() }
fn default_type() -> String { "atome".to_string() }
fn default_version() -> i64 { 1 }

#[derive(Debug, Deserialize)]
pub struct UpdateAtomeRequest {
    pub data: Option<serde_json::Value>,
    pub snapshot: Option<serde_json::Value>,
    pub kind: Option<String>,
    #[serde(rename = "parentId", alias = "parent_id")]
    pub parent_id: Option<String>,
    #[serde(rename = "logicalClock", alias = "logical_clock")]
    pub logical_clock: Option<i64>,
    #[serde(rename = "deviceId", alias = "device_id")]
    pub device_id: Option<String>,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub kind: Option<String>,
    #[serde(rename = "parentId", alias = "parent_id")]
    pub parent_id: Option<String>,
    #[serde(rename = "syncStatus", alias = "sync_status")]
    pub sync_status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AtomeResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atome: Option<AtomeData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<AtomeData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atomes: Option<Vec<AtomeData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AtomeData {
    pub id: String,
    pub kind: String,
    #[serde(rename = "type")]
    pub atome_type: String,
    pub data: serde_json::Value,
    pub snapshot: serde_json::Value,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    #[serde(rename = "ownerId")]
    pub owner_id: String,
    #[serde(rename = "logicalClock")]
    pub logical_clock: i64,
    #[serde(rename = "syncStatus")]
    pub sync_status: String,
    #[serde(rename = "deviceId")]
    pub device_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
}

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/// Initialize SQLite database for local atomes
pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("local_atomes.db");

    // Create data directory if it doesn't exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;

    // Create atomes table (ADOLE-compliant schema)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS atomes (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'local-tenant',
            kind TEXT NOT NULL DEFAULT 'atome',
            type TEXT NOT NULL DEFAULT 'atome',
            owner_id TEXT NOT NULL,
            parent_id TEXT,
            data TEXT NOT NULL DEFAULT '{}',
            snapshot TEXT NOT NULL DEFAULT '{}',
            logical_clock INTEGER NOT NULL DEFAULT 1,
            schema_version INTEGER NOT NULL DEFAULT 1,
            device_id TEXT,
            sync_status TEXT NOT NULL DEFAULT 'pending',
            is_local INTEGER NOT NULL DEFAULT 1,
            deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            last_sync TEXT,
            meta TEXT DEFAULT '{}'
        )",
        [],
    )?;

    // Create sync_queue table (ADOLE-compliant)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'local-tenant',
            object_id TEXT NOT NULL,
            device_id TEXT,
            action TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            target TEXT NOT NULL DEFAULT 'both',
            status TEXT NOT NULL DEFAULT 'pending',
            retries INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL,
            sent_at TEXT,
            acked_at TEXT
        )",
        [],
    )?;

    // Run migrations BEFORE creating indexes (to add missing columns)
    run_migrations(&conn)?;

    // Create indexes for faster lookups (AFTER migrations to ensure columns exist)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_kind ON atomes(kind)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_atomes_sync_status ON atomes(sync_status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_queue_object ON sync_queue(object_id)",
        [],
    )?;

    println!("📦 Local atomes database initialized (ADOLE-compliant): {:?}", db_path);

    Ok(conn)
}

/// Run database migrations for schema updates
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Get list of existing columns
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(atomes)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    println!("📦 Checking atomes table columns: {:?}", columns);

    // Add missing columns one by one
    let migrations: Vec<(&str, &str)> = vec![
        ("logical_clock", "ALTER TABLE atomes ADD COLUMN logical_clock INTEGER NOT NULL DEFAULT 1"),
        ("schema_version", "ALTER TABLE atomes ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1"),
        ("device_id", "ALTER TABLE atomes ADD COLUMN device_id TEXT"),
        ("sync_status", "ALTER TABLE atomes ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'"),
        ("is_local", "ALTER TABLE atomes ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1"),
        ("last_sync", "ALTER TABLE atomes ADD COLUMN last_sync TEXT"),
        ("meta", "ALTER TABLE atomes ADD COLUMN meta TEXT DEFAULT '{}'"),
        ("snapshot", "ALTER TABLE atomes ADD COLUMN snapshot TEXT NOT NULL DEFAULT '{}'"),
        ("type", "ALTER TABLE atomes ADD COLUMN type TEXT NOT NULL DEFAULT 'atome'"),
        ("tenant_id", "ALTER TABLE atomes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'local-tenant'"),
        ("deleted", "ALTER TABLE atomes ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0"),
        ("deleted_at", "ALTER TABLE atomes ADD COLUMN deleted_at TEXT"),
    ];

    for (column_name, sql) in migrations {
        if !columns.contains(&column_name.to_string()) {
            println!("📦 Migration: adding column '{}' to atomes table", column_name);
            if let Err(e) = conn.execute(sql, []) {
                println!("⚠️ Migration warning for '{}': {}", column_name, e);
                // Continue with other migrations even if one fails
            }
        }
    }

    Ok(())
}

/// Get JWT secret from the auth database directory
fn get_jwt_secret(data_dir: &PathBuf) -> String {
    // First check environment variable
    if let Ok(secret) = std::env::var("LOCAL_JWT_SECRET") {
        return secret;
    }

    // Try to load from file (same file as local_auth uses)
    let secret_path = data_dir.join("jwt_secret.key");

    if secret_path.exists() {
        if let Ok(secret) = std::fs::read_to_string(&secret_path) {
            let secret = secret.trim().to_string();
            if !secret.is_empty() {
                return secret;
            }
        }
    }

    // Fallback: generate a temporary secret (not ideal, but won't crash)
    println!("⚠️ JWT secret not found, using temporary secret");
    "temporary-secret-for-development".to_string()
}

// =============================================================================
// JWT VALIDATION HELPER
// =============================================================================

fn validate_jwt(auth_header: Option<&str>, jwt_secret: &str) -> Result<Claims, (StatusCode, Json<AtomeResponse>)> {
    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(AtomeResponse {
                    success: false,
                    error: Some("Missing or invalid Authorization header".into()),
                    message: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: None,
                }),
            ));
        }
    };

    let validation = Validation::default();
    match decode::<Claims>(token, &DecodingKey::from_secret(jwt_secret.as_bytes()), &validation) {
        Ok(data) => Ok(data.claims),
        Err(e) => {
            Err((
                StatusCode::UNAUTHORIZED,
                Json(AtomeResponse {
                    success: false,
                    error: Some(format!("Invalid token: {}", e)),
                    message: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: None,
                }),
            ))
        }
    }
}

/// JWT validation helper for sync handlers (returns SyncResponse on error)
fn validate_jwt_for_sync(auth_header: Option<&str>, jwt_secret: &str) -> Result<Claims, (StatusCode, Json<SyncResponse>)> {
    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(SyncResponse {
                    success: false,
                    error: Some("Missing or invalid Authorization header".into()),
                    message: None,
                    synced: None,
                    conflicts: None,
                    atomes: None,
                }),
            ));
        }
    };

    let validation = Validation::default();
    match decode::<Claims>(token, &DecodingKey::from_secret(jwt_secret.as_bytes()), &validation) {
        Ok(data) => Ok(data.claims),
        Err(e) => {
            Err((
                StatusCode::UNAUTHORIZED,
                Json(SyncResponse {
                    success: false,
                    error: Some(format!("Invalid token: {}", e)),
                    message: None,
                    synced: None,
                    conflicts: None,
                    atomes: None,
                }),
            ))
        }
    }
}

// =============================================================================
// ATOME HANDLERS
// =============================================================================

/// POST /api/atome/create
async fn create_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<CreateAtomeRequest>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    // Generate or validate ID
    let atome_id = match &req.id {
        Some(id) => {
            // Validate it's a valid UUID
            match Uuid::parse_str(id) {
                Ok(_) => id.clone(),
                Err(_) => Uuid::new_v4().to_string(),
            }
        }
        None => Uuid::new_v4().to_string(),
    };

    let now = Utc::now().to_rfc3339();
    
    // Merge data and properties - properties takes precedence, then data
    // Also include tag in the final data if provided
    let mut final_data = serde_json::Map::new();
    
    // First, merge data if provided
    if let Some(data) = &req.data {
        if let Some(obj) = data.as_object() {
            for (k, v) in obj {
                final_data.insert(k.clone(), v.clone());
            }
        }
    }
    
    // Then, merge properties if provided (takes precedence)
    if let Some(properties) = &req.properties {
        if let Some(obj) = properties.as_object() {
            for (k, v) in obj {
                final_data.insert(k.clone(), v.clone());
            }
        }
    }
    
    // Include tag at top level of data if provided
    if let Some(tag) = &req.tag {
        final_data.insert("tag".to_string(), serde_json::Value::String(tag.clone()));
    }
    
    let final_data_value = serde_json::Value::Object(final_data.clone());
    let data_json = serde_json::to_string(&final_data_value).unwrap_or_else(|_| "{}".to_string());
    
    // Use snapshot if provided, otherwise use final_data
    let snapshot_value = req.snapshot.clone().unwrap_or_else(|| final_data_value.clone());
    let snapshot_json = serde_json::to_string(&snapshot_value).unwrap_or_else(|_| "{}".to_string());
    
    // Meta data
    let meta_json = req.meta.as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|| "{}".to_string());
    
    // Device ID from request or header
    let device_id = req.device_id.clone()
        .or_else(|| headers.get("x-device-id").and_then(|h| h.to_str().ok()).map(|s| s.to_string()));

    // Insert into database with ADOLE fields
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT INTO atomes (id, tenant_id, kind, type, owner_id, parent_id, data, snapshot, 
             logical_clock, device_id, sync_status, meta, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                &atome_id,
                DEFAULT_TENANT_ID,
                &req.kind,
                &req.atome_type,
                &claims.sub,
                &req.parent_id,
                &data_json,
                &snapshot_json,
                &req.logical_clock,
                &device_id,
                "synced",
                &meta_json,
                &now,
                &now
            ],
        ) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AtomeResponse {
                    success: false,
                    error: Some(format!("Failed to create atome: {}", e)),
                    message: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: None,
                }),
            );
        }
    }

    println!("✨ Created atome {} (kind: {}, v{}) for user {}", atome_id, req.kind, req.logical_clock, claims.sub);

    let atome_data = AtomeData {
        id: atome_id,
        kind: req.kind,
        atome_type: req.atome_type,
        data: final_data_value,
        snapshot: snapshot_value,
        parent_id: req.parent_id,
        owner_id: claims.sub,
        logical_clock: req.logical_clock,
        sync_status: "synced".to_string(),
        device_id,
        created_at: now.clone(),
        updated_at: now,
        meta: req.meta,
    };

    (
        StatusCode::CREATED,
        Json(AtomeResponse {
            success: true,
            message: Some("Atome created successfully".into()),
            error: None,
            atome: Some(atome_data.clone()),
            data: Some(atome_data),
            atomes: None,
            total: None,
        }),
    )
}

/// GET /api/atome/list
async fn list_atomes_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);

    // Build query
    let db = state.db.lock().unwrap();
    
    // Build WHERE clause
    let mut conditions = vec!["owner_id = ?1".to_string(), "deleted = 0".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(claims.sub.clone())];
    let mut param_idx = 2;

    if let Some(ref kind) = query.kind {
        conditions.push(format!("kind = ?{}", param_idx));
        params.push(Box::new(kind.clone()));
        param_idx += 1;
    }

    if let Some(ref parent_id) = query.parent_id {
        conditions.push(format!("parent_id = ?{}", param_idx));
        params.push(Box::new(parent_id.clone()));
        param_idx += 1;
    }

    if let Some(ref sync_status) = query.sync_status {
        conditions.push(format!("sync_status = ?{}", param_idx));
        params.push(Box::new(sync_status.clone()));
        // param_idx += 1;
    }

    let where_clause = conditions.join(" AND ");

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM atomes WHERE {}", where_clause);
    let total: i64 = {
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        db.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))
            .unwrap_or(0)
    };

    // Fetch atomes with ADOLE fields
    let select_sql = format!(
        "SELECT id, kind, COALESCE(type, 'atome'), owner_id, parent_id, data, 
                COALESCE(snapshot, data), COALESCE(logical_clock, 1), 
                COALESCE(sync_status, 'synced'), device_id, 
                created_at, updated_at, meta
         FROM atomes 
         WHERE {} 
         ORDER BY created_at DESC 
         LIMIT {} OFFSET {}",
        where_clause, limit, offset
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = match db.prepare(&select_sql) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AtomeResponse {
                    success: false,
                    error: Some(format!("Database error: {}", e)),
                    message: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: None,
                }),
            );
        }
    };

    let atomes: Vec<AtomeData> = match stmt.query_map(params_refs.as_slice(), |row| {
        let data_str: String = row.get(5)?;
        let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
        let snapshot_str: String = row.get(6)?;
        let snapshot: serde_json::Value = serde_json::from_str(&snapshot_str).unwrap_or(data.clone());
        let meta_str: Option<String> = row.get(12)?;
        let meta: Option<serde_json::Value> = meta_str.and_then(|s| serde_json::from_str(&s).ok());
        
        Ok(AtomeData {
            id: row.get(0)?,
            kind: row.get(1)?,
            atome_type: row.get(2)?,
            owner_id: row.get(3)?,
            parent_id: row.get(4)?,
            data,
            snapshot,
            logical_clock: row.get(7)?,
            sync_status: row.get(8)?,
            device_id: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            meta,
        })
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AtomeResponse {
                    success: false,
                    error: Some(format!("Query error: {}", e)),
                    message: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: None,
                }),
            );
        }
    };

    (
        StatusCode::OK,
        Json(AtomeResponse {
            success: true,
            message: None,
            error: None,
            atome: None,
            data: None,
            atomes: Some(atomes),
            total: Some(total),
        }),
    )
}

/// GET /api/atome/:id
async fn get_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();
    
    let result = db.query_row(
        "SELECT id, kind, COALESCE(type, 'atome'), owner_id, parent_id, data, 
                COALESCE(snapshot, data), COALESCE(logical_clock, 1), 
                COALESCE(sync_status, 'synced'), device_id, 
                created_at, updated_at, meta
         FROM atomes 
         WHERE id = ?1 AND owner_id = ?2 AND deleted = 0",
        rusqlite::params![&id, &claims.sub],
        |row| {
            let data_str: String = row.get(5)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            let snapshot_str: String = row.get(6)?;
            let snapshot: serde_json::Value = serde_json::from_str(&snapshot_str).unwrap_or(data.clone());
            let meta_str: Option<String> = row.get(12)?;
            let meta: Option<serde_json::Value> = meta_str.and_then(|s| serde_json::from_str(&s).ok());
            
            Ok(AtomeData {
                id: row.get(0)?,
                kind: row.get(1)?,
                atome_type: row.get(2)?,
                owner_id: row.get(3)?,
                parent_id: row.get(4)?,
                data,
                snapshot,
                logical_clock: row.get(7)?,
                sync_status: row.get(8)?,
                device_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                meta,
            })
        },
    );

    match result {
        Ok(atome) => (
            StatusCode::OK,
            Json(AtomeResponse {
                success: true,
                message: None,
                error: None,
                atome: Some(atome.clone()),
                data: Some(atome),
                atomes: None,
                total: None,
            }),
        ),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(AtomeResponse {
                success: false,
                error: Some("Atome not found".into()),
                message: None,
                atome: None,
                data: None,
                atomes: None,
                total: None,
            }),
        ),
    }
}

/// PUT /api/atome/:id
async fn update_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<UpdateAtomeRequest>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();

    // First check if atome exists and belongs to user
    let existing: Result<(String, String, Option<String>, String), _> = db.query_row(
        "SELECT kind, data, parent_id, owner_id FROM atomes WHERE id = ?1 AND owner_id = ?2 AND deleted = 0",
        rusqlite::params![&id, &claims.sub],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );

    let (current_kind, current_data_str, current_parent_id, _owner_id) = match existing {
        Ok(data) => data,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(AtomeResponse {
                    success: false,
                    error: Some("Atome not found".into()),
                    message: None,
                    atome: None,
                    atomes: None,
                    total: None,
                    data: None,
                }),
            );
        }
    };

    // Merge data if provided
    let new_data = if let Some(ref data) = req.data {
        let current: serde_json::Value = serde_json::from_str(&current_data_str).unwrap_or(serde_json::json!({}));
        let mut merged = current.clone();
        if let (Some(m), Some(d)) = (merged.as_object_mut(), data.as_object()) {
            for (k, v) in d {
                m.insert(k.clone(), v.clone());
            }
        }
        merged
    } else {
        serde_json::from_str(&current_data_str).unwrap_or(serde_json::json!({}))
    };

    let new_kind = req.kind.unwrap_or(current_kind);
    let new_parent_id = req.parent_id.or(current_parent_id);
    let data_json = serde_json::to_string(&new_data).unwrap_or_else(|_| "{}".to_string());

    // Get current logical_clock and increment
    let current_clock: i64 = db.query_row(
        "SELECT logical_clock FROM atomes WHERE id = ?1",
        rusqlite::params![&id],
        |row| row.get(0),
    ).unwrap_or(1);
    let new_clock = current_clock + 1;

    // Get device_id from request or use "local"
    let device_id = req.device_id.clone().unwrap_or_else(|| "local".to_string());

    // Update with ADOLE fields
    if let Err(e) = db.execute(
        "UPDATE atomes SET kind = ?1, data = ?2, parent_id = ?3, updated_at = ?4, logical_clock = ?5, device_id = ?6, sync_status = 'pending' WHERE id = ?7",
        rusqlite::params![&new_kind, &data_json, &new_parent_id, &now, &new_clock, &device_id, &id],
    ) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AtomeResponse {
                success: false,
                error: Some(format!("Failed to update atome: {}", e)),
                message: None,
                atome: None,
                atomes: None,
                total: None,
                data: None,
            }),
        );
    }

    println!("📝 Updated atome {} (v{}) for user {}", id, new_clock, claims.sub);

    // Fetch updated atome with ADOLE fields
    let updated = db.query_row(
        "SELECT id, kind, type, owner_id, parent_id, data, snapshot, logical_clock, sync_status, device_id, created_at, updated_at, meta FROM atomes WHERE id = ?1",
        rusqlite::params![&id],
        |row| {
            let data_str: String = row.get(5)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            let snapshot_str: String = row.get(6)?;
            let snapshot: serde_json::Value = serde_json::from_str(&snapshot_str).unwrap_or(data.clone());
            let meta_str: Option<String> = row.get(12)?;
            let meta: Option<serde_json::Value> = meta_str.and_then(|s| serde_json::from_str(&s).ok());
            
            Ok(AtomeData {
                id: row.get(0)?,
                kind: row.get(1)?,
                atome_type: row.get(2)?,
                owner_id: row.get(3)?,
                parent_id: row.get(4)?,
                data,
                snapshot,
                logical_clock: row.get(7)?,
                sync_status: row.get(8)?,
                device_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                meta,
            })
        },
    );

    match updated {
        Ok(atome) => (
            StatusCode::OK,
            Json(AtomeResponse {
                success: true,
                message: Some("Atome updated successfully".into()),
                error: None,
                atome: Some(atome),
                atomes: None,
                total: None,
                data: None,
            }),
        ),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AtomeResponse {
                success: false,
                error: Some("Failed to fetch updated atome".into()),
                message: None,
                atome: None,
                atomes: None,
                total: None,
                data: None,
            }),
        ),
    }
}

/// DELETE /api/atome/:id
async fn delete_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();

    // Get current logical_clock and increment
    let current_clock: i64 = db.query_row(
        "SELECT logical_clock FROM atomes WHERE id = ?1",
        rusqlite::params![&id],
        |row| row.get(0),
    ).unwrap_or(1);
    let new_clock = current_clock + 1;

    // Soft delete (matching ADOLE/Eden pattern) with sync_status = pending
    let result = db.execute(
        "UPDATE atomes SET deleted = 1, deleted_at = ?1, updated_at = ?1, logical_clock = ?2, sync_status = 'pending' WHERE id = ?3 AND owner_id = ?4 AND deleted = 0",
        rusqlite::params![&now, &new_clock, &id, &claims.sub],
    );

    match result {
        Ok(rows) if rows > 0 => {
            println!("🗑️ Deleted atome {} (v{}) for user {}", id, new_clock, claims.sub);
            (
                StatusCode::OK,
                Json(AtomeResponse {
                    success: true,
                    message: Some("Atome deleted successfully".into()),
                    error: None,
                    atome: None,
                    atomes: None,
                    total: None,
                    data: None,
                }),
            )
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(AtomeResponse {
                success: false,
                error: Some("Atome not found".into()),
                message: None,
                atome: None,
                atomes: None,
                total: None,
                data: None,
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AtomeResponse {
                success: false,
                error: Some(format!("Failed to delete atome: {}", e)),
                message: None,
                atome: None,
                atomes: None,
                total: None,
                data: None,
            }),
        ),
    }
}

// =============================================================================
// ROUTER
// =============================================================================
// SYNC HANDLERS
// =============================================================================

/// Request for sync push (receive changes from cloud)
#[derive(Debug, Deserialize)]
pub struct SyncPushRequest {
    pub atomes: Vec<SyncAtomeData>,
}

/// Data for sync operations
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SyncAtomeData {
    pub id: String,
    pub kind: String,
    #[serde(rename = "type")]
    pub atome_type: String,
    pub data: serde_json::Value,
    pub snapshot: serde_json::Value,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    #[serde(rename = "ownerId")]
    pub owner_id: String,
    #[serde(rename = "logicalClock")]
    pub logical_clock: i64,
    #[serde(rename = "syncStatus")]
    pub sync_status: String,
    #[serde(rename = "deviceId")]
    pub device_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default)]
    pub deleted: bool,
}

/// Response for sync operations
#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicts: Option<Vec<SyncConflict>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atomes: Option<Vec<AtomeData>>,
}

/// Sync conflict information
#[derive(Debug, Serialize)]
pub struct SyncConflict {
    pub id: String,
    #[serde(rename = "localClock")]
    pub local_clock: i64,
    #[serde(rename = "remoteClock")]
    pub remote_clock: i64,
    pub resolution: String,
}

/// POST /api/sync/push - Receive changes from cloud and apply locally
async fn sync_push_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<SyncPushRequest>,
) -> impl IntoResponse {
    // Validate JWT using sync-specific validation
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt_for_sync(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();
    let mut synced = 0i64;
    let mut conflicts: Vec<SyncConflict> = Vec::new();

    for atome in req.atomes {
        // Check if atome exists locally
        let existing: Result<(i64, String), _> = db.query_row(
            "SELECT logical_clock, sync_status FROM atomes WHERE id = ?1",
            rusqlite::params![&atome.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );

        match existing {
            Ok((local_clock, local_status)) => {
                // Conflict detection: both have pending changes
                if local_status == "pending" && atome.logical_clock > local_clock {
                    // Remote is newer, accept remote but log conflict
                    conflicts.push(SyncConflict {
                        id: atome.id.clone(),
                        local_clock,
                        remote_clock: atome.logical_clock,
                        resolution: "remote_wins".to_string(),
                    });
                }

                // Only update if remote is newer
                if atome.logical_clock > local_clock {
                    let data_json = serde_json::to_string(&atome.data).unwrap_or_else(|_| "{}".to_string());
                    let snapshot_json = serde_json::to_string(&atome.snapshot).unwrap_or_else(|_| data_json.clone());
                    let meta_json = atome.meta.as_ref().map(|m| serde_json::to_string(m).unwrap_or_else(|_| "null".to_string()));

                    if atome.deleted {
                        // Soft delete
                        let _ = db.execute(
                            "UPDATE atomes SET deleted = 1, deleted_at = ?1, updated_at = ?1, logical_clock = ?2, sync_status = 'synced' WHERE id = ?3",
                            rusqlite::params![&now, &atome.logical_clock, &atome.id],
                        );
                    } else {
                        // Update
                        let _ = db.execute(
                            "UPDATE atomes SET kind = ?1, type = ?2, data = ?3, snapshot = ?4, parent_id = ?5, logical_clock = ?6, device_id = ?7, updated_at = ?8, meta = ?9, sync_status = 'synced' WHERE id = ?10",
                            rusqlite::params![
                                &atome.kind,
                                &atome.atome_type,
                                &data_json,
                                &snapshot_json,
                                &atome.parent_id,
                                &atome.logical_clock,
                                &atome.device_id,
                                &now,
                                &meta_json,
                                &atome.id
                            ],
                        );
                    }
                    synced += 1;
                }
            }
            Err(_) => {
                // Atome doesn't exist locally, create it
                let data_json = serde_json::to_string(&atome.data).unwrap_or_else(|_| "{}".to_string());
                let snapshot_json = serde_json::to_string(&atome.snapshot).unwrap_or_else(|_| data_json.clone());
                let meta_json = atome.meta.as_ref().map(|m| serde_json::to_string(m).unwrap_or_else(|_| "null".to_string()));
                let deleted_at: Option<String> = if atome.deleted { Some(now.clone()) } else { None };

                let _ = db.execute(
                    "INSERT INTO atomes (id, tenant_id, kind, type, owner_id, parent_id, data, snapshot, logical_clock, schema_version, device_id, sync_status, meta, created_at, updated_at, deleted, deleted_at)
                     VALUES (?1, 'local-tenant', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, 'synced', ?10, ?11, ?12, ?13, ?14)",
                    rusqlite::params![
                        &atome.id,
                        &atome.kind,
                        &atome.atome_type,
                        &atome.owner_id,
                        &atome.parent_id,
                        &data_json,
                        &snapshot_json,
                        &atome.logical_clock,
                        &atome.device_id,
                        &meta_json,
                        &atome.created_at,
                        &now,
                        &atome.deleted,
                        &deleted_at
                    ],
                );
                synced += 1;
            }
        }
    }

    println!("🔄 Sync push: {} atomes synced, {} conflicts for user {}", synced, conflicts.len(), claims.sub);

    (
        StatusCode::OK,
        Json(SyncResponse {
            success: true,
            message: Some(format!("Synced {} atomes", synced)),
            error: None,
            synced: Some(synced),
            conflicts: if conflicts.is_empty() { None } else { Some(conflicts) },
            atomes: None,
        }),
    )
}

/// GET /api/sync/pull - Get pending local changes to send to cloud
async fn sync_pull_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<SyncPullQuery>,
) -> impl IntoResponse {
    // Validate JWT using sync-specific validation
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt_for_sync(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();

    // Get all pending atomes for this user since last sync
    let since_clock = query.since.unwrap_or(0);
    
    let mut stmt = match db.prepare(
        "SELECT id, kind, type, owner_id, parent_id, data, snapshot, logical_clock, sync_status, device_id, created_at, updated_at, meta, deleted
         FROM atomes WHERE owner_id = ?1 AND (sync_status = 'pending' OR logical_clock > ?2) AND deleted = 0"
    ) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SyncResponse {
                    success: false,
                    error: Some(format!("Database error: {}", e)),
                    message: None,
                    synced: None,
                    conflicts: None,
                    atomes: None,
                }),
            );
        }
    };

    let atomes: Vec<AtomeData> = match stmt.query_map(
        rusqlite::params![&claims.sub, &since_clock],
        |row| {
            let data_str: String = row.get(5)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            let snapshot_str: String = row.get(6)?;
            let snapshot: serde_json::Value = serde_json::from_str(&snapshot_str).unwrap_or(data.clone());
            let meta_str: Option<String> = row.get(12)?;
            let meta: Option<serde_json::Value> = meta_str.and_then(|s| serde_json::from_str(&s).ok());
            
            Ok(AtomeData {
                id: row.get(0)?,
                kind: row.get(1)?,
                atome_type: row.get(2)?,
                owner_id: row.get(3)?,
                parent_id: row.get(4)?,
                data,
                snapshot,
                logical_clock: row.get(7)?,
                sync_status: row.get(8)?,
                device_id: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                meta,
            })
        },
    ) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SyncResponse {
                    success: false,
                    error: Some(format!("Query error: {}", e)),
                    message: None,
                    synced: None,
                    conflicts: None,
                    atomes: None,
                }),
            );
        }
    };

    println!("🔄 Sync pull: {} pending atomes for user {}", atomes.len(), claims.sub);

    (
        StatusCode::OK,
        Json(SyncResponse {
            success: true,
            message: None,
            error: None,
            synced: Some(atomes.len() as i64),
            conflicts: None,
            atomes: Some(atomes),
        }),
    )
}

/// Query parameters for sync pull
#[derive(Debug, Deserialize)]
pub struct SyncPullQuery {
    pub since: Option<i64>,
}

/// POST /api/sync/ack - Acknowledge that atomes were successfully synced to cloud
async fn sync_ack_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<SyncAckRequest>,
) -> impl IntoResponse {
    // Validate JWT using sync-specific validation
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt_for_sync(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();
    let mut updated = 0i64;

    for id in &req.ids {
        let result = db.execute(
            "UPDATE atomes SET sync_status = 'synced', updated_at = ?1 WHERE id = ?2 AND owner_id = ?3",
            rusqlite::params![&now, id, &claims.sub],
        );
        if let Ok(rows) = result {
            updated += rows as i64;
        }
    }

    println!("✅ Sync ack: {} atomes marked as synced for user {}", updated, claims.sub);

    (
        StatusCode::OK,
        Json(SyncResponse {
            success: true,
            message: Some(format!("Acknowledged {} atomes", updated)),
            error: None,
            synced: Some(updated),
            conflicts: None,
            atomes: None,
        }),
    )
}

/// Request for sync acknowledgement
#[derive(Debug, Deserialize)]
pub struct SyncAckRequest {
    pub ids: Vec<String>,
}

// =============================================================================
// ROUTER
// =============================================================================

/// Create the local atome router
pub fn create_local_atome_router(data_dir: PathBuf) -> Router {
    // Initialize database
    let conn = init_database(&data_dir).expect("Failed to initialize local atome database");

    // Create state with same JWT secret as auth module
    let state = LocalAtomeState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: get_jwt_secret(&data_dir),
    };

    Router::new()
        .route("/api/atome/create", post(create_atome_handler))
        .route("/api/atome/list", get(list_atomes_handler))
        .route("/api/atome/:id", get(get_atome_handler))
        .route("/api/atome/:id", put(update_atome_handler))
        .route("/api/atome/:id", delete(delete_atome_handler))
        // Sync endpoints
        .route("/api/sync/push", post(sync_push_handler))
        .route("/api/sync/pull", get(sync_pull_handler))
        .route("/api/sync/ack", post(sync_ack_handler))
        .with_state(state)
}
