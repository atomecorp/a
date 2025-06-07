#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod server;
use std::process::Command;

fn main() {
let static_dir = std::path::PathBuf::from("../src");
    tauri::Builder::default()
        .setup(move |_app| {
            let static_dir_clone = static_dir.clone();

            // Serveur Axum en arrière-plan
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_clone).await;
                });
            });

            // Serveur Fastify en arrière-plan
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let output = Command::new("node")
                    .current_dir("../")
                    .arg("fastify-server.mjs")
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
