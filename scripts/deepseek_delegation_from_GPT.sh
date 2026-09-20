#!/usr/bin/env bash
set -euo pipefail

# deepseek_delegation_from_GPT.sh
# One-GUI delegation bridge: keep ChatGPT/Codex as the main orchestrator and
# delegate selected coding work to DeepSeek through an isolated Codex worker.
# API key is read from private/DeepSeek_key at the project root (or DEEPSEEK_API_KEY).
#
# DeepSeek models supported by the current API:
#   deepseek-flash
#   deepseek-v4-pro
#
# Reasoning levels supported by the DeepSeek Codex integration:
#   low, high, max
# Aliases accepted by this script include: light/leger, medium/moyen,
# elevated/eleve, maximum/ultra. DeepSeek maps medium -> high.

SCRIPT_NAME="deepseek_delegation_from_GPT"
SCRIPT_VERSION="2.1.0"

WORKER_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"
STATE_HOME="$WORKER_HOME/state"
SETTINGS_FILE="$WORKER_HOME/delegation.defaults"

DEFAULT_MODEL="deepseek-flash"
DEFAULT_REASONING="high"

KEY_FILE_REL="${DEEPSEEK_KEY_FILE_REL:-private/DeepSeek_key}"

# Prefer the standalone Codex CLI install over any stale copy earlier in PATH
# (e.g. an old global npm @openai/codex under /opt/homebrew/bin).
if [[ -n "${CODEX_BIN:-}" ]]; then
  :
elif [[ -x "$HOME/.local/bin/codex" ]]; then
  CODEX_BIN="$HOME/.local/bin/codex"
else
  CODEX_BIN="$(command -v codex 2>/dev/null || true)"
fi

RULE_START="<!-- ATOME_DEEPSEEK_DELEGATION_START -->"
RULE_END="<!-- ATOME_DEEPSEEK_DELEGATION_END -->"

say() { printf '%s\n' "$*"; }
err() { printf 'ERROR: %s\n' "$*" >&2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
deepseek_delegation_from_GPT.sh v2.1

FIRST INSTALLATION
  chmod +x scripts/deepseek_delegation_from_GPT.sh
  ./scripts/deepseek_delegation_from_GPT.sh setup

MAIN COMMANDS
  ./scripts/deepseek_delegation_from_GPT.sh setup [PROJECT_DIR]
  ./scripts/deepseek_delegation_from_GPT.sh run [options] "task"
  printf '%s\n' "task" | ./scripts/deepseek_delegation_from_GPT.sh run [options]
  ./scripts/deepseek_delegation_from_GPT.sh config [options]
  ./scripts/deepseek_delegation_from_GPT.sh status
  ./scripts/deepseek_delegation_from_GPT.sh doctor
  ./scripts/deepseek_delegation_from_GPT.sh key-check [PROJECT_DIR]
  ./scripts/deepseek_delegation_from_GPT.sh help

PER-TASK MODEL / INTELLIGENCE
  --model flash|pro|deepseek-flash|deepseek-v4-pro
  --level low|medium|high|max
  --intelligence <level>       Alias of --level
  --reasoning <level>          Alias of --level
  --preset fast|normal|strong|maximum
  --dry-run                    Show effective settings without calling DeepSeek

PRESETS
  fast       = deepseek-flash + low
  normal     = deepseek-flash + high
  strong     = deepseek-v4-pro + high
  maximum    = deepseek-v4-pro + max

EXAMPLES
  ./scripts/deepseek_delegation_from_GPT.sh run --level max "Implement the approved plan"
  ./scripts/deepseek_delegation_from_GPT.sh run --model pro --level max "Fix this difficult bug"
  ./scripts/deepseek_delegation_from_GPT.sh run --preset maximum "Implement the migration"

PERSISTENT DEFAULTS
  ./scripts/deepseek_delegation_from_GPT.sh config --model pro --level max
  ./scripts/deepseek_delegation_from_GPT.sh config --preset strong
  ./scripts/deepseek_delegation_from_GPT.sh config --reset
  ./scripts/deepseek_delegation_from_GPT.sh config --show

NOTES
  - "medium" / "moyen" is accepted but normalized to DeepSeek "high".
  - "xhigh" / "très élevé" is also normalized to DeepSeek "high"; "ultra" maps to "max".
  - Environment variables DEEPSEEK_MODEL and DEEPSEEK_REASONING override saved defaults.
  - API key is read from private/DeepSeek_key at the project root.
  - DEEPSEEK_API_KEY can override the file temporarily.
  - DEEPSEEK_KEY_FILE_REL can override the relative key-file path if needed.
USAGE
}

require_cmd() {
  if [[ "$1" == "codex" ]]; then
    [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]] && return 0
  fi
  command -v "$1" >/dev/null 2>&1 || {
    err "Required command not found: $1"
    if [[ "$1" == "codex" ]]; then
      err "Install or update Codex CLI, then run '$SCRIPT_NAME doctor'."
    fi
    exit 1
  }
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

normalize_model() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    flash|fast|v4-flash|deepseek-flash)
      printf '%s' "deepseek-flash"
      ;;
    pro|v4-pro|v4pro|deepseek-pro|deepseek-v4-pro)
      printf '%s' "deepseek-v4-pro"
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
      printf '%s' "low"
      ;;
    medium|moyen|normal|balanced|equilibre|équilibré|équilibre)
      # DeepSeek currently maps medium to high.
      printf '%s' "high"
      ;;
    high|xhigh|elevated|eleve|élevé|fort|strong|veryhigh|very-high|tres-eleve|très-élevé|"tres eleve"|"très élevé")
      printf '%s' "high"
      ;;
    max|maximum|ultra|expert)
      printf '%s' "max"
      ;;
    *)
      return 1
      ;;
  esac
}

preset_values() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    fast|rapide|light|leger|léger)
      printf '%s\t%s\n' "deepseek-flash" "low"
      ;;
    normal|default|standard)
      printf '%s\t%s\n' "deepseek-flash" "high"
      ;;
    strong|fort|advanced|avance|avancé)
      printf '%s\t%s\n' "deepseek-v4-pro" "high"
      ;;
    max|maximum|ultra|expert)
      printf '%s\t%s\n' "deepseek-v4-pro" "max"
      ;;
    *)
      return 1
      ;;
  esac
}

read_setting() {
  local key="$1"
  [[ -f "$SETTINGS_FILE" ]] || return 1
  awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$SETTINGS_FILE"
}

current_model() {
  local saved=""
  saved="$(read_setting model 2>/dev/null || true)"
  printf '%s' "${DEEPSEEK_MODEL:-${saved:-$DEFAULT_MODEL}}"
}

current_reasoning() {
  local saved=""
  saved="$(read_setting reasoning 2>/dev/null || true)"
  printf '%s' "${DEEPSEEK_REASONING:-${saved:-$DEFAULT_REASONING}}"
}

save_defaults() {
  local model="$1"
  local reasoning="$2"
  mkdir -p "$WORKER_HOME"
  chmod 700 "$WORKER_HOME" 2>/dev/null || true
  {
    printf 'model=%s\n' "$model"
    printf 'reasoning=%s\n' "$reasoning"
  } > "$SETTINGS_FILE"
  chmod 600 "$SETTINGS_FILE" 2>/dev/null || true
}

project_root() {
  local requested="${1:-}"
  if [[ -n "$requested" ]]; then
    (cd "$requested" 2>/dev/null && pwd)
    return
  fi
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
  else
    pwd
  fi
}

write_worker_config() {
  local model="$1"
  local reasoning="$2"

  mkdir -p "$WORKER_HOME" "$STATE_HOME"
  chmod 700 "$WORKER_HOME" "$STATE_HOME" 2>/dev/null || true

  cat > "$WORKER_HOME/config.toml" <<EOF_CONFIG
# Generated by atome/scripts/deepseek_delegation_from_GPT.sh v$SCRIPT_VERSION
# Isolated DeepSeek worker. The main ChatGPT/Codex GUI keeps its own CODEX_HOME.

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
env_key_instructions = "The wrapper loads private/DeepSeek_key from the project root, or uses DEEPSEEK_API_KEY"
request_max_retries = 4
stream_max_retries = 5
stream_idle_timeout_ms = 300000
EOF_CONFIG

  chmod 600 "$WORKER_HOME/config.toml" 2>/dev/null || true
}

key_file_path() {
  local root="$1"
  printf '%s/%s' "$root" "$KEY_FILE_REL"
}

read_api_key() {
  local root="$1"

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    printf '%s' "$DEEPSEEK_API_KEY"
    return 0
  fi

  local key_file key
  key_file="$(key_file_path "$root")"
  [[ -f "$key_file" ]] || return 1

  # Strip CR/LF only; preserve all other key characters exactly.
  key="$(tr -d '\r\n' < "$key_file")"
  key="$(trim "$key")"
  [[ -n "$key" ]] || return 1
  printf '%s' "$key"
}

check_key_file() {
  local root="$1"
  local key_file
  key_file="$(key_file_path "$root")"

  if [[ ! -f "$key_file" ]]; then
    err "DeepSeek key file not found: $key_file"
    err "Create it with the API key as its only content, then run: chmod 600 '$key_file'"
    return 1
  fi

  if [[ ! -s "$key_file" ]]; then
    err "DeepSeek key file is empty: $key_file"
    return 1
  fi

  if [[ -z "$(read_api_key "$root" 2>/dev/null || true)" ]]; then
    err "DeepSeek key file contains no usable key: $key_file"
    return 1
  fi

  # Best-effort permission hardening on macOS/Linux. Never print the key.
  chmod 600 "$key_file" 2>/dev/null || true
  say "DeepSeek API key file: OK ($key_file)"
}

render_agent_rules() {
  cat <<'EOF_RULES'
<!-- ATOME_DEEPSEEK_DELEGATION_START -->
## DeepSeek delegation

Keep the current ChatGPT/Codex model as the main orchestrator. Delegate to DeepSeek only when the user explicitly requests it.

Delegation command:

    printf '%s\n' "<self-contained task + plan + constraints>" | ./scripts/deepseek_delegation_from_GPT.sh run [options]

Translate the user's requested DeepSeek intelligence level as follows:
- "léger", "faible", "low" -> `--level low`
- "moyen", "medium" -> `--level high` (DeepSeek maps medium to high)
- "élevé", "fort", "high" -> `--level high`
- "maximum", "max", "ultra" -> `--level max`

Translate model requests as follows:
- "DeepSeek Flash" -> `--model flash`
- "DeepSeek Pro" -> `--model pro`

Convenient presets:
- "DeepSeek rapide" -> `--preset fast`
- "DeepSeek normal" -> `--preset normal`
- "DeepSeek fort" -> `--preset strong`
- "DeepSeek maximum" -> `--preset maximum`

If no level/model is requested, use the script's saved defaults.

Procedure:
1. Build a self-contained delegation prompt containing the user's task, relevant approved plan, constraints, and file scope.
2. Invoke the script from the project root with the appropriate flags.
3. Wait for completion in the current turn.
4. Inspect DeepSeek's modifications/diff yourself.
5. Run relevant checks when practical.
6. Report the result and any verification issue in the same Codex conversation.

Do not switch the main GUI conversation away from ChatGPT/OpenAI. DeepSeek is a delegated worker only.
Do not delegate unless the user explicitly requests DeepSeek or the active project instructions explicitly require it.
<!-- ATOME_DEEPSEEK_DELEGATION_END -->
EOF_RULES
}

install_agent_rules() {
  local root="$1"
  local agents="$root/.codex/AGENTS.md"
  local tmp

  mkdir -p "$root/.codex"
  [[ -f "$agents" ]] || touch "$agents"
  tmp="$(mktemp "${TMPDIR:-/tmp}/atome-agents.XXXXXX")"

  # Remove any previous version of our managed block while preserving all
  # unrelated user/project instructions.
  awk -v start="$RULE_START" -v end="$RULE_END" '
    $0 == start {skip=1; next}
    $0 == end {skip=0; next}
    !skip {print}
  ' "$agents" > "$tmp"

  # Avoid accumulating excessive blank lines before appending the managed block.
  printf '\n' >> "$tmp"
  render_agent_rules >> "$tmp"
  printf '\n' >> "$tmp"

  mv "$tmp" "$agents"
  say "DeepSeek delegation rules installed/updated in $agents"
}

setup() {
  require_cmd codex
  require_cmd git

  local root model reasoning
  root="$(project_root "${1:-}")"
  model="$(normalize_model "$(current_model)")" || {
    err "Invalid configured model: $(current_model)"
    exit 2
  }
  reasoning="$(normalize_reasoning "$(current_reasoning)")" || {
    err "Invalid configured reasoning level: $(current_reasoning)"
    exit 2
  }

  save_defaults "$model" "$reasoning"
  write_worker_config "$model" "$reasoning"

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: using DEEPSEEK_API_KEY override."
  else
    check_key_file "$root" || exit 3
  fi

  install_agent_rules "$root"

  say ""
  say "Setup complete."
  say "Project: $root"
  say "Worker CODEX_HOME: $WORKER_HOME"
  say "DeepSeek key file: $(key_file_path "$root")"
  say "Default model: $model"
  say "Default intelligence: $reasoning"
  say ""
  say "Recommended check:"
  say "  $0 doctor"
  say ""
  say "Non-destructive API test:"
  say "  $0 run --level low 'Inspect the project structure. Do not modify files.'"
}

build_prompt() {
  local task="$1"
  local model="$2"
  local reasoning="$3"

  cat <<EOF_PROMPT
You are the delegated DeepSeek coding worker for the atome project.

The main ChatGPT/Codex agent remains the orchestrator. Execute ONLY the delegated task below.

Worker configuration for this task:
- model: $model
- reasoning effort: $reasoning

Rules:
- Work in the current project/worktree only.
- Read and obey the project's existing instructions before editing.
- Preserve existing architecture and conventions unless the delegated task explicitly requires a change.
- Make the requested code/file changes directly when implementation is requested.
- Run relevant local checks/tests when practical.
- Do not ask the user questions. If something is ambiguous, choose the safest reasonable implementation and document the assumption.
- Do not commit, push, reset, checkout, rebase, or alter git history.
- Do not overwrite unrelated user changes.
- At the end, return a concise summary of files changed, work performed, checks run, and any remaining issue.

DELEGATED TASK FROM CHATGPT/CODEX:
$task
EOF_PROMPT
}

apply_preset() {
  local preset="$1"
  local values
  values="$(preset_values "$preset")" || {
    err "Unknown preset '$preset'. Use: fast, normal, strong, maximum."
    return 1
  }
  SELECTED_MODEL="${values%%$'\t'*}"
  SELECTED_REASONING="${values#*$'\t'}"
}

run_delegate() {
  local selected_model selected_reasoning
  selected_model="$(current_model)"
  selected_reasoning="$(current_reasoning)"

  local dry_run=0
  local -a task_parts=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --model|-m)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        selected_model="$2"
        shift 2
        ;;
      --level|--reasoning|--intelligence|-r)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        selected_reasoning="$2"
        shift 2
        ;;
      --preset|-p)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        SELECTED_MODEL=""
        SELECTED_REASONING=""
        apply_preset "$2"
        selected_model="$SELECTED_MODEL"
        selected_reasoning="$SELECTED_REASONING"
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --)
        shift
        task_parts+=("$@")
        break
        ;;
      -* )
        err "Unknown run option: $1"
        exit 2
        ;;
      *)
        task_parts+=("$1")
        shift
        ;;
    esac
  done

  selected_model="$(normalize_model "$selected_model")" || {
    err "Invalid model. Use flash or pro."
    exit 2
  }
  selected_reasoning="$(normalize_reasoning "$selected_reasoning")" || {
    err "Invalid intelligence level. Use low, medium, high, or max."
    exit 2
  }

  local task=""
  if [[ ${#task_parts[@]} -gt 0 ]]; then
    task="${task_parts[*]}"
  elif [[ ! -t 0 ]]; then
    task="$(cat)"
  fi

  if [[ -z "${task//[[:space:]]/}" ]]; then
    err "No task supplied. Pass a task as an argument or through stdin."
    exit 2
  fi

  local root
  root="$(project_root)"

  if [[ "$dry_run" -eq 1 ]]; then
    say "DeepSeek delegation dry-run"
    say "Project: $root"
    say "Model: $selected_model"
    say "Intelligence: $selected_reasoning"
    say "Task: $task"
    return 0
  fi

  require_cmd codex

  # Keep a valid worker config on disk for diagnostics/default behavior. The
  # per-task CLI overrides below are authoritative, so concurrent runs do not
  # need to rewrite configuration to change model/intelligence.
  write_worker_config "$(normalize_model "$(current_model)")" "$(normalize_reasoning "$(current_reasoning)")"

  local api_key
  api_key="$(read_api_key "$root" 2>/dev/null || true)"
  if [[ -z "$api_key" ]]; then
    err "DeepSeek API key not available."
    err "Expected: $(key_file_path "$root")"
    err "Put the key in that file (single line) and run: chmod 600 '$(key_file_path "$root")'"
    exit 3
  fi

  local prompt
  prompt="$(build_prompt "$task" "$selected_model" "$selected_reasoning")"

  cd "$root"

  # The isolated CODEX_HOME prevents the worker from colliding with the main
  # ChatGPT/Codex GUI state. stdout is preserved so the parent agent receives
  # DeepSeek's final response directly.
  printf '%s\n' "$prompt" | \
    CODEX_HOME="$WORKER_HOME" \
    CODEX_SQLITE_HOME="$STATE_HOME" \
    DEEPSEEK_API_KEY="$api_key" \
    "$CODEX_BIN" exec \
      --model "$selected_model" \
      -c "model_reasoning_effort=\"$selected_reasoning\"" \
      --sandbox workspace-write \
      -c "approval_policy=\"never\"" \
      -
}

config_defaults() {
  local selected_model selected_reasoning
  selected_model="$(current_model)"
  selected_reasoning="$(current_reasoning)"

  if [[ $# -eq 0 || "${1:-}" == "--show" || "${1:-}" == "show" ]]; then
    selected_model="$(normalize_model "$selected_model")" || selected_model="$DEFAULT_MODEL"
    selected_reasoning="$(normalize_reasoning "$selected_reasoning")" || selected_reasoning="$DEFAULT_REASONING"
    say "Saved/effective DeepSeek defaults"
    say "Model: $selected_model"
    say "Intelligence: $selected_reasoning"
    say "Settings file: $SETTINGS_FILE"
    return 0
  fi

  if [[ "${1:-}" == "--reset" || "${1:-}" == "reset" ]]; then
    selected_model="$DEFAULT_MODEL"
    selected_reasoning="$DEFAULT_REASONING"
    save_defaults "$selected_model" "$selected_reasoning"
    write_worker_config "$selected_model" "$selected_reasoning"
    say "Defaults reset: $selected_model + $selected_reasoning"
    return 0
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --model|-m)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        selected_model="$2"
        shift 2
        ;;
      --level|--reasoning|--intelligence|-r)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        selected_reasoning="$2"
        shift 2
        ;;
      --preset|-p)
        [[ $# -ge 2 ]] || { err "$1 requires a value."; exit 2; }
        SELECTED_MODEL=""
        SELECTED_REASONING=""
        apply_preset "$2"
        selected_model="$SELECTED_MODEL"
        selected_reasoning="$SELECTED_REASONING"
        shift 2
        ;;
      *)
        err "Unknown config option: $1"
        exit 2
        ;;
    esac
  done

  selected_model="$(normalize_model "$selected_model")" || {
    err "Invalid model. Use flash or pro."
    exit 2
  }
  selected_reasoning="$(normalize_reasoning "$selected_reasoning")" || {
    err "Invalid intelligence level. Use low, medium, high, or max."
    exit 2
  }

  save_defaults "$selected_model" "$selected_reasoning"
  write_worker_config "$selected_model" "$selected_reasoning"
  say "Defaults saved."
  say "Model: $selected_model"
  say "Intelligence: $selected_reasoning"
}

version_ge() {
  # Returns success when version $1 >= version $2. Ignores suffixes.
  local have="${1%%[^0-9.]*}"
  local need="${2%%[^0-9.]*}"
  local IFS=.
  local -a h=($have) n=($need)
  local i hv nv
  for i in 0 1 2; do
    hv="${h[$i]:-0}"
    nv="${n[$i]:-0}"
    ((10#$hv > 10#$nv)) && return 0
    ((10#$hv < 10#$nv)) && return 1
  done
  return 0
}

codex_version_number() {
  local raw=""
  raw="$("$CODEX_BIN" --version 2>/dev/null || true)"
  printf '%s\n' "$raw" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+\.[0-9]+/) {print $i; exit}}' | sed 's/[^0-9.].*$//'
}

status() {
  local model reasoning
  model="$(normalize_model "$(current_model)" 2>/dev/null || printf '%s' "$(current_model)")"
  reasoning="$(normalize_reasoning "$(current_reasoning)" 2>/dev/null || printf '%s' "$(current_reasoning)")"

  say "deepseek_delegation_from_GPT v$SCRIPT_VERSION"
  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex CLI: OK ($CODEX_BIN)"
  else
    say "Codex CLI: MISSING"
  fi

  if [[ -f "$WORKER_HOME/config.toml" ]]; then
    say "Worker config: OK ($WORKER_HOME/config.toml)"
  else
    say "Worker config: not created yet (run setup)"
  fi

  local root
  root="$(project_root 2>/dev/null || pwd)"
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: configured via DEEPSEEK_API_KEY"
  elif [[ -n "$(read_api_key "$root" 2>/dev/null || true)" ]]; then
    say "DeepSeek API key: configured ($(key_file_path "$root"))"
  else
    say "DeepSeek API key: not configured (expected $(key_file_path "$root"))"
  fi

  say "Default model: $model"
  say "Default intelligence: $reasoning"
  say "Worker CODEX_HOME: $WORKER_HOME"
}

doctor() {
  local failed=0
  say "DeepSeek delegation doctor"

  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex binary: $CODEX_BIN"
    local cv
    cv="$(codex_version_number)"
    if [[ -n "$cv" ]]; then
      say "Codex CLI version: $cv"
      if version_ge "$cv" "0.144.0"; then
        say "Codex compatibility: OK (>= 0.144.0)"
      else
        warn "Codex $cv is older than the DeepSeek integration's documented minimum 0.144.0. Update Codex."
        failed=1
      fi
    else
      warn "Could not parse Codex CLI version."
    fi
  else
    err "Codex CLI: MISSING"
    failed=1
  fi

  if command -v git >/dev/null 2>&1; then
    say "git: OK"
  else
    err "git: MISSING"
    failed=1
  fi

  if [[ -d "$WORKER_HOME" ]]; then
    say "Worker home: OK ($WORKER_HOME)"
  else
    warn "Worker home not created yet. Run setup."
    failed=1
  fi

  if [[ -f "$WORKER_HOME/config.toml" ]]; then
    say "Worker config: OK"
  else
    warn "Worker config missing. Run setup."
    failed=1
  fi

  local model reasoning
  model="$(normalize_model "$(current_model)" 2>/dev/null || true)"
  reasoning="$(normalize_reasoning "$(current_reasoning)" 2>/dev/null || true)"

  if [[ -n "$model" ]]; then
    say "Default model: $model"
  else
    err "Invalid default model: $(current_model)"
    failed=1
  fi

  if [[ -n "$reasoning" ]]; then
    say "Default intelligence: $reasoning"
  else
    err "Invalid default intelligence: $(current_reasoning)"
    failed=1
  fi

  local root
  root="$(project_root 2>/dev/null || pwd)"
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: configured via DEEPSEEK_API_KEY"
  elif check_key_file "$root" >/dev/null 2>&1; then
    say "DeepSeek API key: configured ($(key_file_path "$root"))"
  else
    warn "DeepSeek API key: not configured; expected $(key_file_path "$root")"
    failed=1
  fi

  if [[ "$failed" -eq 0 ]]; then
    say "Doctor result: READY"
  else
    say "Doctor result: ACTION REQUIRED"
    return 1
  fi
}

main() {
  local command="${1:-help}"
  case "$command" in
    setup)
      shift
      setup "${1:-}"
      ;;
    run|delegate)
      shift
      run_delegate "$@"
      ;;
    config|defaults)
      shift
      config_defaults "$@"
      ;;
    key|key-check|check-key)
      shift
      check_key_file "$(project_root "${1:-}")"
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
    *)
      # Convenience: any unknown first argument is treated as the task itself.
      run_delegate "$@"
      ;;
  esac
}

main "$@"
