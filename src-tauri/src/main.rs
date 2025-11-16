#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;
use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager; // pour get_webview_window

fn resolve_shared_uploads_dir(static_dir: &Path) -> PathBuf {
    let raw = std::env::var("SQUIRREL_UPLOADS_DIR")
        .expect("SQUIRREL_UPLOADS_DIR must be set before launching Tauri");
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        panic!("SQUIRREL_UPLOADS_DIR is empty. Configure it via run.sh or export it before running Tauri.");
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

fn main() {
    tauri::Builder::default()
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

            let uploads_dir = resolve_shared_uploads_dir(&static_dir);
            if let Err(err) = fs::create_dir_all(&uploads_dir) {
                panic!(
                    "Unable to prepare shared uploads directory {:?}: {}",
                    uploads_dir, err
                );
            }
            println!("📁 Uploads directory: {:?}", uploads_dir);

            let static_dir_for_server = static_dir.clone();
            let uploads_dir_for_server = uploads_dir.clone();

            // Serveur Axum en arrière-plan
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_for_server, uploads_dir_for_server).await;
                });
            });

            // Expose port 3000 au front (permet à dataFetcher d'utiliser http://127.0.0.1:3000/...)
            {
                let handle = app.handle();
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval("window.__ATOME_LOCAL_HTTP_PORT__=3000; console.log('[tauri] port exposé 3000');");
                } else {
                    // Fallback: essaye toute fenêtre disponible
                    for (_, w) in app.webview_windows() {
                        let _ = w.eval("window.__ATOME_LOCAL_HTTP_PORT__=3000; console.log('[tauri] port exposé 3000 (fallback)');");
                        break;
                    }
                }
            }

            // Serveur Fastify en arrière-plan
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(2));

                if TcpStream::connect("127.0.0.1:3001").is_ok() {
                    println!("Serveur Fastify déjà actif sur le port 3001; lancement ignoré");
                    return;
                }

                match Command::new("node")
                    .current_dir("../")
                    .arg("server/server.js")
                    .spawn()
                {
                    Ok(child) => {
                        println!("Serveur Fastify lancé depuis Tauri (PID {})", child.id());
                    }
                    Err(e) => println!("Erreur lancement Fastify: {}", e),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tauri");
}
