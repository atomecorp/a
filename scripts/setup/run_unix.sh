#!/bin/bash
set -euo pipefail

# Resolve script directory & project root so the helper scripts work from anywhere
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
ENTRYPOINT_DISPLAY="${RUN_ENTRYPOINT_OVERRIDE:-$0}"
SERVICE_NAME="squirrel"
DEFAULT_SQLITE_PATH="database_storage/adole.db"

service_commands="$SCRIPTS_DIR/setup/service_commands.sh"
if [[ ! -f "$service_commands" ]]; then
    echo "ERROR: Missing service command helper: $service_commands"
    exit 1
fi

# shellcheck disable=SC1090
source "$service_commands"
dispatch_service_command_if_requested "$@"

abort_production_dev_mode_without_args() {
    local arg_count="${1:-0}"

    if [[ "$arg_count" -ne 0 ]]; then
        return 0
    fi

    if ! is_production_install; then
        return 0
    fi

    echo "ERROR: Detected a production server setup."
    echo "       Do not run './run.sh' without arguments (dev mode)."
    echo "       Use one of these instead:"
    echo "         - ./run.sh --https"
    echo "         - ./run.sh status"
    echo "         - ./run.sh logs"
    echo "         - ./run.sh update"
    echo "       For foreground diagnostics, stop the service first, then use: ./run.sh --server"
    exit 1
}

abort_production_dev_mode_without_args "$#"

run_bootstrap_if_needed() {
    local bootstrap_script="$SCRIPTS_DIR/setup/bootstrap.sh"
    if [[ ! -f "$bootstrap_script" ]]; then
        echo "ERROR: Missing bootstrap script: $bootstrap_script"
        exit 1
    fi

    chmod +x "$bootstrap_script"
    "$bootstrap_script"

    if [[ -d "$HOME/.cargo/bin" ]]; then
        export PATH="$HOME/.cargo/bin:$PATH"
    fi
}

run_bootstrap_if_needed "${1:-}"

# --- Editable defaults -------------------------------------------------------
# Change DEFAULT_UPLOADS_PATH to point legacy uploads elsewhere (sync watcher).
# Per-user uploads now live in each user's Downloads folder.
DEFAULT_UPLOADS_PATH="data/users/anonymous/Downloads"
# Change DEFAULT_MONITORED_PATH to pick the folder watched by chokidar.
# Absolute paths are supported; relative values are resolved from the project root.
if [[ "$(uname -s 2>/dev/null || true)" == "Darwin" ]]; then
    DEFAULT_MONITORED_PATH="/Users/Shared/monitored"
else
    DEFAULT_MONITORED_PATH="$PROJECT_ROOT/monitored"
fi

# =============================================================================
# DATABASE SETUP FUNCTION (SQLite)
# =============================================================================
# This function ensures SQLite database directory exists and path is configured.
# For cloud deployments, set LIBSQL_URL and LIBSQL_AUTH_TOKEN in .env
# =============================================================================

setup_database() {
    echo ""
    echo "🗄️  Configuration de la base de données SQLite..."
    echo ""

    # Determine SQLite path
    local sqlite_path="${SQLITE_PATH:-$PROJECT_ROOT/$DEFAULT_SQLITE_PATH}"
    local sqlite_dir
    sqlite_dir="$(dirname "$sqlite_path")"

    # Ensure directory exists
    if [[ ! -d "$sqlite_dir" ]]; then
        echo "📂 Création du répertoire: $sqlite_dir"
        mkdir -p "$sqlite_dir"
    fi

    # Write path to .env if not already set
    if [[ -z "${SQLITE_PATH:-}" ]]; then
        echo "💾 Configuration de SQLITE_PATH dans .env..."
        write_sqlite_path_to_env "$sqlite_path"
    fi

    echo "✅ Base de données SQLite configurée: $sqlite_path"
    
    # Check for libSQL/Turso configuration
    if [[ -n "${LIBSQL_URL:-}" ]]; then
        echo "☁️  libSQL/Turso configuré: ${LIBSQL_URL}"
    fi
    
    echo ""
    return 0
}

write_sqlite_path_to_env() {
    local db_path="$1"
    local env_file="$PROJECT_ROOT/.env"
    local tmp

    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' RETURN

    if [[ -f "$env_file" ]]; then
        # Remove old database entries
        grep -v '^SQLITE_PATH=' "$env_file" | \
        grep -v '^ADOLE_PG_DSN=' | \
        grep -v '^PG_CONNECTION_STRING=' | \
        grep -v '^DATABASE_URL=' >"$tmp" || true
    else
        : >"$tmp"
    fi

    printf 'SQLITE_PATH=%s\n' "$db_path" >>"$tmp"
    mv "$tmp" "$env_file"
    trap - RETURN

    chmod 600 "$env_file" 2>/dev/null || true
    echo "✅ Chemin SQLite sauvegardé dans .env"
}

load_env_file() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        echo "🌱 Chargement des variables depuis $(basename "$env_file")"
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
    fi
}

load_env_file "$PROJECT_ROOT/.env"
load_env_file "$PROJECT_ROOT/.env.local"

generate_auth_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
        return 0
    fi
    node --input-type=module -e "import crypto from 'node:crypto'; console.log(crypto.randomBytes(32).toString('hex'));"
}

write_env_value() {
    local key="$1"
    local secret="$2"
    local env_file="$PROJECT_ROOT/.env"
    local tmp

    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' RETURN

    if [[ -f "$env_file" ]]; then
        grep -v "^${key}=" "$env_file" >"$tmp" || true
    else
        : >"$tmp"
    fi

    printf '%s=%s\n' "$key" "$secret" >>"$tmp"
    mv "$tmp" "$env_file"
    trap - RETURN

    chmod 600 "$env_file" 2>/dev/null || true
}

ensure_auth_secret() {
    local key="$1"
    local current="${!key:-}"
    if [[ ${#current} -lt 32 ]] || [[ "$current" == *"change_me"* ]] || [[ "$current" == *"change_in_production"* ]]; then
        local generated
        generated="$(generate_auth_secret)"
        export "$key=$generated"
        write_env_value "$key" "$generated"
        echo "🔐 $key absent ou insuffisant: secret local aléatoire écrit dans .env."
    fi
}

ensure_dev_auth_secrets() {
    ensure_auth_secret "JWT_SECRET"
    ensure_auth_secret "COOKIE_SECRET"
}

prepare_uploads_dir() {
    local raw="${SQUIRREL_UPLOADS_DIR:-}"
    local absolute

    if [[ -z "$raw" ]]; then
        raw="$DEFAULT_UPLOADS_PATH"
        echo "INFO: SQUIRREL_UPLOADS_DIR not set. Using DEFAULT_UPLOADS_PATH ($raw)."
    fi

    if [[ -z "$raw" ]]; then
        echo "ERROR: DEFAULT_UPLOADS_PATH is empty. Set it or export SQUIRREL_UPLOADS_DIR before running ./run.sh."
        exit 1
    fi

    if [[ "$raw" != /* ]]; then
        absolute="$PROJECT_ROOT/$raw"
    else
        absolute="$raw"
    fi

    if mkdir -p "$absolute" 2>/dev/null; then
        export SQUIRREL_UPLOADS_DIR="$absolute"
        echo "📁 Uploads directory: $SQUIRREL_UPLOADS_DIR"
    else
        echo "ERROR: Unable to create uploads directory at $absolute"
        exit 1
    fi
}

compute_watch_glob() {
    local absolute="$1"
    local pattern=""

    if [[ -z "$absolute" ]]; then
        return 1
    fi

    if [[ "$absolute" == "$PROJECT_ROOT" ]]; then
        pattern="./**/*"
    elif [[ "$absolute" == "$PROJECT_ROOT"/* ]]; then
        local relative="${absolute#$PROJECT_ROOT/}"
        if [[ -z "$relative" ]]; then
            pattern="./**/*"
        else
            pattern="$relative/**/*"
        fi
    else
        pattern="$absolute/**/*"
    fi

    printf '%s' "$pattern"
}

prepare_monitored_dir() {
    local raw="${SQUIRREL_MONITORED_DIR:-$DEFAULT_MONITORED_PATH}"
    local absolute

    if [[ -z "$raw" ]]; then
        echo "ERROR: DEFAULT_MONITORED_PATH is empty. Set it or export SQUIRREL_MONITORED_DIR before running ./run.sh."
        exit 1
    fi

    if [[ "$raw" != /* ]]; then
        absolute="$PROJECT_ROOT/$raw"
    else
        absolute="$raw"
    fi

    if ! mkdir -p "$absolute" 2>/dev/null; then
        echo "ERROR: Unable to create monitored directory at $absolute"
        exit 1
    fi

    export SQUIRREL_MONITORED_DIR="$absolute"

    if [[ -z "${SQUIRREL_SYNC_WATCH:-}" ]]; then
        local watch_patterns=()
        local monitored_pattern
        monitored_pattern="$(compute_watch_glob "$absolute")"
        watch_patterns+=("$monitored_pattern")

        if [[ -n "${SQUIRREL_UPLOADS_DIR:-}" ]]; then
            local uploads_pattern
            uploads_pattern="$(compute_watch_glob "$SQUIRREL_UPLOADS_DIR")"
            local duplicate=false
            for existing in "${watch_patterns[@]}"; do
                if [[ "$existing" == "$uploads_pattern" ]]; then
                    duplicate=true
                    break
                fi
            done
            if [[ "$duplicate" == false ]]; then
                watch_patterns+=("$uploads_pattern")
            fi
        fi

        local watch_pattern="${watch_patterns[0]}"
        if [[ ${#watch_patterns[@]} -gt 1 ]]; then
            for pattern in "${watch_patterns[@]:1}"; do
                watch_pattern+=",$pattern"
            done
        fi

        export SQUIRREL_SYNC_WATCH="$watch_pattern"
    fi

    echo "👀 Monitored directory: $SQUIRREL_MONITORED_DIR"
    echo "👀 SQUIRREL_SYNC_WATCH=$SQUIRREL_SYNC_WATCH"
}

# Setup SQLite database
if [[ -z "${SQLITE_PATH:-}" ]]; then
    echo "INFO: No SQLITE_PATH detected in environment."
    setup_database
    
    # Reload environment files to pick up the newly configured path
    load_env_file "$PROJECT_ROOT/.env"
    load_env_file "$PROJECT_ROOT/.env.local"
fi

# Ensure SQLITE_PATH is set
SQLITE_PATH="${SQLITE_PATH:-$PROJECT_ROOT/$DEFAULT_SQLITE_PATH}"
export SQLITE_PATH

echo "✅ SQLite database path: $SQLITE_PATH"

# Show libSQL/Turso config if present
if [[ -n "${LIBSQL_URL:-}" ]]; then
    echo "☁️  libSQL/Turso URL: ${LIBSQL_URL}"
fi
echo ""

prepare_uploads_dir
prepare_monitored_dir

update_hot_manifest() {
    echo "🧾 Vérification du manifest de mise à jour à chaud..."
    if npm run manifest:update; then
        echo "✅ Manifest synchronisé (atome/src/manifest.json)"
    else
        echo "❌ Impossible de synchroniser le manifest (atome/src/manifest.json)."
        exit 1
    fi
    echo ""
}

cd "$PROJECT_ROOT"

FASTIFY_PID=""
TAURI_PID=""

# Fonction de nettoyage pour tuer les processus
cleanup() {
    echo "🧹 Arrêt des serveurs..."

    if [[ -n "${FASTIFY_PID}" ]]; then
        if kill "$FASTIFY_PID" 2>/dev/null; then
            echo "✅ Serveur Fastify arrêté"
        fi
    fi

    if [[ -n "${TAURI_PID}" ]]; then
        if kill "$TAURI_PID" 2>/dev/null; then
            echo "✅ Tauri arrêté"
        fi
    fi

    # Tuer tous les processus sur le port 3001 (sécurité)
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    fi

    exit 0
}

# Vérifier les arguments de ligne de commande
FORCE_DEPS=false
PROD_BUILD=false
TAURI_ONLY=false
SERVER_ONLY=false
FASTIFY_URL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --force-deps|-f)
            FORCE_DEPS=true
            shift
            ;;
        --prod)
            PROD_BUILD=true
            shift
            ;;
        --tauri)
            TAURI_ONLY=true
            shift
            ;;
        --tauri-prod)
            TAURI_ONLY=true
            PROD_BUILD=true
            shift
            ;;
        --server)
            SERVER_ONLY=true
            shift
            ;;
        --fastify-url)
            FASTIFY_URL="$2"
            shift 2
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Export Fastify URL for Tauri to use
if [[ -n "$FASTIFY_URL" ]]; then
    export SQUIRREL_FASTIFY_URL="$FASTIFY_URL"
    echo "🌐 Remote Fastify URL: $FASTIFY_URL"
fi

# =============================================================================
# MODE DETECTION - Handle modes BEFORE doing any setup
# =============================================================================

# Mode --server uniquement (pas de Tauri)
if [ "$SERVER_ONLY" = true ]; then
    ensure_dev_auth_secrets
    echo "📡 Mode serveur uniquement (Fastify sur port 3001)"
    echo "📂 Répertoire: $(pwd)"
    echo "🔧 Node.js: $(node --version)"
    echo "📦 NPM: $(npm --version)"
    echo ""
    
    # Install deps if needed
    if [ "$FORCE_DEPS" = true ]; then
        rm -f node_modules/.install_complete
    fi
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.install_complete" ]; then
        echo "📥 Installation des dépendances..."
        chmod +x "$SCRIPTS_DIR/install_dependencies.sh"
        "$SCRIPTS_DIR/install_dependencies.sh" --non-interactive
        touch node_modules/.install_complete
    fi
    
    echo "📡 Démarrage du serveur Fastify..."
    if [ "$FORCE_DEPS" = true ]; then
        "$SCRIPTS_DIR/run_fastify.sh" --force-deps
    else
        "$SCRIPTS_DIR/run_fastify.sh"
    fi
    exit 0
fi

# Mode --tauri uniquement (pas de Fastify local)
if [ "$TAURI_ONLY" = true ]; then
    ensure_dev_auth_secrets
    echo "🖥️  Mode Tauri uniquement (Axum sur port 3000)"
    echo "📂 Répertoire: $(pwd)"
    echo "🔧 Node.js: $(node --version)"
    echo "📦 NPM: $(npm --version)"
    echo ""
    
    if [ -n "$FASTIFY_URL" ]; then
        echo "🌐 Connexion au serveur Fastify distant: $FASTIFY_URL"
    else
        echo "ℹ️  Pas de serveur Fastify configuré (Tauri fonctionne en mode local)"
    fi
    
    # Install deps if needed
    if [ "$FORCE_DEPS" = true ]; then
        rm -f node_modules/.install_complete
    fi
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.install_complete" ]; then
        echo "📥 Installation des dépendances..."
        chmod +x "$SCRIPTS_DIR/install_dependencies.sh"
        "$SCRIPTS_DIR/install_dependencies.sh" --non-interactive
        touch node_modules/.install_complete
    fi

    # Production mode for Tauri-only: build bundle then launch the generated .app
    if [ "$PROD_BUILD" = true ]; then
        echo "🏗️  Building production Tauri bundle..."
        echo "🔍 Scanning Squirrel components..."
        npm run scan:components
        echo ""

        echo "📦 Building frontend..."
        npm run build
        echo ""

        echo "🛠️  Building Tauri (production)..."
        TAURI_SKIP_BUNDLE_OPEN=1 npm run tauri build
        echo ""

        app_dir="$PROJECT_ROOT/platforms/desktop-tauri/target/release/bundle/macos"
        if [ -d "$app_dir" ]; then
            latest_app=$(ls -td "$app_dir"/*.app 2>/dev/null | head -n 1 || true)
            if [ -n "${latest_app:-}" ] && [ -d "$latest_app" ]; then
                echo "🚀 Launching app bundle: $latest_app"
                open "$latest_app" || true
            else
                echo "WARN: No .app bundle found in $app_dir"
            fi
        else
            echo "WARN: macOS bundle directory not found: $app_dir"
        fi

        dmg_dir="$PROJECT_ROOT/platforms/desktop-tauri/target/release/bundle/dmg"
        if [ -d "$dmg_dir" ]; then
            latest_dmg=$(ls -t "$dmg_dir"/*.dmg 2>/dev/null | head -n 1 || true)
            if [ -n "${latest_dmg:-}" ] && [ -f "$latest_dmg" ]; then
                echo "📦 DMG generated: $latest_dmg"
            fi
        fi

        echo "✅ Production Tauri build complete"
        exit 0
    fi
    
    echo "🖥️  Démarrage de Tauri (Axum sur port 3000)..."
    if [ "$FORCE_DEPS" = true ]; then
        "$SCRIPTS_DIR/run_tauri.sh" --force-deps
    else
        "$SCRIPTS_DIR/run_tauri.sh"
    fi
    exit 0
fi

# =============================================================================
# MODE NORMAL: Fastify + Tauri
# =============================================================================

echo "🚀 Mode complet: Tauri (port 3000) + Fastify (port 3001)"
ensure_dev_auth_secrets
echo "📂 Répertoire: $(pwd)"
echo "🔧 Node.js: $(node --version)"
echo "📦 NPM: $(npm --version)"
echo ""

# Vérifier si les dépendances sont installées ou si elles ont besoin d'être mises à jour
if [ "$FORCE_DEPS" = true ]; then
    echo "⚠️  Forçage de la réinstallation des dépendances (--force)"
    rm -f node_modules/.install_complete
fi

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.install_complete" ]; then
    echo "📥 Installation/mise à jour des dépendances Squirrel Framework..."
    
    # Rendre le script exécutable s'il ne l'est pas
    chmod +x "$SCRIPTS_DIR/install_dependencies.sh"
    
    # Lancer l'installation en mode non-interactif
    "$SCRIPTS_DIR/install_dependencies.sh" --non-interactive
    
    # Créer un marqueur pour éviter les installations répétées
    touch node_modules/.install_complete
    echo ""
else
    echo "✅ Dépendances déjà installées (utilisez --force pour forcer la mise à jour)"
    echo ""
fi

# Manifest hot-update désactivé - on utilise maintenant le sync ZIP depuis GitHub
# update_hot_manifest

# Construction production si demandée
if [ "$PROD_BUILD" = true ]; then
    echo "🏗️  Construction production (Tauri)"
    echo "🔍 Scan des composants Squirrel..."
    npm run scan:components
    echo ""

    echo "📦 Build frontend..."
    npm run build
    echo ""

    echo "🛠️  Build Tauri (production)..."
    TAURI_SKIP_BUNDLE_OPEN=1 npm run tauri build
    echo ""

    echo "🗂️  Recherche du dernier DMG généré..."
    dmg_dir="$PROJECT_ROOT/platforms/desktop-tauri/target/release/bundle/dmg"
    if [ -d "$dmg_dir" ]; then
        latest_dmg=$(ls -t "$dmg_dir"/*.dmg 2>/dev/null | head -n 1 || true)
        if [ -n "${latest_dmg:-}" ] && [ -f "$latest_dmg" ]; then
            echo "📦 DMG généré: $latest_dmg"
            if hdiutil info | grep -q "$latest_dmg"; then
                echo "ℹ️  DMG déjà monté. Laissez-le ouvert tant que nécessaire."
            else
                echo "📎 Montage du DMG (reste monté jusqu'à éjection manuelle)..."
                if hdiutil attach "$latest_dmg"; then
                    echo "✅ DMG monté. Consultez-le dans le Finder et éjectez-le quand vous avez terminé."
                else
                    echo "⚠️  Impossible de monter automatiquement le DMG. Ouvrez-le manuellement si nécessaire."
                fi
            fi
        else
            echo "⚠️  Aucun DMG trouvé dans $dmg_dir"
        fi
    else
        echo "⚠️  Répertoire DMG introuvable: $dmg_dir"
    fi
    echo ""

    echo "✅ Build Tauri production terminé"
    exit 0
fi

# Scanner les composants Squirrel
echo "🔍 Scan des composants Squirrel..."
npm run scan:components
echo ""

# Capturer les signaux d'interruption
trap cleanup SIGINT SIGTERM EXIT

# Mode normal: Fastify + Tauri (les modes --server et --tauri ont déjà exit plus haut)

# Lancer Fastify en arrière-plan via le script
echo "📡 Démarrage du serveur Fastify..."
if [ "$FORCE_DEPS" = true ]; then
    "$SCRIPTS_DIR/run_fastify.sh" --force-deps &
else
    "$SCRIPTS_DIR/run_fastify.sh" &
fi
FASTIFY_PID=$!

# Attendre un peu que Fastify démarre
sleep 2

# Lancer Tauri en arrière-plan via le script
echo "🖥️  Démarrage de Tauri..."
if [ "$FORCE_DEPS" = true ]; then
    "$SCRIPTS_DIR/run_tauri.sh" --force-deps &
else
    "$SCRIPTS_DIR/run_tauri.sh" &
fi
TAURI_PID=$!

echo "✅ Serveurs lancés:"
echo "   - Fastify: http://localhost:3001 (PID: $FASTIFY_PID)"
echo "   - Tauri en cours de démarrage... (PID: $TAURI_PID)"
echo ""
echo "💡 Appuyez sur Ctrl+C pour arrêter les serveurs"

# Attendre que les processus se terminent
wait $FASTIFY_PID $TAURI_PID
