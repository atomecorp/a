use axum::{routing::get_service, Router};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{cors::CorsLayer, services::ServeDir};

pub async fn start_server(static_dir: PathBuf) {
    let serve_dir = ServeDir::new(static_dir).append_index_html_on_directories(true);
    let serve_service = get_service(serve_dir).handle_error(|error| async move {
        println!("Erreur serveur statique: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur")
    });

    let app = Router::new()
        .nest_service("/", serve_service)
        .layer(CorsLayer::permissive());
        
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum démarré: http://localhost:3000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
