#!/bin/bash

# Définir un nom d'application par défaut
DEFAULT_APP_NAME="my_app"

# Vérifier si un nom d'application a été fourni
if [ $# -eq 0 ]; then
  echo "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
  APP_NAME=$DEFAULT_APP_NAME
else
  APP_NAME=$1
fi

# Vérifier si le répertoire existe déjà et le supprimer si c'est le cas
if [ -d "$APP_NAME" ]; then
  echo "Le répertoire $APP_NAME existe déjà. Suppression..."
  rm -rf "$APP_NAME"
fi

echo "Création de l'application Tauri: $APP_NAME"

# Utiliser create-tauri-app avec le template vanilla pour créer l'application
# L'option --yes permet d'accepter automatiquement les valeurs par défaut
npm create tauri-app@latest $APP_NAME -- --template vanilla --manager npm --yes

# Sauvegarder le chemin du répertoire actuel
CURRENT_DIR=$(pwd)

# Accéder au répertoire de l'application
cd $APP_NAME

# Sauvegarder le chemin du répertoire de l'application
APP_DIR=$(pwd)
APP_DIR_ABSOLUTE=$(realpath "$APP_DIR")

# Retourner au répertoire parent
cd ..

# Copier le contenu du répertoire src vers le répertoire src de l'application
echo "Copie des fichiers personnalisés..."
cp -R $CURRENT_DIR/src/* $APP_DIR/src/

# Retourner au répertoire de l'application
cd $APP_NAME

# Ajouter les dépendances Axum au fichier Cargo.toml existant
echo "Ajout des dépendances Axum..."
# Vérifier si les dépendances existent déjà avant de les ajouter
if ! grep -q "axum =" src-tauri/Cargo.toml; then
  # Créer un fichier temporaire
  TEMP_FILE=$(mktemp)

  # Traiter le fichier Cargo.toml ligne par ligne
  while IFS= read -r line; do
    echo "$line" >> "$TEMP_FILE"
    # Ajouter nos dépendances après la section [dependencies]
    if [[ $line == '[dependencies]' ]]; then
      echo "axum = \"0.7.9\"" >> "$TEMP_FILE"
      echo "tokio = { version = \"1\", features = [\"full\"] }" >> "$TEMP_FILE"
      echo "tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }" >> "$TEMP_FILE"
    fi
  done < src-tauri/Cargo.toml

  # Remplacer le fichier original par le fichier temporaire
  mv "$TEMP_FILE" src-tauri/Cargo.toml
fi

# Créer un dossier pour le serveur Axum
echo "Création du fichier serveur Axum..."
mkdir -p src-tauri/src/server

# Créer le fichier mod.rs pour le serveur Axum
cat > src-tauri/src/server/mod.rs << 'EOL'
use axum::{
    routing::get_service,
    Router,
};
use std::{net::SocketAddr, path::PathBuf};
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
};

pub async fn start_server(static_dir: PathBuf) {
    // Imprimer le chemin absolu pour le débogage
    println!("Servir les fichiers depuis: {}", static_dir.display());

    // Création du service pour servir les fichiers statiques
    let serve_dir = ServeDir::new(static_dir)
        .append_index_html_on_directories(true); // Pour servir index.html automatiquement

    let serve_service = get_service(serve_dir).handle_error(|error| async move {
        println!("Erreur lors du service des fichiers: {:?}", error);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur lors du service des fichiers")
    });

    // Configuration du routeur avec CORS
    let app = Router::new()
        .nest_service("/", serve_service)
        .layer(CorsLayer::permissive());

    // Définition de l'adresse
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));

    println!("Serveur Axum démarré sur {}", addr);

    // Démarrage du serveur avec l'API moderne d'Axum
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
EOL

# Modifier le fichier main.rs avec le chemin codé en dur (ce n'est pas idéal mais ça devrait fonctionner pour le développement)
echo "Modification du fichier main.rs..."
cat > src-tauri/src/main.rs << EOL
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;

fn main() {
    // Utiliser le chemin absolu codé en dur vers le répertoire src
    // Cela n'est pas idéal mais c'est un contournement pour le problème avec current_dir()
    let static_dir = std::path::PathBuf::from("$APP_DIR_ABSOLUTE/src");
    println!("Chemin du répertoire src: {}", static_dir.display());

    tauri::Builder::default()
        .setup(move |_app| {
            let static_dir_clone = static_dir.clone();

            // Lancer le serveur Axum dans un thread séparé
            std::thread::spawn(move || {
                println!("Démarrage du serveur Axum pour servir les fichiers depuis: {}", static_dir_clone.display());
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_clone).await;
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application Tauri");
}
EOL

# Vérifier le fichier index.html et le modifier si nécessaire
echo "Vérification et modification de index.html..."
# Vérifier d'abord le contenu du fichier pour diagnostic
echo "Contenu de index.html:"
cat src/index.html

# Modifier toutes les balises script pour qu'elles pointent vers le serveur Axum
# Cette approche traite chaque balise script individuellement
grep -o '<script[^>]*src="[^"]*"[^>]*>' src/index.html | while read -r script_tag; do
  # Extraire le chemin du script
  script_path=$(echo "$script_tag" | sed -n 's/.*src="\([^"]*\)".*/\1/p')
  if [[ $script_path == /* ]]; then
    # Si le chemin commence par /, enlever le / initial
    base_path=${script_path#/}
  else
    # Sinon utiliser le chemin tel quel
    base_path=$script_path
  fi

  # Créer la nouvelle balise script
  new_tag="<script type=\"module\" src=\"http://localhost:3000/$base_path\" defer></script>"

  # Échapper les caractères spéciaux dans la balise originale pour sed
  escaped_tag=$(echo "$script_tag" | sed 's/[\/&]/\\&/g')
  escaped_new_tag=$(echo "$new_tag" | sed 's/[\/&]/\\&/g')

  # Remplacer la balise dans le fichier index.html
  sed -i "s/$escaped_tag/$escaped_new_tag/g" src/index.html
  echo "Script modifié: $script_path -> http://localhost:3000/$base_path"
done

# Créer un fichier de test pour vérifier que le serveur fonctionne
echo "Création d'un fichier de test dans le répertoire src..."
cat > src/test.js << 'EOL'
console.log('Le serveur Axum fonctionne correctement!');
EOL

echo "Lancement de l'application en mode développement..."
npm run tauri dev