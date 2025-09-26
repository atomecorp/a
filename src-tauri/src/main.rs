#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;
use std::net::TcpStream;
use std::process::Command;
use std::time::Duration;
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
