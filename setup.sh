#!/bin/bash

# Définir un nom d'application par défaut
DEFAULT_APP_NAME="my_app"

# Définir les ports
AXUM_PORT=3000
FASTIFY_PORT=3001

# Vérifier si un nom d'application a été fourni
if [ $# -eq 0 ]; then
  echo "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
  APP_NAME=$DEFAULT_APP_NAME
else
  APP_NAME=$1
fi

# Vérifier si le répertoire existe déjà et demander confirmation avant de le supprimer
if [ -d "$APP_NAME" ]; then
  echo "Le répertoire $APP_NAME existe déjà."
  echo "Voulez-vous le supprimer? (y/N): " # Syntaxe compatible avec zsh
  read CONFIRM

  # Si aucune réponse (juste Enter), utiliser N par défaut
  CONFIRM=${CONFIRM:-N}

  if [[ $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Suppression du répertoire $APP_NAME..."
    rm -rf "$APP_NAME"
  else
    echo "Conservation du répertoire existant. Lancement de l'application..."
    cd "$APP_NAME"
    npm run tauri dev
    exit 0
  fi
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
if [ -d "$CURRENT_DIR/src" ]; then
    cp -R $CURRENT_DIR/src/* $APP_DIR/src/
else
    echo "Avertissement: Le répertoire src n'existe pas à la racine."
    mkdir -p $APP_DIR/src
fi

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
    println!("Serveur Node.js Fastify démarré sur http://localhost:3001");

    // Démarrage du serveur avec l'API moderne d'Axum
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
EOL

# Modifier le fichier main.rs avec le chemin codé en dur et l'appel au serveur Node
echo "Modification du fichier main.rs..."
cat > src-tauri/src/main.rs << EOL
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod server;
use std::process::Command;

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

            // Lancer le serveur Node.js Fastify dans un thread séparé après Tauri
            std::thread::spawn(move || {
                println!("Démarrage du serveur Node.js Fastify...");

                // Attendre que Tauri soit complètement initialisé (délai de 2 secondes)
                std::thread::sleep(std::time::Duration::from_secs(2));

                // Lancer le script Node.js avec node
                let output = Command::new("node")
                    .current_dir("$APP_DIR_ABSOLUTE")
                    .arg("fastify-server.mjs")
                    .output();

                match output {
                    Ok(o) => {
                        if o.status.success() {
                            println!("Serveur Node.js Fastify démarré avec succès");
                        } else {
                            eprintln!("Erreur lors du démarrage du serveur Node.js: {}",
                                String::from_utf8_lossy(&o.stderr));
                        }
                    },
                    Err(e) => eprintln!("Erreur lors du lancement du serveur Node.js: {}", e),
                }
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
  sed -i.bak "s/$escaped_tag/$escaped_new_tag/g" src/index.html
  echo "Script modifié: $script_path -> http://localhost:3000/$base_path"
done

# Supprimer les fichiers de sauvegarde créés par sed
find . -name "*.bak" -type f -delete

# Créer un fichier de test pour vérifier que le serveur fonctionne
echo "Création d'un fichier de test dans le répertoire src..."
cat > src/test.js << 'EOL'
console.log('Le serveur Axum fonctionne correctement!');
EOL

# Installer les dépendances pour le serveur Fastify
echo "Installation des dépendances pour le serveur Fastify..."
npm install --save fastify @fastify/cors

# Créer le fichier serveur Fastify
echo "Création du serveur Fastify..."
cat > fastify-server.mjs << 'EOL'
// Serveur Fastify pour l'application Tauri (avec modules ES)
import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFile, existsSync, writeFileSync } from 'fs';
import { promisify } from 'util';
import fastifyCors from '@fastify/cors';

// Conversion des méthodes en Promise
const readFileAsync = promisify(readFile);

// Configuration du serveur Fastify
const fastify = Fastify({ logger: true });

// Récupérer le chemin du fichier actuel et le dossier parent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enregistrer le plugin CORS
await fastify.register(fastifyCors, {
  origin: true, // Autoriser toutes les origines
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});

// Port pour le serveur Fastify (différent d'Axum qui utilise 3000)
const PORT = 3001;

// Chemin du répertoire src
const srcDir = join(__dirname, 'src');

// Routes API
fastify.get('/api/status', async (request, reply) => {
  return {
    status: 'ok',
    message: 'Serveur Fastify opérationnel',
    timestamp: new Date().toISOString()
  };
});

// Route pour tester le serveur
fastify.get('/api/test', async (request, reply) => {
  return {
    message: 'Test réussi!',
    server: 'Fastify',
    version: fastify.version
  };
});

// Créer un fichier de test Node.js spécifique
try {
  writeFileSync(join(srcDir, 'test-node.js'), `
console.log('Le serveur Fastify fonctionne correctement!');
console.log('Ce fichier est servi par Fastify sur le port 3001');
`);
} catch (err) {
  console.error('Erreur lors de la création du fichier test-node.js:', err);
}

// Gestionnaire pour servir des fichiers statiques
fastify.get('/*', async (request, reply) => {
  try {
    const requestPath = request.url === '/' ? '/index.html' : request.url;
    const filePath = join(srcDir, requestPath);

    // Vérifier si le fichier existe
    if (existsSync(filePath)) {
      const content = await readFileAsync(filePath);

      // Déterminer le type de contenu basé sur l'extension
      const ext = extname(filePath).toLowerCase();
      let contentType = 'text/plain';

      switch(ext) {
        case '.html': contentType = 'text/html'; break;
        case '.js': contentType = 'application/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
      }

      reply.type(contentType).send(content);
    } else {
      reply.code(404).send({ error: 'Fichier non trouvé' });
    }
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: 'Erreur interne du serveur' });
  }
});

// Démarrer le serveur
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Serveur Fastify démarré sur http://localhost:${PORT}`);
    fastify.log.info('Endpoints disponibles:');
    fastify.log.info('- http://localhost:3001/api/status');
    fastify.log.info('- http://localhost:3001/api/test');
    fastify.log.info('- http://localhost:3001/test-node.js');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
EOL

echo "Lancement de l'application en mode développement..."
npm run tauri dev