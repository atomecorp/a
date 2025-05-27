#!/bin/bash

# kill any Fastify server running on port 3001
set -e

FASTIFY_PORT=3001

# Récupère les PID écoutant sur $FASTIFY_PORT
PIDS=$(lsof -tiTCP:"$FASTIFY_PORT" -sTCP:LISTEN)

if [ -n "$PIDS" ]; then
  echo "Arrêt du serveur sur le port $FASTIFY_PORT…"
  # Envoie SIGTERM à chaque PID (remplace par -9 si besoin)
  kill $PIDS
else
  echo "Aucun process n'écoute sur le port $FASTIFY_PORT."
fi
# Fonction pour afficher les messages colorés
print_status() {
    local color=$1
    local message=$2
    case $color in
        "green") echo -e "\033[0;32m$message\033[0m" ;;
        "yellow") echo -e "\033[0;33m$message\033[0m" ;;
        "red") echo -e "\033[0;31m$message\033[0m" ;;
        *) echo "$message" ;;
    esac
}

# Fonction pour vérifier si une commande est disponible
check_command() {
    if command -v $1 &> /dev/null; then
        return 0  # La commande existe
    else
        return 1  # La commande n'existe pas
    fi
}

# Fonction pour détecter le système d'exploitation
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "freebsd"* ]]; then
        echo "freebsd"
    else
        echo "unknown"
    fi
}

# Fonction pour détecter le gestionnaire de paquets sur Linux
detect_package_manager() {
    if check_command apt-get; then
        echo "apt"
    elif check_command dnf; then
        echo "dnf"
    elif check_command yum; then
        echo "yum"
    elif check_command pacman; then
        echo "pacman"
    elif check_command zypper; then
        echo "zypper"
    else
        echo "unknown"
    fi
}

# Fonction pour installer Node.js et npm
install_nodejs() {
    if check_command node && check_command npm; then
        print_status "green" "✓ Node.js et npm sont déjà installés"
        print_status "yellow" "  Node.js version: $(node -v)"
        print_status "yellow" "  npm version: $(npm -v)"
        return 0
    fi

    print_status "yellow" "Installation de Node.js et npm..."

    local os=$(detect_os)

    case $os in
        "macos")
            if ! check_command brew; then
                print_status "yellow" "Installation de Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install node
            ;;
        "linux")
            local pm=$(detect_package_manager)
            case $pm in
                "apt")
                    curl -fsSL https://deb.nodesource.com/setup_current.x | sudo -E bash -
                    sudo apt-get install -y nodejs
                    ;;
                "dnf")
                    sudo dnf module install -y nodejs:current
                    ;;
                "yum")
                    curl -fsSL https://rpm.nodesource.com/setup_current.x | sudo bash -
                    sudo yum install -y nodejs
                    ;;
                "pacman")
                    sudo pacman -Sy --noconfirm nodejs npm
                    ;;
                "zypper")
                    sudo zypper refresh
                    sudo zypper install -y nodejs npm
                    ;;
                *)
                    print_status "red" "Gestionnaire de paquets non reconnu. Installation manuelle de Node.js requise."
                    return 1
                    ;;
            esac
            ;;
        "freebsd")
            sudo pkg install -y node npm
            ;;
        *)
            print_status "red" "Système d'exploitation non pris en charge."
            return 1
            ;;
    esac

    if check_command node && check_command npm; then
        print_status "green" "✓ Node.js et npm installés avec succès"
        print_status "yellow" "  Node.js version: $(node -v)"
        print_status "yellow" "  npm version: $(npm -v)"
        return 0
    else
        print_status "red" "✗ Échec de l'installation de Node.js et npm"
        return 1
    fi
}

# Fonction pour installer Rust et Cargo
install_rust() {
    if check_command rustc && check_command cargo; then
        print_status "green" "✓ Rust et Cargo sont déjà installés"
        print_status "yellow" "  Rust version: $(rustc --version)"
        print_status "yellow" "  Cargo version: $(cargo --version)"
        return 0
    fi

    print_status "yellow" "Installation de Rust et Cargo..."

    # rustup est la méthode recommandée pour installer Rust sur toutes les plateformes
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

    # Charger Rust dans l'environnement actuel
    source $HOME/.cargo/env

    if check_command rustc && check_command cargo; then
        print_status "green" "✓ Rust et Cargo installés avec succès"
        print_status "yellow" "  Rust version: $(rustc --version)"
        print_status "yellow" "  Cargo version: $(cargo --version)"
        return 0
    else
        print_status "red" "✗ Échec de l'installation de Rust et Cargo"
        return 1
    fi
}

# Fonction pour installer les dépendances système pour Tauri
install_tauri_dependencies() {
    local os=$(detect_os)

    print_status "yellow" "Installation des dépendances système pour Tauri..."

    case $os in
        "macos")
            if ! check_command xcode-select; then
                print_status "yellow" "Installation des outils de ligne de commande Xcode..."
                xcode-select --install || true
                # On ignore les erreurs car xcode-select --install peut échouer si déjà installé
            fi

            if ! check_command brew; then
                print_status "yellow" "Installation de Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi

            # Installations nécessaires pour Tauri sur macOS
            brew install libiconv
            ;;
        "linux")
            local pm=$(detect_package_manager)
            case $pm in
                "apt")
                    sudo apt-get update
                    sudo apt-get install -y libwebkit2gtk-4.0-dev \
                        build-essential \
                        curl \
                        wget \
                        libssl-dev \
                        libgtk-3-dev \
                        libayatana-appindicator3-dev \
                        librsvg2-dev \
                        patchelf
                    ;;
                "dnf" | "yum")
                    sudo $pm install -y webkit2gtk3-devel \
                        openssl-devel \
                        curl \
                        wget \
                        gtk3-devel \
                        libappindicator-gtk3-devel \
                        librsvg2-devel \
                        patchelf
                    ;;
                "pacman")
                    sudo pacman -Syu --noconfirm webkit2gtk \
                        base-devel \
                        curl \
                        wget \
                        openssl \
                        gtk3 \
                        libappindicator-gtk3 \
                        librsvg \
                        patchelf
                    ;;
                "zypper")
                    sudo zypper install -y webkit2gtk3-devel \
                        curl \
                        wget \
                        libopenssl-devel \
                        gtk3-devel \
                        libappindicator3-devel \
                        librsvg-devel \
                        patchelf
                    ;;
                *)
                    print_status "red" "Gestionnaire de paquets non reconnu. Installation manuelle des dépendances requise."
                    return 1
                    ;;
            esac
            ;;
        "freebsd")
            sudo pkg install -y webkit2-gtk3 \
                curl \
                wget \
                openssl \
                gtk3 \
                libappindicator \
                librsvg2 \
                patchelf
            ;;
        *)
            print_status "red" "Système d'exploitation non pris en charge."
            return 1
            ;;
    esac

    print_status "green" "✓ Dépendances système pour Tauri installées"
    return 0
}

# Fonction pour installer Git
install_git() {
    if check_command git; then
        print_status "green" "✓ Git est déjà installé"
        print_status "yellow" "  Git version: $(git --version)"
        return 0
    fi

    print_status "yellow" "Installation de Git..."

    local os=$(detect_os)

    case $os in
        "macos")
            if ! check_command brew; then
                print_status "yellow" "Installation de Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            brew install git
            ;;
        "linux")
            local pm=$(detect_package_manager)
            case $pm in
                "apt")
                    sudo apt-get update
                    sudo apt-get install -y git
                    ;;
                "dnf" | "yum")
                    sudo $pm install -y git
                    ;;
                "pacman")
                    sudo pacman -Sy --noconfirm git
                    ;;
                "zypper")
                    sudo zypper install -y git
                    ;;
                *)
                    print_status "red" "Gestionnaire de paquets non reconnu. Installation manuelle de Git requise."
                    return 1
                    ;;
            esac
            ;;
        "freebsd")
            sudo pkg install -y git
            ;;
        *)
            print_status "red" "Système d'exploitation non pris en charge."
            return 1
            ;;
    esac

    if check_command git; then
        print_status "green" "✓ Git installé avec succès"
        print_status "yellow" "  Git version: $(git --version)"
        return 0
    else
        print_status "red" "✗ Échec de l'installation de Git"
        return 1
    fi
}

# Fonction pour installer toutes les dépendances
install_dependencies() {
    print_status "yellow" "=== Démarrage de l'installation des dépendances ==="

    local os=$(detect_os)
    if [ "$os" == "unknown" ]; then
        print_status "red" "Système d'exploitation non reconnu. Pris en charge: Linux, macOS, FreeBSD"
        exit 1
    fi

    print_status "yellow" "Système détecté: $os"

    # Installer Git d'abord car il peut être nécessaire pour d'autres installations
    install_git

    # Installer Node.js et npm
    install_nodejs

    # Installer Rust et Cargo
    install_rust

    # Installer les dépendances système pour Tauri
    install_tauri_dependencies

    print_status "green" "=== Toutes les dépendances sont installées avec succès ==="
}

# Fonction principale pour créer et configurer le projet
setup_project() {
    # Définir un nom d'application par défaut
    DEFAULT_APP_NAME="test_app"

    # Vérifier si un nom d'application a été fourni
    if [ $# -eq 0 ]; then
      print_status "yellow" "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
      APP_NAME=$DEFAULT_APP_NAME
    else
      APP_NAME=$1
    fi

    # Vérifier si le répertoire existe déjà
    if [ -d "$APP_NAME" ]; then
      print_status "yellow" "Le répertoire $APP_NAME existe déjà."
      echo -n "Voulez-vous le supprimer? (y/N): "
      read CONFIRM
      CONFIRM=${CONFIRM:-N}

      if [[ $CONFIRM =~ ^[Yy]$ ]]; then
        print_status "yellow" "Suppression du répertoire $APP_NAME..."
        rm -rf "$APP_NAME"
      else
        print_status "yellow" "Conservation du répertoire existant. Lancement de l'application..."
        cd "$APP_NAME"
        npm run tauri dev
        exit 0
      fi
    fi

    # Créer le répertoire src et télécharger acorn.js
    mkdir -p src/squirrel/parser
    curl -o src/squirrel/parser/acorn.js https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.js

    print_status "yellow" "Création de l'application Tauri: $APP_NAME"

    # Créer l'application avec valeurs par défaut
    npm create tauri-app@latest "$APP_NAME" -- --template vanilla --manager npm --yes

    # Sauvegarder les chemins
    CURRENT_DIR=$(pwd)
    cd "$APP_NAME"
    APP_DIR=$(pwd)
    APP_DIR_ABSOLUTE=$(realpath "$APP_DIR")
    cd ..

    # Copier le répertoire src s'il existe
    if [ -d "$CURRENT_DIR/src" ]; then
        print_status "yellow" "Copie des fichiers personnalisés..."
        cp -R "$CURRENT_DIR"/src/* "$APP_DIR"/src/
    else
        print_status "yellow" "Création du répertoire src..."
        mkdir -p "$APP_DIR"/src
    fi

    # Copier le serveur Fastify s'il existe
    if [ -f "$CURRENT_DIR/fastify-server.mjs" ]; then
        print_status "yellow" "Copie du serveur Fastify..."
        cp "$CURRENT_DIR"/fastify-server.mjs "$APP_DIR"/
    else
        print_status "yellow" "Attention: fichier fastify-server.mjs non trouvé à la racine du projet"
    fi

    # Accéder au répertoire de l'application
    cd "$APP_NAME"

    # Ajouter les dépendances Axum
    print_status "yellow" "Ajout des dépendances Axum..."
    if ! grep -q "axum =" src-tauri/Cargo.toml; then
      TEMP_FILE=$(mktemp)
      while IFS= read -r line; do
        echo "$line" >> "$TEMP_FILE"
        if [[ $line == '[dependencies]' ]]; then
          echo "axum = \"0.7.9\"" >> "$TEMP_FILE"
          echo "tokio = { version = \"1\", features = [\"full\"] }" >> "$TEMP_FILE"
          echo "tower-http = { version = \"0.5.0\", features = [\"fs\", \"cors\"] }" >> "$TEMP_FILE"
        fi
      done < src-tauri/Cargo.toml
      mv "$TEMP_FILE" src-tauri/Cargo.toml
    fi

    # Créer le serveur Axum
    print_status "yellow" "Création du serveur Axum..."
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
    print_status "yellow" "Modification du fichier main.rs..."
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
    print_status "yellow" "Installation des dépendances Fastify..."
    npm install --save fastify @fastify/cors

    print_status "yellow" "Lancement de l'application..."
    npm run tauri dev
}

# Fonction principale
main() {
    # Installer les dépendances système
    install_dependencies

    # Configurer et lancer le projet
    setup_project "$@"
}

# Exécution de la fonction principale avec tous les arguments
main "$@"