#!/usr/bin/env bash
#
# update_all_libraries.sh
# ------------------------
# Unified script to update frontend libraries plus Tauri CLI.
# - "stable" mode pins vetted versions (GSAP, Tone, Leaflet, Wavesurfer + plugins, Three.js).
# - "latest" mode pulls the most recent GSAP & Tone.js from their CDNs with backup/rollback.
# - Always refreshes @tauri-apps/cli to the latest release (unless --skip-tauri).

set -euo pipefail

MODE="stable"          # stable | latest
SKIP_TAURI=false
SKIP_FASTIFY=false

show_help() {
  cat <<'EOF'
Usage: ./update_all_libraries.sh [options]

Options:
  -m, --mode <stable|latest>   Select update mode (default: stable)
  -s, --stable                 Shortcut for --mode stable
  -l, --latest                 Shortcut for --mode latest
      --skip-tauri             Skip updating @tauri-apps/cli
      --skip-fastify           Skip updating Fastify and related plugins
  -h, --help                   Show this help message

Examples:
  ./update_all_libraries.sh              # Stable/pinned versions + tauri update
  ./update_all_libraries.sh --latest     # Only GSAP & Tone.js latest + tauri update
  ./update_all_libraries.sh --skip-tauri # Update libs but keep current tauri-cli
EOF
}

# --- Parse arguments -------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)
      MODE="${2:-}"
      shift 2
      ;;
    --stable|-s)
      MODE="stable"
      shift
      ;;
    --latest|-l)
      MODE="latest"
      shift
      ;;
    --skip-tauri)
      SKIP_TAURI=true
      shift
      ;;
    --skip-fastify)
      SKIP_FASTIFY=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

MODE="$(printf '%s' "$MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$MODE" != "stable" && "$MODE" != "latest" ]]; then
  echo "❌ Unsupported mode: $MODE (use 'stable' or 'latest')" >&2
  exit 1
fi

# --- Resolve directories ---------------------------------------------------
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JS_DIR="$PROJECT_ROOT/src/js"
mkdir -p "$JS_DIR"

# --- Logging helpers -------------------------------------------------------
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { printf "${BLUE}%s${NC}\n" "$1"; }
log_ok()    { printf "${GREEN}%s${NC}\n" "$1"; }
log_warn()  { printf "${YELLOW}%s${NC}\n" "$1"; }
log_error() { printf "${RED}%s${NC}\n" "$1"; }

# --- Utility helpers -------------------------------------------------------
get_file_size_human() {
  local file="$1"
  if command -v stat >/dev/null 2>&1; then
    if stat --version >/dev/null 2>&1; then
      stat -c '%s' "$file"
    else
      stat -f '%z' "$file"
    fi
  else
    wc -c <"$file"
  fi
}

download_file() {
  local url="$1"
  local target="$2"
  local label="$3"
  local tmp="$target.tmp"
  local dir
  dir="$(dirname "$target")"
  mkdir -p "$dir"

  log_info "📥 Downloading $label"
  if curl -fsSL "$url" -o "$tmp"; then
    mv "$tmp" "$target"
    local bytes
    bytes="$(get_file_size_human "$target")"
    log_ok "✅ $label downloaded (${bytes} bytes)"
  else
    rm -f "$tmp"
    log_error "❌ Failed to download $label"
    return 1
  fi
}

backup_and_download() {
  local filename="$1"
  local url="$2"
  local target="$JS_DIR/$filename"
  local backup="$target.backup"

  log_info "📦 Processing $filename"
  if [ -f "$target" ]; then
    log_info "💾 Creating backup for $filename"
    cp "$target" "$backup"
  fi

  if curl -fsSL "$url" -o "$target.tmp"; then
    local bytes
    bytes="$(get_file_size_human "$target.tmp")"
    if [[ "$bytes" -gt 1000 ]]; then
      mv "$target.tmp" "$target"
      rm -f "$backup"
      log_ok "✅ $filename updated (${bytes} bytes)"
    else
      log_error "❌ $filename looks corrupted (size ${bytes} bytes)"
      rm -f "$target.tmp"
      if [ -f "$backup" ]; then
        mv "$backup" "$target"
        log_warn "🔄 Restored previous $filename from backup"
      fi
      return 1
    fi
  else
    log_error "❌ Failed to download $filename"
    rm -f "$target.tmp"
    if [ -f "$backup" ]; then
      mv "$backup" "$target"
      log_warn "🔄 Restored previous $filename from backup"
    fi
    return 1
  fi
}

update_tauri_cli() {
  if [ "$SKIP_TAURI" = true ]; then
    log_warn "⏭️  Skipping Tauri CLI update (--skip-tauri)"
    return
  fi

  log_info "🧰 Updating @tauri-apps/cli to latest"
  (cd "$PROJECT_ROOT" && npm install --save-dev @tauri-apps/cli@latest)
  log_ok "✅ @tauri-apps/cli bumped to latest"
}

update_fastify_stack() {
  if [ "$SKIP_FASTIFY" = true ]; then
    log_warn "⏭️  Skipping Fastify update (--skip-fastify)"
    return
  fi

  log_info "🛠  Updating Fastify stack to latest"
  (
    cd "$PROJECT_ROOT" &&
    npm install \
      fastify@latest \
      @fastify/static@latest \
      @fastify/websocket@latest \
      @fastify/cors@latest
  )
  log_ok "✅ Fastify stack bumped to latest"
}

# --- Stable mode -----------------------------------------------------------
run_stable_updates() {
  log_info "🔄 Updating libraries to pinned stable versions"

  declare -a STABLE_LIBS=(
    "gsap.min.js|https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js"
    "tone.min.js|https://unpkg.com/tone@15.1.22/build/Tone.js"
    "leaflet.min.js|https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
    "leaflet.min.css|https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
    "wavesurfer.min.js|https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.min.js"
    "wavesurfer-v7/core/wavesurfer.esm.min.js|https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.esm.min.js"
    "three.min.js|https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.module.min.js"
    "three.core.min.js|https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.core.min.js"
  )

  for entry in "${STABLE_LIBS[@]}"; do
    IFS='|' read -r target url <<<"$entry"
    download_file "$url" "$JS_DIR/$target" "$target"
  done

  # Wavesurfer plugins
  log_info "🔌 Updating wavesurfer.js plugins"
  local plugins=(
    envelope.esm.min.js
    hover.esm.min.js
    minimap.esm.min.js
    record.esm.min.js
    regions.esm.min.js
    spectrogram.esm.min.js
    spectrogram-windowed.esm.min.js
    timeline.esm.min.js
    zoom.esm.min.js
  )
  for plugin in "${plugins[@]}"; do
    download_file \
      "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/plugins/$plugin" \
      "$JS_DIR/wavesurfer-v7/plugins/$plugin" \
      "wavesurfer plugin $plugin"
  done

  log_ok "🎉 Stable libraries refreshed"
}

# --- Latest mode -----------------------------------------------------------
run_latest_updates() {
  log_info "🚀 Updating GSAP & Tone.js to latest releases"
  local success=0
  local total=2

  if backup_and_download "gsap.min.js" "https://unpkg.com/gsap@latest/dist/gsap.min.js"; then
    success=$((success + 1))
  fi

  if backup_and_download "tone.min.js" "https://unpkg.com/tone@latest/build/Tone.js"; then
    success=$((success + 1))
  fi

  log_info "📊 Summary: $success/$total files updated successfully"
  if [[ $success -lt $total ]]; then
    log_warn "⚠️  Some libraries may not have updated"
  else
    log_ok "🎉 Latest libraries downloaded"
  fi
}

# --- Main -----------------------------------------------------------------
case "$MODE" in
  stable)
    run_stable_updates
    ;;
  latest)
    run_latest_updates
    ;;
esac

update_tauri_cli
update_fastify_stack
log_ok "✅ All updates complete"
