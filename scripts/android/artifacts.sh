# Android build artifact discovery, verification and installation.
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
    if [[ "$MODE" == "prod" ]]; then
      node "$ANDROID_SCRIPT_DIR/release_bundle.mjs" "$artifact"
    else
      unzip -tq "$artifact"
      warn "debug AAB integrity checked; it is not a Google Play release"
    fi
  fi

  if command -v shasum >/dev/null 2>&1; then
    log "sha256 $(shasum -a 256 "$artifact" | cut -d' ' -f1)"
  fi
}

verify_native_runtime() {
  node "$ANDROID_SCRIPT_DIR/native_artifacts.mjs" "$1"
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

# The Tauri report is authoritative; do not select older files by modification time.
ensure_build_directory() {
  if [[ "$DO_DRY_RUN" -eq 1 ]]; then
    printf '[apk] dry-run> mkdir -p %s\n' "$TEMP_DIR"
    return 0
  fi
  run_cmd mkdir -p "$TEMP_DIR"
}

collect_artifacts() {
  local suffix root artifact
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

  [[ "${#produced[@]}" -gt 0 ]] \
    || fail "The Tauri report contains no *.${suffix} artifact for this run (build log: $BUILD_LOG)"

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
