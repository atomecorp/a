#!/bin/zsh
# CDN publication script via GitHub + jsDelivr
# Usage: ./scripts_utils/publish-cdn.sh

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

# 1. Build with rollup (config in ./scripts_utils/rollup.config.cdn.js)
"$PROJECT_ROOT/node_modules/.bin/rollup" -c "$SCRIPT_DIR/rollup.config.cdn.js"

# 2. (Optional) Minification if needed
echo "Minification..."
if command -v terser > /dev/null; then
  terser "$PROJECT_ROOT/dist/squirrel.js" -o "$PROJECT_ROOT/dist/squirrel.min.js" --compress --mangle
else
  echo "terser not found, minification skipped. Install it with: npm i -g terser"
fi

# 3. Copy CSS to dist
cp "$PROJECT_ROOT/src/css/squirrel.css" "$PROJECT_ROOT/dist/squirrel.css"

# Check for CSS presence before publishing
if [ ! -f "$PROJECT_ROOT/dist/squirrel.css" ]; then
  echo "❌ ERROR: $PROJECT_ROOT/dist/squirrel.css not found, publication cancelled."
  exit 1
fi

echo "Build complete. Files generated in ./dist:"
ls -lh "$PROJECT_ROOT"/dist/squirrel*.js "$PROJECT_ROOT"/dist/squirrel.css

echo ""
chmod +x "$SCRIPT_DIR/publish-to-github.sh"
read "REPLY?Publish to GitHub and jsDelivr now? (y/N): "
if [[ $REPLY =~ ^[Yy]$ ]]; then
  "$SCRIPT_DIR/publish-to-github.sh" --no-confirm
  # Force update the tag to point to the latest commit
  VERSION=$(jq -r .version "$PROJECT_ROOT/src/version.json" 2>/dev/null || echo "1.0.0")
  (cd "$PROJECT_ROOT" && git tag -f "$VERSION" && git push origin -f "$VERSION")
else
  echo "Publication cancelled. Files are ready in ./dist."
fi
