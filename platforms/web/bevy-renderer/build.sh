#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/atome/src/wasm"
BUILD_OUT_DIR="$PROJECT_ROOT/temp/bevy_renderer_wasm_pack"

echo "[build] Building squirrel-bevy-renderer..."

if ! command -v wasm-pack &> /dev/null; then
    echo "[build] wasm-pack not found"
    exit 1
fi

cd "$SCRIPT_DIR"

rm -rf "$BUILD_OUT_DIR"
mkdir -p "$BUILD_OUT_DIR" "$OUT_DIR"
trap 'rm -rf "$BUILD_OUT_DIR"' EXIT

wasm-pack build \
    --target web \
    --out-dir "$BUILD_OUT_DIR" \
    --out-name squirrel_bevy_renderer \
    --release

for artifact in \
    squirrel_bevy_renderer.js \
    squirrel_bevy_renderer.d.ts \
    squirrel_bevy_renderer_bg.wasm \
    squirrel_bevy_renderer_bg.wasm.d.ts
do
    install -m 0644 "$BUILD_OUT_DIR/$artifact" "$OUT_DIR/$artifact"
done

# Pre-compress the renderer WASM so @fastify/static (preCompressed) can serve a
# brotli/gzip variant without per-request CPU cost. Uses Node's built-in zlib only.
WASM_FILE="$OUT_DIR/squirrel_bevy_renderer_bg.wasm"
node -e '
const fs = require("fs"), zlib = require("zlib"), crypto = require("crypto");
const file = process.argv[1];
const buf = fs.readFileSync(file);
fs.writeFileSync(file + ".br", zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
fs.writeFileSync(file + ".gz", zlib.gzipSync(buf, { level: 9 }));
// Content version consumed by the service worker and module loader.
const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const directory = require("path").dirname(file);
fs.writeFileSync(require("path").join(directory, "renderer_version.js"), `self.__ATOME_RENDERER_VERSION=${JSON.stringify(hash)};\n`);
fs.writeFileSync(require("path").join(directory, "renderer_version.mjs"), `export const BEVY_RENDERER_VERSION=${JSON.stringify(hash)};\n`);
const mb = (n) => (n / 1e6).toFixed(2) + "MB";
console.log(`[build] pre-compressed wasm ${mb(buf.length)} -> br ${mb(fs.statSync(file + ".br").size)}, gz ${mb(fs.statSync(file + ".gz").size)} | version ${hash}`);
' "$WASM_FILE"

echo "[build] Bevy renderer WASM built to $OUT_DIR"
