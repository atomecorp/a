use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, get_service},
    Json, Router,
};
use serde_json::json;
use std::{
    borrow::Cow,
    fs as stdfs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::fs;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, services::ServeDir};

#[derive(Clone)]
struct AppState {
    uploads_dir: Arc<PathBuf>,
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

    let state = AppState {
        uploads_dir: Arc::new(uploads_dir),
        version: Arc::new(version.clone()),
    };

    let app = Router::new()
        .route("/api/server-info", get(server_info_handler))
        .route(
            "/api/uploads",
            get(list_uploads_handler).post(upload_handler),
        )
        .route("/api/uploads/:file", get(download_upload_handler))
        .nest_service("/", root_service)
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .layer(CorsLayer::permissive())
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_UPLOAD_BYTES))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum {} démarré: http://localhost:3000", version);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
