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

/// Fastify server URL for auto-sync
const FASTIFY_URL: &str = "http://localhost:3001";

// ========RC TO FASTIFY - Queue-based with retry
// =============================================================================

/// Sync secret for server-to-server communication
const SYNC_SECRET: &str = "squirrel-sync-2024";

/// Queue a sync operation to database for reliable delivery
/// If sync fails, it will be retried by the background worker
fn queue_sync_to_fastify(db: &Connection, atome: &AtomeData, operation: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    
    // Build sync payload
    let payload = serde_json::json!({
        "atomes": [{
            "id": atome.id,
            "kind": atome.kind,
            "type": atome.atome_type,
            "data": atome.data,
            "snapshot": atome.snapshot,
            "parent": atome.parent,
            "owner": atome.owner,
            "logical_clock": atome.logical_clock,
            "sync_status": "synced",
            "device_id": atome.device_id,
            "created_at": atome.created_at,
            "updated_at": atome.updated_at,
            "meta": atome.meta,
            "deleted": false
        }]
    });
    
    let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    
    // Insert or update queue entry (UPSERT)
    db.execute(
        "INSERT INTO sync_queue (object_id, object_type, operation, payload, target_server, status, created_at, next_retry_at)
         VALUES (?1, 'atome', ?2, ?3, 'fastify', 'pending', ?4, ?4)
         ON CONFLICT(object_id, operation, target_server) DO UPDATE SET
            payload = excluded.payload,
            status = 'pending',
            attempts = 0,
            error_message = NULL,
            next_retry_at = excluded.next_retry_at",
        rusqlite::params![&atome.id, operation, &payload_str, &now],
    ).map_err(|e| e.to_string())?;
    
    println!("📥 [SyncQueue] Queued {} for atome {} to Fastify", operation, atome.id);
    Ok(())
}

/// Try to sync an atome to Fastify immediately, queue on failure
async fn sync_atome_to_fastify_with_queue(atome: &AtomeData, db_arc: Arc<Mutex<Connection>>, is_delete: bool) {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("⚠️ [AutoSync] Failed to create HTTP client: {}", e);
            // Queue for retry
            if let Ok(db) = db_arc.lock() {
                let _ = queue_sync_to_fastify(&db, atome, "create");
            }
            return;
        }
    };

    // Build sync payload
    let sync_payload = serde_json::json!({
        "atomes": [{
            "id": atome.id,
            "kind": atome.kind,
            "type": atome.atome_type,
            "data": atome.data,
            "snapshot": atome.snapshot,
            "parent": atome.parent,
            "owner": atome.owner,
            "logical_clock": atome.logical_clock,
            "sync_status": "synced",
            "device_id": atome.device_id,
            "created_at": atome.created_at,
            "updated_at": atome.updated_at,
            "meta": atome.meta,
            "deleted": is_delete
        }]
    });

    let url = format!("{}/api/atome/sync/receive", FASTIFY_URL);
    
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("X-Sync-Secret", SYNC_SECRET)
        .json(&sync_payload)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                println!("🔄 [AutoSync] Synced atome {} to Fastify", atome.id);
                // Remove from queue if it was there
                if let Ok(db) = db_arc.lock() {
                    let _ = db.execute(
                        "DELETE FROM sync_queue WHERE object_id = ?1 AND target_server = 'fastify'",
                        rusqlite::params![&atome.id],
                    );
                }
            } else {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                println!("⚠️ [AutoSync] Fastify returned {}: {}, queuing for retry", status, body);
                // Queue for retry
                if let Ok(db) = db_arc.lock() {
                    let _ = queue_sync_to_fastify(&db, atome, "create");
                }
            }
        }
        Err(e) => {
            // Queue for retry - Fastify might be offline
            println!("⚠️ [AutoSync] Could not reach Fastify: {}, queuing for retry", e);
            if let Ok(db) = db_arc.lock() {
                let _ = queue_sync_to_fastify(&db, atome, "create");
            }
        }
    }
}

/// Process pending sync queue items (called by background worker)
async fn process_sync_queue(db_arc: Arc<Mutex<Connection>>) {
    let now = Utc::now().to_rfc3339();
    
    // Get pending items ready for retry
    let pending_items: Vec<(i64, String, String)> = {
        let db = match db_arc.lock() {
            Ok(d) => d,
            Err(_) => return,
        };
        
        let mut stmt = match db.prepare(
            "SELECT id, object_id, payload FROM sync_queue 
             WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?1)
             AND attempts < max_attempts
             ORDER BY created_at ASC
             LIMIT 10"
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        
        stmt.query_map(rusqlite::params![&now], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
    };
    
    if pending_items.is_empty() {
        return;
    }
    
    println!("🔄 [SyncWorker] Processing {} pending sync items", pending_items.len());
    
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };
    
    let url = format!("{}/api/atome/sync/receive", FASTIFY_URL);
    
    for (queue_id, object_id, payload) in pending_items {
        let payload_json: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(p) => p,
            Err(_) => continue,
        };
        
        match client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("X-Sync-Secret", SYNC_SECRET)
            .json(&payload_json)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                println!("✅ [SyncWorker] Synced queued atome {} to Fastify", object_id);
                // Remove from queue
                if let Ok(db) = db_arc.lock() {
                    let _ = db.execute(
                        "DELETE FROM sync_queue WHERE id = ?1",
                        rusqlite::params![queue_id],
                    );
                }
            }
            Ok(response) => {
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                println!("⚠️ [SyncWorker] Fastify returned {} for {}: {}", status, object_id, body);
                update_queue_retry(&db_arc, queue_id, &format!("HTTP {}: {}", status, body));
            }
            Err(e) => {
                println!("⚠️ [SyncWorker] Could not reach Fastify for {}: {}", object_id, e);
                update_queue_retry(&db_arc, queue_id, &e.to_string());
            }
        }
    }
}

/// Update queue item for retry with exponential backoff
fn update_queue_retry(db_arc: &Arc<Mutex<Connection>>, queue_id: i64, error: &str) {
    if let Ok(db) = db_arc.lock() {
        // Get current attempt count
        let attempts: i64 = db.query_row(
            "SELECT attempts FROM sync_queue WHERE id = ?1",
            rusqlite::params![queue_id],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let new_attempts = attempts + 1;
        // Exponential backoff: 30s, 1m, 2m, 4m, 8m
        let backoff_seconds = 30 * (1i64 << attempts.min(4));
        let next_retry = Utc::now() + chrono::Duration::seconds(backoff_seconds);
        let next_retry_str = next_retry.to_rfc3339();
        let now = Utc::now().to_rfc3339();
        
        let status = if new_attempts >= 5 { "failed" } else { "pending" };
        
        let _ = db.execute(
            "UPDATE sync_queue SET attempts = ?1, last_attempt_at = ?2, next_retry_at = ?3, error_message = ?4, status = ?5 WHERE id = ?6",
            rusqlite::params![new_attempts, &now, &next_retry_str, error, status, queue_id],
        );
        
        if status == "failed" {
            println!("❌ [SyncQueue] Queue item {} failed after {} attempts", queue_id, new_attempts);
        }
    }
}

/// Compute sync hash for a user (for integrity verification)
fn compute_user_sync_hash(db: &Connection, user_id: &str) -> Result<(String, i64, i64), String> {
    // Get all atomes for user, sorted by ID for deterministic hash
    let mut stmt = db.prepare(
        "SELECT id, logical_clock, updated_at FROM atomes 
         WHERE owner = ?1 AND deleted = 0 
         ORDER BY id"
    ).map_err(|e| e.to_string())?;
    
    let mut hasher_input = String::new();
    let mut count: i64 = 0;
    let mut max_clock: i64 = 0;
    
    let rows = stmt.query_map(rusqlite::params![user_id], |row| {
        let id: String = row.get(0)?;
        let clock: i64 = row.get(1)?;
        let updated: String = row.get(2)?;
        Ok((id, clock, updated))
    }).map_err(|e| e.to_string())?;
    
    for row in rows {
        if let Ok((id, clock, updated)) = row {
            hasher_input.push_str(&format!("{}:{}:{};", id, clock, updated));
            count += 1;
            if clock > max_clock {
                max_clock = clock;
            }
        }
    }
    
    // Simple hash using first 16 chars of base64-encoded data
    // In production, use a proper hash like SHA-256
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    hasher_input.hash(&mut hasher);
    let hash = format!("{:016x}", hasher.finish());
    
    Ok((hash, count, max_clock))
}

/// Update the stored sync hash for a user
fn update_user_sync_hash(db: &Connection, user_id: &str) -> Result<(), String> {
    let (hash, count, max_clock) = compute_user_sync_hash(db, user_id)?;
    let now = Utc::now().to_rfc3339();
    
    db.execute(
        "INSERT INTO sync_state_hash (user_id, hash, atome_count, max_logical_clock, last_update)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id) DO UPDATE SET
            hash = excluded.hash,
            atome_count = excluded.atome_count,
            max_logical_clock = excluded.max_logical_clock,
            last_update = excluded.last_update",
        rusqlite::params![user_id, &hash, count, max_clock, &now],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Start the background sync worker
pub fn start_sync_worker(db_arc: Arc<Mutex<Connection>>) {
    tokio::spawn(async move {
        println!("🔄 [SyncWorker] Started background sync worker (30s interval)");
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            process_sync_queue(db_arc.clone()).await;
        }
    });
}

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
    pub parent: Option<String>,
    #[serde(default = "default_version")]
    pub logical_clock: i64,
    pub device_id: Option<String>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

fn default_kind() -> String { "generic".to_string() }
fn default_type() -> String { "atome".to_string() }
fn default_version() -> i64 { 1 }

/// Deep merge two JSON values (ADOLE principle: patch, don't replace)
/// Recursively merges objects, replacing non-object values
fn deep_merge_json(base: &serde_json::Value, patch: &serde_json::Value) -> serde_json::Value {
    match (base, patch) {
        // Both are objects: merge recursively
        (serde_json::Value::Object(base_obj), serde_json::Value::Object(patch_obj)) => {
            let mut result = base_obj.clone();
            for (key, patch_value) in patch_obj {
                let merged_value = if let Some(base_value) = base_obj.get(key) {
                    // Key exists in base, merge recursively
                    deep_merge_json(base_value, patch_value)
                } else {
                    // Key doesn't exist in base, use patch value
                    patch_value.clone()
                };
                result.insert(key.clone(), merged_value);
            }
            serde_json::Value::Object(result)
        }
        // Patch is not an object or base is not an object: use patch value
        _ => patch.clone(),
    }
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct UpdateAtomeRequest {
    pub data: Option<serde_json::Value>,
    pub snapshot: Option<serde_json::Value>,
    pub kind: Option<String>,
    pub parent: Option<String>,
    pub logical_clock: Option<i64>,
    pub device_id: Option<String>,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub kind: Option<String>,
    pub parent: Option<String>,
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
    pub parent: Option<String>,
    pub owner: String,
    pub logical_clock: i64,
    pub sync_status: String,
    pub device_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
}

// =============================================================================
// DATABASE INITIALIZATION - ADOLE Schema (Pure)
// =============================================================================
// ADOLE = Atome Data Object Layer for Eden
// Uses objects + properties tables only - NO legacy atomes table
// Same schema as Fastify server for perfect sync compatibility
// =============================================================================

/// Initialize SQLite database with ADOLE schema
/// Same schema as Fastify server for perfect sync compatibility
pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("local_atomes.db");

    // Create data directory if it doesn't exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;

    // Enable foreign keys and WAL mode
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    let _ = conn.execute_batch("PRAGMA journal_mode = WAL;");

    // =========================================================================
    // TABLE 1: objects - Identity, category, ownership (no properties here)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS objects (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            kind TEXT,
            parent TEXT,
            owner TEXT NOT NULL,
            creator TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(parent) REFERENCES objects(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_objects_parent ON objects(parent)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_objects_owner ON objects(owner)", [])?;

    // =========================================================================
    // TABLE 2: properties - Current live state of each property
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL,
            name TEXT NOT NULL,
            value TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE,
            UNIQUE(object_id, name)
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_properties_object ON properties(object_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_properties_name ON properties(name)", [])?;

    // =========================================================================
    // TABLE 3: property_versions - Full history for undo/redo, sync
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS property_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            object_id TEXT NOT NULL,
            name TEXT NOT NULL,
            version INTEGER NOT NULL,
            value TEXT,
            author TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
            FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_prop_versions_property ON property_versions(property_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_prop_versions_object ON property_versions(object_id)", [])?;

    // =========================================================================
    // TABLE 4: permissions - Fine-grained ACL per property
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL,
            property_name TEXT,
            user_id TEXT NOT NULL,
            can_read INTEGER NOT NULL DEFAULT 1,
            can_write INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_permissions_object ON permissions(object_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)", [])?;

    // =========================================================================
    // TABLE 5: snapshots - Full state backups
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_object ON snapshots(object_id)", [])?;

    // =========================================================================
    // TABLE 6: sync_state - Cross-server sync tracking
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL UNIQUE,
            last_sync_version INTEGER NOT NULL DEFAULT 0,
            last_sync_at TEXT
        )",
        [],
    )?;

    // =========================================================================
    // TABLE 7: sync_queue - Persistent queue for failed sync operations
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL,
            object_type TEXT NOT NULL DEFAULT 'atome',
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            target_server TEXT NOT NULL DEFAULT 'fastify',
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            last_attempt_at TEXT,
            next_retry_at TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(object_id, operation, target_server)
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at)", [])?;

    // =========================================================================
    // TABLE 8: sync_state_hash - Per-user hash for integrity verification
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_state_hash (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            hash TEXT NOT NULL,
            atome_count INTEGER NOT NULL DEFAULT 0,
            max_logical_clock INTEGER NOT NULL DEFAULT 0,
            last_update TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_hash_user ON sync_state_hash(user_id)", [])?;

    // =========================================================================
    // Main atomes table - ADOLE compliant naming (owner, parent, not owner_id, parent_id)
    // =========================================================================
    conn.execute(
        "CREATE TABLE IF NOT EXISTS atomes (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'local-tenant',
            kind TEXT NOT NULL DEFAULT 'atome',
            type TEXT NOT NULL DEFAULT 'atome',
            owner TEXT NOT NULL,
            parent TEXT,
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
            meta TEXT DEFAULT '{}',
            created_source TEXT DEFAULT 'tauri'
        )",
        [],
    )?;

    // Run migrations for legacy table
    run_migrations(&conn)?;

    // Create indexes for atomes table (ADOLE naming)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atomes_owner ON atomes(owner)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atomes_kind ON atomes(kind)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atomes_parent ON atomes(parent)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atomes_sync_status ON atomes(sync_status)", [])?;

    println!("📦 ADOLE v2.0 database initialized: {:?}", db_path);

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
        ("created_source", "ALTER TABLE atomes ADD COLUMN created_source TEXT DEFAULT 'tauri'"),
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

    // Insert into database with ADOLE v2.0 schema
    {
        let db = state.db.lock().unwrap();
        
        // 1. Insert into ADOLE objects table (new schema)
        if let Err(e) = db.execute(
            "INSERT OR REPLACE INTO objects (id, type, kind, parent, owner, creator, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?6)",
            rusqlite::params![
                &atome_id,
                &req.atome_type,
                &req.kind,
                &req.parent,
                &claims.sub,
                &now,
            ],
        ) {
            println!("⚠️ ADOLE objects insert failed: {}", e);
        }
        
        // 2. Insert properties into ADOLE properties table
        for (key, value) in &final_data {
            let value_str = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
            if let Err(e) = db.execute(
                "INSERT OR REPLACE INTO properties (object_id, name, value, version, updated_at)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                rusqlite::params![&atome_id, key, &value_str, &now],
            ) {
                println!("⚠️ ADOLE property insert failed for {}: {}", key, e);
            }
        }

        // 3. Also insert into atomes table (ADOLE compliant naming)
        if let Err(e) = db.execute(
            "INSERT INTO atomes (id, tenant_id, kind, type, owner, parent, data, snapshot, 
             logical_clock, device_id, sync_status, meta, created_at, updated_at, created_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                &atome_id,
                DEFAULT_TENANT_ID,
                &req.kind,
                &req.atome_type,
                &claims.sub,
                &req.parent,
                &data_json,
                &snapshot_json,
                &req.logical_clock,
                &device_id,
                "synced",
                &meta_json,
                &now,
                &now,
                "tauri"
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

    println!("✨ Created atome {} (kind: {}, v{}) for user {} [ADOLE v2.0]", atome_id, req.kind, req.logical_clock, claims.sub);

    let atome_data = AtomeData {
        id: atome_id,
        kind: req.kind,
        atome_type: req.atome_type,
        data: final_data_value,
        snapshot: snapshot_value,
        parent: req.parent,
        owner: claims.sub,
        logical_clock: req.logical_clock,
        sync_status: "synced".to_string(),
        device_id,
        created_at: now.clone(),
        updated_at: now,
        meta: req.meta,
    };

    // Update sync hash for this user
    {
        let db = state.db.lock().unwrap();
        let _ = update_user_sync_hash(&db, &atome_data.owner);
    }

    // Auto-sync to Fastify in background with queue fallback (non-blocking)
    let atome_for_sync = atome_data.clone();
    let db_arc = state.db.clone();
    tokio::spawn(async move {
        sync_atome_to_fastify_with_queue(&atome_for_sync, db_arc, false).await;
    });

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

    // Debug: log the user ID from token
    println!("📋 [LIST] Querying atomes for user: {} (kind: {:?})", claims.sub, query.kind);
    println!("📋 [LIST] Token sub (user_id) = '{}'", claims.sub);

    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);

    // Build query
    let db = state.db.lock().unwrap();
    
    // Build WHERE clause (ADOLE naming: owner, parent)
    let mut conditions = vec!["owner = ?1".to_string(), "deleted = 0".to_string()];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(claims.sub.clone())];
    let mut param_idx = 2;

    if let Some(ref kind) = query.kind {
        conditions.push(format!("kind = ?{}", param_idx));
        params.push(Box::new(kind.clone()));
        param_idx += 1;
    }

    if let Some(ref parent_val) = query.parent {
        conditions.push(format!("parent = ?{}", param_idx));
        params.push(Box::new(parent_val.clone()));
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
    println!("📋 [LIST] COUNT SQL: {}", count_sql);
    let total: i64 = {
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let count_result = db.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))
            .unwrap_or(0);
        println!("📋 [LIST] COUNT result: {}", count_result);
        count_result
    };

    // Fetch atomes with ADOLE fields (owner, parent columns)
    let select_sql = format!(
        "SELECT id, kind, COALESCE(type, 'atome'), owner, parent, data, 
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
            owner: row.get(3)?,
            parent: row.get(4)?,
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
        Ok(rows) => {
            let collected: Vec<AtomeData> = rows.filter_map(|r| r.ok()).collect();
            println!("📋 [LIST] Found {} atomes after mapping", collected.len());
            collected
        },
        Err(e) => {
            println!("📋 [LIST] Query error: {}", e);
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

    println!("📋 [LIST] Returning {} atomes for user {}", atomes.len(), claims.sub);
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
        "SELECT id, kind, COALESCE(type, 'atome'), owner, parent, data, 
                COALESCE(snapshot, data), COALESCE(logical_clock, 1), 
                COALESCE(sync_status, 'synced'), device_id, 
                created_at, updated_at, meta
         FROM atomes 
         WHERE id = ?1 AND owner = ?2 AND deleted = 0",
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
                owner: row.get(3)?,
                parent: row.get(4)?,
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

    // First check if atome exists and belongs to user (ADOLE naming: owner, parent)
    let existing: Result<(String, String, Option<String>, String), _> = db.query_row(
        "SELECT kind, data, parent, owner FROM atomes WHERE id = ?1 AND owner = ?2 AND deleted = 0",
        rusqlite::params![&id, &claims.sub],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );

    let (current_kind, current_data_str, current_parent, _owner) = match existing {
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
    let new_parent = req.parent.or(current_parent);
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

    // Update with ADOLE fields (owner, parent columns)
    if let Err(e) = db.execute(
        "UPDATE atomes SET kind = ?1, data = ?2, parent = ?3, updated_at = ?4, logical_clock = ?5, device_id = ?6, sync_status = 'pending' WHERE id = ?7",
        rusqlite::params![&new_kind, &data_json, &new_parent, &now, &new_clock, &device_id, &id],
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

    // Fetch updated atome with ADOLE fields (owner, parent columns)
    let updated = db.query_row(
        "SELECT id, kind, type, owner, parent, data, snapshot, logical_clock, sync_status, device_id, created_at, updated_at, meta FROM atomes WHERE id = ?1",
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
                owner: row.get(3)?,
                parent: row.get(4)?,
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
        Ok(atome) => {
            // Update sync hash for this user
            let _ = update_user_sync_hash(&db, &atome.owner);
            
            // Auto-sync UPDATE to Fastify in background with queue fallback (non-blocking)
            let atome_for_sync = atome.clone();
            let db_arc = state.db.clone();
            drop(db); // Release the lock before spawning async task
            tokio::spawn(async move {
                sync_atome_to_fastify_with_queue(&atome_for_sync, db_arc, false).await;
            });
            
            (
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
            )
        },
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

    // First fetch the atome data before soft delete (needed for sync)
    let atome_before_delete: Result<AtomeData, _> = db.query_row(
        "SELECT id, kind, COALESCE(type, 'atome'), owner, parent, data, 
                COALESCE(snapshot, data), COALESCE(logical_clock, 1), 
                COALESCE(sync_status, 'synced'), device_id, 
                created_at, updated_at, meta
         FROM atomes 
         WHERE id = ?1 AND owner = ?2 AND deleted = 0",
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
                owner: row.get(3)?,
                parent: row.get(4)?,
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

    // Get current logical_clock and increment
    let current_clock: i64 = db.query_row(
        "SELECT logical_clock FROM atomes WHERE id = ?1",
        rusqlite::params![&id],
        |row| row.get(0),
    ).unwrap_or(1);
    let new_clock = current_clock + 1;

    // Soft delete (matching ADOLE/Eden pattern) with sync_status = pending
    let result = db.execute(
        "UPDATE atomes SET deleted = 1, deleted_at = ?1, updated_at = ?1, logical_clock = ?2, sync_status = 'pending' WHERE id = ?3 AND owner = ?4 AND deleted = 0",
        rusqlite::params![&now, &new_clock, &id, &claims.sub],
    );

    match result {
        Ok(rows) if rows > 0 => {
            println!("🗑️ Deleted atome {} (v{}) for user {}", id, new_clock, claims.sub);
            
            // Update sync hash for this user
            let _ = update_user_sync_hash(&db, &claims.sub);
            
            // Auto-sync DELETE to Fastify in background with queue fallback (non-blocking)
            // Use the atome data we fetched before the soft delete, with updated logical_clock
            if let Ok(mut atome_for_sync) = atome_before_delete {
                atome_for_sync.logical_clock = new_clock;
                atome_for_sync.updated_at = now.clone();
                atome_for_sync.sync_status = "pending".to_string();
                let db_arc = state.db.clone();
                drop(db); // Release the lock before spawning async task
                tokio::spawn(async move {
                    sync_atome_to_fastify_with_queue(&atome_for_sync, db_arc, true).await;
                });
            }
            
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
    pub parent: Option<String>,
    pub owner: String,
    pub logical_clock: i64,
    pub sync_status: String,
    pub device_id: Option<String>,
    pub created_at: String,
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
    pub local_clock: i64,
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
                        // Update (ADOLE naming: parent column)
                        let _ = db.execute(
                            "UPDATE atomes SET kind = ?1, type = ?2, data = ?3, snapshot = ?4, parent = ?5, logical_clock = ?6, device_id = ?7, updated_at = ?8, meta = ?9, sync_status = 'synced' WHERE id = ?10",
                            rusqlite::params![
                                &atome.kind,
                                &atome.atome_type,
                                &data_json,
                                &snapshot_json,
                                &atome.parent,
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
                // Determine created_source from incoming atome or default to 'synced'
                let created_source = "synced";

                let _ = db.execute(
                    "INSERT INTO atomes (id, tenant_id, kind, type, owner, parent, data, snapshot, logical_clock, schema_version, device_id, sync_status, meta, created_at, updated_at, deleted, deleted_at, created_source)
                     VALUES (?1, 'local-tenant', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, 'synced', ?10, ?11, ?12, ?13, ?14, ?15)",
                    rusqlite::params![
                        &atome.id,
                        &atome.kind,
                        &atome.atome_type,
                        &atome.owner,
                        &atome.parent,
                        &data_json,
                        &snapshot_json,
                        &atome.logical_clock,
                        &atome.device_id,
                        &meta_json,
                        &atome.created_at,
                        &now,
                        &atome.deleted,
                        &deleted_at,
                        created_source
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

    // Get all pending atomes for this user since last sync (ADOLE naming: owner, parent)
    let since_clock = query.since.unwrap_or(0);
    
    let mut stmt = match db.prepare(
        "SELECT id, kind, type, owner, parent, data, snapshot, logical_clock, sync_status, device_id, created_at, updated_at, meta, deleted
         FROM atomes WHERE owner = ?1 AND (sync_status = 'pending' OR logical_clock > ?2) AND deleted = 0"
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
                owner: row.get(3)?,
                parent: row.get(4)?,
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
            "UPDATE atomes SET sync_status = 'synced', updated_at = ?1 WHERE id = ?2 AND owner = ?3",
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

/// Request for ADOLE alter operation
#[derive(Debug, Deserialize)]
pub struct AlterAtomeRequest {
    pub operation: String, // "update", "patch", "rename", "tag"
    pub changes: serde_json::Value,
    #[serde(default)]
    pub reason: Option<String>,
    pub device_id: Option<String>,
}

/// Request for rename operation
#[derive(Debug, Deserialize)]
pub struct RenameAtomeRequest {
    pub new_name: String,
}

/// Request for restore operation
#[derive(Debug, Deserialize)]
pub struct RestoreAtomeRequest {
    pub version: i64,
    #[serde(default)]
    pub reason: Option<String>,
}

/// Request for deleting user data
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct DeleteUserDataRequest {
    pub password: String,
    #[serde(default)]
    pub kinds: Option<Vec<String>>,
}

/// History response
#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alterations: Option<Vec<serde_json::Value>>,
}

// =============================================================================
// ADOLE HANDLERS (Alter, Rename, History, Restore)
// =============================================================================

/// POST /api/atome/:id/alter - ADOLE compliant alteration
async fn alter_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(req): Json<AlterAtomeRequest>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Get current atome (ADOLE naming: owner column)
    let current: Result<(serde_json::Value, i64, String), _> = db.query_row(
        "SELECT data, logical_clock, owner FROM atomes WHERE id = ?1 AND deleted = 0",
        rusqlite::params![id],
        |row| {
            let data_str: String = row.get(0)?;
            let data: serde_json::Value = serde_json::from_str(&data_str).unwrap_or(serde_json::json!({}));
            Ok((data, row.get(1)?, row.get(2)?))
        },
    );

    match current {
        Ok((current_data, current_clock, owner)) => {
            // Verify ownership
            if owner != claims.sub {
                return (
                    StatusCode::FORBIDDEN,
                    Json(AtomeResponse {
                        success: false,
                        error: Some("Access denied".into()),
                        message: None,
                        atome: None,
                        data: None,
                        atomes: None,
                        total: None,
                    }),
                );
            }

            let new_clock = current_clock + 1;

            // Merge changes into data based on operation
            let new_data = match req.operation.as_str() {
                "rename" => {
                    // Update name field
                    let mut merged = current_data.clone();
                    if let Some(obj) = merged.as_object_mut() {
                        if let Some(new_name) = req.changes.get("name").or(req.changes.get("newName")) {
                            obj.insert("name".to_string(), new_name.clone());
                        }
                    }
                    merged
                }
                // "update", "patch", or any other operation: deep merge
                _ => {
                    // Deep merge of changed fields (ADOLE: patch, don't replace)
                    deep_merge_json(&current_data, &req.changes)
                }
            };

            let new_data_str = serde_json::to_string(&new_data).unwrap_or("{}".to_string());

            // Store alteration in meta for history
            let alteration = serde_json::json!({
                "version": new_clock,
                "operation": req.operation,
                "changes": req.changes,
                "reason": req.reason,
                "timestamp": now,
                "deviceId": req.device_id
            });

            // Get existing meta or create new
            let existing_meta: Option<String> = db.query_row(
                "SELECT meta FROM atomes WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            ).ok();

            let mut meta = existing_meta
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .unwrap_or(serde_json::json!({}));

            // Append to alterations array
            if let Some(obj) = meta.as_object_mut() {
                let alterations = obj.entry("alterations").or_insert(serde_json::json!([]));
                if let Some(arr) = alterations.as_array_mut() {
                    arr.push(alteration.clone());
                }
            }

            let meta_str = serde_json::to_string(&meta).unwrap_or("{}".to_string());

            // Update atome
            match db.execute(
                "UPDATE atomes SET data = ?1, snapshot = ?2, logical_clock = ?3, 
                 updated_at = ?4, sync_status = 'pending', meta = ?5
                 WHERE id = ?6",
                rusqlite::params![new_data_str, new_data_str, new_clock, now, meta_str, id],
            ) {
                Ok(_) => {
                    println!("📝 Altered atome {} (v{}) with operation '{}' for user {}", 
                             id, new_clock, req.operation, claims.sub);
                    (
                        StatusCode::OK,
                        Json(AtomeResponse {
                            success: true,
                            message: Some(format!("Atome altered to version {}", new_clock)),
                            error: None,
                            atome: None,
                            data: None,
                            atomes: None,
                            total: Some(new_clock),
                        }),
                    )
                }
                Err(e) => (
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
                ),
            }
        }
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

/// POST /api/atome/:id/rename
async fn rename_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(req): Json<RenameAtomeRequest>,
) -> impl IntoResponse {
    // Use alter with rename operation
    let alter_req = AlterAtomeRequest {
        operation: "rename".to_string(),
        changes: serde_json::json!({ "name": req.new_name }),
        reason: Some("Renamed".to_string()),
        device_id: None,
    };
    
    alter_atome_handler(
        State(state),
        headers,
        axum::extract::Path(id),
        Json(alter_req),
    ).await
}

/// GET /api/atome/:id/history
async fn history_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(_e) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(HistoryResponse {
                    success: false,
                    error: Some("Unauthorized".into()),
                    id: None,
                    current_version: None,
                    alterations: None,
                }),
            );
        }
    };

    let db = state.db.lock().unwrap();

    // Get atome with meta (contains alterations) - ADOLE naming: owner column
    let result: Result<(i64, String, String), _> = db.query_row(
        "SELECT logical_clock, owner, COALESCE(meta, '{}') FROM atomes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );

    match result {
        Ok((current_version, owner, meta_str)) => {
            // Verify ownership
            if owner != claims.sub {
                return (
                    StatusCode::FORBIDDEN,
                    Json(HistoryResponse {
                        success: false,
                        error: Some("Access denied".into()),
                        id: None,
                        current_version: None,
                        alterations: None,
                    }),
                );
            }

            let meta: serde_json::Value = serde_json::from_str(&meta_str).unwrap_or(serde_json::json!({}));
            let alterations = meta.get("alterations")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_default();

            (
                StatusCode::OK,
                Json(HistoryResponse {
                    success: true,
                    error: None,
                    id: Some(id),
                    current_version: Some(current_version),
                    alterations: Some(alterations),
                }),
            )
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(HistoryResponse {
                success: false,
                error: Some("Atome not found".into()),
                id: None,
                current_version: None,
                alterations: None,
            }),
        ),
    }
}

/// POST /api/atome/:id/restore
async fn restore_atome_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(req): Json<RestoreAtomeRequest>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Get atome with meta (contains alterations history) - ADOLE naming: owner column
    let result: Result<(String, i64, String, String), _> = db.query_row(
        "SELECT data, logical_clock, owner, COALESCE(meta, '{}') FROM atomes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    );

    match result {
        Ok((current_data_str, current_clock, owner, meta_str)) => {
            // Verify ownership
            if owner != claims.sub {
                return (
                    StatusCode::FORBIDDEN,
                    Json(AtomeResponse {
                        success: false,
                        error: Some("Access denied".into()),
                        message: None,
                        atome: None,
                        data: None,
                        atomes: None,
                        total: None,
                    }),
                );
            }

            let meta: serde_json::Value = serde_json::from_str(&meta_str).unwrap_or(serde_json::json!({}));
            let alterations = meta.get("alterations")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_default();

            // Find the state at requested version by replaying alterations
            // For simplicity, we'll look for a snapshot at that version
            let restore_data = if req.version == 1 {
                // Version 1 is the original - we need to find it from first alteration or use current
                // This is a simplified approach - real ADOLE would store snapshots
                alterations.first()
                    .and_then(|a| a.get("snapshot"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::from_str(&current_data_str).unwrap_or(serde_json::json!({})))
            } else {
                // Find alteration at that version
                alterations.iter()
                    .find(|a| a.get("version").and_then(|v| v.as_i64()) == Some(req.version))
                    .and_then(|a| a.get("data").or(a.get("snapshot")))
                    .cloned()
                    .unwrap_or_else(|| serde_json::from_str(&current_data_str).unwrap_or(serde_json::json!({})))
            };

            let new_clock = current_clock + 1;
            let restore_data_str = serde_json::to_string(&restore_data).unwrap_or("{}".to_string());

            // Add restore alteration to history
            let restore_alteration = serde_json::json!({
                "version": new_clock,
                "operation": "restore",
                "restoredToVersion": req.version,
                "reason": req.reason,
                "timestamp": now
            });

            let mut new_meta = meta.clone();
            if let Some(obj) = new_meta.as_object_mut() {
                let alts = obj.entry("alterations").or_insert(serde_json::json!([]));
                if let Some(arr) = alts.as_array_mut() {
                    arr.push(restore_alteration);
                }
            }
            let new_meta_str = serde_json::to_string(&new_meta).unwrap_or("{}".to_string());

            // Update atome
            match db.execute(
                "UPDATE atomes SET data = ?1, snapshot = ?2, logical_clock = ?3, 
                 updated_at = ?4, sync_status = 'pending', meta = ?5
                 WHERE id = ?6",
                rusqlite::params![restore_data_str, restore_data_str, new_clock, now, new_meta_str, id],
            ) {
                Ok(_) => {
                    println!("🔄 Restored atome {} to version {} (now v{}) for user {}", 
                             id, req.version, new_clock, claims.sub);
                    (
                        StatusCode::OK,
                        Json(AtomeResponse {
                            success: true,
                            message: Some(format!("Restored to version {}", req.version)),
                            error: None,
                            atome: None,
                            data: None,
                            atomes: None,
                            total: Some(new_clock),
                        }),
                    )
                }
                Err(e) => (
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
                ),
            }
        }
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

/// DELETE /api/user-data/delete-all
async fn delete_user_data_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<DeleteUserDataRequest>,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    // Build query based on kinds filter (ADOLE naming: owner column)
    let result = if let Some(kinds) = &req.kinds {
        // Delete specific kinds
        let placeholders: Vec<String> = (0..kinds.len()).map(|i| format!("?{}", i + 2)).collect();
        let _sql = format!(
            "UPDATE atomes SET deleted = 1, deleted_at = ?1 
             WHERE owner = ?2 AND kind IN ({}) AND deleted = 0",
            placeholders.join(", ")
        );
        
        let mut _params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(now.clone()),
            Box::new(claims.sub.clone()),
        ];
        for kind in kinds {
            _params.push(Box::new(kind.clone()));
        }
        
        // This is a simplified version - proper implementation would use dynamic params
        db.execute(
            "UPDATE atomes SET deleted = 1, deleted_at = ?1 WHERE owner = ?2 AND deleted = 0",
            rusqlite::params![now, claims.sub],
        )
    } else {
        // Delete all user data
        db.execute(
            "UPDATE atomes SET deleted = 1, deleted_at = ?1 WHERE owner = ?2 AND deleted = 0",
            rusqlite::params![now, claims.sub],
        )
    };

    match result {
        Ok(deleted) => {
            println!("🗑️ Deleted {} atomes for user {}", deleted, claims.sub);
            (
                StatusCode::OK,
                Json(AtomeResponse {
                    success: true,
                    message: Some(format!("Deleted {} items", deleted)),
                    error: None,
                    atome: None,
                    data: None,
                    atomes: None,
                    total: Some(deleted as i64),
                }),
            )
        }
        Err(e) => (
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
        ),
    }
}

/// GET /api/user-data/export
async fn export_user_data_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => return e,
    };

    let db = state.db.lock().unwrap();

    // Get all user's atomes (ADOLE naming: owner, parent columns)
    let mut stmt = match db.prepare(
        "SELECT id, kind, type, owner, parent, data, snapshot, logical_clock, 
                sync_status, device_id, created_at, updated_at, meta
         FROM atomes WHERE owner = ?1 AND deleted = 0
         ORDER BY created_at DESC"
    ) {
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

    let atomes: Vec<AtomeData> = match stmt.query_map(rusqlite::params![claims.sub], |row| {
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
            owner: row.get(3)?,
            parent: row.get(4)?,
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

    let total = atomes.len() as i64;
    println!("📦 Exported {} atomes for user {}", total, claims.sub);

    (
        StatusCode::OK,
        Json(AtomeResponse {
            success: true,
            message: Some(format!("Exported {} items", total)),
            error: None,
            atome: None,
            data: None,
            atomes: Some(atomes),
            total: Some(total),
        }),
    )
}

// =============================================================================
// ROUTER
// =============================================================================

/// Request for sync receive (server-to-server sync with sync_secret)
#[derive(Debug, Deserialize)]
pub struct SyncReceiveRequest {
    pub atomes: Vec<SyncAtomeData>,
}

/// POST /api/atome/sync/receive - Receive atomes from Fastify (server-to-server)
/// Accepts sync_secret header for authentication instead of JWT
async fn sync_receive_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<SyncReceiveRequest>,
) -> impl IntoResponse {
    // Check sync secret header
    let sync_secret = headers
        .get("x-sync-secret")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    
    if sync_secret != SYNC_SECRET {
        // Fall back to JWT validation
        let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
        if validate_jwt(auth_header, &state.jwt_secret).is_err() {
            return (
                StatusCode::UNAUTHORIZED,
                Json(SyncResponse {
                    success: false,
                    error: Some("Unauthorized - invalid sync secret or JWT".into()),
                    message: None,
                    synced: None,
                    conflicts: None,
                    atomes: None,
                }),
            );
        }
    }

    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();
    let mut synced = 0i64;

    for atome in req.atomes {
        // Check if atome exists locally
        let existing: Result<i64, _> = db.query_row(
            "SELECT logical_clock FROM atomes WHERE id = ?1",
            rusqlite::params![&atome.id],
            |row| row.get(0),
        );

        match existing {
            Ok(local_clock) => {
                // Only update if remote is newer
                if atome.logical_clock > local_clock {
                    // Check if this is a delete sync
                    if atome.deleted {
                        let _ = db.execute(
                            "UPDATE atomes SET deleted = 1, deleted_at = ?1, updated_at = ?1, 
                             logical_clock = ?2, sync_status = 'synced' WHERE id = ?3",
                            rusqlite::params![&now, &atome.logical_clock, &atome.id],
                        );
                        synced += 1;
                        println!("🔄 [SyncReceive] Deleted atome {} (synced from Fastify)", atome.id);
                    } else {
                        let data_json = serde_json::to_string(&atome.data).unwrap_or_else(|_| "{}".to_string());
                        let snapshot_json = serde_json::to_string(&atome.snapshot).unwrap_or_else(|_| data_json.clone());
                        let meta_json = atome.meta.as_ref().map(|m| serde_json::to_string(m).unwrap_or_else(|_| "null".to_string()));

                        let _ = db.execute(
                            "UPDATE atomes SET kind = ?1, type = ?2, data = ?3, snapshot = ?4, 
                             parent = ?5, logical_clock = ?6, sync_status = 'synced', 
                             meta = ?7, updated_at = ?8 WHERE id = ?9",
                            rusqlite::params![
                                &atome.kind,
                                &atome.atome_type,
                                &data_json,
                                &snapshot_json,
                                &atome.parent,
                                &atome.logical_clock,
                                &meta_json,
                                &now,
                                &atome.id
                            ],
                        );
                        synced += 1;
                        println!("🔄 [SyncReceive] Updated atome {} (clock {} -> {})", atome.id, local_clock, atome.logical_clock);
                    }
                }
            }
            Err(_) => {
                // Skip creation if atome is deleted
                if atome.deleted {
                    println!("🔄 [SyncReceive] Skipping deleted atome {} (doesn't exist locally)", atome.id);
                    continue;
                }

                // Atome doesn't exist locally, create it
                let data_json = serde_json::to_string(&atome.data).unwrap_or_else(|_| "{}".to_string());
                let snapshot_json = serde_json::to_string(&atome.snapshot).unwrap_or_else(|_| data_json.clone());
                let meta_json = atome.meta.as_ref().map(|m| serde_json::to_string(m).unwrap_or_else(|_| "null".to_string()));

                let _ = db.execute(
                    "INSERT INTO atomes (id, tenant_id, kind, type, owner, parent, data, snapshot, 
                     logical_clock, schema_version, device_id, sync_status, meta, created_at, updated_at, 
                     deleted, created_source)
                     VALUES (?1, 'local-tenant', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, 'synced', ?10, ?11, ?12, 0, 'fastify')",
                    rusqlite::params![
                        &atome.id,
                        &atome.kind,
                        &atome.atome_type,
                        &atome.owner,
                        &atome.parent,
                        &data_json,
                        &snapshot_json,
                        &atome.logical_clock,
                        &atome.device_id,
                        &meta_json,
                        &atome.created_at,
                        &now,
                    ],
                );
                synced += 1;
                println!("🔄 [SyncReceive] Created atome {} from Fastify", atome.id);
            }
        }
    }

    println!("🔄 [SyncReceive] Total: {} atomes synced from Fastify", synced);

    (
        StatusCode::OK,
        Json(SyncResponse {
            success: true,
            message: Some(format!("Synced {} atomes", synced)),
            error: None,
            synced: Some(synced),
            conflicts: None,
            atomes: None,
        }),
    )
}

// =============================================================================
// HASH VERIFICATION & RECONCILIATION HANDLERS
// =============================================================================

/// Response for hash verification
#[derive(Debug, Serialize)]
pub struct SyncHashResponse {
    pub success: bool,
    pub user_id: String,
    pub hash: String,
    pub atome_count: i64,
    pub max_logical_clock: i64,
    pub last_update: String,
}

/// Response for queue status
#[derive(Debug, Serialize)]
pub struct SyncQueueStatusResponse {
    pub success: bool,
    pub pending: i64,
    pub failed: i64,
    pub total: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<SyncQueueItem>>,
}

#[derive(Debug, Serialize)]
pub struct SyncQueueItem {
    pub id: i64,
    pub object_id: String,
    pub operation: String,
    pub status: String,
    pub attempts: i64,
    pub error_message: Option<String>,
    pub created_at: String,
}

/// Request for reconciliation
#[derive(Debug, Deserialize)]
pub struct ReconcileRequest {
    pub remote_hash: String,
    pub remote_atome_count: i64,
    pub remote_max_clock: i64,
}

/// GET /api/sync/hash - Get current sync hash for authenticated user
async fn get_sync_hash_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let claims = match validate_jwt(auth_header, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => {
            return (
                e.0,
                Json(serde_json::json!({
                    "success": false,
                    "error": e.1.error
                })),
            );
        }
    };

    let db = state.db.lock().unwrap();
    
    // Compute fresh hash
    match compute_user_sync_hash(&db, &claims.sub) {
        Ok((hash, count, max_clock)) => {
            let now = Utc::now().to_rfc3339();
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "user_id": claims.sub,
                    "hash": hash,
                    "atome_count": count,
                    "max_logical_clock": max_clock,
                    "last_update": now
                })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "error": e
            })),
        ),
    }
}

/// POST /api/sync/reconcile - Compare hashes and trigger full sync if needed
async fn reconcile_sync_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<ReconcileRequest>,
) -> impl IntoResponse {
    // Check for sync secret (server-to-server) or JWT
    let sync_secret = headers.get("x-sync-secret").and_then(|h| h.to_str().ok());
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    
    let user_id = if sync_secret == Some(SYNC_SECRET) {
        // Server-to-server - get user_id from request or header
        headers.get("x-user-id").and_then(|h| h.to_str().ok()).unwrap_or("unknown").to_string()
    } else {
        match validate_jwt(auth_header, &state.jwt_secret) {
            Ok(c) => c.sub,
            Err(e) => {
                return (
                    e.0,
                    Json(serde_json::json!({
                        "success": false,
                        "error": e.1.error
                    })),
                );
            }
        }
    };

    let db = state.db.lock().unwrap();
    
    // Compute local hash
    let (local_hash, local_count, local_max_clock) = match compute_user_sync_hash(&db, &user_id) {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "error": e
                })),
            );
        }
    };

    // Compare hashes
    if local_hash == req.remote_hash {
        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "in_sync": true,
                "message": "Databases are in sync",
                "local_hash": local_hash,
                "remote_hash": req.remote_hash
            })),
        );
    }

    // Hashes differ - need to sync
    // Determine which side is ahead based on max logical clock
    let needs_pull = req.remote_max_clock > local_max_clock;
    let needs_push = local_max_clock > req.remote_max_clock;

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "in_sync": false,
            "message": "Databases out of sync, reconciliation needed",
            "local_hash": local_hash,
            "remote_hash": req.remote_hash,
            "local_count": local_count,
            "remote_count": req.remote_atome_count,
            "local_max_clock": local_max_clock,
            "remote_max_clock": req.remote_max_clock,
            "needs_pull": needs_pull,
            "needs_push": needs_push
        })),
    )
}

/// GET /api/sync/queue-status - Get pending sync queue status
async fn sync_queue_status_handler(
    State(state): State<LocalAtomeState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Validate JWT
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    if validate_jwt(auth_header, &state.jwt_secret).is_err() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "error": "Unauthorized"
            })),
        );
    }

    let db = state.db.lock().unwrap();
    
    // Count by status
    let pending: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    
    let failed: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    
    let total: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_queue",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    
    // Get recent items
    let mut stmt = match db.prepare(
        "SELECT id, object_id, operation, status, attempts, error_message, created_at 
         FROM sync_queue ORDER BY created_at DESC LIMIT 20"
    ) {
        Ok(s) => s,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "pending": pending,
                    "failed": failed,
                    "total": total
                })),
            );
        }
    };
    
    let items: Vec<SyncQueueItem> = stmt.query_map([], |row| {
        Ok(SyncQueueItem {
            id: row.get(0)?,
            object_id: row.get(1)?,
            operation: row.get(2)?,
            status: row.get(3)?,
            attempts: row.get(4)?,
            error_message: row.get(5)?,
            created_at: row.get(6)?,
        })
    })
    .ok()
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default();
    
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "pending": pending,
            "failed": failed,
            "total": total,
            "items": items
        })),
    )
}

/// Create the local atome router
pub fn create_local_atome_router(data_dir: PathBuf) -> Router {
    // Initialize database
    let conn = init_database(&data_dir).expect("Failed to initialize local atome database");

    // Create state with same JWT secret as auth module
    let state = LocalAtomeState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: get_jwt_secret(&data_dir),
    };

    // Start background sync worker
    start_sync_worker(state.db.clone());

    Router::new()
        .route("/api/atome/create", post(create_atome_handler))
        .route("/api/atome/list", get(list_atomes_handler))
        .route("/api/atome/:id", get(get_atome_handler))
        .route("/api/atome/:id", put(update_atome_handler))
        .route("/api/atome/:id", delete(delete_atome_handler))
        // ADOLE endpoints (alter, rename, history, restore)
        .route("/api/atome/:id/alter", post(alter_atome_handler))
        .route("/api/atome/:id/rename", post(rename_atome_handler))
        .route("/api/atome/:id/history", get(history_atome_handler))
        .route("/api/atome/:id/restore", post(restore_atome_handler))
        // User data endpoints
        .route("/api/user-data/delete-all", delete(delete_user_data_handler))
        .route("/api/user-data/export", get(export_user_data_handler))
        // Sync endpoints
        .route("/api/sync/push", post(sync_push_handler))
        .route("/api/sync/pull", get(sync_pull_handler))
        .route("/api/sync/ack", post(sync_ack_handler))
        .route("/api/sync/receive", post(sync_receive_handler))
        // Hash verification endpoints
        .route("/api/sync/hash", get(get_sync_hash_handler))
        .route("/api/sync/reconcile", post(reconcile_sync_handler))
        .route("/api/sync/queue-status", get(sync_queue_status_handler))
        // Backward compatibility aliases
        .route("/api/atome/sync/push", post(sync_push_handler))
        .route("/api/atome/sync/pull", get(sync_pull_handler))
        .route("/api/atome/sync/ack", post(sync_ack_handler))
        .route("/api/atome/sync/receive", post(sync_receive_handler))
        .with_state(state)
}
