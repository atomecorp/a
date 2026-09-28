#!/usr/bin/env bash
set -euo pipefail
umask 077

# codex_switch_gpt_deepseek.sh
#
# GPT <-> DeepSeek switch for the Codex desktop app and CLI.
#
# Design:
#   - `deepseek`, `pro` and `gpt` update ~/.codex/config.toml and exit.
#   - `cli-deepseek`, `cli-pro` and `cli-gpt` open an interactive CLI session.
#   - The original OpenAI model settings are restored when switching to GPT.
#   - DeepSeek CLI/delegation can still use a separate isolated Codex home.
#
# DeepSeek key:
#   1) DEEPSEEK_API_KEY environment variable, or
#   2) <project>/private/DeepSeek_key
#
# Usage examples:
#   ./codex_switch_gpt_deepseek.sh gpt
#   ./codex_switch_gpt_deepseek.sh deepseek
#   ./codex_switch_gpt_deepseek.sh pro
#   ./codex_switch_gpt_deepseek.sh cli-deepseek
#   ./codex_switch_gpt_deepseek.sh delegate "Fix this bug"
#   ./codex_switch_gpt_deepseek.sh status
#   ./codex_switch_gpt_deepseek.sh doctor
#
SCRIPT_NAME="codex_switch_gpt_deepseek"
SCRIPT_VERSION="5.0.0"

MAIN_CODEX_HOME="${MAIN_CODEX_HOME:-$HOME/.codex}"
DEEPSEEK_CODEX_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"
KEY_FILE_REL="${DEEPSEEK_KEY_FILE_REL:-private/DeepSeek_key}"
MAIN_CONFIG="$MAIN_CODEX_HOME/config.toml"
BACKUP_DIR="$MAIN_CODEX_HOME/codex-switch-backup"
ORIGINAL_MODEL_SETTINGS="$BACKUP_DIR/original-model-settings.toml"
SWITCH_TAG="# codex-switch"

DEFAULT_DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-flash}"
DEFAULT_DEEPSEEK_REASONING="${DEEPSEEK_REASONING:-high}"

say()  { printf '%s\n' "$*"; }
err()  { printf 'ERROR: %s\n' "$*" >&2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

resolve_codex_bin() {
  local candidate

  if [[ -n "${CODEX_BIN:-}" ]]; then
    return
  fi

  CODEX_BIN="$(command -v codex 2>/dev/null || true)"
  [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]] && return

  # The Codex desktop bundle is not always added to PATH (notably when a
  # terminal was opened before the app was installed or updated).
  for candidate in \
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex" \
    "$HOME/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex" \
    "/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex" \
    "$HOME/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex"
  do
    if [[ -x "$candidate" ]]; then
      CODEX_BIN="$candidate"
      return
    fi
  done

  CODEX_BIN=""
}

resolve_codex_bin

usage() {
  cat <<'USAGE'
codex_switch_gpt_deepseek.sh v5.0

CONFIGURE CODEX (does not open a terminal prompt)
  ./codex_switch_gpt_deepseek.sh gpt
  ./codex_switch_gpt_deepseek.sh deepseek
  ./codex_switch_gpt_deepseek.sh pro

OPEN AN INTERACTIVE CLI SESSION
  ./codex_switch_gpt_deepseek.sh cli-gpt [codex arguments]
  ./codex_switch_gpt_deepseek.sh cli-deepseek [codex arguments]
  ./codex_switch_gpt_deepseek.sh cli-pro [codex arguments]

DELEGATE ONE TASK TO DEEPSEEK
  ./codex_switch_gpt_deepseek.sh delegate "task"
  printf '%s\n' "task" | ./codex_switch_gpt_deepseek.sh delegate

DIAGNOSTICS
  ./codex_switch_gpt_deepseek.sh status
  ./codex_switch_gpt_deepseek.sh doctor
  ./codex_switch_gpt_deepseek.sh version

DEEPSEEK PER-TASK OPTIONS
  delegate --model flash|pro "task"
  delegate --level low|medium|high|max "task"

NOTES
  - Plain model names update ~/.codex/config.toml and then exit.
  - Quit Codex with Cmd+Q and reopen it after changing provider.
  - The DeepSeek key remains in private/DeepSeek_key.
  - CLI/delegation DeepSeek sessions use ~/.codex-deepseek-worker.
USAGE
}

require_codex() {
  if [[ -z "$CODEX_BIN" || ! -x "$CODEX_BIN" ]]; then
    err "Codex CLI not found in PATH or in the Codex desktop app."
    err "Install/update Codex CLI or run with CODEX_BIN=/absolute/path/to/codex"
    exit 1
  fi
}

normalized_path() {
  local p="$1"
  local parent base

  case "$p" in
    /*) ;;
    *) p="$PWD/$p" ;;
  esac

  if [[ -d "$p" ]]; then
    (cd "$p" 2>/dev/null && pwd -P) || printf '%s\n' "$p"
    return
  fi

  parent="$(dirname "$p")"
  base="$(basename "$p")"
  if [[ -d "$parent" ]]; then
    (cd "$parent" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$base") || printf '%s\n' "$p"
  else
    printf '%s\n' "$p"
  fi
}

validate_isolation() {
  local main worker
  main="$(normalized_path "$MAIN_CODEX_HOME")"
  worker="$(normalized_path "$DEEPSEEK_CODEX_HOME")"

  if [[ "$worker" == "$main" || "$worker" == "$main/"* ]]; then
    err "Unsafe DEEPSEEK_CODEX_HOME: $DEEPSEEK_CODEX_HOME"
    err "It must not be ~/.codex or a directory inside ~/.codex."
    return 1
  fi

  if [[ "$main" == "$worker/"* ]]; then
    err "Unsafe homes: main Codex home is nested inside the DeepSeek home."
    return 1
  fi

  return 0
}

resolve_project_root() {
  local requested="${1:-}"
  local base

  if [[ -n "$requested" ]]; then
    [[ -d "$requested" ]] || {
      err "Project directory does not exist: $requested"
      return 1
    }
    base="$(cd "$requested" && pwd -P)"
  else
    base="$PWD"
  fi

  if git -C "$base" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$base" rev-parse --show-toplevel
  else
    printf '%s\n' "$base"
  fi
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

key_file_path() {
  local root="$1"
  case "$KEY_FILE_REL" in
    /*) printf '%s\n' "$KEY_FILE_REL" ;;
    *)  printf '%s/%s\n' "$root" "$KEY_FILE_REL" ;;
  esac
}

read_api_key() {
  local root="$1"
  local path key

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    printf '%s' "$DEEPSEEK_API_KEY"
    return 0
  fi

  path="$(key_file_path "$root")"
  [[ -f "$path" ]] || return 1

  key="$(tr -d '\r\n' < "$path")"
  key="$(trim "$key")"
  [[ -n "$key" ]] || return 1
  printf '%s' "$key"
}

normalize_deepseek_model() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    flash|deepseek-flash|v4.1-flash|v41-flash)
      printf '%s\n' "deepseek-flash"
      ;;
    pro|deepseek-v4-pro|v4-pro|v4pro)
      printf '%s\n' "deepseek-v4-pro"
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_reasoning() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    low|minimal|light|leger|léger|faible)
      printf '%s\n' "low"
      ;;
    medium|moyen|normal|balanced|high|xhigh|fort|strong|eleve|élevé)
      printf '%s\n' "high"
      ;;
    max|maximum|ultra|expert)
      printf '%s\n' "max"
      ;;
    *)
      return 1
      ;;
  esac
}

write_deepseek_config() {
  local model="$1"
  local reasoning="$2"

  validate_isolation || exit 4
  mkdir -p "$DEEPSEEK_CODEX_HOME"
  chmod 700 "$DEEPSEEK_CODEX_HOME" 2>/dev/null || true

  local tmp
  tmp="$(mktemp "$DEEPSEEK_CODEX_HOME/.config.toml.tmp.XXXXXX")"

  cat > "$tmp" <<EOF_CONFIG
# Generated by $SCRIPT_NAME v$SCRIPT_VERSION
# Isolated DeepSeek worker config.
# DO NOT copy this file into ~/.codex.

model = "$model"
model_provider = "deepseek"
preferred_auth_method = "apikey"
forced_login_method = "api"
model_reasoning_effort = "$reasoning"
model_context_window = 1048576
web_search = "disabled"
approval_policy = "never"
sandbox_mode = "workspace-write"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
request_max_retries = 4
stream_max_retries = 5
stream_idle_timeout_ms = 300000
EOF_CONFIG

  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$DEEPSEEK_CODEX_HOME/config.toml"
}

toml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

strip_managed_config() {
  local source="$1"

  awk -v tag="$SWITCH_TAG" '
    BEGIN { top = 1 }
    index($0, tag " begin") { tagged = 1; next }
    index($0, tag " end")   { tagged = 0; next }
    tagged { next }

    /^\[model_providers\.deepseek(\.auth)?\][[:space:]]*$/ {
      deepseek_table = 1
      next
    }
    /^\[/ {
      deepseek_table = 0
      top = 0
    }
    deepseek_table { next }

    top && /^(model|model_provider|model_reasoning_effort)[[:space:]]*=/ { next }
    index($0, tag) { next }
    { print }
  ' "$source"
}

capture_original_model_settings() {
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR" 2>/dev/null || true

  if [[ ! -f "$ORIGINAL_MODEL_SETTINGS" ]]; then
    awk '
      BEGIN { top = 1 }
      /^\[/ { top = 0 }
      top && /^(model|model_provider|model_reasoning_effort)[[:space:]]*=/ { print }
    ' "$MAIN_CONFIG" > "$ORIGINAL_MODEL_SETTINGS"
    chmod 600 "$ORIGINAL_MODEL_SETTINGS" 2>/dev/null || true
  fi

  if [[ ! -f "$BACKUP_DIR/config.toml.original" ]]; then
    cp -p "$MAIN_CONFIG" "$BACKUP_DIR/config.toml.original"
  fi
  cp -p "$MAIN_CONFIG" "$BACKUP_DIR/config.toml.before-last-switch"
}

rewrite_main_config() {
  local mode="$1"
  local model="${2:-}"
  local key_path="${3:-}"
  local tmp escaped_key

  mkdir -p "$MAIN_CODEX_HOME"
  chmod 700 "$MAIN_CODEX_HOME" 2>/dev/null || true
  [[ -f "$MAIN_CONFIG" ]] || printf '%s' '' > "$MAIN_CONFIG"
  capture_original_model_settings

  tmp="$(mktemp "$MAIN_CODEX_HOME/.config.toml.tmp.XXXXXX")"

  if [[ "$mode" == "deepseek" ]]; then
    escaped_key="$(toml_escape "$key_path")"
    {
      printf 'model = "%s" %s\n' "$model" "$SWITCH_TAG"
      printf 'model_provider = "deepseek" %s\n' "$SWITCH_TAG"
      printf 'model_reasoning_effort = "%s" %s\n' "$DEFAULT_DEEPSEEK_REASONING" "$SWITCH_TAG"
      strip_managed_config "$MAIN_CONFIG"
      printf '\n%s begin\n' "$SWITCH_TAG"
      printf '[model_providers.deepseek]\n'
      printf 'name = "DeepSeek"\n'
      printf 'base_url = "https://api.deepseek.com/"\n'
      printf 'wire_api = "responses"\n'
      printf 'request_max_retries = 4\n'
      printf 'stream_max_retries = 5\n'
      printf 'stream_idle_timeout_ms = 300000\n\n'
      printf '[model_providers.deepseek.auth]\n'
      printf 'command = "/bin/cat"\n'
      printf 'args = ["%s"]\n' "$escaped_key"
      printf 'timeout_ms = 5000\n'
      printf '%s end\n' "$SWITCH_TAG"
    } > "$tmp"
  else
    {
      if [[ -f "$ORIGINAL_MODEL_SETTINGS" ]]; then
        cat "$ORIGINAL_MODEL_SETTINGS"
      fi
      strip_managed_config "$MAIN_CONFIG"
    } > "$tmp"
  fi

  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$MAIN_CONFIG"
}

configure_deepseek() {
  local requested_model="$1"
  local root key_path model

  root="$(resolve_project_root)"
  key_path="$(key_file_path "$root")"
  if [[ ! -r "$key_path" || -z "$(tr -d '[:space:]' < "$key_path")" ]]; then
    err "A persistent DeepSeek switch requires a readable key file."
    err "Expected: $key_path"
    exit 3
  fi

  model="$(normalize_deepseek_model "$requested_model")" || {
    err "Invalid DeepSeek model: $requested_model"
    exit 2
  }

  rewrite_main_config "deepseek" "$model" "$key_path"
  say "Codex is now configured for DeepSeek ($model)."
  say "Quit Codex completely (Cmd+Q), then reopen it."
  say "Backup: $BACKUP_DIR/config.toml.before-last-switch"
}

configure_gpt() {
  if [[ ! -f "$MAIN_CONFIG" ]]; then
    say "Codex already uses its default OpenAI configuration."
    return
  fi

  if ! grep -qF "$SWITCH_TAG" "$MAIN_CONFIG" &&
     ! grep -qE '^model_provider[[:space:]]*=[[:space:]]*"deepseek"' "$MAIN_CONFIG"; then
    say "Codex already uses OpenAI/GPT; configuration unchanged."
    return
  fi

  rewrite_main_config "gpt"
  rm -f "$ORIGINAL_MODEL_SETTINGS"
  say "Codex is now configured for OpenAI/GPT."
  say "Quit Codex completely (Cmd+Q), then reopen it."
}

run_gpt() {
  require_codex
  validate_isolation || exit 4

  mkdir -p "$MAIN_CODEX_HOME"
  chmod 700 "$MAIN_CODEX_HOME" 2>/dev/null || true

  # Force the child back onto the normal OpenAI Codex home and remove all
  # DeepSeek-specific environment variables from the child process.
  env \
    -u DEEPSEEK_API_KEY \
    -u DEEPSEEK_MODEL \
    -u DEEPSEEK_REASONING \
    -u DEEPSEEK_CODEX_HOME \
    -u CODEX_SQLITE_HOME \
    CODEX_HOME="$MAIN_CODEX_HOME" \
    "$CODEX_BIN" "$@"
}

run_deepseek() {
  require_codex
  validate_isolation || exit 4

  local root model reasoning api_key
  root="$(resolve_project_root)"
  model="$(normalize_deepseek_model "${DEEPSEEK_RUN_MODEL:-$DEFAULT_DEEPSEEK_MODEL}")" || {
    err "Invalid DeepSeek model: ${DEEPSEEK_RUN_MODEL:-$DEFAULT_DEEPSEEK_MODEL}"
    exit 2
  }
  reasoning="$(normalize_reasoning "$DEFAULT_DEEPSEEK_REASONING")" || {
    err "Invalid DeepSeek reasoning level: $DEFAULT_DEEPSEEK_REASONING"
    exit 2
  }

  api_key="$(read_api_key "$root" 2>/dev/null || true)"
  if [[ -z "$api_key" ]]; then
    err "DeepSeek API key not found."
    err "Expected: $(key_file_path "$root")"
    err "or set DEEPSEEK_API_KEY temporarily."
    exit 3
  fi

  write_deepseek_config "$model" "$reasoning"

  CODEX_HOME="$DEEPSEEK_CODEX_HOME" \
  DEEPSEEK_API_KEY="$api_key" \
  env -u CODEX_SQLITE_HOME \
    "$CODEX_BIN" "$@"
}

delegate() {
  require_codex
  validate_isolation || exit 4

  local model="$DEFAULT_DEEPSEEK_MODEL"
  local reasoning="$DEFAULT_DEEPSEEK_REASONING"
  local -a task_parts=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --model|-m)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        model="$2"
        shift 2
        ;;
      --level|--reasoning|-r)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        reasoning="$2"
        shift 2
        ;;
      --)
        shift
        task_parts+=("$@")
        break
        ;;
      -*)
        err "Unknown delegate option: $1"
        exit 2
        ;;
      *)
        task_parts+=("$1")
        shift
        ;;
    esac
  done

  model="$(normalize_deepseek_model "$model")" || {
    err "Invalid DeepSeek model. Use flash or pro."
    exit 2
  }
  reasoning="$(normalize_reasoning "$reasoning")" || {
    err "Invalid reasoning level. Use low, medium, high or max."
    exit 2
  }

  local task=""
  if [[ ${#task_parts[@]} -gt 0 ]]; then
    task="${task_parts[*]}"
  elif [[ ! -t 0 ]]; then
    task="$(cat)"
  fi

  if [[ -z "${task//[[:space:]]/}" ]]; then
    err "No delegated task supplied."
    exit 2
  fi

  local root api_key
  root="$(resolve_project_root)"
  api_key="$(read_api_key "$root" 2>/dev/null || true)"

  if [[ -z "$api_key" ]]; then
    err "DeepSeek API key not found."
    err "Expected: $(key_file_path "$root")"
    exit 3
  fi

  write_deepseek_config "$model" "$reasoning"

  local prompt
  prompt="$(cat <<EOF_PROMPT
You are an isolated DeepSeek coding worker.

The OpenAI/ChatGPT Codex environment is the main orchestrator.
Execute only the delegated task below.

Rules:
- Work only in the current project/worktree.
- Respect existing project instructions.
- Do not modify Codex/OpenAI provider configuration.
- Do not modify ~/.codex.
- Do not commit, push, reset, checkout, rebase or alter Git history.
- Preserve unrelated user changes.
- Run relevant checks when practical.
- End with a concise summary of changes and checks.

DELEGATED TASK:
$task
EOF_PROMPT
)"

  cd "$root"
  printf '%s\n' "$prompt" | \
    CODEX_HOME="$DEEPSEEK_CODEX_HOME" \
    DEEPSEEK_API_KEY="$api_key" \
    env -u CODEX_SQLITE_HOME \
      "$CODEX_BIN" exec \
        --model "$model" \
        -c "model_provider=\"deepseek\"" \
        -c "model_reasoning_effort=\"$reasoning\"" \
        --sandbox workspace-write \
        -c "approval_policy=\"never\"" \
        -
}

status() {
  local configured_model configured_provider

  say "$SCRIPT_NAME v$SCRIPT_VERSION"
  say "Codex config: $MAIN_CONFIG"
  say "Main GPT/OpenAI CODEX_HOME: $MAIN_CODEX_HOME"
  say "DeepSeek CODEX_HOME: $DEEPSEEK_CODEX_HOME"

  if [[ -f "$MAIN_CONFIG" ]]; then
    configured_model="$(awk 'BEGIN { top=1 } /^\[/ { top=0 } top && /^model[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]*#.*/, ""); gsub(/"/, ""); print; exit }' "$MAIN_CONFIG")"
    configured_provider="$(awk 'BEGIN { top=1 } /^\[/ { top=0 } top && /^model_provider[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]*#.*/, ""); gsub(/"/, ""); print; exit }' "$MAIN_CONFIG")"
    say "Configured model: ${configured_model:-default}"
    say "Configured provider: ${configured_provider:-openai}"
  else
    say "Configured model: default"
    say "Configured provider: openai"
  fi

  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex CLI: $CODEX_BIN"
    "$CODEX_BIN" --version 2>/dev/null || true
  else
    say "Codex CLI: NOT FOUND"
  fi

  if validate_isolation >/dev/null 2>&1; then
    say "Isolation: OK"
  else
    say "Isolation: INVALID"
  fi

  if [[ -f "$MAIN_CONFIG" ]] && grep -qF "$SWITCH_TAG" "$MAIN_CONFIG"; then
    say "Managed provider switch: DeepSeek"
  else
    say "Managed provider switch: OpenAI/GPT"
  fi
}

doctor() {
  local failed=0

  say "Codex GPT/DeepSeek switch doctor"

  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex CLI: OK ($CODEX_BIN)"
  else
    err "Codex CLI not found."
    failed=1
  fi

  if validate_isolation; then
    say "Home isolation: OK"
  else
    failed=1
  fi

  if [[ -n "${CODEX_HOME:-}" ]]; then
    warn "CODEX_HOME is exported in this shell: $CODEX_HOME"
    warn "This wrapper overrides it safely for each child process."
  else
    say "Global CODEX_HOME in shell: not set"
  fi

  if [[ -n "${CODEX_SQLITE_HOME:-}" ]]; then
    warn "CODEX_SQLITE_HOME is exported in this shell: $CODEX_SQLITE_HOME"
    warn "This wrapper removes it from child processes."
  else
    say "Global CODEX_SQLITE_HOME in shell: not set"
  fi

  if [[ -f "$MAIN_CONFIG" ]] &&
     grep -qiE 'model_provider[[:space:]]*=[[:space:]]*"deepseek"|\[model_providers\.deepseek\]' "$MAIN_CONFIG"; then
    if grep -qF "$SWITCH_TAG" "$MAIN_CONFIG"; then
      say "Main Codex provider: managed DeepSeek configuration"
    else
      warn "Unmanaged DeepSeek provider data found in $MAIN_CONFIG"
      failed=1
    fi
  else
    say "Main Codex provider: OpenAI/GPT"
  fi

  local root
  root="$(resolve_project_root)"
  if [[ -n "$(read_api_key "$root" 2>/dev/null || true)" ]]; then
    say "DeepSeek key: available"
  else
    warn "DeepSeek key not available at: $(key_file_path "$root")"
  fi

  if [[ "$failed" -eq 0 ]]; then
    say "Doctor result: READY"
  else
    say "Doctor result: ACTION REQUIRED"
    return 1
  fi
}

main() {
  local command="${1:-}"

  case "$command" in
    gpt|openai|chatgpt|app-gpt|app-openai)
      shift
      [[ $# -eq 0 ]] || { err "Use cli-gpt to pass Codex arguments."; exit 2; }
      configure_gpt
      ;;
    deepseek|ds|flash|deepseek-flash|app-deepseek|app-ds)
      shift
      [[ $# -eq 0 ]] || { err "Use cli-deepseek to pass Codex arguments."; exit 2; }
      configure_deepseek "deepseek-flash"
      ;;
    pro|deepseek-v4-pro|v4-pro|app-pro)
      shift
      [[ $# -eq 0 ]] || { err "Use cli-pro to pass Codex arguments."; exit 2; }
      configure_deepseek "deepseek-v4-pro"
      ;;
    cli-gpt)
      shift
      run_gpt "$@"
      ;;
    cli-deepseek|cli-ds|cli-flash)
      shift
      DEEPSEEK_RUN_MODEL="deepseek-flash" run_deepseek "$@"
      ;;
    cli-pro|cli-deepseek-v4-pro)
      shift
      DEEPSEEK_RUN_MODEL="deepseek-v4-pro" run_deepseek "$@"
      ;;
    delegate)
      shift
      delegate "$@"
      ;;
    status)
      status
      ;;
    doctor|check)
      doctor
      ;;
    version|--version)
      say "$SCRIPT_NAME $SCRIPT_VERSION"
      ;;
    help|-h|--help)
      usage
      ;;
    "")
      usage
      ;;
    *)
      err "Unknown command: $command"
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
