@echo off
setlocal

REM Définir un nom d'application par défaut
set DEFAULT_APP_NAME=my_app

REM Vérifier si un nom d'application a été fourni
set APP_NAME=%1
if "%APP_NAME%"=="" (
    echo Aucun nom d'application fourni, utilisation du nom par défaut: %DEFAULT_APP_NAME%
    set APP_NAME=%DEFAULT_APP_NAME%
) else (
    echo Using app name: %APP_NAME%
)

REM Vérifier si le répertoire existe déjà
if not exist "%APP_NAME%" goto :CREATE_APP

echo Le répertoire %APP_NAME% existe déjà.
echo Voulez-vous le supprimer? (y/N):
set CONFIRM=
set /p CONFIRM=
if "%CONFIRM%"=="" set CONFIRM=N
if /i not "%CONFIRM%"=="Y" goto :USE_EXISTING

echo Suppression du répertoire %APP_NAME%...
rmdir /s /q "%APP_NAME%"
goto :CREATE_APP

:USE_EXISTING
echo Conservation du répertoire existant. Lancement de l'application...
cd %APP_NAME%
call npm run tauri dev
exit /b 0

:CREATE_APP
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

REM Ajouter les dépendances Axum en utilisant un fichier temporaire
echo Ajout des dépendances Axum...
powershell -Command "$content = Get-Content src-tauri\Cargo.toml; if (-not (Select-String -Pattern 'axum =' -Path 'src-tauri\Cargo.toml' -Quiet)) { $updated = $false; $newContent = @(); foreach($line in $content) { $newContent += $line; if ($line.Trim() -eq '[dependencies]' -and -not $updated) { $newContent += 'axum = \"0.7.9\"'; $newContent += 'tokio = { version = \"1\", features = [\"full\"] }'; $newContent += 'tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }'; $updated = $true; } } $newContent | Set-Content src-tauri\Cargo.toml }"

REM Créer le serveur Axum en utilisant un fichier temporaire
echo Création du serveur Axum...
if not exist src-tauri\src\server mkdir src-tauri\src\server

REM Créer le fichier mod.rs temporaire
echo use axum::{routing::get_service, Router}; > mod_rs_temp.txt
echo use std::{net::SocketAddr, path::PathBuf}; >> mod_rs_temp.txt
echo use tower_http::{cors::CorsLayer, services::ServeDir}; >> mod_rs_temp.txt
echo. >> mod_rs_temp.txt
echo pub async fn start_server(static_dir: PathBuf) { >> mod_rs_temp.txt
echo     let serve_dir = ServeDir::new(static_dir).append_index_html_on_directories(true); >> mod_rs_temp.txt
echo     let serve_service = get_service(serve_dir).handle_error(^|error^| async move { >> mod_rs_temp.txt
echo         println!("Erreur: {:?}", error); >> mod_rs_temp.txt
echo         (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur") >> mod_rs_temp.txt
echo     }); >> mod_rs_temp.txt
echo. >> mod_rs_temp.txt
echo     let app = Router::new().nest_service("/", serve_service).layer(CorsLayer::permissive()); >> mod_rs_temp.txt
echo     let addr = SocketAddr::from(([127, 0, 0, 1], 3000)); >> mod_rs_temp.txt
echo     println!("Serveur Axum: http://localhost:3000"); >> mod_rs_temp.txt
echo. >> mod_rs_temp.txt
echo     let listener = tokio::net::TcpListener::bind(addr).await.unwrap(); >> mod_rs_temp.txt
echo     axum::serve(listener, app).await.unwrap(); >> mod_rs_temp.txt
echo } >> mod_rs_temp.txt

REM Copier le fichier temporaire vers la destination
copy /Y mod_rs_temp.txt src-tauri\src\server\mod.rs
del mod_rs_temp.txt

REM Créer le fichier main.rs temporaire avec les chemins raw string
echo Modification du fichier main.rs...
echo #![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")] > main_rs_temp.txt
echo. >> main_rs_temp.txt
echo mod server; >> main_rs_temp.txt
echo use std::process::Command; >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo fn main() { >> main_rs_temp.txt
echo     let static_dir = std::path::PathBuf::from(r"%APP_DIR%\src"); >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo     tauri::Builder::default() >> main_rs_temp.txt
echo         .setup(move ^|_app^| { >> main_rs_temp.txt
echo             let static_dir_clone = static_dir.clone(); >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo             // Serveur Axum >> main_rs_temp.txt
echo             std::thread::spawn(move ^|^| { >> main_rs_temp.txt
echo                 let rt = tokio::runtime::Runtime::new().unwrap(); >> main_rs_temp.txt
echo                 rt.block_on(async { >> main_rs_temp.txt
echo                     server::start_server(static_dir_clone).await; >> main_rs_temp.txt
echo                 }); >> main_rs_temp.txt
echo             }); >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo             // Serveur Fastify >> main_rs_temp.txt
echo             std::thread::spawn(move ^|^| { >> main_rs_temp.txt
echo                 std::thread::sleep(std::time::Duration::from_secs(2)); >> main_rs_temp.txt
echo                 let output = Command::new("node") >> main_rs_temp.txt
echo                     .current_dir(r"%APP_DIR%") >> main_rs_temp.txt
echo                     .arg("fastify-server.mjs") >> main_rs_temp.txt
echo                     .output(); >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo                 match output { >> main_rs_temp.txt
echo                     Ok(o) =^> { >> main_rs_temp.txt
echo                         if !o.status.success() { >> main_rs_temp.txt
echo                             eprintln!("Erreur fastify: {}", String::from_utf8_lossy(^&o.stderr)); >> main_rs_temp.txt
echo                         } >> main_rs_temp.txt
echo                     }, >> main_rs_temp.txt
echo                     Err(e) =^> eprintln!("Erreur: {}", e), >> main_rs_temp.txt
echo                 } >> main_rs_temp.txt
echo             }); >> main_rs_temp.txt
echo. >> main_rs_temp.txt
echo             Ok(()) >> main_rs_temp.txt
echo         }) >> main_rs_temp.txt
echo         .run(tauri::generate_context!()) >> main_rs_temp.txt
echo         .expect("Erreur Tauri"); >> main_rs_temp.txt
echo } >> main_rs_temp.txt

REM Copier le fichier temporaire vers la destination
copy /Y main_rs_temp.txt src-tauri\src\main.rs
del main_rs_temp.txt

REM Installer les dépendances pour Fastify
echo Installation des dépendances Fastify...
call npm install --save fastify @fastify/cors

REM Créer le serveur Fastify en utilisant un fichier temporaire
echo Création du serveur Fastify...
echo import Fastify from 'fastify'; > fastify_temp.mjs
echo import { fileURLToPath } from 'url'; >> fastify_temp.mjs
echo import { dirname, join, extname } from 'path'; >> fastify_temp.mjs
echo import { readFile, existsSync } from 'fs'; >> fastify_temp.mjs
echo import { promisify } from 'util'; >> fastify_temp.mjs
echo import fastifyCors from '@fastify/cors'; >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo const readFileAsync = promisify(readFile); >> fastify_temp.mjs
echo const fastify = Fastify({ logger: true }); >> fastify_temp.mjs
echo await fastify.register(fastifyCors, { origin: true }); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo const __filename = fileURLToPath(import.meta.url); >> fastify_temp.mjs
echo const __dirname = dirname(__filename); >> fastify_temp.mjs
echo const PORT = 3001; >> fastify_temp.mjs
echo const srcDir = join(__dirname, 'src'); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo // Routes API >> fastify_temp.mjs
echo fastify.get('/api/status', async () =^> { >> fastify_temp.mjs
echo   return { >> fastify_temp.mjs
echo     status: 'ok', >> fastify_temp.mjs
echo     timestamp: new Date().toISOString() >> fastify_temp.mjs
echo   }; >> fastify_temp.mjs
echo }); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo fastify.get('/api/test', async () =^> { >> fastify_temp.mjs
echo   return { >> fastify_temp.mjs
echo     message: 'Test réussi!', >> fastify_temp.mjs
echo     server: 'Fastify', >> fastify_temp.mjs
echo     version: fastify.version >> fastify_temp.mjs
echo   }; >> fastify_temp.mjs
echo }); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo // Gestionnaire pour servir des fichiers statiques >> fastify_temp.mjs
echo fastify.get('/*', async (request, reply) =^> { >> fastify_temp.mjs
echo   try { >> fastify_temp.mjs
echo     const requestPath = request.url === '/' ? '/index.html' : request.url; >> fastify_temp.mjs
echo     const filePath = join(srcDir, requestPath); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo     if (existsSync(filePath)) { >> fastify_temp.mjs
echo       const content = await readFileAsync(filePath); >> fastify_temp.mjs
echo       const ext = extname(filePath).toLowerCase(); >> fastify_temp.mjs
echo       let contentType = 'text/plain'; >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo       switch(ext) { >> fastify_temp.mjs
echo         case '.html': contentType = 'text/html'; break; >> fastify_temp.mjs
echo         case '.js': contentType = 'application/javascript'; break; >> fastify_temp.mjs
echo         case '.css': contentType = 'text/css'; break; >> fastify_temp.mjs
echo         case '.json': contentType = 'application/json'; break; >> fastify_temp.mjs
echo         case '.png': contentType = 'image/png'; break; >> fastify_temp.mjs
echo         case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break; >> fastify_temp.mjs
echo       } >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo       reply.type(contentType).send(content); >> fastify_temp.mjs
echo     } else { >> fastify_temp.mjs
echo       reply.code(404).send({ error: 'Fichier non trouvé' }); >> fastify_temp.mjs
echo     } >> fastify_temp.mjs
echo   } catch (err) { >> fastify_temp.mjs
echo     fastify.log.error(err); >> fastify_temp.mjs
echo     reply.code(500).send({ error: 'Erreur interne du serveur' }); >> fastify_temp.mjs
echo   } >> fastify_temp.mjs
echo }); >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo const start = async () =^> { >> fastify_temp.mjs
echo   try { >> fastify_temp.mjs
echo     await fastify.listen({ port: PORT, host: '127.0.0.1' }); >> fastify_temp.mjs
echo     console.log(`API Fastify: http://localhost:${PORT}`); >> fastify_temp.mjs
echo   } catch (err) { >> fastify_temp.mjs
echo     fastify.log.error(err); >> fastify_temp.mjs
echo     process.exit(1); >> fastify_temp.mjs
echo   } >> fastify_temp.mjs
echo }; >> fastify_temp.mjs
echo. >> fastify_temp.mjs
echo start(); >> fastify_temp.mjs

REM Copier le fichier temporaire vers la destination
copy /Y fastify_temp.mjs fastify-server.mjs
del fastify_temp.mjs

REM Lancer l'application
echo Lancement de l'application...
call npm run tauri dev

endlocal