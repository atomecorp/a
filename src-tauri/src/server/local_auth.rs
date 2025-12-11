//! Local Authentication Module for Tauri/Axum
//!
//! Provides offline authentication using SQLite for local user storage.
//! Users created here can optionally sync to the remote Fastify server.
//!
//! Features:
//! - User registration with bcrypt password hashing
//! - Login with JWT session tokens
//! - Local SQLite database storage
//! - Sync capability to remote server
//! - Deterministic user IDs based on phone number (same ID across all platforms)

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use reqwest;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

// =============================================================================
// CONSTANTS
// =============================================================================

/// Namespace UUID for deterministic user ID generation
/// This MUST be the same in Fastify and Axum to generate identical user IDs
/// Using DNS namespace UUID: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
const SQUIRREL_USER_NAMESPACE: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

/// Generate a deterministic user ID from phone number
/// Uses UUID v5 (SHA-1 based) with a fixed namespace
/// This ensures the same phone number always produces the same user ID
/// across all platforms (Fastify, Axum/Tauri, iOS)
fn generate_deterministic_user_id(phone: &str) -> String {
    // Normalize phone: remove spaces, dashes, parentheses
    let normalized: String = phone
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '(' && *c != ')')
        .collect::<String>()
        .to_lowercase();

    // Generate UUID v5 from phone + namespace
    let user_id = Uuid::new_v5(&SQUIRREL_USER_NAMESPACE, normalized.as_bytes());

    println!(
        "[Auth] Generated deterministic userId for phone {}***: {}",
        &phone[..std::cmp::min(4, phone.len())],
        user_id
    );

    user_id.to_string()
}

// =============================================================================
// SYNC FUNCTIONS
// =============================================================================

/// Sync user to Fastify server
/// Sends user data to Fastify's sync-register endpoint
async fn sync_user_to_fastify(
    user_id: &str,
    username: &str,
    phone: &str,
    password_hash: &str,
) -> Result<(), String> {
    let fastify_url =
        std::env::var("FASTIFY_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
    let sync_secret =
        std::env::var("SYNC_SECRET").unwrap_or_else(|_| "squirrel-sync-2024".to_string());

    let client = reqwest::Client::new();

    let payload = serde_json::json!({
        "userId": user_id,
        "username": username,
        "phone": phone,
        "passwordHash": password_hash,
        "source": "tauri",
        "syncSecret": sync_secret
    });

    let response = client
        .post(format!("{}/api/auth/sync-register", fastify_url))
        .header("Content-Type", "application/json")
        .header("X-Sync-Source", "tauri")
        .header("X-Sync-Secret", &sync_secret)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Fastify returned status: {}", response.status()))
    }
}

// =============================================================================
// TYPES
// =============================================================================

/// Local user stored in SQLite
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalUser {
    pub id: String,
    pub username: String,
    pub phone: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_id: Option<String>, // ID on remote server if synced
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync: Option<String>,
}

/// JWT claims for local sessions
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // User ID
    pub username: String,
    pub phone: String,
    pub exp: i64, // Expiration timestamp
    pub iat: i64, // Issued at timestamp
}

/// Auth state shared between routes
#[derive(Clone)]
pub struct LocalAuthState {
    db: Arc<Mutex<Connection>>,
    jwt_secret: String,
}

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub phone: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub phone: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // Will be used for update feature
pub struct UpdateRequest {
    pub username: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // Will be used for password change feature
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: String,
}

/// Request for synced deletion from cloud (no password needed, cloud already verified)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct DeleteSyncedRequest {
    #[serde(rename = "userId")]
    pub user_id: Option<String>,
    pub phone: Option<String>,
    #[serde(rename = "syncedFromCloud")]
    pub synced_from_cloud: Option<bool>,
}

/// Request for sync-delete from Fastify server (uses sync secret, not JWT)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SyncDeleteRequest {
    pub phone: String,
    #[serde(rename = "userId")]
    pub user_id: Option<String>,
}

/// Request for sync-register from Fastify server (creates user with pre-hashed password)
#[derive(Debug, Deserialize)]
pub struct SyncRegisterRequest {
    pub username: String,
    pub phone: String,
    pub password_hash: String,
    pub sync_secret: String,
    pub source_server: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced: Option<bool>,
}

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/// Initialize SQLite database for local users
pub fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("local_users.db");

    // Create data directory if it doesn't exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;

    // Create users table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            cloud_id TEXT,
            last_sync TEXT,
            created_source TEXT DEFAULT 'tauri'
        )",
        [],
    )?;

    // Add created_source column if it doesn't exist (migration for existing databases)
    conn.execute(
        "ALTER TABLE users ADD COLUMN created_source TEXT DEFAULT 'tauri'",
        [],
    )
    .ok(); // Ignore error if column already exists

    // Create index on phone for faster lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)",
        [],
    )?;

    println!("📦 Local auth database initialized: {:?}", db_path);

    Ok(conn)
}

/// Get or create a persistent JWT secret
/// The secret is stored in a file so it survives app restarts
fn get_or_create_jwt_secret(data_dir: &PathBuf) -> String {
    // First check environment variable
    if let Ok(secret) = std::env::var("LOCAL_JWT_SECRET") {
        println!("🔐 Using JWT secret from environment");
        return secret;
    }

    // Try to load from file
    let secret_path = data_dir.join("jwt_secret.key");

    if secret_path.exists() {
        if let Ok(secret) = std::fs::read_to_string(&secret_path) {
            let secret = secret.trim().to_string();
            if !secret.is_empty() {
                println!("🔐 Loaded JWT secret from file");
                return secret;
            }
        }
    }

    // Generate new secret and save it
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rand::Rng::gen(&mut rng)).collect();
    let secret = hex::encode(bytes);

    // Save to file
    if let Err(e) = std::fs::write(&secret_path, &secret) {
        println!("⚠️ Could not save JWT secret to file: {}", e);
    } else {
        println!("🔐 Generated and saved new JWT secret");
    }

    secret
}

/// Generate a random JWT secret if not provided (legacy, kept for compatibility)
#[allow(dead_code)]
fn generate_jwt_secret() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rand::Rng::gen(&mut rng)).collect();
    hex::encode(bytes)
}

// =============================================================================
// AUTH HANDLERS
// =============================================================================

/// POST /api/auth/local/register
async fn register_handler(
    State(state): State<LocalAuthState>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    // Validate input
    if req.username.trim().len() < 2 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("Username must be at least 2 characters".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    if req.phone.trim().len() < 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("Valid phone number is required".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    if req.password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("Password must be at least 8 characters".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    let clean_phone = req.phone.trim().replace(" ", "");
    let clean_username = req.username.trim().to_string();

    // Check if phone already exists
    {
        let db = state.db.lock().unwrap();
        let exists: bool = db
            .query_row(
                "SELECT 1 FROM users WHERE phone = ?1",
                [&clean_phone],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            // Return 200 with already_exists flag to avoid browser console errors
            // The client can check the message to know the user already exists
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    error: None,
                    message: Some("User already exists - ready to login".into()),
                    user: None,
                    token: None,
                }),
            );
        }
    }

    // Hash password
    let password_hash = match hash(&req.password, DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some("Failed to hash password".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Create user with deterministic ID based on phone number
    // This ensures same user gets same ID across Fastify, Tauri, and iOS
    let user_id = generate_deterministic_user_id(&clean_phone);
    let now = Utc::now().to_rfc3339();

    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT INTO users (id, username, phone, password_hash, created_at, updated_at, created_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                user_id,
                clean_username,
                clean_phone,
                password_hash,
                now,
                now,
                "tauri"
            ],
        ) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to create user: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    // Generate JWT token
    let token = match generate_token(&state.jwt_secret, &user_id, &clean_username, &clean_phone) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some("Failed to generate token".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    println!(
        "✅ Local user registered: {} ({})",
        clean_username, clean_phone
    );

    // === SYNC: Try to sync user to Fastify server ===
    let sync_result =
        sync_user_to_fastify(&user_id, &clean_username, &clean_phone, &password_hash).await;
    let synced = sync_result.is_ok();
    if synced {
        println!("[auth] ✅ User synced to Fastify server");
    } else if let Err(ref e) = sync_result {
        println!("[auth] ⚠️ Could not sync to Fastify: {}", e);
    }

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("Account created successfully".into()),
            error: None,
            user: Some(UserInfo {
                id: user_id,
                username: clean_username,
                phone: clean_phone,
                cloud_id: None,
                synced: Some(synced),
            }),
            token: Some(token),
        }),
    )
}

/// POST /api/auth/local/sync-register
/// Create a user from another server (Fastify sync)
/// Accepts pre-hashed password for server-to-server sync
async fn sync_register_handler(
    State(state): State<LocalAuthState>,
    Json(req): Json<SyncRegisterRequest>,
) -> impl IntoResponse {
    // Validate sync secret
    let expected_secret =
        std::env::var("SYNC_SECRET").unwrap_or_else(|_| "squirrel_sync_secret_dev".to_string());
    if req.sync_secret != expected_secret {
        return (
            StatusCode::FORBIDDEN,
            Json(AuthResponse {
                success: false,
                error: Some("Invalid sync secret".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    // Validate input
    if req.username.trim().len() < 2 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("Username must be at least 2 characters".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    if req.phone.trim().len() < 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("Valid phone number is required".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    let clean_phone = req.phone.trim().replace(" ", "");
    let clean_username = req.username.trim().to_string();
    let source = req.source_server.unwrap_or_else(|| "sync".to_string());

    // Check if phone already exists
    {
        let db = state.db.lock().unwrap();
        let existing_id: Option<String> = db
            .query_row(
                "SELECT id FROM users WHERE phone = ?1",
                [&clean_phone],
                |row| row.get(0),
            )
            .ok();

        if let Some(id) = existing_id {
            // User already exists - this is fine for sync
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    message: Some("User already exists".into()),
                    error: None,
                    user: Some(UserInfo {
                        id,
                        username: clean_username,
                        phone: clean_phone,
                        cloud_id: None,
                        synced: Some(true),
                    }),
                    token: None,
                }),
            );
        }
    }

    // Create user with deterministic ID and pre-hashed password
    let user_id = generate_deterministic_user_id(&clean_phone);
    let now = Utc::now().to_rfc3339();

    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT INTO users (id, username, phone, password_hash, created_at, updated_at, created_source, last_sync)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                user_id,
                clean_username,
                clean_phone,
                req.password_hash, // Already hashed from source server
                now,
                now,
                source,
                now // Mark as synced
            ],
        ) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to create synced user: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    println!(
        "✅ User synced from {}: {} ({})",
        source, clean_username, clean_phone
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("User synced successfully".into()),
            error: None,
            user: Some(UserInfo {
                id: user_id,
                username: clean_username,
                phone: clean_phone,
                cloud_id: None,
                synced: Some(true),
            }),
            token: None,
        }),
    )
}

/// POST /api/auth/local/login
async fn login_handler(
    State(state): State<LocalAuthState>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    let clean_phone = req.phone.trim().replace(" ", "");

    // Find user
    let user: Option<LocalUser> = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, username, phone, password_hash, created_at, updated_at, cloud_id, last_sync
             FROM users WHERE phone = ?1",
            [&clean_phone],
            |row| {
                Ok(LocalUser {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    phone: row.get(2)?,
                    password_hash: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    cloud_id: row.get(6)?,
                    last_sync: row.get(7)?,
                })
            },
        )
        .ok()
    };

    let user = match user {
        Some(u) => u,
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid phone or password".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify password
    if !verify(&req.password, &user.password_hash).unwrap_or(false) {
        return (
            StatusCode::OK,
            Json(AuthResponse {
                success: false,
                error: Some("Invalid phone or password".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    // Generate token
    let token = match generate_token(&state.jwt_secret, &user.id, &user.username, &user.phone) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some("Failed to generate token".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    println!(
        "✅ Local user logged in: {} ({})",
        user.username, user.phone
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: None,
            error: None,
            user: Some(UserInfo {
                id: user.id,
                username: user.username,
                phone: user.phone,
                cloud_id: user.cloud_id,
                synced: Some(user.last_sync.is_some()),
            }),
            token: Some(token),
        }),
    )
}

/// Response for list users endpoint
#[derive(Debug, Serialize)]
pub struct ListUsersResponse {
    pub success: bool,
    pub database: String,
    pub users: Vec<UserInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// GET /api/auth/local/users
/// List all users in the local SQLite database
async fn list_users_handler(State(state): State<LocalAuthState>) -> impl IntoResponse {
    let db = state.db.lock().unwrap();

    let mut stmt = match db.prepare(
        "SELECT id, username, phone, created_at, cloud_id, last_sync, created_source FROM users ORDER BY created_at DESC"
    ) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ListUsersResponse {
                    success: false,
                    database: "Tauri/SQLite".into(),
                    users: vec![],
                    error: Some(format!("Database error: {}", e)),
                }),
            );
        }
    };

    let users: Vec<UserInfo> = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                phone: row.get(2)?,
                cloud_id: row.get(4).ok(),
                synced: Some(row.get::<_, Option<String>>(5).ok().flatten().is_some()),
            })
        })
        .unwrap_or_else(|_| panic!("Query failed"))
        .filter_map(|r| r.ok())
        .collect();

    println!("[Auth] Listed {} users from SQLite", users.len());

    (
        StatusCode::OK,
        Json(ListUsersResponse {
            success: true,
            database: "Tauri/SQLite".into(),
            users,
            error: None,
        }),
    )
}

/// GET /api/auth/local/me
async fn me_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Extract token from Authorization header
    let token = match headers.get("Authorization") {
        Some(h) => {
            let val = h.to_str().unwrap_or("");
            if val.starts_with("Bearer ") {
                val[7..].to_string()
            } else {
                return (
                    StatusCode::OK,
                    Json(AuthResponse {
                        success: false,
                        error: None,
                        message: Some("Not authenticated".into()),
                        user: None,
                        token: None,
                    }),
                );
            }
        }
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: None,
                    message: Some("Not authenticated".into()),
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify token
    let claims = match verify_token(&state.jwt_secret, &token) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: None,
                    message: Some("Invalid or expired session".into()),
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Get fresh user data
    let user: Option<LocalUser> = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, username, phone, password_hash, created_at, updated_at, cloud_id, last_sync
             FROM users WHERE id = ?1",
            [&claims.sub],
            |row| {
                Ok(LocalUser {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    phone: row.get(2)?,
                    password_hash: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    cloud_id: row.get(6)?,
                    last_sync: row.get(7)?,
                })
            },
        )
        .ok()
    };

    match user {
        Some(u) => (
            StatusCode::OK,
            Json(AuthResponse {
                success: true,
                error: None,
                message: None,
                user: Some(UserInfo {
                    id: u.id,
                    username: u.username,
                    phone: u.phone,
                    cloud_id: u.cloud_id,
                    synced: Some(u.last_sync.is_some()),
                }),
                token: None,
            }),
        ),
        None => (
            StatusCode::OK,
            Json(AuthResponse {
                success: false,
                error: Some("User not found".into()),
                message: None,
                user: None,
                token: None,
            }),
        ),
    }
}

/// POST /api/auth/local/logout
async fn logout_handler() -> impl IntoResponse {
    // For JWT-based auth, logout is client-side (discard token)
    // Server-side, we just acknowledge the request
    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("Logged out successfully".into()),
            error: None,
            user: None,
            token: None,
        }),
    )
}

/// POST /api/auth/local/change-password
async fn change_password_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    // Validate JWT token
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    error: Some("Missing or invalid authorization header".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Decode token
    let claims = match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(token_data) => token_data.claims,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid or expired token".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Validate new password
    if req.new_password.len() < 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                error: Some("New password must be at least 6 characters".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    let db = state.db.lock().unwrap();

    // Get current password hash
    let user: Result<(String, String), _> = db.query_row(
        "SELECT id, password_hash FROM users WHERE id = ?1",
        params![claims.sub],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match user {
        Ok((user_id, password_hash)) => {
            // Verify current password
            if !verify(&req.current_password, &password_hash).unwrap_or(false) {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(AuthResponse {
                        success: false,
                        error: Some("Current password is incorrect".into()),
                        message: None,
                        user: None,
                        token: None,
                    }),
                );
            }

            // Hash new password
            let new_hash = match hash(&req.new_password, DEFAULT_COST) {
                Ok(h) => h,
                Err(_) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(AuthResponse {
                            success: false,
                            error: Some("Failed to hash password".into()),
                            message: None,
                            user: None,
                            token: None,
                        }),
                    );
                }
            };

            // Update password
            let now = Utc::now().to_rfc3339();
            match db.execute(
                "UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3",
                params![new_hash, now, user_id],
            ) {
                Ok(_) => {
                    println!("🔐 Password changed for user {}", user_id);
                    (
                        StatusCode::OK,
                        Json(AuthResponse {
                            success: true,
                            message: Some("Password updated successfully".into()),
                            error: None,
                            user: None,
                            token: None,
                        }),
                    )
                }
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(AuthResponse {
                        success: false,
                        error: Some(format!("Database error: {}", e)),
                        message: None,
                        user: None,
                        token: None,
                    }),
                ),
            }
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(AuthResponse {
                success: false,
                error: Some("User not found".into()),
                message: None,
                user: None,
                token: None,
            }),
        ),
    }
}

/// POST /api/auth/local/refresh
async fn refresh_token_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Validate current JWT token
    let auth_header = headers.get("authorization").and_then(|h| h.to_str().ok());
    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    error: Some("Missing or invalid authorization header".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Decode token (allow expired tokens for refresh)
    let mut validation = Validation::default();
    validation.validate_exp = false; // Allow expired tokens

    let claims = match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &validation,
    ) {
        Ok(token_data) => token_data.claims,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid token".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Generate new token with extended expiration
    let new_claims = Claims {
        sub: claims.sub.clone(),
        username: claims.username.clone(),
        phone: claims.phone.clone(),
        exp: (Utc::now() + Duration::hours(24)).timestamp(),
        iat: Utc::now().timestamp(),
    };

    match encode(
        &Header::default(),
        &new_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ) {
        Ok(new_token) => {
            println!("🔄 Token refreshed for user {}", claims.sub);
            (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    message: Some("Token refreshed".into()),
                    error: None,
                    user: None,
                    token: Some(new_token),
                }),
            )
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AuthResponse {
                success: false,
                error: Some("Failed to generate new token".into()),
                message: None,
                user: None,
                token: None,
            }),
        ),
    }
}

/// DELETE /api/auth/local/delete
async fn delete_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<DeleteAccountRequest>,
) -> impl IntoResponse {
    // Extract and verify token
    let token = match headers.get("Authorization") {
        Some(h) => {
            let val = h.to_str().unwrap_or("");
            if val.starts_with("Bearer ") {
                val[7..].to_string()
            } else {
                return (
                    StatusCode::OK,
                    Json(AuthResponse {
                        success: false,
                        error: Some("Not authenticated".into()),
                        message: None,
                        user: None,
                        token: None,
                    }),
                );
            }
        }
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Not authenticated".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    let claims = match verify_token(&state.jwt_secret, &token) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid session".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify password before deletion
    let user: Option<LocalUser> = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, username, phone, password_hash, created_at, updated_at, cloud_id, last_sync
             FROM users WHERE id = ?1",
            [&claims.sub],
            |row| {
                Ok(LocalUser {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    phone: row.get(2)?,
                    password_hash: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    cloud_id: row.get(6)?,
                    last_sync: row.get(7)?,
                })
            },
        )
        .ok()
    };

    let user = match user {
        Some(u) => u,
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("User not found".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify password
    if !verify(&req.password, &user.password_hash).unwrap_or(false) {
        return (
            StatusCode::OK,
            Json(AuthResponse {
                success: false,
                error: Some("Incorrect password".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    // Try to delete from cloud server first (Fastify)
    // This ensures both servers are in sync
    let cloud_delete_result = notify_cloud_deletion(&user.phone, &req.password).await;
    if let Err(e) = &cloud_delete_result {
        println!("⚠️ Cloud deletion notification: {}", e);
        // Continue with local deletion even if cloud fails
    } else {
        println!("☁️ Cloud account deletion notified");
    }

    // Delete user locally
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute("DELETE FROM users WHERE id = ?1", [&claims.sub]) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to delete account: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    println!(
        "🗑️ Local account deleted: {} ({})",
        user.username, user.phone
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("Account deleted successfully".into()),
            error: None,
            user: Some(UserInfo {
                id: user.id,
                username: user.username,
                phone: user.phone,
                cloud_id: user.cloud_id,
                synced: None,
            }),
            token: None,
        }),
    )
}

/// Notify Fastify server to delete the cloud account
async fn notify_cloud_deletion(phone: &str, password: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let fastify_url = "http://localhost:3001";

    // First login to get a token
    let login_response = client
        .post(format!("{}/api/auth/login", fastify_url))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "phone": phone,
            "password": password
        }))
        .send()
        .await
        .map_err(|e| format!("Login request failed: {}", e))?;

    let login_data: serde_json::Value = login_response
        .json()
        .await
        .map_err(|e| format!("Login parse failed: {}", e))?;

    if !login_data["success"].as_bool().unwrap_or(false) {
        let error = login_data["error"].as_str().unwrap_or("Unknown error");
        // If account doesn't exist on cloud, that's fine
        if error.contains("Invalid") || error.contains("not found") {
            return Ok(());
        }
        return Err(format!("Cloud login failed: {}", error));
    }

    let token = login_data["token"]
        .as_str()
        .ok_or("No token in login response")?;

    // Now delete the account
    let delete_response = client
        .delete(format!("{}/api/auth/delete-account", fastify_url))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "password": password
        }))
        .send()
        .await
        .map_err(|e| format!("Delete request failed: {}", e))?;

    let delete_data: serde_json::Value = delete_response
        .json()
        .await
        .map_err(|e| format!("Delete parse failed: {}", e))?;

    if !delete_data["success"].as_bool().unwrap_or(false) {
        let error = delete_data["error"].as_str().unwrap_or("Unknown error");
        return Err(format!("Cloud deletion failed: {}", error));
    }

    Ok(())
}
/// Delete local account synced from cloud (no password verification needed)
/// This is called when an account is deleted from the cloud server
async fn delete_synced_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<DeleteSyncedRequest>,
) -> impl IntoResponse {
    // Must have a valid JWT (to prove they were logged in)
    let token = match headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
        Some(t) => t,
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Authorization required".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify token
    let claims = match decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(data) => data.claims,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid or expired session".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Verify this is a synced deletion request
    if !req.synced_from_cloud.unwrap_or(false) {
        return (
            StatusCode::OK,
            Json(AuthResponse {
                success: false,
                error: Some("Invalid sync request".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    // Find user by phone or userId from the request, or use the token's user
    let user_id_to_delete = req.user_id.unwrap_or_else(|| claims.sub.clone());
    let phone_to_check = req.phone.unwrap_or_else(|| claims.phone.clone());

    // Verify the token user matches the deletion target (security check)
    if claims.sub != user_id_to_delete && claims.phone != phone_to_check {
        return (
            StatusCode::OK,
            Json(AuthResponse {
                success: false,
                error: Some("Unauthorized to delete this account".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    // Get user info for logging
    let user = {
        let db = state.db.lock().unwrap();
        let mut stmt = db
            .prepare("SELECT id, username, phone, password_hash, created_at, updated_at, cloud_id, last_sync FROM users WHERE id = ?1 OR phone = ?2")
            .unwrap();

        stmt.query_row(params![&user_id_to_delete, &phone_to_check], |row| {
            Ok(LocalUser {
                id: row.get(0)?,
                username: row.get(1)?,
                phone: row.get(2)?,
                password_hash: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                cloud_id: row.get(6)?,
                last_sync: row.get(7)?,
            })
        })
        .ok()
    };

    let user = match user {
        Some(u) => u,
        None => {
            // User not found - might already be deleted
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    message: Some("Account already deleted or not found locally".into()),
                    error: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Delete user
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute("DELETE FROM users WHERE id = ?1", [&user.id]) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to delete account: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    println!(
        "🗑️ Local account deleted (synced from cloud): {} ({})",
        user.username, user.phone
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("Account deleted successfully (synced from cloud)".into()),
            error: None,
            user: None,
            token: None,
        }),
    )
}

/// POST /api/auth/local/sync-delete
/// Delete local account when Fastify deletes the cloud account
/// Uses X-Sync-Secret header for authentication instead of JWT
async fn sync_delete_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<SyncDeleteRequest>,
) -> impl IntoResponse {
    // Verify sync secret
    let expected_secret =
        std::env::var("SYNC_SECRET").unwrap_or_else(|_| "squirrel-sync-2024".to_string());
    let provided_secret = headers
        .get("X-Sync-Secret")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if provided_secret != expected_secret {
        println!("⚠️ sync-delete: Invalid sync secret");
        return (
            StatusCode::UNAUTHORIZED,
            Json(AuthResponse {
                success: false,
                error: Some("Invalid sync secret".into()),
                message: None,
                user: None,
                token: None,
            }),
        );
    }

    let source = headers
        .get("X-Sync-Source")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown");

    println!("🔄 sync-delete from {}: phone={}", source, req.phone);

    // Find user by phone
    let user = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, username, phone, password_hash, created_at, updated_at, cloud_id, last_sync FROM users WHERE phone = ?1",
            [&req.phone],
            |row| {
                Ok(LocalUser {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    phone: row.get(2)?,
                    password_hash: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    cloud_id: row.get(6)?,
                    last_sync: row.get(7)?,
                })
            },
        )
        .ok()
    };

    let user = match user {
        Some(u) => u,
        None => {
            println!(
                "ℹ️ sync-delete: User not found locally for phone {}",
                req.phone
            );
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    message: Some(
                        "Account not found locally (already deleted or never synced)".into(),
                    ),
                    error: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Delete user
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute("DELETE FROM users WHERE id = ?1", [&user.id]) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to delete account: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    println!(
        "✅ sync-delete: Local account deleted: {} ({}) - synced from {}",
        user.username, user.phone, source
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some(format!(
                "Account deleted successfully (synced from {})",
                source
            )),
            error: None,
            user: None,
            token: None,
        }),
    )
}

// =============================================================================
// JWT HELPERS
// =============================================================================

fn generate_token(
    secret: &str,
    user_id: &str,
    username: &str,
    phone: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let exp = now + Duration::days(7);

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        phone: phone.to_string(),
        iat: now.timestamp(),
        exp: exp.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

fn verify_token(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}

// =============================================================================
// SYNC HELPERS
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct UpdateCloudIdRequest {
    pub cloud_id: String,
}

/// POST /api/auth/local/update-cloud-id
/// Update local account with cloud ID after successful sync
async fn update_cloud_id_handler(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<UpdateCloudIdRequest>,
) -> impl IntoResponse {
    // Extract and verify token
    let token = match headers.get("Authorization") {
        Some(h) => {
            let val = h.to_str().unwrap_or("");
            if val.starts_with("Bearer ") {
                val[7..].to_string()
            } else {
                return (
                    StatusCode::OK,
                    Json(AuthResponse {
                        success: false,
                        error: Some("Not authenticated".into()),
                        message: None,
                        user: None,
                        token: None,
                    }),
                );
            }
        }
        None => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Not authenticated".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    let claims = match verify_token(&state.jwt_secret, &token) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(AuthResponse {
                    success: false,
                    error: Some("Invalid session".into()),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    };

    // Update cloud ID and last_sync
    let now = Utc::now().to_rfc3339();
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "UPDATE users SET cloud_id = ?1, last_sync = ?2 WHERE id = ?3",
            params![&req.cloud_id, &now, &claims.sub],
        ) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    error: Some(format!("Failed to update cloud ID: {}", e)),
                    message: None,
                    user: None,
                    token: None,
                }),
            );
        }
    }

    println!(
        "☁️ Local account synced to cloud: {} -> {}",
        claims.sub, req.cloud_id
    );

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: Some("Cloud ID updated".into()),
            error: None,
            user: None,
            token: None,
        }),
    )
}

// =============================================================================
// ROUTER
// =============================================================================

/// Create the local auth router
pub fn create_local_auth_router(data_dir: PathBuf) -> Router {
    // Initialize database
    let conn = init_database(&data_dir).expect("Failed to initialize local auth database");

    // Create state with PERSISTENT JWT secret
    let state = LocalAuthState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: get_or_create_jwt_secret(&data_dir),
    };

    Router::new()
        .route("/api/auth/local/register", post(register_handler))
        .route("/api/auth/local/sync-register", post(sync_register_handler))
        .route("/api/auth/local/login", post(login_handler))
        .route("/api/auth/local/logout", post(logout_handler))
        .route("/api/auth/local/me", get(me_handler))
        .route("/api/auth/local/users", get(list_users_handler))
        .route(
            "/api/auth/local/change-password",
            post(change_password_handler),
        )
        .route("/api/auth/local/refresh", post(refresh_token_handler))
        .route("/api/auth/local/delete", delete(delete_handler.clone()))
        .route("/api/auth/local/delete-account", delete(delete_handler)) // Alias for consistency
        .route(
            "/api/auth/local/delete-synced",
            delete(delete_synced_handler),
        )
        .route("/api/auth/local/sync-delete", post(sync_delete_handler))
        .route(
            "/api/auth/local/update-cloud-id",
            post(update_cloud_id_handler),
        )
        .with_state(state)
}
