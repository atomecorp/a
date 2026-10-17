# Project-local Android emulator provisioning and launch configuration.
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
