#!/bin/bash

# Script d'installation Tauri corrigé - Version complètement réécrite
set -e  # Arrête le script en cas d'erreur

FASTIFY_PORT=3001

# Fonction pour afficher les messages avec timestamp
print_status() {
    local color=$1
    local message=$2
    local timestamp=$(date '+%H:%M:%S')
    case $color in
        "green") echo -e "[$timestamp] \033[0;32m$message\033[0m" ;;
        "yellow") echo -e "[$timestamp] \033[0;33m$message\033[0m" ;;
        "red") echo -e "[$timestamp] \033[0;31m$message\033[0m" ;;
        *) echo "[$timestamp] $message" ;;
    esac
}

# Fonction de debug pour tracer l'exécution
debug_trace() {
    if [ "${DEBUG:-0}" = "1" ]; then
        print_status "yellow" "DEBUG: $1"
    fi
}

# Fonction pour tuer les processus sur le port 3001
kill_fastify_server() {
    debug_trace "Recherche de processus sur le port $FASTIFY_PORT"
    
    if command -v lsof >/dev/null 2>&1; then
        PIDS=$(lsof -tiTCP:"$FASTIFY_PORT" -sTCP:LISTEN 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            print_status "yellow" "Arrêt du serveur sur le port $FASTIFY_PORT (PIDs: $PIDS)..."
            kill $PIDS 2>/dev/null || true
            sleep 2
        else
            debug_trace "Aucun processus n'écoute sur le port $FASTIFY_PORT"
        fi
    fi
}

# Fonction pour vérifier si une commande est disponible
check_command() {
    debug_trace "Vérification de la commande: $1"
    if command -v "$1" >/dev/null 2>&1; then
        debug_trace "Commande $1 trouvée"
        return 0
    else
        debug_trace "Commande $1 non trouvée"
        return 1
    fi
}

# Fonction pour détecter le système d'exploitation
detect_os() {
    debug_trace "Détection du système d'exploitation: $OSTYPE"
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
    debug_trace "Détection du gestionnaire de paquets"
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

# Fonction pour vérifier les versions Node.js
check_node_version() {
    if check_command node; then
        NODE_VERSION=$(node -v | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 16 ]; then
            return 0
        else
            print_status "yellow" "Version Node.js trop ancienne ($NODE_VERSION). Version 16+ requise."
            return 1
        fi
    fi
    return 1
}

# Fonction pour installer Node.js et npm avec vérification améliorée
install_nodejs() {
    print_status "yellow" "=== Installation de Node.js et npm ==="
    
    if check_node_version && check_command npm; then
        print_status "green" "✓ Node.js et npm sont déjà installés et compatibles"
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
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || {
                    print_status "red" "Échec de l'installation de Homebrew"
                    return 1
                }
            fi
            brew install node || {
                print_status "red" "Échec de l'installation de Node.js via Homebrew"
                return 1
            }
            ;;
        "linux")
            local pm=$(detect_package_manager)
            case $pm in
                "apt")
                    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || {
                        print_status "red" "Échec du téléchargement du script NodeSource"
                        return 1
                    }
                    sudo apt-get install -y nodejs || {
                        print_status "red" "Échec de l'installation de Node.js via apt"
                        return 1
                    }
                    ;;
                "dnf")
                    sudo dnf module install -y nodejs:current/common || {
                        print_status "red" "Échec de l'installation de Node.js via dnf"
                        return 1
                    }
                    ;;
                "yum")
                    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - || {
                        print_status "red" "Échec du téléchargement du script NodeSource"
                        return 1
                    }
                    sudo yum install -y nodejs || {
                        print_status "red" "Échec de l'installation de Node.js via yum"
                        return 1
                    }
                    ;;
                "pacman")
                    sudo pacman -Sy --noconfirm nodejs npm || {
                        print_status "red" "Échec de l'installation de Node.js via pacman"
                        return 1
                    }
                    ;;
                "zypper")
                    sudo zypper refresh && sudo zypper install -y nodejs npm || {
                        print_status "red" "Échec de l'installation de Node.js via zypper"
                        return 1
                    }
                    ;;
                *)
                    print_status "red" "Gestionnaire de paquets non reconnu ($pm)"
                    print_status "yellow" "Veuillez installer Node.js manuellement depuis https://nodejs.org/"
                    return 1
                    ;;
            esac
            ;;
        "freebsd")
            sudo pkg install -y node npm || {
                print_status "red" "Échec de l'installation de Node.js via pkg"
                return 1
            }
            ;;
        *)
            print_status "red" "Système d'exploitation non pris en charge ($os)"
            return 1
            ;;
    esac

    # Vérifier l'installation
    if check_node_version && check_command npm; then
        print_status "green" "✓ Node.js et npm installés avec succès"
        print_status "yellow" "  Node.js version: $(node -v)"
        print_status "yellow" "  npm version: $(npm -v)"
        return 0
    else
        print_status "red" "✗ Échec de l'installation de Node.js et npm"
        print_status "yellow" "Essayez d'installer manuellement depuis https://nodejs.org/"
        return 1
    fi
}

# Fonction pour installer Rust avec gestion d'erreurs améliorée
install_rust() {
    print_status "yellow" "=== Installation de Rust et Cargo ==="
    
    if check_command rustc && check_command cargo; then
        print_status "green" "✓ Rust et Cargo sont déjà installés"
        print_status "yellow" "  Rust version: $(rustc --version)"
        print_status "yellow" "  Cargo version: $(cargo --version)"
        return 0
    fi

    print_status "yellow" "Installation de Rust et Cargo via rustup..."

    # Télécharger et installer rustup
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y || {
        print_status "red" "Échec de l'installation de rustup"
        return 1
    }

    # Charger Rust dans l'environnement actuel
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    else
        export PATH="$HOME/.cargo/bin:$PATH"
    fi

    # Vérifier l'installation
    if check_command rustc && check_command cargo; then
        print_status "green" "✓ Rust et Cargo installés avec succès"
        print_status "yellow" "  Rust version: $(rustc --version)"
        print_status "yellow" "  Cargo version: $(cargo --version)"
        return 0
    else
        print_status "red" "✗ Échec de l'installation de Rust et Cargo"
        print_status "yellow" "Essayez de redémarrer votre terminal ou de sourcer ~/.cargo/env"
        return 1
    fi
}

# Fonction pour installer les dépendances système pour Tauri
install_tauri_dependencies() {
    print_status "yellow" "=== Installation des dépendances Tauri ==="
    
    local os=$(detect_os)

    case $os in
        "macos")
            # Vérifier Xcode Command Line Tools
            if ! xcode-select -p >/dev/null 2>&1; then
                print_status "yellow" "Installation des outils de ligne de commande Xcode..."
                xcode-select --install || {
                    print_status "red" "Échec de l'installation des outils Xcode"
                    return 1
                }
                print_status "yellow" "Veuillez accepter la licence et réessayer après installation"
                return 1
            fi

            if ! check_command brew; then
                print_status "yellow" "Installation de Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || {
                    print_status "red" "Échec de l'installation de Homebrew"
                    return 1
                }
            fi
            ;;
        "linux")
            local pm=$(detect_package_manager)
            case $pm in
                "apt")
                    sudo apt-get update || {
                        print_status "red" "Échec de la mise à jour des paquets"
                        return 1
                    }
                    sudo apt-get install -y \
                        libwebkit2gtk-4.0-dev \
                        build-essential \
                        curl \
                        wget \
                        libssl-dev \
                        libgtk-3-dev \
                        libayatana-appindicator3-dev \
                        librsvg2-dev \
                        patchelf || {
                        print_status "red" "Échec de l'installation des dépendances via apt"
                        return 1
                    }
                    ;;
                "dnf"|"yum")
                    sudo $pm install -y \
                        webkit2gtk3-devel \
                        openssl-devel \
                        curl \
                        wget \
                        gtk3-devel \
                        libappindicator-gtk3-devel \
                        librsvg2-devel \
                        patchelf || {
                        print_status "red" "Échec de l'installation des dépendances via $pm"
                        return 1
                    }
                    ;;
                "pacman")
                    sudo pacman -Syu --noconfirm \
                        webkit2gtk \
                        base-devel \
                        curl \
                        wget \
                        openssl \
                        gtk3 \
                        libappindicator-gtk3 \
                        librsvg \
                        patchelf || {
                        print_status "red" "Échec de l'installation des dépendances via pacman"
                        return 1
                    }
                    ;;
                "zypper")
                    sudo zypper install -y \
                        webkit2gtk3-devel \
                        curl \
                        wget \
                        libopenssl-devel \
                        gtk3-devel \
                        libappindicator3-devel \
                        librsvg-devel \
                        patchelf || {
                        print_status "red" "Échec de l'installation des dépendances via zypper"
                        return 1
                    }
                    ;;
                *)
                    print_status "red" "Gestionnaire de paquets non reconnu ($pm)"
                    return 1
                    ;;
            esac
            ;;
        "freebsd")
            sudo pkg install -y \
                webkit2-gtk3 \
                curl \
                wget \
                openssl \
                gtk3 \
                libappindicator \
                librsvg2 \
                patchelf || {
                print_status "red" "Échec de l'installation des dépendances via pkg"
                return 1
            }
            ;;
        *)
            print_status "red" "Système d'exploitation non pris en charge ($os)"
            return 1
            ;;
    esac

    print_status "green" "✓ Dépendances système pour Tauri installées"
    return 0
}

# Fonction CORRIGÉE pour créer et configurer le projet
setup_project() {
    print_status "yellow" "=== Configuration du projet Tauri ==="
    
    # ÉTAPE 0: Capturer le répertoire de travail AVANT toute opération
    WORKING_DIR=$(pwd)
    print_status "yellow" "ÉTAPE 0: Répertoire de travail initial: $WORKING_DIR"
    
    # Définir un nom d'application par défaut
    DEFAULT_APP_NAME="test_app"
    
    if [ $# -eq 0 ]; then
        print_status "yellow" "Aucun nom d'application fourni, utilisation du nom par défaut: $DEFAULT_APP_NAME"
        APP_NAME=$DEFAULT_APP_NAME
    else
        APP_NAME=$1
    fi

    # VÉRIFICATION CRITIQUE : Le src personnalisé doit exister AVANT de commencer
    if [ ! -d "$WORKING_DIR/src" ]; then
        print_status "red" "ERREUR FATALE: Aucun répertoire 'src' trouvé dans $WORKING_DIR"
        print_status "yellow" "Structure requise: $WORKING_DIR/src/ (vos fichiers personnalisés)"
        print_status "yellow" "Contenu actuel du répertoire:"
        ls -la "$WORKING_DIR"
        return 1
    fi
    
    print_status "green" "✓ Répertoire src personnalisé trouvé: $WORKING_DIR/src"
    print_status "yellow" "Aperçu du contenu à préserver:"
    ls -la "$WORKING_DIR/src" | head -8

    # Vérifier si le répertoire de l'app existe déjà
    if [ -d "$WORKING_DIR/$APP_NAME" ]; then
        print_status "yellow" "Le répertoire $APP_NAME existe déjà dans $WORKING_DIR"
        echo -n "Voulez-vous le supprimer complètement? (y/N): "
        read CONFIRM
        CONFIRM=${CONFIRM:-N}

        if [[ $CONFIRM =~ ^[Yy]$ ]]; then
            print_status "yellow" "Suppression du répertoire $APP_NAME..."
            rm -rf "$WORKING_DIR/$APP_NAME" || {
                print_status "red" "Impossible de supprimer le répertoire $APP_NAME"
                return 1
            }
            print_status "green" "✓ Répertoire $APP_NAME supprimé"
        else
            print_status "yellow" "Conservation du répertoire existant."
            if [ -f "$WORKING_DIR/$APP_NAME/package.json" ]; then
                print_status "yellow" "Tentative de lancement de l'application existante..."
                cd "$WORKING_DIR/$APP_NAME"
                npm run tauri dev
                return 0
            else
                print_status "red" "Le répertoire existe mais ne semble pas être un projet Tauri valide"
                return 1
            fi
        fi
    fi

    # ÉTAPE 1: Créer l'application Tauri dans le répertoire de travail
    print_status "yellow" "ÉTAPE 1: Création de l'application Tauri dans $WORKING_DIR"
    
    # S'assurer qu'on est dans le bon répertoire
    cd "$WORKING_DIR" || {
        print_status "red" "Impossible de retourner dans $WORKING_DIR"
        return 1
    }
    
    # Créer l'application Tauri
    print_status "yellow" "Création de l'app: npm create tauri-app@latest $APP_NAME"
    npm create tauri-app@latest "$APP_NAME" -- --template vanilla --manager npm --yes || {
        print_status "red" "ÉCHEC de la création de l'application Tauri"
        return 1
    }
    
    print_status "green" "✓ Application Tauri créée: $WORKING_DIR/$APP_NAME"

    # ÉTAPE 2: Entrer dans le répertoire de l'application
    print_status "yellow" "ÉTAPE 2: Accès au répertoire de l'application"
    cd "$WORKING_DIR/$APP_NAME" || {
        print_status "red" "IMPOSSIBLE d'accéder au répertoire $WORKING_DIR/$APP_NAME"
        return 1
    }
    
    APP_DIR=$(pwd)
    print_status "yellow" "Répertoire courant: $APP_DIR"

    # ÉTAPE 3: DIAGNOSTIC - Vérifier le src généré par Tauri
    print_status "yellow" "ÉTAPE 3: DIAGNOSTIC - Contenu du src généré par Tauri:"
    if [ -d "src" ]; then
        ls -la src/
        print_status "yellow" "Taille du répertoire src Tauri:"
        du -sh src/
    else
        print_status "yellow" "Aucun répertoire src généré (?)"
    fi

    # ÉTAPE 4: SUPPRESSION TOTALE du src de Tauri
    print_status "yellow" "ÉTAPE 4: SUPPRESSION COMPLÈTE du src généré par Tauri"
    if [ -d "src" ]; then
        rm -rf src || {
            print_status "red" "ÉCHEC de la suppression du répertoire src"
            return 1
        }
        print_status "green" "✓ Répertoire src de Tauri supprimé"
    else
        print_status "yellow" "Aucun répertoire src à supprimer"
    fi

    # ÉTAPE 5: VÉRIFICATION que src n'existe plus
    print_status "yellow" "ÉTAPE 5: VÉRIFICATION de la suppression"
    if [ -d "src" ]; then
        print_status "red" "ERREUR CRITIQUE: Le répertoire src existe encore!"
        ls -la src/
        return 1
    fi
    print_status "green" "✓ CONFIRMÉ: Aucun répertoire src présent"

    # ÉTAPE 6: COPIE du src personnalisé depuis le répertoire de travail
    print_status "yellow" "ÉTAPE 6: COPIE du src personnalisé depuis $WORKING_DIR/src"
    cp -R "$WORKING_DIR/src" . || {
        print_status "red" "ÉCHEC de la copie du src personnalisé"
        return 1
    }
    print_status "green" "✓ Src personnalisé copié"

    # ÉTAPE 7: VÉRIFICATION de la copie
    print_status "yellow" "ÉTAPE 7: VÉRIFICATION de la copie"
    if [ ! -d "src" ]; then
        print_status "red" "ERREUR: Aucun répertoire src après copie!"
        return 1
    fi
    
    print_status "yellow" "Contenu du nouveau src:"
    ls -la src/ | head -10
    
    print_status "yellow" "Taille du répertoire src personnalisé:"
    du -sh src/
    
    # Vérifier qu'il n'y a PAS de fichiers Tauri par défaut
    TAURI_FILES_DETECTED=0
    if [ -f "src/main.js" ]; then
        if grep -q "tauri" "src/main.js" 2>/dev/null; then
            print_status "red" "CONTAMINATION DÉTECTÉE: main.js contient du code Tauri!"
            TAURI_FILES_DETECTED=1
        fi
    fi
    
    if [ -f "src/style.css" ] && [ -f "src/main.js" ] && [ ! -f "src/squirrel" ]; then
        print_status "red" "CONTAMINATION DÉTECTÉE: Structure typique de Tauri vanilla!"
        TAURI_FILES_DETECTED=1
    fi
    
    if [ $TAURI_FILES_DETECTED -eq 1 ]; then
        print_status "red" "ÉCHEC: Les fichiers Tauri par défaut sont encore présents"
        print_status "yellow" "Le src personnalisé n'a pas remplacé correctement celui de Tauri"
        return 1
    fi
    
    print_status "green" "✓ SUCCÈS: Src personnalisé en place, aucune contamination Tauri détectée"

    # ÉTAPE 8: Ajouts spécifiques (acorn.js, etc.)
    print_status "yellow" "ÉTAPE 8: Ajouts spécifiques"
    
    # Créer les répertoires pour acorn.js si nécessaire
    if [ ! -d "src/squirrel/parser" ]; then
        print_status "yellow" "Création du répertoire src/squirrel/parser"
        mkdir -p src/squirrel/parser || {
            print_status "red" "Impossible de créer src/squirrel/parser"
            return 1
        }
    fi
    
    # Télécharger acorn.js si absent
    if [ ! -f "src/squirrel/parser/acorn.js" ]; then
        print_status "yellow" "Téléchargement d'acorn.js..."
        curl -o src/squirrel/parser/acorn.js https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.js || {
            print_status "yellow" "Avertissement: échec du téléchargement d'acorn.js"
        }
    else
        print_status "green" "✓ acorn.js déjà présent"
    fi

    # ÉTAPE 9: Gestion du serveur Fastify
    print_status "yellow" "ÉTAPE 9: Configuration du serveur Fastify"
    if [ -f "$WORKING_DIR/fastify-server.mjs" ]; then
        print_status "yellow" "Copie du serveur Fastify personnalisé..."
        cp "$WORKING_DIR/fastify-server.mjs" . || {
            print_status "red" "Échec de la copie du serveur Fastify"
            return 1
        }
        print_status "green" "✓ Serveur Fastify personnalisé copié"
    else
        print_status "yellow" "Création d'un serveur Fastify basique..."
        cat > fastify-server.mjs << 'EOL'
import Fastify from 'fastify';
import cors from '@fastify/cors';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
    origin: true
});

fastify.get('/api/test', async (request, reply) => {
    return { message: 'Serveur Fastify fonctionnel!', timestamp: new Date().toISOString() };
});

const start = async () => {
    try {
        await fastify.listen({ port: 3001, host: '127.0.0.1' });
        console.log('Serveur Fastify démarré sur http://localhost:3001');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
EOL
        print_status "green" "✓ Serveur Fastify basique créé"
    fi

    # ÉTAPE 10: Installation des dépendances
    print_status "yellow" "ÉTAPE 10: Installation des dépendances npm"
    npm install || {
        print_status "red" "Échec de l'installation des dépendances npm"
        return 1
    }

    # Installer Fastify
    npm install --save fastify @fastify/cors || {
        print_status "red" "Échec de l'installation de Fastify"
        return 1
    }

    # ÉTAPE 11: Configuration Rust/Axum (optionnelle)
    print_status "yellow" "ÉTAPE 11: Configuration Rust/Axum"
    
    # Ajouter les dépendances Axum si nécessaire
    if ! grep -q "axum =" src-tauri/Cargo.toml; then
        print_status "yellow" "Ajout des dépendances Axum..."
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
        print_status "green" "✓ Dépendances Axum ajoutées"
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
EOL

    # Modifier le fichier main.rs
    print_status "yellow" "Configuration du fichier main.rs..."
    cat > src-tauri/src/main.rs << EOL
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod server;
use std::process::Command;

fn main() {
    let static_dir = std::path::PathBuf::from("$APP_DIR/src");

    tauri::Builder::default()
        .setup(move |_app| {
            let static_dir_clone = static_dir.clone();

            // Serveur Axum en arrière-plan
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    server::start_server(static_dir_clone).await;
                });
            });

            // Serveur Fastify en arrière-plan
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let output = Command::new("node")
                    .current_dir("$APP_DIR")
                    .arg("fastify-server.mjs")
                    .output();

                match output {
                    Ok(o) => {
                        if !o.status.success() {
                            println!("Erreur serveur Fastify: {}", String::from_utf8_lossy(&o.stderr));
                        }
                    },
                    Err(e) => println!("Erreur lancement Fastify: {}", e),
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tauri");
}
EOL

    print_status "green" "✓ Configuration Rust/Axum terminée"

    # ÉTAPE FINALE: Récapitulatif et lancement
    print_status "green" "=== CONFIGURATION TERMINÉE AVEC SUCCÈS ==="
    print_status "yellow" "Répertoire de l'application: $APP_DIR"
    print_status "yellow" "Structure finale du src:"
    find src -type f | head -10
    
    print_status "yellow" "Lancement de l'application Tauri..."
    npm run tauri dev || {
        print_status "red" "Échec du lancement de l'application Tauri"
        print_status "yellow" "Vérifiez les logs ci-dessus pour diagnostiquer le problème"
        return 1
    }
}

# Fonction principale avec gestion d'erreurs complète
main() {
    print_status "green" "=== DÉMARRAGE DE L'INSTALLATION TAURI ==="
    
    # Activer le mode debug si demandé
    if [ "${1:-}" = "--debug" ] || [ "${DEBUG:-0}" = "1" ]; then
        export DEBUG=1
        print_status "yellow" "Mode debug activé"
        shift
    fi

    # Tuer les serveurs existants
    kill_fastify_server

    # Vérifier les prérequis système
    local os=$(detect_os)
    if [ "$os" = "unknown" ]; then
        print_status "red" "Système d'exploitation non reconnu"
        print_status "yellow" "Systèmes pris en charge: Linux, macOS, FreeBSD"
        exit 1
    fi

    print_status "yellow" "Système détecté: $os"

    # Installer les dépendances une par une avec vérification
    print_status "yellow" "=== INSTALLATION DES DÉPENDANCES ==="
    
    if ! install_nodejs; then
        print_status "red" "Échec de l'installation de Node.js"
        exit 1
    fi

    if ! install_rust; then
        print_status "red" "Échec de l'installation de Rust"
        exit 1
    fi

    if ! install_tauri_dependencies; then
        print_status "red" "Échec de l'installation des dépendances Tauri"
        exit 1
    fi

    print_status "green" "✓ Toutes les dépendances sont installées"

    # Configurer et lancer le projet
    print_status "yellow" "=== CONFIGURATION DU PROJET ==="
    if ! setup_project "$@"; then
        print_status "red" "Échec de la configuration du projet"
        exit 1
    fi

    print_status "green" "=== INSTALLATION TERMINÉE AVEC SUCCÈS ==="
}

# Point d'entrée avec gestion d'erreurs globale
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    trap 'print_status "red" "Erreur détectée à la ligne $LINENO. Arrêt du script."' ERR
    main "$@"
fi