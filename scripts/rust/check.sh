#!/bin/bash
# The Rust gate of the workspace (npm run check:rust): formatting, clippy on
# every product target with zero first-party warning, the host tests, then the
# cargo-deny policy (deny.toml). Any finding fails the run.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
LOG_DIR="$ROOT/temp/rust_check"
mkdir -p "$LOG_DIR"
FAILED=0

report() {
    local name="$1" rc="$2"
    if [ "$rc" -eq 0 ]; then
        printf '[check:rust] %-12s ok\n' "$name"
    else
        printf '[check:rust] %-12s FAILED (%s)\n' "$name" "$LOG_DIR/$name.log"
        FAILED=1
    fi
}

# clippy_target <name> <cargo clippy args...>: the third-party sources kept
# verbatim (the wgpu fork, the STT plugin) are reported but never judged here.
clippy_target() {
    local name="$1"
    shift
    cargo clippy "$@" --message-format=json > "$LOG_DIR/$name.json" 2> "$LOG_DIR/$name.log"
    local rc=$?
    local findings
    findings="$(jq -r 'select(.reason == "compiler-message")
        | select(.message.level == "warning" or .message.level == "error")
        | select(.package_id | (contains("wgpu-web-external-texture") or contains("tauri-plugin-stt")) | not)
        | .message.rendered' "$LOG_DIR/$name.json")"
    if [ -n "$findings" ]; then
        printf '%s\n' "$findings" >> "$LOG_DIR/$name.log"
        rc=1
    fi
    report "$name" "$rc"
}

command -v jq >/dev/null 2>&1 || { echo "[check:rust] fatal: jq missing" >&2; exit 1; }
command -v cargo-deny >/dev/null 2>&1 || { echo "[check:rust] fatal: cargo-deny missing; install: cargo install --locked cargo-deny" >&2; exit 1; }

cargo fmt --all -- --check > "$LOG_DIR/fmt.log" 2>&1
report fmt $?

HOST_EXCLUDES=(--exclude squirrel-bevy-renderer --exclude squirrel-audio-wasm --exclude atome-direct-wasm --exclude atome-ios-bevy-renderer)
clippy_target host --workspace "${HOST_EXCLUDES[@]}" --all-targets
clippy_target wasm_bevy -p squirrel-bevy-renderer -p atome-bevy-renderer-core --lib --target wasm32-unknown-unknown
clippy_target wasm_audio -p squirrel-audio-wasm --lib --target wasm32-unknown-unknown
RUSTFLAGS="-C target-feature=-reference-types,+simd128" clippy_target wasm_direct -p atome-direct-wasm --lib --target wasm32-unknown-unknown
clippy_target ios -p atome-ios-bevy-renderer --lib --target aarch64-apple-ios
# The vault confinement is Linux code (the production host).
clippy_target linux_confine -p atome-confine --lib --target x86_64-unknown-linux-gnu

# One package at a time: each is tested with its own features, as its hosts build
# it (a workspace-wide run would give every engine the Tauri voice feature).
: > "$LOG_DIR/test.log"
TEST_RC=0
for package in atome-dsp atome-instrument atome-mix-graph atome-store atome-voice-turns \
    atome-bevy-renderer-core tauri-plugin-billing tauri-plugin-health tauri-plugin-mobile-host; do
    echo "== $package" >> "$LOG_DIR/test.log"
    cargo test -p "$package" >> "$LOG_DIR/test.log" 2>&1 || TEST_RC=1
done
# The vault supervisor's tests start the atome-vault binary: both packages in one run.
echo "== atome-vault atome-server" >> "$LOG_DIR/test.log"
cargo test -p atome-vault -p atome-server >> "$LOG_DIR/test.log" 2>&1 || TEST_RC=1
# The audio engine owns the process's one output device and microphone: its
# tests run one at a time (src/scheduled_backend_tests.rs).
echo "== atome-audio-engine" >> "$LOG_DIR/test.log"
cargo test -p atome-audio-engine -- --test-threads=1 >> "$LOG_DIR/test.log" 2>&1 || TEST_RC=1
# Tauri as tauri:dev builds it.
echo "== squirrel" >> "$LOG_DIR/test.log"
cargo test -p squirrel >> "$LOG_DIR/test.log" 2>&1 || TEST_RC=1
report test "$TEST_RC"

cargo deny check > "$LOG_DIR/deny.log" 2>&1
report deny $?

exit "$FAILED"
