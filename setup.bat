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

REM Vérifier si le répertoire existe déjà et le supprimer si c'est le cas
if exist "%APP_NAME%" (
  echo Le répertoire %APP_NAME% existe déjà. Suppression...
  rmdir /s /q "%APP_NAME%"
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

REM Copier le contenu du répertoire src vers le répertoire src de l'application
echo Copie des fichiers personnalisés...
xcopy /E /Y /I src "%APP_DIR%\src"

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
echo.
echo     // Démarrage du serveur avec l'API moderne d'Axum
echo     let listener = tokio::net::TcpListener::bind^(addr^).await.unwrap^(^);
echo     axum::serve^(listener, app^).await.unwrap^(^);
echo }
) > src-tauri\src\server\mod.rs

REM Modifier le fichier main.rs avec le chemin absolu vers le répertoire src
echo Modification du fichier main.rs...
(
echo #![cfg_attr^(
echo     all^(not^(debug_assertions^), target_os = "windows"^),
echo     windows_subsystem = "windows"
echo ^)]
echo.
echo mod server;
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
echo.
echo             Ok^(^(^)^)
echo         }^)
echo         .run^(tauri::generate_context!^(^)^)
echo         .expect^("Erreur lors de l'exécution de l'application Tauri"^);
echo }
) > src-tauri\src\main.rs

REM Vérifier le fichier index.html et le modifier si nécessaire
echo Vérification et modification de index.html...
powershell -Command "Write-Host 'Contenu de index.html:'; Get-Content src\index.html; $scriptTags = Select-String -Pattern '<script.*src=\"([^\"]*)\".*>' -Path 'src\index.html' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value }; foreach ($tag in $scriptTags) { $scriptPath = $tag -replace '.*src=\"([^\"]*)\".*', '$1'; if ($scriptPath.StartsWith('/')) { $basePath = $scriptPath.Substring(1); } else { $basePath = $scriptPath; } $newTag = '<script type=\"module\" src=\"http://localhost:3000/' + $basePath + '\" defer></script>'; $escapedTag = [regex]::Escape($tag); (Get-Content src\index.html) -replace $escapedTag, $newTag | Set-Content src\index.html; Write-Host ('Script modifié: ' + $scriptPath + ' -> http://localhost:3000/' + $basePath); }"

REM Créer un fichier de test pour vérifier que le serveur fonctionne
echo Création d'un fichier de test dans le répertoire src...
(
echo console.log^('Le serveur Axum fonctionne correctement!'^);
) > src\test.js

REM Lancer le développement
echo Lancement de l'application en mode développement...
call npm run tauri dev

endlocal