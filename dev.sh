#!/bin/bash

# 🚀 SCRIPT DE DÉVELOPPEMENT SQUIRREL FRAMEWORK (Vanilla JS + Tauri + Axum)

echo "🔧 Squirrel Development Script - Pure Vanilla JS Mode"

# Fonction de nettoyage
cleanup() {
    echo "🧹 Arrêt des processus..."
    
    # Tuer Fastify
    if [ ! -z "$FASTIFY_PID" ]; then
        kill $FASTIFY_PID 2>/dev/null
        echo "✅ Fastify arrêté"
    fi
    
    # Tuer Tauri
    if [ ! -z "$TAURI_PID" ]; then
        kill $TAURI_PID 2>/dev/null
        echo "✅ Tauri arrêté"
    fi
    
    # Nettoyage des ports
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    lsof -ti:1420 | xargs kill -9 2>/dev/null
    lsof -ti:7000 | xargs kill -9 2>/dev/null
    
    exit 0
}

# Gérer les signaux
trap cleanup SIGINT SIGTERM

echo "✅ No build step needed - Pure Vanilla JS ready!"

echo "🚀 3. Démarrage du serveur Fastify..."
npm run start:server &
FASTIFY_PID=$!

echo "🎯 4. Démarrage de Tauri..."
npm run tauri dev &
TAURI_PID=$!

echo "
🌟 DÉVELOPPEMENT ACTIF:
- Rollup watch: PID $ROLLUP_PID
- Fastify: PID $FASTIFY_PID  
- Tauri: PID $TAURI_PID
- URLs: http://localhost:3001 | http://localhost:1420

Ctrl+C pour arrêter tous les processus
"

# Attendre un signal
wait
