#!/bin/bash

# Fonction de nettoyage pour tuer les processus
cleanup() {
    echo "🧹 Arrêt des serveurs..."
    
    # Tuer le processus Node.js (Fastify)
    if [ ! -z "$FASTIFY_PID" ]; then
        kill $FASTIFY_PID 2>/dev/null
        echo "✅ Serveur Fastify arrêté"
    fi
    
    # Tuer le processus Tauri
    if [ ! -z "$TAURI_PID" ]; then
        kill $TAURI_PID 2>/dev/null
        echo "✅ Tauri arrêté"
    fi
    
    # Tuer tous les processus sur le port 3001 (sécurité)
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    
    exit 0
}

# Scanner les composants Squirrel
echo "🔍 Scan des composants Squirrel..."
npm run scan:components
echo ""

# Vérifier les arguments de ligne de commande
FORCE_DEPS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force-deps|-f)
            FORCE_DEPS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --force-deps      Force update all dependencies before starting"
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

echo "🚀 Démarrage du serveur Fastify v5..."
echo "📂 Répertoire: $(pwd)"
echo "🔧 Node.js: $(node --version)"
echo "📦 NPM: $(npm --version)"
echo ""

# Vérifier si les dépendances sont installées ou si elles ont besoin d'être mises à jour
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.install_complete" ]; then
    echo "📥 Installation/mise à jour des dépendances Squirrel Framework..."
    
    # Rendre le script exécutable s'il ne l'est pas
    chmod +x install_dependencies.sh
    
    # Lancer l'installation en mode non-interactif
    ./install_dependencies.sh --non-interactive
    
    # Créer un marqueur pour éviter les installations répétées
    touch node_modules/.install_complete
    echo ""
else
    echo "✅ Dépendances déjà installées (utilisez --force pour forcer la mise à jour)"
    echo ""
fi

# Capturer les signaux d'interruption
trap cleanup SIGINT SIGTERM EXIT

echo "🚀 Démarrage des serveurs..."

# Lancer Fastify en arrière-plan via le script
echo "📡 Démarrage du serveur Fastify..."
./run_fastify.sh &
FASTIFY_PID=$!

# Attendre un peu que Fastify démarre
sleep 2

# Lancer Tauri en arrière-plan via le script
echo "🖥️  Démarrage de Tauri..."
./run_tauri.sh &
TAURI_PID=$!

echo "✅ Serveurs lancés:"
echo "   - Fastify: http://localhost:3001 (PID: $FASTIFY_PID)"
echo "   - Tauri en cours de démarrage... (PID: $TAURI_PID)"
echo ""
echo "💡 Appuyez sur Ctrl+C pour arrêter les serveurs"

# Attendre que les processus se terminent
wait $FASTIFY_PID $TAURI_PID