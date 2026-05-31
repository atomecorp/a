#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/atome/src/wasm"

echo "[build] Building squirrel-bevy-renderer..."

if ! command -v wasm-pack &> /dev/null; then
    echo "[build] wasm-pack not found"
    exit 1
fi

cd "$SCRIPT_DIR"

wasm-pack build \
    --target web \
    --out-dir "$OUT_DIR" \
    --out-name squirrel_bevy_renderer \
    --release

rm -f "$OUT_DIR/.gitignore" "$OUT_DIR/package.json" "$OUT_DIR/README.md"

echo "[build] Bevy renderer WASM built to $OUT_DIR"
