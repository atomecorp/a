@echo off
setlocal

REM Définir un nom d'application par défaut
set DEFAULT_APP_NAME=my_app

REM Vérifier si un nom d'application a été fourni
if "%~1"=="" (
  echo Aucun nom d'application fourni, utilisation du nom par défaut: %DEFAULT_APP_NAME%
  set APP_NAME=%DEFAULT_APP_NAME%
) else (
  set APP_NAME=%1
)

REM Vérifier si le répertoire existe déjà et demander confirmation avant de le supprimer
if exist "%APP_NAME%" (
  echo Le répertoire %APP_NAME% existe déjà.
  set /p CONFIRM=Voulez-vous le supprimer? (y/N):

  REM Si aucune réponse (juste Enter), utiliser N par défaut
  if "%CONFIRM%"=="" set CONFIRM=N

  if /i "%CONFIRM%"=="Y" (
    echo Suppression du répertoire %APP_NAME%...
    rmdir /s /q "%APP_NAME%"
  ) else (
    echo Conservation du répertoire existant. Lancement de l'application...
    cd %APP_NAME%
    call npm run tauri dev
    exit /b 0
  )
)

echo Création de l'application Tauri: %APP_NAME%

REM Utiliser create-tauri-app avec le template vanilla pour créer l'application
REM L'option --yes permet d'accepter automatiquement les valeurs par défaut
call npm create tauri-app@latest %APP_NAME% -- --template vanilla --manager npm --yes

REM Accéder au répertoire de l'application
cd %APP_NAME%

REM Sauvegarder le chemin du répertoire de l'application (chemin absolu)
set APP_DIR=%cd%

REM Retourner au répertoire parent
cd ..

REM Vérifier si le répertoire src existe
if exist src (
  REM Copier le contenu du répertoire src vers le répertoire src de l'application
  echo Copie des fichiers personnalisés...
  xcopy /E /Y /I src "%APP_DIR%\src"
) else (
  echo Avertissement: Le répertoire src n'existe pas à la racine.
  mkdir "%APP_DIR%\src"
)

REM Retourner au répertoire de l'application
cd %APP_NAME%

REM Ajouter les dépendances Axum au fichier Cargo.toml existant
echo Ajout des dépendances Axum...
powershell -Command "$content = Get-Content src-tauri\Cargo.toml; if (-not (Select-String -Pattern 'axum =' -Path 'src-tauri\Cargo.toml' -Quiet)) { $updated = $false; $newContent = @(); foreach($line in $content) { $newContent += $line; if ($line.Trim() -eq '[dependencies]' -and -not $updated) { $newContent += 'axum = \"0.7.9\"'; $newContent += 'tokio = { version = \"1\", features = [\"full\"] }'; $newContent += 'tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }'; $updated = $true; } } $newContent | Set-Content src-tauri\Cargo.toml }"

REM Créer un fichier pour le serveur Axum avec les corrections nécessaires
echo Création du fichier serveur Axum...
if not exist src-tauri\src\server mkdir src-tauri\src\server
(
echo use axum::{
echo     routing::get_service,
echo     Router,
echo };
echo use std::{net::SocketAddr, path::PathBuf};
echo use tower_http::{
echo     cors::CorsLayer,
echo     services::ServeDir,
echo };
echo.
echo pub async fn start_server^(static_dir: PathBuf^) {
echo     // Imprimer le chemin absolu pour le débogage
echo     println!^("Servir les fichiers depuis: {}", static_dir.display^(^)^);
echo
echo     // Création du service pour servir les fichiers statiques
echo     let serve_dir = ServeDir::new^(static_dir^)
echo         .append_index_html_on_directories^(true^); // Pour servir index.html automatiquement
echo
echo     let serve_service = get_service^(serve_dir^).handle_error^(|error| async move {
echo         println!^("Erreur lors du service des fichiers: {:?}", error^);
echo         ^(axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur lors du service des fichiers"^)
echo     }^);
echo.
echo     // Configuration du routeur avec CORS
echo     let app = Router::new^(^)
echo         .nest_service^("/", serve_service^)
echo         .layer^(CorsLayer::permissive^(^)^);
echo.
echo     // Définition de l'adresse
echo     let addr = SocketAddr::from^(^([127, 0, 0, 1], 3000^)^);
echo.
echo     println!^("Serveur Axum démarré sur {}", addr^);
echo     println!^("Serveur Node.js Fastify démarré sur http://localhost:3001"^);
echo.
echo     // Démarrage du serveur avec l'API moderne d'Axum
echo     let listener = tokio::net::TcpListener::bind^(addr^).await.unwrap^(^);
echo     axum::serve^(listener, app^).await.unwrap^(^);
echo }
) > src-tauri\src\server\mod.rs

REM Modifier le fichier main.rs avec le chemin absolu vers le répertoire src et l'ajout du serveur Node
echo Modification du fichier main.rs...
(
echo #![cfg_attr^(
echo     all^(not^(debug_assertions^), target_os = "windows"^),
echo     windows_subsystem = "windows"
echo ^)]
echo.
echo mod server;
echo use std::process::Command;
echo.
echo fn main^(^) {
echo     // Utiliser le chemin absolu codé en dur vers le répertoire src
echo     // Cela n'est pas idéal mais c'est un contournement pour le problème avec current_dir^(^)
echo     let static_dir = std::path::PathBuf::from^("%APP_DIR%\\src"^);
echo     println!^("Chemin du répertoire src: {}", static_dir.display^(^)^);
echo.
echo     tauri::Builder::default^(^)
echo         .setup^(move |_app| {
echo             let static_dir_clone = static_dir.clone^(^);
echo
echo             // Lancer le serveur Axum dans un thread séparé
echo             std::thread::spawn^(move || {
echo                 println!^("Démarrage du serveur Axum pour servir les fichiers depuis: {}", static_dir_clone.display^(^)^);
echo                 let rt = tokio::runtime::Runtime::new^(^).unwrap^(^);
echo                 rt.block_on^(async {
echo                     server::start_server^(static_dir_clone^).await;
echo                 }^);
echo             }^);
echo
echo             // Lancer le serveur Node.js Fastify dans un thread séparé après Tauri
echo             std::thread::spawn^(move || {
echo                 println!^("Démarrage du serveur Node.js Fastify..."^);
echo
echo                 // Attendre que Tauri soit complètement initialisé ^(délai de 2 secondes^)
echo                 std::thread::sleep^(std::time::Duration::from_secs^(2^)^);
echo
echo                 // Lancer le script Node.js avec node
echo                 let output = Command::new^("node"^)
echo                     .current_dir^("%APP_DIR%"^)
echo                     .arg^("fastify-server.mjs"^)
echo                     .output^(^);
echo
echo                 match output {
echo                     Ok^(o^) =^> {
echo                         if o.status.success^(^) {
echo                             println!^("Serveur Node.js Fastify démarré avec succès"^);
echo                         } else {
echo                             eprintln!^("Erreur lors du démarrage du serveur Node.js: {}",
echo                                 String::from_utf8_lossy^(^&o.stderr^)^);
echo                         }
echo                     },
echo                     Err^(e^) =^> eprintln!^("Erreur lors du lancement du serveur Node.js: {}", e^),
echo                 }
echo             }^);
echo.
echo             Ok^(^(^)^)
echo         }^)
echo         .run^(tauri::generate_context!^(^)^)
echo         .expect^("Erreur lors de l'exécution de l'application Tauri"^);
echo }
) > src-tauri\src\main.rs

REM Créer un fichier de test pour vérifier que le serveur fonctionne
echo Création d'un fichier de test dans le répertoire src...
(
echo console.log^('Le serveur Axum fonctionne correctement!'^);
echo document.addEventListener^('DOMContentLoaded', ^(^) =^> {
echo   const infoDiv = document.createElement^('div'^);
echo   infoDiv.innerHTML = '^<p^>JavaScript chargé correctement!^</p^>';
echo   document.body.appendChild^(infoDiv^);
echo }^);
) > src\test.js

REM Installer les dépendances pour le serveur Fastify
echo Installation des dépendances pour le serveur Fastify...
call npm install --save fastify @fastify/cors

REM Créer le fichier serveur Fastify
echo Création du serveur Fastify...
(
echo // Serveur Fastify pour l'application Tauri ^(avec modules ES^)
echo import Fastify from 'fastify';
echo import { fileURLToPath } from 'url';
echo import { dirname, join, extname } from 'path';
echo import { readFile, existsSync, writeFileSync } from 'fs';
echo import { promisify } from 'util';
echo import fastifyCors from '@fastify/cors';
echo.
echo // Conversion des méthodes en Promise
echo const readFileAsync = promisify^(readFile^);
echo.
echo // Configuration du serveur Fastify
echo const fastify = Fastify^({ logger: true }^);
echo.
echo // Récupérer le chemin du fichier actuel et le dossier parent
echo const __filename = fileURLToPath^(import.meta.url^);
echo const __dirname = dirname^(__filename^);
echo.
echo // Enregistrer le plugin CORS
echo await fastify.register^(fastifyCors, {
echo   origin: true, // Autoriser toutes les origines
echo   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
echo   credentials: true
echo }^);
echo.
echo // Port pour le serveur Fastify ^(différent d'Axum qui utilise 3000^)
echo const PORT = 3001;
echo.
echo // Chemin du répertoire src
echo const srcDir = join^(__dirname, 'src'^);
echo.
echo // Routes API
echo fastify.get^('/api/status', async ^(request, reply^) =^> {
echo   return {
echo     status: 'ok',
echo     message: 'Serveur Fastify opérationnel',
echo     timestamp: new Date^(^).toISOString^(^)
echo   };
echo }^);
echo.
echo // Route pour tester le serveur
echo fastify.get^('/api/test', async ^(request, reply^) =^> {
echo   return {
echo     message: 'Test réussi!',
echo     server: 'Fastify',
echo     version: fastify.version
echo   };
echo }^);
echo.
echo // Créer un fichier de test Node.js spécifique
echo try {
echo   writeFileSync^(join^(srcDir, 'test-node.js'^), `
echo console.log^('Le serveur Fastify fonctionne correctement!'^);
echo console.log^('Ce fichier est servi par Fastify sur le port 3001'^);
echo `^);
echo } catch ^(err^) {
echo   console.error^('Erreur lors de la création du fichier test-node.js:', err^);
echo }
echo.
echo // Gestionnaire pour servir des fichiers statiques
echo fastify.get^('/*', async ^(request, reply^) =^> {
echo   try {
echo     const requestPath = request.url === '/' ? '/index.html' : request.url;
echo     const filePath = join^(srcDir, requestPath^);
echo
echo     // Vérifier si le fichier existe
echo     if ^(existsSync^(filePath^)^) {
echo       const content = await readFileAsync^(filePath^);
echo
echo       // Déterminer le type de contenu basé sur l'extension
echo       const ext = extname^(filePath^).toLowerCase^(^);
echo       let contentType = 'text/plain';
echo
echo       switch^(ext^) {
echo         case '.html': contentType = 'text/html'; break;
echo         case '.js': contentType = 'application/javascript'; break;
echo         case '.css': contentType = 'text/css'; break;
echo         case '.json': contentType = 'application/json'; break;
echo         case '.png': contentType = 'image/png'; break;
echo         case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
echo       }
echo
echo       reply.type^(contentType^).send^(content^);
echo     } else {
echo       reply.code^(404^).send^({ error: 'Fichier non trouvé' }^);
echo     }
echo   } catch ^(err^) {
echo     fastify.log.error^(err^);
echo     reply.code^(500^).send^({ error: 'Erreur interne du serveur' }^);
echo   }
echo }^);
echo.
echo // Démarrer le serveur
echo const start = async ^(^) =^> {
echo   try {
echo     await fastify.listen^({ port: PORT, host: '0.0.0.0' }^);
echo     fastify.log.info^(`Serveur Fastify démarré sur http://localhost:${PORT}`^);
echo     fastify.log.info^('Endpoints disponibles:'^);
echo     fastify.log.info^('- http://localhost:3001/api/status'^);
echo     fastify.log.info^('- http://localhost:3001/api/test'^);
echo     fastify.log.info^('- http://localhost:3001/test-node.js'^);
echo   } catch ^(err^) {
echo     fastify.log.error^(err^);
echo     process.exit^(1^);
echo   }
echo };
echo.
echo start^(^);
) > fastify-server.mjs

REM Lancer le développement
echo Lancement de l'application en mode développement...
call npm run tauri dev

endlocal