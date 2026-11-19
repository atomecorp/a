#!/bin/bash
# Builds the document scripts' engine (atome-script-wasm) into atome/src/wasm/, or into $1 when given (a measurement
# or a probe), with its brotli and gzip copies, on the model of lottie-wasm/build.sh. Its memory cap is set by
# build.rs at link time and kept by wasm-bindgen and wasm-opt.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${1:-$PROJECT_ROOT/atome/src/wasm}"
BUILD_OUT_DIR="$PROJECT_ROOT/temp/script_wasm_pack"

echo "[build] Building atome-script-wasm..."

rm -rf "$BUILD_OUT_DIR"
mkdir -p "$BUILD_OUT_DIR" "$OUT_DIR"
trap 'rm -rf "$BUILD_OUT_DIR"' EXIT

# shellcheck source=../wasm_web_build.sh
source "$SCRIPT_DIR/../wasm_web_build.sh"
# -Os: Opal's runtime is evaluated at each Ruby run, so the interpreter's speed counts as much as its download.
wasm_web_build atome-script-wasm wasm-script atome_script_wasm \
    "$BUILD_OUT_DIR" atome_script_wasm -Os --all-features

for artifact in \
    atome_script_wasm.js \
    atome_script_wasm.d.ts \
    atome_script_wasm_bg.wasm \
    atome_script_wasm_bg.wasm.d.ts
do
    install -m 0644 "$BUILD_OUT_DIR/$artifact" "$OUT_DIR/$artifact"
done

WASM_FILE="$OUT_DIR/atome_script_wasm_bg.wasm"
node -e '
const fs = require("fs"), zlib = require("zlib");
const file = process.argv[1];
const buf = fs.readFileSync(file);
fs.writeFileSync(file + ".br", zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
fs.writeFileSync(file + ".gz", zlib.gzipSync(buf, { level: 9 }));
const mb = (n) => (n / 1e6).toFixed(2) + "MB";
console.log(`[build] pre-compressed wasm ${mb(buf.length)} -> br ${mb(fs.statSync(file + ".br").size)}, gz ${mb(fs.statSync(file + ".gz").size)}`);
' "$WASM_FILE"

echo "[build] Document script engine WASM built to $OUT_DIR"
