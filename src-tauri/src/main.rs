#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod dev_logging;
mod server;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager; // pour get_webview_window

fn resolve_shared_uploads_dir(static_dir: &Path, default_uploads_dir: &Path) -> PathBuf {
    match std::env::var("SQUIRREL_UPLOADS_DIR") {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                eprintln!(
                    "[tauri] SQUIRREL_UPLOADS_DIR is empty; using default uploads dir: {:?}",
                    default_uploads_dir
                );
                return default_uploads_dir.to_path_buf();
            }

            let mut candidate = PathBuf::from(trimmed);
            if !candidate.is_absolute() {
                let project_root = static_dir
                    .parent()
                    .map(|p| p.to_path_buf())
                    .or_else(|| std::env::current_dir().ok())
                    .unwrap_or_else(|| PathBuf::from("."));
                candidate = project_root.join(candidate);
            }
            candidate
        }
        Err(_) => {
            eprintln!(
                "[tauri] SQUIRREL_UPLOADS_DIR is not set; using default uploads dir: {:?}",
                default_uploads_dir
            );
            default_uploads_dir.to_path_buf()
        }
    }
}

fn main() {
    let _log_guard = dev_logging::init_tracing();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![dev_logging::log_from_webview])
        .setup(|app| {
            let path_resolver = app.path();
            let static_dir: PathBuf = match path_resolver.resource_dir() {
                Ok(dir) => {
                    let mut resolved: Option<PathBuf> = None;
                    let mut candidates: Vec<PathBuf> = vec![
                        dir.join("dist"),
                        dir.join("public"),
                        dir.join("src"),
                        dir.join("_up_/dist"),
                        dir.join("_up_/public"),
                        dir.join("_up_/src"),
                        dir.clone(),
                    ];

                    // Prefer live repo assets in dev so new files are immediately served.
                    if cfg!(debug_assertions) {
                        candidates.insert(0, PathBuf::from("../src"));
                    }

                    // Dev fallback (../src) checked last
                    candidates.push(PathBuf::from("../src"));

                    for candidate in candidates {
                        if candidate.join("index.html").exists() {
                            resolved = Some(candidate);
                            break;
                        }
                    }

                    resolved.unwrap_or_else(|| PathBuf::from("../src"))
                }
                Err(_) => PathBuf::from("../src"),
            };

            if !static_dir.join("index.html").exists() {
                eprintln!("⚠️  Static directory does not contain index.html: {:?}", static_dir);
            }

            println!("📂 Static assets directory: {:?}", static_dir);

            let default_base = path_resolver
                .download_dir()
                .ok()
                .or_else(|| path_resolver.app_data_dir().ok())
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(|| PathBuf::from("."));
            let default_uploads_dir = default_base.join("squirrel").join("Uploads");

            let data_base = path_resolver
                .app_data_dir()
                .ok()
                .or_else(|| path_resolver.download_dir().ok())
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(|| PathBuf::from("."));
            let data_dir = data_base.join("squirrel").join("Data");

            let uploads_dir = resolve_shared_uploads_dir(&static_dir, &default_uploads_dir);
            if let Err(err) = fs::create_dir_all(&uploads_dir) {
                panic!(
                    "Unable to prepare shared uploads directory {:?}: {}",
                    uploads_dir, err
                );
            }
            println!("📁 Uploads directory: {:?}", uploads_dir);

            let static_dir_for_server = static_dir.clone();
            let uploads_dir_for_server = uploads_dir.clone();
            let data_dir_for_server = data_dir.clone();

            // Serveur Axum en arrière-plan
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_for_server, uploads_dir_for_server, data_dir_for_server).await;
                });
            });

            // Exposed port 3000 to the front (allows dataFetcher to use http://127.0.0.1:3000/...)
            {
                let handle = app.handle();
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval("window.__ATOME_LOCAL_HTTP_PORT__=3000; console.log('[tauri] port exposed 3000');");
                } else {
                    // Fallback: essaye toute fenêtre disponible
                    for (_, w) in app.webview_windows() {
                        let _ = w.eval("window.__ATOME_LOCAL_HTTP_PORT__=3000; console.log('[tauri] port exposed 3000 (fallback)');");
                        break;
                    }
                }
            }

            // NOTE: Fastify server is NOT started from Tauri.
            // Use ./run.sh to start both Tauri+Axum and Fastify
            // Use ./run.sh --tauri to start only Tauri+Axum (port 3000)
            // Use ./run.sh --server to start only Fastify (port 3001)

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tauri");
}
