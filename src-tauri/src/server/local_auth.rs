// =============================================================================
// LOCAL AUTH MODULE - ADOLE v3.0 WebSocket-based authentication for Tauri
// =============================================================================
// Users are atomes with atome_type = 'user'
// User properties stored as particles (phone, username, password_hash)
// All operations via WebSocket messages, no HTTP routes
// =============================================================================

use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

use super::local_atome::LocalAtomeState;

// =============================================================================
// CONSTANTS
// =============================================================================

/// Namespace UUID for deterministic user ID generation (same as Fastify)
const SQUIRREL_USER_NAMESPACE: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

// =============================================================================
// TYPES
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // User ID (atome_id)
    pub username: String,
    pub phone: String,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[derive(Clone)]
pub struct LocalAuthState {
    pub db: Arc<Mutex<Connection>>,
    pub jwt_secret: String,
}

// =============================================================================
// WEBSOCKET MESSAGE HANDLER
// =============================================================================

pub async fn handle_auth_message(
    message: serde_json::Value,
    state: &LocalAuthState,
) -> AuthResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    match action {
        "register" => handle_register(message, state, request_id).await,
        "login" => handle_login(message, state, request_id).await,
        "me" => handle_me(message, state, request_id).await,
        "logout" => handle_logout(request_id),
        "change-password" => handle_change_password(message, state, request_id).await,
        "delete" => handle_delete(message, state, request_id).await,
        _ => error_response(request_id, &format!("Unknown action: {}", action)),
    }
}

// =============================================================================
// AUTH OPERATIONS
// =============================================================================

async fn handle_register(
    message: serde_json::Value,
    state: &LocalAuthState,
    request_id: Option<String>,
) -> AuthResponse {
    let username = match message.get("username").and_then(|v| v.as_str()) {
        Some(u) if u.trim().len() >= 2 => u.trim().to_string(),
        _ => return error_response(request_id, "Username must be at least 2 characters"),
    };

    let phone = match message.get("phone").and_then(|v| v.as_str()) {
        Some(p) if p.trim().len() >= 6 => normalize_phone(p),
        _ => return error_response(request_id, "Phone must be at least 6 characters"),
    };

    let password = match message.get("password").and_then(|v| v.as_str()) {
        Some(p) if p.len() >= 6 => p,
        _ => return error_response(request_id, "Password must be at least 6 characters"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Check if user already exists (including soft-deleted)
    let existing_user: Option<(String, Option<String>)> = db
        .query_row(
            "SELECT a.atome_id, a.deleted_at FROM particles p
             JOIN atomes a ON p.atome_id = a.atome_id
             WHERE a.atome_type = 'user' AND p.particle_key = 'phone' AND p.particle_value = ?1",
            rusqlite::params![format!("\"{}\"", phone)],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    // Hash password
    let password_hash = match hash(password, DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Generate deterministic user ID
    let user_id = generate_user_id(&phone);
    let now = Utc::now().to_rfc3339();

    if let Some((existing_id, deleted_at)) = existing_user {
        if deleted_at.is_some() {
            // Reactivate soft-deleted user
            if let Err(e) = db.execute(
                "UPDATE atomes SET deleted_at = NULL, updated_at = ?1 WHERE atome_id = ?2",
                rusqlite::params![&now, &existing_id],
            ) {
                return error_response(request_id, &e.to_string());
            }

            // Update particles
            let particles = [
                ("username", &username),
                ("phone", &phone),
                ("password_hash", &password_hash),
            ];

            for (key, value) in particles {
                let value_json = serde_json::to_string(value).unwrap_or_default();
                let _ = db.execute(
                    "UPDATE particles SET particle_value = ?1, updated_at = ?2 
                     WHERE atome_id = ?3 AND particle_key = ?4",
                    rusqlite::params![&value_json, &now, &existing_id, key],
                );
            }

            // Generate JWT for reactivated user
            let token = match generate_token(&state.jwt_secret, &existing_id, &username, &phone) {
                Ok(t) => t,
                Err(e) => return error_response(request_id, &e.to_string()),
            };

            return AuthResponse {
                msg_type: "auth-response".into(),
                request_id,
                success: true,
                error: None,
                user: Some(UserInfo {
                    user_id: existing_id,
                    username,
                    phone,
                    created_at: Some(now),
                }),
                token: Some(token),
            };
        } else {
            // User exists and is not deleted
            return error_response(request_id, "Phone already registered");
        }
    }

    // Create new user atome
    if let Err(e) = db.execute(
        "INSERT INTO atomes (atome_id, atome_type, owner_id, created_at, updated_at, sync_status)
         VALUES (?1, 'user', ?1, ?2, ?2, 'pending')",
        rusqlite::params![&user_id, &now],
    ) {
        return error_response(request_id, &e.to_string());
    }

    // Create user particles
    let particles = [
        ("username", &username),
        ("phone", &phone),
        ("password_hash", &password_hash),
    ];

    for (key, value) in particles {
        let value_json = serde_json::to_string(value).unwrap_or_default();
        let _ = db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&user_id, key, &value_json, &now],
        );
    }

    // Generate JWT
    let token = match generate_token(&state.jwt_secret, &user_id, &username, &phone) {
        Ok(t) => t,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: Some(UserInfo {
            user_id,
            username,
            phone,
            created_at: Some(now),
        }),
        token: Some(token),
    }
}

async fn handle_login(
    message: serde_json::Value,
    state: &LocalAuthState,
    request_id: Option<String>,
) -> AuthResponse {
    let phone = match message.get("phone").and_then(|v| v.as_str()) {
        Some(p) => normalize_phone(p),
        None => return error_response(request_id, "Phone is required"),
    };

    let password = match message.get("password").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return error_response(request_id, "Password is required"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Find user by phone
    let user_id: Option<String> = db
        .query_row(
            "SELECT a.atome_id FROM atomes a
             JOIN particles p ON a.atome_id = p.atome_id
             WHERE a.atome_type = 'user' AND p.particle_key = 'phone' AND p.particle_value = ?1
             AND a.deleted_at IS NULL",
            rusqlite::params![format!("\"{}\"", phone)],
            |row| row.get(0),
        )
        .ok();

    let user_id = match user_id {
        Some(id) => id,
        None => return error_response(request_id, "Invalid credentials"),
    };

    // Get user particles
    let (username, password_hash, created_at) = match get_user_particles(&db, &user_id) {
        Ok(p) => p,
        Err(e) => return error_response(request_id, &e),
    };

    // Verify password
    if !verify(password, &password_hash).unwrap_or(false) {
        return error_response(request_id, "Invalid credentials");
    }

    // Generate JWT
    let token = match generate_token(&state.jwt_secret, &user_id, &username, &phone) {
        Ok(t) => t,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: Some(UserInfo {
            user_id,
            username,
            phone,
            created_at: Some(created_at),
        }),
        token: Some(token),
    }
}

async fn handle_me(
    message: serde_json::Value,
    state: &LocalAuthState,
    request_id: Option<String>,
) -> AuthResponse {
    let token = match message.get("token").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return error_response(request_id, "Token is required"),
    };

    let claims = match verify_token(&state.jwt_secret, token) {
        Ok(c) => c,
        Err(e) => return error_response(request_id, &e),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Verify user still exists
    let exists: bool = db
        .query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ?1 AND atome_type = 'user' AND deleted_at IS NULL",
            rusqlite::params![&claims.sub],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return error_response(request_id, "User not found");
    }

    let (username, _, created_at) = match get_user_particles(&db, &claims.sub) {
        Ok(p) => p,
        Err(e) => return error_response(request_id, &e),
    };

    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: Some(UserInfo {
            user_id: claims.sub,
            username,
            phone: claims.phone,
            created_at: Some(created_at),
        }),
        token: None,
    }
}

fn handle_logout(request_id: Option<String>) -> AuthResponse {
    // JWT is stateless, logout is client-side
    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: None,
        token: None,
    }
}

async fn handle_change_password(
    message: serde_json::Value,
    state: &LocalAuthState,
    request_id: Option<String>,
) -> AuthResponse {
    let token = match message.get("token").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return error_response(request_id, "Token is required"),
    };

    let current_password = match message.get("currentPassword").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return error_response(request_id, "Current password is required"),
    };

    let new_password = match message.get("newPassword").and_then(|v| v.as_str()) {
        Some(p) if p.len() >= 6 => p,
        _ => return error_response(request_id, "New password must be at least 6 characters"),
    };

    let claims = match verify_token(&state.jwt_secret, token) {
        Ok(c) => c,
        Err(e) => return error_response(request_id, &e),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Get current password hash
    let (_, password_hash, _) = match get_user_particles(&db, &claims.sub) {
        Ok(p) => p,
        Err(e) => return error_response(request_id, &e),
    };

    // Verify current password
    if !verify(current_password, &password_hash).unwrap_or(false) {
        return error_response(request_id, "Current password is incorrect");
    }

    // Hash new password
    let new_hash = match hash(new_password, DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let now = Utc::now().to_rfc3339();
    let hash_json = serde_json::to_string(&new_hash).unwrap_or_default();

    // Update password particle
    if let Err(e) = db.execute(
        "UPDATE particles SET value = ?1, updated_at = ?2
         WHERE atome_id = ?3 AND key = 'password_hash'",
        rusqlite::params![&hash_json, &now, &claims.sub],
    ) {
        return error_response(request_id, &e.to_string());
    }

    // Update atome timestamp
    let _ = db.execute(
        "UPDATE atomes SET updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
        rusqlite::params![&now, &claims.sub],
    );

    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: None,
        token: None,
    }
}

async fn handle_delete(
    message: serde_json::Value,
    state: &LocalAuthState,
    request_id: Option<String>,
) -> AuthResponse {
    let token = match message.get("token").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return error_response(request_id, "Token is required"),
    };

    let password = match message.get("password").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return error_response(request_id, "Password is required"),
    };

    let claims = match verify_token(&state.jwt_secret, token) {
        Ok(c) => c,
        Err(e) => return error_response(request_id, &e),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Verify password
    let (_, password_hash, _) = match get_user_particles(&db, &claims.sub) {
        Ok(p) => p,
        Err(e) => return error_response(request_id, &e),
    };

    if !verify(password, &password_hash).unwrap_or(false) {
        return error_response(request_id, "Invalid password");
    }

    let now = Utc::now().to_rfc3339();

    // Soft delete user atome
    if let Err(e) = db.execute(
        "UPDATE atomes SET deleted_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
        rusqlite::params![&now, &claims.sub],
    ) {
        return error_response(request_id, &e.to_string());
    }

    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: true,
        error: None,
        user: None,
        token: None,
    }
}

// =============================================================================
// HELPERS
// =============================================================================

fn generate_user_id(phone: &str) -> String {
    let normalized: String = phone
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '(' && *c != ')')
        .collect::<String>()
        .to_lowercase();

    Uuid::new_v5(&SQUIRREL_USER_NAMESPACE, normalized.as_bytes()).to_string()
}

fn normalize_phone(phone: &str) -> String {
    phone.trim().replace(" ", "")
}

fn get_user_particles(db: &Connection, user_id: &str) -> Result<(String, String, String), String> {
    let mut username = String::new();
    let mut password_hash = String::new();
    let mut created_at = String::new();

    // Get username
    if let Ok(v) = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = 'username'",
        rusqlite::params![user_id],
        |row| row.get::<_, String>(0),
    ) {
        username = serde_json::from_str(&v).unwrap_or(v);
    }

    // Get password_hash
    if let Ok(v) = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = 'password_hash'",
        rusqlite::params![user_id],
        |row| row.get::<_, String>(0),
    ) {
        password_hash = serde_json::from_str(&v).unwrap_or(v);
    }

    // Get created_at from atome
    if let Ok(v) = db.query_row(
        "SELECT created_at FROM atomes WHERE atome_id = ?1",
        rusqlite::params![user_id],
        |row| row.get::<_, String>(0),
    ) {
        created_at = v;
    }

    if username.is_empty() || password_hash.is_empty() {
        return Err("User not found".into());
    }

    Ok((username, password_hash, created_at))
}

fn generate_token(
    secret: &str,
    user_id: &str,
    username: &str,
    phone: &str,
) -> Result<String, String> {
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
    .map_err(|e| e.to_string())
}

fn verify_token(secret: &str, token: &str) -> Result<Claims, String> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| e.to_string())?;

    Ok(token_data.claims)
}

/// Public function to extract user_id from JWT token
/// Returns the user_id (sub claim) if valid, otherwise returns "anonymous"
pub fn extract_user_id_from_token(secret: &str, token: Option<&str>) -> String {
    match token {
        Some(t) if !t.is_empty() => match verify_token(secret, t) {
            Ok(claims) => claims.sub,
            Err(_) => "anonymous".to_string(),
        },
        _ => "anonymous".to_string(),
    }
}

fn error_response(request_id: Option<String>, error: &str) -> AuthResponse {
    AuthResponse {
        msg_type: "auth-response".into(),
        request_id,
        success: false,
        error: Some(error.into()),
        user: None,
        token: None,
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

pub fn create_state(atome_state: &LocalAtomeState, data_dir: &PathBuf) -> LocalAuthState {
    LocalAuthState {
        db: atome_state.db.clone(),
        jwt_secret: get_or_create_jwt_secret(data_dir),
    }
}

fn get_or_create_jwt_secret(data_dir: &PathBuf) -> String {
    if let Ok(secret) = std::env::var("LOCAL_JWT_SECRET") {
        return secret;
    }

    let secret_path = data_dir.join("jwt_secret.key");

    if secret_path.exists() {
        if let Ok(secret) = std::fs::read_to_string(&secret_path) {
            let trimmed = secret.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    // Generate new secret
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rand::Rng::gen(&mut rng)).collect();
    let secret = hex::encode(bytes);

    let _ = std::fs::write(&secret_path, &secret);

    secret
}
