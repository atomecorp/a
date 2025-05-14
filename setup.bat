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

REM Vérifier si le répertoire existe déjà
if exist "%APP_NAME%" (
  echo Le répertoire %APP_NAME% existe déjà.
  set /p CONFIRM=Voulez-vous le supprimer? (y/N):
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

REM Créer l'application avec values par défaut
call npm create tauri-app@latest %APP_NAME% -- --template vanilla --manager npm --yes

REM Accéder au répertoire de l'application
cd %APP_NAME%
set APP_DIR=%cd%
cd ..

REM Copier le répertoire src s'il existe
if exist src (
  echo Copie des fichiers personnalisés...
  xcopy /E /Y /I src "%APP_DIR%\src"
) else (
  echo Création du répertoire src...
  mkdir "%APP_DIR%\src"
)

REM Créer un fichier test.js
echo console.log('Le serveur Axum fonctionne correctement!'); > "%APP_DIR%\src\test.js"

REM Retourner au répertoire de l'application
cd %APP_NAME%

REM Ajouter les dépendances Axum
echo Ajout des dépendances Axum...
powershell -Command "$content = Get-Content src-tauri\Cargo.toml; if (-not (Select-String -Pattern 'axum =' -Path 'src-tauri\Cargo.toml' -Quiet)) { $updated = $false; $newContent = @(); foreach($line in $content) { $newContent += $line; if ($line.Trim() -eq '[dependencies]' -and -not $updated) { $newContent += 'axum = \"0.7.9\"'; $newContent += 'tokio = { version = \"1\", features = [\"full\"] }'; $newContent += 'tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }'; $updated = $true; } } $newContent | Set-Content src-tauri\Cargo.toml }"

REM Créer le serveur Axum
echo Création du serveur Axum...
if not exist src-tauri\src\server mkdir src-tauri\src\server
(
echo use axum::{routing::get_service, Router};
echo use std::{net::SocketAddr, path::PathBuf};
echo use tower_http::{cors::CorsLayer, services::ServeDir};
echo.
echo pub async fn start_server^(static_dir: PathBuf^) {
echo     let serve_dir = ServeDir::new^(static_dir^).append_index_html_on_directories^(true^);
echo     let serve_service = get_service^(serve_dir^).handle_error^(|error| async move {
echo         println!^("Erreur: {:?}", error^);
echo         ^(axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur"^)
echo     }^);
echo.
echo     let app = Router::new^(^).nest_service^("/", serve_service^).layer^(CorsLayer::permissive^(^)^);
echo     let addr = SocketAddr::from^(^([127, 0, 0, 1], 3000^)^);
echo     println!^("Serveur Axum: http://localhost:3000"^);
echo.
echo     let listener = tokio::net::TcpListener::bind^(addr^).await.unwrap^(^);
echo     axum::serve^(listener, app^).await.unwrap^(^);
echo }
) > src-tauri\src\server\mod.rs

REM Modifier le fichier main.rs
echo Modification du fichier main.rs...
(
echo #![cfg_attr^(all^(not^(debug_assertions^), target_os = "windows"^), windows_subsystem = "windows"^)]
echo.
echo mod server;
echo use std::process::Command;
echo.
echo fn main^(^) {
echo     let static_dir = std::path::PathBuf::from^("%APP_DIR%\\src"^);
echo.
echo     tauri::Builder::default^(^)
echo         .setup^(move |_app| {
echo             let static_dir_clone = static_dir.clone^(^);
echo.
echo             // Serveur Axum
echo             std::thread::spawn^(move || {
echo                 let rt = tokio::runtime::Runtime::new^(^).unwrap^(^);
echo                 rt.block_on^(async {
echo                     server::start_server^(static_dir_clone^).await;
echo                 }^);
echo             }^);
echo.
echo             // Serveur Fastify
echo             std::thread::spawn^(move || {
echo                 std::thread::sleep^(std::time::Duration::from_secs^(2^)^);
echo                 let output = Command::new^("node"^)
echo                     .current_dir^("%APP_DIR%"^)
echo                     .arg^("fastify-server.mjs"^)
echo                     .output^(^);
echo.
echo                 match output {
echo                     Ok^(o^) =^> {
echo                         if !o.status.success^(^) {
echo                             eprintln!^("Erreur fastify: {}", String::from_utf8_lossy^(^&o.stderr^)^);
echo                         }
echo                     },
echo                     Err^(e^) =^> eprintln!^("Erreur: {}", e^),
echo                 }
echo             }^);
echo.
echo             Ok^(^(^)^)
echo         }^)
echo         .run^(tauri::generate_context!^(^)^)
echo         .expect^("Erreur Tauri"^);
echo }
) > src-tauri\src\main.rs

REM Installer les dépendances pour Fastify
echo Installation des dépendances Fastify...
call npm install --save fastify @fastify/cors

REM Créer le serveur Fastify avec gestion des fichiers statiques
echo Création du serveur Fastify...
(
echo import Fastify from 'fastify';
echo import { fileURLToPath } from 'url';
echo import { dirname, join, extname } from 'path';
echo import { readFile, existsSync } from 'fs';
echo import { promisify } from 'util';
echo import fastifyCors from '@fastify/cors';
echo.
echo const readFileAsync = promisify^(readFile^);
echo const fastify = Fastify^({ logger: true }^);
echo await fastify.register^(fastifyCors, { origin: true }^);
echo.
echo const __filename = fileURLToPath^(import.meta.url^);
echo const __dirname = dirname^(__filename^);
echo const PORT = 3001;
echo const srcDir = join^(__dirname, 'src'^);
echo.
echo // Routes API
echo fastify.get^('/api/status', async ^(^) =^> {
echo   return {
echo     status: 'ok',
echo     timestamp: new Date^(^).toISOString^(^)
echo   };
echo }^);
echo.
echo fastify.get^('/api/test', async ^(^) =^> {
echo   return {
echo     message: 'Test réussi!',
echo     server: 'Fastify',
echo     version: fastify.version
echo   };
echo }^);
echo.
echo // Gestionnaire pour servir des fichiers statiques
echo fastify.get^('/*', async ^(request, reply^) =^> {
echo   try {
echo     const requestPath = request.url === '/' ? '/index.html' : request.url;
echo     const filePath = join^(srcDir, requestPath^);
echo.
echo     if ^(existsSync^(filePath^)^) {
echo       const content = await readFileAsync^(filePath^);
echo       const ext = extname^(filePath^).toLowerCase^(^);
echo       let contentType = 'text/plain';
echo.
echo       switch^(ext^) {
echo         case '.html': contentType = 'text/html'; break;
echo         case '.js': contentType = 'application/javascript'; break;
echo         case '.css': contentType = 'text/css'; break;
echo         case '.json': contentType = 'application/json'; break;
echo         case '.png': contentType = 'image/png'; break;
echo         case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
echo       }
echo.
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
echo const start = async ^(^) =^> {
echo   try {
echo     await fastify.listen^({ port: PORT, host: '127.0.0.1' }^);
echo     console.log^(`API Fastify: http://localhost:${PORT}`^);
echo   } catch ^(err^) {
echo     fastify.log.error^(err^);
echo     process.exit^(1^);
echo   }
echo };
echo.
echo start^(^);
) > fastify-server.mjs

REM Lancer l'application
echo Lancement de l'application...
call npm run tauri dev

endlocal