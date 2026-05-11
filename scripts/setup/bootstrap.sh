#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SETUP_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SETUP_DIR/../.." >/dev/null 2>&1 && pwd)"
REQUIRED_NODE_MAJOR=22

log_info() { echo "[setup][info] $1"; }
log_warn() { echo "[setup][warn] $1"; }
log_error() { echo "[setup][error] $1"; }

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

node_major() {
  if ! has_cmd node; then
    echo 0
    return
  fi
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

run_with_sudo() {
  if [[ ${EUID:-$(id -u)} -ne 0 ]] && has_cmd sudo; then
    sudo "$@"
  else
    "$@"
  fi
}

is_wsl() {
  if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
    return 0
  fi
  if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    return 0
  fi
  return 1
}

detect_os() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  case "$uname_out" in
    darwin)
      echo "macos"
      ;;
    freebsd)
      echo "freebsd"
      ;;
    linux)
      if is_wsl; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

detect_linux_pkg_manager() {
  if has_cmd apt-get; then
    echo "apt"
    return
  fi
  if has_cmd dnf; then
    echo "dnf"
    return
  fi
  if has_cmd yum; then
    echo "yum"
    return
  fi
  if has_cmd pacman; then
    echo "pacman"
    return
  fi
  echo "none"
}

linux_native_deps_ready() {
  local os
  os="$(detect_os)"

  if [[ "$os" != "linux" && "$os" != "wsl" ]]; then
    return 0
  fi

  if ! has_cmd pkg-config; then
    return 1
  fi

  if ! has_cmd lsof; then
    return 1
  fi

  if ! pkg-config --exists alsa; then
    return 1
  fi

  if has_cmd ldconfig; then
    if ! ldconfig -p 2>/dev/null | grep -q "libvosk.so"; then
      return 1
    fi
  elif [[ ! -f "/usr/local/lib/libvosk.so" && ! -f "/usr/lib/libvosk.so" && ! -f "/usr/lib/x86_64-linux-gnu/libvosk.so" ]]; then
    return 1
  fi

  return 0
}

ensure_vosk_runtime_linux() {
  local os
  os="$(detect_os)"

  if [[ "$os" != "linux" && "$os" != "wsl" ]]; then
    return 0
  fi

  if has_cmd ldconfig && ldconfig -p 2>/dev/null | grep -q "libvosk.so"; then
    return 0
  fi

  local project_vosk="$PROJECT_ROOT/src-tauri/native/lib/libvosk.so"
  if [[ -f "$project_vosk" ]]; then
    log_info "Installing Vosk runtime from project copy..."
    run_with_sudo mkdir -p /usr/local/lib
    run_with_sudo cp "$project_vosk" /usr/local/lib/libvosk.so
    if has_cmd ldconfig; then
      run_with_sudo ldconfig
    fi
    return 0
  fi

  log_info "Installing Vosk runtime from upstream release..."
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  curl -fsSL -o "$tmp_dir/vosk-linux-x86_64-0.3.42.zip" \
    "https://github.com/alphacep/vosk-api/releases/download/v0.3.42/vosk-linux-x86_64-0.3.42.zip"

  if ! has_cmd unzip; then
    log_error "unzip is required to install Vosk runtime automatically."
    exit 1
  fi

  unzip -q "$tmp_dir/vosk-linux-x86_64-0.3.42.zip" -d "$tmp_dir"
  local extracted_vosk
  extracted_vosk="$(find "$tmp_dir" -type f -name 'libvosk.so' | head -n 1)"
  if [[ -z "$extracted_vosk" || ! -f "$extracted_vosk" ]]; then
    log_error "Unable to locate libvosk.so after extraction."
    exit 1
  fi

  run_with_sudo mkdir -p /usr/local/lib
  run_with_sudo cp "$extracted_vosk" /usr/local/lib/libvosk.so
  if has_cmd ldconfig; then
    run_with_sudo ldconfig
  fi

  trap - RETURN
  rm -rf "$tmp_dir"
}

install_macos() {
  if ! has_cmd xcode-select; then
    log_warn "xcode-select not found. Install Xcode Command Line Tools manually."
  else
    if ! xcode-select -p >/dev/null 2>&1; then
      log_info "Installing Xcode Command Line Tools..."
      xcode-select --install || true
      log_warn "If installation prompt opened, rerun ./run.sh after completion."
    fi
  fi

  if ! has_cmd brew; then
    log_error "Homebrew is required on macOS. Install from https://brew.sh then rerun ./run.sh"
    exit 1
  fi

  log_info "Installing missing macOS dependencies with brew..."
  brew update || true
  local packages=(git curl pkg-config)
  for pkg in "${packages[@]}"; do
    if ! brew list "$pkg" >/dev/null 2>&1; then
      brew install "$pkg"
    fi
  done

  # mediasoup requires Node >=22 in this project.
  if [[ "$(node_major)" -lt "$REQUIRED_NODE_MAJOR" ]]; then
    if brew list node@22 >/dev/null 2>&1; then
      true
    else
      brew install node@22
    fi
    brew link --overwrite --force node@22 || true
  elif ! has_cmd node; then
    brew install node
  fi

  if ! has_cmd rustc; then
    if brew list rustup-init >/dev/null 2>&1; then
      true
    else
      brew install rustup-init
    fi
    rustup-init -y || true
    export PATH="$HOME/.cargo/bin:$PATH"
  fi
}

install_linux_like() {
  local manager
  manager="$(detect_linux_pkg_manager)"

  case "$manager" in
    apt)
      log_info "Installing missing Linux dependencies with apt..."
      run_with_sudo apt-get update
      # Core build/dev tools + ALSA (for Tauri/alsa-sys) + lsof (for process management)
      run_with_sudo apt-get install -y git curl ca-certificates gnupg pkg-config build-essential python3 libssl-dev libasound2-dev lsof unzip

      # mediasoup requires Node >=22 in this project.
      if [[ "$(node_major)" -lt "$REQUIRED_NODE_MAJOR" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | run_with_sudo bash -
        run_with_sudo apt-get install -y nodejs
      else
        run_with_sudo apt-get install -y nodejs npm || true
      fi

      # Common Tauri Linux dependencies (safe to preinstall for desktop support).
      run_with_sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev patchelf || true
      ;;
    dnf)
      log_info "Installing missing Linux dependencies with dnf..."
      run_with_sudo dnf install -y git curl pkgconf-pkg-config gcc gcc-c++ make python3 openssl-devel
      if [[ "$(node_major)" -lt "$REQUIRED_NODE_MAJOR" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | run_with_sudo bash -
      fi
      run_with_sudo dnf install -y nodejs npm || run_with_sudo dnf install -y nodejs
      run_with_sudo dnf install -y gtk3-devel webkit2gtk4.1-devel librsvg2-devel libappindicator-gtk3-devel || true
      ;;
    yum)
      log_info "Installing missing Linux dependencies with yum..."
      run_with_sudo yum install -y git curl pkgconfig gcc gcc-c++ make python3 openssl-devel
      if [[ "$(node_major)" -lt "$REQUIRED_NODE_MAJOR" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | run_with_sudo bash -
      fi
      run_with_sudo yum install -y nodejs npm || run_with_sudo yum install -y nodejs
      run_with_sudo yum install -y gtk3-devel webkit2gtk4.1-devel librsvg2-devel libappindicator-gtk3-devel || true
      ;;
    pacman)
      log_info "Installing missing Linux dependencies with pacman..."
      run_with_sudo pacman -Sy --noconfirm git curl nodejs npm pkgconf base-devel python openssl
      run_with_sudo pacman -Sy --noconfirm gtk3 webkit2gtk-4.1 librsvg libappindicator-gtk3 || true
      ;;
    *)
      log_error "Unsupported Linux package manager. Install Node.js, npm, git, curl, rust manually then rerun ./run.sh"
      exit 1
      ;;
  esac

  if ! has_cmd rustc || ! has_cmd cargo; then
    log_info "Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    export PATH="$HOME/.cargo/bin:$PATH"
  fi

  ensure_vosk_runtime_linux
}

install_freebsd() {
  if ! has_cmd pkg; then
    log_error "pkg is required on FreeBSD."
    exit 1
  fi

  log_info "Installing missing FreeBSD dependencies with pkg..."
  run_with_sudo pkg update
  run_with_sudo pkg install -y git curl pkgconf python3 rust
  if pkg info node22 >/dev/null 2>&1; then
    true
  else
    run_with_sudo pkg install -y node22 || run_with_sudo pkg install -y node npm
  fi
  # Optional desktop dependencies for Tauri/webkit stack on FreeBSD.
  run_with_sudo pkg install -y gtk3 webkit2-gtk3 librsvg2 || true
}

ensure_basics() {
  local os
  os="$(detect_os)"
  log_info "Detected platform: $os"

  if has_cmd node && [[ "$(node_major)" -ge "$REQUIRED_NODE_MAJOR" ]] && has_cmd npm && has_cmd git && has_cmd curl && has_cmd rustc && has_cmd cargo; then
    if linux_native_deps_ready; then
      log_info "Core dependencies already installed."
      return
    fi
    log_warn "Core dependencies are present but native Linux Tauri dependencies are missing. Installing required system packages..."
  fi

  case "$os" in
    macos)
      install_macos
      ;;
    linux|wsl)
      install_linux_like
      ;;
    freebsd)
      install_freebsd
      ;;
    *)
      log_error "Unsupported platform for automatic bootstrap: $os"
      exit 1
      ;;
  esac

  if ! has_cmd node || [[ "$(node_major)" -lt "$REQUIRED_NODE_MAJOR" ]] || ! has_cmd npm; then
    log_error "Node.js >= $REQUIRED_NODE_MAJOR and npm are required but not correctly installed."
    exit 1
  fi

  if ! has_cmd rustc || ! has_cmd cargo; then
    log_error "Rust/Cargo installation failed or not available in PATH."
    exit 1
  fi
}

ensure_js_dependencies() {
  cd "$PROJECT_ROOT"

  if [[ -d node_modules ]]; then
    if npm ls --depth=0 >/dev/null 2>&1; then
      return
    fi

    log_warn "Detected inconsistent node_modules. Rebuilding dependencies."
    rm -rf node_modules
  fi

  npm cache verify >/dev/null 2>&1 || npm cache clean --force >/dev/null 2>&1 || true

  if [[ -f package-lock.json ]]; then
    log_info "Installing JavaScript dependencies (npm ci)..."
    if ! npm ci --no-audit --fund=false; then
      log_warn "npm ci failed. Retrying after cleanup..."
      rm -rf node_modules
      npm cache clean --force >/dev/null 2>&1 || true
      npm ci --no-audit --fund=false
    fi
  else
    log_info "Installing JavaScript dependencies (npm install)..."
    npm install --no-audit --fund=false
  fi
}

ensure_tauri_cli() {
  cd "$PROJECT_ROOT"
  if [[ -x "node_modules/.bin/tauri" ]]; then
    return
  fi

  log_info "Ensuring @tauri-apps/cli is installed locally..."
  npm install --save-dev @tauri-apps/cli
}

main() {
  ensure_basics
  ensure_js_dependencies
  ensure_tauri_cli
}

main "$@"
