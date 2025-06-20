#!/bin/zsh
# Script de publication NPM + unpkg
# Usage: ./publish-npm.sh

set -e

# 1. Build avec rollup (config dans ./scripts_utils/rollup.config.npm.js)
./node_modules/.bin/rollup -c ./scripts_utils/rollup.config.npm.js

# 2. (Optionnel) Minification
if command -v terser > /dev/null; then
  terser ./dist/squirrel.js -o ./dist/squirrel.min.js --compress --mangle
else
  echo "terser non trouvé, minification ignorée. Installez-le avec: npm i -g terser"
fi

# 3. Copier le CSS dans dist
cp ./src/css/squirrel.css ./dist/squirrel.css

echo "Build terminé. Fichiers générés dans ./dist :"
ls -lh ./dist/squirrel*.js ./dist/squirrel.css

echo ""
read "REPLY?Publier sur NPM et unpkg maintenant ? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm publish --access public
  PKG_NAME=$(node -p "require('./package.json').name")
  PKG_VERSION=$(node -p "require('./package.json').version")
  echo "\nUnpkg prêt :"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.css"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.css"
else
  echo "Publication NPM annulée. Les fichiers sont prêts dans ./dist."
fi
