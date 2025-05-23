#!/bin/bash

# Définir un nom d'application par défaut
DEFAULT_APP_NAME="atome"

# Vérifier si un nom d'application a été fourni
if [ $# -eq 0 ]; then
  echo "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
  APP_NAME=$DEFAULT_APP_NAME
else
  APP_NAME=$1
fi

# Vérifier si le répertoire existe déjà
if [ -d "$APP_NAME" ]; then
  echo "Le répertoire $APP_NAME existe déjà."
  echo -n "Voulez-vous le supprimer? (y/N): "
  # shellcheck disable=SC2162
  read CONFIRM
  CONFIRM=${CONFIRM:-N}

  if [[ $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Suppression du répertoire $APP_NAME..."
    rm -rf "$APP_NAME"
  else
    echo "Conservation du répertoire existant. Lancement de l'application..."
    # shellcheck disable=SC2164
    cd "$APP_NAME"
    npm run tauri dev
    exit 0
  fi
fi

mkdir -p src/squirrel/parser

curl -o src/squirrel/parser/acorn.js https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.js

echo "Création de l'application Tauri: $APP_NAME"

# Créer l'application avec valeurs par défaut
npm create tauri-app@latest "$APP_NAME" -- --template vanilla --manager npm --yes

# Sauvegarder les chemins
CURRENT_DIR=$(pwd)
# shellcheck disable=SC2164
cd "$APP_NAME"
APP_DIR=$(pwd)
APP_DIR_ABSOLUTE=$(realpath "$APP_DIR")
# shellcheck disable=SC2103
cd ..

# Copier le répertoire src s'il existe
if [ -d "$CURRENT_DIR/src" ]; then
    echo "Copie des fichiers personnalisés..."
    cp -R "$CURRENT_DIR"/src/* "$APP_DIR"/src/
else
    echo "Création du répertoire src..."
    mkdir -p "$APP_DIR"/src
fi

# Copier le serveur Fastify s'il existe
if [ -f "$CURRENT_DIR/fastify-server.mjs" ]; then
    echo "Copie du serveur Fastify..."
    cp "$CURRENT_DIR"/fastify-server.mjs "$APP_DIR"/
else
    echo "Attention: fichier fastify-server.mjs non trouvé à la racine du projet"
fi

# Accéder au répertoire de l'application
# shellcheck disable=SC2164
cd "$APP_NAME"

# Ajouter les dépendances Axum
echo "Ajout des dépendances Axum..."
if ! grep -q "axum =" src-tauri/Cargo.toml; then
  TEMP_FILE=$(mktemp)
  while IFS= read -r line; do
    echo "$line" >> "$TEMP_FILE"
    if [[ $line == '[dependencies]' ]]; then
      # shellcheck disable=SC2129
      echo "axum = \"0.7.9\"" >> "$TEMP_FILE"
      echo "tokio = { version = \"1\", features = [\"full\"] }" >> "$TEMP_FILE"
      echo "tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }" >> "$TEMP_FILE"
    fi
  done < src-tauri/Cargo.toml
  mv "$TEMP_FILE" src-tauri/Cargo.toml
fi

# Créer le serveur Axum
echo "Création du serveur Axum..."
mkdir -p src-tauri/src/server
cat > src-tauri/src/server/mod.rs << 'EOL'
use axum::{routing::get_service, Router};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{cors::CorsLayer, services::ServeDir};

pub async fn start_server(static_dir: PathBuf) {
    let serve_dir = ServeDir::new(static_dir).append_index_html_on_directories(true);
    let serve_service = get_service(serve_dir).handle_error(|error| async move {
        println!("Erreur: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur")
    });

    let app = Router::new().nest_service("/", serve_service).layer(CorsLayer::permissive());
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Serveur Axum: http://localhost:3000");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
EOL

# Modifier le fichier main.rs
echo "Modification du fichier main.rs..."
cat > src-tauri/src/main.rs << EOL
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod server;
use std::process::Command;

fn main() {
    let static_dir = std::path::PathBuf::from("$APP_DIR_ABSOLUTE/src");

    tauri::Builder::default()
        .setup(move |_app| {
            let static_dir_clone = static_dir.clone();

            // Serveur Axum
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_clone).await;
                });
            });

            // Serveur Fastify
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let output = Command::new("node")
                    .current_dir("$APP_DIR_ABSOLUTE")
                    .arg("fastify-server.mjs")
                    .output();

                match output {
                    Ok(o) => {
                        if !o.status.success() {
                            println!("Erreur fastify: {}", String::from_utf8_lossy(&o.stderr));
                        }
                    },
                    Err(e) => println!("Erreur: {}", e),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur Tauri");
}
EOL

# Installer les dépendances pour Fastify
echo "Installation des dépendances Fastify..."
npm install --save fastify @fastify/cors

echo "Lancement de l'application..."
npm run tauri dev