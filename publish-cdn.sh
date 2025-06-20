#!/bin/zsh
# Script de publication CDN via GitHub + jsDelivr
# Usage: ./publish-cdn.sh

set -e

# 1. Build avec rollup (config dans ./scripts_utils/rollup.config.cdn.js)
./node_modules/.bin/rollup -c ./scripts_utils/rollup.config.cdn.js

# 2. (Optionnel) Minification si besoin
echo "Minification..."
if command -v terser > /dev/null; then
  terser ./dist/squirrel.js -o ./dist/squirrel.min.js --compress --mangle
else
  echo "terser non trouvé, minification ignorée. Installez-le avec: npm i -g terser"
fi

# 3. Copier le CSS dans dist
cp ./src/css/squirrel.css ./dist/squirrel.css

# Vérifier la présence du CSS avant publication
if [ ! -f ./dist/squirrel.css ]; then
  echo "❌ ERREUR : ./dist/squirrel.css introuvable, publication annulée."
  exit 1
fi

echo "Build terminé. Fichiers générés dans ./dist :"
ls -lh ./dist/squirrel*.js ./dist/squirrel.css

echo ""
chmod +x ./dist/publish-to-github.sh
read "REPLY?Publier sur GitHub et jsDelivr maintenant ? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ./dist/publish-to-github.sh --no-confirm
  # Mise à jour forcée du tag pour pointer sur le dernier commit
  VERSION=$(jq -r .version ./src/version.json 2>/dev/null || echo "1.0.0")
  git tag -f "$VERSION"
  git push origin -f "$VERSION"
else
  echo "Publication annulée. Les fichiers sont prêts dans ./dist."
fi
