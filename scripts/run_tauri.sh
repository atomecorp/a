#!/bin/bash
set -euo pipefail

# Resolve script directory and project root
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

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

echo "🖥️ Démarrage de Tauri..."

stop_stale_tauri_dev_runtime() {
    local patterns=(
        "target/debug/squirrel"
        "tauri dev"
        "npm run tauri:dev"
    )
    local current_pid="$$"
    local parent_pid="${PPID:-}"

    for pattern in "${patterns[@]}"; do
        local pids
        pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
        if [[ -z "$pids" ]]; then
            continue
        fi

        echo "INFO: Closing stale Tauri dev process for '$pattern': $pids"
        while IFS= read -r pid; do
            [[ -z "$pid" ]] && continue
            [[ "$pid" == "$current_pid" ]] && continue
            [[ -n "$parent_pid" && "$pid" == "$parent_pid" ]] && continue
            kill "$pid" 2>/dev/null || true
        done <<< "$pids"
    done

    sleep 1

    local remaining
    remaining="$(pgrep -f "target/debug/squirrel" 2>/dev/null || true)"
    if [[ -n "$remaining" ]]; then
        echo "WARN: Stale Tauri dev runtime did not exit after SIGTERM; forcing shutdown: $remaining"
        while IFS= read -r pid; do
            [[ -z "$pid" ]] && continue
            [[ "$pid" == "$current_pid" ]] && continue
            [[ -n "$parent_pid" && "$pid" == "$parent_pid" ]] && continue
            kill -9 "$pid" 2>/dev/null || true
        done <<< "$remaining"
    fi
}

# Vérifier les arguments de ligne de commande
FORCE_DEPS=false
TEST_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --test)
            TEST_MODE=true
            shift
            ;;
        --force-deps|-f)
            FORCE_DEPS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --force-deps      Force update all dependencies before starting"
            echo "      --test            Start with local test mode and pre-auth OTP bypass"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                   # Start server (install deps if needed)"
            echo "  $0 --force-deps      # Force update deps then start server"
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

if [ "$TEST_MODE" = true ]; then
    if [[ "${NODE_ENV:-}" == "production" ]]; then
        echo "ERROR: --test cannot run with NODE_ENV=production."
        exit 1
    fi
    export NODE_ENV=test
    export SQUIRREL_AUTH_TEST_MODE=1
    export SQUIRREL_AUTH_OTP_BYPASS=1
    echo "🧪 Test mode enabled: pre-auth OTP verification bypass is active."
fi

echo "🚀 Préparation de l'environnement Tauri..."
echo "📂 Répertoire: $(pwd)"
echo "🔧 Node.js: $(node --version)"
echo "📦 NPM: $(npm --version)"
echo ""

# Vérifier si les dépendances sont installées ou si elles ont besoin d'être mises à jour
if $FORCE_DEPS; then
    echo "⚠️  Forçage de la réinstallation des dépendances (--force)"
    rm -f node_modules/.install_complete
fi

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.install_complete" ]; then
    echo "📥 Installation/mise à jour des dépendances Squirrel Framework..."
    
    # Rendre le script exécutable s'il ne l'est pas
    chmod +x "$SCRIPT_DIR/install_dependencies.sh"
    
    # Lancer l'installation en mode non-interactif
    "$SCRIPT_DIR/install_dependencies.sh" --non-interactive
    
    # Créer un marqueur pour éviter les installations répétées
    touch node_modules/.install_complete
    echo ""
else
    echo "✅ Dépendances déjà installées (utilisez --force pour forcer la mise à jour)"
    echo ""
fi

stop_stale_tauri_dev_runtime

# Lancer Tauri
npm run tauri:dev
