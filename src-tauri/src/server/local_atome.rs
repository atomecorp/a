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
// REQUEST/RESPONSE TYPES
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateAtomeRequest {
    pub id: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub properties: Option<serde_json::Value>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAtomeRequest {
    pub data: Option<serde_json::Value>,
    pub kind: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub kind: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
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
    pub atomes: Option<Vec<AtomeData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AtomeData {
    pub id: String,
    pub kind: String,
    pub data: serde_json::Value,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    #[serde(rename = "ownerId")]
    pub owner_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
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

    // Create atomes table (matching ADOLE/Eden schema: objects)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS atomes (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'local-tenant',
            kind TEXT NOT NULL DEFAULT 'atome',
            owner_id TEXT NOT NULL,
            parent_id TEXT,
            data TEXT NOT NULL DEFAULT '{}',
            deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )",
        [],
    )?;

    // Create indexes for faster lookups
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

    println!("📦 Local atomes database initialized: {:?}", db_path);

    Ok(conn)
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
                    atomes: None,
                    total: None,
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
    
    let final_data_value = serde_json::Value::Object(final_data);
    let data_json = serde_json::to_string(&final_data_value).unwrap_or_else(|_| "{}".to_string());

    // Insert into database
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT INTO atomes (id, tenant_id, kind, owner_id, parent_id, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &atome_id,
                DEFAULT_TENANT_ID,
                &req.kind,
                &claims.sub,
                &req.parent_id,
                &data_json,
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
                    atomes: None,
                    total: None,
                }),
            );
        }
    }

    println!("✨ Created atome {} (kind: {}) for user {}", atome_id, req.kind, claims.sub);

    (
        StatusCode::CREATED,
        Json(AtomeResponse {
            success: true,
            message: Some("Atome created successfully".into()),
            error: None,
            atome: Some(AtomeData {
                id: atome_id,
                kind: req.kind,
                data: final_data_value,
                parent_id: req.parent_id,
                owner_id: claims.sub,
                created_at: now.clone(),
                updated_at: now,
            }),
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
        // param_idx += 1; // Commented out - unused but kept for extensibility
    }

    let where_clause = conditions.join(" AND ");

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM atomes WHERE {}", where_clause);
    let total: i64 = {
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        db.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))
            .unwrap_or(0)
    };

    // Fetch atomes
    let select_sql = format!(
        "SELECT id, kind, owner_id, parent_id, data, created_at, updated_at 
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
                    atomes: None,
                    total: None,
                }),
            );
        }
    };

    let atomes: Vec<AtomeData> = match stmt.query_map(params_refs.as_slice(), |row| {
        let data_str: String = row.get(4)?;
        let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
        
        Ok(AtomeData {
            id: row.get(0)?,
            kind: row.get(1)?,
            owner_id: row.get(2)?,
            parent_id: row.get(3)?,
            data,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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
        "SELECT id, kind, owner_id, parent_id, data, created_at, updated_at 
         FROM atomes 
         WHERE id = ?1 AND owner_id = ?2 AND deleted = 0",
        rusqlite::params![&id, &claims.sub],
        |row| {
            let data_str: String = row.get(4)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            
            Ok(AtomeData {
                id: row.get(0)?,
                kind: row.get(1)?,
                owner_id: row.get(2)?,
                parent_id: row.get(3)?,
                data,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
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
                atome: Some(atome),
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

    // Update
    if let Err(e) = db.execute(
        "UPDATE atomes SET kind = ?1, data = ?2, parent_id = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![&new_kind, &data_json, &new_parent_id, &now, &id],
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
            }),
        );
    }

    println!("📝 Updated atome {} for user {}", id, claims.sub);

    // Fetch updated atome
    let updated = db.query_row(
        "SELECT id, kind, owner_id, parent_id, data, created_at, updated_at FROM atomes WHERE id = ?1",
        rusqlite::params![&id],
        |row| {
            let data_str: String = row.get(4)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            
            Ok(AtomeData {
                id: row.get(0)?,
                kind: row.get(1)?,
                owner_id: row.get(2)?,
                parent_id: row.get(3)?,
                data,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
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

    // Soft delete (matching ADOLE/Eden pattern)
    let result = db.execute(
        "UPDATE atomes SET deleted = 1, deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND owner_id = ?3 AND deleted = 0",
        rusqlite::params![&now, &id, &claims.sub],
    );

    match result {
        Ok(rows) if rows > 0 => {
            println!("🗑️ Deleted atome {} for user {}", id, claims.sub);
            (
                StatusCode::OK,
                Json(AtomeResponse {
                    success: true,
                    message: Some("Atome deleted successfully".into()),
                    error: None,
                    atome: None,
                    atomes: None,
                    total: None,
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
            }),
        ),
    }
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
        .with_state(state)
}
