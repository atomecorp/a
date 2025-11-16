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
PROJECT_ROOT="$SCRIPT_DIR"
SCRIPTS_DIR="$PROJECT_ROOT/scripts_utils"

# --- Editable defaults -------------------------------------------------------
# Change DEFAULT_UPLOADS_PATH to point uploads elsewhere. Use an absolute path
# or a path relative to the project root (default keeps files inside the repo).
DEFAULT_UPLOADS_PATH="src/assets/uploads"
# Change DEFAULT_MONITORED_PATH to pick the folder watched by chokidar.
# Absolute paths are supported; relative values are resolved from the project root.
DEFAULT_MONITORED_PATH="/Users/Shared/monitored"

compute_default_dsn() {
    local host="${ADOLE_PG_HOST:-${PGHOST:-localhost}}"
    local port="${ADOLE_PG_PORT:-${PGPORT:-5432}}"
    local user="${ADOLE_PG_USER:-${PGUSER:-postgres}}"
    local password="${ADOLE_PG_PASSWORD:-${PGPASSWORD:-postgres}}"
    local database="${ADOLE_PG_DATABASE:-${PGDATABASE:-squirrel}}"

    printf 'postgres://%s:%s@%s:%s/%s' "$user" "$password" "$host" "$port" "$database"
}

write_pg_dsn_to_env() {
    local dsn="$1"
    local env_file="$PROJECT_ROOT/.env"
    local tmp

    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' RETURN

    if [[ -f "$env_file" ]]; then
        grep -v '^ADOLE_PG_DSN=' "$env_file" >"$tmp" || true
    else
        : >"$tmp"
    fi

    printf 'ADOLE_PG_DSN=%s\n' "$dsn" >>"$tmp"
    mv "$tmp" "$env_file"
    trap - RETURN

    chmod 600 "$env_file" 2>/dev/null || true
    echo "INFO: Wrote PostgreSQL DSN to $(basename "$env_file")."
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
        local watch_pattern
        case "$absolute" in
            "$PROJECT_ROOT"*)
                local relative="${absolute#$PROJECT_ROOT/}"
                if [[ -z "$relative" ]]; then
                    watch_pattern="./**/*"
                else
                    watch_pattern="$relative/**/*"
                fi
                ;;
            *)
                watch_pattern="$absolute/**/*"
                ;;
        esac
        export SQUIRREL_SYNC_WATCH="$watch_pattern"
    fi

    echo "👀 Monitored directory: $SQUIRREL_MONITORED_DIR"
    echo "👀 SQUIRREL_SYNC_WATCH=$SQUIRREL_SYNC_WATCH"
}

if [[ -z "${ADOLE_PG_DSN:-}" && -z "${PG_CONNECTION_STRING:-}" && -z "${DATABASE_URL:-}" ]]; then
    echo "INFO: No PostgreSQL connection string detected (ADOLE_PG_DSN/PG_CONNECTION_STRING/DATABASE_URL)."
    local generated_dsn
    generated_dsn="$(compute_default_dsn)"
    if [[ -z "$generated_dsn" ]]; then
        generated_dsn="postgres://postgres:postgres@localhost:5432/squirrel"
    fi

    echo "INFO: Writing default PostgreSQL connection string to .env."
    if ! write_pg_dsn_to_env "$generated_dsn"; then
        echo "ERROR: Failed to configure the PostgreSQL connection string automatically."
        exit 1
    fi

    # Reload environment files to pick up the newly configured DSN
    load_env_file "$PROJECT_ROOT/.env"
    load_env_file "$PROJECT_ROOT/.env.local"
fi

if [[ -z "${ADOLE_PG_DSN:-}" && -z "${PG_CONNECTION_STRING:-}" && -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: No PostgreSQL connection string detected even after automatic configuration."
    echo "       Please configure it manually in .env or export it before running ./run.sh."
    exit 1
fi

prepare_uploads_dir
prepare_monitored_dir

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
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true

    exit 0
}

# Vérifier les arguments de ligne de commande
FORCE_DEPS=false
PROD_BUILD=false

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
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --force-deps      Force update all dependencies before starting"
            echo "      --prod            Build a production Tauri bundle and exit"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                   # Start server (install deps if needed)"
            echo "  $0 --force-deps      # Force update deps then start server"
            echo "  $0 --prod            # Build Tauri production bundle"
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

echo "🚀 Démarrage du serveur Fastify v5..."
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

# Scanner les composants Squirrel (sera relancé par run_fastify mais on garde l'appel initial)
echo "🔍 Scan des composants Squirrel..."
npm run scan:components
echo ""

# Capturer les signaux d'interruption
trap cleanup SIGINT SIGTERM EXIT

echo "🚀 Démarrage des serveurs..."

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