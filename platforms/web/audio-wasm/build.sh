#!/bin/bash
# Build the WASM audio engine module
# Output goes to atome/src/wasm/ for use by the web frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/atome/src/wasm"
BUILD_OUT_DIR="$PROJECT_ROOT/temp/audio_wasm_pack"

echo "[build] Building squirrel-audio-wasm..."

# Check wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "[build] wasm-pack not found. Installing..."
    cargo install wasm-pack
fi

cd "$SCRIPT_DIR"

rm -rf "$BUILD_OUT_DIR"
mkdir -p "$BUILD_OUT_DIR" "$OUT_DIR"
trap 'rm -rf "$BUILD_OUT_DIR"' EXIT

# Build for web target (ES module output)
wasm-pack build \
    --target web \
    --out-dir "$BUILD_OUT_DIR" \
    --out-name squirrel_audio_wasm \
    --release

for artifact in \
    squirrel_audio_wasm.js \
    squirrel_audio_wasm.d.ts \
    squirrel_audio_wasm_bg.wasm \
    squirrel_audio_wasm_bg.wasm.d.ts
do
    install -m 0644 "$BUILD_OUT_DIR/$artifact" "$OUT_DIR/$artifact"
done

echo "[build] WASM audio engine built to $OUT_DIR"
echo "[build] Files:"
ls -la "$OUT_DIR"/squirrel_audio_wasm*
