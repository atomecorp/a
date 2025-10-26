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
    npm run tauri build
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