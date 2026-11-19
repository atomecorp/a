#!/bin/bash
# Shared steps of the browser WASM builds (sourced by bevy-renderer/build.sh and
# audio-wasm/build.sh): the workspace build profile, the wasm-bindgen CLI of the
# exact version locked in Cargo.lock, then wasm-opt.

WASM_WEB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

    # The target directory is read at each call, never when this file is sourced: a CARGO_TARGET_DIR given to
    # the call alone once built into it while wasm-bindgen read the root target's older artifact (R-189,
    # 18 Nov. 2026). Made absolute and handed to cargo itself, so the build and the read are one directory.
    local target_dir="${CARGO_TARGET_DIR:-$WASM_WEB_ROOT/target}"
    case "$target_dir" in
        /*) ;;
        *) target_dir="$PWD/$target_dir" ;;
    esac
    (cd "$WASM_WEB_ROOT" && cargo build -p "$package" --lib --target wasm32-unknown-unknown --profile "$profile" --target-dir "$target_dir") || return 1
    local wasm="$target_dir/wasm32-unknown-unknown/$profile/$stem.wasm"
    wasm-bindgen "$wasm" --target web --out-dir "$out_dir" --out-name "$out_name" || return 1
    if [ "$#" -gt 0 ]; then
        wasm-opt "$out_dir/${out_name}_bg.wasm" -o "$out_dir/${out_name}_bg.wasm" "$@" || return 1
    fi
}
