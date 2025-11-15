#!/bin/zsh
# NPM publication script + unpkg
# Usage: ./scripts_utils/publish-npm.sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

# 1. Build with rollup (config in ./scripts_utils/rollup.config.npm.js)
"$PROJECT_ROOT/node_modules/.bin/rollup" -c "$SCRIPT_DIR/rollup.config.npm.js"

# 2. (Optional) Minification
if command -v terser > /dev/null; then
  terser "$PROJECT_ROOT/dist/squirrel.js" -o "$PROJECT_ROOT/dist/squirrel.min.js" --compress --mangle
else
  echo "terser not found, minification skipped. Install it with: npm i -g terser"
fi

# 3. Copy CSS to dist
cp "$PROJECT_ROOT/src/css/squirrel.css" "$PROJECT_ROOT/dist/squirrel.css"

echo "Build complete. Files generated in ./dist:"
ls -lh "$PROJECT_ROOT"/dist/squirrel*.js "$PROJECT_ROOT"/dist/squirrel.css

if ! (cd "$PROJECT_ROOT" && npm whoami > /dev/null 2>&1); then
  echo "\n⚠️  Aucun compte npm connecté sur cette machine."
  echo "Exécutez 'npm login' (ou 'npm adduser') puis relancez la publication."
  echo "Étape NPM/unpkg ignorée, les artefacts sont prêts dans ./dist."
  exit 0
fi

echo ""
read "REPLY?Publish to NPM and unpkg now? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  (cd "$PROJECT_ROOT" && npm publish --access public)
  PKG_NAME=$(node -p "require('$PROJECT_ROOT/package.json').name")
  PKG_VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
  echo "\nUnpkg ready:"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.css"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.css"
else
  echo "NPM publication cancelled. Files are ready in ./dist."
fi
