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
SKIP_IPLUG=false

# SQLite database path (no longer using PostgreSQL)
DEFAULT_SQLITE_PATH="database_storage/adole.db"

write_sqlite_path_to_env() {
  local db_path="$1"
  local env_file="$PROJECT_ROOT/.env"
  local tmp

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  if [[ -f "$env_file" ]]; then
    # Remove old PostgreSQL and SQLite entries
    grep -v '^ADOLE_PG_DSN=' "$env_file" | grep -v '^SQLITE_PATH=' | grep -v '^PG_CONNECTION_STRING=' | grep -v '^DATABASE_URL=' >"$tmp" || true
  else
    : >"$tmp"
  fi

  printf 'SQLITE_PATH=%s\n' "$db_path" >>"$tmp"
  mv "$tmp" "$env_file"
  trap - RETURN

  chmod 600 "$env_file" 2>/dev/null || true
  log_ok "✅ SQLite path stored in $(basename "$env_file")"
}

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    log_info "🌱 Loading variables from $(basename "$env_file")"
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

ensure_env_configured() {
  load_env_file "$PROJECT_ROOT/.env"
  load_env_file "$PROJECT_ROOT/.env.local"

  # Check for SQLite path configuration
  if [[ -z "${SQLITE_PATH:-}" ]]; then
    local db_path="$PROJECT_ROOT/$DEFAULT_SQLITE_PATH"
    log_info "ℹ️  No SQLITE_PATH found. Writing default path to .env."
    if ! write_sqlite_path_to_env "$db_path"; then
      log_error "❌ Failed to persist SQLite path in .env."
      exit 1
    fi

    load_env_file "$PROJECT_ROOT/.env"
    load_env_file "$PROJECT_ROOT/.env.local"
  fi

  # Ensure SQLite directory exists
  local sqlite_dir
  sqlite_dir="$(dirname "${SQLITE_PATH:-$PROJECT_ROOT/$DEFAULT_SQLITE_PATH}")"
  if [[ ! -d "$sqlite_dir" ]]; then
    mkdir -p "$sqlite_dir"
    log_ok "✅ Created database directory: $sqlite_dir"
  fi
}

show_help() {
  cat <<'EOF'
Usage: ./update_all_libraries.sh [options]

Options:
  -m, --mode <stable|latest>   Select update mode (default: stable)
  -s, --stable                 Shortcut for --mode stable
  -l, --latest                 Shortcut for --mode latest
  --skip-tauri             Skip updating @tauri-apps/cli
  --skip-fastify           Skip updating Fastify and related plugins
  --skip-iplug             Skip refreshing iPlug2 (tools/update_iplug2.sh)
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
    --skip-iplug)
      SKIP_IPLUG=true
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
if [[ -f "$SCRIPT_DIR/package.json" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
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

ensure_env_configured

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
    log_error "❌ 'jq' is required to resolve latest versions."
    log_error "   - macOS: brew install jq"
    log_error "   - Debian/Ubuntu: sudo apt-get install jq"
    log_error "   - FreeBSD: pkg install jq"
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


ensure_chokidar_dependency() {
  local desired="${1:-^3.6.0}"
  log_info "👀 Checking chokidar dependency"
  if (cd "$PROJECT_ROOT" && npm ls chokidar >/dev/null 2>&1); then
    log_ok "✅ chokidar already installed"
    return
  fi

  log_info "📦 Installing chokidar@${desired}"
  if (cd "$PROJECT_ROOT" && npm install "chokidar@${desired}"); then
    log_ok "✅ chokidar ready"
  else
    log_warn "⚠️  Unable to install chokidar automatically"
  fi
}

reinstall_project_dependencies() {
  local installer="$PROJECT_ROOT/scripts_utils/install_dependencies.sh"
  if [ ! -f "$installer" ]; then
    log_warn "⚠️  Dependency installer not found at $installer (skipping full dependency refresh)"
    return
  fi

  if [ ! -x "$installer" ]; then
    chmod +x "$installer"
  fi

  log_info "📦 Reinstalling project dependencies (this may take a while)"
  if (cd "$PROJECT_ROOT" && "$installer" --non-interactive --force); then
    log_ok "✅ Project dependencies refreshed"
  else
    log_error "❌ Dependency reinstallation failed"
    return 1
  fi
}

update_iplug2() {
  if [ "$SKIP_IPLUG" = true ]; then
    log_warn "⏭️  Skipping iPlug2 update (--skip-iplug)"
    return
  fi

  local updater="$PROJECT_ROOT/tools/update_iplug2.sh"
  if [ ! -f "$updater" ]; then
    log_error "❌ iPlug2 updater not found at $updater"
    return 1
  fi

  if [ ! -x "$updater" ]; then
    chmod +x "$updater"
  fi

  log_info "🎛  Updating iPlug2 dependency"
  if (cd "$PROJECT_ROOT" && "$updater"); then
    log_ok "✅ iPlug2 refreshed"
  else
    log_error "❌ iPlug2 update failed"
    return 1
  fi
}

# --- Stable mode -----------------------------------------------------------

# --- Skia Stack Installation (Removed) -------------------------------------
# Skia and BGFX references have been removed as per new architecture.
# This function is kept empty or removed to prevent errors if called.


# --- Stable mode -----------------------------------------------------------
run_stable_updates() {
  log_info "🔄 Updating libraries to pinned stable versions"

  declare -a STABLE_LIBS=(
    "gsap.min.js|https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js"
    "tone.min.js|https://unpkg.com/tone@15.1.22/build/Tone.js"
    "Tone.js.map|https://unpkg.com/tone@15.1.22/build/Tone.js.map"
    "leaflet.min.js|https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
    "leaflet.min.css|https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
    "wavesurfer.min.js|https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.min.js"
    "wavesurfer-v7/core/wavesurfer.esm.min.js|https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.esm.min.js"
    "three.min.js|https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.module.min.js"
    "three.core.min.js|https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.core.min.js"
    # Opal Ruby runtime
    "opal.min.js|https://cdn.opalrb.com/opal/1.8.2/opal.min.js"
    "opal-parser.min.js|https://cdn.opalrb.com/opal/1.8.2/opal-parser.min.js"
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

  # Download Tone.js map for latest version
  total=$((total + 1))
  if download_latest_asset "Tone.js.map" "https://unpkg.com/tone@$TONE_VERSION/build/Tone.js.map" "tone" "$TONE_VERSION"; then
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

  # Opal Ruby runtime (version stable, pas de CDN avec latest)
  log_info "💎 Downloading Opal Ruby runtime..."
  total=$((total + 1))
  if download_file "https://cdn.opalrb.com/opal/1.8.2/opal.min.js" "$JS_DIR/opal.min.js" "opal.min.js"; then
    success=$((success + 1))
  fi

  total=$((total + 1))
  if download_file "https://cdn.opalrb.com/opal/1.8.2/opal-parser.min.js" "$JS_DIR/opal-parser.min.js" "opal-parser.min.js"; then
    success=$((success + 1))
  fi

  log_info "📊 Summary: $success/$total files updated successfully"
  if [[ $success -lt $total ]]; then
    log_warn "⚠️  Some libraries may not have updated"
  else
    log_ok "🎉 Latest libraries downloaded"
  fi

  # Build CodeMirror bundle for offline use
  log_info "📦 Building CodeMirror bundle for offline use..."
  if (cd "$PROJECT_ROOT" && npm run build:codemirror 2>/dev/null); then
    log_ok "✅ CodeMirror bundle created"
  else
    log_warn "⚠️  CodeMirror bundle build failed (run 'npm run build:codemirror' manually)"
  fi
}

# --- Main -----------------------------------------------------------------
# Execution logic moved to main() at the end of script


install_sqlite_modules() {
  log_info "🧩 Ensuring SQLite/libSQL drivers are installed"
  (cd "$PROJECT_ROOT" && npm install better-sqlite3@latest @libsql/client@latest)
  log_ok "✅ SQLite/libSQL drivers installed"
}

setup_sqlite_database() {
  local sqlite_path="${SQLITE_PATH:-$PROJECT_ROOT/database_storage/adole.db}"
  local sqlite_dir
  sqlite_dir="$(dirname "$sqlite_path")"
  
  if [[ ! -d "$sqlite_dir" ]]; then
    log_info "📂 Creating SQLite directory: $sqlite_dir"
    mkdir -p "$sqlite_dir"
  fi
  
  log_ok "✅ SQLite database path configured: $sqlite_path"
}

ensure_runtime_directories() {
  log_info "📁 Ensuring runtime directories exist..."

  # Uploads directory
  local uploads_dir="$PROJECT_ROOT/src/assets/uploads"
  if [ ! -d "$uploads_dir" ]; then
    mkdir -p "$uploads_dir"
    log_ok "Directory 'src/assets/uploads' created"
  fi

  # Libs directory
  local libs_dir="$PROJECT_ROOT/src/assets/libs"
  if [ ! -d "$libs_dir" ]; then
    mkdir -p "$libs_dir"
    log_ok "Directory 'src/assets/libs' created"
  fi

  # Monitored directory (OS specific)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    local monitored_dir="/Users/Shared/monitored"
    if [ ! -d "$monitored_dir" ]; then
      mkdir -p "$monitored_dir"
      chmod 777 "$monitored_dir" 2>/dev/null || true
      log_ok "Directory '$monitored_dir' created"
    fi
  elif [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "linux"* || "$OSTYPE" == "freebsd"* ]]; then
    local monitored_dir="/tmp/monitored"
    if [ ! -d "$monitored_dir" ]; then
      mkdir -p "$monitored_dir"
      log_ok "Directory '$monitored_dir' created"
    fi
  else
    log_warn "⚠️  Unknown OS '$OSTYPE'. Skipping monitored directory creation."
  fi
}

# --- Main Execution --------------------------------------------------------

main() {
  log_info "🚀 Starting Atome Full Installation/Update..."
  log_info "ℹ️  Mode: $MODE"

  # 1. Call install_server.sh to handle system dependencies and server setup (Linux only)
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if [[ -f "$PROJECT_ROOT/install_server.sh" ]]; then
        log_info "🔗 Calling install_server.sh..."
        # We might need sudo for install_server.sh if it installs system packages
        if [ "$EUID" -ne 0 ]; then
            log_warn "⚠️  install_server.sh usually requires root. You might be prompted for password."
            sudo "$PROJECT_ROOT/install_server.sh"
        else
            "$PROJECT_ROOT/install_server.sh"
        fi
    else
        log_error "❌ install_server.sh not found in $PROJECT_ROOT"
        # We don't exit here because we might want to continue with other updates
    fi
  else
    log_info "ℹ️  Skipping install_server.sh (not on Linux)"
  fi

  ensure_env_configured

  if [[ "$SKIP_TAURI" == "false" ]]; then
    update_tauri_cli
  else
    log_info "⏭️  Skipping Tauri CLI update"
  fi

  if [[ "$SKIP_FASTIFY" == "false" ]]; then
    update_fastify_stack
  else
    log_info "⏭️  Skipping Fastify plugins update"
  fi

  if [[ "$SKIP_IPLUG" == "false" ]]; then
    update_iplug2
  else
    log_info "⏭️  Skipping iPlug2 update"
  fi

  if [[ "$MODE" == "stable" ]]; then
    run_stable_updates
  else
    run_latest_updates
  fi

  ensure_chokidar_dependency
  reinstall_project_dependencies
  install_sqlite_modules
  setup_sqlite_database
  ensure_runtime_directories

  log_ok "🎉 All updates complete!"
}

main
