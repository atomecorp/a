#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod server;
use std::process::Command;
use tauri::Manager; // pour get_webview_window

fn main() {
let static_dir = std::path::PathBuf::from("../src");
    tauri::Builder::default()
        .setup(move |app| {
            let static_dir_clone = static_dir.clone();

            // Serveur Axum en arrière-plan
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_clone).await;
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
                std::thread::sleep(std::time::Duration::from_secs(2));
                let output = Command::new("node")
                    .current_dir("../")
                    .arg("server/server.js")
                    .output();

                match output {
                    Ok(o) => {
                        if !o.status.success() {
                            println!("Erreur serveur Fastify: {}", String::from_utf8_lossy(&o.stderr));
                        }
                    },
                    Err(e) => println!("Erreur lancement Fastify: {}", e),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tauri");
}
