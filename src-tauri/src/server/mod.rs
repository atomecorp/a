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
use base64::{engine::general_purpose, Engine as _};
use futures_util::{SinkExt, StreamExt};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use std::{
    borrow::Cow,
    fs as stdfs,
    io::{Cursor, Read},
    net::SocketAddr,
    path::Component,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    net::TcpStream,
    sync::broadcast,
    time::{timeout, Duration},
};
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, services::ServeDir};
use tracing::{error, info, warn};
use uuid::Uuid;
use zip::ZipArchive;

macro_rules! println {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::println!($($arg)*);
        }
    };
}

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::runtime_logging::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

// Local authentication module
pub mod local_auth;
// Local atome storage module
pub mod local_atome;

#[derive(Clone)]
struct AppState {
    static_dir: Arc<PathBuf>,
    project_root: Arc<PathBuf>,
    version: Arc<String>,
    eve_version: Arc<String>,
    started_at: Arc<std::time::Instant>,
    atome_state: Option<local_atome::LocalAtomeState>,
    auth_state: Option<local_auth::LocalAuthState>,
    remote_control_enabled: bool,
    remote_control_token: Option<Arc<String>>,
}

#[derive(Deserialize, Default)]
struct MediaTokenQuery {
    token: Option<String>,
    access_token: Option<String>,
    auth_token: Option<String>,
    media_user_id: Option<String>,
    user_id: Option<String>,
    #[serde(rename = "userId")]
    user_id_camel: Option<String>,
    x_user_id: Option<String>,
    x_userid: Option<String>,
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

#[derive(Deserialize, Default)]
struct MailSyncRequest {
    initial: Option<bool>,
    mailbox: Option<String>,
    limit: Option<i64>,
    unread_only: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
struct MailSendRequest {
    draft: Option<JsonValue>,
    confirmed: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
struct MailMarkReadRequest {
    message: Option<JsonValue>,
    read: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
struct MailMessageActionRequest {
    message: Option<JsonValue>,
    remote_mailbox: Option<String>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioRecordStartRequest {
    session_id: Option<String>,
    #[serde(rename = "sessionId")]
    session_id_camel: Option<String>,
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    sample_rate: Option<u32>,
    #[serde(rename = "sampleRate")]
    sample_rate_camel: Option<u32>,
    channels: Option<u16>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioRecordStopRequest {
    session_id: Option<String>,
    #[serde(rename = "sessionId")]
    session_id_camel: Option<String>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioAnalyzeRequest {
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    absolute_file_path: Option<String>,
    #[serde(rename = "absoluteFilePath")]
    absolute_file_path_camel: Option<String>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioPlaybackLoadRequest {
    id: Option<String>,
    file_path: Option<String>,
    #[serde(rename = "filePath")]
    file_path_camel: Option<String>,
    absolute_file_path: Option<String>,
    #[serde(rename = "absoluteFilePath")]
    absolute_file_path_camel: Option<String>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioPlaybackPlayRequest {
    id: Option<String>,
    voice_id: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id_camel: Option<String>,
    start_seconds: Option<f64>,
    #[serde(rename = "startSeconds")]
    start_seconds_camel: Option<f64>,
    duration_seconds: Option<f64>,
    #[serde(rename = "durationSeconds")]
    duration_seconds_camel: Option<f64>,
    gain: Option<f64>,
    rate: Option<f64>,
}

#[derive(Deserialize, Default)]
struct RemoteAudioPlaybackStopRequest {
    id: Option<String>,
    voice_id: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id_camel: Option<String>,
}

#[derive(Deserialize, Default)]
struct AiProviderCompletionRequest {
    provider_id: Option<String>,
    provider_type: Option<String>,
    completion_endpoint: Option<String>,
    model: Option<String>,
    prompt: Option<String>,
    system_prompt: Option<String>,
    api_key: Option<String>,
    timeout_ms: Option<u64>,
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

fn lower_file_extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn replace_file_extension(name: &str, extension: &str) -> String {
    let clean_extension = extension.trim().trim_start_matches('.');
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or(name);
    sanitize_file_name(&format!("{}.{}", stem, clean_extension))
}

fn should_transcode_recording_upload_to_mp4(file_name: &str, mime_type: &str) -> bool {
    lower_file_extension(file_name) == "webm"
        && mime_type.trim().to_ascii_lowercase().starts_with("video/")
}

fn should_serve_webm_video_as_mp4(file_name: &str) -> bool {
    let lower = file_name.trim().to_ascii_lowercase();
    lower_file_extension(file_name) == "webm"
        && !lower.starts_with("audio_")
        && !lower.starts_with("audio_recording_")
}

fn video_cache_path(source_path: &Path, file_name: &str) -> Result<(PathBuf, String), String> {
    let parent = source_path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {}", source_path.display()))?;
    let cache_dir = parent.join(".video_cache");
    let cached_name = replace_file_extension(file_name, "mp4");
    Ok((cache_dir.join(&cached_name), cached_name))
}

async fn transcode_video_to_mp4(
    source_path: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let source = source_path.to_path_buf();
    let output = output_path.to_path_buf();
    let ffmpeg_result = tokio::task::spawn_blocking(move || {
        Command::new("ffmpeg")
            .arg("-y")
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-i")
            .arg(&source)
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("0:a?")
            .arg("-c:v")
            .arg("libx264")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-profile:v")
            .arg("baseline")
            .arg("-level")
            .arg("3.1")
            .arg("-movflags")
            .arg("+faststart")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("128k")
            .arg(&output)
            .output()
    })
    .await
    .map_err(|err| format!("recording_transcode_task_failed: {err}"))?
    .map_err(|err| format!("recording_transcode_spawn_failed: {err}"))?;

    if !ffmpeg_result.status.success() {
        let stderr = String::from_utf8_lossy(&ffmpeg_result.stderr).trim().to_string();
        return Err(format!(
            "recording_transcode_failed: {}",
            if stderr.is_empty() { "ffmpeg exited without details" } else { stderr.as_str() }
        ));
    }
    Ok(())
}

async fn resolve_playback_media_file(
    source_path: &Path,
    file_name: &str,
) -> Result<(PathBuf, &'static str, String), String> {
    if !should_serve_webm_video_as_mp4(file_name) {
        return Ok((
            source_path.to_path_buf(),
            guess_mime_from_ext(file_name),
            sanitize_file_name(file_name),
        ));
    }

    let (cached_path, cached_name) = video_cache_path(source_path, file_name)?;
    if let Some(parent) = cached_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|err| format!("video_cache_create_failed: {err}"))?;
    }
    if fs::metadata(&cached_path).await.is_err() {
        transcode_video_to_mp4(source_path, &cached_path).await?;
    }
    Ok((cached_path, "video/mp4", cached_name))
}

fn sanitize_upload_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        Some(trimmed.to_string())
    } else {
        None
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
    // Apply sanitize_file_name first so that URL-decoded characters like spaces
    // are converted to underscores (consistent with upload handler behavior)
    // instead of rejecting the whole id as invalid.
    let sanitized = sanitize_file_name(trimmed);
    if sanitized.is_empty() {
        return None;
    }
    if !sanitized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return None;
    }
    Some(sanitized)
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

fn extract_token_from_media_query(query: &MediaTokenQuery) -> Option<String> {
    [
        query.token.as_deref(),
        query.access_token.as_deref(),
        query.auth_token.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim())
    .find(|value| !value.is_empty())
    .map(|value| value.to_string())
}

fn extract_user_id_from_media_query(query: &MediaTokenQuery) -> Option<String> {
    [
        query.media_user_id.as_deref(),
        query.user_id.as_deref(),
        query.user_id_camel.as_deref(),
        query.x_user_id.as_deref(),
        query.x_userid.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim())
    .filter(|value| !value.is_empty())
    .find_map(|value| {
        let sanitized = sanitize_user_segment(value);
        if sanitized == "anonymous" {
            None
        } else {
            Some(sanitized)
        }
    })
}

fn resolve_media_authenticated_user(
    headers: &HeaderMap,
    query: &MediaTokenQuery,
    auth_state: &local_auth::LocalAuthState,
) -> Option<String> {
    let token = extract_bearer_token(headers).or_else(|| extract_token_from_media_query(query));
    let token_user_id =
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref());
    if token_user_id != "anonymous" {
        return extract_user_id_from_media_query(query)
            .or_else(|| extract_user_id_from_headers(headers))
            .or(Some(token_user_id));
    }
    extract_user_id_from_headers(headers).or_else(|| extract_user_id_from_media_query(query))
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

fn env_flag_enabled(name: &str, default_value: bool) -> bool {
    std::env::var(name)
        .ok()
        .map(|value| {
            let normalized = value.trim().to_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(default_value)
}

fn default_remote_control_allowed() -> bool {
    cfg!(debug_assertions)
}

fn remote_control_boot_enabled() -> bool {
    env_flag_enabled("SQUIRREL_TAURI_REMOTE", cfg!(debug_assertions))
}

fn resolve_remote_control_token() -> Option<String> {
    if !remote_control_boot_enabled() {
        return None;
    }
    let configured = std::env::var("SQUIRREL_TAURI_REMOTE_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    configured.or_else(|| Some(Uuid::new_v4().to_string()))
}

fn extract_remote_control_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-squirrel-remote-token")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn remote_control_bool_from_value(value: &JsonValue) -> Option<bool> {
    match value {
        JsonValue::Bool(flag) => Some(*flag),
        JsonValue::String(text) => {
            let normalized = text.trim().to_lowercase();
            if matches!(normalized.as_str(), "1" | "true" | "yes" | "on" | "allowed") {
                Some(true)
            } else if matches!(normalized.as_str(), "0" | "false" | "no" | "off" | "denied") {
                Some(false)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn profile_remote_control_allowed(profile: &JsonValue) -> Option<bool> {
    let candidates = [
        profile.pointer("/preferences/security/remote_control_allowed"),
        profile.pointer("/preferences/security/remoteControlAllowed"),
        profile.pointer("/preferences/remote_control_allowed"),
        profile.pointer("/preferences/remoteControlAllowed"),
        profile.pointer("/security/remote_control_allowed"),
        profile.pointer("/security/remoteControlAllowed"),
        profile.get("remote_control_allowed"),
        profile.get("remoteControlAllowed"),
    ];
    candidates
        .into_iter()
        .flatten()
        .find_map(remote_control_bool_from_value)
}

fn parse_profile_particle_value(value: &str) -> Option<JsonValue> {
    let parsed: JsonValue = serde_json::from_str(value).ok()?;
    if let JsonValue::String(inner) = parsed {
        serde_json::from_str(inner.trim()).ok()
    } else {
        Some(parsed)
    }
}

fn remote_control_allowed_for_user(state: &AppState, user_id: &str) -> Result<bool, String> {
    let Some(atome_state) = state.atome_state.as_ref() else {
        return Ok(default_remote_control_allowed());
    };
    let db = atome_state
        .db
        .lock()
        .map_err(|error| format!("database lock failed: {error}"))?;

    let state_current_properties = db
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            params![user_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok());

    if let Some(properties) = state_current_properties.as_ref() {
        if let Some(profile) = properties.get("eve_profile") {
            if let Some(allowed) = profile_remote_control_allowed(profile) {
                return Ok(allowed);
            }
        }
        if let Some(allowed) = profile_remote_control_allowed(properties) {
            return Ok(allowed);
        }
    }

    let particle_profile = db
        .query_row(
            "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = 'eve_profile' LIMIT 1",
            params![user_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| parse_profile_particle_value(&raw));

    if let Some(profile) = particle_profile.as_ref() {
        if let Some(allowed) = profile_remote_control_allowed(profile) {
            return Ok(allowed);
        }
    }

    Ok(default_remote_control_allowed())
}

fn require_remote_control(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Option<String>, (StatusCode, Json<JsonValue>)> {
    if !state.remote_control_enabled {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "Tauri remote control is disabled",
        ));
    }
    let expected = state.remote_control_token.as_deref().ok_or_else(|| {
        json_error(
            StatusCode::FORBIDDEN,
            "Tauri remote control token is unavailable",
        )
    })?;
    let provided = extract_remote_control_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Missing remote control token"))?;
    if provided != expected.as_str() {
        return Err(json_error(
            StatusCode::UNAUTHORIZED,
            "Invalid remote control token",
        ));
    }

    let user_id = state
        .auth_state
        .as_ref()
        .and_then(|auth_state| resolve_authenticated_user(headers, auth_state))
        .or_else(|| extract_user_id_from_headers(headers));
    if let Some(user_id) = user_id.as_deref() {
        match remote_control_allowed_for_user(state, user_id) {
            Ok(true) => {}
            Ok(false) => {
                return Err(json_error(
                    StatusCode::FORBIDDEN,
                    "Remote control is disabled for this user profile",
                ));
            }
            Err(error) => {
                return Err(json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Remote control profile check failed: {error}"),
                ));
            }
        }
    }

    Ok(user_id)
}

fn require_auth_user(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, (StatusCode, Json<JsonValue>)> {
    let auth_state = state.auth_state.as_ref().ok_or_else(|| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Auth state not initialized",
        )
    })?;

    resolve_authenticated_user(headers, auth_state)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Unauthorized"))
}

fn require_atome_state(
    state: &AppState,
) -> Result<&local_atome::LocalAtomeState, (StatusCode, Json<JsonValue>)> {
    state.atome_state.as_ref().ok_or_else(|| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Atome state not initialized",
        )
    })
}

fn clean_remote_segment(value: &str, fallback: &str) -> String {
    let sanitized = sanitize_file_name(value.trim());
    if sanitized.is_empty() || sanitized == "upload.bin" {
        fallback.to_string()
    } else {
        sanitized
    }
}

fn remote_default_recording_path(project_root: &Path, session_id: &str) -> PathBuf {
    let safe_session = clean_remote_segment(session_id, "remote_session");
    project_root
        .join("data")
        .join("remote")
        .join("recordings")
        .join(format!("{safe_session}.wav"))
}

fn resolve_remote_audio_path(
    state: &AppState,
    raw_path: Option<&str>,
    fallback_session: Option<&str>,
    must_exist: bool,
) -> Result<PathBuf, String> {
    let project_root = state.project_root.as_ref();
    let Some(raw_path) = raw_path.map(str::trim).filter(|value| !value.is_empty()) else {
        return fallback_session
            .map(|session| remote_default_recording_path(project_root, session))
            .ok_or_else(|| "Missing audio file path".to_string());
    };

    let cleaned = raw_path.trim_start_matches("file://");
    let candidate = PathBuf::from(cleaned);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        if candidate.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err("Remote audio path must stay inside the project".to_string());
        }
        project_root.join(candidate)
    };

    if resolved
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Remote audio path must not contain parent directory segments".to_string());
    }

    let canonical_parent = resolved
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .or_else(|| project_root.canonicalize().ok())
        .unwrap_or_else(|| project_root.to_path_buf());
    let canonical_root = project_root
        .canonicalize()
        .unwrap_or_else(|_| project_root.to_path_buf());
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Remote audio path is outside the project root".to_string());
    }
    if must_exist && !resolved.exists() {
        return Err(format!("Audio file not found: {}", resolved.display()));
    }

    Ok(resolved)
}

fn analyze_wav_file(path: &Path) -> Result<JsonValue, String> {
    let metadata = stdfs::metadata(path)
        .map_err(|error| format!("Unable to read audio file metadata: {error}"))?;
    let mut reader =
        hound::WavReader::open(path).map_err(|error| format!("Unable to open WAV: {error}"))?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels.max(1));
    let sample_rate = spec.sample_rate.max(1);
    let total_samples = reader.duration() as usize;
    let frame_count = total_samples / channels;
    let duration_sec = frame_count as f64 / sample_rate as f64;
    let window_frames = ((sample_rate as f64 * 0.1).round() as usize).max(1);
    let silence_threshold = 0.001_f64;

    let mut sample_count: usize = 0;
    let mut frame_index: usize = 0;
    let mut window_sum_sq = 0.0_f64;
    let mut window_peak = 0.0_f64;
    let mut window_sample_count = 0usize;
    let mut sum_sq = 0.0_f64;
    let mut peak = 0.0_f64;
    let mut non_silent_window_count = 0usize;
    let mut silent_window_count = 0usize;
    let mut first_non_silent_sec: Option<f64> = None;
    let mut last_non_silent_sec: Option<f64> = None;
    let mut windows = Vec::new();

    let push_window = |window_start_frame: usize,
                       window_sample_count: usize,
                       window_sum_sq: f64,
                       window_peak: f64,
                       windows: &mut Vec<JsonValue>,
                       non_silent_window_count: &mut usize,
                       silent_window_count: &mut usize,
                       first_non_silent_sec: &mut Option<f64>,
                       last_non_silent_sec: &mut Option<f64>| {
        if window_sample_count == 0 {
            return;
        }
        let rms = (window_sum_sq / window_sample_count as f64).sqrt();
        let start_sec = window_start_frame as f64 / sample_rate as f64;
        let frames_in_window = (window_sample_count / channels).max(1);
        let end_sec = (window_start_frame + frames_in_window) as f64 / sample_rate as f64;
        let non_silent = rms >= silence_threshold || window_peak >= silence_threshold;
        if non_silent {
            *non_silent_window_count += 1;
            if first_non_silent_sec.is_none() {
                *first_non_silent_sec = Some(start_sec);
            }
            *last_non_silent_sec = Some(end_sec);
        } else {
            *silent_window_count += 1;
        }
        if windows.len() < 240 {
            windows.push(json!({
                "start_sec": start_sec,
                "end_sec": end_sec,
                "rms": rms,
                "peak": window_peak,
                "non_silent": non_silent
            }));
        }
    };

    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let value =
                    sample.map_err(|error| format!("Unable to read float sample: {error}"))? as f64;
                let abs = value.abs();
                peak = peak.max(abs);
                sum_sq += value * value;
                window_peak = window_peak.max(abs);
                window_sum_sq += value * value;
                sample_count += 1;
                window_sample_count += 1;
                if sample_count % channels == 0 {
                    frame_index += 1;
                    if frame_index % window_frames == 0 {
                        let start_frame = frame_index.saturating_sub(window_frames);
                        push_window(
                            start_frame,
                            window_sample_count,
                            window_sum_sq,
                            window_peak,
                            &mut windows,
                            &mut non_silent_window_count,
                            &mut silent_window_count,
                            &mut first_non_silent_sec,
                            &mut last_non_silent_sec,
                        );
                        window_sum_sq = 0.0;
                        window_peak = 0.0;
                        window_sample_count = 0;
                    }
                }
            }
        }
        hound::SampleFormat::Int => {
            let scale =
                ((1_i64 << (u32::from(spec.bits_per_sample).saturating_sub(1))) - 1).max(1) as f64;
            for sample in reader.samples::<i32>() {
                let raw =
                    sample.map_err(|error| format!("Unable to read integer sample: {error}"))?;
                let value = raw as f64 / scale;
                let abs = value.abs();
                peak = peak.max(abs);
                sum_sq += value * value;
                window_peak = window_peak.max(abs);
                window_sum_sq += value * value;
                sample_count += 1;
                window_sample_count += 1;
                if sample_count % channels == 0 {
                    frame_index += 1;
                    if frame_index % window_frames == 0 {
                        let start_frame = frame_index.saturating_sub(window_frames);
                        push_window(
                            start_frame,
                            window_sample_count,
                            window_sum_sq,
                            window_peak,
                            &mut windows,
                            &mut non_silent_window_count,
                            &mut silent_window_count,
                            &mut first_non_silent_sec,
                            &mut last_non_silent_sec,
                        );
                        window_sum_sq = 0.0;
                        window_peak = 0.0;
                        window_sample_count = 0;
                    }
                }
            }
        }
    }

    if window_sample_count > 0 {
        let start_frame = frame_index.saturating_sub(window_sample_count / channels);
        push_window(
            start_frame,
            window_sample_count,
            window_sum_sq,
            window_peak,
            &mut windows,
            &mut non_silent_window_count,
            &mut silent_window_count,
            &mut first_non_silent_sec,
            &mut last_non_silent_sec,
        );
    }

    let rms = if sample_count > 0 {
        (sum_sq / sample_count as f64).sqrt()
    } else {
        0.0
    };

    Ok(json!({
        "path": path.to_string_lossy(),
        "file_size": metadata.len(),
        "sample_rate": spec.sample_rate,
        "channels": spec.channels,
        "bits_per_sample": spec.bits_per_sample,
        "sample_format": format!("{:?}", spec.sample_format),
        "sample_count": sample_count,
        "frame_count": frame_count,
        "duration_sec": duration_sec,
        "rms": rms,
        "peak": peak,
        "silence_threshold": silence_threshold,
        "non_silent_window_count": non_silent_window_count,
        "silent_window_count": silent_window_count,
        "first_non_silent_sec": first_non_silent_sec,
        "last_non_silent_sec": last_non_silent_sec,
        "windows_truncated": frame_count > window_frames * 240,
        "windows": windows
    }))
}

async fn remote_status_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let auth = require_remote_control(&headers, &state);
    let authorized = auth.is_ok();
    let user_id = auth.ok().flatten();
    (
        if authorized {
            StatusCode::OK
        } else {
            StatusCode::UNAUTHORIZED
        },
        Json(json!({
            "success": authorized,
            "runtime": "tauri",
            "enabled": state.remote_control_enabled,
            "token_required": state.remote_control_token.is_some(),
            "user_id": user_id,
            "error": if authorized { JsonValue::Null } else { JsonValue::String("remote_control_unauthorized".to_string()) }
        })),
    )
}

async fn remote_audio_record_start_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioRecordStartRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let session_id = payload
        .session_id
        .or(payload.session_id_camel)
        .map(|value| clean_remote_segment(&value, "remote_session"))
        .unwrap_or_else(|| format!("remote_{}", Uuid::new_v4()));
    let requested_path = payload.file_path.or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(
        &state,
        requested_path.as_deref(),
        Some(&session_id),
        false,
    ) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    let sample_rate = payload
        .sample_rate
        .or(payload.sample_rate_camel)
        .unwrap_or(0);
    let channels = payload.channels.unwrap_or(0);

    crate::audio_engine::metering::reset();
    let path_string = path.to_string_lossy().to_string();
    match crate::audio_engine::recorder::start(&session_id, &path_string, sample_rate, channels) {
        Ok(()) => {
            println!(
                "[TauriRemote] audio record start session={} user={:?} path={} sr={} ch={}",
                session_id, user_id, path_string, sample_rate, channels
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "session_id": session_id,
                "absolute_file_path": path_string,
                "sample_rate_requested": sample_rate,
                "channels_requested": channels,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

async fn remote_audio_record_stop_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioRecordStopRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let session_id = payload
        .session_id
        .or(payload.session_id_camel)
        .map(|value| clean_remote_segment(&value, "remote_session"))
        .unwrap_or_else(|| "remote_session".to_string());
    match crate::audio_engine::recorder::stop(&session_id) {
        Ok(result) => {
            let analysis = analyze_wav_file(Path::new(&result.file_path))
                .unwrap_or_else(|error| json!({ "success": false, "error": error }));
            println!(
                "[TauriRemote] audio record stop session={} user={:?} path={} duration={} frames={}",
                result.session_id, user_id, result.file_path, result.duration_sec, result.frame_count
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "session_id": result.session_id,
                "absolute_file_path": result.file_path,
                "duration_sec": result.duration_sec,
                "frame_count": result.frame_count,
                "sample_rate": result.sample_rate,
                "channels": result.channels,
                "output_format": result.output_format,
                "analysis": analysis,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

async fn remote_audio_analyze_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioAnalyzeRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let requested_path = payload
        .absolute_file_path
        .or(payload.absolute_file_path_camel)
        .or(payload.file_path)
        .or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(&state, requested_path.as_deref(), None, true) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    match analyze_wav_file(&path) {
        Ok(analysis) => Json(json!({
            "success": true,
            "runtime": "tauri",
            "analysis": analysis,
            "user_id": user_id
        }))
        .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

async fn remote_audio_playback_load_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackLoadRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| format!("remote_clip_{}", Uuid::new_v4()));
    let requested_path = payload
        .absolute_file_path
        .or(payload.absolute_file_path_camel)
        .or(payload.file_path)
        .or(payload.file_path_camel);
    let path = match resolve_remote_audio_path(&state, requested_path.as_deref(), None, true) {
        Ok(path) => path,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error).into_response(),
    };
    let path_string = path.to_string_lossy().to_string();
    if let Err(error) = crate::audio_engine::playback::init() {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response();
    }
    match crate::audio_engine::playback::load_clip(&id, &path_string) {
        Ok(metadata) => {
            println!(
                "[TauriRemote] audio playback load id={} user={:?} path={} duration={}s",
                id, user_id, path_string, metadata.duration_seconds
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "id": id,
                "absolute_file_path": path_string,
                "metadata": {
                    "sample_rate": metadata.sample_rate,
                    "frame_count": metadata.frame_count,
                    "duration_seconds": metadata.duration_seconds
                },
                "sample_rate": metadata.sample_rate,
                "frame_count": metadata.frame_count,
                "duration_seconds": metadata.duration_seconds,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

async fn remote_audio_playback_play_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackPlayRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| "remote_clip".to_string());
    let voice_id = payload
        .voice_id
        .or(payload.voice_id_camel)
        .map(|value| clean_remote_segment(&value, &id))
        .unwrap_or_else(|| id.clone());
    let start_seconds = payload
        .start_seconds
        .or(payload.start_seconds_camel)
        .unwrap_or(0.0);
    let duration_seconds = payload.duration_seconds.or(payload.duration_seconds_camel);
    let gain = payload.gain.unwrap_or(1.0);
    let rate = payload.rate.unwrap_or(1.0);
    match crate::audio_engine::playback::play_instance(
        &id,
        &voice_id,
        start_seconds,
        duration_seconds,
        gain,
        rate,
        None,
        None,
    ) {
        Ok(()) => {
            println!(
                "[TauriRemote] audio playback play id={} voice={} user={:?} start={} duration={:?}",
                id, voice_id, user_id, start_seconds, duration_seconds
            );
            Json(json!({
                "success": true,
                "runtime": "tauri",
                "id": id,
                "voice_id": voice_id,
                "start_seconds": start_seconds,
                "duration_seconds": duration_seconds,
                "gain": gain,
                "rate": rate,
                "user_id": user_id
            }))
            .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
}

async fn remote_audio_playback_stop_handler(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RemoteAudioPlaybackStopRequest>,
) -> impl IntoResponse {
    let user_id = match require_remote_control(&headers, &state) {
        Ok(user_id) => user_id,
        Err(error) => return error.into_response(),
    };
    let id = payload
        .id
        .map(|value| clean_remote_segment(&value, "remote_clip"))
        .unwrap_or_else(|| "remote_clip".to_string());
    let voice_id = payload
        .voice_id
        .or(payload.voice_id_camel)
        .map(|value| clean_remote_segment(&value, &id))
        .unwrap_or_else(|| id.clone());
    match crate::audio_engine::playback::stop_instance(&voice_id) {
        Ok(()) => Json(json!({
            "success": true,
            "runtime": "tauri",
            "id": id,
            "voice_id": voice_id,
            "user_id": user_id
        }))
        .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error).into_response(),
    }
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
        return (
            StatusCode::OK,
            Json(json!({ "success": true, "event": event })),
        );
    }
    if let Some(events) = data.get("events") {
        return (
            StatusCode::OK,
            Json(json!({ "success": true, "events": events })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({ "success": true, "data": data })),
    )
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
        return (
            StatusCode::OK,
            Json(json!({ "success": true, "state": state })),
        );
    }
    if let Some(states) = data.get("states") {
        return (
            StatusCode::OK,
            Json(json!({ "success": true, "states": states })),
        );
    }
    (
        StatusCode::OK,
        Json(json!({ "success": true, "data": data })),
    )
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

fn redact_sensitive_query_params(uri: &str) -> String {
    let Some((path, query)) = uri.split_once('?') else {
        return uri.to_string();
    };
    let sanitized_query = query
        .split('&')
        .map(|part| {
            let key = part.split_once('=').map(|(key, _)| key).unwrap_or(part);
            if matches!(
                key,
                "access_token" | "auth_token" | "token" | "media_user_id" | "user_id" | "userId" | "x_user_id" | "x_userid"
            ) {
                format!("{key}=<redacted>")
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&");
    format!("{path}?{sanitized_query}")
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
    let uri = redact_sensitive_query_params(&req.uri().to_string());
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

fn load_eve_version(static_dir: &Path) -> String {
    let mut candidates = Vec::new();
    candidates.push(PathBuf::from("eVe/version.txt"));
    if let Some(parent) = static_dir.parent() {
        candidates.push(parent.join("eVe").join("version.txt"));
    }
    if let Ok(canon) = stdfs::canonicalize(static_dir) {
        if let Some(parent) = canon.parent() {
            candidates.push(parent.join("eVe").join("version.txt"));
        }
    }

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
        "atomeVersion": state.version.as_str(),
        "eveVersion": state.eve_version.as_str(),
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

async fn eve_mail_sync_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailSyncRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "initial": payload.initial.unwrap_or(false),
        "mailbox": payload.mailbox,
        "limit": payload.limit.unwrap_or(20),
        "unread_only": payload.unread_only.unwrap_or(false),
        "credentials": payload.credentials.unwrap_or_else(|| json!(null))
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_sync_invalid_json:{}:{}", error, stdout))
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_sync_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_sync_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_sync_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

async fn eve_mail_send_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailSendRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "send",
        "draft": payload.draft.unwrap_or_else(|| json!(null)),
        "confirmed": payload.confirmed.unwrap_or(true),
        "credentials": payload.credentials.unwrap_or_else(|| json!(null))
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_send_invalid_json:{}:{}", error, stdout))
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_send_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_send_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_send_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

async fn eve_mail_mark_read_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMarkReadRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "mark_read",
        "message": payload.message.unwrap_or_else(|| json!(null)),
        "read": payload.read.unwrap_or(true),
        "credentials": payload.credentials.unwrap_or_else(|| json!(null))
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_mark_read_invalid_json:{}:{}", error, stdout))
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_mark_read_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_mark_read_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_mark_read_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

async fn eve_mail_archive_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMessageActionRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "archive",
        "message": payload.message.unwrap_or_else(|| json!(null)),
        "remote_mailbox": payload.remote_mailbox.unwrap_or_else(|| "Archive".to_string()),
        "credentials": payload.credentials.unwrap_or_else(|| json!(null))
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_archive_invalid_json:{}:{}", error, stdout))
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_archive_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_archive_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_archive_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

async fn eve_mail_delete_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMessageActionRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "delete",
        "message": payload.message.unwrap_or_else(|| json!(null)),
        "remote_mailbox": payload.remote_mailbox.unwrap_or_else(|| "Trash".to_string()),
        "credentials": payload.credentials.unwrap_or_else(|| json!(null))
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_delete_invalid_json:{}:{}", error, stdout))
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_delete_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_delete_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_delete_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

/// Debug log handler - receives logs from frontend to survive page reloads
async fn debug_log_handler(Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let _ = payload;

    Json(json!({ "success": true }))
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

fn ai_proxy_timeout_ms(value: Option<u64>) -> u64 {
    let requested = value.unwrap_or(20_000);
    requested.clamp(1_000, 120_000)
}

fn is_allowed_ai_proxy_endpoint(endpoint: &str) -> bool {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return false;
    }
    let parsed = match reqwest::Url::parse(trimmed) {
        Ok(url) => url,
        Err(_) => return false,
    };
    match parsed.scheme() {
        "https" => true,
        "http" => matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost")),
        _ => false,
    }
}

fn provider_response_text(value: &JsonValue, provider_type: &str) -> String {
    match provider_type {
        "anthropic" => value
            .get("content")
            .and_then(|entry| entry.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        "google" => value
            .get("candidates")
            .and_then(|entry| entry.as_array())
            .and_then(|candidates| candidates.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        _ => value
            .get("choices")
            .and_then(|entry| entry.as_array())
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(|content| content.as_str())
            .unwrap_or_default()
            .to_string(),
    }
}

fn provider_response_usage(value: &JsonValue, provider_type: &str) -> JsonValue {
    match provider_type {
        "anthropic" => json!({
            "prompt_tokens": value.get("usage").and_then(|usage| usage.get("input_tokens")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "completion_tokens": value.get("usage").and_then(|usage| usage.get("output_tokens")).and_then(|entry| entry.as_u64()).unwrap_or(0),
        }),
        "google" => json!({
            "prompt_tokens": value.get("usageMetadata").and_then(|usage| usage.get("promptTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "completion_tokens": value.get("usageMetadata").and_then(|usage| usage.get("candidatesTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "total_tokens": value.get("usageMetadata").and_then(|usage| usage.get("totalTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
        }),
        _ => value.get("usage").cloned().unwrap_or_else(|| json!({})),
    }
}

async fn eve_ai_provider_completion_handler(
    Json(payload): Json<AiProviderCompletionRequest>,
) -> impl IntoResponse {
    let provider_id = payload.provider_id.unwrap_or_default();
    let provider_type = payload.provider_type.unwrap_or_default();
    let completion_endpoint = payload.completion_endpoint.unwrap_or_default();
    let model = payload.model.unwrap_or_default();
    let prompt = payload.prompt.unwrap_or_default();
    let system_prompt = payload.system_prompt.unwrap_or_default();
    let api_key = payload.api_key.unwrap_or_default();

    if provider_type.trim().is_empty()
        || completion_endpoint.trim().is_empty()
        || api_key.trim().is_empty()
    {
        return json_error(StatusCode::BAD_REQUEST, "Missing AI provider fields").into_response();
    }

    if !is_allowed_ai_proxy_endpoint(&completion_endpoint) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "AI provider endpoint is not allowed",
        )
        .into_response();
    }

    let timeout_ms = ai_proxy_timeout_ms(payload.timeout_ms);
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to create AI proxy client: {}", err),
            )
            .into_response();
        }
    };

    let upstream_request = match provider_type.trim() {
        "openai" => client
            .post(completion_endpoint.clone())
            .bearer_auth(api_key.clone())
            .json(&json!({
                "model": model,
                "temperature": 0.2,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": prompt }
                ]
            })),
        "anthropic" => client
            .post(completion_endpoint.clone())
            .header("x-api-key", api_key.clone())
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": model,
                "max_tokens": 2048,
                "system": system_prompt,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            })),
        "google" => {
            let url = format!(
                "{}/{}:generateContent?key={}",
                completion_endpoint.trim_end_matches('/'),
                urlencoding::encode(&model),
                urlencoding::encode(&api_key)
            );
            client.post(url).json(&json!({
                "systemInstruction": {
                    "parts": [{ "text": system_prompt }]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{ "text": prompt }]
                    }
                ]
            }))
        }
        _ => {
            return json_error(StatusCode::BAD_REQUEST, "Unsupported AI provider type")
                .into_response();
        }
    };

    let upstream = match upstream_request.send().await {
        Ok(response) => response,
        Err(err) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!("AI proxy request failed: {}", err),
            )
            .into_response();
        }
    };

    if !upstream.status().is_success() {
        let status =
            StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let content_type = upstream
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string())
            .unwrap_or_else(|| "application/json".to_string());
        let body = upstream.text().await.unwrap_or_else(|_| String::new());
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(body))
            .unwrap_or_else(|_| {
                json_error(
                    StatusCode::BAD_GATEWAY,
                    "AI proxy upstream error forwarding failed",
                )
                .into_response()
            });
    }

    let payload_value: JsonValue = match upstream.json().await {
        Ok(value) => value,
        Err(err) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!("AI proxy invalid upstream JSON: {}", err),
            )
            .into_response();
        }
    };

    let response_text = provider_response_text(&payload_value, provider_type.trim());
    let usage = provider_response_usage(&payload_value, provider_type.trim());

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "provider_id": provider_id,
            "provider_type": provider_type,
            "text": response_text,
            "usage": usage,
            "raw": payload_value
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
        local_atome::handle_events_message(JsonValue::Object(payload), &user_id, atome_state).await;
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
        local_atome::handle_events_message(JsonValue::Object(payload), &user_id, atome_state).await;
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
    let response = local_atome::handle_state_current_message(message, &user_id, atome_state).await;
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

    let response = local_atome::handle_state_current_message(
        JsonValue::Object(payload),
        &user_id,
        atome_state,
    )
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

    let mut stored_file_name = file_name;
    let mut stored_file_path = file_path;
    let mut converted_from: Option<String> = None;
    if should_serve_webm_video_as_mp4(&stored_file_name) {
        let output_name = replace_file_extension(&stored_file_name, "mp4");
        let output_path = stored_file_path.with_file_name(&output_name);
        if let Err(error) = transcode_video_to_mp4(&stored_file_path, &output_path).await {
            let _ = fs::remove_file(&stored_file_path).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": error })),
            );
        }
        if let Err(error) = fs::remove_file(&stored_file_path).await {
            eprintln!(
                "Erreur suppression source WebM après transcodage {:?}: {}",
                stored_file_path, error
            );
        }
        converted_from = Some(stored_file_name);
        stored_file_name = output_name;
        stored_file_path = output_path;
    }

    let rel_path = stored_file_path
        .strip_prefix(&*state.project_root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| stored_file_path.to_string_lossy().replace('\\', "/"));
    let size = fs::metadata(&stored_file_path)
        .await
        .ok()
        .map(|metadata| metadata.len())
        .unwrap_or(body.len() as u64);
    let stored_mime_type = guess_mime_from_ext(&stored_file_name);

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": stored_file_name,
            "owner": user_id,
            "path": rel_path,
            "mime_type": stored_mime_type,
            "size": size,
            "converted_from": converted_from
        })),
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
    let mime_type = headers
        .get("x-mime-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_string();

    let user_id = match require_auth_user(&headers, &state) {
        Ok(user_id) => user_id,
        Err(response) => return response,
    };

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

    let mut stored_name = safe_name.clone();
    let mut stored_path = file_path;
    let mut stored_mime_type = if mime_type.is_empty() {
        guess_mime_from_ext(&safe_name).to_string()
    } else {
        mime_type.clone()
    };
    let mut converted_from: Option<String> = None;

    if should_transcode_recording_upload_to_mp4(&safe_name, &stored_mime_type) {
        let output_name = replace_file_extension(&safe_name, "mp4");
        let output_path = recordings_dir.join(&output_name);
        if let Err(error) = transcode_video_to_mp4(&stored_path, &output_path).await {
            let _ = fs::remove_file(&stored_path).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": error })),
            );
        }
        if let Err(error) = fs::remove_file(&stored_path).await {
            eprintln!(
                "Erreur suppression source WebM après transcodage {:?}: {}",
                stored_path, error
            );
        }
        converted_from = Some(stored_name);
        stored_name = output_name;
        stored_path = output_path;
        stored_mime_type = "video/mp4".to_string();
    }

    let size = fs::metadata(&stored_path)
        .await
        .ok()
        .map(|metadata| metadata.len())
        .unwrap_or(body.len() as u64);
    let rel_path = format!("data/users/{}/recordings/{}", user_id, stored_name);
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "file": stored_name,
            "path": rel_path,
            "owner": user_id,
            "mime_type": stored_mime_type,
            "size": size,
            "converted_from": converted_from
        })),
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

/// Serve bytes with optional HTTP Range support.
/// WKWebView <video> elements require Accept-Ranges for proper playback.
fn serve_bytes_with_range(
    bytes: Vec<u8>,
    content_type: &'static str,
    etag: &str,
    request_headers: &HeaderMap,
    disposition: &str,
) -> axum::response::Response {
    let total = bytes.len();

    let range_header = request_headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            let trimmed = v.trim();
            if trimmed.starts_with("bytes=") {
                let spec = &trimmed[6..];
                let parts: Vec<&str> = spec.splitn(2, '-').collect();
                if parts.len() == 2 {
                    let start = parts[0].parse::<usize>().ok();
                    let end_raw = parts[1].trim();
                    let end = if end_raw.is_empty() {
                        None
                    } else {
                        end_raw.parse::<usize>().ok()
                    };
                    Some((start, end))
                } else {
                    None
                }
            } else {
                None
            }
        });

    if let Some((range_start_opt, range_end_opt)) = range_header {
        let start = range_start_opt.unwrap_or(0).min(total);
        let end = range_end_opt.map(|e| (e + 1).min(total)).unwrap_or(total);
        if start >= end || start >= total {
            let mut h = HeaderMap::new();
            if let Ok(cr) = HeaderValue::from_str(&format!("bytes */{}", total)) {
                h.insert(header::CONTENT_RANGE, cr);
            }
            return (StatusCode::RANGE_NOT_SATISFIABLE, h).into_response();
        }
        let slice = bytes[start..end].to_vec();
        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end - 1, total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        if let Ok(cl) = HeaderValue::from_str(&slice.len().to_string()) {
            h.insert(header::CONTENT_LENGTH, cl);
        }
        if let Ok(hv) = HeaderValue::from_str(etag) {
            h.insert(header::ETAG, hv);
        }
        h.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return (StatusCode::PARTIAL_CONTENT, h, slice).into_response();
    }

    let mut h = HeaderMap::new();
    h.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=300"),
    );
    if let Ok(hv) = HeaderValue::from_str(etag) {
        h.insert(header::ETAG, hv);
    }
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if !disposition.is_empty() {
        if let Ok(dv) = HeaderValue::from_str(disposition) {
            h.insert(header::CONTENT_DISPOSITION, dv);
        }
    }
    if let Ok(cl) = HeaderValue::from_str(&total.to_string()) {
        h.insert(header::CONTENT_LENGTH, cl);
    }
    (StatusCode::OK, h, bytes).into_response()
}

fn parse_http_range(
    request_headers: &HeaderMap,
    total: usize,
) -> Option<Result<(usize, usize), HeaderMap>> {
    let range_header = request_headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())?
        .trim()
        .to_string();
    if !range_header.starts_with("bytes=") {
        return None;
    }
    let spec = &range_header[6..];
    let parts: Vec<&str> = spec.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }
    let start = parts[0].parse::<usize>().ok().unwrap_or(0).min(total);
    let end_raw = parts[1].trim();
    let end = if end_raw.is_empty() {
        total
    } else {
        end_raw
            .parse::<usize>()
            .ok()
            .map(|value| (value + 1).min(total))
            .unwrap_or(total)
    };
    if start >= end || start >= total {
        let mut h = HeaderMap::new();
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes */{}", total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        return Some(Err(h));
    }
    Some(Ok((start, end)))
}

async fn serve_file_with_range(
    file_path: &Path,
    content_type: &'static str,
    etag: &str,
    request_headers: &HeaderMap,
    disposition: &str,
) -> Result<axum::response::Response, std::io::Error> {
    let metadata = fs::metadata(file_path).await?;
    let total = metadata.len() as usize;
    if let Some(range) = parse_http_range(request_headers, total) {
        let (start, end) = match range {
            Ok(range) => range,
            Err(headers) => return Ok((StatusCode::RANGE_NOT_SATISFIABLE, headers).into_response()),
        };
        let mut file = fs::File::open(file_path).await?;
        file.seek(std::io::SeekFrom::Start(start as u64)).await?;
        let mut slice = vec![0; end - start];
        file.read_exact(&mut slice).await?;

        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        if let Ok(cr) = HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end - 1, total)) {
            h.insert(header::CONTENT_RANGE, cr);
        }
        if let Ok(cl) = HeaderValue::from_str(&slice.len().to_string()) {
            h.insert(header::CONTENT_LENGTH, cl);
        }
        if let Ok(hv) = HeaderValue::from_str(etag) {
            h.insert(header::ETAG, hv);
        }
        h.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=300"),
        );
        return Ok((StatusCode::PARTIAL_CONTENT, h, slice).into_response());
    }

    let bytes = fs::read(file_path).await?;
    Ok(serve_bytes_with_range(
        bytes,
        content_type,
        etag,
        request_headers,
        disposition,
    ))
}

async fn download_upload_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
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

    let user_id =
        if let Some(value) = resolve_media_authenticated_user(&headers, &query, auth_state) {
            value
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

    if let Err(err) = fs::metadata(&file_path).await {
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

    let (served_path, content_type, served_name) =
        match resolve_playback_media_file(&file_path, &safe_name).await {
            Ok(value) => value,
            Err(err) => {
                if verbose_logs {
                    println!(
                        "[download_upload_handler] ❌ Playback media resolution failed: {:?}, error: {}",
                        file_path, err
                    );
                }
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": err })),
                )
                    .into_response();
            }
        };

    let metadata = match fs::metadata(&served_path).await {
        Ok(value) => value,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": format!("Playback file missing: {err}") })),
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

    match serve_file_with_range(
        &served_path,
        content_type,
        &etag_value,
        &headers,
        &format!("inline; filename=\"{}\"", served_name),
    )
    .await
    {
        Ok(response) => {
            if verbose_logs {
                println!("[download_upload_handler] ✅ Serving file: {:?}", served_path);
            }
            response
        }
        Err(err) => {
            if verbose_logs {
                println!(
                    "[download_upload_handler] ❌ File not found: {:?}, error: {}",
                    served_path, err
                );
            }
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": served_path.to_string_lossy() })),
            )
                .into_response()
        }
    }
}

async fn extract_audio_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
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

    let user_id =
        if let Some(value) = resolve_media_authenticated_user(&headers, &query, auth_state) {
            value
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
    let recordings_dir =
        match resolve_user_storage_dir(&state, &user_id, LocalStorageRoot::Recordings).await {
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
    let recordings_path = recordings_dir.join(&safe_name);
    let downloads_path = downloads_dir.join(&safe_name);
    let (source_path, source_dir) = if fs::metadata(&recordings_path).await.is_ok() {
        (recordings_path, recordings_dir)
    } else if fs::metadata(&downloads_path).await.is_ok() {
        (downloads_path, downloads_dir)
    } else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({
                "success": false,
                "error": "Source file not found",
                "recordings_path": recordings_path.to_string_lossy(),
                "downloads_path": downloads_path.to_string_lossy()
            })),
        )
            .into_response();
    };

    let extension = Path::new(&safe_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(
        extension.as_str(),
        "mov" | "m4v" | "mp4" | "avi" | "mkv" | "webm"
    ) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Not a video file" })),
        )
            .into_response();
    }

    let cache_dir = source_dir.join(".audio_cache");
    if let Err(err) = fs::create_dir_all(&cache_dir).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": format!("Unable to create audio cache: {err}") })),
        )
            .into_response();
    }

    let base_name = Path::new(&safe_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| safe_name.clone());
    let cached_audio = cache_dir.join(format!("{}.aac.m4a", base_name));

    if fs::metadata(&cached_audio).await.is_err() {
        let source_path_for_ffmpeg = source_path.clone();
        let cached_audio_for_ffmpeg = cached_audio.clone();
        let extract_result = tokio::task::spawn_blocking(move || {
            let output = Command::new("ffmpeg")
                .arg("-v")
                .arg("error")
                .arg("-y")
                .arg("-i")
                .arg(&source_path_for_ffmpeg)
                .arg("-vn")
                .arg("-map")
                .arg("0:a:0")
                .arg("-c:a")
                .arg("aac")
                .arg("-b:a")
                .arg("192k")
                .arg("-ac")
                .arg("2")
                .arg("-ar")
                .arg("48000")
                .arg("-movflags")
                .arg("+faststart")
                .arg(&cached_audio_for_ffmpeg)
                .output()
                .map_err(|err| format!("ffmpeg_extract_failed: {err}"))?;
            if output.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!(
                "ffmpeg_extract_failed: {}",
                stderr.trim().chars().take(240).collect::<String>()
            ))
        })
        .await
        .map_err(|err| format!("ffmpeg_task_failed: {err}"))
        .and_then(|inner| inner);

        if let Err(err) = extract_result {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": err })),
            )
                .into_response();
        }
    } else {
    }

    let metadata = match fs::metadata(&cached_audio).await {
        Ok(value) => value,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "success": false, "error": format!("Extracted audio missing: {err}") }),
                ),
            )
                .into_response();
        }
    };
    let modified_epoch = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let etag_value = format!("W/\"{}-{}\"", metadata.len(), modified_epoch);

    match serve_file_with_range(
        &cached_audio,
        "audio/mp4",
        &etag_value,
        &headers,
        &format!("inline; filename=\"{}.aac.m4a\"", base_name),
    )
    .await
    {
        Ok(response) => response,
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": format!("Unable to serve extracted audio: {err}") })),
        )
            .into_response(),
    }
}

async fn download_recording_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MediaTokenQuery>,
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

    let user_id =
        if let Some(value) = resolve_media_authenticated_user(&headers, &query, auth_state) {
            value
        } else {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "success": false, "error": "Unauthorized" })),
            )
                .into_response();
        };

    // First, try to find the file directly in the user's recordings directory (like downloads)
    // This handles recordings synced from Fastify that may not be in the local DB
    let recordings_dir =
        match resolve_user_storage_dir(&state, &user_id, LocalStorageRoot::Recordings).await {
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
        let (served_path, content_type, served_name) =
            match resolve_playback_media_file(&direct_path, &safe_name).await {
                Ok(value) => value,
                Err(err) => {
                    println!("[download_recording_handler] Playback media resolution failed: {}", err);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": err })),
                    )
                        .into_response();
                }
            };
        let disposition = format!("inline; filename=\"{}\"", served_name);
        match serve_file_with_range(&served_path, content_type, "", &headers, &disposition).await {
            Ok(response) => {
                println!(
                    "[download_recording_handler] ✅ Serving recording (direct): {:?}",
                    served_path
                );
                return response;
            }
            Err(err) => {
                println!("[download_recording_handler] Direct read failed: {}", err);
                // Fall through to the canonical recording metadata lookup.
            }
        }
    }

    // Secondary: find the canonical persisted recording metadata.
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

        // Recording binaries must remain retrievable by id even when the atome is soft-deleted.
        // Soft-delete hides it from normal lists, but linked media atomes can still reference it.
        let owner_id: Option<String> = match db.query_row(
        "SELECT owner_id FROM atomes WHERE atome_id = ?1 AND atome_type IN ('audio_recording', 'video_recording')",
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
                println!(
                    "[download_recording_handler] Owner mismatch denied: owner={}, user={}",
                    id, user_id
                );
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Recording access denied" })),
                )
                    .into_response();
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

    let target_name = Path::new(&rel)
        .file_name()
        .and_then(|value| value.to_str())
        .map(sanitize_file_name)
        .unwrap_or_else(|| sanitize_file_name(&rel));
    let (served_path, content_type, served_name) =
        match resolve_playback_media_file(&target_path, &target_name).await {
            Ok(value) => value,
            Err(err) => {
                println!(
                    "[download_recording_handler] ❌ Playback media resolution failed: {:?}, error: {}",
                    target_path, err
                );
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": err })),
                )
                    .into_response();
            }
        };
    let disposition = format!("inline; filename=\"{}\"", served_name);
    match serve_file_with_range(&served_path, content_type, "", &headers, &disposition).await {
        Ok(response) => {
            println!(
                "[download_recording_handler] ✅ Serving recording: {:?}",
                served_path
            );
            response
        }
        Err(err) => {
            println!(
                "[download_recording_handler] ❌ File not found: {:?}, error: {}",
                served_path, err
            );
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "File not found", "path": served_path.to_string_lossy() })),
            )
                .into_response();
        }
    }
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
        "atome/security",
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
        "atome/security",
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

        // Only process files that are exactly in the configured extract_path folder.
        // For the default "src/" path, this excludes sibling roots such as "src-tauri/".
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

fn json_string_field(data: &JsonValue, key: &str) -> Option<String> {
    data.get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn json_number_field(data: &JsonValue, key: &str) -> Option<i64> {
    data.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_str().and_then(|raw| raw.trim().parse::<i64>().ok()))
    })
}

fn ws_file_response(request_id: Option<String>, payload: JsonValue) -> JsonValue {
    let mut response = JsonMap::new();
    response.insert("type".to_string(), json!("file-response"));
    if let Some(id) = request_id {
        response.insert("requestId".to_string(), json!(id.clone()));
        response.insert("request_id".to_string(), json!(id));
    }
    if let Some(map) = payload.as_object() {
        for (key, value) in map {
            response.insert(key.clone(), value.clone());
        }
    }
    JsonValue::Object(response)
}

fn resolve_ws_file_user_id(data: &JsonValue, state: &AppState) -> Result<String, String> {
    let explicit_user = json_string_field(data, "user_id")
        .or_else(|| json_string_field(data, "userId"))
        .or_else(|| json_string_field(data, "owner_id"))
        .map(|value| sanitize_user_segment(&value))
        .filter(|value| value != "anonymous");

    let token_user = state.auth_state.as_ref().map(|auth_state| {
        let token = json_string_field(data, "token");
        local_auth::extract_user_id_from_token(&auth_state.jwt_secret, token.as_deref())
    });

    if let Some(user_id) = explicit_user {
        return Ok(user_id);
    }
    if let Some(user_id) = token_user.filter(|value| value != "anonymous") {
        return Ok(user_id);
    }
    Err("Unauthorized".to_string())
}

async fn resolve_ws_upload_target(
    state: &AppState,
    user_id: &str,
    raw_file_name: &str,
    raw_file_path: &str,
) -> Result<(String, PathBuf, String), String> {
    if !raw_file_path.trim().is_empty() {
        let (root, relative) = normalize_local_relative_path(raw_file_path, user_id)
            .ok_or_else(|| "Invalid file path".to_string())?;
        if relative.trim().is_empty() {
            return Err("Missing file path".to_string());
        }
        let base_dir = resolve_user_storage_dir(state, user_id, root)
            .await
            .map_err(|err| err.to_string())?;
        let file_path = base_dir.join(&relative);
        let file_name = file_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string();
        let relative_path = match root {
            LocalStorageRoot::Downloads => format!("Downloads/{}", relative),
            LocalStorageRoot::Recordings => format!("recordings/{}", relative),
        };
        return Ok((file_name, file_path, relative_path));
    }

    let (file_name, file_path) = resolve_user_upload_path(state, user_id, raw_file_name)
        .await
        .map_err(|err| err.to_string())?;
    Ok((
        file_name.clone(),
        file_path,
        format!("Downloads/{}", file_name),
    ))
}

async fn handle_ws_file_message(data: JsonValue, state: &AppState) -> JsonValue {
    let request_id =
        json_string_field(&data, "requestId").or_else(|| json_string_field(&data, "request_id"));
    let action = json_string_field(&data, "action").unwrap_or_default();
    let user_id = match resolve_ws_file_user_id(&data, state) {
        Ok(value) => value,
        Err(error) => {
            return ws_file_response(request_id, json!({ "success": false, "error": error }));
        }
    };

    if action == "upload-chunk" {
        let upload_id = match json_string_field(&data, "upload_id")
            .or_else(|| json_string_field(&data, "uploadId"))
            .and_then(|value| sanitize_upload_id(&value))
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Missing or invalid uploadId" }),
                );
            }
        };
        let chunk_index = match json_number_field(&data, "chunk_index")
            .or_else(|| json_number_field(&data, "chunkIndex"))
            .filter(|value| *value >= 0)
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Invalid chunk index" }),
                );
            }
        };
        let chunk_count = json_number_field(&data, "chunk_count")
            .or_else(|| json_number_field(&data, "chunkCount"))
            .unwrap_or(0);
        let Some(chunk_base64) = json_string_field(&data, "chunk_base64")
            .or_else(|| json_string_field(&data, "chunkBase64"))
            .or_else(|| json_string_field(&data, "chunk"))
        else {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": "Missing chunk data" }),
            );
        };
        let bytes = match general_purpose::STANDARD.decode(chunk_base64.as_bytes()) {
            Ok(value) => value,
            Err(error) => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        };
        let upload_dir = state
            .project_root
            .join("data")
            .join("uploads_tmp")
            .join(&upload_id);
        if let Err(error) = fs::create_dir_all(&upload_dir).await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        let chunk_path = upload_dir.join(format!("{}.part", chunk_index));
        if let Err(error) = fs::write(&chunk_path, &bytes).await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        return ws_file_response(
            request_id,
            json!({
                "success": true,
                "action": action,
                "upload_id": upload_id,
                "chunk_index": chunk_index,
                "chunk_count": chunk_count,
                "size_bytes": bytes.len()
            }),
        );
    }

    if action == "upload-complete" {
        let upload_id = match json_string_field(&data, "upload_id")
            .or_else(|| json_string_field(&data, "uploadId"))
            .and_then(|value| sanitize_upload_id(&value))
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Missing or invalid uploadId" }),
                );
            }
        };
        let chunk_count = match json_number_field(&data, "chunk_count")
            .or_else(|| json_number_field(&data, "chunkCount"))
            .filter(|value| *value >= 0)
        {
            Some(value) => value,
            None => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": "Invalid chunk count" }),
                );
            }
        };
        let raw_file_name = json_string_field(&data, "file_name")
            .or_else(|| json_string_field(&data, "fileName"))
            .unwrap_or_else(|| "upload.bin".to_string());
        let raw_file_path = json_string_field(&data, "file_path")
            .or_else(|| json_string_field(&data, "filePath"))
            .unwrap_or_default();

        let (file_name, file_path, relative_path) =
            match resolve_ws_upload_target(state, &user_id, &raw_file_name, &raw_file_path).await {
                Ok(value) => value,
                Err(error) => {
                    return ws_file_response(
                        request_id,
                        json!({ "success": false, "error": error }),
                    );
                }
            };

        if let Some(parent) = file_path.parent() {
            if let Err(error) = fs::create_dir_all(parent).await {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        }

        let upload_dir = state
            .project_root
            .join("data")
            .join("uploads_tmp")
            .join(&upload_id);
        let mut output = match fs::File::create(&file_path).await {
            Ok(file) => file,
            Err(error) => {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        };
        for idx in 0..chunk_count {
            let chunk_path = upload_dir.join(format!("{}.part", idx));
            let chunk = match fs::read(&chunk_path).await {
                Ok(value) => value,
                Err(error) => {
                    return ws_file_response(
                        request_id,
                        json!({ "success": false, "error": error.to_string() }),
                    );
                }
            };
            if let Err(error) = output.write_all(&chunk).await {
                return ws_file_response(
                    request_id,
                    json!({ "success": false, "error": error.to_string() }),
                );
            }
        }
        if let Err(error) = output.flush().await {
            return ws_file_response(
                request_id,
                json!({ "success": false, "error": error.to_string() }),
            );
        }
        let _ = fs::remove_dir_all(&upload_dir).await;
        return ws_file_response(
            request_id,
            json!({
                "success": true,
                "action": action,
                "file_name": file_name,
                "owner_id": user_id,
                "file_path": relative_path,
                "path": format!("data/users/{}/{}", user_id, relative_path)
            }),
        );
    }

    ws_file_response(
        request_id,
        json!({ "success": false, "error": format!("Unknown file action: {}", action) }),
    )
}

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
                            // Secondary to userId from message (insecure, only for dev)
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

                if msg_type == "file" {
                    let response = handle_ws_file_message(data, &state).await;
                    let _ = socket.send(Message::Text(response.to_string())).await;
                    continue;
                }

                // Handle previous API requests (for backward compatibility)
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
async fn ws_sync_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
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

                        // Handle heartbeat (previous)
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

                        // Echo other messages for now (previous ack)
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
    let static_dir_abs = base_dir.canonicalize().unwrap_or_else(|_| base_dir.clone());
    let project_root = static_dir_abs
        .parent()
        .unwrap_or(&static_dir_abs)
        .to_path_buf();

    let serve_dir_root = ServeDir::new(base_dir.clone()).append_index_html_on_directories(true);
    let root_service = get_service(serve_dir_root).handle_error(|error| async move {
        println!("Erreur serveur statique: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur serveur",
        )
    });

    let serve_dir_src = ServeDir::new(base_dir.clone());
    let src_service = get_service(serve_dir_src).handle_error(|error| async move {
        println!("Erreur /src: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur src",
        )
    });

    let serve_dir_atome = ServeDir::new(project_root.join("atome"));
    let atome_service = get_service(serve_dir_atome).handle_error(|error| async move {
        println!("Erreur /atome: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur atome",
        )
    });

    let serve_dir_eve = ServeDir::new(project_root.join("eVe"));
    let eve_service = get_service(serve_dir_eve).handle_error(|error| async move {
        println!("Erreur /eVe: {:?}", error);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Erreur eVe",
        )
    });

    // Service fichiers (correspond à dataFetcher: /file/<path>).
    // User media is project-relative (data/users/...), not static-dir-relative.
    let serve_dir_file = ServeDir::new(project_root.clone());
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
    let eve_version = load_eve_version(&base_dir);
    println!("📦 Version applicative: {}", version);
    println!("📦 eVe version: {}", eve_version);

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

    let state = AppState {
        static_dir: Arc::new(static_dir_abs),
        project_root: Arc::new(project_root),
        version: Arc::new(version.clone()),
        eve_version: Arc::new(eve_version.clone()),
        started_at: Arc::new(std::time::Instant::now()),
        atome_state: Some(atome_state),
        auth_state: Some(auth_state),
        remote_control_enabled: remote_control_boot_enabled(),
        remote_control_token: resolve_remote_control_token().map(Arc::new),
    };
    if state.remote_control_enabled {
        println!(
            "🔐 Tauri remote control enabled on localhost. Token source: {}",
            if std::env::var("SQUIRREL_TAURI_REMOTE_TOKEN")
                .ok()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
            {
                "SQUIRREL_TAURI_REMOTE_TOKEN"
            } else {
                "generated"
            }
        );
        if let Some(token) = state.remote_control_token.as_deref() {
            println!("🔐 Tauri remote control token: {}", token);
        }
    }

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
            "http://tauri.localhost".parse::<HeaderValue>().unwrap(),
            "https://tauri.localhost".parse::<HeaderValue>().unwrap(),
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
            header::RANGE,
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
            HeaderName::from_static("x-squirrel-remote-token"),
        ])
        .expose_headers([
            header::CONTENT_RANGE,
            header::ACCEPT_RANGES,
            header::CONTENT_LENGTH,
            header::CONTENT_TYPE,
            header::ETAG,
        ])
        .allow_credentials(true);

    let app = Router::new()
        .route("/api/server-info", get(server_info_handler))
        .route("/dev/state", get(dev_state_handler))
        .route("/api/fastify-status", get(fastify_status_handler))
        .route("/server_config.json", get(server_config_handler))
        .route("/api/debug-log", post(debug_log_handler))
        .route("/api/db/status", get(db_status_handler))
        .route(
            "/api/eve/ai/provider-completion",
            post(eve_ai_provider_completion_handler),
        )
        .route("/api/eve/mail/sync", post(eve_mail_sync_handler))
        .route("/api/eve/mail/send", post(eve_mail_send_handler))
        .route("/api/eve/mail/mark-read", post(eve_mail_mark_read_handler))
        .route("/api/eve/mail/archive", post(eve_mail_archive_handler))
        .route("/api/eve/mail/delete", post(eve_mail_delete_handler))
        .route("/api/events/commit", post(events_commit_handler))
        .route(
            "/api/events/commit-batch",
            post(events_commit_batch_handler),
        )
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
        .route("/api/extract-audio/:file", get(extract_audio_handler))
        .route("/api/recordings/:id", get(download_recording_handler))
        .route("/api/user-recordings", post(user_recordings_upload_handler))
        .route("/api/admin/apply-update", post(update_file_handler))
        .route("/api/admin/batch-update", post(batch_update_handler))
        .route("/api/admin/sync-from-zip", post(sync_from_zip_handler))
        .route("/__tauri_remote/status", get(remote_status_handler))
        .route(
            "/__tauri_remote/audio/record/start",
            post(remote_audio_record_start_handler),
        )
        .route(
            "/__tauri_remote/audio/record/stop",
            post(remote_audio_record_stop_handler),
        )
        .route(
            "/__tauri_remote/audio/analyze",
            post(remote_audio_analyze_handler),
        )
        .route(
            "/__tauri_remote/audio/playback/load",
            post(remote_audio_playback_load_handler),
        )
        .route(
            "/__tauri_remote/audio/playback/play",
            post(remote_audio_playback_play_handler),
        )
        .route(
            "/__tauri_remote/audio/playback/stop",
            post(remote_audio_playback_stop_handler),
        )
        // WebSocket endpoints for API and sync (ADOLE v3.0)
        .route("/ws/api", get(ws_api_handler))
        .route("/ws/sync", get(ws_sync_handler))
        .nest_service("/src", src_service)
        .nest_service("/atome", atome_service)
        .nest_service("/eVe", eve_service)
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
