#!/usr/bin/env bash
set -euo pipefail

# JEV Integration
# TypeSafe Jev routes coding work between ChatGPT/Codex, Claude Code, and DeepSeek.
# Jev itself does not generate code: it makes structured routing/workflow decisions.
# macOS-oriented (uses Keychain when available).

SCRIPT_NAME="jev_integration"
SCRIPT_LABEL="JEV Integration"

# ---- Jev / TypeSafe ---------------------------------------------------------
JEV_MODEL="${JEV_MODEL:-jev-latest}"
JEV_ENDPOINT="${JEV_ENDPOINT:-https://api.typesafe.ai/v1/systemone}"
JEV_MIN_CONFIDENCE="${JEV_MIN_CONFIDENCE:-0.60}"
JEV_KEYCHAIN_SERVICE="atome.jev.typesafe"

# ---- DeepSeek worker --------------------------------------------------------
DEEPSEEK_WORKER_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"
DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-flash}"
DEEPSEEK_REASONING="${DEEPSEEK_REASONING:-high}"
DEEPSEEK_KEYCHAIN_SERVICE="atome.codex.deepseek"

# ---- Claude worker ----------------------------------------------------------
CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"
CLAUDE_PERMISSION_MODE="${CLAUDE_PERMISSION_MODE:-acceptEdits}"
CLAUDE_MAX_TURNS="${CLAUDE_MAX_TURNS:-40}"

# ---- ChatGPT/Codex worker ---------------------------------------------------
# Empty means: use the model configured/authenticated by the user's Codex CLI.
CHATGPT_MODEL="${CHATGPT_MODEL:-}"

KEYCHAIN_ACCOUNT="${USER:-$(id -un)}"
RULE_START="<!-- ATOME_JEV_ORCHESTRATION_START -->"
RULE_END="<!-- ATOME_JEV_ORCHESTRATION_END -->"
LEGACY_RULE_START="<!-- ATOME_DEEPSEEK_DELEGATION_START -->"
LEGACY_RULE_END="<!-- ATOME_DEEPSEEK_DELEGATION_END -->"

say() { printf '%s\n' "$*"; }
err() { printf 'ERROR: %s\n' "$*" >&2; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
JEV Integration — Jev routes coding tasks to ChatGPT/Codex, Claude Code, or DeepSeek.

Usage:
  jev_integration.sh setup [PROJECT_DIR]
  jev_integration.sh route "task"
  jev_integration.sh run "task"
  jev_integration.sh run --worker chatgpt|claude|deepseek "task"
  printf '%s\n' "task" | jev_integration.sh run
  jev_integration.sh key jev
  jev_integration.sh key deepseek
  jev_integration.sh status
  jev_integration.sh help

Recommended first run from the root of the atome project:
  chmod +x ./scripts/jev_integration.sh
  ./scripts/jev_integration.sh setup

Normal use:
  ./scripts/jev_integration.sh run "Fix the undo stack bug and add regression tests"

What happens in auto mode:
  1. The task text is sent to TypeSafe Jev (not the repository source code).
  2. Jev chooses a workflow and worker(s): ChatGPT/Codex, Claude, DeepSeek.
  3. The chosen worker inspects the local repository and performs the work.
  4. For complex/high-risk work, Jev can request a planning and/or review pass.
  5. The script prints the routing decision and final worker/reviewer outputs.

Manual override (bypasses Jev routing):
  ./scripts/jev_integration.sh run --worker deepseek "Implement this plan"
  ./scripts/jev_integration.sh run --worker claude "Refactor this module"
  ./scripts/jev_integration.sh run --worker chatgpt "Investigate this architecture issue"

Defaults / overrides:
  JEV_MODEL=jev-latest
  JEV_MIN_CONFIDENCE=0.60
  DEEPSEEK_MODEL=deepseek-flash
  DEEPSEEK_REASONING=high
  CLAUDE_MODEL=sonnet
  CLAUDE_PERMISSION_MODE=acceptEdits
  CHATGPT_MODEL=""   # empty = Codex CLI default/current model

Secrets:
  TYPESAFE_API_KEY=...   # accepted; macOS Keychain preferred
  DEEPSEEK_API_KEY=...   # accepted; macOS Keychain preferred
USAGE
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "Required command not found: $1"
    case "$1" in
      codex) err "Install Codex CLI: curl -fsSL https://chatgpt.com/codex/install.sh | sh" ;;
      jq) err "Install jq on macOS with: brew install jq" ;;
      curl) err "curl is required." ;;
      git) err "git is required." ;;
    esac
    exit 1
  }
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

float_lt() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit !(a < b) }'
}

float_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'
}

# ---- Keychain ---------------------------------------------------------------
read_secret() {
  local env_name="$1"
  local service="$2"
  local value="${!env_name:-}"

  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return 0
  fi

  if command -v security >/dev/null 2>&1; then
    security find-generic-password \
      -a "$KEYCHAIN_ACCOUNT" \
      -s "$service" \
      -w 2>/dev/null || true
  fi
}

store_secret() {
  local label="$1"
  local env_name="$2"
  local service="$3"
  local key="${!env_name:-}"

  if [[ -z "$key" ]]; then
    if [[ ! -t 0 ]]; then
      err "No interactive terminal. Set $env_name and retry."
      exit 1
    fi
    printf '%s API key: ' "$label" >&2
    IFS= read -r -s key
    printf '\n' >&2
  fi

  if [[ -z "$key" ]]; then
    err "Empty API key."
    exit 1
  fi

  if ! command -v security >/dev/null 2>&1; then
    err "macOS Keychain command 'security' is unavailable."
    err "Use $env_name in your shell environment instead."
    exit 1
  fi

  security add-generic-password \
    -U \
    -a "$KEYCHAIN_ACCOUNT" \
    -s "$service" \
    -w "$key" >/dev/null

  say "$label key stored in macOS Keychain."
}

# ---- Worker configuration ---------------------------------------------------
write_deepseek_config() {
  mkdir -p "$DEEPSEEK_WORKER_HOME"
  chmod 700 "$DEEPSEEK_WORKER_HOME" 2>/dev/null || true

  cat > "$DEEPSEEK_WORKER_HOME/config.toml" <<EOF_CONFIG
# Generated by atome/scripts/jev_integration.sh
# Isolated Codex home for the delegated DeepSeek worker.

model = "$DEEPSEEK_MODEL"
model_provider = "deepseek"
model_reasoning_effort = "$DEEPSEEK_REASONING"
web_search = "disabled"
approval_policy = "never"
sandbox_mode = "workspace-write"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
requires_openai_auth = false
env_key_instructions = "Set DEEPSEEK_API_KEY or store it using jev_integration.sh key deepseek"
EOF_CONFIG

  chmod 600 "$DEEPSEEK_WORKER_HOME/config.toml" 2>/dev/null || true
}

worker_available() {
  local worker="$1"
  case "$worker" in
    chatgpt)
      command -v codex >/dev/null 2>&1
      ;;
    claude)
      command -v claude >/dev/null 2>&1
      ;;
    deepseek)
      command -v codex >/dev/null 2>&1 && [[ -n "$(read_secret DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE")" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

first_available_worker() {
  local preferred="${1:-chatgpt}"
  local w
  for w in "$preferred" chatgpt claude deepseek; do
    if worker_available "$w"; then
      printf '%s' "$w"
      return 0
    fi
  done
  return 1
}

choose_alternate_worker() {
  local primary="$1"
  local candidate
  case "$primary" in
    deepseek) for candidate in claude chatgpt; do worker_available "$candidate" && { printf '%s' "$candidate"; return; }; done ;;
    claude) for candidate in chatgpt deepseek; do worker_available "$candidate" && { printf '%s' "$candidate"; return; }; done ;;
    chatgpt) for candidate in claude deepseek; do worker_available "$candidate" && { printf '%s' "$candidate"; return; }; done ;;
  esac
  printf '%s' "$primary"
}

# ---- Project rules ----------------------------------------------------------
remove_marker_block() {
  local file="$1"
  local start_marker="$2"
  local end_marker="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v s="$start_marker" -v e="$end_marker" '
    index($0, s) { skipping=1; next }
    index($0, e) { skipping=0; next }
    !skipping { print }
  ' "$file" > "$tmp"

  mv "$tmp" "$file"
}

install_agent_rules() {
  local root="$1"
  local agents="$root/AGENTS.md"

  [[ -f "$agents" ]] || touch "$agents"

  if grep -Fq "$LEGACY_RULE_START" "$agents"; then
    remove_marker_block "$agents" "$LEGACY_RULE_START" "$LEGACY_RULE_END"
  fi

  if grep -Fq "$RULE_START" "$agents"; then
    say "Jev orchestration rules already present in $agents"
    return
  fi

  cat >> "$agents" <<'EOF_RULES'

<!-- ATOME_JEV_ORCHESTRATION_START -->
## Jev coding orchestration

For coding implementation, debugging, refactoring, or review tasks in this project, use `./scripts/jev_integration.sh run` as the default multi-model orchestrator unless the user explicitly asks the current agent to do the work itself.

Jev is a routing/decision model, not a code generator. The script asks Jev which workflow and worker should handle the task, then delegates execution to ChatGPT/Codex, Claude Code, or DeepSeek.

Procedure:
1. Build a self-contained task description containing the user's request, constraints already established in the current conversation, target files/scope when known, and acceptance criteria.
2. From the project root invoke:

   printf '%s\n' "<complete coding task>" | ./scripts/jev_integration.sh run

3. Wait for the orchestration to finish in the current turn.
4. Inspect the resulting local changes/diff yourself before reporting completion.
5. Report the selected workflow/worker, changes made, checks run, and remaining issues.

If the user explicitly chooses a model, honor it with a manual override:
- ChatGPT/Codex: `./scripts/jev_integration.sh run --worker chatgpt "..."`
- Claude: `./scripts/jev_integration.sh run --worker claude "..."`
- DeepSeek: `./scripts/jev_integration.sh run --worker deepseek "..."`

Do not commit, push, reset, rebase, or rewrite git history unless the user explicitly requests it.
<!-- ATOME_JEV_ORCHESTRATION_END -->
EOF_RULES

  say "Jev orchestration rules added to $agents"
}

# ---- Jev routing ------------------------------------------------------------
build_jev_state() {
  local task="$1"
  local has_claude="no"
  local has_deepseek="no"
  command -v claude >/dev/null 2>&1 && has_claude="yes"
  [[ -n "$(read_secret DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE")" ]] && has_deepseek="yes"

  cat <<EOF_STATE
Project: atome
Task: $task
Available workers:
- chatgpt/codex: yes
- claude-code: $has_claude
- deepseek-via-codex: $has_deepseek
Routing objective: choose the most suitable coding worker and the lightest reliable workflow. Prefer a single pass for routine work; use planning/review passes only when complexity or risk justifies them.
EOF_STATE
}

jev_decide() {
  require_cmd curl
  require_cmd jq

  local task="$1"
  local api_key state payload response
  api_key="$(read_secret TYPESAFE_API_KEY "$JEV_KEYCHAIN_SERVICE")"

  if [[ -z "$api_key" ]]; then
    err "TypeSafe/Jev API key is not configured. Run: $0 key jev"
    return 10
  fi

  state="$(build_jev_state "$task")"

  payload="$(jq -n \
    --arg model "$JEV_MODEL" \
    --arg state "$state" \
    '{
      model: $model,
      state: $state,
      questions: {
        workflow: {
          type: "choice",
          instructions: "Choose the lightest reliable workflow for this coding task.",
          criteria: {
            direct: "One capable coding agent can perform the task safely in one pass.",
            plan_execute: "The task benefits from a separate read-only planning pass before implementation.",
            execute_review: "The task can be implemented directly but should receive an independent read-only review afterward.",
            plan_execute_review: "The task is complex, broad, or risky enough to justify separate planning, implementation, and independent review."
          }
        },
        planner: {
          type: "choice",
          instructions: "If a planning pass is used, which available worker is best suited to analyze the repository and produce the implementation plan? Choose only an available worker.",
          criteria: {
            chatgpt: "OpenAI Codex/ChatGPT: broad architecture, planning, synthesis, cross-file reasoning.",
            claude: "Claude Code: careful long-context repository reading, refactors, architecture review.",
            deepseek: "DeepSeek: efficient technical analysis when the task is already well scoped."
          }
        },
        executor: {
          type: "choice",
          instructions: "Which available worker should implement this coding task? Choose only an available worker.",
          criteria: {
            chatgpt: "OpenAI Codex/ChatGPT: broad or ambiguous engineering tasks, architecture-sensitive implementation, synthesis.",
            claude: "Claude Code: large codebase edits, refactors, careful code reading and implementation.",
            deepseek: "DeepSeek: direct implementation, debugging, tests, and cost-efficient execution from a clear task or plan."
          }
        },
        reviewer: {
          type: "choice",
          instructions: "If an independent review pass is used, which available worker should review the implementation? Prefer a different worker from the executor when possible.",
          criteria: {
            chatgpt: "OpenAI Codex/ChatGPT: architectural and correctness review, synthesis of findings.",
            claude: "Claude Code: detailed code review and long-context consistency checking.",
            deepseek: "DeepSeek: fast targeted verification of implementation and tests."
          }
        },
        risk: {
          type: "score",
          instructions: "Rate implementation risk if the task is executed incorrectly.",
          criteria: [
            "Low: localized and easily reversible change",
            "Moderate: multiple files or meaningful behavior change",
            "High: broad architecture, data loss, security, auth, migration, or difficult rollback",
            "Critical: destructive or production-sensitive change where an incorrect implementation could cause major damage"
          ]
        }
      }
    }')"

  response="$(curl -fsS \
    -X POST "$JEV_ENDPOINT" \
    -H "Authorization: Bearer $api_key" \
    -H "Content-Type: application/json" \
    --data-binary "$payload")" || {
      err "Jev API request failed."
      return 11
    }

  if ! jq -e '.answers.executor.choice and .answers.workflow.choice' >/dev/null 2>&1 <<<"$response"; then
    err "Unexpected Jev response:"
    printf '%s\n' "$response" >&2
    return 12
  fi

  printf '%s\n' "$response"
}

print_route_summary() {
  local json="$1"
  local workflow planner executor reviewer risk conf
  workflow="$(jq -r '.answers.workflow.choice // "direct"' <<<"$json")"
  planner="$(jq -r '.answers.planner.choice // "chatgpt"' <<<"$json")"
  executor="$(jq -r '.answers.executor.choice // "chatgpt"' <<<"$json")"
  reviewer="$(jq -r '.answers.reviewer.choice // "claude"' <<<"$json")"
  risk="$(jq -r '.answers.risk.score // 0' <<<"$json")"
  conf="$(jq -r '.answers.executor.confidence // 0' <<<"$json")"

  say "Jev decision:"
  say "  workflow: $workflow"
  say "  planner:  $planner"
  say "  executor: $executor (confidence $conf)"
  say "  reviewer: $reviewer"
  say "  risk:     $risk / 3"
}

# ---- Worker prompts ---------------------------------------------------------
build_plan_prompt() {
  local task="$1"
  cat <<EOF_PROMPT
You are the planning worker in a Jev-orchestrated coding workflow for the atome project.

TASK:
$task

Planning rules:
- READ ONLY. Do not modify files.
- Inspect the repository and its AGENTS.md/project instructions before proposing changes.
- Produce a concrete implementation plan referencing the relevant files/functions/modules.
- Identify tests/checks that should be run.
- Identify likely regressions or risky assumptions.
- Do not commit, push, reset, checkout, rebase, or alter git history.
- Keep the final plan concise enough to pass directly to another coding agent.
EOF_PROMPT
}

build_execute_prompt() {
  local task="$1"
  local plan="${2:-}"
  cat <<EOF_PROMPT
You are the implementation worker in a Jev-orchestrated coding workflow for the atome project.

TASK:
$task

${plan:+PLANNING PASS FROM ANOTHER WORKER:
$plan
}
Execution rules:
- Inspect AGENTS.md and existing project instructions before editing.
- Work only in the current repository/worktree.
- Preserve architecture and conventions unless the task explicitly requires a change.
- Implement the requested change directly.
- Run relevant local checks/tests when practical.
- Do not ask the user questions. If ambiguity remains, choose the safest reasonable implementation and document the assumption.
- Do not commit, push, reset, checkout, rebase, or alter git history.
- Do not overwrite unrelated user changes.
- Finish with a concise summary: files changed, work performed, checks run, and remaining issues.
EOF_PROMPT
}

build_review_prompt() {
  local task="$1"
  cat <<EOF_PROMPT
You are the independent READ-ONLY reviewer in a Jev-orchestrated coding workflow for the atome project.

ORIGINAL TASK:
$task

Review rules:
- Do not modify any file.
- Inspect AGENTS.md, git status, git diff, changed files, and relevant surrounding code.
- Check whether the implementation actually satisfies the task.
- Look for regressions, missing tests, unsafe behavior, architecture violations, and unrelated edits.
- Run read-only checks when useful; do not commit or alter git history.
- Return a concise verdict with: blocking issues, non-blocking issues, tests/checks observed, and whether the implementation appears ready for the parent agent to inspect.
EOF_PROMPT
}

# ---- Worker execution -------------------------------------------------------
run_chatgpt() {
  local mode="$1"
  local prompt="$2"
  local sandbox="workspace-write"
  local -a model_args=()

  require_cmd codex
  [[ "$mode" == "read" ]] && sandbox="read-only"
  [[ -n "$CHATGPT_MODEL" ]] && model_args=(--model "$CHATGPT_MODEL")

  printf '%s\n' "$prompt" | codex exec \
    --sandbox "$sandbox" \
    --ask-for-approval never \
    "${model_args[@]}" \
    -
}

run_deepseek() {
  local mode="$1"
  local prompt="$2"
  local sandbox="workspace-write"
  local api_key

  require_cmd codex
  write_deepseek_config
  [[ "$mode" == "read" ]] && sandbox="read-only"

  api_key="$(read_secret DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE")"
  if [[ -z "$api_key" ]]; then
    err "DeepSeek API key is not configured. Run: $0 key deepseek"
    return 20
  fi

  printf '%s\n' "$prompt" | \
    CODEX_HOME="$DEEPSEEK_WORKER_HOME" \
    CODEX_SQLITE_HOME="$DEEPSEEK_WORKER_HOME/state" \
    DEEPSEEK_API_KEY="$api_key" \
    codex exec \
      --sandbox "$sandbox" \
      --ask-for-approval never \
      -
}

run_claude() {
  local mode="$1"
  local prompt="$2"
  local permission_mode="$CLAUDE_PERMISSION_MODE"

  if ! command -v claude >/dev/null 2>&1; then
    err "Claude Code CLI is not installed or not in PATH."
    return 21
  fi

  [[ "$mode" == "read" ]] && permission_mode="plan"

  claude -p \
    --model "$CLAUDE_MODEL" \
    --permission-mode "$permission_mode" \
    --max-turns "$CLAUDE_MAX_TURNS" \
    "$prompt"
}

run_worker() {
  local worker="$1"
  local mode="$2"
  local prompt="$3"

  case "$worker" in
    chatgpt) run_chatgpt "$mode" "$prompt" ;;
    claude) run_claude "$mode" "$prompt" ;;
    deepseek) run_deepseek "$mode" "$prompt" ;;
    *) err "Unknown worker: $worker"; return 22 ;;
  esac
}

normalize_worker() {
  local requested="$1"
  local fallback="${2:-chatgpt}"
  if worker_available "$requested"; then
    printf '%s' "$requested"
  else
    warn "Worker '$requested' is unavailable; selecting an available fallback."
    first_available_worker "$fallback"
  fi
}

# ---- Commands ---------------------------------------------------------------
setup() {
  require_cmd codex
  require_cmd git
  require_cmd curl
  require_cmd jq

  local root
  root="$(project_root "${1:-}")"

  write_deepseek_config

  if [[ -z "$(read_secret TYPESAFE_API_KEY "$JEV_KEYCHAIN_SERVICE")" ]]; then
    say "No TypeSafe/Jev key found. It will be stored securely in macOS Keychain."
    store_secret "TypeSafe/Jev" TYPESAFE_API_KEY "$JEV_KEYCHAIN_SERVICE"
  else
    say "TypeSafe/Jev API key found."
  fi

  if [[ -z "$(read_secret DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE")" ]]; then
    say "No DeepSeek key found. It will be stored securely in macOS Keychain."
    store_secret "DeepSeek" DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE"
  else
    say "DeepSeek API key found."
  fi

  if command -v claude >/dev/null 2>&1; then
    say "Claude Code CLI: found ($(command -v claude))"
  else
    warn "Claude Code CLI not found. Jev will fall back to ChatGPT/DeepSeek when Claude is unavailable."
  fi

  install_agent_rules "$root"

  say ""
  say "$SCRIPT_LABEL setup complete."
  say "Project: $root"
  say "Jev model: $JEV_MODEL"
  say "DeepSeek model: $DEEPSEEK_MODEL ($DEEPSEEK_REASONING reasoning)"
  say "Claude model: $CLAUDE_MODEL"
  if [[ -n "$CHATGPT_MODEL" ]]; then
    say "ChatGPT/Codex model: $CHATGPT_MODEL"
  else
    say "ChatGPT/Codex model: Codex CLI current/default model"
  fi
  say ""
  say "Test routing only:"
  say "  '$0' route 'Inspect the undo architecture and propose the safest fix.'"
  say ""
  say "Run a real task:"
  say "  '$0' run 'Inspect the project and report the top-level structure. Do not modify files.'"
}

route_only() {
  local task="$1"
  local decision
  decision="$(jev_decide "$task")"
  print_route_summary "$decision"
}

run_orchestrated() {
  local task="$1"
  local forced_worker="${2:-}"
  local root decision workflow planner executor reviewer risk exec_conf
  local plan_output=""
  local exec_prompt review_prompt plan_prompt

  require_cmd git
  root="$(project_root)"
  cd "$root"

  if [[ -n "$forced_worker" ]]; then
    executor="$(normalize_worker "$forced_worker" chatgpt)"
    say "Manual override: $executor"
    exec_prompt="$(build_execute_prompt "$task")"
    run_worker "$executor" write "$exec_prompt"
    return
  fi

  decision="$(jev_decide "$task")" || {
    warn "Jev routing failed. Falling back to ChatGPT/Codex with an independent review when possible."
    workflow="execute_review"
    planner="chatgpt"
    executor="$(first_available_worker chatgpt)"
    reviewer="$(choose_alternate_worker "$executor")"
    risk="2"
    exec_conf="0"
  }

  if [[ -n "${decision:-}" ]]; then
    print_route_summary "$decision"
    workflow="$(jq -r '.answers.workflow.choice // "direct"' <<<"$decision")"
    planner="$(jq -r '.answers.planner.choice // "chatgpt"' <<<"$decision")"
    executor="$(jq -r '.answers.executor.choice // "chatgpt"' <<<"$decision")"
    reviewer="$(jq -r '.answers.reviewer.choice // "claude"' <<<"$decision")"
    risk="$(jq -r '.answers.risk.score // 0' <<<"$decision")"
    exec_conf="$(jq -r '.answers.executor.confidence // 0' <<<"$decision")"
  fi

  planner="$(normalize_worker "$planner" chatgpt)"
  executor="$(normalize_worker "$executor" chatgpt)"
  reviewer="$(normalize_worker "$reviewer" chatgpt)"

  if [[ "$reviewer" == "$executor" ]]; then
    reviewer="$(choose_alternate_worker "$executor")"
  fi

  # Confidence gate: if Jev is unsure, prefer the current OpenAI/Codex worker and add review.
  if float_lt "$exec_conf" "$JEV_MIN_CONFIDENCE"; then
    warn "Jev executor confidence $exec_conf is below $JEV_MIN_CONFIDENCE. Using conservative fallback."
    executor="$(first_available_worker chatgpt)"
    reviewer="$(choose_alternate_worker "$executor")"
    case "$workflow" in
      direct) workflow="execute_review" ;;
      plan_execute) workflow="plan_execute_review" ;;
    esac
  fi

  # A high-risk score always receives review even if Jev selected a direct workflow.
  if float_ge "$risk" "2.0"; then
    case "$workflow" in
      direct) workflow="execute_review" ;;
      plan_execute) workflow="plan_execute_review" ;;
    esac
  fi

  say "Resolved orchestration:"
  say "  workflow: $workflow"
  say "  planner:  $planner"
  say "  executor: $executor"
  say "  reviewer: $reviewer"
  say ""

  case "$workflow" in
    plan_execute|plan_execute_review)
      plan_prompt="$(build_plan_prompt "$task")"
      say "=== Planning pass: $planner ==="
      plan_output="$(run_worker "$planner" read "$plan_prompt")"
      printf '%s\n' "$plan_output"
      say "=== End planning pass ==="
      say ""
      ;;
    direct|execute_review)
      ;;
    *)
      warn "Unknown workflow '$workflow'; using direct execution."
      workflow="direct"
      ;;
  esac

  exec_prompt="$(build_execute_prompt "$task" "$plan_output")"
  say "=== Execution pass: $executor ==="
  run_worker "$executor" write "$exec_prompt"
  say "=== End execution pass ==="

  case "$workflow" in
    execute_review|plan_execute_review)
      review_prompt="$(build_review_prompt "$task")"
      say ""
      say "=== Independent review: $reviewer ==="
      run_worker "$reviewer" read "$review_prompt"
      say "=== End review ==="
      ;;
  esac
}

status() {
  say "$SCRIPT_LABEL status"
  say "Script: $0"

  if command -v codex >/dev/null 2>&1; then
    say "Codex CLI: OK ($(command -v codex))"
  else
    say "Codex CLI: MISSING"
  fi

  if command -v claude >/dev/null 2>&1; then
    say "Claude Code CLI: OK ($(command -v claude))"
  else
    say "Claude Code CLI: MISSING (optional)"
  fi

  if command -v jq >/dev/null 2>&1; then
    say "jq: OK ($(command -v jq))"
  else
    say "jq: MISSING"
  fi

  if [[ -f "$DEEPSEEK_WORKER_HOME/config.toml" ]]; then
    say "DeepSeek Codex config: OK ($DEEPSEEK_WORKER_HOME/config.toml)"
  else
    say "DeepSeek Codex config: not created yet (run setup)"
  fi

  if [[ -n "$(read_secret TYPESAFE_API_KEY "$JEV_KEYCHAIN_SERVICE")" ]]; then
    say "TypeSafe/Jev API key: configured"
  else
    say "TypeSafe/Jev API key: not configured"
  fi

  if [[ -n "$(read_secret DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE")" ]]; then
    say "DeepSeek API key: configured"
  else
    say "DeepSeek API key: not configured"
  fi

  say "Jev model: $JEV_MODEL"
  say "Jev minimum confidence: $JEV_MIN_CONFIDENCE"
  say "DeepSeek model: $DEEPSEEK_MODEL"
  say "DeepSeek reasoning: $DEEPSEEK_REASONING"
  say "Claude model: $CLAUDE_MODEL"
  say "Claude permission mode: $CLAUDE_PERMISSION_MODE"
  if [[ -n "$CHATGPT_MODEL" ]]; then
    say "ChatGPT/Codex model: $CHATGPT_MODEL"
  else
    say "ChatGPT/Codex model: current/default Codex model"
  fi
}

read_task() {
  local -a parts=("$@")
  local task=""

  if [[ ${#parts[@]} -gt 0 ]]; then
    task="${parts[*]}"
  elif [[ ! -t 0 ]]; then
    task="$(cat)"
  fi

  if [[ -z "${task//[[:space:]]/}" ]]; then
    err "No task supplied. Pass a task as an argument or through stdin."
    return 2
  fi

  printf '%s' "$task"
}

main() {
  local command="${1:-help}"
  local task forced_worker=""

  case "$command" in
    setup)
      shift
      setup "${1:-}"
      ;;
    route)
      shift
      task="$(read_task "$@")"
      route_only "$task"
      ;;
    run|orchestrate|delegate)
      shift
      if [[ "${1:-}" == "--worker" ]]; then
        forced_worker="${2:-}"
        if [[ -z "$forced_worker" ]]; then
          err "--worker requires chatgpt, claude, or deepseek"
          exit 2
        fi
        shift 2
        case "$forced_worker" in
          chatgpt|claude|deepseek) ;;
          *) err "Unknown worker: $forced_worker"; exit 2 ;;
        esac
      fi
      task="$(read_task "$@")"
      run_orchestrated "$task" "$forced_worker"
      ;;
    key|set-key)
      shift
      case "${1:-}" in
        jev|typesafe)
          store_secret "TypeSafe/Jev" TYPESAFE_API_KEY "$JEV_KEYCHAIN_SERVICE"
          ;;
        deepseek)
          store_secret "DeepSeek" DEEPSEEK_API_KEY "$DEEPSEEK_KEYCHAIN_SERVICE"
          ;;
        *)
          err "Usage: $0 key jev|deepseek"
          exit 2
          ;;
      esac
      ;;
    status)
      status
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      # Convenience: any unknown first argument is treated as the task itself.
      task="$(read_task "$@")"
      run_orchestrated "$task"
      ;;
  esac
}

main "$@"
