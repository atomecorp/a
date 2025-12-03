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

# --- PostgreSQL defaults -----------------------------------------------------
DEFAULT_PG_USER="squirrel"
DEFAULT_PG_PASSWORD="squirrel_secret"
DEFAULT_PG_DATABASE="squirrel_db"
DEFAULT_PG_HOST="localhost"
DEFAULT_PG_PORT="5432"

# =============================================================================
# POSTGRESQL AUTO-SETUP FUNCTION
# =============================================================================
# This function ensures PostgreSQL is properly configured for a fresh clone.
# It handles: service check, user creation, database creation, DSN generation.
# It NEVER drops existing databases or users.
# =============================================================================

setup_postgres() {
    echo ""
    echo "🐘 Vérification de la configuration PostgreSQL..."
    echo ""

    # 1. Check if PostgreSQL is installed
    if ! command -v psql &>/dev/null; then
        echo "❌ PostgreSQL n'est pas installé sur ce système."
        echo ""
        echo "📦 Instructions d'installation:"
        echo ""
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "   macOS (Homebrew):"
            echo "   brew install postgresql@15"
            echo "   brew services start postgresql@15"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "   Ubuntu/Debian:"
            echo "   sudo apt update && sudo apt install postgresql postgresql-contrib"
            echo "   sudo systemctl start postgresql"
            echo ""
            echo "   Fedora/RHEL:"
            echo "   sudo dnf install postgresql-server postgresql-contrib"
            echo "   sudo postgresql-setup --initdb"
            echo "   sudo systemctl start postgresql"
        fi
        echo ""
        return 1
    fi

    echo "✅ PostgreSQL est installé ($(psql --version | head -1))"

    # 2. Check if PostgreSQL service is running
    local pg_running=false

    # Try to connect to PostgreSQL
    if pg_isready -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" &>/dev/null; then
        pg_running=true
    fi

    if [[ "$pg_running" == "false" ]]; then
        echo "⚠️  Le service PostgreSQL ne semble pas être en cours d'exécution."
        echo ""

        # Try to start it
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "🔄 Tentative de démarrage du service PostgreSQL (macOS)..."
            if brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null; then
                sleep 2
                if pg_isready -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" &>/dev/null; then
                    echo "✅ Service PostgreSQL démarré avec succès"
                    pg_running=true
                fi
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "🔄 Tentative de démarrage du service PostgreSQL (Linux)..."
            if sudo systemctl start postgresql 2>/dev/null; then
                sleep 2
                if pg_isready -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" &>/dev/null; then
                    echo "✅ Service PostgreSQL démarré avec succès"
                    pg_running=true
                fi
            fi
        fi

        if [[ "$pg_running" == "false" ]]; then
            echo "❌ Impossible de démarrer PostgreSQL automatiquement."
            echo ""
            echo "📋 Démarrez-le manuellement:"
            if [[ "$OSTYPE" == "darwin"* ]]; then
                echo "   brew services start postgresql@15"
            else
                echo "   sudo systemctl start postgresql"
            fi
            echo ""
            return 1
        fi
    else
        echo "✅ Service PostgreSQL en cours d'exécution"
    fi

    # 3. Determine which superuser to use for admin operations
    local pg_admin_user=""
    local pg_admin_cmd=""

    # On macOS, the current user is often the PostgreSQL superuser
    # On Linux, 'postgres' is typically the superuser
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Try current user first (common on Homebrew installs)
        if psql -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" -U "$USER" -d postgres -c "SELECT 1;" &>/dev/null; then
            pg_admin_user="$USER"
            pg_admin_cmd="psql -h $DEFAULT_PG_HOST -p $DEFAULT_PG_PORT -U $USER"
        elif psql -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" -U postgres -d postgres -c "SELECT 1;" &>/dev/null; then
            pg_admin_user="postgres"
            pg_admin_cmd="psql -h $DEFAULT_PG_HOST -p $DEFAULT_PG_PORT -U postgres"
        fi
    else
        # On Linux, try sudo -u postgres
        if sudo -u postgres psql -c "SELECT 1;" &>/dev/null; then
            pg_admin_user="postgres"
            pg_admin_cmd="sudo -u postgres psql"
        fi
    fi

    if [[ -z "$pg_admin_cmd" ]]; then
        echo "❌ Impossible de trouver un utilisateur PostgreSQL admin."
        echo "   Vérifiez que vous avez les droits d'accès à PostgreSQL."
        return 1
    fi

    echo "✅ Connexion admin PostgreSQL: $pg_admin_user"

    # 4. Check if project user exists, create if not
    local user_exists
    user_exists=$($pg_admin_cmd -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DEFAULT_PG_USER';" 2>/dev/null || echo "")

    if [[ "$user_exists" == "1" ]]; then
        echo "✅ Utilisateur '$DEFAULT_PG_USER' existe déjà"
    else
        echo "🔧 Création de l'utilisateur '$DEFAULT_PG_USER'..."
        if $pg_admin_cmd -d postgres -c "CREATE USER $DEFAULT_PG_USER WITH PASSWORD '$DEFAULT_PG_PASSWORD' CREATEDB;" &>/dev/null; then
            echo "✅ Utilisateur '$DEFAULT_PG_USER' créé avec succès"
        else
            echo "❌ Échec de la création de l'utilisateur '$DEFAULT_PG_USER'"
            return 1
        fi
    fi

    # 5. Check if project database exists, create if not
    local db_exists
    db_exists=$($pg_admin_cmd -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DEFAULT_PG_DATABASE';" 2>/dev/null || echo "")

    if [[ "$db_exists" == "1" ]]; then
        echo "✅ Base de données '$DEFAULT_PG_DATABASE' existe déjà"
    else
        echo "🔧 Création de la base de données '$DEFAULT_PG_DATABASE'..."
        if $pg_admin_cmd -d postgres -c "CREATE DATABASE $DEFAULT_PG_DATABASE OWNER $DEFAULT_PG_USER;" &>/dev/null; then
            echo "✅ Base de données '$DEFAULT_PG_DATABASE' créée avec succès"
        else
            echo "❌ Échec de la création de la base de données '$DEFAULT_PG_DATABASE'"
            return 1
        fi
    fi

    # 6. Grant privileges (idempotent)
    $pg_admin_cmd -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DEFAULT_PG_DATABASE TO $DEFAULT_PG_USER;" &>/dev/null || true

    # 7. Build and export DSN
    local dsn="postgres://$DEFAULT_PG_USER:$DEFAULT_PG_PASSWORD@$DEFAULT_PG_HOST:$DEFAULT_PG_PORT/$DEFAULT_PG_DATABASE"

    # 8. Verify connection with the project user
    echo "🔄 Vérification de la connexion avec l'utilisateur projet..."
    if PGPASSWORD="$DEFAULT_PG_PASSWORD" psql -h "$DEFAULT_PG_HOST" -p "$DEFAULT_PG_PORT" -U "$DEFAULT_PG_USER" -d "$DEFAULT_PG_DATABASE" -c "SELECT 1;" &>/dev/null; then
        echo "✅ Connexion à la base de données réussie"
    else
        echo "❌ Impossible de se connecter avec l'utilisateur '$DEFAULT_PG_USER'"
        echo "   DSN testé: $dsn"
        return 1
    fi

    # 9. Write DSN to .env file
    echo "💾 Sauvegarde de la configuration dans .env..."
    write_pg_dsn_to_env "$dsn"

    # 10. Export for current session
    export ADOLE_PG_DSN="$dsn"

    echo ""
    echo "🎉 Configuration PostgreSQL terminée avec succès!"
    echo "   Utilisateur: $DEFAULT_PG_USER"
    echo "   Base:        $DEFAULT_PG_DATABASE"
    echo "   Host:        $DEFAULT_PG_HOST:$DEFAULT_PG_PORT"
    echo ""

    return 0
}

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

if [[ -z "${ADOLE_PG_DSN:-}" && -z "${PG_CONNECTION_STRING:-}" && -z "${DATABASE_URL:-}" ]]; then
    echo "INFO: No PostgreSQL connection string detected (ADOLE_PG_DSN/PG_CONNECTION_STRING/DATABASE_URL)."
    echo ""
    
    # Try automatic PostgreSQL setup
    if ! setup_postgres; then
        echo ""
        echo "❌ La configuration automatique de PostgreSQL a échoué."
        echo ""
        echo "📋 Options disponibles:"
        echo ""
        echo "   1. Configurez manuellement PostgreSQL et créez un fichier .env:"
        echo "      echo 'ADOLE_PG_DSN=postgres://user:password@localhost:5432/database' > .env"
        echo ""
        echo "   2. Ou exportez la variable avant de lancer le script:"
        echo "      export ADOLE_PG_DSN='postgres://user:password@localhost:5432/database'"
        echo "      ./run.sh"
        echo ""
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

# Get the active DSN (in order of priority)
ACTIVE_PG_DSN="${ADOLE_PG_DSN:-${PG_CONNECTION_STRING:-${DATABASE_URL:-}}}"

# Validate the DSN format and check for common issues
validate_pg_dsn() {
    local dsn="$1"
    
    # Check for placeholder values
    if [[ "$dsn" == *"COLLER"* || "$dsn" == *"PASTE"* || "$dsn" == *"YOUR_"* || "$dsn" == *"your_"* || "$dsn" == *"VALEUR"* || "$dsn" == *"VALUE"* ]]; then
        echo "❌ The PostgreSQL DSN contains a placeholder value:"
        echo "   $dsn"
        echo ""
        echo "   This looks like a template that was never configured."
        echo "   Please set a real connection string."
        return 1
    fi
    
    # Check basic format
    if [[ ! "$dsn" =~ ^postgres(ql)?:// ]]; then
        echo "❌ Invalid PostgreSQL DSN format. Must start with postgres:// or postgresql://"
        echo "   Current value: $dsn"
        return 1
    fi
    
    # Extract hostname from DSN (postgres://user:pass@HOST:port/db)
    local host_part
    host_part=$(echo "$dsn" | sed -E 's|^postgres(ql)?://[^@]*@([^:/]+).*|\2|')
    
    if [[ -z "$host_part" ]]; then
        echo "❌ Could not extract hostname from DSN"
        return 1
    fi
    
    # Check for suspicious hostnames
    if [[ "$host_part" == "base" || "$host_part" == "host" || "$host_part" == "server" || "$host_part" == "hostname" ]]; then
        echo "❌ Invalid hostname in DSN: '$host_part'"
        echo "   This looks like a placeholder value. Please configure a real hostname."
        echo ""
        echo "   Current DSN: $dsn"
        echo ""
        echo "   To fix, edit .env or export ADOLE_PG_DSN with a valid connection string:"
        echo "   export ADOLE_PG_DSN='postgres://user:password@localhost:5432/database'"
        return 1
    fi
    
    return 0
}

if ! validate_pg_dsn "$ACTIVE_PG_DSN"; then
    echo ""
    echo "💡 Tip: If you have an old ADOLE_PG_DSN in your shell profile (~/.zshrc, ~/.bashrc),"
    echo "   you may need to unset it or update it:"
    echo "   unset ADOLE_PG_DSN"
    echo ""
    exit 1
fi

# Show configured DSN (masked password for security)
MASKED_DSN=$(echo "$ACTIVE_PG_DSN" | sed -E 's|(postgres(ql)?://[^:]+:)[^@]+(@)|\1***\3|')
echo "✅ PostgreSQL DSN configuré: $MASKED_DSN"
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
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true

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
        --server)
            SERVER_ONLY=true
            shift
            ;;
        --fastify-url)
            FASTIFY_URL="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --force-deps      Force update all dependencies before starting"
            echo "      --prod            Build a production Tauri bundle and exit"
            echo "      --tauri           Launch only Tauri (no local Fastify server)"
            echo "      --server          Launch only Fastify server (no Tauri)"
            echo "      --fastify-url URL Configure remote Fastify server URL for Tauri"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                   # Start both Fastify + Tauri"
            echo "  $0 --tauri           # Start only Tauri (connects to remote Fastify)"
            echo "  $0 --server          # Start only Fastify server"
            echo "  $0 --tauri --fastify-url https://myserver.com"
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

# Export Fastify URL for Tauri to use
if [[ -n "$FASTIFY_URL" ]]; then
    export SQUIRREL_FASTIFY_URL="$FASTIFY_URL"
    echo "🌐 Remote Fastify URL: $FASTIFY_URL"
fi

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

# Scanner les composants Squirrel (sera relancé par run_fastify mais on garde l'appel initial)
echo "🔍 Scan des composants Squirrel..."
npm run scan:components
echo ""

# Capturer les signaux d'interruption
trap cleanup SIGINT SIGTERM EXIT

echo "🚀 Démarrage des serveurs..."

# Mode --server uniquement (pas de Tauri)
if [ "$SERVER_ONLY" = true ]; then
    echo "📡 Mode serveur uniquement (pas de Tauri)"
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
    echo "🖥️  Mode Tauri uniquement (pas de Fastify local)"
    if [ -n "$FASTIFY_URL" ]; then
        echo "🌐 Connexion au serveur distant: $FASTIFY_URL"
    else
        echo "⚠️  Aucun serveur Fastify configuré. Utilisez --fastify-url URL"
        echo "    ou exportez SQUIRREL_FASTIFY_URL avant de lancer."
    fi
    echo "🖥️  Démarrage de Tauri..."
    if [ "$FORCE_DEPS" = true ]; then
        "$SCRIPTS_DIR/run_tauri.sh" --force-deps
    else
        "$SCRIPTS_DIR/run_tauri.sh"
    fi
    exit 0
fi

# Mode normal: Fastify + Tauri

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
