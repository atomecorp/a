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
./run_taurie.sh &
TAURI_PID=$!

echo "✅ Serveurs lancés:"
echo "   - Fastify: http://localhost:3001 (PID: $FASTIFY_PID)"
echo "   - Tauri en cours de démarrage... (PID: $TAURI_PID)"
echo ""
echo "💡 Appuyez sur Ctrl+C pour arrêter les serveurs"

# Attendre que les processus se terminent
wait $FASTIFY_PID $TAURI_PID