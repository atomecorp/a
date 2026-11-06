// What the local server says about itself: request log, versions, server info and config, sync status, recent errors.
use super::*;

pub(super) fn redact_sensitive_query_params(uri: &str) -> String {
    let Some((path, query)) = uri.split_once('?') else {
        return uri.to_string();
    };
    let sanitized_query = query
        .split('&')
        .map(|part| {
            let key = part.split_once('=').map(|(key, _)| key).unwrap_or(part);
            if matches!(
                key,
                "access_token"
                    | "auth_token"
                    | "token"
                    | "media_user_id"
                    | "user_id"
                    | "userId"
                    | "x_user_id"
                    | "x_userid"
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

pub(super) async fn log_request_middleware(req: Request<Body>, next: middleware::Next) -> Response {
    // Set by `request_id::tag` around this layer.
    let request_id = req
        .headers()
        .get(request_id::X_REQUEST_ID)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();

    let method = req.method().to_string();
    let uri = redact_sensitive_query_params(&req.uri().to_string());
    let start = std::time::Instant::now();

    let response = next.run(req).await;
    let status = response.status().as_u16();
    let duration_ms = start.elapsed().as_millis() as u64;

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

pub(super) fn project_root_from_static_dir(static_dir: &Path) -> PathBuf {
    if static_dir.file_name().and_then(|name| name.to_str()) == Some("src")
        && let Some(atome_dir) = static_dir.parent()
        && atome_dir.file_name().and_then(|name| name.to_str()) == Some("atome")
        && let Some(root) = atome_dir.parent()
    {
        return root.to_path_buf();
    }

    static_dir.parent().unwrap_or(static_dir).to_path_buf()
}

pub(super) fn read_version_candidate(candidate: &Path) -> Option<String> {
    let raw = stdfs::read_to_string(candidate).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if candidate.extension().and_then(|ext| ext.to_str()) == Some("json")
        && let Ok(json) = serde_json::from_str::<JsonValue>(trimmed)
    {
        return json
            .get("version")
            .and_then(|value| value.as_str())
            .map(|version| version.trim().to_string())
            .filter(|version| !version.is_empty());
    }
    Some(trimmed.to_string())
}

pub(super) fn load_version(static_dir: &Path) -> String {
    let project_root = project_root_from_static_dir(static_dir);
    // The atome version lives in atome/; the bundle still ships it at its root.
    let mut candidates = vec![
        project_root.join("atome").join("version.txt"),
        project_root.join("version.txt"),
        project_root.join("atome").join("src").join("version.json"),
        static_dir.join("version.txt"),
        static_dir.join("version.json"),
    ];
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
        if let Some(version) = read_version_candidate(&candidate) {
            return version;
        }
    }

    "unknown".to_string()
}

pub(super) fn load_eve_version(static_dir: &Path) -> String {
    let project_root = project_root_from_static_dir(static_dir);
    let mut candidates = Vec::new();
    candidates.push(project_root.join("eVe").join("version.txt"));
    candidates.push(PathBuf::from("eVe/version.txt"));
    if let Some(parent) = static_dir.parent() {
        candidates.push(parent.join("eVe").join("version.txt"));
    }
    if let Ok(canon) = stdfs::canonicalize(static_dir)
        && let Some(parent) = canon.parent()
    {
        candidates.push(parent.join("eVe").join("version.txt"));
    }

    for candidate in candidates {
        if let Some(version) = read_version_candidate(&candidate) {
            return version;
        }
    }

    "unknown".to_string()
}

pub(super) async fn server_info_handler(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "success": true,
        "version": state.version.as_str(),
        "atomeVersion": state.version.as_str(),
        "eveVersion": state.eve_version.as_str(),
        "type": SERVER_TYPE,
    }))
}

pub(super) async fn dev_state_handler(State(state): State<AppState>) -> impl IntoResponse {
    let uptime_sec = state.started_at.elapsed().as_secs_f64();
    Json(json!({
        "success": true,
        "source": "axum",
        "version": state.version.as_str(),
        "uptime_sec": uptime_sec,
        "recent_errors": recent_errors_snapshot(),
    }))
}

pub(super) async fn locate_server_config(
    static_dir: &Path,
    project_root: &Path,
) -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = vec![
        static_dir.join("server_config.json"),
        project_root.join("server_config.json"),
        project_root
            .join("atome")
            .join("src")
            .join("server_config.json"),
    ];

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

pub(super) fn default_server_config() -> serde_json::Value {
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

pub(super) async fn server_config_handler(State(state): State<AppState>) -> impl IntoResponse {
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

pub(super) async fn fastify_status_handler(State(state): State<AppState>) -> impl IntoResponse {
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
pub(super) async fn debug_log_handler(Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let _ = payload;

    Json(json!({ "success": true }))
}

pub(super) async fn db_status_handler(State(state): State<AppState>) -> impl IntoResponse {
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
    for name in rows.flatten() {
        tables.push(name);
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
