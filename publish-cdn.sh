#!/bin/zsh
# CDN publication script via GitHub + jsDelivr
# Usage: ./publish-cdn.sh

set -e

# 1. Build with rollup (config in ./scripts_utils/rollup.config.cdn.js)
./node_modules/.bin/rollup -c ./scripts_utils/rollup.config.cdn.js

# 2. (Optional) Minification if needed
echo "Minification..."
if command -v terser > /dev/null; then
  terser ./dist/squirrel.js -o ./dist/squirrel.min.js --compress --mangle
else
  echo "terser not found, minification skipped. Install it with: npm i -g terser"
fi

# 3. Copy CSS to dist
cp ./src/css/squirrel.css ./dist/squirrel.css

# Check for CSS presence before publishing
if [ ! -f ./dist/squirrel.css ]; then
  echo "❌ ERROR: ./dist/squirrel.css not found, publication cancelled."
  exit 1
fi

echo "Build complete. Files generated in ./dist:"
ls -lh ./dist/squirrel*.js ./dist/squirrel.css

echo ""
chmod +x ./dist/publish-to-github.sh
read "REPLY?Publish to GitHub and jsDelivr now? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ./dist/publish-to-github.sh --no-confirm
  # Force update the tag to point to the latest commit
  VERSION=$(jq -r .version ./src/version.json 2>/dev/null || echo "1.0.0")
  git tag -f "$VERSION"
  git push origin -f "$VERSION"
else
  echo "Publication cancelled. Files are ready in ./dist."
fi
