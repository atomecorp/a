use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, get_service, post},
    Json, Router,
};
use serde_json::json;
use std::{
    borrow::Cow,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::fs;
use tower_http::{cors::CorsLayer, services::ServeDir};

#[derive(Clone)]
struct AppState {
    uploads_dir: Arc<PathBuf>,
}

const SERVER_VERSION: &str = "1.0.6";
const SERVER_TYPE: &str = "Tauri frontend process";

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

async fn server_info_handler() -> impl IntoResponse {
    Json(json!({
        "success": true,
        "version": SERVER_VERSION,
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

    let decoded: Cow<'_, str> = urlencoding::decode(file_name_raw).unwrap_or_else(|_| Cow::from(file_name_raw));
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

pub async fn start_server(static_dir: PathBuf) {
    // Service principal
    let base_dir = static_dir.clone();
    let serve_dir_root = ServeDir::new(base_dir.clone()).append_index_html_on_directories(true);
    let root_service = get_service(serve_dir_root).handle_error(|error| async move {
        println!("Erreur serveur statique: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur")
    });

    // Service fichiers (correspond à dataFetcher: /file/<path>)
    let serve_dir_file = ServeDir::new(base_dir.clone());
    let file_service = get_service(serve_dir_file).handle_error(|error| async move {
        println!("Erreur /file: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur fichier")
    });

    // Service texte (même répertoire, pas de transformation spéciale)
    let serve_dir_text = ServeDir::new(base_dir.clone());
    let text_service = get_service(serve_dir_text).handle_error(|error| async move {
        println!("Erreur /text: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur texte")
    });

    let uploads_dir = base_dir.join("assets/uploads");
    if let Err(err) = fs::create_dir_all(&uploads_dir).await {
        eprintln!("Impossible de créer le dossier uploads {:?}: {}", uploads_dir, err);
    }

    let state = AppState {
        uploads_dir: Arc::new(uploads_dir),
    };

    let app = Router::new()
        .route("/api/server-info", get(server_info_handler))
        .route("/api/uploads", post(upload_handler))
        .nest_service("/", root_service)
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .layer(CorsLayer::permissive())
        .with_state(state);
        
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum démarré: http://localhost:3000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
