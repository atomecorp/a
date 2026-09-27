#!/usr/bin/env bash
set -euo pipefail
umask 077

# codex_switch_gpt_deepseek.sh
#
# Safe GPT <-> DeepSeek switch for Codex CLI.
#
# Design:
#   - GPT/OpenAI always uses the normal main Codex home: ~/.codex
#   - DeepSeek always uses a separate home: ~/.codex-deepseek-worker
#   - The script NEVER rewrites ~/.codex/config.toml
#   - The script NEVER rewrites ~/.codex/AGENTS.md
#   - No provider/model setting is copied from DeepSeek into the GPT side
#   - The selected wrapper mode is stored outside both Codex homes
#
# This avoids the local-state collision that can make the OpenAI model picker
# behave differently on one Mac from another.
#
# DeepSeek key:
#   1) DEEPSEEK_API_KEY environment variable, or
#   2) <project>/private/DeepSeek_key
#
# Usage examples:
#   ./codex_switch_gpt_deepseek.sh mode gpt
#   ./codex_switch_gpt_deepseek.sh mode deepseek
#   ./codex_switch_gpt_deepseek.sh
#   ./codex_switch_gpt_deepseek.sh gpt
#   ./codex_switch_gpt_deepseek.sh deepseek
#   ./codex_switch_gpt_deepseek.sh delegate "Fix this bug"
#   ./codex_switch_gpt_deepseek.sh status
#   ./codex_switch_gpt_deepseek.sh doctor
#
# IMPORTANT:
# This switches only the Codex CLI launched through this wrapper.
# It does NOT rewrite the ChatGPT/Codex desktop application's provider config.

SCRIPT_NAME="codex_switch_gpt_deepseek"
SCRIPT_VERSION="4.0.0"

MAIN_CODEX_HOME="${MAIN_CODEX_HOME:-$HOME/.codex}"
DEEPSEEK_CODEX_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"
SWITCH_HOME="${CODEX_SWITCH_HOME:-$HOME/.codex-provider-switch}"
MODE_FILE="$SWITCH_HOME/mode"
KEY_FILE_REL="${DEEPSEEK_KEY_FILE_REL:-private/DeepSeek_key}"

DEFAULT_DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-flash}"
DEFAULT_DEEPSEEK_REASONING="${DEEPSEEK_REASONING:-high}"

if [[ -n "${CODEX_BIN:-}" ]]; then
  :
else
  CODEX_BIN="$(command -v codex 2>/dev/null || true)"
fi

say()  { printf '%s\n' "$*"; }
err()  { printf 'ERROR: %s\n' "$*" >&2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
codex_switch_gpt_deepseek.sh v4.0

SAFE SWITCH
  ./codex_switch_gpt_deepseek.sh mode gpt
  ./codex_switch_gpt_deepseek.sh mode deepseek

RUN CURRENT MODE
  ./codex_switch_gpt_deepseek.sh
  ./codex_switch_gpt_deepseek.sh -- <codex arguments>

RUN ONE MODE WITHOUT CHANGING SAVED MODE
  ./codex_switch_gpt_deepseek.sh gpt [codex arguments]
  ./codex_switch_gpt_deepseek.sh deepseek [codex arguments]

DELEGATE ONE TASK TO DEEPSEEK
  ./codex_switch_gpt_deepseek.sh delegate "task"
  printf '%s\n' "task" | ./codex_switch_gpt_deepseek.sh delegate

DIAGNOSTICS
  ./codex_switch_gpt_deepseek.sh status
  ./codex_switch_gpt_deepseek.sh doctor
  ./codex_switch_gpt_deepseek.sh reset-mode
  ./codex_switch_gpt_deepseek.sh version

DEEPSEEK PER-TASK OPTIONS
  delegate --model flash|pro "task"
  delegate --level low|medium|high|max "task"

NOTES
  - GPT mode uses ~/.codex and does not force a model.
  - DeepSeek mode uses ~/.codex-deepseek-worker.
  - The main ~/.codex config is never rewritten by this script.
  - The saved switch mode lives in ~/.codex-provider-switch/mode.
USAGE
}

require_codex() {
  if [[ -z "$CODEX_BIN" || ! -x "$CODEX_BIN" ]]; then
    err "Codex CLI not found in PATH."
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
  local main worker switch
  main="$(normalized_path "$MAIN_CODEX_HOME")"
  worker="$(normalized_path "$DEEPSEEK_CODEX_HOME")"
  switch="$(normalized_path "$SWITCH_HOME")"

  if [[ "$worker" == "$main" || "$worker" == "$main/"* ]]; then
    err "Unsafe DEEPSEEK_CODEX_HOME: $DEEPSEEK_CODEX_HOME"
    err "It must not be ~/.codex or a directory inside ~/.codex."
    return 1
  fi

  if [[ "$main" == "$worker/"* ]]; then
    err "Unsafe homes: main Codex home is nested inside the DeepSeek home."
    return 1
  fi

  if [[ "$switch" == "$main" || "$switch" == "$main/"* ||
        "$switch" == "$worker" || "$switch" == "$worker/"* ]]; then
    err "Unsafe CODEX_SWITCH_HOME: $SWITCH_HOME"
    err "Switch state must be outside both Codex homes."
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

current_mode() {
  if [[ -f "$MODE_FILE" ]]; then
    local mode
    mode="$(tr -d '[:space:]' < "$MODE_FILE")"
    case "$mode" in
      gpt|deepseek)
        printf '%s\n' "$mode"
        return
        ;;
    esac
  fi
  printf '%s\n' "gpt"
}

save_mode() {
  local mode="$1"
  validate_isolation || exit 4

  case "$mode" in
    gpt|deepseek) ;;
    *)
      err "Unknown mode: $mode"
      exit 2
      ;;
  esac

  mkdir -p "$SWITCH_HOME"
  chmod 700 "$SWITCH_HOME" 2>/dev/null || true
  printf '%s\n' "$mode" > "$MODE_FILE"
  chmod 600 "$MODE_FILE" 2>/dev/null || true
  say "Saved mode: $mode"
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
  model="$(normalize_deepseek_model "$DEFAULT_DEEPSEEK_MODEL")" || {
    err "Invalid DeepSeek model: $DEFAULT_DEEPSEEK_MODEL"
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
  local mode
  mode="$(current_mode)"

  say "$SCRIPT_NAME v$SCRIPT_VERSION"
  say "Saved wrapper mode: $mode"
  say "Main GPT/OpenAI CODEX_HOME: $MAIN_CODEX_HOME"
  say "DeepSeek CODEX_HOME: $DEEPSEEK_CODEX_HOME"
  say "Switch state: $SWITCH_HOME"

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

  if [[ -f "$MAIN_CODEX_HOME/config.toml" ]]; then
    if grep -qiE 'deepseek|api\.deepseek\.com' "$MAIN_CODEX_HOME/config.toml"; then
      warn "DeepSeek text still exists in MAIN config: $MAIN_CODEX_HOME/config.toml"
    else
      say "Main config: no obvious DeepSeek entry"
    fi
  else
    say "Main config: absent/clean initial state"
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

  if [[ -f "$MAIN_CODEX_HOME/config.toml" ]] &&
     grep -qiE 'model_provider[[:space:]]*=[[:space:]]*"deepseek"|api\.deepseek\.com|\[model_providers\.deepseek\]' "$MAIN_CODEX_HOME/config.toml"; then
    warn "DeepSeek provider data found in MAIN Codex config."
    warn "Run the separate hard-reset script before using this switch."
    failed=1
  else
    say "Main Codex provider contamination: not detected"
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
  local mode

  case "$command" in
    mode|switch)
      shift
      [[ $# -ge 1 ]] || {
        say "Current mode: $(current_mode)"
        exit 0
      }
      save_mode "$1"
      ;;
    gpt|openai|chatgpt)
      shift
      run_gpt "$@"
      ;;
    deepseek|ds)
      shift
      run_deepseek "$@"
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
    reset-mode)
      rm -f "$MODE_FILE"
      say "Saved mode removed. Default is now GPT."
      ;;
    version|--version)
      say "$SCRIPT_NAME $SCRIPT_VERSION"
      ;;
    help|-h|--help)
      usage
      ;;
    --)
      shift
      mode="$(current_mode)"
      if [[ "$mode" == "deepseek" ]]; then
        run_deepseek "$@"
      else
        run_gpt "$@"
      fi
      ;;
    "")
      mode="$(current_mode)"
      if [[ "$mode" == "deepseek" ]]; then
        run_deepseek
      else
        run_gpt
      fi
      ;;
    *)
      # Any other arguments are passed to Codex using the saved wrapper mode.
      mode="$(current_mode)"
      if [[ "$mode" == "deepseek" ]]; then
        run_deepseek "$@"
      else
        run_gpt "$@"
      fi
      ;;
  esac
}

main "$@"
