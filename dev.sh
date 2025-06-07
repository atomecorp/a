#!/bin/bash

# 🚀 SCRIPT DE DÉVELOPPEMENT SQUIRREL + SVELTE

echo "🔧 Squirrel Development Script"

# Fonction de nettoyage
cleanup() {
    echo "🧹 Arrêt des processus..."
    
    # Tuer Rollup watch
    if [ ! -z "$ROLLUP_PID" ]; then
        kill $ROLLUP_PID 2>/dev/null
        echo "✅ Rollup watch arrêté"
    fi
    
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
    
    exit 0
}

# Gérer les signaux
trap cleanup SIGINT SIGTERM

echo "📦 1. Construction du bundle Svelte..."
npm run build:svelte

if [ $? -eq 0 ]; then
    echo "✅ Bundle Svelte construit avec succès"
else
    echo "❌ Erreur lors de la construction Svelte"
    exit 1
fi

echo "👀 2. Démarrage du watch Rollup..."
npm run watch:svelte &
ROLLUP_PID=$!

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
