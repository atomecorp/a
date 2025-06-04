@echo off
setlocal enabledelayedexpansion

REM === OPTIONAL PREREQUISITE SCRIPTS ===
REM Run these first, then continue with the original working script

if exist ".\install_prism.bat" (
    echo Running Prism installation...
    call ".\install_prism.bat"
    echo Prism installation completed.
    echo.
)

if exist ".\watcher.bat" (
    echo Starting watcher in background...
    start /b "" cmd /c ".\watcher.bat"
    echo Watcher started.
    echo.
)

REM === ORIGINAL WORKING SCRIPT STARTS HERE ===

:: Variables globales
set "DEFAULT_APP_NAME=atome"
set "NODE_VERSION=20.11.0"
set "RUST_INSTALLED=false"
set "NODE_INSTALLED=false"
goto :main

:: Fonction pour afficher les messages colorés
:print_status
    set "color=%~1"
    set "message=%~2"
    if "!color!"=="green" (
        echo [92m!message![0m
    ) else if "!color!"=="yellow" (
        echo [93m!message![0m
    ) else if "!color!"=="red" (
        echo [91m!message![0m
    ) else (
        echo !message!
    )
goto :eof

:: Fonction pour vérifier si une commande est disponible
:check_command
    where %1 >nul 2>&1
    if %errorlevel% equ 0 (
        exit /b 0
    ) else (
        exit /b 1
    )
goto :eof

:: Fonction pour télécharger un fichier
:download_file
    set "url=%~1"
    set "output=%~2"
    powershell -Command "try { Invoke-WebRequest -Uri '%url%' -OutFile '%output%' -UseBasicParsing } catch { exit 1 }"
    if %errorlevel% neq 0 (
        call :print_status "red" "Erreur lors du téléchargement de %url%"
        exit /b 1
    )
goto :eof

:: Fonction pour installer Chocolatey
:install_chocolatey
    call :check_command choco
    if %errorlevel% equ 0 (
        call :print_status "green" "✓ Chocolatey est déjà installé"
        goto :eof
    )

    call :print_status "yellow" "Installation de Chocolatey..."
    powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"

    :: Actualiser les variables d'environnement
    call refreshenv >nul 2>&1

    call :check_command choco
    if %errorlevel% equ 0 (
        call :print_status "green" "✓ Chocolatey installé avec succès"
    ) else (
        call :print_status "red" "✗ Échec de l'installation de Chocolatey"
        exit /b 1
    )
goto :eof

:: Fonction pour installer Node.js et npm
:install_nodejs
    call :check_command node
    set "node_check=%errorlevel%"
    call :check_command npm
    set "npm_check=%errorlevel%"

    if %node_check% equ 0 if %npm_check% equ 0 (
        call :print_status "green" "✓ Node.js et npm sont déjà installés"
        for /f "tokens=*" %%i in ('node -v') do call :print_status "yellow" "  Node.js version: %%i"
        for /f "tokens=*" %%i in ('npm -v') do call :print_status "yellow" "  npm version: %%i"
        set "NODE_INSTALLED=true"
        goto :eof
    )

    call :print_status "yellow" "Installation de Node.js et npm..."

    :: Installer via Chocolatey
    call :install_chocolatey
    if %errorlevel% neq 0 goto :eof

    choco install nodejs -y
    if %errorlevel% neq 0 (
        call :print_status "red" "✗ Échec de l'installation de Node.js via Chocolatey"

        :: Fallback: installation manuelle
        call :print_status "yellow" "Tentative d'installation manuelle..."
        set "node_installer=node-v%NODE_VERSION%-x64.msi"
        call :download_file "https://nodejs.org/dist/v%NODE_VERSION%/!node_installer!" "!node_installer!"
        if %errorlevel% neq 0 goto :eof

        call :print_status "yellow" "Lancement de l'installateur Node.js..."
        msiexec /i "!node_installer!" /quiet /norestart
        if %errorlevel% neq 0 (
            call :print_status "red" "✗ Échec de l'installation manuelle de Node.js"
            exit /b 1
        )
        del "!node_installer!" >nul 2>&1
    )

    :: Actualiser les variables d'environnement
    call refreshenv >nul 2>&1

    call :check_command node
    set "node_check=%errorlevel%"
    call :check_command npm
    set "npm_check=%errorlevel%"

    if %node_check% equ 0 if %npm_check% equ 0 (
        call :print_status "green" "✓ Node.js et npm installés avec succès"
        for /f "tokens=*" %%i in ('node -v') do call :print_status "yellow" "  Node.js version: %%i"
        for /f "tokens=*" %%i in ('npm -v') do call :print_status "yellow" "  npm version: %%i"
        set "NODE_INSTALLED=true"
    ) else (
        call :print_status "red" "✗ Échec de l'installation de Node.js et npm"
        call :print_status "yellow" "Veuillez redémarrer votre terminal et relancer le script"
        exit /b 1
    )
goto :eof

:: Fonction pour installer Rust et Cargo
:install_rust
    call :check_command rustc
    set "rustc_check=%errorlevel%"
    call :check_command cargo
    set "cargo_check=%errorlevel%"

    if %rustc_check% equ 0 if %cargo_check% equ 0 (
        call :print_status "green" "✓ Rust et Cargo sont déjà installés"
        for /f "tokens=*" %%i in ('rustc --version') do call :print_status "yellow" "  Rust version: %%i"
        for /f "tokens=*" %%i in ('cargo --version') do call :print_status "yellow" "  Cargo version: %%i"
        set "RUST_INSTALLED=true"
        goto :eof
    )

    call :print_status "yellow" "Installation de Rust et Cargo..."

    :: Télécharger rustup-init.exe
    set "rustup_installer=rustup-init.exe"
    call :download_file "https://win.rustup.rs/x86_64" "!rustup_installer!"
    if %errorlevel% neq 0 goto :eof

    :: Installer Rust avec rustup
    call :print_status "yellow" "Lancement de l'installateur Rust..."
    "!rustup_installer!" -y --default-toolchain stable
    if %errorlevel% neq 0 (
        call :print_status "red" "✗ Échec de l'installation de Rust"
        del "!rustup_installer!" >nul 2>&1
        exit /b 1
    )

    del "!rustup_installer!" >nul 2>&1

    :: Ajouter Cargo au PATH pour la session actuelle
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

    call :check_command rustc
    set "rustc_check=%errorlevel%"
    call :check_command cargo
    set "cargo_check=%errorlevel%"

    if %rustc_check% equ 0 if %cargo_check% equ 0 (
        call :print_status "green" "✓ Rust et Cargo installés avec succès"
        for /f "tokens=*" %%i in ('rustc --version') do call :print_status "yellow" "  Rust version: %%i"
        for /f "tokens=*" %%i in ('cargo --version') do call :print_status "yellow" "  Cargo version: %%i"
        set "RUST_INSTALLED=true"
    ) else (
        call :print_status "red" "✗ Échec de l'installation de Rust et Cargo"
        call :print_status "yellow" "Veuillez redémarrer votre terminal et relancer le script"
        exit /b 1
    )
goto :eof

:: Fonction pour installer Visual Studio Build Tools
:install_build_tools
    :: Vérifier si les Build Tools sont déjà installés
    if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe" (
        call :print_status "green" "✓ Visual Studio Build Tools 2019 déjà installés"
        goto :eof
    )
    if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe" (
        call :print_status "green" "✓ Visual Studio Build Tools 2022 déjà installés"
        goto :eof
    )

    call :print_status "yellow" "Installation des Visual Studio Build Tools..."

    :: Installer via Chocolatey
    call :install_chocolatey
    if %errorlevel% neq 0 goto :eof

    choco install visualstudio2022buildtools -y
    if %errorlevel% neq 0 (
        call :print_status "yellow" "Tentative avec les Build Tools 2019..."
        choco install visualstudio2019buildtools -y
        if %errorlevel% neq 0 (
            call :print_status "red" "✗ Échec de l'installation des Build Tools"
            call :print_status "yellow" "Vous devrez peut-être installer manuellement Visual Studio Build Tools"
            exit /b 1
        )
    )

    call :print_status "green" "✓ Visual Studio Build Tools installés"
goto :eof

:: Fonction pour installer Git
:install_git
    call :check_command git
    if %errorlevel% equ 0 (
        call :print_status "green" "✓ Git est déjà installé"
        for /f "tokens=*" %%i in ('git --version') do call :print_status "yellow" "  Git version: %%i"
        goto :eof
    )

    call :print_status "yellow" "Installation de Git..."

    call :install_chocolatey
    if %errorlevel% neq 0 goto :eof

    choco install git -y
    if %errorlevel% neq 0 (
        call :print_status "red" "✗ Échec de l'installation de Git"
        exit /b 1
    )

    :: Actualiser les variables d'environnement
    call refreshenv >nul 2>&1

    call :check_command git
    if %errorlevel% equ 0 (
        call :print_status "green" "✓ Git installé avec succès"
        for /f "tokens=*" %%i in ('git --version') do call :print_status "yellow" "  Git version: %%i"
    ) else (
        call :print_status "red" "✗ Échec de l'installation de Git"
        call :print_status "yellow" "Veuillez redémarrer votre terminal et relancer le script"
        exit /b 1
    )
goto :eof

:: Fonction pour ajouter les dépendances Cargo
:add_cargo_dependencies
    call :print_status "yellow" "Modification du fichier Cargo.toml..."

    :: Créer un fichier temporaire avec le nouveau contenu
    set "temp_cargo=%TEMP%\cargo_temp.toml"
    set "original_cargo=src-tauri\Cargo.toml"

    :: Lire le fichier original ligne par ligne et ajouter les dépendances après [dependencies]
    set "deps_added=false"
    (
        for /f "usebackq delims=" %%a in ("!original_cargo!") do (
            echo %%a
            if "%%a"=="[dependencies]" if "!deps_added!"=="false" (
                echo axum = "0.7.9"
                echo tokio = { version = "1", features = ["full"] }
                echo tower-http = { version = "0.5.0", features = ["fs", "cors"] }
                set "deps_added=true"
            )
        )
    ) > "!temp_cargo!"

    :: Remplacer l'original par le fichier modifié
    copy "!temp_cargo!" "!original_cargo!" >nul
    del "!temp_cargo!" >nul 2>&1

    call :print_status "green" "✓ Dépendances Axum ajoutées avec succès"
goto :eof

:: Fonction pour installer toutes les dépendances
:install_dependencies
    call :print_status "yellow" "=== Démarrage de l'installation des dépendances ==="
    call :print_status "yellow" "Système détecté: Windows"

    :: Installer Git d'abord
    call :install_git

    :: Installer les Build Tools
    call :install_build_tools

    :: Installer Node.js et npm
    call :install_nodejs

    :: Installer Rust et Cargo
    call :install_rust

    call :print_status "green" "=== Toutes les dépendances sont installées avec succès ==="
goto :eof

:: Fonction pour créer le serveur Axum
:create_axum_server
    call :print_status "yellow" "Création du serveur Axum..."
    mkdir src-tauri\src\server 2>nul

    :: Créer le fichier directement avec echo
    set "server_file=src-tauri\src\server\mod.rs"

    :: Supprimer le fichier s'il existe
    if exist "%server_file%" del "%server_file%"

    :: Désactiver temporairement l'expansion retardée pour préserver les !
    setlocal disabledelayedexpansion

    :: Écrire le fichier ligne par ligne
    echo use axum::{routing::get_service, Router};> "%server_file%"
    echo use std::{net::SocketAddr, path::PathBuf};>> "%server_file%"
    echo use tower_http::{cors::CorsLayer, services::ServeDir};>> "%server_file%"
    echo.>> "%server_file%"
    echo pub async fn start_server(static_dir: PathBuf) {>> "%server_file%"
    echo     let serve_dir = ServeDir::new(static_dir).append_index_html_on_directories(true);>> "%server_file%"
    echo     let serve_service = get_service(serve_dir).handle_error(^|error^| async move {>> "%server_file%"
    echo         println!("Erreur: {:?}", error);>> "%server_file%"
    echo         (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur")>> "%server_file%"
    echo     });>> "%server_file%"
    echo.>> "%server_file%"
    echo     let app = Router::new()>> "%server_file%"
    echo         .nest_service("/", serve_service)>> "%server_file%"
    echo         .layer(CorsLayer::permissive());>> "%server_file%"
    echo.>> "%server_file%"
    echo     let addr = SocketAddr::from(([127, 0, 0, 1], 3000));>> "%server_file%"
    echo     println!("Serveur Axum: http://localhost:3000");>> "%server_file%"
    echo.>> "%server_file%"
    echo     let listener = tokio::net::TcpListener::bind(addr).await.unwrap();>> "%server_file%"
    echo     axum::serve(listener, app).await.unwrap();>> "%server_file%"
    echo }>> "%server_file%"

    :: Réactiver l'expansion retardée
    endlocal

    if not exist "%server_file%" (
        call :print_status "red" "✗ Échec de la création du serveur Axum"
        exit /b 1
    )

    call :print_status "green" "✓ Serveur Axum créé avec succès"
goto :eof

:: Fonction pour créer le fichier main.rs
:create_main_rs
    call :print_status "yellow" "Création du fichier main.rs..."

    :: Créer le fichier directement avec echo
    set "main_file=src-tauri\src\main.rs"

    :: Supprimer le fichier s'il existe
    if exist "%main_file%" del "%main_file%"

    :: Désactiver temporairement l'expansion retardée pour préserver les !
    setlocal disabledelayedexpansion

    :: Écrire le fichier ligne par ligne
    echo #![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]> "%main_file%"
    echo.>> "%main_file%"
    echo mod server;>> "%main_file%"
    echo use std::process::Command;>> "%main_file%"
    echo.>> "%main_file%"
    echo fn main() {>> "%main_file%"
    echo     let static_dir = std::path::PathBuf::from("%APP_DIR:\=\\%\\src");>> "%main_file%"
    echo.>> "%main_file%"
    echo     tauri::Builder::default()>> "%main_file%"
    echo         .setup(move ^|_app^| {>> "%main_file%"
    echo             let static_dir_clone = static_dir.clone();>> "%main_file%"
    echo.>> "%main_file%"
    echo             // Serveur Axum>> "%main_file%"
    echo             std::thread::spawn(move ^|^| {>> "%main_file%"
    echo                 let rt = tokio::runtime::Runtime::new().unwrap();>> "%main_file%"
    echo                 rt.block_on(async {>> "%main_file%"
    echo                     server::start_server(static_dir_clone).await;>> "%main_file%"
    echo                 });>> "%main_file%"
    echo             });>> "%main_file%"
    echo.>> "%main_file%"
    echo             // Serveur Fastify>> "%main_file%"
    echo             std::thread::spawn(move ^|^| {>> "%main_file%"
    echo                 std::thread::sleep(std::time::Duration::from_secs(2));>> "%main_file%"
    echo                 let output = Command::new("node")>> "%main_file%"
    echo                     .current_dir("%APP_DIR:\=\\%")>> "%main_file%"
    echo                     .arg("fastify-server.mjs")>> "%main_file%"
    echo                     .output();>> "%main_file%"
    echo.>> "%main_file%"
    echo                 match output {>> "%main_file%"
    echo                     Ok(o) =^> {>> "%main_file%"
    echo                         if !o.status.success() {>> "%main_file%"
    echo                             println!("Erreur fastify: {}", String::from_utf8_lossy(^&o.stderr));>> "%main_file%"
    echo                         }>> "%main_file%"
    echo                     }>> "%main_file%"
    echo                     Err(e) =^> println!("Erreur: {}", e),>> "%main_file%"
    echo                 }>> "%main_file%"
    echo             });>> "%main_file%"
    echo.>> "%main_file%"
    echo             Ok(())>> "%main_file%"
    echo         })>> "%main_file%"
    echo         .run(tauri::generate_context!())>> "%main_file%"
    echo         .expect("Erreur Tauri");>> "%main_file%"
    echo }>> "%main_file%"

    :: Réactiver l'expansion retardée
    endlocal

    if not exist "%main_file%" (
        call :print_status "red" "✗ Échec de la création du fichier main.rs"
        exit /b 1
    )

    call :print_status "green" "✓ Fichier main.rs créé avec succès"
goto :eof

:: Fonction principale pour créer et configurer le projet
:setup_project
    :: Définir le nom de l'application
    if "%~1"=="" (
        call :print_status "yellow" "Aucun nom d'application fourni, utilisation du nom par défaut: %DEFAULT_APP_NAME%"
        set "APP_NAME=%DEFAULT_APP_NAME%"
    ) else (
        set "APP_NAME=%~1"
    )

    :: Vérifier si le répertoire existe déjà
    if exist "%APP_NAME%" (
        call :print_status "yellow" "Le répertoire %APP_NAME% existe déjà."
        set /p "CONFIRM=Voulez-vous le supprimer? (y/N): "
        if /i "!CONFIRM!"=="y" (
            call :print_status "yellow" "Suppression du répertoire %APP_NAME%..."
            rmdir /s /q "%APP_NAME%"
        ) else (
            call :print_status "yellow" "Conservation du répertoire existant. Lancement de l'application..."
            cd "%APP_NAME%"
            npm run tauri dev
            exit /b 0
        )
    )

    :: Créer le répertoire src et télécharger acorn.js
    mkdir src\squirrel\parser 2>nul
    call :download_file "https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.js" "src\squirrel\parser\acorn.js"

    call :print_status "yellow" "Création de l'application Tauri: %APP_NAME%"

    :: Créer l'application avec valeurs par défaut
    call npm create tauri-app@latest "%APP_NAME%" -- --template vanilla --manager npm --yes
    if %errorlevel% neq 0 (
        call :print_status "red" "✗ Échec de la création de l'application Tauri"
        exit /b 1
    )

    :: Sauvegarder les chemins
    set "CURRENT_DIR=%CD%"
    cd "%APP_NAME%"
    set "APP_DIR=%CD%"
    cd ..

    :: Copier le répertoire src s'il existe
    if exist "%CURRENT_DIR%\src" (
        call :print_status "yellow" "Copie des fichiers personnalisés..."
        xcopy "%CURRENT_DIR%\src\*" "%APP_DIR%\src\" /E /I /Y >nul
    ) else (
        call :print_status "yellow" "Création du répertoire src..."
        mkdir "%APP_DIR%\src" 2>nul
    )

    :: Copier le serveur Fastify s'il existe
    if exist "%CURRENT_DIR%\fastify-server.mjs" (
        call :print_status "yellow" "Copie du serveur Fastify..."
        copy "%CURRENT_DIR%\fastify-server.mjs" "%APP_DIR%\" >nul
    ) else (
        call :print_status "yellow" "Attention: fichier fastify-server.mjs non trouvé à la racine du projet"
    )

    :: Accéder au répertoire de l'application
    cd "%APP_NAME%"

    :: Ajouter les dépendances Axum
    call :print_status "yellow" "Ajout des dépendances Axum..."
    findstr /C:"axum =" src-tauri\Cargo.toml >nul 2>&1
    if %errorlevel% neq 0 (
        call :add_cargo_dependencies
    )

    :: Créer le serveur Axum
    call :create_axum_server
    if %errorlevel% neq 0 exit /b 1

    :: Modifier le fichier main.rs
    call :create_main_rs
    if %errorlevel% neq 0 exit /b 1

    :: Installer les dépendances pour Fastify
    call :print_status "yellow" "Installation des dépendances Fastify..."
    call npm install --save fastify @fastify/cors
    if %errorlevel% neq 0 (
        call :print_status "red" "✗ Échec de l'installation des dépendances Fastify"
        exit /b 1
    )

    call :print_status "green" "✓ Configuration terminée avec succès!"
    call :print_status "yellow" "Lancement de l'application..."
    call npm run tauri dev
goto :eof

:: Fonction principale
:main
    :: Vérifier les privilèges administrateur
    net session >nul 2>&1
    if %errorlevel% neq 0 (
        call :print_status "yellow" "Certaines installations peuvent nécessiter les droits administrateur."
        call :print_status "yellow" "Si des erreurs surviennent, relancez ce script en tant qu'administrateur."
        echo.
    )

    :: Installer les dépendances système
    call :install_dependencies
    if %errorlevel% neq 0 exit /b 1

    :: Configurer et lancer le projet
    call :setup_project %*
goto :eof

:: Point d'entrée principal
call :main %*