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

echo "Build terminé. Fichiers générés dans ./dist :"
ls -lh ./dist/squirrel*.js

echo ""
chmod +x ./dist/publish-to-github.sh
read "REPLY?Publier sur GitHub et jsDelivr maintenant ? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ./dist/publish-to-github.sh --no-confirm
else
  echo "Publication annulée. Les fichiers sont prêts dans ./dist."
fi
