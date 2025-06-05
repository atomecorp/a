#!/bin/bash

# Script principal pour démarrer Squirrel
# Usage: ./start-squirrel.sh

PORT=${1:-3001}

echo "🐿️ Starting Squirrel Transpiler System"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier que Node.js est disponible
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Vérifier que les dépendances sont installées
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Créer le dossier output s'il n'existe pas
if [ ! -d "output" ]; then
    mkdir -p output
    echo "📁 Created output directory"
fi

# Démarrer le serveur
echo "🚀 Starting Squirrel Transpiler Server on port $PORT..."
echo "🌐 Application will be available at: http://localhost:$PORT"
echo "💾 Transpiled files will be saved to: ./output/"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Démarrer le serveur
SQUIRREL_PORT=$PORT node server/squirrel-server.js
