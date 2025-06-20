#!/bin/zsh
# NPM publication script + unpkg
# Usage: ./publish-npm.sh

set -e

# 1. Build with rollup (config in ./scripts_utils/rollup.config.npm.js)
./node_modules/.bin/rollup -c ./scripts_utils/rollup.config.npm.js

# 2. (Optional) Minification
if command -v terser > /dev/null; then
  terser ./dist/squirrel.js -o ./dist/squirrel.min.js --compress --mangle
else
  echo "terser not found, minification skipped. Install it with: npm i -g terser"
fi

# 3. Copy CSS to dist
cp ./src/css/squirrel.css ./dist/squirrel.css

echo "Build complete. Files generated in ./dist:"
ls -lh ./dist/squirrel*.js ./dist/squirrel.css

echo ""
read "REPLY?Publish to NPM and unpkg now? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm publish --access public
  PKG_NAME=$(node -p "require('./package.json').name")
  PKG_VERSION=$(node -p "require('./package.json').version")
  echo "\nUnpkg ready:"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.js"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.css"
  echo "https://unpkg.com/$PKG_NAME@$PKG_VERSION/dist/squirrel.min.css"
else
  echo "NPM publication cancelled. Files are ready in ./dist."
fi
