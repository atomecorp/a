use axum::{
    body::Body,
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Path as AxumPath, Query, State,
    },
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, get_service, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use std::{
    borrow::Cow,
    fs as stdfs,
    io::{Cursor, Read},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tokio::{
    fs,
    net::TcpStream,
    sync::broadcast,
    time::{timeout, Duration},
};
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, services::ServeDir};
use tracing::{error, info, warn};
use uuid::Uuid;
use zip::ZipArchive;

// Local authentication module
pub mod local_auth;
// Local atome storage module
pub mod local_atome;

#[derive(Clone)]
struct AppState {
    static_dir: Arc<PathBuf>,
    project_root: Arc<PathBuf>,
    version: Arc<String>,
    started_at: Arc<std::time::Instant>,
    atome_state: Option<local_atome::LocalAtomeState>,
    auth_state: Option<local_auth::LocalAuthState>,
}

#[derive(Deserialize)]
struct LocalFileQuery {
    path: Option<String>,
}

#[derive(Deserialize)]
struct EventsQuery {
    project_id: Option<String>,
    atome_id: Option<String>,
    tx_id: Option<String>,
    gesture_id: Option<String>,
    since: Option<String>,
    until: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    order: Option<String>,
}

#[derive(Deserialize)]
struct StateCurrentQuery {
    project_id: Option<String>,
    owner_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

const SERVER_TYPE: &str = "Tauri frontend process";
const MAX_UPLOAD_BYTES: usize = 1024 * 1024 * 1024; // 1 GiB

static RECENT_ERRORS: OnceLock<Mutex<Vec<serde_json::Value>>> = OnceLock::new();
static SYNC_EVENT_TX: OnceLock<broadcast::Sender<JsonValue>> = OnceLock::new();

fn sync_event_sender() -> broadcast::Sender<JsonValue> {
    SYNC_EVENT_TX
        .get_or_init(|| {
            let (tx, _rx) = broadcast::channel(512);
            tx
        })
        .clone()
}

pub fn broadcast_sync_event(payload: JsonValue) {
    let sender = sync_event_sender();
    let _ = sender.send(payload);
}

fn record_recent_error(entry: serde_json::Value) {
    let store = RECENT_ERRORS.get_or_init(|| Mutex::new(Vec::new()));
    let mut guard = store.lock().unwrap();
    guard.push(entry);
    let len = guard.len();
    if len > 100 {
        let drain_count = len - 100;
        guard.drain(0..drain_count);
    }
}

fn recent_errors_snapshot() -> Vec<serde_json::Value> {
    let store = RECENT_ERRORS.get_or_init(|| Mutex::new(Vec::new()));
    let guard = store.lock().unwrap();
    guard.iter().cloned().collect()
}

fn sanitize_file_name(name: &str) -> String {
    if name.is_empty() {
        return "upload.bin".to_string();
    }
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    if sanitized.trim().is_empty() {
        "upload.bin".to_string()
    } else {
        sanitized
    }
}

fn download_verbose_logs_enabled() -> bool {
    static DOWNLOAD_VERBOSE_LOGS: OnceLock<bool> = OnceLock::new();
    *DOWNLOAD_VERBOSE_LOGS.get_or_init(|| {
        std::env::var("SQUIRREL_DOWNLOAD_LOG_VERBOSE")
            .ok()
            .map(|value| {
                let normalized = value.trim().to_lowercase();
                normalized == "1"
                    || normalized == "true"
                    || normalized == "yes"
                    || normalized == "on"
            })
            .unwrap_or(false)
    })
}

fn guess_content_type_from_name(file_name: &str) -> &'static str {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "mp4" => "video/mp4",
        "m4v" => "video/x-m4v",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn sanitize_user_segment(value: &str) -> String {
    if value.is_empty() {
        return "anonymous".to_string();
    }
    let sanitized: String = value
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    if sanitized.trim().is_empty() {
        "anonymous".to_string()
    } else {
        sanitized
    }
}

fn sanitize_recording_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return None;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return None;
    }
    Some(trimmed.to_string())
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim())
        .and_then(|v| {
            if v.to_lowercase().starts_with("bearer ") {
                Some(v[7..].trim())
            } else {
                Some(v)
            }
        })
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
}

fn extract_user_id_from_headers(headers: &HeaderMap) -> Option<String> {
    const CANDIDATES: [&str; 6] = [
        "x-user-id",
        "x-userid",
        "x-username",
        "x-user-name",
        "x-phone",
        "x-user-phone",
    ];

    for key in CANDIDATES.iter() {
        if let Some(value) = headers.get(*key).and_then(|v| v.to_str().ok()) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let sanitized = sanitize_user_segment(trimmed);
            if sanitized != "anonymous" {
                return Some(sanitized);
            }
        }
    }
    None
}

fn resolve_authenticated_user(
    headers: &HeaderMap,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    let token = extract_bearer_token(headers);
    let token_user_id =
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref());
    if token_user_id != "anonymous" {
        return Some(token_user_id);
    }
    extract_user_id_from_headers(headers)
}

fn json_error(status: StatusCode, message: &str) -> (StatusCode, Json<JsonValue>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn require_auth_user(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, (StatusCode, Json<JsonValue>)> {
    let auth_state = state
        .auth_state
        .as_ref()
        .ok_or_else(|| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Auth state not initialized"))?;

    resolve_authenticated_user(headers, auth_state)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Unauthorized"))
}

fn require_atome_state(
    state: &AppState,
) -> Result<&local_atome::LocalAtomeState, (StatusCode, Json<JsonValue>)> {
    state
        .atome_state
        .as_ref()
        .ok_or_else(|| json_error(StatusCode::INTERNAL_SERVER_ERROR, "Atome state not initialized"))
}

fn ws_events_to_http(resp: local_atome::WsResponse) -> (StatusCode, Json<JsonValue>) {
    if !resp.success {
        return json_error(
            StatusCode::BAD_REQUEST,
            resp.error.as_deref().unwrap_or("Unknown error"),
        );
    }

    let data = resp.data.unwrap_or_else(|| json!({}));
    if let Some(event) = data.get("event") {
        return (StatusCode::OK, Json(json!({ "success": true, "event": event })));
    }
    if let Some(events) = data.get("events") {
        return (StatusCode::OK, Json(json!({ "success": true, "events": events })));
    }

    (StatusCode::OK, Json(json!({ "success": true, "data": data })))
}

fn ws_state_to_http(resp: local_atome::WsResponse) -> (StatusCode, Json<JsonValue>) {
    if !resp.success {
        return json_error(
            StatusCode::BAD_REQUEST,
            resp.error.as_deref().unwrap_or("Unknown error"),
        );
    }
    let data = resp.data.unwrap_or_else(|| json!({}));
    if let Some(state) = data.get("state") {
        if state.is_null() {
            return json_error(StatusCode::NOT_FOUND, "State not found");
        }
        return (StatusCode::OK, Json(json!({ "success": true, "state": state })));
    }
    if let Some(states) = data.get("states") {
        return (StatusCode::OK, Json(json!({ "success": true, "states": states })));
    }
    (StatusCode::OK, Json(json!({ "success": true, "data": data })))
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum LocalStorageRoot {
    Downloads,
    Recordings,
}

fn normalize_local_relative_path(
    raw_path: &str,
    user_id: &str,
) -> Option<(LocalStorageRoot, String)> {
    let safe_user = sanitize_user_segment(user_id);
    let mut cleaned = raw_path.trim().replace('\\', "/");
    if cleaned.to_lowercase().starts_with("file://") {
        cleaned = cleaned.trim_start_matches("file://").to_string();
    }

    let anchor = format!("/data/users/{}/", safe_user);
    let alt_anchor = format!("data/users/{}/", safe_user);
    if let Some(idx) = cleaned.find(&anchor) {
        cleaned = cleaned[(idx + anchor.len())..].to_string();
    } else if cleaned.starts_with(&alt_anchor) {
        cleaned = cleaned[alt_anchor.len()..].to_string();
    } else if cleaned.starts_with(&format!("{}/", safe_user)) {
        cleaned = cleaned[(safe_user.len() + 1)..].to_string();
    }

    cleaned = cleaned.trim_start_matches('/').to_string();

    let raw_parts: Vec<&str> = cleaned
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect();
    if raw_parts.is_empty() {
        return None;
    }

    let first = raw_parts[0].to_lowercase();
    let (root, parts) = match first.as_str() {
        "downloads" => (LocalStorageRoot::Downloads, &raw_parts[1..]),
        "recordings" => (LocalStorageRoot::Recordings, &raw_parts[1..]),
        _ => (LocalStorageRoot::Downloads, raw_parts.as_slice()),
    };

    let last_idx = parts.len().saturating_sub(1);
    let mut safe_parts = Vec::with_capacity(raw_parts.len());
    for (idx, part) in parts.iter().enumerate() {
        if idx == last_idx {
            safe_parts.push(sanitize_file_name(part));
        } else {
            safe_parts.push(sanitize_user_segment(part));
        }
    }

    Some((root, safe_parts.join("/")))
}

fn guess_mime_from_ext(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        "weba" => "audio/webm",
        "aif" | "aiff" => "audio/aiff",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    }
}

async fn resolve_user_storage_dir(
    state: &AppState,
    user_id: &str,
    root: LocalStorageRoot,
) -> Result<PathBuf, std::io::Error> {
    let safe_user = sanitize_user_segment(user_id);
    let base_dir = state
        .project_root
        .join("data")
        .join("users")
        .join(safe_user);
    let dir = match root {
        LocalStorageRoot::Downloads => base_dir.join("Downloads"),
        LocalStorageRoot::Recordings => base_dir.join("recordings"),
    };
    fs::create_dir_all(&dir).await?;
    Ok(dir)
}

async fn resolve_user_downloads_dir(
    state: &AppState,
    user_id: &str,
) -> Result<PathBuf, std::io::Error> {
    resolve_user_storage_dir(state, user_id, LocalStorageRoot::Downloads).await
}

async fn resolve_user_upload_path(
    state: &AppState,
    user_id: &str,
    raw_name: &str,
) -> Result<(String, PathBuf), std::io::Error> {
    let sanitized = sanitize_file_name(raw_name);
    let downloads_dir = resolve_user_downloads_dir(state, user_id).await?;
    let mut candidate = sanitized.clone();
    let mut counter = 1u32;

    loop {
        let target = downloads_dir.join(&candidate);
        if fs::metadata(&target).await.is_err() {
            return Ok((candidate, target));
        }

        let path = Path::new(&sanitized);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("upload");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        if ext.is_empty() {
            candidate = format!("{}_{}", stem, counter);
        } else {
            candidate = format!("{}_{}.{}", stem, counter, ext);
        }
        counter += 1;
    }
}

async fn log_request_middleware(req: Request<Body>, next: middleware::Next) -> Response {
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let method = req.method().to_string();
    let uri = req.uri().to_string();
    let start = std::time::Instant::now();

    let mut response = next.run(req).await;
    let status = response.status().as_u16();
    let duration_ms = start.elapsed().as_millis() as u64;

    if let Ok(header_value) = HeaderValue::from_str(&request_id) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("x-request-id"), header_value);
    }

    let log_payload = json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "request_id": request_id,
        "method": method,
        "uri": uri,
        "status_code": status,
        "duration_ms": duration_ms
    });

    if status >= 500 {
        record_recent_error(log_payload.clone());
        error!(
            source = "axum",
            component = "http",
            request_id = log_payload["request_id"].as_str().unwrap_or(""),
            message = "request failed",
            data = ?log_payload
        );
    } else if status >= 400 {
        warn!(
            source = "axum",
            component = "http",
            request_id = log_payload["request_id"].as_str().unwrap_or(""),
            message = "request warning",
            data = ?log_payload
        );
    } else {
        info!(
            source = "axum",
            component = "http",
            request_id = log_payload["request_id"].as_str().unwrap_or(""),
            message = "request completed",
            data = ?log_payload
        );
    }

    response
}

fn load_version(static_dir: &Path) -> String {
    let mut candidates = Vec::new();
    candidates.push(static_dir.join("version.txt"));
    if let Some(parent) = static_dir.parent() {
        candidates.push(parent.join("version.txt"));
    }
    if let Ok(canon) = stdfs::canonicalize(static_dir) {
        candidates.push(canon.join("version.txt"));
        if let Some(parent) = canon.parent() {
            candidates.push(parent.join("version.txt"));
        }
    }
    candidates.push(PathBuf::from("../version.txt"));
    candidates.push(PathBuf::from("version.txt"));

    for candidate in candidates {
        if let Ok(raw) = stdfs::read_to_string(&candidate) {
            let trimmed = raw.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    "unknown".to_string()
}

async fn server_info_handler(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "success": true,
        "version": state.version.as_str(),
        "type": SERVER_TYPE,
    }))
}

async fn dev_state_handler(State(state): State<AppState>) -> impl IntoResponse {
    let uptime_sec = state.started_at.elapsed().as_secs_f64();
    Json(json!({
        "success": true,
        "source": "axum",
        "version": state.version.as_str(),
        "uptime_sec": uptime_sec,
        "recent_errors": recent_errors_snapshot(),
    }))
}

async fn locate_server_config(static_dir: &Path, project_root: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.push(static_dir.join("server_config.json"));
    candidates.push(project_root.join("server_config.json"));
    candidates.push(project_root.join("src").join("server_config.json"));

    for candidate in candidates {
        if fs::metadata(&candidate).await.is_ok() {
            return Some(candidate);
        }
    }

    let mut dir = static_dir.to_path_buf();
    for _ in 0..12u8 {
        let candidate = dir.join("server_config.json");
        if fs::metadata(&candidate).await.is_ok() {
            return Some(candidate);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn default_server_config() -> serde_json::Value {
    let host = std::env::var("SQUIRREL_FASTIFY_HOST")
        .or_else(|_| std::env::var("FASTIFY_HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("SQUIRREL_FASTIFY_PORT")
        .or_else(|_| std::env::var("FASTIFY_PORT"))
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(3001);

    json!({
        "fastify": {
            "host": host,
            "port": port,
            "serverInfoPath": "/api/server-info",
            "syncWsPath": "/ws/sync",
            "apiWsPath": "/ws/api"
        },
        "generated": true
    })
}

async fn server_config_handler(State(state): State<AppState>) -> impl IntoResponse {
    let static_dir = state.static_dir.as_ref();
    let project_root = state.project_root.as_ref();
    let config_path = locate_server_config(static_dir, project_root).await;
    let Some(config_path) = config_path else {
        let mut response = Json(default_server_config()).into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return response;
    };

    match fs::read_to_string(&config_path).await {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(json_value) => {
                let mut response = Json(json_value).into_response();
                response
                    .headers_mut()
                    .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
                response
            }
            Err(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Invalid server_config.json" })),
            )
                .into_response(),
        },
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": "Failed to read server_config.json" })),
        )
            .into_response(),
    }
}

async fn fastify_status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let static_dir = state.static_dir.as_ref();
    let project_root = state.project_root.as_ref();
    let config_path = locate_server_config(static_dir, project_root).await;
    let Some(config_path) = config_path else {
        return Json(json!({ "success": true, "available": false, "configured": false }))
            .into_response();
    };

    let raw = match fs::read_to_string(&config_path).await {
        Ok(raw) => raw,
        Err(_) => {
            return Json(json!({ "success": true, "available": false, "configured": false }))
                .into_response();
        }
    };

    let json_value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => {
            return Json(json!({ "success": true, "available": false, "configured": false }))
                .into_response();
        }
    };

    let host = json_value
        .get("fastify")
        .and_then(|v| v.get("host"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let port = json_value
        .get("fastify")
        .and_then(|v| v.get("port"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if host.is_empty() || port == 0 {
        return Json(json!({ "success": true, "available": false, "configured": false }))
            .into_response();
    }

    let addr = format!("{}:{}", host, port);
    let available = timeout(Duration::from_millis(300), TcpStream::connect(addr))
        .await
        .map(|res| res.is_ok())
        .unwrap_or(false);

    Json(json!({
        "success": true,
        "available": available,
        "configured": true,
        "host": host,
        "port": port
    }))
    .into_response()
}

/// Debug log handler - receives logs from frontend to survive page reloads
async fn debug_log_handler(Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    // Print to terminal with timestamp
    let level = payload
        .get("level")
        .and_then(|v| v.as_str())
        .unwrap_or("info");
    let message = payload
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let elapsed = payload.get("elapsed").and_then(|v| v.as_i64()).unwrap_or(0);
    let data = payload.get("data");

    let icon = match level {
        "error" => "❌",
        "warn" => "⚠️",
        _ => "📝",
    };

    println!("{} [FRONTEND +{}ms] {} {:?}", icon, elapsed, message, data);

    Json(json!({ "success": true }))
}

async fn adole_debug_tables_handler(State(state): State<AppState>) -> impl IntoResponse {
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let db = match atome_state.db.lock() {
        Ok(d) => d,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let mut stmt = match db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) {
        Ok(s) => s,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let mut tables = Vec::new();
    for row in rows {
        if let Ok(name) = row {
            tables.push(name);
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "database": "Tauri/SQLite",
            "tables": tables,
            "schema_hash": local_atome::schema_hash(),
            "schema": local_atome::schema_tables()
        })),
    )
        .into_response()
}

async fn db_status_handler(State(state): State<AppState>) -> impl IntoResponse {
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let db = match atome_state.db.lock() {
        Ok(d) => d,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let mut stmt = match db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) {
        Ok(s) => s,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(err) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &err.to_string()).into_response();
        }
    };

    let mut tables = Vec::new();
    for row in rows {
        if let Ok(name) = row {
            tables.push(name);
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "status": "connected",
            "database": "SQLite (ADOLE v3.0)",
            "tables": tables,
            "schema": local_atome::schema_tables(),
            "schema_hash": local_atome::schema_hash(),
            "timestamp": chrono::Utc::now().to_rfc3339()
        })),
    )
        .into_response()
}

async fn events_commit_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<JsonValue>,
) -> impl IntoResponse {
    let user_id = match require_auth_user(&headers, &state) {
        Ok(id) => id,
        Err(resp) => return resp.into_response(),
    };
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let sync_source = headers
        .get("x-sync-source")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let mut message = json!({
        "action": "commit",
        "event": body
    });
    if let Some(source) = sync_source {
        if let Some(obj) = message.as_object_mut() {
            obj.insert("sync_source".to_string(), json!(source));
        }
    }
    let response = local_atome::handle_events_message(message, &user_id, atome_state).await;
    ws_events_to_http(response).into_response()
}

async fn events_commit_batch_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<JsonValue>,
) -> impl IntoResponse {
    let user_id = match require_auth_user(&headers, &state) {
        Ok(id) => id,
        Err(resp) => return resp.into_response(),
    };
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let mut payload = JsonMap::new();
    payload.insert("action".to_string(), json!("commit-batch"));
    if let Some(source) = headers
        .get("x-sync-source")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        payload.insert("sync_source".to_string(), json!(source));
    }
    match body {
        JsonValue::Array(_) => {
            payload.insert("events".to_string(), body);
        }
        JsonValue::Object(mut map) => {
            for key in ["events", "event", "tx_id", "txId", "actor"] {
                if let Some(value) = map.remove(key) {
                    payload.insert(key.to_string(), value);
                }
            }
        }
        _ => {}
    }

    let response =
        local_atome::handle_events_message(JsonValue::Object(payload), &user_id, atome_state)
            .await;
    ws_events_to_http(response).into_response()
}

async fn events_list_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<EventsQuery>,
) -> impl IntoResponse {
    let user_id = match require_auth_user(&headers, &state) {
        Ok(id) => id,
        Err(resp) => return resp.into_response(),
    };
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let mut payload = JsonMap::new();
    payload.insert("action".to_string(), json!("list"));
    let project_id = query.project_id;
    let atome_id = query.atome_id;
    let tx_id = query.tx_id;
    let gesture_id = query.gesture_id;
    if let Some(value) = project_id {
        payload.insert("project_id".to_string(), json!(value));
    }
    if let Some(value) = atome_id {
        payload.insert("atome_id".to_string(), json!(value));
    }
    if let Some(value) = tx_id {
        payload.insert("tx_id".to_string(), json!(value));
    }
    if let Some(value) = gesture_id {
        payload.insert("gesture_id".to_string(), json!(value));
    }
    if let Some(value) = query.since {
        payload.insert("since".to_string(), json!(value));
    }
    if let Some(value) = query.until {
        payload.insert("until".to_string(), json!(value));
    }
    if let Some(value) = query.limit {
        payload.insert("limit".to_string(), json!(value));
    }
    if let Some(value) = query.offset {
        payload.insert("offset".to_string(), json!(value));
    }
    if let Some(value) = query.order {
        payload.insert("order".to_string(), json!(value));
    }

    let response =
        local_atome::handle_events_message(JsonValue::Object(payload), &user_id, atome_state)
            .await;
    ws_events_to_http(response).into_response()
}

async fn state_current_get_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    let user_id = match require_auth_user(&headers, &state) {
        Ok(id) => id,
        Err(resp) => return resp.into_response(),
    };
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    if id.trim().is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "Missing atome id").into_response();
    }

    let message = json!({
        "action": "get",
        "atome_id": id,
        "owner_id": user_id
    });
    let response =
        local_atome::handle_state_current_message(message, &user_id, atome_state).await;
    ws_state_to_http(response).into_response()
}

async fn state_current_list_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<StateCurrentQuery>,
) -> impl IntoResponse {
    let user_id = match require_auth_user(&headers, &state) {
        Ok(id) => id,
        Err(resp) => return resp.into_response(),
    };
    let atome_state = match require_atome_state(&state) {
        Ok(s) => s,
        Err(resp) => return resp.into_response(),
    };

    let mut payload = JsonMap::new();
    payload.insert("action".to_string(), json!("list"));
    let project_id = query.project_id;
    let owner_id = query.owner_id.unwrap_or(user_id.clone());
    payload.insert("owner_id".to_string(), json!(owner_id));
    if let Some(value) = project_id {
        payload.insert("project_id".to_string(), json!(value));
    }
    if let Some(value) = query.limit {
        payload.insert("limit".to_string(), json!(value));
    }
    if let Some(value) = query.offset {
        payload.insert("offset".to_string(), json!(value));
    }

    let response =
        local_atome::handle_state_current_message(JsonValue::Object(payload), &user_id, atome_state)
            .await;
    ws_state_to_http(response).into_response()
}

async fn upload_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Empty upload body" })),
        );
    }

    let Some(file_name_header) = headers.get("x-filename") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing X-Filename header" })),
        );
    };

    let file_name_raw = match file_name_header.to_str() {
        Ok(v) if !v.is_empty() => v,
        _ => "upload.bin",
    };

    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let token = extract_bearer_token(&headers);
    let token_user_id =
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref());
    let user_id = if token_user_id != "anonymous" {
        token_user_id
    } else if let Some(header_user_id) = extract_user_id_from_headers(&headers) {
        header_user_id
    } else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        );
    };

    let decoded: Cow<'_, str> =
        urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
    let (file_name, file_path) =
        match resolve_user_upload_path(&state, &user_id, decoded.as_ref()).await {
            Ok(path) => path,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": err.to_string() })),
                );
            }
        };

    if let Err(err) = fs::write(&file_path, &body).await {
        eprintln!("Erreur écriture upload {:?}: {}", file_path, err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let rel_path = file_path
        .strip_prefix(&*state.project_root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| file_path.to_string_lossy().replace('\\', "/"));

    (
        StatusCode::OK,
        Json(json!({ "success": true, "file": file_name, "owner": user_id, "path": rel_path })),
    )
}

async fn local_file_read_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            )
                .into_response();
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            )
                .into_response();
        }
    };

    let raw_path = query
        .path
        .or_else(|| {
            headers
                .get("x-file-path")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_string())
        })
        .unwrap_or_default();
    if raw_path.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        )
            .into_response();
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            )
                .into_response();
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        )
            .into_response();
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };

    let file_path = base_dir.join(&relative);
    let data = match fs::read(&file_path).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };

    let file_name = Path::new(&relative)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let mime = guess_mime_from_ext(file_name);

    let mut response = Response::new(Body::from(data));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("inline; filename=\"{}\"", file_name))
            .unwrap_or_else(|_| HeaderValue::from_static("inline")),
    );
    response
}

async fn local_file_write_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
    body: Bytes,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
        }
    };

    let raw_path = query
        .path
        .or_else(|| {
            headers
                .get("x-file-path")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_string())
        })
        .unwrap_or_default();
    if raw_path.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            );
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let file_path = base_dir.join(&relative);
    if let Some(parent) = file_path.parent() {
        if let Err(err) = fs::create_dir_all(parent).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    }

    if let Err(err) = fs::write(&file_path, &body).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let relative_path = match root {
        LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
        LocalStorageRoot::Recordings => format!("recordings/{}", relative),
    };
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": file_path.file_name().and_then(|s| s.to_str()).unwrap_or("file"),
            "path": relative_path,
            "owner": user_id
        })),
    )
}

async fn local_file_meta_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
        }
    };

    let raw_path = query.path.unwrap_or_default();
    if raw_path.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let (root, relative) = match normalize_local_relative_path(&raw_path, &user_id) {
        Some(path) => path,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": "Invalid file path" })),
            );
        }
    };
    if relative.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing file path" })),
        );
    }

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let file_path = base_dir.join(&relative);
    match fs::metadata(&file_path).await {
        Ok(meta) => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "exists": true,
                "size": meta.len(),
                "path": match root {
                    LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
                    LocalStorageRoot::Recordings => format!("recordings/{}", relative)
                }
            })),
        ),
        Err(err) => (
            StatusCode::OK,
            Json(json!({
                "success": false,
                "exists": false,
                "error": err.to_string()
            })),
        ),
    }
}

async fn local_file_list_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LocalFileQuery>,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let user_id = match resolve_authenticated_user(&headers, auth_state) {
        Some(id) => id,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            );
        }
    };

    let (root, relative) = if let Some(raw_path) = query.path {
        normalize_local_relative_path(&raw_path, &user_id)
            .unwrap_or((LocalStorageRoot::Downloads, String::new()))
    } else {
        (LocalStorageRoot::Downloads, String::new())
    };

    let base_dir = match resolve_user_storage_dir(&state, &user_id, root).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let target_dir = if relative.trim().is_empty() {
        base_dir.clone()
    } else {
        let candidate = base_dir.join(&relative);
        match fs::metadata(&candidate).await {
            Ok(meta) if meta.is_dir() => candidate,
            _ => candidate.parent().unwrap_or(&base_dir).to_path_buf(),
        }
    };

    let mut entries = Vec::new();
    match fs::read_dir(&target_dir).await {
        Ok(mut dir) => {
            while let Ok(Some(entry)) = dir.next_entry().await {
                let file_name = entry.file_name().to_string_lossy().to_string();
                let file_type = entry.file_type().await.ok();
                let is_file = file_type.as_ref().map(|ft| ft.is_file()).unwrap_or(false);
                let is_dir = file_type.as_ref().map(|ft| ft.is_dir()).unwrap_or(false);
                let size = if is_file {
                    entry
                        .metadata()
                        .await
                        .ok()
                        .map(|meta| meta.len())
                        .unwrap_or(0)
                } else {
                    0
                };
                entries.push(json!({
                    "name": file_name,
                    "isFile": is_file,
                    "isDir": is_dir,
                    "size": size
                }));
            }
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "dir": target_dir.to_string_lossy().to_string(),
            "entries": entries
        })),
    )
}

async fn user_recordings_upload_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Empty upload body" })),
        );
    }

    let Some(file_name_header) = headers.get("x-filename") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Missing X-Filename header" })),
        );
    };

    let file_name_raw = match file_name_header.to_str() {
        Ok(v) if !v.is_empty() => v,
        _ => "upload.bin",
    };

    let decoded: Cow<'_, str> =
        urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
    let safe_name = sanitize_file_name(decoded.as_ref());

    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim())
        .and_then(|v| {
            if v.to_lowercase().starts_with("bearer ") {
                Some(v[7..].trim())
            } else {
                Some(v)
            }
        })
        .filter(|v| !v.is_empty());

    let user_id = local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token);
    if user_id == "anonymous" {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        );
    }

    let recordings_dir = state
        .project_root
        .join("data")
        .join("users")
        .join(&user_id)
        .join("recordings");

    if let Err(err) = fs::create_dir_all(&recordings_dir).await {
        eprintln!(
            "Erreur création dossier recordings {:?}: {}",
            recordings_dir, err
        );
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let file_path = recordings_dir.join(&safe_name);
    if let Err(err) = fs::write(&file_path, &body).await {
        eprintln!("Erreur écriture recording {:?}: {}", file_path, err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    let rel_path = format!("data/users/{}/recordings/{}", user_id, safe_name);
    (
        StatusCode::OK,
        Json(json!({ "success": true, "file": safe_name, "path": rel_path, "owner": user_id })),
    )
}

async fn list_uploads_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            );
        }
    };

    let token = extract_bearer_token(&headers);
    let token_user_id =
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref());
    let user_id = if token_user_id != "anonymous" {
        token_user_id
    } else if let Some(header_user_id) = extract_user_id_from_headers(&headers) {
        header_user_id
    } else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        );
    };

    let downloads_dir = match resolve_user_downloads_dir(&state, &user_id).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    };

    let mut files: Vec<(String, u64, u64)> = Vec::new();
    match fs::read_dir(&downloads_dir).await {
        Ok(mut dir) => {
            while let Ok(Some(entry)) = dir.next_entry().await {
                if !entry
                    .file_type()
                    .await
                    .map(|ft| ft.is_file())
                    .unwrap_or(false)
                {
                    continue;
                }
                let file_name = entry.file_name().to_string_lossy().to_string();
                let safe_name = sanitize_file_name(&file_name);
                let path = downloads_dir.join(&safe_name);
                match fs::metadata(&path).await {
                    Ok(meta) => {
                        let modified = meta
                            .modified()
                            .ok()
                            .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|duration| duration.as_secs())
                            .unwrap_or_default();
                        files.push((safe_name, meta.len(), modified));
                    }
                    Err(err) => {
                        eprintln!("Erreur métadonnées upload {:?}: {}", path, err);
                    }
                }
            }
        }
        Err(err) => {
            eprintln!(
                "Erreur lecture dossier uploads {:?}: {}",
                downloads_dir, err
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            );
        }
    }

    files.sort_by(|a, b| b.2.cmp(&a.2));

    let json_files: Vec<_> = files
        .into_iter()
        .map(|(name, size, modified)| {
            json!({
                "name": name,
                "size": size,
                "modified": modified,
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({ "success": true, "files": json_files })),
    )
}

async fn download_upload_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(file): AxumPath<String>,
) -> impl IntoResponse {
    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            )
                .into_response();
        }
    };

    let token = extract_bearer_token(&headers);
    let token_user_id =
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref());
    let user_id = if token_user_id != "anonymous" {
        token_user_id
    } else if let Some(header_user_id) = extract_user_id_from_headers(&headers) {
        header_user_id
    } else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    };

    let downloads_dir = match resolve_user_downloads_dir(&state, &user_id).await {
        Ok(dir) => dir,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err.to_string() })),
            )
                .into_response();
        }
    };

    let safe_name = sanitize_file_name(&file);
    let file_path = downloads_dir.join(&safe_name);
    let verbose_logs = download_verbose_logs_enabled();
    if verbose_logs {
        println!(
            "[download_upload_handler] user_id={}, file={}, safe_name={}, downloads_dir={:?}, file_path={:?}, exists={}",
            user_id,
            file,
            safe_name,
            downloads_dir,
            file_path,
            file_path.exists()
        );
    }

    let metadata = match fs::metadata(&file_path).await {
        Ok(value) => value,
        Err(err) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ❌ Metadata not found: {:?}, error: {}",
                    file_path, err
                );
            }
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": file_path.to_string_lossy() })),
            )
                .into_response();
        }
    };
    let file_size = metadata.len();
    let modified_epoch = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let etag_value = format!("W/\"{}-{}\"", file_size, modified_epoch);
    let if_none_match = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    if !if_none_match.is_empty() && if_none_match == etag_value {
        let mut response_headers = HeaderMap::new();
        if let Ok(header_value) = HeaderValue::from_str(&etag_value) {
            response_headers.insert(header::ETAG, header_value);
        }
        response_headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return (StatusCode::NOT_MODIFIED, response_headers).into_response();
    }

    match fs::read(&file_path).await {
        Ok(bytes) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ✅ Serving file: {:?} ({} bytes)",
                    file_path,
                    bytes.len()
                );
            }
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=300"),
            );
            if let Ok(header_value) = HeaderValue::from_str(&etag_value) {
                headers.insert(header::ETAG, header_value);
            }
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(guess_content_type_from_name(&safe_name)),
            );
            headers.insert(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_str(&format!("inline; filename=\"{}\"", safe_name))
                    .unwrap_or_else(|_| HeaderValue::from_static("inline")),
            );

            if let Ok(length_header) = HeaderValue::from_str(&bytes.len().to_string())
            {
                headers.insert(header::CONTENT_LENGTH, length_header);
            }

            (StatusCode::OK, headers, bytes).into_response()
        }
        Err(err) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ❌ File not found: {:?}, error: {}",
                    file_path, err
                );
            }
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": file_path.to_string_lossy() })),
            )
                .into_response()
        }
    }
}

async fn download_recording_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    AxumPath(recording_id): AxumPath<String>,
) -> impl IntoResponse {
    let Some(safe_id) = sanitize_recording_id(&recording_id) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Invalid recording id" })),
        )
            .into_response();
    };

    let auth_state = match &state.auth_state {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Auth state not initialized" })),
            )
                .into_response();
        }
    };

    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim())
        .and_then(|v| {
            if v.to_lowercase().starts_with("bearer ") {
                Some(v[7..].trim())
            } else {
                Some(v)
            }
        })
        .filter(|v| !v.is_empty());

    let token_user_id = local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token);
    let user_id = if token_user_id != "anonymous" {
        token_user_id
    } else if let Some(header_user_id) = extract_user_id_from_headers(&headers) {
        header_user_id
    } else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "success": false, "error": "Unauthorized" })),
        )
            .into_response();
    };

    // First, try to find the file directly in the user's recordings directory (like downloads)
    // This handles recordings synced from Fastify that may not be in the local DB
    let recordings_dir = match resolve_user_storage_dir(
        &state,
        &user_id,
        LocalStorageRoot::Recordings,
    )
    .await
    {
        Ok(dir) => dir,
        Err(err) => {
            println!(
                "[download_recording_handler] Failed to resolve recordings dir: {}",
                err
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "success": false, "error": "Failed to resolve recordings directory" }),
                ),
            )
                .into_response();
        }
    };

    // Try direct file lookup first (by sanitized recording_id as filename)
    let safe_name = sanitize_file_name(&recording_id);
    let direct_path = recordings_dir.join(&safe_name);

    println!(
        "[download_recording_handler] Trying direct lookup: user_id={}, recording_id={}, safe_name={}, recordings_dir={:?}, direct_path={:?}, exists={}",
        user_id, recording_id, safe_name, recordings_dir, direct_path, direct_path.exists()
    );

    if direct_path.exists() {
        match fs::read(&direct_path).await {
            Ok(bytes) => {
                println!(
                    "[download_recording_handler] ✅ Serving recording (direct): {:?} ({} bytes)",
                    direct_path,
                    bytes.len()
                );
                let mut headers = HeaderMap::new();
                headers.insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static(guess_mime_from_ext(&safe_name)),
                );
                if let Ok(header_value) =
                    HeaderValue::from_str(&format!("attachment; filename=\"{}\"", safe_name))
                {
                    headers.insert(header::CONTENT_DISPOSITION, header_value);
                }
                return (StatusCode::OK, headers, bytes).into_response();
            }
            Err(err) => {
                println!("[download_recording_handler] Direct read failed: {}", err);
                // Fall through to DB lookup
            }
        }
    }

    // Fallback: Try to find via database (original logic for locally-created recordings)
    let rel = {
        let atome_state = match &state.atome_state {
            Some(s) => s,
            None => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Atome state not initialized" })),
                )
                    .into_response();
            }
        };

        let db = match atome_state.db.lock() {
            Ok(lock) => lock,
            Err(_) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Database lock failed" })),
                )
                    .into_response();
            }
        };

        // Debug: First check if the atome exists at all
        let exists: bool = match db.query_row(
            "SELECT 1 FROM atomes WHERE atome_id = ?1",
            params![safe_id],
            |_| Ok(true),
        ) {
            Ok(v) => v,
            Err(_) => false,
        };
        println!(
            "[download_recording_handler] Atome exists check: id={}, exists={}",
            safe_id, exists
        );

        let owner_id: Option<String> = match db.query_row(
        "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND atome_type IN ('audio_recording', 'video_recording') AND deleted_at IS NULL",
        params![safe_id],
        |row| row.get(0),
    ) {
            Ok(val) => val,
            Err(e) => {
                println!("[download_recording_handler] Recording not found in DB: id={}, error={}", safe_id, e);
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "Recording not found" })),
                )
                    .into_response();
            }
        };

        println!(
            "[download_recording_handler] Owner check: recording_id={}, owner_id={:?}, user_id={}",
            safe_id, owner_id, user_id
        );

        let owner = match owner_id {
            Some(id) if id == user_id => id,
            Some(id) if !id.is_empty() => {
                // Owner exists but doesn't match - for now, allow access if user is authenticated
                // TODO: Implement proper permission checking
                println!("[download_recording_handler] ⚠️ Owner mismatch but allowing: owner={}, user={}", id, user_id);
                id
            }
            _ => {
                // No owner set - allow authenticated user to access
                println!("[download_recording_handler] ⚠️ No owner set, allowing authenticated access: user={}", user_id);
                user_id.clone()
            }
        };

        let mut file_path: Option<String> = None;
        let mut file_name: Option<String> = None;

        if let Ok(mut stmt) =
            db.prepare("SELECT particle_key, particle_value FROM particles WHERE atome_id = ?1")
        {
            if let Ok(rows) = stmt.query_map(params![safe_id], |row| {
                let key: String = row.get(0)?;
                let value: String = row.get(1)?;
                Ok((key, value))
            }) {
                for row in rows.flatten() {
                    let (key, raw) = row;
                    let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok();
                    let as_str = parsed
                        .as_ref()
                        .and_then(|v| v.as_str().map(|s| s.to_string()))
                        .unwrap_or(raw.clone());
                    if key == "file_path" {
                        file_path = Some(as_str);
                    } else if key == "file_name" {
                        file_name = Some(as_str);
                    }
                }
            }
        }

        let prefix = format!("data/users/{}/recordings/", owner);
        if let Some(path) = file_path {
            let trimmed = path.trim().trim_start_matches('/');
            if !trimmed.starts_with(&prefix) || trimmed.contains("..") {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Access denied" })),
                )
                    .into_response();
            }
            trimmed.to_string()
        } else if let Some(name) = file_name {
            let safe_name = sanitize_file_name(&name);
            format!("{}{}", prefix, safe_name)
        } else {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "Recording path missing" })),
            )
                .into_response();
        }
    };

    let target_path = state.project_root.join(&rel);
    println!(
        "[download_recording_handler] recording_id={}, user_id={}, rel={}, project_root={:?}, target_path={:?}, exists={}",
        recording_id,
        user_id,
        rel,
        state.project_root,
        target_path,
        target_path.exists()
    );

    let bytes = match fs::read(&target_path).await {
        Ok(b) => {
            println!(
                "[download_recording_handler] ✅ Serving recording: {:?} ({} bytes)",
                target_path,
                b.len()
            );
            b
        }
        Err(err) => {
            println!(
                "[download_recording_handler] ❌ File not found: {:?}, error: {}",
                target_path, err
            );
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": target_path.to_string_lossy() })),
            )
                .into_response();
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(guess_mime_from_ext(&rel)),
    );
    if let Ok(header_value) = HeaderValue::from_str(&format!(
        "attachment; filename=\"{}\"",
        sanitize_file_name(&rel)
    )) {
        headers.insert(header::CONTENT_DISPOSITION, header_value);
    }

    (StatusCode::OK, headers, bytes).into_response()
}

/// Request for writing update files
#[derive(serde::Deserialize)]
pub struct WriteUpdateFileRequest {
    pub path: String,
    pub content: String,
}

/// Handler for writing update files (admin only)
async fn update_file_handler(
    State(state): State<AppState>,
    Json(payload): Json<WriteUpdateFileRequest>,
) -> impl IntoResponse {
    // Security: Only allow writes within src/ directory
    // static_dir points to 'src', so parent is project root
    let base_path = state.static_dir.parent().unwrap_or(&state.static_dir);
    let target_path = base_path.join(&payload.path);

    // Validate path is within allowed directories
    let allowed_prefixes = [
        "src/squirrel",
        "src/application/core",
        "src/application/security",
    ];
    // Fichiers spécifiques autorisés (en dehors des préfixes)
    let allowed_files = ["src/version.json"];
    let protected_prefixes = ["src/application/examples", "src/application/config"];

    let path_str = payload.path.as_str();

    // Check if path is protected
    for protected in &protected_prefixes {
        if path_str.starts_with(protected) {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "success": false,
                    "error": format!("Path {} is protected and cannot be updated", protected)
                })),
            );
        }
    }

    // Check if path is allowed (prefix ou fichier spécifique)
    let is_allowed = allowed_prefixes
        .iter()
        .any(|prefix| path_str.starts_with(prefix))
        || allowed_files.contains(&path_str);
    if !is_allowed {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "success": false,
                "error": "Path is not in allowed update directories"
            })),
        );
    }

    // Create parent directories if needed
    if let Some(parent) = target_path.parent() {
        if let Err(err) = fs::create_dir_all(parent).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to create directory: {}", err)
                })),
            );
        }
    }

    // Write the file
    match fs::write(&target_path, payload.content.as_bytes()).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "path": payload.path,
                "message": "File updated successfully"
            })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "success": false,
                "error": format!("Failed to write file: {}", err)
            })),
        ),
    }
}

// === BATCH UPDATE HANDLER ===

#[derive(serde::Deserialize)]
pub struct BatchUpdateFile {
    pub path: String,
    pub url: String,
}

#[derive(serde::Deserialize)]
pub struct VersionUpdate {
    pub path: String,
    pub content: String,
}

#[derive(serde::Deserialize)]
pub struct BatchUpdateRequest {
    pub files: Vec<BatchUpdateFile>,
    #[serde(default)]
    pub version: Option<VersionUpdate>,
}

/// Handler for batch downloading and updating files from GitHub
async fn batch_update_handler(
    State(state): State<AppState>,
    Json(payload): Json<BatchUpdateRequest>,
) -> impl IntoResponse {
    // static_dir points to 'src' bundle directory
    // We need to write to the bundle, not the source
    let static_dir = state.static_dir.as_ref();

    // Canonicalize to get absolute path
    let base_path = match static_dir.parent() {
        Some(parent) => match parent.canonicalize() {
            Ok(abs) => abs,
            Err(_) => parent.to_path_buf(),
        },
        None => static_dir.to_path_buf(),
    };

    println!("📥 Batch update: {} files to download", payload.files.len());
    println!("📂 Static dir: {:?}", static_dir);
    println!("📂 Base path (absolute): {:?}", base_path);

    let allowed_prefixes = [
        "src/squirrel",
        "src/application/core",
        "src/application/security",
    ];
    let allowed_files = ["src/version.json"];
    let protected_prefixes = ["src/application/examples", "src/application/config"];

    let client = reqwest::Client::new();
    let mut updated_files = Vec::new();
    let mut errors = Vec::new();

    for file in &payload.files {
        let path_str = file.path.as_str();

        // Check protected paths
        let is_protected = protected_prefixes.iter().any(|p| path_str.starts_with(p));
        if is_protected {
            errors.push(json!({
                "path": file.path,
                "error": "Path is protected"
            }));
            continue;
        }

        // Check allowed paths
        let is_allowed = allowed_prefixes.iter().any(|p| path_str.starts_with(p))
            || allowed_files.contains(&path_str);
        if !is_allowed {
            errors.push(json!({
                "path": file.path,
                "error": "Path not in allowed directories"
            }));
            continue;
        }

        // Download file from GitHub
        let download_result = client.get(&file.url).send().await;
        match download_result {
            Ok(response) => {
                if !response.status().is_success() {
                    errors.push(json!({
                        "path": file.path,
                        "error": format!("GitHub returned status {}", response.status())
                    }));
                    continue;
                }

                match response.bytes().await {
                    Ok(content) => {
                        let target_path = base_path.join(&file.path);

                        // Create parent directories
                        if let Some(parent) = target_path.parent() {
                            if let Err(e) = fs::create_dir_all(parent).await {
                                errors.push(json!({
                                    "path": file.path,
                                    "error": format!("Failed to create directory: {}", e)
                                }));
                                continue;
                            }
                        }

                        // Write file
                        match fs::write(&target_path, &content).await {
                            Ok(_) => {
                                updated_files.push(file.path.clone());
                            }
                            Err(e) => {
                                errors.push(json!({
                                    "path": file.path,
                                    "error": format!("Failed to write file: {}", e)
                                }));
                            }
                        }
                    }
                    Err(e) => {
                        errors.push(json!({
                            "path": file.path,
                            "error": format!("Failed to read response: {}", e)
                        }));
                    }
                }
            }
            Err(e) => {
                errors.push(json!({
                    "path": file.path,
                    "error": format!("Failed to download: {}", e)
                }));
            }
        }
    }

    // Update version file only if provided (not null)
    if let Some(ref version) = payload.version {
        let version_path = base_path.join(&version.path);
        if let Some(parent) = version_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }
        if let Err(e) = fs::write(&version_path, version.content.as_bytes()).await {
            errors.push(json!({
                "path": version.path,
                "error": format!("Failed to update version file: {}", e)
            }));
        }
    }

    let success = errors.is_empty();
    (
        if success {
            StatusCode::OK
        } else {
            StatusCode::PARTIAL_CONTENT
        },
        Json(json!({
            "success": success,
            "filesUpdated": updated_files.len(),
            "updated": updated_files,
            "errors": if errors.is_empty() { None } else { Some(errors) }
        })),
    )
}

// === SYNC FROM ZIP HANDLER ===

#[derive(serde::Deserialize)]
pub struct SyncFromZipRequest {
    #[serde(rename = "zipUrl")]
    pub zip_url: String,
    #[serde(rename = "extractPath")]
    pub extract_path: String,
    #[serde(rename = "protectedPaths", default)]
    pub protected_paths: Vec<String>,
}

/// Handler for downloading ZIP from GitHub, extracting src/, and syncing
async fn sync_from_zip_handler(
    State(state): State<AppState>,
    Json(payload): Json<SyncFromZipRequest>,
) -> impl IntoResponse {
    println!("📦 Sync from ZIP: {}", payload.zip_url);
    println!("📂 Extract path: {}", payload.extract_path);
    println!("🛡️ Protected paths: {:?}", payload.protected_paths);

    // Get the PROJECT ROOT (not the bundle!)
    // static_dir is something like: .../src-tauri/target/debug/_up_/src
    // We need to go up to find the real project root
    let static_dir = state.static_dir.as_ref();

    // Try to find project root by looking for Cargo.toml or package.json
    let mut base_path = static_dir.to_path_buf();

    // Go up until we find the project root (where src-tauri exists)
    for _ in 0..10 {
        if base_path.join("src-tauri").exists() || base_path.join("package.json").exists() {
            break;
        }
        if let Some(parent) = base_path.parent() {
            base_path = parent.to_path_buf();
        } else {
            break;
        }
    }

    // Canonicalize for absolute path
    base_path = base_path.canonicalize().unwrap_or(base_path);

    println!("📂 Project root: {:?}", base_path);
    println!(
        "📂 Will write to: {:?}",
        base_path.join(&payload.extract_path)
    );

    // Download ZIP from GitHub
    let client = reqwest::Client::new();
    let response = match client.get(&payload.zip_url).send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to download ZIP: {}", e)
                })),
            );
        }
    };

    if !response.status().is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "success": false,
                "error": format!("GitHub returned status {}", response.status())
            })),
        );
    }

    let zip_bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to read ZIP: {}", e)
                })),
            );
        }
    };

    println!("📥 Downloaded ZIP: {} bytes", zip_bytes.len());

    // Extract ZIP in memory
    let cursor = Cursor::new(zip_bytes.as_ref());
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to read ZIP archive: {}", e)
                })),
            );
        }
    };

    println!("📦 ZIP contains {} files", archive.len());

    let mut updated_files: Vec<String> = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    // The ZIP from GitHub has a root folder like "a-main/"
    // We need to find it and strip it
    let mut root_prefix = String::new();
    if let Ok(first_entry) = archive.by_index(0) {
        let name = first_entry.name();
        if let Some(idx) = name.find('/') {
            root_prefix = name[..=idx].to_string();
        }
    }
    println!("📁 ZIP root prefix: {}", root_prefix);

    // Re-create archive (it was consumed)
    let cursor = Cursor::new(zip_bytes.as_ref());
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to re-read ZIP archive: {}", e)
                })),
            );
        }
    };

    // Extract files
    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(e) => {
                errors.push(json!({
                    "index": i,
                    "error": format!("Failed to read entry: {}", e)
                }));
                continue;
            }
        };

        let name = file.name().to_string();

        // Skip directories
        if name.ends_with('/') {
            continue;
        }

        // Strip root prefix and check if it's in src/
        let relative_path = if name.starts_with(&root_prefix) {
            &name[root_prefix.len()..]
        } else {
            &name
        };

        // Only process files that are EXACTLY in the extract_path folder (src/)
        // Must start with "src/" but NOT "src-tauri/" or "src-Auv3/"
        let extract_prefix = format!("{}/", payload.extract_path.trim_end_matches('/'));
        if !relative_path.starts_with(&extract_prefix) {
            continue;
        }

        // Check if path is protected
        let is_protected = payload
            .protected_paths
            .iter()
            .any(|p| relative_path.starts_with(p));
        if is_protected {
            println!("🛡️ Skipping protected: {}", relative_path);
            continue;
        }

        // Read file content
        let mut content = Vec::new();
        if let Err(e) = file.read_to_end(&mut content) {
            errors.push(json!({
                "path": relative_path,
                "error": format!("Failed to read content: {}", e)
            }));
            continue;
        }

        // Write file to disk
        let target_path = base_path.join(relative_path);
        println!("📝 Writing: {} → {:?}", relative_path, target_path);

        // Create parent directories
        if let Some(parent) = target_path.parent() {
            if let Err(e) = stdfs::create_dir_all(parent) {
                errors.push(json!({
                    "path": relative_path,
                    "error": format!("Failed to create directory: {}", e)
                }));
                continue;
            }
        }

        // Write file
        if let Err(e) = stdfs::write(&target_path, &content) {
            errors.push(json!({
                "path": relative_path,
                "error": format!("Failed to write file: {}", e)
            }));
            continue;
        }

        updated_files.push(relative_path.to_string());
    }

    println!("✅ Updated {} files", updated_files.len());
    if !errors.is_empty() {
        println!("⚠️ {} errors", errors.len());
    }

    let success = errors.is_empty();
    (
        if success {
            StatusCode::OK
        } else {
            StatusCode::PARTIAL_CONTENT
        },
        Json(json!({
            "success": success,
            "filesUpdated": updated_files.len(),
            "updated": updated_files,
            "errors": if errors.is_empty() { None } else { Some(errors) }
        })),
    )
}

// =============================================================================
// WEBSOCKET HANDLERS
// =============================================================================

/// WebSocket handler for API calls (replaces HTTP fetch for silent connection detection)
async fn ws_api_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_api(socket, state))
}

/// Handle WebSocket API connection (ADOLE v3.0)
async fn handle_ws_api(mut socket: WebSocket, state: AppState) {
    println!("🔗 New WebSocket API connection");

    while let Some(msg) = socket.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };

        match msg {
            Message::Text(text) => {
                // Parse JSON message
                let data: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(_) => {
                        let _ = socket
                            .send(Message::Text(
                                json!({"type": "error", "message": "Invalid JSON"}).to_string(),
                            ))
                            .await;
                        continue;
                    }
                };

                let msg_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");

                // Handle ping/pong
                if msg_type == "ping" {
                    let _ = socket
                        .send(Message::Text(json!({"type": "pong"}).to_string()))
                        .await;
                    continue;
                }

                // Route to atome handler
                if msg_type == "atome" {
                    if let Some(ref atome_state) = state.atome_state {
                        // Extract user_id from JWT token (secure - cannot be spoofed)
                        // If no auth_state, fall back to anonymous (development mode)
                        let user_id = if let Some(ref auth_state) = state.auth_state {
                            let token = data.get("token").and_then(|v| v.as_str());
                            local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token)
                        } else {
                            // Fallback to userId from message (insecure, only for dev)
                            data.get("userId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("anonymous")
                                .to_string()
                        };
                        let response =
                            local_atome::handle_atome_message(data, &user_id, atome_state).await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                json!({"type": "error", "message": "Atome state not initialized"})
                                    .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to events handler (event log + state projection)
                if msg_type == "events" {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = if let Some(ref auth_state) = state.auth_state {
                            let token = data.get("token").and_then(|v| v.as_str());
                            local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token)
                        } else {
                            data.get("userId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("anonymous")
                                .to_string()
                        };
                        let response =
                            local_atome::handle_events_message(data, &user_id, atome_state).await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                json!({"type": "error", "message": "Atome state not initialized"})
                                    .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to state-current handler (projection cache)
                if msg_type == "state-current" {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = if let Some(ref auth_state) = state.auth_state {
                            let token = data.get("token").and_then(|v| v.as_str());
                            local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token)
                        } else {
                            data.get("userId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("anonymous")
                                .to_string()
                        };
                        let response =
                            local_atome::handle_state_current_message(data, &user_id, atome_state)
                                .await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                json!({"type": "error", "message": "Atome state not initialized"})
                                    .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to auth handler
                if msg_type == "auth" {
                    if let Some(ref auth_state) = state.auth_state {
                        let response = local_auth::handle_auth_message(data, auth_state).await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                json!({"type": "error", "message": "Auth state not initialized"})
                                    .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to debug handler
                if msg_type == "debug" {
                    let action = data.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    let request_id = data
                        .get("requestId")
                        .and_then(|v| v.as_str())
                        .map(String::from);

                    if action == "list-tables" {
                        let response = if let Some(ref atome_state) = state.atome_state {
                            // Collect tables in a sync block, then drop the guard before await
                            let tables_result: Result<Vec<String>, String> = (|| {
                                let db = atome_state.db.lock().map_err(|e| e.to_string())?;
                                let mut stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                                    .map_err(|e| e.to_string())?;
                                let tables: Vec<String> = stmt
                                    .query_map([], |row| row.get(0))
                                    .map_err(|e| e.to_string())?
                                    .filter_map(|r| r.ok())
                                    .collect();
                                Ok(tables)
                            })(
                            );

                            match tables_result {
                                Ok(tables) => json!({
                                    "type": "debug-response",
                                    "requestId": request_id,
                                    "success": true,
                                    "tables": tables
                                }),
                                Err(e) => json!({
                                    "type": "debug-response",
                                    "requestId": request_id,
                                    "success": false,
                                    "error": e
                                }),
                            }
                        } else {
                            json!({
                                "type": "debug-response",
                                "requestId": request_id,
                                "success": false,
                                "error": "Database not initialized"
                            })
                        };
                        let _ = socket.send(Message::Text(response.to_string())).await;
                    } else {
                        let response = json!({
                            "type": "debug-response",
                            "requestId": request_id,
                            "success": false,
                            "error": format!("Unknown debug action: {}", action)
                        });
                        let _ = socket.send(Message::Text(response.to_string())).await;
                    }
                    continue;
                }

                // Handle legacy API requests (for backward compatibility)
                if msg_type == "api-request" {
                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let method = data.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                    let path = data.get("path").and_then(|v| v.as_str()).unwrap_or("/");

                    let response = json!({
                        "type": "api-response",
                        "id": id,
                        "response": {
                            "status": 200,
                            "headers": {},
                            "body": {
                                "success": true,
                                "method": method,
                                "path": path,
                                "server": "Tauri/Axum"
                            }
                        }
                    });

                    let _ = socket.send(Message::Text(response.to_string())).await;
                    continue;
                }

                // Unknown message type
                let _ = socket
                    .send(Message::Text(
                        json!({"type": "error", "message": "Unknown message type"}).to_string(),
                    ))
                    .await;
            }
            Message::Ping(data) => {
                let _ = socket.send(Message::Pong(data)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    println!("🔌 WebSocket API connection closed");
}

/// WebSocket handler for sync (compatible with sync_engine.js)
async fn ws_sync_handler(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_sync(state.clone(), socket))
}

/// Handle WebSocket sync connection
async fn handle_ws_sync(state: AppState, mut socket: WebSocket) {
    println!("🔗 New WebSocket sync connection");

    let now_iso = || chrono::Utc::now().to_rfc3339();
    let server_version = state.version.as_str().to_string();
    let build_welcome = |client_id: Option<String>| {
        json!({
            "type": "welcome",
            "clientId": client_id.unwrap_or_else(|| "unknown".to_string()),
            "server": "axum",
            "version": server_version,
            "schema": local_atome::schema_tables(),
            "schema_hash": local_atome::schema_hash(),
            "protectedPaths": [],
            "watcherEnabled": false,
            "watcherConfig": null,
            "capabilities": ["events", "sync_request", "file-events", "atome-events", "account-events"],
            "timestamp": now_iso()
        })
    };
    let wrap_event_payload = |payload: &JsonValue| {
        let event_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if event_type == "event" {
            return payload.clone();
        }

        let mut mapped_event = event_type.to_string();
        if event_type == "atome-sync" {
            let op = payload
                .get("operation")
                .and_then(|v| v.as_str())
                .unwrap_or("update")
                .to_lowercase();
            mapped_event = if op == "create" {
                "atome:created".to_string()
            } else if op == "delete" {
                "atome:deleted".to_string()
            } else {
                "atome:updated".to_string()
            };
        } else if event_type == "file-event" {
            mapped_event = "sync:file-event".to_string();
        } else if event_type == "account-created" || event_type == "account-deleted" {
            mapped_event = format!("sync:{}", event_type);
        } else if event_type == "sync:user-created" {
            mapped_event = "sync:account-created".to_string();
        } else if event_type == "sync:user-deleted" {
            mapped_event = "sync:account-deleted".to_string();
        }

        json!({
            "type": "event",
            "eventType": mapped_event,
            "payload": payload,
            "timestamp": payload.get("timestamp").cloned().unwrap_or_else(|| json!(now_iso()))
        })
    };

    // Send welcome message (immediate)
    let _ = socket
        .send(Message::Text(build_welcome(None).to_string()))
        .await;

    let mut sync_rx = sync_event_sender().subscribe();
    let (mut ws_sender, mut ws_receiver) = socket.split();

    loop {
        tokio::select! {
            maybe_msg = ws_receiver.next() => {
                let msg = match maybe_msg {
                    Some(Ok(m)) => m,
                    Some(Err(_)) => break,
                    None => break,
                };

                match msg {
                    Message::Text(text) => {
                        let data: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };

                        // Handle ping
                        if data.get("type").and_then(|v| v.as_str()) == Some("ping") {
                            let _ = ws_sender
                                .send(Message::Text(json!({"type": "pong", "timestamp": now_iso()}).to_string()))
                                .await;
                            continue;
                        }

                        // Handle heartbeat (legacy)
                        if data.get("type").and_then(|v| v.as_str()) == Some("heartbeat") {
                            let _ = ws_sender
                                .send(Message::Text(json!({"type": "heartbeat_ack"}).to_string()))
                                .await;
                            continue;
                        }

                        // Handle register (preferred)
                        if data.get("type").and_then(|v| v.as_str()) == Some("register") {
                            let client_id = data
                                .get("clientId")
                                .and_then(|v| v.as_str())
                                .map(|v| v.to_string());
                            let _ = ws_sender
                                .send(Message::Text(build_welcome(client_id).to_string()))
                                .await;
                            continue;
                        }

                        // Handle sync_request (offline/local)
                        if data.get("type").and_then(|v| v.as_str()) == Some("sync_request") {
                            let _ = ws_sender
                                .send(Message::Text(json!({
                                    "type": "sync_started",
                                    "mode": "local",
                                    "timestamp": now_iso()
                                }).to_string()))
                                .await;
                            continue;
                        }

                        // Echo other messages for now (legacy ack)
                        let _ = ws_sender
                            .send(Message::Text(json!({"type": "ack", "received": data}).to_string()))
                            .await;
                    }
                    Message::Ping(data) => {
                        let _ = ws_sender.send(Message::Pong(data)).await;
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            sync_msg = sync_rx.recv() => {
                match sync_msg {
                    Ok(payload) => {
                        let wrapped = wrap_event_payload(&payload);
                        let _ = ws_sender.send(Message::Text(wrapped.to_string())).await;
                        let _ = ws_sender.send(Message::Text(payload.to_string())).await;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(_) => break,
                }
            }
        }
    }

    println!("🔌 WebSocket sync connection closed");
}

pub async fn start_server(static_dir: PathBuf, uploads_dir: PathBuf, data_dir: PathBuf) {
    // Service principal
    let base_dir = static_dir.clone();
    let serve_dir_root = ServeDir::new(base_dir.clone()).append_index_html_on_directories(true);
    let root_service = get_service(serve_dir_root).handle_error(|error| async move {
        println!("Erreur serveur statique: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur serveur",
        )
    });

    // Service fichiers (correspond à dataFetcher: /file/<path>)
    let serve_dir_file = ServeDir::new(base_dir.clone());
    let file_service = get_service(serve_dir_file).handle_error(|error| async move {
        println!("Erreur /file: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur fichier",
        )
    });

    // Service texte (même répertoire, pas de transformation spéciale)
    let serve_dir_text = ServeDir::new(base_dir.clone());
    let text_service = get_service(serve_dir_text).handle_error(|error| async move {
        println!("Erreur /text: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur texte",
        )
    });

    if let Err(err) = fs::create_dir_all(&uploads_dir).await {
        eprintln!(
            "Impossible de créer le dossier uploads {:?}: {}",
            uploads_dir, err
        );
    }

    let version = load_version(&base_dir);
    println!("📦 Version applicative: {}", version);

    // Canonicalize static_dir to get absolute path for file updates
    let static_dir_abs = base_dir.canonicalize().unwrap_or_else(|_| base_dir.clone());
    println!("📂 Static dir (absolute): {:?}", static_dir_abs);

    let data_dir = {
        if let Err(e) = std::fs::create_dir_all(&data_dir) {
            eprintln!("⚠️ Could not create data directory {:?}: {}", data_dir, e);
            uploads_dir.parent().unwrap_or(&uploads_dir).to_path_buf()
        } else {
            println!("📂 Database directory: {:?}", data_dir);
            data_dir
        }
    };

    // Initialize local atome and auth states (ADOLE v3.0 WebSocket-based)
    let atome_state = local_atome::create_state(data_dir.clone());
    let auth_state = local_auth::create_state(&atome_state, &data_dir);

    let project_root = static_dir_abs
        .parent()
        .unwrap_or(&static_dir_abs)
        .to_path_buf();

    // Log the project root for debugging media path issues
    println!("📂 Project root for media files: {:?}", project_root);
    let expected_data_path = project_root.join("data").join("users");
    println!(
        "📂 Expected user data directory: {:?} (exists: {})",
        expected_data_path,
        expected_data_path.exists()
    );

    let state = AppState {
        static_dir: Arc::new(static_dir_abs),
        project_root: Arc::new(project_root),
        version: Arc::new(version.clone()),
        started_at: Arc::new(std::time::Instant::now()),
        atome_state: Some(atome_state),
        auth_state: Some(auth_state),
    };

    let sync_remote_enabled = std::env::var("SQUIRREL_SYNC_REMOTE")
        .map(|v| v != "0")
        .unwrap_or(true);
    if sync_remote_enabled {
        let remote_url = std::env::var("SQUIRREL_FASTIFY_URL")
            .or_else(|_| std::env::var("FASTIFY_URL"))
            .unwrap_or_else(|_| "http://127.0.0.1:3001".to_string());
        if let Some(atome_state) = state.atome_state.clone() {
            if !remote_url.trim().is_empty() {
                println!("🔁 Sync queue enabled → {}", remote_url);
                tokio::spawn(local_atome::run_sync_worker(atome_state, remote_url));
            }
        }
    }

    // CORS configuration that allows credentials (required for cookie-based auth)
    // Must specify exact origins when credentials are used (not wildcard *)
    let cors = CorsLayer::new()
        .allow_origin([
            "http://127.0.0.1:1430".parse::<HeaderValue>().unwrap(),
            "http://localhost:1430".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:3000".parse::<HeaderValue>().unwrap(),
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:3001".parse::<HeaderValue>().unwrap(),
            "http://localhost:3001".parse::<HeaderValue>().unwrap(),
            "tauri://localhost".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
            HeaderName::from_static("x-client-id"),
            HeaderName::from_static("x-filename"),
            HeaderName::from_static("x-original-name"),
            HeaderName::from_static("x-file-path"),
            HeaderName::from_static("x-atome-id"),
            HeaderName::from_static("x-atome-type"),
            HeaderName::from_static("x-mime-type"),
            HeaderName::from_static("x-user-id"),
            HeaderName::from_static("x-userid"),
            HeaderName::from_static("x-username"),
            HeaderName::from_static("x-user-name"),
            HeaderName::from_static("x-phone"),
            HeaderName::from_static("x-user-phone"),
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/api/server-info", get(server_info_handler))
        .route("/dev/state", get(dev_state_handler))
        .route("/api/fastify-status", get(fastify_status_handler))
        .route("/server_config.json", get(server_config_handler))
        .route("/api/debug-log", post(debug_log_handler))
        .route("/api/adole/debug/tables", get(adole_debug_tables_handler))
        .route("/api/db/status", get(db_status_handler))
        .route("/api/events/commit", post(events_commit_handler))
        .route("/api/events/commit-batch", post(events_commit_batch_handler))
        .route("/api/events", get(events_list_handler))
        .route("/api/state_current/:id", get(state_current_get_handler))
        .route("/api/state_current", get(state_current_list_handler))
        .route(
            "/api/local-files",
            get(local_file_read_handler).post(local_file_write_handler),
        )
        .route("/api/local-files/meta", get(local_file_meta_handler))
        .route("/api/local-files/list", get(local_file_list_handler))
        .route(
            "/api/uploads",
            get(list_uploads_handler).post(upload_handler),
        )
        .route("/api/uploads/:file", get(download_upload_handler))
        .route("/api/recordings/:id", get(download_recording_handler))
        .route("/api/user-recordings", post(user_recordings_upload_handler))
        .route("/api/admin/apply-update", post(update_file_handler))
        .route("/api/admin/batch-update", post(batch_update_handler))
        .route("/api/admin/sync-from-zip", post(sync_from_zip_handler))
        // WebSocket endpoints for API and sync (ADOLE v3.0)
        .route("/ws/api", get(ws_api_handler))
        .route("/ws/sync", get(ws_sync_handler))
        .nest_service("/", root_service)
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .layer(cors)
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_UPLOAD_BYTES))
        .layer(middleware::from_fn(log_request_middleware))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum {} démarré: http://localhost:3000", version);
    println!("🔗 WebSocket API enabled: ws://localhost:3000/ws/api");
    println!("🔗 WebSocket Sync enabled: ws://localhost:3000/ws/sync");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!(
                "ERROR: Unable to bind Axum server on http://localhost:3000 ({}). Another instance may already be running.",
                err
            );
            record_recent_error(json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "source": "axum",
                "component": "startup",
                "error": format!("bind 127.0.0.1:3000 failed: {}", err),
            }));
            return;
        }
    };

    if let Err(err) = axum::serve(listener, app).await {
        eprintln!("ERROR: Axum server stopped unexpectedly: {}", err);
        record_recent_error(json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source": "axum",
            "component": "runtime",
            "error": format!("serve failed: {}", err),
        }));
    }
}
