#!/bin/bash

echo "🚀 Démarrage du serveur Fastify v5..."
echo "📂 Répertoire: $(pwd)"
echo "🔧 Node.js: $(node --version)"
echo "📦 NPM: $(npm --version)"
echo ""

# Vérifier si les dépendances sont installées
if [ ! -d "node_modules" ]; then
    echo "📥 Installation des dépendances..."
    npm install
    echo ""
fi

# Démarrer le serveur
echo "🎯 Lancement du serveur..."
cd server && node server.js