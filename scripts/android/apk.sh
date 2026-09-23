#!/usr/bin/env bash
#
# Android APK automation for Squirrel (Atome / eVe).
#
# Single owner of:
#   - the Android toolchain bootstrap (JDK, SDK, NDK, Rust targets, Tauri CLI)
#   - every `tauri android` invocation for this repository
#   - the APK/AAB verification report
#
# Contract: ./run.sh apk [--test|--dev|--prod] [options]
# All output is English (module 02, LANGUAGE AND STACK POLICY).
# No silent fallback: a missing dependency is either installed explicitly or
# reported with a named error. Nothing is substituted behind the caller's back.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
readonly PROJECT_ROOT="$(cd -P "$SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd)"
readonly TAURI_DIR="$PROJECT_ROOT/platforms/desktop-tauri"
readonly TAURI_CLI="$PROJECT_ROOT/node_modules/.bin/tauri"
readonly ANDROID_SCRIPT_DIR="$PROJECT_ROOT/scripts/android"
readonly ANDROID_CONF="$TAURI_DIR/tauri.android.conf.json"
readonly GEN_ANDROID_DIR="$TAURI_DIR/gen/android"
# Android has no real file system for bundled resources: `resource_dir()` returns
# the URI "asset://localhost/" on that target. Everything the Axum server needs at
# runtime therefore has to travel through `build.frontendDist`, which Tauri embeds
# into the shared library and exposes through `asset_resolver()`. This directory is
# the explicit staging root that reproduces the desktop resource layout.
readonly ANDROID_WEBROOT="$TAURI_DIR/gen/android-webroot"
# Scratch space. `temp/` is git-ignored and is the only directory this
# repository allows temporary files in.
readonly TEMP_DIR="$PROJECT_ROOT/temp"
# The Tauri CLI reports the artifacts it assembled; that report is kept so
# discovery can read it instead of guessing AGP's output tree.
readonly BUILD_LOG="$TEMP_DIR/apk-build.log"
# Touched just before the build so mtime alone can separate this run's outputs
# from a flavor left behind by an earlier one.
readonly BUILD_MARKER="$TEMP_DIR/apk-build-marker"
readonly KEYSTORE_DIR="${HOME}/.atome/android"
readonly KEYSTORE_FILE="$KEYSTORE_DIR/squirrel-release.jks"
readonly KEYSTORE_PROPERTIES="$KEYSTORE_DIR/keystore.properties"

# Toolchain floor. Versions are pinned so the build is reproducible; anything
# already installed at or above the floor is reused as-is.
readonly MIN_JDK_MAJOR=17
readonly REQUIRED_PLATFORM="android-36"
readonly REQUIRED_BUILD_TOOLS="36.0.0"
readonly MIN_BUILD_TOOLS_MAJOR=35
readonly MIN_NDK_MAJOR=27

# ---------------------------------------------------------------- diagnostics

APK_STEP="startup"

log()  { printf '[apk] %s\n' "$*"; }
step() { APK_STEP="$*"; printf '\n[apk] == %s ==\n' "$*"; }
ok()   { printf '[apk] OK %s\n' "$*"; }
skip() { printf '[apk] SKIPPED %s\n' "$*"; }
miss() { printf '[apk] MISSING %s\n' "$*"; }
warn() { printf '[apk] WARNING %s\n' "$*" >&2; }

fail() {
  printf '[apk] ERROR %s\n' "$*" >&2
  exit 1
}

on_error() {
  local status=$?
  # Failures probed inside command substitutions are expected control flow
  # (candidate discovery, version parsing); only the top-level shell reports.
  if [[ "${BASH_SUBSHELL:-0}" -gt 0 ]]; then
    exit "$status"
  fi
  printf '\n[apk] ERROR step "%s" failed with status %s\n' "$APK_STEP" "$status" >&2
  printf '[apk] Re-run with --doctor for a toolchain report, or --dry-run to print the plan.\n' >&2
  exit "$status"
}
trap on_error ERR

# ------------------------------------------------------------------- options

MODE="test"
ABI="aarch64"
EMIT="apk"
SPLIT_PER_ABI=0
DO_INSTALL=0
DO_DOCTOR=0
DO_DRY_RUN=0
FORCE_DEPS=0
ASSUME_YES=0
ALLOW_INSTALL=1
TARGET_DEVICE=""
ISOLATED_HOME=""
# Artifacts collected and verified by the last build, in report order.
DISCOVERED_ARTIFACTS=()

usage() {
  cat <<'USAGE'
Usage: ./run.sh apk [MODE] [OPTIONS]

Modes:
  --test                Debug APK for on-device testing (default).
                        Application id suffix ".debug", debuggable, no minification.
  --dev                 Install and run the app on the connected device with hot
                        reload from this machine (`tauri android dev`).
                        Does not produce an APK file.
  --prod                Release APK, minified and signed with the local release keystore.
  --aab                 Emit an Android App Bundle instead of an APK (Play Store).

Options:
      --abi <abi>       aarch64 (default) | armv7 | i686 | x86_64 | all
      --split-per-abi   Emit one artifact per ABI
      --install         Install the produced artifact with "adb install -r"
      --device <id>     Target a specific device/emulator (adb serial, or --dev runner)
      --doctor          Report the Android toolchain and stop; builds nothing
      --force-deps      Re-verify and update the toolchain before building
      --no-install-deps Never install or update a missing dependency; fail instead
      --dry-run         Print the exact plan (paths, variables, commands) and exit
      --isolated-home <dir>
                        Keep every toolchain cache (cargo, Gradle, Android user
                        home) under <dir> instead of $HOME. Use it for hermetic
                        builds and environments where $HOME is not writable.
  -y, --yes             Non-interactive mode (CI)
  -h, --help            Show this help

Examples:
  ./run.sh apk                       # debug APK for arm64 devices
  ./run.sh apk --install             # debug APK, then install it
  ./run.sh apk --prod                # signed release APK
  ./run.sh apk --prod --aab          # signed release AAB for the Play Store
  ./run.sh apk --dev --device R58M   # hot-reload session on a specific device
  ./run.sh apk --doctor              # toolchain report only
  ./run.sh apk --isolated-home temp/android-home   # caches kept in the project
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --test)           MODE="test"; shift ;;
      --dev)            MODE="dev"; shift ;;
      --prod)           MODE="prod"; shift ;;
      --release)        MODE="prod"; shift ;;
      --aab)            EMIT="aab"; shift ;;
      --apk)            EMIT="apk"; shift ;;
      --abi)
        [[ $# -ge 2 ]] || fail "--abi requires a value"
        ABI="$2"; shift 2 ;;
      --abi=*)          ABI="${1#*=}"; shift ;;
      --split-per-abi)  SPLIT_PER_ABI=1; shift ;;
      --install)        DO_INSTALL=1; shift ;;
      --device)
        [[ $# -ge 2 ]] || fail "--device requires a value"
        TARGET_DEVICE="$2"; shift 2 ;;
      --doctor)         DO_DOCTOR=1; shift ;;
      --dry-run)        DO_DRY_RUN=1; shift ;;
      --force-deps)     FORCE_DEPS=1; shift ;;
      --no-install-deps) ALLOW_INSTALL=0; shift ;;
      --isolated-home)
        [[ $# -ge 2 ]] || fail "--isolated-home requires a value"
        ISOLATED_HOME="$2"; shift 2 ;;
      --isolated-home=*) ISOLATED_HOME="${1#*=}"; shift ;;
      -y|--yes)         ASSUME_YES=1; shift ;;
      -h|--help)        usage; exit 0 ;;
      -*)               fail "Unknown option: $1 (see ./run.sh apk --help)" ;;
      *)                fail "Unexpected argument: $1 (see ./run.sh apk --help)" ;;
    esac
  done

  case "$ABI" in
    aarch64|arm64|arm64-v8a)  ABI="aarch64" ;;
    armv7|arm)                ABI="armv7" ;;
    i686|x86)                 ABI="i686" ;;
    x86_64|x64)               ABI="x86_64" ;;
    all)                      ;;
    *) fail "Unsupported --abi value: $ABI" ;;
  esac

  if [[ "$MODE" == "dev" && "$EMIT" == "aab" ]]; then
    fail "--dev runs the app on a device; it cannot emit an AAB"
  fi
}

# Tauri CLI target triple per Rust ABI name.
rust_target_for_abi() {
  case "$1" in
    aarch64) echo "aarch64-linux-android" ;;
    armv7)   echo "armv7-linux-androideabi" ;;
    i686)    echo "i686-linux-android" ;;
    x86_64)  echo "x86_64-linux-android" ;;
    *) fail "Unknown ABI: $1" ;;
  esac
}

selected_abis() {
  if [[ "$ABI" == "all" ]]; then
    printf '%s\n' aarch64 armv7 i686 x86_64
  else
    printf '%s\n' "$ABI"
  fi
}

# --------------------------------------------------------------- command hook

# Every external mutation goes through here so --dry-run stays exact.
run_cmd() {
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> %s\n' "$*"
    return 0
  fi
  "$@"
}

# ------------------------------------------------------------ JDK discovery

jdk_major_version() {
  local java_home="$1" raw
  [[ -x "$java_home/bin/javac" ]] || return 1
  raw="$("$java_home/bin/javac" -version 2>&1 | head -1 | sed -E 's/.* ([0-9]+)(\.[0-9]+)*.*/\1/')"
  [[ "$raw" =~ ^[0-9]+$ ]] || return 1
  echo "$raw"
}

jdk_candidates() {
  local candidate
  for candidate in \
    "${JAVA_HOME:-}" \
    "/opt/homebrew/opt/openjdk@21" \
    "/opt/homebrew/opt/openjdk" \
    "/usr/local/opt/openjdk@21" \
    "/usr/local/opt/openjdk"
  do
    if [[ -n "$candidate" ]]; then echo "$candidate"; fi
  done
  if [[ -x /usr/libexec/java_home ]]; then
    for version in 21 17; do
      candidate="$(/usr/libexec/java_home -v "$version" 2>/dev/null || true)"
      if [[ -n "$candidate" ]]; then echo "$candidate"; fi
    done
  fi
  local vm
  for vm in /Library/Java/JavaVirtualMachines/*/Contents/Home; do
    if [[ -d "$vm" ]]; then echo "$vm"; fi
  done
}

JAVA_HOME_RESOLVED=""

resolve_jdk() {
  step "Java Development Kit"
  local candidate major
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    major="$(jdk_major_version "$candidate" || true)"
    [[ -n "${major:-}" ]] || continue
    if [[ "$major" -ge "$MIN_JDK_MAJOR" ]]; then
      JAVA_HOME_RESOLVED="$candidate"
      ok "JDK $major at $candidate"
      return 0
    fi
    warn "JDK $major at $candidate is below the required JDK $MIN_JDK_MAJOR"
  done < <(jdk_candidates | awk '!seen[$0]++')

  if [[ "$ALLOW_INSTALL" -eq 0 ]]; then
    fail "No JDK >= $MIN_JDK_MAJOR found and --no-install-deps was given. Install one with: brew install openjdk@21"
  fi
  miss "JDK >= $MIN_JDK_MAJOR not found"
  if ! command -v brew >/dev/null 2>&1; then
    fail "Homebrew is not available; install a JDK >= $MIN_JDK_MAJOR manually and re-run"
  fi
  log "Installing openjdk@21 with Homebrew"
  run_cmd brew install openjdk@21
  local installed="/opt/homebrew/opt/openjdk@21"
  [[ -x "$installed/bin/javac" ]] || installed="/usr/local/opt/openjdk@21"
  major="$(jdk_major_version "$installed" || true)"
  [[ -n "${major:-}" ]] || fail "Homebrew finished but no usable JDK was found at $installed"
  JAVA_HOME_RESOLVED="$installed"
  ok "JDK $major at $installed"
}

export_jdk_env() {
  export JAVA_HOME="$JAVA_HOME_RESOLVED"
  export PATH="$JAVA_HOME/bin:$PATH"
}

# ------------------------------------------------------------ SDK discovery

android_sdk_candidates() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "/opt/homebrew/share/android-commandlinetools" \
    "/usr/local/share/android-commandlinetools" \
    "$HOME/Library/Android/sdk"
  do
    if [[ -n "$candidate" ]]; then echo "$candidate"; fi
  done
}

sdk_manager_path() {
  local root="$1"
  if [[ -x "$root/cmdline-tools/latest/bin/sdkmanager" ]]; then
    echo "$root/cmdline-tools/latest/bin/sdkmanager"
  elif [[ -x "$root/tools/bin/sdkmanager" ]]; then
    echo "$root/tools/bin/sdkmanager"
  fi
}

ANDROID_SDK_RESOLVED=""
SDKMANAGER=""

resolve_android_sdk() {
  step "Android SDK"
  local candidate manager
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    manager="$(sdk_manager_path "$candidate" || true)"
    if [[ -n "$manager" ]]; then
      ANDROID_SDK_RESOLVED="$candidate"
      SDKMANAGER="$manager"
      ok "Android SDK at $candidate"
      return 0
    fi
  done < <(android_sdk_candidates | awk '!seen[$0]++')

  if [[ "$ALLOW_INSTALL" -eq 0 ]]; then
    fail "No Android SDK with cmdline-tools found and --no-install-deps was given"
  fi
  miss "Android SDK command line tools not found"
  if ! command -v brew >/dev/null 2>&1; then
    fail "Homebrew is not available; install the Android command line tools manually and re-run"
  fi
  log "Installing android-commandlinetools with Homebrew"
  run_cmd brew install android-commandlinetools
  for candidate in /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools; do
    manager="$(sdk_manager_path "$candidate" || true)"
    if [[ -n "$manager" ]]; then
      ANDROID_SDK_RESOLVED="$candidate"
      SDKMANAGER="$manager"
      ok "Android SDK at $candidate"
      return 0
    fi
  done
  fail "Homebrew finished but no Android SDK command line tools were found"
}

export_sdk_env() {
  export ANDROID_HOME="$ANDROID_SDK_RESOLVED"
  export ANDROID_SDK_ROOT="$ANDROID_SDK_RESOLVED"
  local extra=""
  if [[ -d "$ANDROID_SDK_RESOLVED/platform-tools" ]]; then
    extra="$extra:$ANDROID_SDK_RESOLVED/platform-tools"
  fi
  if [[ -d "$ANDROID_SDK_RESOLVED/cmdline-tools/latest/bin" ]]; then
    extra="$extra:$ANDROID_SDK_RESOLVED/cmdline-tools/latest/bin"
  fi
  if [[ -n "$extra" ]]; then export PATH="$PATH${extra}"; fi
  return 0
}

sdk_package_installed() {
  local package="$1" installed
  installed="$("$SDKMANAGER" --list_installed 2>/dev/null || true)"
  grep -qE "^[[:space:]]*${package//\//\\/}([[:space:]]|$)" <<<"$installed"
}

highest_installed_build_tools() {
  local dir="$ANDROID_SDK_RESOLVED/build-tools"
  [[ -d "$dir" ]] || return 0
  ls -1 "$dir" 2>/dev/null | sort -V | tail -1
}

highest_installed_platform() {
  local dir="$ANDROID_SDK_RESOLVED/platforms"
  [[ -d "$dir" ]] || return 0
  ls -1 "$dir" 2>/dev/null | sort -V | tail -1
}

ensure_sdk_packages() {
  step "Android SDK packages"
  local build_tools platform

  if sdk_package_installed "platform-tools"; then
    ok "platform-tools installed"
  else
    miss "platform-tools"
    [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "platform-tools missing and --no-install-deps was given"
    run_cmd "$SDKMANAGER" --install platform-tools
    ok "platform-tools installed"
  fi

  platform="$(highest_installed_platform)"
  if [[ "$platform" == "$REQUIRED_PLATFORM" ]]; then
    skip "platform $REQUIRED_PLATFORM already installed"
  else
    miss "platform $REQUIRED_PLATFORM (found: ${platform:-none})"
    [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "platform $REQUIRED_PLATFORM missing and --no-install-deps was given"
    run_cmd "$SDKMANAGER" --install "platforms;$REQUIRED_PLATFORM"
    ok "platform $REQUIRED_PLATFORM installed"
  fi

  build_tools="$(highest_installed_build_tools)"
  local build_tools_major="${build_tools%%.*}"
  if [[ -n "$build_tools" && "${build_tools_major:-0}" -ge "$MIN_BUILD_TOOLS_MAJOR" ]]; then
    skip "build-tools $build_tools already >= $MIN_BUILD_TOOLS_MAJOR"
  else
    miss "build-tools $REQUIRED_BUILD_TOOLS"
    [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "build-tools missing and --no-install-deps was given"
    run_cmd "$SDKMANAGER" --install "build-tools;$REQUIRED_BUILD_TOOLS"
    ok "build-tools $REQUIRED_BUILD_TOOLS installed"
  fi

  if [[ "${SQUIRREL_APK_SKIP_LICENSES:-0}" != "1" ]]; then
    if [[ "$DO_DRY_RUN" -eq 1 ]]; then
      printf '[apk] dry-run> yes | %s --licenses\n' "$SDKMANAGER"
    else
      { yes || true; } | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
    fi
  fi
}

# ------------------------------------------------------------ NDK discovery

ANDROID_NDK_RESOLVED=""

ndk_major_version() {
  local dir="$1" name major
  name="$(basename "$dir")"
  major="${name%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] || return 1
  echo "$major"
}

ndk_has_toolchain() {
  local dir="$1"
  [[ -n "$(ls -d "$dir/toolchains/llvm/prebuilt"/* 2>/dev/null | head -1)" ]]
}

resolve_ndk() {
  step "Android NDK"
  local candidate major best="" best_major=0

  for candidate in "${NDK_HOME:-}" "${ANDROID_NDK_HOME:-}" "${ANDROID_NDK_ROOT:-}"; do
    [[ -n "$candidate" ]] || continue
    if ndk_has_toolchain "$candidate" && [[ -n "$(ndk_major_version "$candidate" || true)" ]]; then
      ANDROID_NDK_RESOLVED="$candidate"
      ok "NDK $(basename "$candidate") at $candidate"
      return 0
    fi
    warn "NDK candidate is unusable (no LLVM toolchain): $candidate"
  done

  if [[ -d "$ANDROID_SDK_RESOLVED/ndk" ]]; then
    for candidate in "$ANDROID_SDK_RESOLVED/ndk"/*; do
      [[ -d "$candidate" ]] || continue
      ndk_has_toolchain "$candidate" || continue
      major="$(ndk_major_version "$candidate" || true)"
      [[ -n "${major:-}" ]] || continue
      if [[ "$major" -gt "$best_major" ]]; then
        best="$candidate"
        best_major="$major"
      fi
    done
  fi

  if [[ -n "$best" && "$best_major" -ge "$MIN_NDK_MAJOR" ]]; then
    ANDROID_NDK_RESOLVED="$best"
    ok "NDK $(basename "$best") at $best"
    return 0
  fi

  if [[ -n "$best" ]]; then
    warn "Installed NDK $(basename "$best") is below the required NDK $MIN_NDK_MAJOR"
  fi
  miss "NDK >= $MIN_NDK_MAJOR"
  [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "NDK missing and --no-install-deps was given"

  local version
  version="$("$SDKMANAGER" --list 2>/dev/null | sed -n 's/^[[:space:]]*ndk;\([0-9][0-9.]*\).*/\1/p' | sort -V | tail -1)"
  [[ -n "$version" ]] || fail "Cannot resolve an NDK version from sdkmanager; check the network connection"
  run_cmd "$SDKMANAGER" --install "ndk;$version"
  ANDROID_NDK_RESOLVED="$ANDROID_SDK_RESOLVED/ndk/$version"
  [[ -d "$ANDROID_NDK_RESOLVED" ]] || fail "sdkmanager reported success but $ANDROID_NDK_RESOLVED is missing"
  ok "NDK $version installed"
}

export_ndk_env() {
  export NDK_HOME="$ANDROID_NDK_RESOLVED"
  export ANDROID_NDK_HOME="$ANDROID_NDK_RESOLVED"
  # The NDK LLVM prebuilt bin directory hosts the per-API-level clang wrappers
  # (aarch64-linux-android26-clang, ...) that cc-rs looks up for target builds.
  local prebuilt
  prebuilt="$(ls -d "$ANDROID_NDK_RESOLVED/toolchains/llvm/prebuilt"/* 2>/dev/null | head -1)"
  if [[ -n "$prebuilt" && -d "$prebuilt/bin" ]]; then
    export PATH="$prebuilt/bin:$PATH"
  else
    fail "NDK LLVM toolchain not found under $ANDROID_NDK_RESOLVED/toolchains/llvm/prebuilt"
  fi
}

# --------------------------------------------------------- toolchain caches

# cargo, Gradle and the Android SDK tools all write to $HOME by default. Hermetic
# CI runs and restricted environments (no write access to $HOME) need those caches
# relocated; --isolated-home does it explicitly, never behind the caller's back.
export_caches_env() {
  [[ -n "$ISOLATED_HOME" ]] || return 0

  step "Toolchain caches"
  local root="$ISOLATED_HOME"
  [[ "$root" = /* ]] || root="$PROJECT_ROOT/$root"

  local cargo_home="$root/cargo"
  local gradle_home="$root/gradle"
  local android_home="$root/android"

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> mkdir -p %s %s %s\n' "$cargo_home" "$gradle_home" "$android_home"
    printf '[apk] dry-run> export CARGO_HOME=%s GRADLE_USER_HOME=%s ANDROID_USER_HOME=%s\n' \
      "$cargo_home" "$gradle_home" "$android_home"
  else
    run_cmd mkdir -p "$cargo_home" "$gradle_home" "$android_home"
    [[ -d "$cargo_home" ]] || fail "Cannot create the isolated home: $root"
    root="$(cd -P "$root" && pwd)"
    cargo_home="$root/cargo"
    gradle_home="$root/gradle"
    android_home="$root/android"

    # The debug keystore carries the local debug signature. Mirroring it keeps
    # "adb install -r" upgrades valid when the home directory is relocated.
    local keystore="$HOME/.android/debug.keystore"
    if [[ -f "$keystore" && ! -f "$android_home/debug.keystore" ]]; then
      run_cmd cp "$keystore" "$android_home/debug.keystore"
      ok "debug keystore mirrored from $keystore"
    fi
  fi

  export CARGO_HOME="$cargo_home"
  export GRADLE_USER_HOME="$gradle_home"
  export ANDROID_USER_HOME="$android_home"
  # AGP releases before 8.x still read ANDROID_PREFS_ROOT for the same directory.
  export ANDROID_PREFS_ROOT="$android_home"
  ok "caches under $root (cargo, Gradle, Android user home)"
}

# --------------------------------------------------------- Rust target setup

ensure_rust_targets() {
  step "Rust Android targets"
  command -v rustup >/dev/null 2>&1 || fail "rustup is not on PATH; install Rust with rustup first"
  local installed abi triple
  installed="$(rustup target list --installed)"
  while IFS= read -r abi; do
    triple="$(rust_target_for_abi "$abi")"
    if grep -qx "$triple" <<<"$installed"; then
      skip "rust target $triple already installed"
    else
      miss "rust target $triple"
      [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "rust target $triple missing and --no-install-deps was given"
      run_cmd rustup target add "$triple"
      ok "rust target $triple installed"
    fi
  done < <(selected_abis)
}

# ------------------------------------------------------- Android web root

# One "source|destination-relative-to-web-root" pair per staged tree.
android_webroot_sources() {
  printf '%s\n' \
    "$PROJECT_ROOT/atome/src|." \
    "$PROJECT_ROOT/eVe|eVe" \
    "$PROJECT_ROOT/node_modules/rubberband-wasm/dist|vendor-rubberband-wasm/dist"
}

ensure_android_webroot() {
  step "Android web root"
  command -v rsync >/dev/null 2>&1 || fail "rsync is required to stage the Android web root"

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    local source destination
    while IFS='|' read -r source destination; do
      printf '[apk] dry-run> rsync -a --delete %s/ %s/%s/\n' "$source" "$ANDROID_WEBROOT" "$destination"
    done < <(android_webroot_sources)
    printf '[apk] dry-run> cp %s/atome/version.txt %s/version.txt\n' "$PROJECT_ROOT" "$ANDROID_WEBROOT"
    return 0
  fi

  run_cmd mkdir -p "$ANDROID_WEBROOT"

  # The frontend tree is staged at the web root itself, so its --delete pass must
  # be told to leave the sibling trees staged by the other pairs alone.
  local -a sibling_excludes=()
  local other_destination
  while IFS='|' read -r _ other_destination; do
    if [[ "$other_destination" != "." ]]; then
      sibling_excludes+=(--exclude "/${other_destination%%/*}/")
    fi
  done < <(android_webroot_sources)

  local source destination
  while IFS='|' read -r source destination; do
    [[ -d "$source" ]] || fail "Missing web root source directory: $source"
    run_cmd mkdir -p "$ANDROID_WEBROOT/$destination"
    run_cmd rsync -a --delete --exclude '.DS_Store' "${sibling_excludes[@]}" \
      "$source/" "$ANDROID_WEBROOT/$destination/"
    ok "staged $source -> $(basename "$ANDROID_WEBROOT")/$destination"
  done < <(android_webroot_sources)

  local version_file="$PROJECT_ROOT/atome/version.txt"
  [[ -f "$version_file" ]] || fail "Missing $version_file"
  run_cmd cp "$version_file" "$ANDROID_WEBROOT/version.txt"

  [[ -f "$ANDROID_WEBROOT/index.html" ]] \
    || fail "Staged web root has no index.html; atome/src is not a valid frontendDist"
  ok "web root ready at $ANDROID_WEBROOT"
}

# ------------------------------------------------------------ project inputs

ensure_tauri_cli() {
  step "Tauri CLI"
  if [[ -x "$TAURI_CLI" ]]; then
    ok "tauri CLI at $TAURI_CLI ($("$TAURI_CLI" --version 2>/dev/null || echo unknown))"
  else
    miss "node_modules/.bin/tauri"
    [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "Tauri CLI missing and --no-install-deps was given"
    [[ -d "$PROJECT_ROOT/node_modules" ]] || fail "node_modules is missing; run ./run.sh once to bootstrap dependencies"
    run_cmd npm --prefix "$PROJECT_ROOT" install
    [[ -x "$TAURI_CLI" ]] || fail "npm install finished but $TAURI_CLI is still missing"
    ok "tauri CLI installed"
  fi
}

require_android_conf() {
  step "Android configuration"
  [[ -f "$ANDROID_CONF" ]] || fail "Missing Android configuration file: $ANDROID_CONF"
  ok "configuration $ANDROID_CONF"
}

ensure_android_project() {
  step "Generated Android project"
  if [[ -d "$GEN_ANDROID_DIR" ]]; then
    skip "gen/android already present"
    return 0
  fi
  miss "gen/android"
  log "Generating the Gradle project with 'tauri android init --ci'"
  run_cmd bash -c "cd '$TAURI_DIR' && '$TAURI_CLI' android init --ci"
  [[ "$DO_DRY_RUN" -eq 1 || -d "$GEN_ANDROID_DIR" ]] || fail "tauri android init finished but $GEN_ANDROID_DIR is missing"
  ok "gen/android generated"
}

ensure_release_keystore() {
  step "Release keystore"
  [[ "$MODE" == "prod" ]] || { skip "release keystore is only needed for --prod"; return 0; }

  if [[ -f "$KEYSTORE_FILE" && -f "$KEYSTORE_PROPERTIES" ]]; then
    skip "release keystore already present at $KEYSTORE_FILE"
    return 0
  fi

  [[ "$ALLOW_INSTALL" -eq 1 ]] || fail "Release keystore missing and --no-install-deps was given"

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> generate release keystore at %s and write %s\n' "$KEYSTORE_FILE" "$KEYSTORE_PROPERTIES"
    return 0
  fi

  miss "release keystore"
  if [[ -f "$KEYSTORE_PROPERTIES" ]]; then
    log "Reusing the existing keystore credentials in $KEYSTORE_PROPERTIES"
    return 0
  fi

  run_cmd mkdir -p "$KEYSTORE_DIR"
  local password
  if [[ -n "${SQUIRREL_ANDROID_KEYSTORE_PASSWORD:-}" ]]; then
    password="$SQUIRREL_ANDROID_KEYSTORE_PASSWORD"
    log "Using the password from SQUIRREL_ANDROID_KEYSTORE_PASSWORD"
  else
    password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
    log "Generated a new random keystore password (stored outside the repository)"
  fi

  run_cmd keytool -genkeypair \
    -keystore "$KEYSTORE_FILE" \
    -alias squirrel \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$password" -keypass "$password" \
    -dname "CN=Squirrel, OU=Atome, O=Squirrel, L=Paris, C=FR"

  umask 077
  cat >"$KEYSTORE_PROPERTIES" <<EOF
storeFile=$KEYSTORE_FILE
storePassword=$password
keyAlias=squirrel
keyPassword=$password
EOF
  chmod 600 "$KEYSTORE_FILE" "$KEYSTORE_PROPERTIES"
  ok "release keystore created at $KEYSTORE_FILE (never committed)"
}

# Gradle reads signing credentials from gen/android/keystore.properties, which is
# git-ignored. The authoritative copy always stays outside the repository.
stage_signing_properties() {
  step "Gradle signing properties"
  if [[ "$MODE" != "prod" ]]; then
    skip "release signing is only wired for --prod"
    return 0
  fi
  [[ -f "$KEYSTORE_PROPERTIES" ]] || fail "Missing keystore credentials: $KEYSTORE_PROPERTIES"
  local staged="$GEN_ANDROID_DIR/keystore.properties"
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> cp %s %s\n' "$KEYSTORE_PROPERTIES" "$staged"
    return 0
  fi
  run_cmd cp "$KEYSTORE_PROPERTIES" "$staged"
  run_cmd chmod 600 "$staged"
  ok "signing credentials staged at $staged (git-ignored)"
}

# ---------------------------------------------------------------- verification

build_tools_dir() {
  local version
  version="$(highest_installed_build_tools)"
  if [[ -n "$version" && -x "$ANDROID_SDK_RESOLVED/build-tools/$version/aapt2" ]]; then
    echo "$ANDROID_SDK_RESOLVED/build-tools/$version"
  fi
}

artifact_dir() {
  echo "$GEN_ANDROID_DIR/app/build/outputs"
}

# AGP nests every artifact under its product flavor, so a debug APK lands in
# outputs/apk/<flavor>/debug/ and a release bundle in outputs/bundle/<flavor>Release/.
# The flavor is Gradle's business (this project generates universal, arm64, arm,
# x86 and x86_64); the build type is the only part of that path this script owns.
build_type_dir_name() {
  if [[ "$MODE" == "test" ]]; then echo "debug"; else echo "release"; fi
}

artifact_extension() {
  if [[ "$EMIT" == "aab" ]]; then echo "aab"; else echo "apk"; fi
}

# AGP re-packages into an existing output file without truncating it. The bytes
# of the payload it wrote on a previous run therefore stay in the archive behind
# the new entry offsets, which doubled a debug APK (994 683 526 bytes against
# 504 916 716 bytes once the stale file was gone). Dropping this configuration's
# previous artifact keeps every packaged APK at its real size.
remove_stale_artifacts() {
  local build_type suffix root stale
  build_type="$(build_type_dir_name)"
  suffix="$(artifact_extension)"
  root="$(artifact_dir)"
  [[ -d "$root" ]] || return 0
  while IFS= read -r stale; do
    [[ -n "$stale" ]] || continue
    log "removing the previous $(basename "$stale") so Gradle packages from scratch"
    run_cmd rm -f "$stale"
  done < <(find "$root" -type f -name "*.${suffix}" -path "*${build_type}*" | sort)
}

verify_artifact() {
  local artifact="$1"
  local build_tools aapt2 apksigner
  step "Verifying $(basename "$artifact")"

  [[ -f "$artifact" ]] || fail "Expected artifact is missing: $artifact"
  ok "artifact $artifact ($(du -h "$artifact" | cut -f1))"

  build_tools="$(build_tools_dir)"
  [[ -n "$build_tools" ]] || fail "No build-tools with aapt2 found under $ANDROID_SDK_RESOLVED/build-tools"

  if [[ "$artifact" == *.apk ]]; then
    aapt2="$build_tools/aapt2"
    log "--- aapt2 dump badging ---"
    "$aapt2" dump badging "$artifact" \
      | grep -E "^(package|sdkVersion|targetSdkVersion|uses-permission|application-label|native-code|launchable-activity)" \
      | sed 's/^/[apk] /'
    log "--- apksigner verify ---"
    apksigner="$build_tools/apksigner"
    [[ -x "$apksigner" ]] || fail "apksigner is missing in $build_tools"
    if "$apksigner" verify --print-certs "$artifact" | sed 's/^/[apk] /'; then
      ok "signature valid"
    else
      fail "APK signature verification failed for $artifact"
    fi
  else
    log "--- jar contents (AAB) ---"
    unzip -l "$artifact" | head -20 | sed 's/^/[apk] /'
  fi

  if command -v shasum >/dev/null 2>&1; then
    log "sha256 $(shasum -a 256 "$artifact" | cut -d' ' -f1)"
  fi
}

# The Tauri CLI reports every artifact it just assembled:
#
#     Finished 1 APK at:
#         /abs/path/to/app-universal-debug.apk
#
# That report is the authoritative discovery source. AGP nests the artifact
# under its product flavor (`outputs/apk/<flavor>/debug/`) and the flavor is
# Gradle's business, not this script's; the report is also the only signal that
# survives a Gradle up-to-date run, where the file on disk is not rewritten.
cli_artifact_paths() {
  local log="$1" suffix="$2" line path
  local in_block=0
  # Strip ANSI codes defensively; the lane always builds with --ci.
  while IFS= read -r line; do
    line="${line//$'\r'/}"
    if [[ "$line" =~ Finished[[:space:]]+[0-9]+[[:space:]]+(APK|AAB)[[:space:]]+at: ]]; then
      in_block=1
      path="${line#*at:}"
    elif [[ "$in_block" -eq 1 ]]; then
      path="$line"
    else
      continue
    fi
    # A header line carries nothing after "at:"; a path line carries indentation.
    path="${path#"${path%%[![:space:]]*}"}"
    [[ -n "$path" ]] || continue
    if [[ "$path" == *".${suffix}" ]]; then
      printf '%s\n' "$path"
    else
      in_block=0
    fi
  done < <(sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$log")
}

# Everything written after this marker belongs to the run that just started.
ensure_build_marker() {
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> mkdir -p %s && touch %s\n' "$TEMP_DIR" "$BUILD_MARKER"
    return 0
  fi
  run_cmd mkdir -p "$TEMP_DIR"
  run_cmd touch "$BUILD_MARKER"
  [[ -f "$BUILD_MARKER" ]] || fail "Cannot create the build marker at $BUILD_MARKER"
}

collect_artifacts() {
  local build_type suffix root artifact candidate newest
  build_type="$(build_type_dir_name)"
  suffix="$(artifact_extension)"
  root="$(artifact_dir)"
  [[ -d "$root" ]] || fail "Gradle wrote no output directory at $root"

  local -a produced=()

  # 1. What the CLI reported for this run, restricted to files that exist.
  if [[ -f "$BUILD_LOG" ]]; then
    while IFS= read -r artifact; do
      [[ -n "$artifact" ]] || continue
      [[ -f "$artifact" ]] || continue
      produced+=("$artifact")
    done < <(cli_artifact_paths "$BUILD_LOG" "$suffix" | sort -u)
  fi

  # 2. Fallback: anything written after the marker. The build-type filter keeps
  # a release bundle or another flavor out of a debug report.
  if [[ "${#produced[@]}" -eq 0 ]]; then
    while IFS= read -r artifact; do
      [[ -n "$artifact" ]] || continue
      produced+=("$artifact")
    done < <(find "$root" -type f -name "*.${suffix}" -path "*${build_type}*" \
      -newer "$BUILD_MARKER" | sort)
  fi

  # 3. Last resort: Gradle found every task up-to-date and rewrote nothing, so
  # the newest artifact on disk is this configuration's output. Never silent.
  if [[ "${#produced[@]}" -eq 0 ]]; then
    newest=""
    while IFS= read -r candidate; do
      [[ -n "$candidate" ]] || continue
      if [[ -z "$newest" || "$candidate" -nt "$newest" ]]; then newest="$candidate"; fi
    done < <(find "$root" -type f -name "*.${suffix}" -path "*${build_type}*" | sort)
    if [[ -n "$newest" ]]; then
      warn "Gradle rewrote no *.${suffix} file; reusing the newest ${build_type} output on disk: $newest"
      produced+=("$newest")
    fi
  fi

  [[ "${#produced[@]}" -gt 0 ]] \
    || fail "No *.${suffix} artifact for the ${build_type} build type under $root (build log: $BUILD_LOG)"

  DISCOVERED_ARTIFACTS=("${produced[@]}")
  for artifact in "${produced[@]}"; do
    verify_artifact "$artifact"
  done
}

install_artifact() {
  [[ "$EMIT" == "apk" ]] \
    || fail "--install needs an APK; convert the AAB first (bundletool build-apks)"
  command -v adb >/dev/null 2>&1 || fail "adb is not on PATH; cannot --install"
  local devices
  devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  [[ -n "$devices" ]] || fail "No authorized Android device is connected; plug one in or start an emulator"

  local serial="${TARGET_DEVICE:-$(head -1 <<<"$devices")}"
  [[ "${#DISCOVERED_ARTIFACTS[@]}" -gt 0 ]] || fail "No verified artifact is available to install"

  # Install exactly the artifact this run verified, never a second search result.
  local artifact="${DISCOVERED_ARTIFACTS[0]}"
  step "Installing on $serial"
  run_cmd adb -s "$serial" install -r "$artifact"
  ok "installed $(basename "$artifact") on $serial"
}

# --------------------------------------------------------------- build phase

tauri_android_build() {
  local -a args=(android build --ci)
  if [[ "$MODE" == "test" ]]; then args+=(--debug); fi
  if [[ "$EMIT" == "aab" ]]; then args+=(--aab); else args+=(--apk); fi
  if [[ "$SPLIT_PER_ABI" -eq 1 ]]; then args+=(--split-per-abi); fi

  local -a targets=()
  local abi
  while IFS= read -r abi; do targets+=("$abi"); done < <(selected_abis)
  args+=(-t "${targets[@]}")

  step "Building Android artifacts"
  log "mode=$MODE abi=$ABI emit=$EMIT split=$SPLIT_PER_ABI"
  log "JAVA_HOME=$JAVA_HOME"
  log "ANDROID_HOME=$ANDROID_SDK_RESOLVED"
  log "NDK_HOME=$ANDROID_NDK_RESOLVED"
  log "build log=$BUILD_LOG"

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> (cd %s && %s %s)\n' "$TAURI_DIR" "$TAURI_CLI" "${args[*]}"
    return 0
  fi

  # Both streams keep streaming to the terminal and are captured for discovery:
  # the Tauri CLI reports the artifact it assembled on stderr while Gradle
  # diagnostics land on stdout. `pipefail` keeps a failing build failing here.
  ( cd "$TAURI_DIR" && "$TAURI_CLI" "${args[@]}" ) 2>&1 | tee "$BUILD_LOG"
}

tauri_android_dev() {
  local -a args=(android dev)
  if [[ -n "$TARGET_DEVICE" ]]; then args+=(--device "$TARGET_DEVICE"); fi

  step "Running on device with hot reload"
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> (cd %s && %s android dev %s)\n' "$TAURI_DIR" "$TAURI_CLI" "${args[*]:2}"
    return 0
  fi
  ( cd "$TAURI_DIR" && "$TAURI_CLI" "${args[@]}" )
}

# -------------------------------------------------------------------- doctor

doctor() {
  step "Toolchain report"
  printf '[apk] project root      : %s\n' "$PROJECT_ROOT"
  printf '[apk] tauri project     : %s\n' "$TAURI_DIR"
  printf '[apk] JAVA_HOME         : %s\n' "${JAVA_HOME_RESOLVED:-<none>}"
  printf '[apk] ANDROID_HOME      : %s\n' "${ANDROID_SDK_RESOLVED:-<none>}"
  printf '[apk] sdkmanager        : %s\n' "${SDKMANAGER:-<none>}"
  printf '[apk] NDK_HOME          : %s\n' "${ANDROID_NDK_RESOLVED:-<none>}"
  printf '[apk] platform          : %s\n' "$(highest_installed_platform || echo '<none>')"
  printf '[apk] build-tools       : %s\n' "$(highest_installed_build_tools || echo '<none>')"
  printf '[apk] tauri CLI         : %s\n' "$([[ -x "$TAURI_CLI" ]] && "$TAURI_CLI" --version || echo '<none>')"
  printf '[apk] gen/android       : %s\n' "$([[ -d "$GEN_ANDROID_DIR" ]] && echo present || echo absent)"
  printf '[apk] tauri.android.conf: %s\n' "$([[ -f "$ANDROID_CONF" ]] && echo present || echo absent)"
  printf '[apk] web root          : %s\n' "$([[ -f "$ANDROID_WEBROOT/index.html" ]] && echo staged || echo 'not staged')"
  printf '[apk] requested mode    : %s (abi=%s, emit=%s)\n' "$MODE" "$ABI" "$EMIT"
  printf '[apk] isolated home     : %s\n' "${ISOLATED_HOME:-<default: \$HOME>}"
  printf '[apk] free disk         : %s\n' "$(df -h /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}' || df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4}')"
}

# ---------------------------------------------------------------------- main

main() {
  parse_args "$@"

  log "Squirrel Android build"
  log "mode=$MODE abi=$ABI emit=$EMIT dry_run=$DO_DRY_RUN"

  export_caches_env

  resolve_jdk
  export_jdk_env
  resolve_android_sdk
  export_sdk_env
  ensure_sdk_packages
  resolve_ndk
  export_ndk_env
  ensure_rust_targets
  ensure_tauri_cli
  require_android_conf

  if [[ "$DO_DOCTOR" -eq 1 ]]; then
    ensure_android_project
    doctor
    return 0
  fi

  ensure_android_project
  ensure_android_webroot
  ensure_release_keystore
  stage_signing_properties

  if [[ "$MODE" == "dev" ]]; then
    tauri_android_dev
    return 0
  fi

  ensure_build_marker
  remove_stale_artifacts
  tauri_android_build
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then return 0; fi

  collect_artifacts
  if [[ "$DO_INSTALL" -eq 1 ]]; then install_artifact; fi

  step "Done"
  log "Artifacts are under $(artifact_dir)"
  return 0
}

main "$@"
