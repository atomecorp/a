#!/bin/bash
# Build the direct path's WASM module for the AudioWorklet (no JS glue).
# Output goes to atome/src/wasm/ for use by the web frontend.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/atome/src/wasm"
TARGET_DIR="$PROJECT_ROOT/temp/direct_wasm_target"

cd "$SCRIPT_DIR"
mkdir -p "$OUT_DIR"
# Same browser constraint as the audio engine (platforms/web/audio-wasm/build.sh):
# stable engines reject the reference-type descriptors newer Rust emits.
RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-C target-feature=-reference-types,+simd128" \
    CARGO_TARGET_DIR="$TARGET_DIR" cargo build --target wasm32-unknown-unknown --release
install -m 0644 "$TARGET_DIR/wasm32-unknown-unknown/release/atome_direct_wasm.wasm" "$OUT_DIR/atome_direct_wasm.wasm"
echo "[build] direct path WASM built to $OUT_DIR/atome_direct_wasm.wasm"
ls -la "$OUT_DIR/atome_direct_wasm.wasm"
