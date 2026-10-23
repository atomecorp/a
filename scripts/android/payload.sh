# Generated Android project, embedded payload and release signing inputs.
android_webroot_sources() {
  printf '%s\n' \
    "$PROJECT_ROOT/atome/src|." \
    "$PROJECT_ROOT/eVe|eVe" \
    "$PROJECT_ROOT/node_modules/rubberband-wasm/dist|vendor-rubberband-wasm/dist" \
    "$PROJECT_ROOT/platforms/desktop-tauri/android-boot|android-boot"
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

  # The browser's archive of the Vosk model: the app reads the unpacked model (native voice engine).
  local -a payload_excludes=(--exclude 'assets/voice/vosk/*.tar.gz')

  local source destination
  while IFS='|' read -r source destination; do
    [[ -d "$source" ]] || fail "Missing web root source directory: $source"
    run_cmd mkdir -p "$ANDROID_WEBROOT/$destination"
    run_cmd rsync -a --delete --exclude '.DS_Store' "${payload_excludes[@]}" "${sibling_excludes[@]}" \
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
