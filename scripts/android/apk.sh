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
readonly ANDROID_SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ANDROID_SCRIPT_DIR/configuration.sh"

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

for module in toolchain payload artifacts emulator_environment emulator_session; do
  source "$ANDROID_SCRIPT_DIR/$module.sh"
done

tauri_android_build() {
  local -a args=(android build --ci)
  if [[ -n "${ATOME_ANDROID_RELEASE_CONFIG:-}" ]]; then
    [[ "$MODE" == "prod" ]] || fail "A release plan requires --prod"
    args+=(--config "$ATOME_ANDROID_RELEASE_CONFIG")
  fi
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
  # The release orchestrator calls this same build owner once, without this flag.
  # exec replaces this process; there is no nested release loop or second builder.
  local argument
  for argument in "$@"; do
    if [[ "$argument" == "--firebase" ]]; then
      exec node "$ANDROID_SCRIPT_DIR/firebase_distribution.mjs" "$@"
    fi
  done
  for argument in "$@"; do
    if [[ "$argument" == "--play-internal" ]]; then
      exec node "$ANDROID_SCRIPT_DIR/play_internal.mjs" "$@"
    fi
  done
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

  if [[ -n "$VERIFY_AAB" ]]; then
    [[ "$DO_DRY_RUN" -eq 0 ]] || fail "--verify-aab performs verification; use the release generator for a dry-run"
    node "$ANDROID_SCRIPT_DIR/release_bundle.mjs" "$VERIFY_AAB"
    return 0
  fi

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

  ensure_build_directory
  if [[ "$DO_DRY_RUN" -eq 0 ]]; then
    # Serialize access to the canonical build log/output tree, including ordinary APK builds.
    mkdir "$TEMP_DIR/android-build.lock" 2>/dev/null || fail "Another Android build holds temp/android-build.lock"
    printf '%s\n' "$$" > "$TEMP_DIR/android-build.lock/pid"
    trap 'rm -f "$TEMP_DIR/android-build.lock/pid"; rmdir "$TEMP_DIR/android-build.lock"' EXIT
  fi
  remove_stale_artifacts
  tauri_android_build
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
