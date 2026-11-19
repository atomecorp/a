#!/bin/bash
# Builds the Lottie player module (atome-lottie-wasm) into atome/src/wasm/, or into $1 when given (a measurement or a
# probe), with its brotli and gzip copies, on the model of bevy-renderer/build.sh.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${1:-$PROJECT_ROOT/atome/src/wasm}"
BUILD_OUT_DIR="$PROJECT_ROOT/temp/lottie_wasm_pack"

echo "[build] Building atome-lottie-wasm..."

rm -rf "$BUILD_OUT_DIR"
mkdir -p "$BUILD_OUT_DIR" "$OUT_DIR"
trap 'rm -rf "$BUILD_OUT_DIR"' EXIT

# shellcheck source=../wasm_web_build.sh
source "$SCRIPT_DIR/../wasm_web_build.sh"
# -Oz: the module is downloaded when a Lottie atome is first shown or imported; --all-features lets wasm-opt
# accept the post-MVP opcodes Rust emits (as for the renderer).
wasm_web_build atome-lottie-wasm wasm-renderer atome_lottie_wasm \
    "$BUILD_OUT_DIR" atome_lottie_wasm -Oz --all-features

for artifact in \
    atome_lottie_wasm.js \
    atome_lottie_wasm.d.ts \
    atome_lottie_wasm_bg.wasm \
    atome_lottie_wasm_bg.wasm.d.ts
do
    install -m 0644 "$BUILD_OUT_DIR/$artifact" "$OUT_DIR/$artifact"
done

WASM_FILE="$OUT_DIR/atome_lottie_wasm_bg.wasm"
node -e '
const fs = require("fs"), zlib = require("zlib");
const file = process.argv[1];
const buf = fs.readFileSync(file);
fs.writeFileSync(file + ".br", zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
fs.writeFileSync(file + ".gz", zlib.gzipSync(buf, { level: 9 }));
const mb = (n) => (n / 1e6).toFixed(2) + "MB";
console.log(`[build] pre-compressed wasm ${mb(buf.length)} -> br ${mb(fs.statSync(file + ".br").size)}, gz ${mb(fs.statSync(file + ".gz").size)}`);
' "$WASM_FILE"

echo "[build] Lottie player WASM built to $OUT_DIR"
