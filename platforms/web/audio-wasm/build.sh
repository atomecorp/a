#!/bin/bash
# Build the WASM audio engine module
# Output goes to atome/src/wasm/ for use by the web frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/atome/src/wasm"
BUILD_OUT_DIR="$PROJECT_ROOT/temp/audio_wasm_pack"

echo "[build] Building squirrel-audio-wasm..."

rm -rf "$BUILD_OUT_DIR"
mkdir -p "$BUILD_OUT_DIR" "$OUT_DIR"
trap 'rm -rf "$BUILD_OUT_DIR"' EXIT

# The wasm-bindgen 0.2.122 glue needs reference types (its externref table);
# the module keeps the Safari 15 feature set: no GC or exact heap types
# (checked with `wasm-tools validate`, 2026-11-04).
# shellcheck source=../wasm_web_build.sh
source "$SCRIPT_DIR/../wasm_web_build.sh"
wasm_web_build squirrel-audio-wasm wasm-audio squirrel_audio_wasm \
    "$BUILD_OUT_DIR" squirrel_audio_wasm -O

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
