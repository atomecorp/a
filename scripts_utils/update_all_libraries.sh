#!/usr/bin/env bash
#
# update_all_libraries.sh
# ------------------------
# Unified script to update frontend libraries plus Tauri CLI.
# - "stable" mode pins vetted versions (GSAP, Tone, Leaflet, Wavesurfer + plugins, Three.js).
# - "latest" mode pulls the most recent GSAP, Tone.js, Leaflet (+CSS), Wavesurfer (+plugins), and Three.js with backup/rollback and version tracking.
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
  local min_size="${3:-1024}"
  local target="$JS_DIR/$filename"
  local backup="$target.backup"
  local target_dir
  target_dir="$(dirname "$target")"
  mkdir -p "$target_dir"

  log_info "📦 Processing $filename"
  if [ -f "$target" ]; then
    log_info "💾 Creating backup for $filename"
    cp "$target" "$backup"
  fi

  if curl -fsSL "$url" -o "$target.tmp"; then
    local bytes
    bytes="$(get_file_size_human "$target.tmp")"
    if [[ "$bytes" -ge "$min_size" ]]; then
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

create_version_file() {
  local filename="$1"
  local package="$2"
  local version="$3"
  local url="$4"
  local target="$JS_DIR/$filename"
  local version_path="${target}.version"

  mkdir -p "$(dirname "$version_path")"
  cat > "$version_path" <<EOF
# Version info for $filename
package=$package
version=$version
download_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
url=$url
EOF
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    log_error "❌ 'jq' is required to resolve latest versions. Install it via 'brew install jq' or your package manager."
    exit 1
  fi
}

get_latest_version() {
  local package="$1"
  local version

  version=$(curl -fsSL "https://registry.npmjs.org/$package" | jq -r '."dist-tags".latest' 2>/dev/null) || {
    log_error "❌ Failed to query npm registry for $package"
    return 1
  }

  if [[ -z "$version" || "$version" == "null" ]]; then
    log_error "❌ Unable to determine latest version for $package"
    return 1
  fi

  printf '%s' "$version"
}

download_latest_asset() {
  local filename="$1"
  local url="$2"
  local package="$3"
  local version="$4"
  local min_size="${5:-256}"

  if backup_and_download "$filename" "$url" "$min_size"; then
    create_version_file "$filename" "$package" "$version" "$url"
    return 0
  fi

  return 1
}

download_wavesurfer_plugins_latest() {
  local version="$1"
  local success_ref="$2"
  local total_ref="$3"

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
    printf -v "$total_ref" '%d' "$(( ${!total_ref} + 1 ))"
    local plugin_path="wavesurfer-v7/plugins/$plugin"
    local plugin_url="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$version/plugins/$plugin"
    if download_latest_asset "$plugin_path" "$plugin_url" "wavesurfer.js" "$version" 64; then
      printf -v "$success_ref" '%d' "$(( ${!success_ref} + 1 ))"
    fi
  done
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
  require_jq

  log_info "🚀 Updating libraries to latest releases"
  log_info "🔍 Resolving latest versions from npm registry"

  local GSAP_VERSION
  local TONE_VERSION
  local LEAFLET_VERSION
  local WAVESURFER_VERSION
  local THREE_VERSION

  GSAP_VERSION=$(get_latest_version "gsap") || return 1
  TONE_VERSION=$(get_latest_version "tone") || return 1
  LEAFLET_VERSION=$(get_latest_version "leaflet") || return 1
  WAVESURFER_VERSION=$(get_latest_version "wavesurfer.js") || return 1
  THREE_VERSION=$(get_latest_version "three") || return 1

  log_info "📦 Latest versions:"
  log_info "   • GSAP:        $GSAP_VERSION"
  log_info "   • Tone.js:     $TONE_VERSION"
  log_info "   • Leaflet:     $LEAFLET_VERSION"
  log_info "   • Wavesurfer:  $WAVESURFER_VERSION"
  log_info "   • Three.js:    $THREE_VERSION"

  local success=0
  local total=0

  total=$((total + 1))
  if download_latest_asset "gsap.min.js" "https://unpkg.com/gsap@$GSAP_VERSION/dist/gsap.min.js" "gsap" "$GSAP_VERSION"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "tone.min.js" "https://unpkg.com/tone@$TONE_VERSION/build/Tone.js" "tone" "$TONE_VERSION"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "leaflet.min.js" "https://cdnjs.cloudflare.com/ajax/libs/leaflet/$LEAFLET_VERSION/leaflet.min.js" "leaflet" "$LEAFLET_VERSION"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "leaflet.min.css" "https://cdnjs.cloudflare.com/ajax/libs/leaflet/$LEAFLET_VERSION/leaflet.min.css" "leaflet" "$LEAFLET_VERSION" 64; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "wavesurfer.min.js" "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$WAVESURFER_VERSION/wavesurfer.min.js" "wavesurfer.js" "$WAVESURFER_VERSION"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "wavesurfer-v7/core/wavesurfer.esm.min.js" "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$WAVESURFER_VERSION/wavesurfer.esm.min.js" "wavesurfer.js" "$WAVESURFER_VERSION"; then
    success=$((success + 1))
  fi

  download_wavesurfer_plugins_latest "$WAVESURFER_VERSION" success total

  total=$((total + 1))
  if download_latest_asset "three.min.js" "https://cdnjs.cloudflare.com/ajax/libs/three.js/$THREE_VERSION/three.module.min.js" "three" "$THREE_VERSION"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_latest_asset "three.core.min.js" "https://cdnjs.cloudflare.com/ajax/libs/three.js/$THREE_VERSION/three.core.min.js" "three" "$THREE_VERSION"; then
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
