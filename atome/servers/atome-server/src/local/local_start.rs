// Preparing and serving the local server: its state, its vault, its routes, its listener.
use super::*;

/// The local server, ready to be served: its state (the native controllers of a platform answer
/// through it, `ws_api::answer`) and its routes. A host whose listening socket can be taken
/// back (iOS, on return from the background) serves the same routes again on a new one.
pub struct Prepared {
    pub state: AppState,
    pub app: Router,
}

/// Opens the person's vault (in `data_dir`) and builds the local server: `static_dir` holds the
/// application's files, `project_root` the person's (`data/users/<id>/…`); `platform` gives what
/// only its platform can do. The remote end is read from `SQUIRREL_FASTIFY_URL` (sync, relays,
/// device proofs).
pub async fn prepare(
    static_dir: PathBuf,
    project_root: PathBuf,
    data_dir: PathBuf,
    platform: Arc<dyn Host>,
) -> Result<Prepared, String> {
    if HOST.set(platform).is_err() {
        return Err("local_server_already_started".into());
    }
    let base_dir = static_dir.clone();
    let static_dir_abs = base_dir.canonicalize().unwrap_or_else(|_| base_dir.clone());

    // The application's files, as the Web server serves them (atome-server's
    // shared static roots: Fastify's prefixes, precompressed variants, types).
    let static_roots = Arc::new(StaticRoots::of_app(&project_root, base_dir.clone()));
    let static_answer = move |request: Request<Body>| {
        let roots = static_roots.clone();
        async move { statics::answer(&roots, request).await }
    };

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

    let version = load_version(&base_dir);
    let eve_version = load_eve_version(&base_dir);
    println!("📦 Version applicative: {}", version);
    println!("📦 eVe version: {}", eve_version);

    std::fs::create_dir_all(&data_dir)
        .map_err(|error| format!("local_data_directory_unavailable:{error}"))?;
    println!("📂 Database directory: {:?}", data_dir);

    // Initialize local atome and auth states (ADOLE v3.0 WebSocket-based)
    let atome_state = local_atome::create_state(
        data_dir.clone(),
        project_root.clone(),
        host().journal_mode(),
    )
    .map_err(|error| format!("local_vault_unavailable:{error}"))?;
    let auth_state = match host().session_secret(&data_dir) {
        Ok(secret) => local_auth::create_state(&atome_state, secret)?,
        Err(error) => return Err(format!("local_session_secret_unavailable:{error}")),
    };

    let state = AppState {
        static_dir: Arc::new(static_dir_abs),
        project_root: Arc::new(project_root),
        version: Arc::new(version.clone()),
        eve_version: Arc::new(eve_version.clone()),
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
        if let Some(atome_state) = state.atome_state.clone()
            && !remote_url.trim().is_empty()
        {
            println!("🔁 Sync queue enabled → {}", remote_url);
            tokio::spawn(local_atome_sync_worker::run(atome_state, remote_url));
        }
    }

    // Fastify's CORS policy (atome-server's shared one). The Tauri development
    // shell (port 1430) loads first and is sent on to Axum; while it shows, every
    // call answered 200 and was refused by the browser, which read like an auth
    // failure where there was only a late start. Never in release: 1430 is not a
    // mode of operation.
    let development_origins = if cfg!(debug_assertions) {
        vec![
            "http://127.0.0.1:1430".to_string(),
            "http://localhost:1430".to_string(),
        ]
    } else {
        Vec::new()
    };
    let cors = CorsPolicy::new(development_origins);

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
        .route("/api/uploads/{file}", get(download_upload_handler))
        .route("/api/extract-audio/{file}", get(extract_audio_handler))
        .route(
            "/api/recordings/{id}",
            get(download_recording_handler).delete(delete_recording_handler),
        )
        .route("/api/user-recordings", post(user_recordings_upload_handler))
        // WebSocket endpoints for API and sync (ADOLE v3.0)
        .route("/ws/api", get(ws_api_handler))
        .route("/ws/sync", get(ws_sync_handler))
        .merge(host().routes())
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .fallback(static_answer)
        .layer(middleware::from_fn_with_state(cors, cors::layer))
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_UPLOAD_BYTES))
        .layer(middleware::from_fn(
            static_asset_cache::revalidate_static_asset_middleware,
        ))
        .layer(middleware::from_fn(log_request_middleware))
        .layer(middleware::from_fn(request_id::tag))
        .with_state(state.clone());
    Ok(Prepared { state, app })
}

/// Serves the local server on `listener` (127.0.0.1:3000, bound by the caller before the window
/// loads, so its first request waits for this server) until it stops.
pub async fn start_server(
    static_dir: PathBuf,
    uploads_dir: PathBuf,
    data_dir: PathBuf,
    listener: std::io::Result<std::net::TcpListener>,
    platform: Arc<dyn Host>,
) {
    if let Err(err) = fs::create_dir_all(&uploads_dir).await {
        eprintln!(
            "Impossible de créer le dossier uploads {:?}: {}",
            uploads_dir, err
        );
    }
    let static_abs = static_dir
        .canonicalize()
        .unwrap_or_else(|_| static_dir.clone());
    let project_root = project_root_from_static_dir(&static_abs);
    let prepared = match prepare(static_dir, project_root, data_dir, platform).await {
        Ok(prepared) => prepared,
        Err(error) => {
            eprintln!("ERROR: the local server cannot start: {error}");
            return;
        }
    };
    println!("🔗 WebSocket API enabled: ws://localhost:3000/ws/api");
    println!("🔗 WebSocket Sync enabled: ws://localhost:3000/ws/sync");

    let listener = match listener.and_then(|listener| {
        listener.set_nonblocking(true)?;
        tokio::net::TcpListener::from_std(listener)
    }) {
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
    serve(listener, prepared.app).await;
}

/// Serves `app` on `listener` until it stops, recording why it stopped.
pub async fn serve(listener: tokio::net::TcpListener, app: Router) {
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
