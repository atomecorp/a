#!/bin/bash
# Build the WASM audio engine module
# Output goes to src/wasm/ for use by the web frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/src/wasm"

echo "[build] Building squirrel-audio-wasm..."

# Check wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "[build] wasm-pack not found. Installing..."
    cargo install wasm-pack
fi

cd "$SCRIPT_DIR"

# Build for web target (ES module output)
wasm-pack build \
    --target web \
    --out-dir "$OUT_DIR" \
    --out-name squirrel_audio_wasm \
    --release

# Clean up unnecessary files
rm -f "$OUT_DIR/.gitignore" "$OUT_DIR/package.json" "$OUT_DIR/README.md"

echo "[build] WASM audio engine built to $OUT_DIR"
echo "[build] Files:"
ls -la "$OUT_DIR"/squirrel_audio_wasm*
