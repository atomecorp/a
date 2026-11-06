#!/bin/bash
# Shared steps of the browser WASM builds (sourced by bevy-renderer/build.sh and
# audio-wasm/build.sh): the workspace build profile, the wasm-bindgen CLI of the
# exact version locked in Cargo.lock, then wasm-opt.

WASM_WEB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WASM_WEB_TARGET_DIR="${CARGO_TARGET_DIR:-$WASM_WEB_ROOT/target}"

# wasm_web_build <package> <profile> <wasm file stem> <out dir> <out name> [wasm-opt args...]
wasm_web_build() {
    local package="$1" profile="$2" stem="$3" out_dir="$4" out_name="$5"
    shift 5

    local locked
    locked="$(awk '$0 == "name = \"wasm-bindgen\"" { getline; gsub(/"/, "", $3); print $3 }' "$WASM_WEB_ROOT/Cargo.lock")"
    if [ -z "$locked" ]; then
        echo "[build] fatal: wasm-bindgen is not locked in $WASM_WEB_ROOT/Cargo.lock" >&2
        return 1
    fi
    if ! command -v wasm-bindgen >/dev/null 2>&1; then
        echo "[build] fatal: wasm-bindgen CLI missing; install: cargo install --locked wasm-bindgen-cli --version $locked" >&2
        return 1
    fi
    local cli
    cli="$(wasm-bindgen --version | awk '{ print $2 }')"
    if [ "$cli" != "$locked" ]; then
        echo "[build] fatal: wasm-bindgen CLI $cli differs from the locked library $locked; install: cargo install --locked wasm-bindgen-cli --version $locked" >&2
        return 1
    fi
    if [ "$#" -gt 0 ] && ! command -v wasm-opt >/dev/null 2>&1; then
        echo "[build] fatal: wasm-opt (binaryen) missing" >&2
        return 1
    fi

    (cd "$WASM_WEB_ROOT" && cargo build -p "$package" --lib --target wasm32-unknown-unknown --profile "$profile") || return 1
    local wasm="$WASM_WEB_TARGET_DIR/wasm32-unknown-unknown/$profile/$stem.wasm"
    wasm-bindgen "$wasm" --target web --out-dir "$out_dir" --out-name "$out_name" || return 1
    if [ "$#" -gt 0 ]; then
        wasm-opt "$out_dir/${out_name}_bg.wasm" -o "$out_dir/${out_name}_bg.wasm" "$@" || return 1
    fi
}
