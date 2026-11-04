#!/bin/bash
# Cargo runner on macOS (platforms/desktop-tauri/.cargo/config.toml), used by `tauri dev`: the app binary cargo is
# about to run is signed first with the bundle's own identity and identifier (tauri.conf.json `identifier`,
# `bundle.macOS.signingIdentity`), then run. The linker's ad-hoc signature changed at every build, so macOS no
# longer recognised the app that created the device key in the login keychain and asked for the session password
# before letting it sign (D16, 2026-11-04). Every other binary (tests, build scripts) runs as built.
set -euo pipefail

binary="$1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="$root/platforms/desktop-tauri/tauri.conf.json"
if [[ "$(basename "$binary")" == "atome" ]]; then
    identity="$(node -p 'require(process.argv[1]).bundle.macOS.signingIdentity' "$config")"
    identifier="$(node -p 'require(process.argv[1]).identifier' "$config")"
    codesign --force --sign "$identity" --identifier "$identifier" "$binary"
fi
exec "$@"
