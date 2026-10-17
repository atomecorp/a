# Android emulator lifecycle and on-device evidence capture.
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
