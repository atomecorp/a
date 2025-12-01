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
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

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
            last_sync TEXT
        )",
        [],
    )?;

    // Create index on phone for faster lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)",
        [],
    )?;

    println!("📦 Local auth database initialized: {:?}", db_path);

    Ok(conn)
}

/// Generate a random JWT secret if not provided
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
            return (
                StatusCode::CONFLICT,
                Json(AuthResponse {
                    success: false,
                    error: Some("Phone number already registered".into()),
                    message: None,
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

    // Create user
    let user_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.execute(
            "INSERT INTO users (id, username, phone, password_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                user_id,
                clean_username,
                clean_phone,
                password_hash,
                now,
                now
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
                synced: Some(false),
            }),
            token: Some(token),
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

    // Delete user
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
            user: None,
            token: None,
        }),
    )
}

/// DELETE /api/auth/local/delete-synced
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

    // Create state
    let state = LocalAuthState {
        db: Arc::new(Mutex::new(conn)),
        jwt_secret: std::env::var("LOCAL_JWT_SECRET").unwrap_or_else(|_| generate_jwt_secret()),
    };

    Router::new()
        .route("/api/auth/local/register", post(register_handler))
        .route("/api/auth/local/login", post(login_handler))
        .route("/api/auth/local/logout", post(logout_handler))
        .route("/api/auth/local/me", get(me_handler))
        .route("/api/auth/local/delete", delete(delete_handler))
        .route(
            "/api/auth/local/delete-synced",
            delete(delete_synced_handler),
        )
        .route(
            "/api/auth/local/update-cloud-id",
            post(update_cloud_id_handler),
        )
        .with_state(state)
}
