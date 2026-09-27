#!/usr/bin/env bash
set -euo pipefail
umask 077

# deepseek_delegation_from_GPT.sh
#
# Safe delegation bridge:
#   - ChatGPT/OpenAI Codex remains the main orchestrator.
#   - DeepSeek runs only as an isolated Codex CLI worker.
#   - The worker NEVER writes to the main ~/.codex configuration.
#   - No AGENTS.md file is modified unless install-rules is called explicitly.
#
# The DeepSeek API key is read from:
#   <project>/private/DeepSeek_key
# or from DEEPSEEK_API_KEY for a temporary override.
#
# Current DeepSeek API model ids accepted by this wrapper:
#   deepseek-flash
#   deepseek-v4-pro
#
# Note (2026-09): DeepSeek currently routes deepseek-v4-pro requests to the
# current Flash generation while its next Pro model is being prepared. The id
# is kept here for compatibility with existing workflows.

SCRIPT_NAME="deepseek_delegation_from_GPT"
SCRIPT_VERSION="3.0.0"

DEFAULT_MODEL="deepseek-flash"
DEFAULT_REASONING="high"
MIN_CODEX_VERSION="0.144.0"

KEY_FILE_REL="${DEEPSEEK_KEY_FILE_REL:-private/DeepSeek_key}"

# Main Codex home is used ONLY for diagnostics/safety checks. This script never
# writes its config there.
MAIN_CODEX_HOME="${MAIN_CODEX_HOME:-$HOME/.codex}"

# DeepSeek gets its own independent Codex home.
WORKER_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"
SETTINGS_FILE="$WORKER_HOME/delegation.defaults"

# Prefer the Codex executable selected by the current PATH. A custom binary can
# still be provided explicitly with CODEX_BIN=/path/to/codex.
if [[ -n "${CODEX_BIN:-}" ]]; then
  :
else
  CODEX_BIN="$(command -v codex 2>/dev/null || true)"
fi

RULE_START="<!-- ATOME_DEEPSEEK_DELEGATION_START -->"
RULE_END="<!-- ATOME_DEEPSEEK_DELEGATION_END -->"

say()  { printf '%s\n' "$*"; }
err()  { printf 'ERROR: %s\n' "$*" >&2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
deepseek_delegation_from_GPT.sh v3.0

SAFE FIRST INSTALLATION
  chmod +x scripts/deepseek_delegation_from_GPT.sh
  ./scripts/deepseek_delegation_from_GPT.sh setup

MAIN COMMANDS
  ./scripts/deepseek_delegation_from_GPT.sh setup [PROJECT_DIR]
  ./scripts/deepseek_delegation_from_GPT.sh run [options] "task"
  printf '%s\n' "task" | ./scripts/deepseek_delegation_from_GPT.sh run [options]
  ./scripts/deepseek_delegation_from_GPT.sh config [options]
  ./scripts/deepseek_delegation_from_GPT.sh status
  ./scripts/deepseek_delegation_from_GPT.sh doctor
  ./scripts/deepseek_delegation_from_GPT.sh main-check
  ./scripts/deepseek_delegation_from_GPT.sh key-check [PROJECT_DIR]

OPTIONAL PROJECT INSTRUCTIONS
  ./scripts/deepseek_delegation_from_GPT.sh install-rules [PROJECT_DIR]
  ./scripts/deepseek_delegation_from_GPT.sh remove-rules [PROJECT_DIR]
  ./scripts/deepseek_delegation_from_GPT.sh legacy-cleanup [PROJECT_DIR]

IMPORTANT
  setup does NOT modify ~/.codex/config.toml, ~/.codex/models.json or AGENTS.md.
  DeepSeek is launched with an isolated CODEX_HOME.
  The script refuses to use ~/.codex, any path inside ~/.codex, or the current
  project's .codex directory as the DeepSeek worker home.

PER-TASK MODEL / INTELLIGENCE
  --model flash|pro|deepseek-flash|deepseek-v4-pro
  --level low|medium|high|max
  --intelligence <level>       Alias of --level
  --reasoning <level>          Alias of --level
  --preset fast|normal|strong|maximum
  --project DIR                Explicit project directory
  --dry-run                    Show settings without calling DeepSeek

PRESETS
  fast       = deepseek-flash + low
  normal     = deepseek-flash + high
  strong     = deepseek-v4-pro + high
  maximum    = deepseek-v4-pro + max

PERSISTENT DEFAULTS
  ./scripts/deepseek_delegation_from_GPT.sh config --model flash --level high
  ./scripts/deepseek_delegation_from_GPT.sh config --preset maximum
  ./scripts/deepseek_delegation_from_GPT.sh config --reset
  ./scripts/deepseek_delegation_from_GPT.sh config --show

ENVIRONMENT OVERRIDES
  DEEPSEEK_API_KEY             Temporary API key override
  DEEPSEEK_MODEL               Temporary model override
  DEEPSEEK_REASONING           Temporary reasoning override
  DEEPSEEK_CODEX_HOME          Worker home override (safety checked)
  DEEPSEEK_KEY_FILE_REL        Key path relative to project root
  CODEX_BIN                    Explicit Codex CLI executable
  MAIN_CODEX_HOME              Main Codex home for diagnostics only
  DEEPSEEK_ALLOW_NON_GIT=1     Allow an explicit/current non-Git project dir

NOTES
  - medium/moyen is normalized to high for DeepSeek.
  - xhigh/très élevé is normalized to high; ultra maps to max.
  - The API key is never printed.
  - No command in this script repairs or rewrites the main Codex config.
USAGE
}

require_cmd() {
  local cmd="$1"
  if [[ "$cmd" == "codex" ]]; then
    if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
      return 0
    fi
    err "Codex CLI not found."
    err "Install/update Codex CLI, or set CODEX_BIN=/absolute/path/to/codex."
    exit 1
  fi

  command -v "$cmd" >/dev/null 2>&1 || {
    err "Required command not found: $cmd"
    exit 1
  }
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Resolve as much of a path as possible without requiring realpath/python.
# Parent directories used by this script normally already exist ($HOME).
normalized_path() {
  local p="$1"
  local parent base

  case "$p" in
    /*) ;;
    *) p="$PWD/$p" ;;
  esac

  if [[ -d "$p" ]]; then
    (cd "$p" 2>/dev/null && pwd -P) || printf '%s' "$p"
    return
  fi

  parent="$(dirname "$p")"
  base="$(basename "$p")"
  if [[ -d "$parent" ]]; then
    (cd "$parent" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$base") || printf '%s' "$p"
  else
    printf '%s' "$p"
  fi
}

validate_worker_home() {
  local project_root_arg="${1:-}"
  local worker main project_codex

  worker="$(normalized_path "$WORKER_HOME")"
  main="$(normalized_path "$MAIN_CODEX_HOME")"

  if [[ "$worker" == "$main" || "$worker" == "$main/"* ]]; then
    err "Unsafe DEEPSEEK_CODEX_HOME: $WORKER_HOME"
    err "The DeepSeek worker cannot use the main Codex home or a path inside it: $MAIN_CODEX_HOME"
    return 1
  fi

  # A directory literally named .codex may be consumed as Codex configuration.
  if [[ "$(basename "$worker")" == ".codex" ]]; then
    err "Unsafe worker home: $WORKER_HOME"
    err "Do not use a directory named .codex for the DeepSeek worker."
    return 1
  fi

  if [[ -n "$project_root_arg" ]]; then
    project_codex="$(normalized_path "$project_root_arg/.codex")"
    if [[ "$worker" == "$project_codex" || "$worker" == "$project_codex/"* ]]; then
      err "Unsafe worker home: $WORKER_HOME"
      err "It collides with the project's Codex configuration: $project_root_arg/.codex"
      return 1
    fi
  fi

  return 0
}

normalize_model() {
  local raw
  raw="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    flash|fast|v4.1-flash|v41-flash|deepseek-flash)
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

atomic_write() {
  # Usage: producer | atomic_write /path/to/file
  local target="$1"
  local dir tmp
  dir="$(dirname "$target")"
  mkdir -p "$dir"
  chmod 700 "$dir" 2>/dev/null || true
  tmp="$(mktemp "$dir/.${SCRIPT_NAME}.tmp.XXXXXX")"
  cat > "$tmp"
  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$target"
}

save_defaults() {
  local model="$1"
  local reasoning="$2"
  validate_worker_home "" || exit 4
  {
    printf 'model=%s\n' "$model"
    printf 'reasoning=%s\n' "$reasoning"
  } | atomic_write "$SETTINGS_FILE"
}

resolve_project_root() {
  local requested="${1:-}"
  local candidate=""

  if [[ -n "$requested" ]]; then
    [[ -d "$requested" ]] || {
      err "Project directory does not exist: $requested"
      return 1
    }
    candidate="$(cd "$requested" 2>/dev/null && pwd -P)" || return 1
  else
    candidate="$PWD"
  fi

  if git -C "$candidate" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$candidate" rev-parse --show-toplevel
    return 0
  fi

  if [[ "${DEEPSEEK_ALLOW_NON_GIT:-0}" == "1" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  err "Not inside a Git repository: $candidate"
  err "Run from the project repository, pass PROJECT_DIR, or set DEEPSEEK_ALLOW_NON_GIT=1 intentionally."
  return 1
}

write_worker_config() {
  local model="$1"
  local reasoning="$2"
  local project_root_arg="${3:-}"

  validate_worker_home "$project_root_arg" || exit 4
  mkdir -p "$WORKER_HOME"
  chmod 700 "$WORKER_HOME" 2>/dev/null || true

  cat <<EOF_CONFIG | atomic_write "$WORKER_HOME/config.toml"
# Generated by $SCRIPT_NAME v$SCRIPT_VERSION
# ISOLATED DeepSeek worker config. Do not copy this file to ~/.codex.

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
env_key_instructions = "Set DEEPSEEK_API_KEY; this wrapper injects it only into the worker process."
request_max_retries = 4
stream_max_retries = 5
stream_idle_timeout_ms = 300000
EOF_CONFIG
}

key_file_path() {
  local root="$1"
  case "$KEY_FILE_REL" in
    /*) printf '%s' "$KEY_FILE_REL" ;;
    *)  printf '%s/%s' "$root" "$KEY_FILE_REL" ;;
  esac
}

read_api_key() {
  local root="$1"
  local key_file key

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    printf '%s' "$DEEPSEEK_API_KEY"
    return 0
  fi

  key_file="$(key_file_path "$root")"
  [[ -f "$key_file" ]] || return 1

  key="$(tr -d '\r\n' < "$key_file")"
  key="$(trim "$key")"
  [[ -n "$key" ]] || return 1
  printf '%s' "$key"
}

check_key_file() {
  local root="$1"
  local key_file
  key_file="$(key_file_path "$root")"

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: using DEEPSEEK_API_KEY override."
    return 0
  fi

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

  chmod 600 "$key_file" 2>/dev/null || true
  say "DeepSeek API key file: OK ($key_file)"
}

render_agent_rules() {
  cat <<'EOF_RULES'
<!-- ATOME_DEEPSEEK_DELEGATION_START -->
## DeepSeek delegation

Keep ChatGPT/OpenAI Codex as the main orchestrator. Use DeepSeek only as a delegated worker and only when requested by the user or by explicit project instructions.

Delegation command:

    printf '%s\n' "<self-contained task + plan + constraints>" | ./scripts/deepseek_delegation_from_GPT.sh run [options]

Levels:
- low / léger -> `--level low`
- medium / moyen -> `--level high`
- high / élevé -> `--level high`
- max / maximum / ultra -> `--level max`

Models:
- DeepSeek Flash -> `--model flash`
- DeepSeek Pro -> `--model pro`

After delegation, inspect the resulting diff and run relevant checks before reporting completion.
Do not switch or rewrite the main Codex provider/configuration to DeepSeek.
<!-- ATOME_DEEPSEEK_DELEGATION_END -->
EOF_RULES
}

strip_managed_rules_file() {
  local file="$1"
  local tmp
  [[ -f "$file" ]] || return 0

  tmp="$(mktemp "$(dirname "$file")/.${SCRIPT_NAME}.rules.XXXXXX")"
  awk -v start="$RULE_START" -v end="$RULE_END" '
    $0 == start {skip=1; next}
    $0 == end   {skip=0; next}
    !skip       {print}
  ' "$file" > "$tmp"

  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$file"
}

install_agent_rules() {
  local root="$1"
  local agents="$root/.codex/AGENTS.md"
  local tmp

  mkdir -p "$root/.codex"
  [[ -f "$agents" ]] || : > "$agents"
  tmp="$(mktemp "$root/.codex/.${SCRIPT_NAME}.agents.XXXXXX")"

  awk -v start="$RULE_START" -v end="$RULE_END" '
    $0 == start {skip=1; next}
    $0 == end   {skip=0; next}
    !skip       {print}
  ' "$agents" > "$tmp"

  printf '\n' >> "$tmp"
  render_agent_rules >> "$tmp"
  printf '\n' >> "$tmp"

  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$agents"
  say "Delegation rules installed in project file: $agents"
  say "No global Codex file was modified."
}

remove_agent_rules() {
  local root="$1"
  local agents="$root/.codex/AGENTS.md"
  if [[ ! -f "$agents" ]]; then
    say "No project AGENTS.md found: $agents"
    return 0
  fi

  if grep -Fq "$RULE_START" "$agents" 2>/dev/null; then
    strip_managed_rules_file "$agents"
    say "Managed DeepSeek delegation block removed from: $agents"
  else
    say "No managed DeepSeek block found in: $agents"
  fi
}

legacy_cleanup() {
  local root="$1"
  local project_agents="$root/.codex/AGENTS.md"
  local global_agents="$MAIN_CODEX_HOME/AGENTS.md"
  local changed=0

  # Only remove the exact managed block created by older versions. Never touch
  # unrelated instructions or the main config.toml.
  if [[ -f "$project_agents" ]] && grep -Fq "$RULE_START" "$project_agents" 2>/dev/null; then
    strip_managed_rules_file "$project_agents"
    say "Removed legacy managed block from: $project_agents"
    changed=1
  fi

  if [[ -f "$global_agents" ]] && grep -Fq "$RULE_START" "$global_agents" 2>/dev/null; then
    strip_managed_rules_file "$global_agents"
    say "Removed legacy managed block from: $global_agents"
    changed=1
  fi

  if [[ "$changed" -eq 0 ]]; then
    say "No legacy managed AGENTS.md block found."
  fi

  say "Main config.toml was not modified. Run '$0 main-check' to inspect it."
}

main_check() {
  local config="$MAIN_CODEX_HOME/config.toml"
  local models="$MAIN_CODEX_HOME/models.json"
  local agents="$MAIN_CODEX_HOME/AGENTS.md"
  local found=0

  say "Main Codex configuration check"
  say "Main CODEX_HOME: $MAIN_CODEX_HOME"

  if [[ -n "${CODEX_HOME:-}" ]]; then
    warn "CODEX_HOME is exported in this shell: $CODEX_HOME"
    warn "A globally exported CODEX_HOME can affect Codex launched from this shell."
    found=1
  else
    say "Exported CODEX_HOME: not set"
  fi

  if [[ -f "$config" ]]; then
    if grep -nEi '(^|[[:space:]])(model_provider[[:space:]]*=[[:space:]]*"deepseek"|model[[:space:]]*=[[:space:]]*"deepseek-|\[model_providers\.deepseek\]|api\.deepseek\.com)' "$config"; then
      warn "DeepSeek-related settings were found in the MAIN config above: $config"
      found=1
    else
      say "Main config: no obvious DeepSeek provider settings found ($config)"
    fi
  else
    say "Main config: not present ($config)"
  fi

  if [[ -f "$models" ]]; then
    if grep -qi 'deepseek' "$models"; then
      warn "DeepSeek entries found in MAIN model catalog: $models"
      found=1
    else
      say "Main model catalog: no DeepSeek entries found ($models)"
    fi
  fi

  if [[ -f "$agents" ]] && grep -Fq "$RULE_START" "$agents" 2>/dev/null; then
    warn "Legacy delegation block found in global AGENTS.md: $agents"
    found=1
  fi

  if [[ "$found" -eq 0 ]]; then
    say "Main-check result: CLEAN"
  else
    say "Main-check result: REVIEW REQUIRED"
    say "This command is diagnostic only; it changed nothing."
    return 1
  fi
}

setup() {
  require_cmd codex
  require_cmd git

  local root model reasoning
  root="$(resolve_project_root "${1:-}")" || exit 2
  validate_worker_home "$root" || exit 4

  model="$(normalize_model "$(current_model)")" || {
    err "Invalid configured model: $(current_model)"
    exit 2
  }
  reasoning="$(normalize_reasoning "$(current_reasoning)")" || {
    err "Invalid configured reasoning level: $(current_reasoning)"
    exit 2
  }

  save_defaults "$model" "$reasoning"
  write_worker_config "$model" "$reasoning" "$root"
  check_key_file "$root" || exit 3

  say ""
  say "Setup complete."
  say "Project: $root"
  say "Isolated DeepSeek CODEX_HOME: $WORKER_HOME"
  say "Main Codex home left untouched: $MAIN_CODEX_HOME"
  say "Default model: $model"
  say "Default intelligence: $reasoning"
  say "AGENTS.md: unchanged"
  say ""
  say "Recommended checks:"
  say "  $0 doctor"
  say "  $0 main-check"
  say ""
  say "Non-destructive worker test:"
  say "  $0 run --level low 'Inspect the project structure. Do not modify files.'"
}

build_prompt() {
  local task="$1"
  local model="$2"
  local reasoning="$3"

  cat <<EOF_PROMPT
You are the delegated DeepSeek coding worker for this project.

The main ChatGPT/OpenAI Codex agent remains the orchestrator. Execute ONLY the delegated task below.

Worker configuration for this task:
- model: $model
- reasoning effort: $reasoning

Rules:
- Work only in the current project/worktree.
- Read and obey existing project instructions before editing.
- Preserve architecture and conventions unless the delegated task explicitly requires a change.
- Make requested code/file changes directly when implementation is requested.
- Run relevant local checks/tests when practical.
- Do not ask the user questions; if something is ambiguous, choose the safest reasonable implementation and state the assumption.
- Do not commit, push, reset, checkout, rebase, or alter Git history.
- Do not overwrite unrelated user changes.
- End with a concise summary of files changed, work performed, checks run, and any remaining issue.

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
  local dry_run=0
  local requested_project=""
  local -a task_parts=()

  selected_model="$(current_model)"
  selected_reasoning="$(current_reasoning)"

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
      --project)
        [[ $# -ge 2 ]] || { err "$1 requires a directory."; exit 2; }
        requested_project="$2"
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
      -*)
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

  require_cmd git
  local root
  root="$(resolve_project_root "$requested_project")" || exit 2
  validate_worker_home "$root" || exit 4

  if [[ "$dry_run" -eq 1 ]]; then
    say "DeepSeek delegation dry-run"
    say "Project: $root"
    say "Worker CODEX_HOME: $WORKER_HOME"
    say "Model: $selected_model"
    say "Intelligence: $selected_reasoning"
    say "Task: $task"
    return 0
  fi

  require_cmd codex

  # Create the isolated config only if absent. Persistent default changes are
  # handled by setup/config, avoiding unnecessary writes on every delegation.
  if [[ ! -f "$WORKER_HOME/config.toml" ]]; then
    write_worker_config "$(normalize_model "$(current_model)")" "$(normalize_reasoning "$(current_reasoning)")" "$root"
  fi

  local api_key
  api_key="$(read_api_key "$root" 2>/dev/null || true)"
  if [[ -z "$api_key" ]]; then
    err "DeepSeek API key not available."
    err "Expected: $(key_file_path "$root")"
    exit 3
  fi

  local prompt
  prompt="$(build_prompt "$task" "$selected_model" "$selected_reasoning")"

  cd "$root"

  # Scope all provider/auth changes to this child process. Nothing is exported
  # back to the user's shell and no main Codex file is touched.
  printf '%s\n' "$prompt" | \
    CODEX_HOME="$WORKER_HOME" \
    DEEPSEEK_API_KEY="$api_key" \
    "$CODEX_BIN" exec \
      --model "$selected_model" \
      -c "model_provider=\"deepseek\"" \
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
    validate_worker_home "" || exit 4
    save_defaults "$selected_model" "$selected_reasoning"
    write_worker_config "$selected_model" "$selected_reasoning" ""
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

  validate_worker_home "" || exit 4
  save_defaults "$selected_model" "$selected_reasoning"
  write_worker_config "$selected_model" "$selected_reasoning" ""
  say "Defaults saved."
  say "Model: $selected_model"
  say "Intelligence: $selected_reasoning"
}

version_ge() {
  local have="${1%%[^0-9.]*}"
  local need="${2%%[^0-9.]*}"
  local IFS=.
  local -a h n
  local i hv nv

  h=($have)
  n=($need)
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
  [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]] || return 1
  raw="$("$CODEX_BIN" --version 2>/dev/null || true)"
  printf '%s\n' "$raw" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+\.[0-9]+/) {print $i; exit}}' | sed 's/[^0-9.].*$//'
}

status() {
  local model reasoning root=""
  model="$(normalize_model "$(current_model)" 2>/dev/null || printf '%s' "$(current_model)")"
  reasoning="$(normalize_reasoning "$(current_reasoning)" 2>/dev/null || printf '%s' "$(current_reasoning)")"

  say "$SCRIPT_NAME v$SCRIPT_VERSION"
  say "Main Codex home: $MAIN_CODEX_HOME"
  say "DeepSeek worker home: $WORKER_HOME"

  if validate_worker_home "" >/dev/null 2>&1; then
    say "Worker isolation: OK"
  else
    say "Worker isolation: UNSAFE"
  fi

  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex CLI: $CODEX_BIN"
    say "Codex CLI version: $(codex_version_number 2>/dev/null || printf 'unknown')"
  else
    say "Codex CLI: MISSING"
  fi

  if [[ -f "$WORKER_HOME/config.toml" ]]; then
    say "Worker config: OK ($WORKER_HOME/config.toml)"
  else
    say "Worker config: not created yet (run setup)"
  fi

  root="$(resolve_project_root "" 2>/dev/null || true)"
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: configured via environment"
  elif [[ -n "$root" && -n "$(read_api_key "$root" 2>/dev/null || true)" ]]; then
    say "DeepSeek API key: configured ($(key_file_path "$root"))"
  else
    say "DeepSeek API key: not detected for current project"
  fi

  say "Default model: $model"
  say "Default intelligence: $reasoning"
}

doctor() {
  local failed=0
  local cv root=""

  say "DeepSeek delegation doctor"
  say "Script version: $SCRIPT_VERSION"

  if validate_worker_home ""; then
    say "Worker isolation: OK"
  else
    failed=1
  fi

  if [[ -n "${CODEX_HOME:-}" ]]; then
    warn "CODEX_HOME is exported in this shell: $CODEX_HOME"
    warn "Consider unsetting it for normal Codex/ChatGPT launches unless intentional."
    failed=1
  else
    say "Global CODEX_HOME environment: not set"
  fi

  if [[ -n "$CODEX_BIN" && -x "$CODEX_BIN" ]]; then
    say "Codex binary: $CODEX_BIN"
    cv="$(codex_version_number 2>/dev/null || true)"
    if [[ -n "$cv" ]]; then
      say "Codex CLI version: $cv"
      if version_ge "$cv" "$MIN_CODEX_VERSION"; then
        say "Codex compatibility: OK (>= $MIN_CODEX_VERSION)"
      else
        warn "Codex $cv is older than $MIN_CODEX_VERSION; update Codex CLI."
        failed=1
      fi
    else
      warn "Could not parse Codex CLI version."
      failed=1
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

  root="$(resolve_project_root "" 2>/dev/null || true)"
  if [[ -z "$root" ]]; then
    warn "Current directory is not a Git project (or non-Git mode was not enabled)."
    failed=1
  else
    say "Project: $root"
    if validate_worker_home "$root"; then
      :
    else
      failed=1
    fi
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

  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    say "DeepSeek API key: configured via environment"
  elif [[ -n "$root" ]] && check_key_file "$root" >/dev/null 2>&1; then
    say "DeepSeek API key: configured ($(key_file_path "$root"))"
  else
    warn "DeepSeek API key: not configured for current project"
    failed=1
  fi

  # Diagnostic only. A non-clean main config is important enough to flag, but
  # the doctor never changes it.
  if main_check >/dev/null 2>&1; then
    say "Main Codex config: no obvious DeepSeek contamination detected"
  else
    warn "Main Codex config: review recommended; run '$0 main-check'"
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
  local root

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
      require_cmd git
      root="$(resolve_project_root "${1:-}")" || exit 2
      check_key_file "$root"
      ;;
    install-rules)
      shift
      require_cmd git
      root="$(resolve_project_root "${1:-}")" || exit 2
      validate_worker_home "$root" || exit 4
      install_agent_rules "$root"
      ;;
    remove-rules)
      shift
      require_cmd git
      root="$(resolve_project_root "${1:-}")" || exit 2
      remove_agent_rules "$root"
      ;;
    legacy-cleanup)
      shift
      require_cmd git
      root="$(resolve_project_root "${1:-}")" || exit 2
      legacy_cleanup "$root"
      ;;
    main-check)
      main_check
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
      # Convenience: unknown first argument is treated as the task itself.
      run_delegate "$@"
      ;;
  esac
}

main "$@"
