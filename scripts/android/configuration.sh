# Android build configuration and options; sourced by apk.sh.
readonly PROJECT_ROOT="$(cd -P "$ANDROID_SCRIPT_DIR/../.." >/dev/null 2>&1 && pwd)"
readonly TAURI_DIR="$PROJECT_ROOT/platforms/desktop-tauri"
readonly TAURI_CLI="$PROJECT_ROOT/node_modules/.bin/tauri"
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
VERIFY_AAB=""

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
  --play-internal       Android release generator (Google Play internal testing).
                        See ./scripts/Android_testflight_generator --help.

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
      --verify-aab <file> Validate an existing release AAB without rebuilding
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
      --verify-aab)
        [[ $# -ge 2 ]] || fail "--verify-aab requires an exact file path"
        VERIFY_AAB="$2"; shift 2 ;;
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
