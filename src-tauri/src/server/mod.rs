use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Path as AxumPath, State,
    },
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, get_service, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde_json::json;
use std::{
    borrow::Cow,
    fs as stdfs,
    io::{Cursor, Read},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::fs;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, services::ServeDir};
use zip::ZipArchive;

// Local authentication module
pub mod local_auth;
// Local atome storage module
pub mod local_atome;

#[derive(Clone)]
struct AppState {
    uploads_dir: Arc<PathBuf>,
    static_dir: Arc<PathBuf>,
    version: Arc<String>,
}

const SERVER_TYPE: &str = "Tauri frontend process";
const MAX_UPLOAD_BYTES: usize = 1024 * 1024 * 1024; // 1 GiB

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

async fn resolve_upload_path(state: &AppState, raw_name: &str) -> (String, PathBuf) {
    let sanitized = sanitize_file_name(raw_name);
    let uploads_dir = &state.uploads_dir;
    let mut candidate = sanitized.clone();
    let mut counter = 1u32;

    loop {
        let target = uploads_dir.join(&candidate);
        if fs::metadata(&target).await.is_err() {
            return (candidate, target);
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

async fn server_info_handler(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "success": true,
        "version": state.version.as_str(),
        "type": SERVER_TYPE,
    }))
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

    let decoded: Cow<'_, str> =
        urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
    let (file_name, file_path) = resolve_upload_path(&state, decoded.as_ref()).await;

    if let Err(err) = fs::write(&file_path, &body).await {
        eprintln!("Erreur écriture upload {:?}: {}", file_path, err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": err.to_string() })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({ "success": true, "file": file_name })),
    )
}

async fn list_uploads_handler(State(state): State<AppState>) -> impl IntoResponse {
    let mut files: Vec<(String, u64, u64)> = Vec::new();
    match fs::read_dir(&*state.uploads_dir).await {
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
                let path = state.uploads_dir.join(&safe_name);
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
                state.uploads_dir, err
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
    AxumPath(file): AxumPath<String>,
) -> impl IntoResponse {
    let safe_name = sanitize_file_name(&file);
    let file_path = state.uploads_dir.join(&safe_name);

    match fs::read(&file_path).await {
        Ok(bytes) => {
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            if let Ok(header_value) =
                HeaderValue::from_str(&format!("attachment; filename=\"{}\"", safe_name))
            {
                headers.insert(header::CONTENT_DISPOSITION, header_value);
            }

            (StatusCode::OK, headers, bytes).into_response()
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "File not found" })),
        )
            .into_response(),
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

/// Handle WebSocket API connection
async fn handle_ws_api(mut socket: WebSocket, _state: AppState) {
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

                // Handle ping/pong
                if data.get("type").and_then(|v| v.as_str()) == Some("ping") {
                    let _ = socket
                        .send(Message::Text(json!({"type": "pong"}).to_string()))
                        .await;
                    continue;
                }

                // Handle API requests
                if data.get("type").and_then(|v| v.as_str()) == Some("api-request") {
                    let id = data.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let method = data.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                    let path = data.get("path").and_then(|v| v.as_str()).unwrap_or("/");

                    // For now, return a simple acknowledgment
                    // TODO: Implement proper request routing
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
async fn ws_sync_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_ws_sync)
}

/// Handle WebSocket sync connection
async fn handle_ws_sync(mut socket: WebSocket) {
    println!("🔗 New WebSocket sync connection");

    // Send welcome message
    let _ = socket
        .send(Message::Text(
            json!({
                "type": "connected",
                "server": "Tauri",
                "version": "1.0.0"
            })
            .to_string(),
        ))
        .await;

    while let Some(msg) = socket.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };

        match msg {
            Message::Text(text) => {
                let data: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Handle ping
                if data.get("type").and_then(|v| v.as_str()) == Some("ping") {
                    let _ = socket
                        .send(Message::Text(json!({"type": "pong"}).to_string()))
                        .await;
                    continue;
                }

                // Handle heartbeat
                if data.get("type").and_then(|v| v.as_str()) == Some("heartbeat") {
                    let _ = socket
                        .send(Message::Text(json!({"type": "heartbeat_ack"}).to_string()))
                        .await;
                    continue;
                }

                // Echo other messages for now
                let _ = socket
                    .send(Message::Text(
                        json!({"type": "ack", "received": data}).to_string(),
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

    println!("🔌 WebSocket sync connection closed");
}

pub async fn start_server(static_dir: PathBuf, uploads_dir: PathBuf) {
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

    let state = AppState {
        uploads_dir: Arc::new(uploads_dir.clone()),
        static_dir: Arc::new(static_dir_abs),
        version: Arc::new(version.clone()),
    };

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
        ])
        .allow_credentials(true);

    // Use a separate data directory for SQLite databases to avoid triggering Tauri hot-reload
    // The data_dir should be outside the watched src/ folder
    let data_dir = {
        // Try to use a 'data' folder at project root (outside src/)
        let project_root = static_dir.parent().unwrap_or(&static_dir);
        let data_path = project_root.join("data");

        // Create the data directory if it doesn't exist
        if let Err(e) = std::fs::create_dir_all(&data_path) {
            eprintln!("⚠️ Could not create data directory {:?}: {}", data_path, e);
            // Fallback to uploads parent if data dir creation fails
            uploads_dir.parent().unwrap_or(&uploads_dir).to_path_buf()
        } else {
            println!("📂 Database directory (outside src/): {:?}", data_path);
            data_path
        }
    };

    // Create local auth router (independent state) with CORS layer
    let local_auth_router =
        local_auth::create_local_auth_router(data_dir.clone()).layer(cors.clone());

    // Create local atome router with CORS layer
    let local_atome_router =
        local_atome::create_local_atome_router(data_dir.clone()).layer(cors.clone());

    let app = Router::new()
        .route("/api/server-info", get(server_info_handler))
        .route("/api/debug-log", post(debug_log_handler))
        .route(
            "/api/uploads",
            get(list_uploads_handler).post(upload_handler),
        )
        .route("/api/uploads/:file", get(download_upload_handler))
        .route("/api/admin/apply-update", post(update_file_handler))
        .route("/api/admin/batch-update", post(batch_update_handler))
        .route("/api/admin/sync-from-zip", post(sync_from_zip_handler))
        // WebSocket endpoint for API calls (silent connection detection)
        .route("/ws/api", get(ws_api_handler))
        .route("/ws/sync", get(ws_sync_handler))
        .nest_service("/", root_service)
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .layer(cors)
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_UPLOAD_BYTES))
        .with_state(state)
        // Merge local auth routes AFTER with_state (uses its own state with CORS)
        .merge(local_auth_router)
        // Merge local atome routes
        .merge(local_atome_router);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum {} démarré: http://localhost:3000", version);
    println!("🔐 Local authentication enabled: /api/auth/local/*");
    println!("📦 Local atome storage enabled: /api/atome/*");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
