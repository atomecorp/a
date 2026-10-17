# Canonical Android toolchain discovery and bootstrap; sourced by apk.sh.
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

  if [[ "${SQUIRREL_APK_SKIP_LICENSES:-0}" != "1" && "$ALLOW_INSTALL" -eq 1 && "$DO_DOCTOR" -eq 0 ]]; then
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
