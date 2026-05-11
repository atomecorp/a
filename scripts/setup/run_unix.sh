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

run_bootstrap_if_needed() {
    local first_arg="${1:-}"
    if [[ "$first_arg" == "--help" || "$first_arg" == "-h" ]]; then
        return 0
    fi

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

# Dev-only: shared JWT secret so Tauri + Fastify accept the same tokens.
DEV_SHARED_JWT_SECRET="squirrel_dev_shared_jwt_secret_change_me"

# Guardrail: on production servers, running ./run.sh with no arguments starts dev mode
# (foreground processes + dependency installs). This is almost always accidental and
# will stop when the SSH terminal closes. Use service commands instead.
if [[ $# -eq 0 ]]; then
    if [[ -f "/etc/systemd/system/squirrel.service" ]] \
        || [[ -f "/etc/squirrel/squirrel.env" ]] \
        || [[ -f "/usr/local/etc/squirrel/squirrel.env" ]]; then
        echo "ERROR: Detected a production server setup."
        echo "       Do not run './run.sh' without arguments (dev mode)."
        echo "       Use one of these instead:"
        echo "         - ./run.sh --https"
        echo "         - ./run.sh status"
        echo "         - ./run.sh logs"
        echo "         - ./run.sh update"
        echo "       If you really want dev server mode, use: ./run.sh --server"
        exit 1
    fi
fi

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

# --- Database defaults (SQLite/libSQL) ---------------------------------------
DEFAULT_SQLITE_PATH="database_storage/adole.db"

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

write_jwt_secret_to_env() {
    local secret="$1"
    local env_file="$PROJECT_ROOT/.env"
    local tmp

    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' RETURN

    if [[ -f "$env_file" ]]; then
        grep -v '^JWT_SECRET=' "$env_file" >"$tmp" || true
    else
        : >"$tmp"
    fi

    printf 'JWT_SECRET=%s\n' "$secret" >>"$tmp"
    mv "$tmp" "$env_file"
    trap - RETURN

    chmod 600 "$env_file" 2>/dev/null || true
}

ensure_dev_jwt_secret() {
    if [[ -z "${JWT_SECRET:-}" ]]; then
        export JWT_SECRET="$DEV_SHARED_JWT_SECRET"
        write_jwt_secret_to_env "$JWT_SECRET"
        echo "🔐 JWT_SECRET absent: secret dev partagé écrit dans .env pour Tauri + Fastify."
    fi
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
        echo "✅ Manifest synchronisé (src/manifest.json)"
    else
        echo "❌ Impossible de synchroniser le manifest (src/manifest.json)."
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

# =============================================================================
# SERVICE MANAGEMENT FUNCTIONS (for --https / production mode)
# =============================================================================

SERVICE_NAME="squirrel"

# Detect OS for service commands
detect_service_system() {
    if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
        echo "systemd"
    elif [[ -f "/usr/local/etc/rc.d/$SERVICE_NAME" ]]; then
        echo "rcd"
    else
        echo "none"
    fi
}

service_start() {
    local svc_type
    svc_type=$(detect_service_system)
    
    case "$svc_type" in
        systemd)
            echo "🚀 Démarrage du service $SERVICE_NAME (systemd)..."
            sudo systemctl start "$SERVICE_NAME"
            sudo systemctl status "$SERVICE_NAME" --no-pager
            ;;
        rcd)
            echo "🚀 Démarrage du service $SERVICE_NAME (rc.d)..."
            sudo service "$SERVICE_NAME" start
            sudo service "$SERVICE_NAME" status
            ;;
        *)
            echo "❌ Service '$SERVICE_NAME' non installé."
            echo "   Exécutez d'abord: sudo ./install_server.sh"
            exit 1
            ;;
    esac
}

service_stop() {
    local svc_type
    svc_type=$(detect_service_system)
    
    case "$svc_type" in
        systemd)
            echo "🛑 Arrêt du service $SERVICE_NAME..."
            sudo systemctl stop "$SERVICE_NAME"
            echo "✅ Service arrêté"
            ;;
        rcd)
            echo "🛑 Arrêt du service $SERVICE_NAME..."
            sudo service "$SERVICE_NAME" stop
            echo "✅ Service arrêté"
            ;;
        *)
            echo "❌ Service '$SERVICE_NAME' non installé."
            exit 1
            ;;
    esac
}

service_restart() {
    local svc_type
    svc_type=$(detect_service_system)
    
    case "$svc_type" in
        systemd)
            echo "🔄 Redémarrage du service $SERVICE_NAME..."
            sudo systemctl restart "$SERVICE_NAME"
            sudo systemctl status "$SERVICE_NAME" --no-pager
            ;;
        rcd)
            echo "🔄 Redémarrage du service $SERVICE_NAME..."
            sudo service "$SERVICE_NAME" restart
            sudo service "$SERVICE_NAME" status
            ;;
        *)
            echo "❌ Service '$SERVICE_NAME' non installé."
            exit 1
            ;;
    esac
}

service_status() {
    local svc_type
    svc_type=$(detect_service_system)
    
    case "$svc_type" in
        systemd)
            sudo systemctl status "$SERVICE_NAME" || true
            
            # Auto-diagnostic if service is not active
            if ! systemctl is-active --quiet "$SERVICE_NAME"; then
                echo ""
                echo "⚠️  ALERTE : Le serveur plante ou redémarre en boucle."
                echo "🔍 Analyse des logs récents (30 dernières lignes) :"
                echo "----------------------------------------------------------------"
                sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager
                echo "----------------------------------------------------------------"
                echo "👉 Astuce : Lancez './run.sh logs' pour voir le direct."
            fi
            ;;
        rcd)
            sudo service "$SERVICE_NAME" status || true
            echo ""
            echo "📋 Dernières lignes des logs:"
            tail -20 /var/log/messages 2>/dev/null || tail -20 /var/log/syslog 2>/dev/null || true
            ;;
        *)
            echo "❌ Service '$SERVICE_NAME' non installé."
            echo "   Pour le mode développement, utilisez: ./run.sh --server"
            exit 1
            ;;
    esac
}

service_logs() {
    local svc_type
    svc_type=$(detect_service_system)
    
    echo "📋 Logs en direct (Ctrl+C pour quitter)..."
    
    case "$svc_type" in
        systemd)
            sudo journalctl -u "$SERVICE_NAME" -f
            ;;
        rcd)
            tail -f /var/log/messages 2>/dev/null || tail -f /var/log/syslog 2>/dev/null
            ;;
        *)
            echo "❌ Service '$SERVICE_NAME' non installé."
            exit 1
            ;;
    esac
}

service_check() {
    echo "🔍 Vérifications système..."
    echo ""
    
    # 1. Nginx
    echo -n "1. Nginx: "
    if command -v nginx &>/dev/null; then
        if sudo nginx -t &>/dev/null; then
            echo -e "✅ Configuration OK"
        else
            echo -e "❌ Erreur de configuration"
            sudo nginx -t 2>&1 | head -5
        fi
    else
        echo "⚠️  Non installé"
    fi
    
    # 2. Service status
    local svc_type
    svc_type=$(detect_service_system)
    echo -n "2. Service $SERVICE_NAME: "
    case "$svc_type" in
        systemd)
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                echo -e "✅ ACTIF"
            else
                echo -e "❌ INACTIF"
            fi
            ;;
        rcd)
            if service "$SERVICE_NAME" status &>/dev/null; then
                echo -e "✅ ACTIF"
            else
                echo -e "❌ INACTIF"
            fi
            ;;
        *)
            echo "⚠️  Non installé"
            ;;
    esac
    
    # 3. Port 3001
    echo -n "3. Port 3001: "
    if command -v lsof &>/dev/null && lsof -i :3001 &>/dev/null; then
        if lsof -i :3001 | grep -q "127.0.0.1"; then
            echo -e "✅ Écoute sur localhost uniquement (sécurisé)"
        else
            echo -e "⚠️  Exposé publiquement"
        fi
    else
        echo -e "❌ Aucun processus"
    fi
    
    # 4. SSL Certificate
    echo -n "4. Certificat SSL: "
    if [[ -d "/etc/letsencrypt/live" ]] && [[ -n "$(ls -A /etc/letsencrypt/live 2>/dev/null)" ]]; then
        echo -e "✅ Let's Encrypt configuré"
    else
        echo -e "⚠️  Non configuré"
    fi
    
    # 5. SQLite Database
    echo -n "5. SQLite: "
    if [[ -f "${SQLITE_PATH:-$PROJECT_ROOT/$DEFAULT_SQLITE_PATH}" ]]; then
        echo -e "✅ Base de données présente"
    else
        echo -e "⚠️  Base de données non créée (sera créée au démarrage)"
    fi
    
    echo ""
}

service_update() {
    echo "🔄 Updating server code + dependencies (reproducible)"
    local updater="$SCRIPTS_DIR/server_update.js"
    if [[ ! -f "$updater" ]]; then
        echo "❌ Missing updater script: $updater"
        echo "   Pull the latest code and try again."
        exit 1
    fi

    if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
        node "$updater"
    else
        sudo node "$updater"
    fi
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
        --https)
            # Production mode: start service directly without dev setup
            echo "🔐 Mode production HTTPS (systemd/nginx)"
            service_start
            exit 0
            ;;
        --fastify-url)
            FASTIFY_URL="$2"
            shift 2
            ;;
        # Service management commands (shortcuts)
        start)
            service_start
            exit 0
            ;;
        stop)
            service_stop
            exit 0
            ;;
        restart)
            service_restart
            exit 0
            ;;
        status)
            service_status
            exit 0
            ;;
        logs)
            service_logs
            exit 0
            ;;
        update)
            service_update
            exit 0
            ;;
        check)
            service_check
            exit 0
            ;;
        --help|-h)
            echo "Usage: $ENTRYPOINT_DISPLAY [OPTIONS|COMMAND]"
            echo ""
            echo "Development Options:"
            echo "  -f, --force-deps      Force update all dependencies before starting"
            echo "      --prod            Build a production Tauri bundle and exit"
            echo "      --tauri           Launch only Tauri (no local Fastify server)"
            echo "      --tauri-prod      Build and launch the production Tauri app bundle"
            echo "      --server          Launch only Fastify server (HTTP, dev mode)"
            echo "      --fastify-url URL Configure remote Fastify server URL for Tauri"
            echo ""
            echo "Production Options:"
            echo "      --https           Start production server via systemd/nginx (HTTPS)"
            echo ""
            echo "Service Commands (production):"
            echo "  start                 Start the production service"
            echo "  stop                  Stop the production service"
            echo "  restart               Restart the production service"
            echo "  status                Show service status and recent logs"
            echo "  logs                  Follow service logs (Ctrl+C to exit)"
            echo "  update                Update code + reinstall deps + restart"
            echo "  check                 Run system diagnostics (Nginx, SSL, ports)"
            echo ""
            echo "  -h, --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $ENTRYPOINT_DISPLAY                   # Dev: Start both Fastify + Tauri"
            echo "  $ENTRYPOINT_DISPLAY --server          # Dev: Start only Fastify (HTTP)"
            echo "  $ENTRYPOINT_DISPLAY --https           # Prod: Start via systemd/nginx (HTTPS)"
            echo "  $ENTRYPOINT_DISPLAY status            # Prod: Check service status"
            echo "  $ENTRYPOINT_DISPLAY logs              # Prod: View live logs"
            echo "  $ENTRYPOINT_DISPLAY restart           # Prod: Restart after update"
            echo "  $ENTRYPOINT_DISPLAY --prod            # Build Tauri production bundle"
            echo "  $ENTRYPOINT_DISPLAY --tauri --prod     # Build + launch Tauri production bundle"
            echo "  $ENTRYPOINT_DISPLAY --tauri-prod       # Same as above"
            echo ""
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
    ensure_dev_jwt_secret
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
    ensure_dev_jwt_secret
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

        app_dir="$PROJECT_ROOT/src-tauri/target/release/bundle/macos"
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

        dmg_dir="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg"
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
ensure_dev_jwt_secret
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
    dmg_dir="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg"
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
