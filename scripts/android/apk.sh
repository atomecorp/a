#!/usr/bin/env bash
#
# Android APK automation for atome (Squirrel runtime / eVe).
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

# The Android emulator is an optional, project-local toolchain. Its packages and
# its AVD live under the git-ignored `temp/` tree, so nothing about it is
# versioned and the global SDK / AVD directories stay untouched. The AVD is not
# synchronized with the repository and can be deleted at any time: the next
# `--emulator` run downloads it again.
readonly EMULATOR_DEFAULT_SDK_ROOT="$TEMP_DIR/android-sdk"
readonly EMULATOR_DEFAULT_STATE_DIR="$TEMP_DIR/android-avd"
readonly EMULATOR_LOG_DIR="$TEMP_DIR/logcat"
readonly EMULATOR_DEFAULT_AVD="atome-api36"
readonly EMULATOR_DEFAULT_API="36"
readonly EMULATOR_BOOT_TIMEOUT=420
readonly EMULATOR_DEFAULT_LOGCAT_SECONDS=25
# The capture follows the application instead of trusting one fixed slice: the
# Android start spends ~17 s materializing the embedded assets before the app is
# on screen, so a crash that landed after the 25 s window was invisible in the
# reports. The ceiling bounds the wait when the app survives it.
readonly EMULATOR_DEFAULT_LOGCAT_MAX_SECONDS=120
readonly EMULATOR_DEFAULT_PORT=5554
# A debug APK carries a multi-hundred-megabyte unoptimized native library, so
# the AVD asks for a phone-sized RAM allocation instead of the 2 GB profile
# default. The emulator silently falls back to software GL when the host cannot
# back the request, and that fallback is what left the system launcher frozen on
# a busy machine: the guest size is therefore capped by what the host can spare
# (see emulator_resolve_memory).
readonly EMULATOR_DEFAULT_MEMORY=4096
readonly EMULATOR_MIN_MEMORY=2048
readonly EMULATOR_MEMORY_STEP=512
# Renderer modes accepted by `emulator -gpu` 37.x. `host` reaches Metal through
# ANGLE/MoltenVK; the AVD device profile ships with GPU emulation disabled, so
# the renderer is requested on the command line instead of being left to the
# profile. `swiftshader_indirect` is a legacy value this emulator rejects.
readonly EMULATOR_GPU_MODES="auto host lavapipe swiftshader swangle"
readonly EMULATOR_DEFAULT_GPU_MODE="host"
readonly EMULATOR_HEADLESS_GPU_MODE="swiftshader"
# Chromium reads its command line from this file when a WebView process starts,
# and only for a debuggable application — which is what this lane installs. It
# stays empty by default: the 20:07 run handed the WebView
# `--enable-unsafe-webgpu` and the WebGPU adapter was still absent ("No available
# adapters." 2 min 35 s after the launch, against 4 s in the run without it),
# while the guest itself froze before the capture ended. A default must not cost
# the measurement it is supposed to improve, so the attempt is now explicit.
readonly EMULATOR_WEBVIEW_FLAGS_FILE="/data/local/tmp/webview-command-line"
readonly EMULATOR_DEFAULT_WEBVIEW_FLAGS=""
# A guest that froze stops writing to logcat; anything it logged afterwards is
# not a verdict about the application. 30 s is well past the cadence of the
# background chatter this capture always carries.
readonly EMULATOR_LOG_STALL_SECONDS=30

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
DO_EMULATOR=0
EMULATOR_HEADLESS=0
EMULATOR_WIPE=0
EMULATOR_AVD_NAME="$EMULATOR_DEFAULT_AVD"
EMULATOR_API="$EMULATOR_DEFAULT_API"
EMULATOR_IMAGE=""
EMULATOR_SDK_ROOT=""
EMULATOR_STATE_DIR=""
EMULATOR_PORT="$EMULATOR_DEFAULT_PORT"
EMULATOR_LOGCAT_SECONDS="$EMULATOR_DEFAULT_LOGCAT_SECONDS"
EMULATOR_LOGCAT_MAX_SECONDS="$EMULATOR_DEFAULT_LOGCAT_MAX_SECONDS"
# Resolved from the host unless --emulator-memory overrides it.
EMULATOR_MEMORY=""
EMULATOR_GPU_MODE=""
# Empty selects the default flags above; "none" writes no flags file at all.
EMULATOR_WEBVIEW_FLAGS=""
EMULATOR_SERIAL=""
EMULATOR_LOG_FILE=""
EMULATOR_CRASH_FILE=""
EMULATOR_EXIT_FILE=""
EMULATOR_STAMP=""
EMULATOR_LOG_PID=""
AVDMANAGER=""
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
      --emulator        After the build, boot the local Android emulator, install
                        the APK, launch it, capture logcat and save a screenshot.
                        A frozen instance from an earlier run is terminated
                        (console, then SIGTERM/SIGKILL) before the reboot.
                        The emulator
                        packages and the AVD are downloaded into the git-ignored
                        temp/ tree (nothing is versioned, nothing global changes).
                        The AVD is sized for this machine: the renderer runs
                        on the host GPU (Metal through ANGLE/MoltenVK) and the
                        guest RAM is the largest of 2/2.5/3/3.5/4 GB the host can
                        back, because the emulator falls back to software GL -
                        and the system launcher freezes - when it is oversubscribed.
      --emulator-headless  Boot the emulator without a window (swiftshader GPU)
      --emulator-memory <mb>       Guest RAM in MB (default: resolved from the host)
      --emulator-gpu <mode>        auto | host | lavapipe | swiftshader | swangle
                                   (default: host, or swiftshader with --emulator-headless)
      --emulator-webview-flags <flags|none>
                                   Chromium command line written to the WebView
                                   before the launch. Nothing is written by
                                   default, because a flag that changes nothing
                                   and freezes the guest must stay a deliberate
                                   choice; "none" says the same thing out loud.
                                   This is where a WebGPU attempt belongs:
                                   --enable-unsafe-webgpu, or
                                   "--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader"
      --emulator-wipe   Recreate the AVD from scratch before booting it and stop
                        a running instance, so the recreated AVD is the one used
      --emulator-avd <name>        AVD name (default: atome-api36)
      --emulator-api <level>       Android API level (default: 36)
      --emulator-image <package>   System image package; defaults to
                                   system-images;android-<api>;google_apis;arm64-v8a
      --emulator-sdk-root <dir>    Where emulator packages are installed
      --emulator-state-dir <dir>   Where the AVD and the emulator state live
      --emulator-port <port>       Emulator console port (default: 5554)
      --logcat-seconds <n>         Minimum logcat capture length after launch
                                   (default: 25). The capture keeps following the
                                   application past that window and stops as soon
                                   as it disappears, so a late crash is recorded.
      --follow-seconds <n>         Ceiling of that follow-up capture, in seconds
                                   (default: 120); only reached while the app
                                   stays alive.
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
  ./run.sh apk --emulator            # build, then run and log on the local emulator
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
      --emulator)       DO_EMULATOR=1; shift ;;
      --emulator-headless) EMULATOR_HEADLESS=1; shift ;;
      --emulator-wipe)  EMULATOR_WIPE=1; shift ;;
      --emulator-avd)
        [[ $# -ge 2 ]] || fail "--emulator-avd requires a value"
        EMULATOR_AVD_NAME="$2"; shift 2 ;;
      --emulator-api)
        [[ $# -ge 2 ]] || fail "--emulator-api requires a value"
        EMULATOR_API="$2"; shift 2 ;;
      --emulator-image)
        [[ $# -ge 2 ]] || fail "--emulator-image requires a value"
        EMULATOR_IMAGE="$2"; shift 2 ;;
      --emulator-sdk-root)
        [[ $# -ge 2 ]] || fail "--emulator-sdk-root requires a value"
        EMULATOR_SDK_ROOT="$2"; shift 2 ;;
      --emulator-state-dir)
        [[ $# -ge 2 ]] || fail "--emulator-state-dir requires a value"
        EMULATOR_STATE_DIR="$2"; shift 2 ;;
      --emulator-port)
        [[ $# -ge 2 ]] || fail "--emulator-port requires a value"
        EMULATOR_PORT="$2"; shift 2 ;;
      --logcat-seconds)
        [[ $# -ge 2 ]] || fail "--logcat-seconds requires a value"
        EMULATOR_LOGCAT_SECONDS="$2"; shift 2 ;;
      --follow-seconds)
        [[ $# -ge 2 ]] || fail "--follow-seconds requires a value"
        EMULATOR_LOGCAT_MAX_SECONDS="$2"; shift 2 ;;
      --emulator-memory)
        [[ $# -ge 2 ]] || fail "--emulator-memory requires a value"
        EMULATOR_MEMORY="$2"; shift 2 ;;
      --emulator-gpu)
        [[ $# -ge 2 ]] || fail "--emulator-gpu requires a value"
        EMULATOR_GPU_MODE="$2"; shift 2 ;;
      --emulator-webview-flags)
        [[ $# -ge 2 ]] || fail "--emulator-webview-flags requires a value"
        EMULATOR_WEBVIEW_FLAGS="$2"; shift 2 ;;
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

  if [[ -n "$EMULATOR_MEMORY" ]] && [[ ! "$EMULATOR_MEMORY" =~ ^[0-9]+$ ]]; then
    fail "--emulator-memory expects a number of megabytes, got: $EMULATOR_MEMORY"
  fi

  if [[ -n "$EMULATOR_GPU_MODE" ]] && ! grep -qw -- "$EMULATOR_GPU_MODE" <<<"$EMULATOR_GPU_MODES"; then
    fail "Unsupported --emulator-gpu value: $EMULATOR_GPU_MODE (expected one of: $EMULATOR_GPU_MODES)"
  fi

  if [[ "$MODE" == "dev" && "$EMIT" == "aab" ]]; then
    fail "--dev runs the app on a device; it cannot emit an AAB"
  fi

  if [[ "$DO_EMULATOR" -eq 1 && "$MODE" == "dev" ]]; then
    fail "--emulator builds and installs an artifact; --dev already drives a device with hot reload"
  fi

  if [[ "$DO_EMULATOR" -eq 1 && "$EMIT" == "aab" ]]; then
    fail "--emulator installs an APK; convert the AAB first (bundletool build-apks)"
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
  # avdmanager ships next to sdkmanager in the same cmdline-tools release.
  AVDMANAGER="$(dirname "$SDKMANAGER")/avdmanager"
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
    verify_native_runtime "$artifact"
  else
    log "--- jar contents (AAB) ---"
    unzip -l "$artifact" | head -20 | sed 's/^/[apk] /'
  fi

  if command -v shasum >/dev/null 2>&1; then
    log "sha256 $(shasum -a 256 "$artifact" | cut -d' ' -f1)"
  fi
}

# The C++ dependencies of the runtime leave the C++ ABI symbols undefined, and
# Android's libc does not provide them: `libc++_shared.so` has to travel inside
# the APK next to the Rust library. The Tauri CLI copies it from the NDK because
# `libsquirrel_lib.so` declares it as a needed shared library, which is what the
# Android branch of platforms/desktop-tauri/build.rs arranges. Verifying the
# packaged APK keeps a regression from reaching a device, where the only symptom
# is `dlopen failed: cannot locate symbol "__cxa_pure_virtual"`.
verify_native_runtime() {
  local artifact="$1" abi lib
  local -a entries=() abis=()
  while IFS= read -r lib; do
    [[ "$lib" == lib/*/*.so ]] || continue
    entries+=("$lib")
    abi="${lib#lib/}"
    abi="${abi%%/*}"
    if ! printf '%s\n' "${abis[@]:-}" | grep -qx "$abi"; then abis+=("$abi"); fi
  done < <(unzip -Z1 "$artifact" 'lib/*' 2>/dev/null | sort)

  [[ "${#entries[@]}" -gt 0 ]] \
    || fail "No native library is packaged in $(basename "$artifact"); the APK cannot load the runtime"
  log "native libraries: ${entries[*]}"

  for abi in "${abis[@]}"; do
    printf '%s\n' "${entries[@]}" | grep -qx "lib/$abi/libsquirrel_lib.so" \
      || fail "lib/$abi is packaged without libsquirrel_lib.so in $(basename "$artifact")"
    if ! printf '%s\n' "${entries[@]}" | grep -qx "lib/$abi/libc++_shared.so"; then
      fail "$(basename "$artifact") packages lib/$abi/libsquirrel_lib.so without the C++ runtime (lib/$abi/libc++_shared.so); on a device this fails with: dlopen failed: cannot locate symbol \"__cxa_pure_virtual\". Check the Android branch of platforms/desktop-tauri/build.rs and rebuild"
    fi
    ok "C++ runtime packaged for $abi"
  done
}

# A library that pulled in the NDK's *static* libc (`libc.a`) dies on its first
# `getauxval` call: the private libc copy never receives the auxv the dynamic
# linker fills in, so it dereferences a null pointer. Measured here on
# 2026-09-23 as SIGSEGV at `getauxval+28` called from `init_have_lse_atomics`,
# two seconds after a launch that never showed a frame. The dynamic libc is the
# invariant - every Rust cdylib on Android declares `libc.so` - and what breaks
# it is the link search path (see the Android branch of
# platforms/desktop-tauri/build.rs), which is why this runs on the build output:
# a missing DT_NEEDED cannot be repaired at packaging time.
ndk_readelf_path() {
  local prebuilt
  prebuilt="$(ls -d "$ANDROID_NDK_RESOLVED/toolchains/llvm/prebuilt"/* 2>/dev/null | head -1)"
  [[ -n "$prebuilt" && -x "$prebuilt/bin/llvm-readelf" ]] || return 1
  printf '%s\n' "$prebuilt/bin/llvm-readelf"
}

verify_android_link() {
  step "Android native link"
  local readelf abi triple so needed
  readelf="$(ndk_readelf_path || true)"
  if [[ -z "$readelf" ]]; then
    warn "llvm-readelf is missing under $ANDROID_NDK_RESOLVED; the static-libc check is skipped"
    return 0
  fi

  while IFS= read -r abi; do
    triple="$(rust_target_for_abi "$abi")"
    so="$TAURI_DIR/target/$triple/$(build_type_dir_name)/libsquirrel_lib.so"
    if [[ "$DO_DRY_RUN" -eq 1 ]]; then
      printf '[apk] dry-run> %s -d %s (expect libc.so and libc++_shared.so)\n' "$readelf" "$so"
      continue
    fi
    [[ -f "$so" ]] || fail "the build did not produce $so"
    needed="$("$readelf" -d "$so" 2>/dev/null | sed -n 's/.*Shared library: \[\(.*\)\]/\1/p' || true)"
    grep -qx "libc.so" <<<"$needed" \
      || fail "$(basename "$so") does not link the dynamic libc (libc.so): the link search path is capturing the NDK's static libc.a, and the app dies with SIGSEGV in getauxval before its first frame. Check the Android branch of platforms/desktop-tauri/build.rs and rebuild"
    grep -qx "libc++_shared.so" <<<"$needed" \
      || fail "$(basename "$so") does not declare the C++ runtime (libc++_shared.so); the APK ships without it and the launch fails with dlopen failed: cannot locate symbol \"__cxa_pure_virtual\""
    ok "$abi declares libc.so and libc++_shared.so"
  done < <(selected_abis)
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

# ------------------------------------------------------------- emulator lane
#
# `--emulator` owns the local Android emulator: it downloads the emulator
# packages and one system image into a project-local SDK root, creates the AVD
# under the git-ignored temp/ tree, boots it, installs the artifact this run
# built and verified, launches it, and records logcat. Nothing here is
# versioned and no global SDK or AVD directory is modified.

emulator_sdk_root() {
  printf '%s\n' "${EMULATOR_SDK_ROOT:-$EMULATOR_DEFAULT_SDK_ROOT}"
}

emulator_state_dir() {
  printf '%s\n' "${EMULATOR_STATE_DIR:-$EMULATOR_DEFAULT_STATE_DIR}"
}

emulator_system_image() {
  if [[ -n "$EMULATOR_IMAGE" ]]; then
    printf '%s\n' "$EMULATOR_IMAGE"
  else
    printf 'system-images;android-%s;google_apis;arm64-v8a\n' "$EMULATOR_API"
  fi
}

emulator_binary_path() {
  local binary
  binary="$(emulator_sdk_root)/emulator/emulator"
  if [[ -x "$binary" ]]; then printf '%s\n' "$binary"; fi
}

emulator_system_image_dir() {
  # A package id is its path under the SDK root: system-images;a;b;c -> system-images/a/b/c
  printf '%s/%s\n' "$(emulator_sdk_root)" "${1//;//}"
}

# The emulator validates a candidate SDK root by requiring a platform-tools
# subdirectory inside it. Without that directory it rejects the project-local
# root and aborts with "Broken AVD system path", so platform-tools is part of
# the emulator toolchain even though the lane drives adb from the global SDK.
emulator_platform_tools_dir() {
  printf '%s/platform-tools\n' "$(emulator_sdk_root)"
}

# The Android SDK licences were already accepted for the global SDK. A second
# SDK root is a second licence store, so the accepted files are copied instead
# of re-prompted or silently assumed; a licence that is genuinely missing stays
# a named sdkmanager failure below.
seed_emulator_licenses() {
  local root="$1" licence
  [[ -d "$root/licenses" ]] && return 0
  [[ -d "$ANDROID_SDK_RESOLVED/licenses" ]] || return 0
  run_cmd mkdir -p "$root/licenses"
  while IFS= read -r licence; do
    [[ -n "$licence" ]] || continue
    run_cmd cp -f "$licence" "$root/licenses/"
  done < <(find "$ANDROID_SDK_RESOLVED/licenses" -type f | sort)
  ok "Android SDK licences reused from $ANDROID_SDK_RESOLVED/licenses"
}

ensure_emulator_packages() {
  step "Android emulator packages"
  local root image
  root="$(emulator_sdk_root)"
  image="$(emulator_system_image)"

  if [[ -n "$(emulator_binary_path)" && -d "$(emulator_system_image_dir "$image")" \
    && -d "$(emulator_platform_tools_dir)" ]]; then
    ok "emulator, platform-tools and $image installed under $root"
    return 0
  fi

  if [[ "$ALLOW_INSTALL" -eq 0 ]]; then
    fail "The Android emulator is missing and --no-install-deps was given"
  fi

  miss "emulator packages under $root"
  log "first run: downloading platform-tools, the emulator and $image into $root"
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> %s --sdk_root=%s --install platform-tools emulator %s\n' "$SDKMANAGER" "$root" "$image"
    return 0
  fi

  run_cmd mkdir -p "$root"
  seed_emulator_licenses "$root"
  run_cmd "$SDKMANAGER" --sdk_root="$root" --install "platform-tools" "emulator" "$image"
  [[ -n "$(emulator_binary_path)" ]] \
    || fail "sdkmanager finished but $root/emulator/emulator is missing"
  [[ -d "$(emulator_system_image_dir "$image")" ]] \
    || fail "sdkmanager finished but $image is not installed under $root/system-images"
  [[ -d "$(emulator_platform_tools_dir)" ]] \
    || fail "sdkmanager finished but platform-tools is not installed under $root"
  ok "emulator toolchain ready under $root"
}

emulator_device_profile() {
  local devices candidate
  devices="$("$AVDMANAGER" list device 2>/dev/null || true)"
  for candidate in pixel_7 pixel_6 pixel_5 pixel; do
    if grep -q "\"$candidate\"" <<<"$devices"; then printf '%s\n' "$candidate"; return 0; fi
  done
  printf 'pixel\n'
}

# vm_stat is the only memory source that works in a restricted shell; `sysctl
# hw.memsize` and `top` are blocked there. Free + inactive + speculative is what
# the kernel can hand to a new process without swapping first.
emulator_host_available_mb() {
  vm_stat 2>/dev/null | awk '
    /page size of/ { for (i = 1; i < NF; i++) if ($i == "of") size = $(i + 1) + 0 }
    /^Pages free/        { free = $3 + 0 }
    /^Pages inactive/    { inactive = $3 + 0 }
    /^Pages speculative/ { speculative = $3 + 0 }
    END {
      if (size <= 0) size = 4096
      printf "%d\n", (free + inactive + speculative) * size / 1048576
    }'
}

# The emulator needs the guest RAM plus roughly 1 GB of overhead on the host.
# Oversubscribing it is not a graceful degradation: the renderer switches to
# software and the guest becomes slow enough for its launcher to ANR.
emulator_resolve_memory() {
  [[ -z "$EMULATOR_MEMORY" ]] || return 0

  local available memory
  available="$(emulator_host_available_mb)"
  memory="$EMULATOR_DEFAULT_MEMORY"
  while (( memory > EMULATOR_MIN_MEMORY )) && (( memory + 1024 > available )); do
    memory=$(( memory - EMULATOR_MEMORY_STEP ))
  done
  EMULATOR_MEMORY="$memory"

  if (( memory + 1024 > available )); then
    warn "the host has ${available}MB available and the AVD boots with ${memory}MB; close heavy applications if the emulator feels slow"
  else
    ok "AVD memory ${memory}MB (host available ${available}MB)"
  fi
}

emulator_resolved_gpu_mode() {
  if [[ -n "$EMULATOR_GPU_MODE" ]]; then
    printf '%s\n' "$EMULATOR_GPU_MODE"
  elif [[ "$EMULATOR_HEADLESS" -eq 1 ]]; then
    printf '%s\n' "$EMULATOR_HEADLESS_GPU_MODE"
  else
    printf '%s\n' "$EMULATOR_DEFAULT_GPU_MODE"
  fi
}

# An empty or "none" answer means "write nothing": the default is to leave the
# WebView exactly as the system ships it, and a caller who wants to try a flag
# names it explicitly.
emulator_resolved_webview_flags() {
  if [[ -z "$EMULATOR_WEBVIEW_FLAGS" ]]; then
    printf '%s\n' "$EMULATOR_DEFAULT_WEBVIEW_FLAGS"
  elif [[ "$EMULATOR_WEBVIEW_FLAGS" == "none" ]]; then
    printf '\n'
  else
    printf '%s\n' "$EMULATOR_WEBVIEW_FLAGS"
  fi
}

# The banner and the verdicts need one word for "no flags", not an empty field.
emulator_webview_flags_label() {
  local flags
  flags="$(emulator_resolved_webview_flags)"
  printf '%s\n' "${flags:-none}"
}

# The WebView reads that file once, when the application process starts, so it is
# written after the guest has booted and before `am start`; the install in
# between already stopped the previous process. A file that cannot be written is
# reported instead of aborting the lane: the application still starts, it just
# starts without the flags, and the verdict below then says so.
emulator_install_webview_flags() {
  local flags read_back
  flags="$(emulator_resolved_webview_flags)"
  if [[ -z "$flags" ]]; then
    skip "WebView command line: none (--emulator-webview-flags <flags> tries one)"
    return 0
  fi
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> adb -s %s shell "cat > %s && chmod 644 %s" <<< %q\n' \
      "$EMULATOR_SERIAL" "$EMULATOR_WEBVIEW_FLAGS_FILE" "$EMULATOR_WEBVIEW_FLAGS_FILE" "$flags"
    return 0
  fi
  printf '%s\n' "$flags" \
    | adb -s "$EMULATOR_SERIAL" shell "cat > $EMULATOR_WEBVIEW_FLAGS_FILE && chmod 644 $EMULATOR_WEBVIEW_FLAGS_FILE" \
      >/dev/null 2>&1 || true
  # `pipefail` is active: a refused read-back must reach the warning below, never
  # end the lane on the way there.
  read_back="$(adb -s "$EMULATOR_SERIAL" shell cat "$EMULATOR_WEBVIEW_FLAGS_FILE" 2>/dev/null | tr -d '\r' | head -1 || true)"
  if [[ "$read_back" == "$flags" ]]; then
    ok "WebView command line: $flags"
  else
    warn "the WebView command line could not be installed at $EMULATOR_WEBVIEW_FLAGS_FILE (read back: ${read_back:-empty}); the application will start without it"
  fi
}

# Single owner of the emulator command line, one argument per line. The line is
# recorded so the next run can tell whether the instance already running was
# booted with these settings: GPU and RAM only change on a fresh boot.
emulator_launch_args() {
  printf '%s\n' -avd "$EMULATOR_AVD_NAME" \
    -port "$EMULATOR_PORT" \
    -memory "$EMULATOR_MEMORY" \
    -gpu "$(emulator_resolved_gpu_mode)" \
    -no-boot-anim -no-snapshot-save -no-metrics
  if [[ "$EMULATOR_HEADLESS" -eq 1 ]]; then printf '%s\n' -no-window; fi
}

# Any state counts as running: an instance that is still booting, unauthorized or
# frozen must be restarted, never treated as ready.
emulator_is_running() {
  local serial="$1"
  adb devices 2>/dev/null | awk 'NR > 1 && $1 != "" { print $1 }' | grep -qx "$serial"
}

# The pid recorded at launch is the only handle on an instance that no longer
# answers adb. A frozen QEMU main loop keeps the process and the console port
# alive while never serving `adb emu kill`, and adb stops listing the serial, so
# the previous run would either be seen as "no emulator" (and the new instance
# would fail on the busy port) or block the shutdown wait. The recorded command
# line is checked before signalling, so a recycled pid can never take an
# unrelated process down.
emulator_instance_pid() {
  local pid_file pid command
  pid_file="$(emulator_state_dir)/emulator.pid"
  [[ -f "$pid_file" ]] || return 1
  pid="$(tr -dc '0-9' <"$pid_file")"
  [[ -n "$pid" ]] || return 1
  # Liveness first: a lock file or a pid file left behind by an instance that
  # already exited must never be mistaken for a running emulator.
  kill -0 "$pid" 2>/dev/null || return 1
  # The AVD lock is written by whichever instance is holding the device, and the
  # emulator removes it on exit. It is the identity source that keeps working
  # where `ps` is unavailable.
  if emulator_pid_owns_avd "$pid"; then
    printf '%s\n' "$pid"
    return 0
  fi
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == *emulator* ]] || return 1
  printf '%s\n' "$pid"
}

# `hardware-qemu.ini.lock` holds the pid of the instance holding the AVD; the
# emulator writes it at boot and deletes it on exit, so its content is the
# second, `ps`-free proof that the recorded pid is really the emulator.
emulator_pid_owns_avd() {
  local pid="$1" lock
  lock="$(emulator_state_dir)/avd/$EMULATOR_AVD_NAME.avd/hardware-qemu.ini.lock"
  [[ -f "$lock" ]] || return 1
  [[ "$(tr -dc '0-9' <"$lock")" == "$pid" ]]
}

# Console shutdown first because that is the emulator's own clean path; a frozen
# instance never serves it, so signals follow. The grace periods are short on
# purpose: an AVD is throw-away, project-local state, and a wedged instance left
# behind is exactly what made the previous run unusable.
emulator_stop_instance() {
  local serial="$1" pid deadline
  if emulator_is_running "$serial"; then
    log "asking $serial to shut down"
    adb -s "$serial" emu kill >/dev/null 2>&1 || true
    deadline=$((SECONDS + 20))
    while (( SECONDS < deadline )) && emulator_is_running "$serial"; do sleep 2; done
    emulator_is_running "$serial" || return 0
  fi

  pid="$(emulator_instance_pid)" || return 0
  warn "$serial did not answer the console; terminating pid $pid"
  kill "$pid" 2>/dev/null || true
  deadline=$((SECONDS + 15))
  while (( SECONDS < deadline )) && kill -0 "$pid" 2>/dev/null; do sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then
    warn "pid $pid ignored SIGTERM; sending SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
    deadline=$((SECONDS + 10))
    while (( SECONDS < deadline )) && kill -0 "$pid" 2>/dev/null; do sleep 1; done
  fi
  if kill -0 "$pid" 2>/dev/null; then
    warn "pid $pid is still alive after SIGKILL"
    return 1
  fi
  rm -f "$(emulator_state_dir)/emulator.pid"
  ok "$serial stopped"
}

# The AVD is project-local, throw-away state, and the profile avdmanager applies
# is wrong for this lane: it disables GPU emulation and pins the guest RAM at
# 2 GB. Normalizing the config also keeps the AVD usable from Android Studio,
# which reads the same keys.
emulator_set_avd_property() {
  local config="$1" key="$2" value="$3" current
  current="$(sed -n "s/^${key}=//p" "$config" 2>/dev/null | head -1)"
  if [[ "$current" == "$value" ]]; then
    skip "$key already $value"
    return 0
  fi

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> set %s=%s in %s (currently "%s")\n' "$key" "$value" "$config" "$current"
    return 0
  fi

  awk -v key="$key" -v value="$value" '
    $0 ~ "^" key "=" { print key "=" value; seen = 1; next }
    { print }
    END { if (!seen) print key "=" value }
  ' "$config" >"$config.tmp"
  mv "$config.tmp" "$config"
}

emulator_normalize_avd_config() {
  local config="$1"
  step "Android virtual device settings"
  log "normalizing $config"
  emulator_set_avd_property "$config" hw.gpu.enabled yes
  emulator_set_avd_property "$config" hw.gpu.mode auto
  emulator_set_avd_property "$config" hw.ramSize "$EMULATOR_MEMORY"
  emulator_set_avd_property "$config" hw.keyboard yes
  ok "AVD settings ready (gpu=yes/auto, ram=${EMULATOR_MEMORY}MB, keyboard=yes)"
}

ensure_emulator_avd() {
  step "Android virtual device"
  local root state avd_home name image profile
  root="$(emulator_sdk_root)"
  state="$(emulator_state_dir)"
  avd_home="$state/avd"
  name="$EMULATOR_AVD_NAME"
  image="$(emulator_system_image)"

  # The AVD, the adb keys and the emulator preferences all stay under temp/.
  export ANDROID_AVD_HOME="$avd_home"
  export ANDROID_EMULATOR_HOME="$state"
  export ANDROID_USER_HOME="$state/user"

  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> ANDROID_AVD_HOME=%s AVDMANAGER_OPTS=-Dcom.android.sdkmanager.toolsdir=%s/cmdline-tools/latest %s create avd -n %s -k %s -d <profile>\n' \
      "$avd_home" "$root" "$AVDMANAGER" "$name" "$image"
    return 0
  fi

  run_cmd mkdir -p "$avd_home" "$ANDROID_USER_HOME"

  if [[ "$EMULATOR_WIPE" -eq 1 && -f "$avd_home/$name.ini" ]]; then
    log "recreating the existing AVD $name"
    run_cmd "$AVDMANAGER" delete avd -n "$name"
  fi

  if [[ -f "$avd_home/$name.ini" ]]; then
    ok "AVD $name reused ($avd_home)"
    emulator_normalize_avd_config "$avd_home/$name.avd/config.ini"
    return 0
  fi

  profile="$(emulator_device_profile)"
  log "creating AVD $name ($image, device profile $profile)"
  # avdmanager ignores ANDROID_HOME and ANDROID_SDK_ROOT: its launcher sets the
  # `com.android.sdkmanager.toolsdir` property to the cmdline-tools install and
  # the CLI takes the SDK root from that path's grandparent. Overriding the
  # property is what makes the project-local system image visible here instead
  # of the global SDK, which holds no system image at all.
  local toolsdir="$root/cmdline-tools/latest"
  run_cmd mkdir -p "$toolsdir"
  # avdmanager asks whether a custom hardware profile is wanted; answering "no"
  # keeps the profile given on the command line.
  printf 'no\n' | run_cmd env \
    ANDROID_SDK_ROOT="$root" ANDROID_HOME="$root" \
    ANDROID_AVD_HOME="$avd_home" ANDROID_USER_HOME="$ANDROID_USER_HOME" \
    AVDMANAGER_OPTS="-Dcom.android.sdkmanager.toolsdir=$toolsdir" \
    "$AVDMANAGER" create avd -n "$name" -k "$image" -d "$profile" --force
  [[ -f "$avd_home/$name.ini" ]] || fail "avdmanager did not create $avd_home/$name.ini"
  emulator_normalize_avd_config "$avd_home/$name.avd/config.ini"
  ok "AVD $name created under $state"
}

# A launch that cannot succeed - a second instance on the same port, a broken
# AVD - is written to the log within seconds. Reporting it there keeps the lane
# from spending the whole boot timeout on a process that already gave up.
emulator_assert_boot_progress() {
  local log="$1" line
  [[ -f "$log" ]] || return 0
  line="$(grep -m1 -E "^(FATAL|PANIC)|Address already in use|Another emulator instance" "$log" 2>/dev/null || true)"
  [[ -z "$line" ]] || fail "the emulator cannot start: ${line#*| } (log: $log)"
}

emulator_wait_for_boot() {
  local serial="$1" deadline=$((SECONDS + EMULATOR_BOOT_TIMEOUT)) state log
  log="$(emulator_state_dir)/emulator.log"
  log "waiting for $serial to finish booting (timeout ${EMULATOR_BOOT_TIMEOUT}s)"
  while (( SECONDS < deadline )); do
    state="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$state" == "1" ]]; then
      ok "$serial booted"
      return 0
    fi
    emulator_assert_boot_progress "$log"
    sleep 5
  done
  fail "$serial did not finish booting within ${EMULATOR_BOOT_TIMEOUT}s (see $log)"
}

boot_emulator() {
  step "Android emulator"
  local root state avd_home emulator serial log args_file
  root="$(emulator_sdk_root)"
  state="$(emulator_state_dir)"
  avd_home="$state/avd"
  emulator="$(emulator_binary_path)"
  serial="emulator-$EMULATOR_PORT"
  log="$state/emulator.log"
  args_file="$state/emulator.args"

  EMULATOR_SERIAL="$serial"

  local -a args=()
  while IFS= read -r arg; do args+=("$arg"); done < <(emulator_launch_args)

  # A running instance keeps the flags it was booted with, so it is only reused
  # when it was started with exactly these settings. Anything else - a different
  # renderer, a different guest size, a recreated AVD - is restarted, because the
  # alternative is testing a configuration the caller did not ask for. An
  # instance adb no longer lists while its recorded pid is alive is the frozen
  # case (see todo/android.md 12.11): it still owns the console port, so it is
  # restarted as well instead of being mistaken for "no emulator yet".
  local restart_reason=""
  if emulator_is_running "$serial"; then
    if [[ "$EMULATOR_WIPE" -eq 0 && -f "$args_file" && "$(cat "$args_file")" == "${args[*]}" ]]; then
      ok "$serial is already running with the current settings"
      return 0
    fi
    restart_reason="it was booted with other settings"
  elif [[ -n "$(emulator_instance_pid || true)" ]]; then
    restart_reason="it is frozen and no longer answers adb"
  fi

  if [[ -n "$restart_reason" ]]; then
    log "stopping $serial ($restart_reason)"
    if [[ "$DO_DRY_RUN" -eq 1 ]]; then
      printf '[apk] dry-run> adb -s %s emu kill, then SIGTERM/SIGKILL on the pid recorded in %s\n' "$serial" "$(emulator_state_dir)/emulator.pid"
    else
      emulator_stop_instance "$serial" \
        || fail "$serial could not be stopped; kill the pid in $(emulator_state_dir)/emulator.pid and re-run"
    fi
  fi

  log "launching $emulator ${args[*]}"
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> ANDROID_AVD_HOME=%s %s %s\n' "$avd_home" "${emulator:-$root/emulator/emulator}" "${args[*]}"
    return 0
  fi

  [[ -n "$emulator" ]] || fail "The emulator binary is missing under $root"

  # The window is left open on purpose: it is the visible proof the user asked
  # for, and it keeps the AVD's GPU surface alive while logcat is captured.
  (
    cd "$state" || exit 1
    ANDROID_AVD_HOME="$avd_home" \
    ANDROID_EMULATOR_HOME="$state" \
    ANDROID_USER_HOME="$state/user" \
    ANDROID_SDK_ROOT="$root" \
    ANDROID_HOME="$root" \
      nohup "$emulator" "${args[@]}" >"$log" 2>&1 &
    echo $! > "$state/emulator.pid"
  )
  printf '%s\n' "${args[*]}" >"$args_file"
  ok "emulator started (pid $(cat "$state/emulator.pid"), log $log)"

  adb start-server >/dev/null 2>&1 \
    || fail "The adb server could not be started (port $((EMULATOR_PORT + 1)) or 5037 blocked); run this lane outside a restricted sandbox"
  emulator_wait_for_boot "$serial"
}

# The window that holds the focus is what the user sees; a running process alone
# proves nothing, and the first report showed exactly that gap (the frozen
# launcher ANR'd while the app was reported as started).
emulator_focused_window() {
  adb -s "$EMULATOR_SERIAL" shell dumpsys window 2>/dev/null \
    | grep -m1 'mCurrentFocus=' \
    | sed 's/.*mCurrentFocus=//' \
    | tr -d '\r'
}

emulator_badging_field() {
  local artifact="$1" expression="$2" aapt2
  aapt2="$(build_tools_dir)/aapt2"
  [[ -x "$aapt2" ]] || fail "aapt2 is missing under $ANDROID_SDK_RESOLVED/build-tools"
  "$aapt2" dump badging "$artifact" | sed -n "$expression" | head -1
}

# The buffers are cleared and the capture starts *before* `am start`: the first
# seconds of a startup failure are the whole point of this lane, and clearing
# after the launch would throw exactly those lines away.
emulator_capture_start() {
  step "Logcat"
  run_cmd mkdir -p "$EMULATOR_LOG_DIR"
  EMULATOR_STAMP="$(date +%Y%m%d-%H%M%S)"
  EMULATOR_LOG_FILE="$EMULATOR_LOG_DIR/atome-$EMULATOR_STAMP.log"
  EMULATOR_CRASH_FILE="$EMULATOR_LOG_DIR/atome-crash-$EMULATOR_STAMP.log"
  EMULATOR_EXIT_FILE="$EMULATOR_LOG_DIR/atome-exit-$EMULATOR_STAMP.log"

  adb -s "$EMULATOR_SERIAL" logcat -c -b main -b system -b crash
  log "capturing logcat into $EMULATOR_LOG_FILE"
  adb -s "$EMULATOR_SERIAL" logcat -v threadtime -b main -b system -b crash \
    >"$EMULATOR_LOG_FILE" 2>&1 &
  EMULATOR_LOG_PID=$!
}

# The application pid, empty as soon as the process is gone. `pidof` prints one
# line per match and the app is single-process, so the first one is the app.
emulator_app_pid() {
  adb -s "$EMULATOR_SERIAL" shell pidof "$1" 2>/dev/null | tr -d '\r' | awk '{print $1}'
}

# Android 11+ records *why* an application left: an uncaught exception, a native
# signal, an ANR, a low-memory kill or a plain back-swipe. That record outlives
# the logcat buffer, so it is the one line that answers a death the capture
# window did not witness.
emulator_exit_info() {
  adb -s "$EMULATOR_SERIAL" shell dumpsys activity exit-info "$1" 2>/dev/null \
    | tr -d '\r' | sed -n '1,40p'
}

# A frozen guest stops writing to logcat, so the last line of the capture is much
# older than the moment the capture ended. That is what the 20:07 run left behind
# — "Process system isn't responding" on screen, system_server unresponsive — and
# such a run says nothing about the application, so the distance is measured and
# reported before any other reading of the same file.
emulator_log_stall_seconds() {
  local last stamp last_epoch now_epoch
  last="$(tail -1 "$EMULATOR_LOG_FILE" 2>/dev/null | cut -c1-18 || true)"
  stamp="${last:0:14}"
  [[ "$stamp" =~ ^[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2}$ ]] || return 1
  last_epoch="$(date -j -f "%m-%d %H:%M:%S" "$stamp" "+%s" 2>/dev/null || true)"
  [[ -n "$last_epoch" ]] || return 1
  now_epoch="$(date "+%s")"
  printf '%s\n' "$(( now_epoch - last_epoch ))"
}

emulator_capture_finish() {
  local app_id="$1" shot focus hits pid reason render_hits bootstrap_hits missed=0 waited=0 died=0
  local stall="" stall_hits=""
  local ceiling="$EMULATOR_LOGCAT_MAX_SECONDS"
  # A death is reported immediately: its crash buffer and its exit record are
  # already written at that point, so waiting for the requested minimum would
  # only delay the answer. The minimum therefore bounds the alive case, and the
  # ceiling can never sit below it.
  if (( ceiling < EMULATOR_LOGCAT_SECONDS )); then
    ceiling="$EMULATOR_LOGCAT_SECONDS"
  fi
  # The capture follows the application instead of sleeping one fixed slice: the
  # Android start needs ~17 s to leave the bootstrap page, and a reported crash
  # that landed after the historical 25 s window left no trace at all. The loop
  # stops the moment the process disappears.
  log "following $app_id for up to ${ceiling}s; reproduce the crash now, the capture stops when the app disappears"
  while :; do
    sleep 1
    waited=$((waited + 1))
    pid="$(emulator_app_pid "$app_id")"
    if [[ -n "$pid" ]]; then
      missed=0
    else
      # A single empty answer is not a death: adb can be slow while the guest
      # renders. Two consecutive misses are.
      missed=$((missed + 1))
      if (( missed >= 2 )); then
        died=1
        break
      fi
    fi
    if (( waited >= ceiling )); then
      break
    fi
  done
  kill "$EMULATOR_LOG_PID" 2>/dev/null || true
  wait "$EMULATOR_LOG_PID" 2>/dev/null || true

  adb -s "$EMULATOR_SERIAL" logcat -d -b crash -v threadtime >"$EMULATOR_CRASH_FILE" 2>&1 || true
  ok "logcat      : $EMULATOR_LOG_FILE"
  ok "crash buffer: $EMULATOR_CRASH_FILE"

  if [[ -s "$EMULATOR_CRASH_FILE" ]]; then
    log "--- crash buffer (tail) ---"
    tail -40 "$EMULATOR_CRASH_FILE" | sed 's/^/[apk] /'
  else
    ok "the crash buffer is empty"
  fi

  if [[ "$died" -eq 1 ]]; then
    emulator_exit_info "$app_id" >"$EMULATOR_EXIT_FILE" 2>&1 || true
    reason="$(grep -m1 -E '^[[:space:]]*reason=' "$EMULATOR_EXIT_FILE" 2>/dev/null | tr -d '\r' | sed 's/^[[:space:]]*//' || true)"
    warn "$app_id disappeared after ${waited}s${reason:+ ($reason)}"
    ok "exit record : $EMULATOR_EXIT_FILE"
    if [[ -s "$EMULATOR_EXIT_FILE" ]]; then
      log "--- application exit record ---"
      sed 's/^/[apk] /' "$EMULATOR_EXIT_FILE"
    fi
    log "--- $app_id lines (tail) ---"
    grep -i -e "$app_id" -e "AndroidRuntime" -e "libc *: Fatal" "$EMULATOR_LOG_FILE" | tail -25 | sed 's/^/[apk] /' || true
  else
    ok "$app_id is still running after ${waited}s"
  fi

  # The verdict is written here so a single run is self-explanatory: the loader
  # failure that motivated this lane (__cxa_pure_virtual), a native crash, an ANR
  # and a launch that never reached the screen are named explicitly.
  stall="$(emulator_log_stall_seconds || true)"
  # Only the activity manager speaking about its own system counts here: an
  # application ANR leaves the guest responsive and is named further below.
  stall_hits="$(grep -i -m2 -E "Process system isn't responding|ANR in system|watchdog.*system_server|system_server.*not responding" "$EMULATOR_LOG_FILE" 2>/dev/null || true)"
  if [[ -n "$stall_hits" ]] || [[ -n "$stall" && "$stall" -ge "$EMULATOR_LOG_STALL_SECONDS" ]]; then
    log "--- guest frozen ---"
    [[ -z "$stall_hits" ]] || printf '%s\n' "$stall_hits" | sed 's/^/[apk] /'
    warn "the emulator guest stopped answering${stall:+ (logcat silent for ${stall}s before the capture ended)}: this run says nothing about the application — reboot the guest and read the WebGPU verdict below"
  fi

  hits="$(grep -i -E "FATAL EXCEPTION|UnsatisfiedLinkError|dlopen failed|cannot locate symbol|ANR in|not responding|signal 11|SIGSEGV" "$EMULATOR_LOG_FILE" 2>/dev/null | head -8 || true)"
  if [[ -n "$hits" ]]; then
    log "--- failures in the captured window ---"
    printf '%s\n' "$hits" | sed 's/^/[apk] /'
    warn "the launch produced failures; read $EMULATOR_LOG_FILE"
  else
    ok "no crash, ANR or native-loader failure in the captured window"
  fi

  # Two failures leave the page white and neither shows a crash, so this lane
  # names them here: the Bevy renderer found no WebGPU adapter, or the window
  # never left the bootstrap origin for the local server — the second is why the
  # bootstrap page's module errors ("text/html" instead of JavaScript) matter.
  # The boot failure surface prints its own verdict in the device log, so a run
  # that ended on a named cause is never read as a mute white page.
  surface_hits="$(grep -m2 -E '\[boot-failure\] surface painted' "$EMULATOR_LOG_FILE" 2>/dev/null || true)"
  if [[ -n "$surface_hits" ]]; then
    log "--- boot failure surface painted ---"
    printf '%s\n' "$surface_hits" | sed 's/^/[apk] /'
  fi

  render_hits="$(grep -m3 -E "No available adapters|Unable to find a GPU|bevy_renderer_webgpu_unavailable|bevy_renderer_start_failed_terminal" "$EMULATOR_LOG_FILE" 2>/dev/null || true)"
  if [[ -n "$render_hits" ]]; then
    log "--- white screen: WebGPU renderer ---"
    printf '%s\n' "$render_hits" | sed 's/^/[apk] /'
    if [[ -n "$surface_hits" ]]; then
      warn "the Bevy renderer found no WebGPU adapter; the boot failure surface named the cause on screen (see the screenshot)"
    else
      warn "the Bevy renderer found no WebGPU adapter: every Bevy surface stays white (WebView command line: $(emulator_resolved_webview_flags))"
    fi
  else
    ok "no WebGPU adapter failure in the captured window"
  fi

  if ! grep -q "127.0.0.1:3000" "$EMULATOR_LOG_FILE" 2>/dev/null; then
    bootstrap_hits="$(grep -m2 -E 'module_load_failed|MIME type of "text/html"' "$EMULATOR_LOG_FILE" 2>/dev/null || true)"
    if [[ -n "$bootstrap_hits" ]]; then
      log "--- white screen: local server never reached ---"
      printf '%s\n' "$bootstrap_hits" | sed 's/^/[apk] /'
      warn "the window stayed on the bootstrap origin; the modules it imports only exist on 127.0.0.1:3000"
    fi
  fi

  # A live process proves nothing about what the user sees; the focused window is
  # the durable proof, and the screenshot is the visual one.
  focus="$(emulator_focused_window)"
  [[ -n "$focus" ]] && log "focused window: $focus"

  shot="$EMULATOR_LOG_DIR/atome-$EMULATOR_STAMP.png"
  if adb -s "$EMULATOR_SERIAL" exec-out screencap -p >"$shot" 2>/dev/null && [[ -s "$shot" ]]; then
    ok "screen      : $shot"
  else
    warn "the screen could not be captured"
    shot=""
  fi

  if [[ "$focus" == *"$app_id"* ]]; then
    ok "atome is on screen ($app_id holds the focused window)"
  elif [[ -n "$focus" ]]; then
    warn "the focused window is not $app_id: $focus"
  else
    warn "the focused window could not be read from the device"
  fi
  [[ -z "$shot" ]] || log "open the screenshot with: open $shot"
}

emulator_session() {
  local artifact app_id activity
  # The guest size is decided once, before the AVD is created or normalized: the
  # config file and the command line must agree on it.
  emulator_resolve_memory
  ensure_emulator_packages
  ensure_emulator_avd
  boot_emulator
  emulator_install_webview_flags
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> adb -s %s install -r <artifact>\n' "$EMULATOR_SERIAL"
    printf '[apk] dry-run> adb -s %s shell am start -n <applicationId>/<launcher activity>\n' "$EMULATOR_SERIAL"
    printf '[apk] dry-run> adb -s %s logcat -v threadtime > %s/atome-<timestamp>.log\n' "$EMULATOR_SERIAL" "$EMULATOR_LOG_DIR"
    return 0
  fi

  # install_artifact stays the single owner of "install with adb".
  TARGET_DEVICE="$EMULATOR_SERIAL"
  install_artifact
  artifact="${DISCOVERED_ARTIFACTS[0]}"
  app_id="$(emulator_badging_field "$artifact" "s/^package: name='\([^']*\)'.*/\1/p")"
  activity="$(emulator_badging_field "$artifact" "s/^launchable-activity: name='\([^']*\)'.*/\1/p")"
  [[ -n "$app_id" && -n "$activity" ]] \
    || fail "Could not read the package or the launcher activity from $(basename "$artifact")"

  step "Launching $app_id on $EMULATOR_SERIAL"
  emulator_capture_start
  adb -s "$EMULATOR_SERIAL" shell am start -W -n "$app_id/$activity" | sed 's/^/[apk] /'
  emulator_capture_finish "$app_id"

  step "Emulator session ready"
  log "device      : $EMULATOR_SERIAL"
  log "webview     : $(emulator_webview_flags_label)"
  log "follow live : adb -s $EMULATOR_SERIAL logcat -v threadtime"
  log "stop it     : adb -s $EMULATOR_SERIAL emu kill"
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
  printf '[apk] emulator          : %s\n' "$([[ -n "$(emulator_binary_path)" ]] && echo "$(emulator_binary_path)" || echo "not installed (./run.sh apk --emulator installs it under $(emulator_sdk_root))")"
  printf '[apk] AVD state         : %s\n' "$(emulator_state_dir)"
  printf '[apk] requested mode    : %s (abi=%s, emit=%s)\n' "$MODE" "$ABI" "$EMIT"
  printf '[apk] isolated home     : %s\n' "${ISOLATED_HOME:-<default: \$HOME>}"
  printf '[apk] free disk         : %s\n' "$(df -h /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}' || df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4}')"
}

# ---------------------------------------------------------------------- main

main() {
  parse_args "$@"

  log "atome Android build"
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
  verify_android_link
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    if [[ "$DO_EMULATOR" -eq 1 ]]; then emulator_session; fi
    return 0
  fi

  collect_artifacts
  if [[ "$DO_INSTALL" -eq 1 ]]; then install_artifact; fi
  if [[ "$DO_EMULATOR" -eq 1 ]]; then emulator_session; fi

  step "Done"
  log "Artifacts are under $(artifact_dir)"
  return 0
}

main "$@"
