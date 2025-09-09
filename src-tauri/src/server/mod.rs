use axum::{routing::get_service, Router};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{cors::CorsLayer, services::ServeDir};

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

    let app = Router::new()
        .nest_service("/", root_service)
        .nest_service("/file", file_service)
        .nest_service("/text", text_service)
        .layer(CorsLayer::permissive());
        
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum démarré: http://localhost:3000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
