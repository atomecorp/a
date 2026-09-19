#!/bin/bash
set -euo pipefail

# Codex <-> DeepSeek switcher for macOS
# Usage:
#   scripts/codex-switch.sh gpt          switch config.toml to ChatGPT
#   scripts/codex-switch.sh deepseek     switch config.toml to DeepSeek Flash
#   scripts/codex-switch.sh pro          switch config.toml to DeepSeek V4 Pro
#   scripts/codex-switch.sh cli-gpt|cli-deepseek|cli-pro   interactive CLI session
#   scripts/codex-switch.sh status
#
# The DeepSeek API key is NOT stored here: it is read from private/DeepSeek_key
# (git-ignored) at the framework root, or from $DEEPSEEK_API_KEY if already set.

FRAMEWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEEPSEEK_KEY_FILE="${DEEPSEEK_KEY_FILE:-$FRAMEWORK_ROOT/private/DeepSeek_key}"

# Folders DeepSeek may write to even when the chat is not attached to them.
DEEPSEEK_WRITABLE_ROOT="$FRAMEWORK_ROOT"

CODEX_DIR="$HOME/.codex"
CONFIG="$CODEX_DIR/config.toml"
MODELS="$CODEX_DIR/models.json"
BACKUP_DIR="$CODEX_DIR/codex-switch-backup"

die() { echo "ERROR: $*" >&2; exit 1; }

DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"

load_deepseek_key() {
  [[ -n "$DEEPSEEK_API_KEY" ]] && return 0
  [[ -r "$DEEPSEEK_KEY_FILE" ]] || \
    die "Missing DeepSeek key: put it alone in $DEEPSEEK_KEY_FILE"
  DEEPSEEK_API_KEY="$(tr -d '[:space:]' < "$DEEPSEEK_KEY_FILE")"
  [[ -n "$DEEPSEEK_API_KEY" ]] || die "Empty DeepSeek key file: $DEEPSEEK_KEY_FILE"
}

# The DeepSeek catalog needs Codex >= 0.144. An old npm/Homebrew `codex` (0.1.x)
# treats `-c` as "open instructions in $EDITOR", so pick a recent binary.
MIN_CODEX_MINOR=144
CODEX_BIN=""

codex_minor() {
  "$1" --version 2>/dev/null | sed -nE 's/.*[^0-9]0\.([0-9]+)\..*/\1/p' | head -1
}

require_codex() {
  [[ -n "$CODEX_BIN" ]] && return 0
  local candidate minor
  for candidate in "${CODEX_SWITCH_BIN:-}" "$(command -v codex 2>/dev/null || true)" \
      /Applications/ChatGPT.app/Contents/Resources/codex \
      /Applications/Codex.app/Contents/Resources/codex; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    minor="$(codex_minor "$candidate")"
    if [[ -n "$minor" && "$minor" -ge "$MIN_CODEX_MINOR" ]]; then
      CODEX_BIN="$candidate"
      return 0
    fi
  done
  die "No Codex CLI >= 0.$MIN_CODEX_MINOR found. Run: npm install -g @openai/codex@latest"
}

install_deepseek_catalog() {
  mkdir -p "$CODEX_DIR"
  cat > "$MODELS" <<'JSON'
{
  "models": [
    {
      "slug": "deepseek-flash",
      "prefer_websockets": false,
      "support_verbosity": true,
      "default_verbosity": "low",
      "apply_patch_tool_type": "freeform",
      "web_search_tool_type": "text",
      "input_modalities": ["text", "image"],
      "supports_image_detail_original": true,
      "truncation_policy": {"mode": "tokens", "limit": 10000},
      "supports_parallel_tool_calls": true,
      "tool_mode": null,
      "multi_agent_version": "v2",
      "use_responses_lite": false,
      "include_skills_usage_instructions": false,
      "auto_review_model_override": null,
      "context_window": 1048576,
      "max_context_window": 1048576,
      "effective_context_window_percent": 95,
      "auto_compact_token_limit": null,
      "comp_hash": "3000",
      "reasoning_summary_format": "experimental",
      "default_reasoning_summary": "none",
      "display_name": "DeepSeek-Flash",
      "description": "DeepSeek frontier agentic coding model with image input.",
      "default_reasoning_level": "high",
      "supported_reasoning_levels": [
        {"effort": "low", "description": "Fast responses with lighter reasoning"},
        {"effort": "high", "description": "Extra high reasoning depth"},
        {"effort": "max", "description": "Maximum reasoning depth"}
      ],
      "shell_type": "shell_command",
      "visibility": "list",
      "minimal_client_version": "0.144.0",
      "supported_in_api": true,
      "availability_nux": null,
      "upgrade": null,
      "priority": 1
    },
    {
      "slug": "deepseek-v4-pro",
      "prefer_websockets": false,
      "support_verbosity": true,
      "default_verbosity": "low",
      "apply_patch_tool_type": "freeform",
      "web_search_tool_type": "text",
      "input_modalities": ["text"],
      "supports_image_detail_original": false,
      "truncation_policy": {"mode": "tokens", "limit": 10000},
      "supports_parallel_tool_calls": true,
      "tool_mode": null,
      "multi_agent_version": "v2",
      "use_responses_lite": false,
      "include_skills_usage_instructions": false,
      "auto_review_model_override": null,
      "context_window": 1048576,
      "max_context_window": 1048576,
      "effective_context_window_percent": 95,
      "auto_compact_token_limit": null,
      "comp_hash": "3000",
      "reasoning_summary_format": "experimental",
      "default_reasoning_summary": "none",
      "display_name": "DeepSeek-V4-Pro",
      "description": "DeepSeek frontier agentic coding model.",
      "default_reasoning_level": "high",
      "supported_reasoning_levels": [
        {"effort": "low", "description": "Fast responses with lighter reasoning"},
        {"effort": "high", "description": "Extra high reasoning depth"},
        {"effort": "max", "description": "Maximum reasoning depth"}
      ],
      "shell_type": "shell_command",
      "visibility": "list",
      "minimal_client_version": "0.144.0",
      "supported_in_api": true,
      "availability_nux": null,
      "upgrade": null,
      "priority": 2
    }
  ]
}
JSON
}

backup() {
  mkdir -p "$BACKUP_DIR"
  if [[ -f "$CONFIG" && ! -f "$BACKUP_DIR/config.toml.original" ]]; then
    cp "$CONFIG" "$BACKUP_DIR/config.toml.original"
  fi
  if [[ -f "$MODELS" && ! -f "$BACKUP_DIR/models.json.original" ]]; then
    cp "$MODELS" "$BACKUP_DIR/models.json.original"
  fi
}

set_deepseek_config() {
  local model="${1:-deepseek-flash}"
  load_deepseek_key

  mkdir -p "$CODEX_DIR"
  backup
  # catalog not passed to Codex: its schema changes between releases

  # Keep a backup of the user's original config. For reliability, this script
  # writes a dedicated DeepSeek config and launches Codex with -c overrides.
  # This avoids destroying OpenAI/ChatGPT authentication.
  cat > "$CODEX_DIR/deepseek-config.toml" <<EOF
model = "$model"
model_provider = "deepseek"
model_reasoning_effort = "high"
web_search = "disabled"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
env_key = "DEEPSEEK_API_KEY"
EOF
}

launch_deepseek() {
  local model="${1:-deepseek-flash}"
  shift || true
  require_codex
  set_deepseek_config "$model"
  export DEEPSEEK_API_KEY
  exec "$CODEX_BIN" \
    -c "model=$model" \
    -c "model_provider=deepseek" \
    -c "approvals_reviewer=user" \
    -c "sandbox_workspace_write.writable_roots=[\"$DEEPSEEK_WRITABLE_ROOT\"]" \
    -c "model_reasoning_effort=high" \
    -c "web_search=disabled" \
    -c "model_providers.deepseek.name=DeepSeek" \
    -c "model_providers.deepseek.base_url=https://api.deepseek.com/" \
    -c "model_providers.deepseek.wire_api=responses" \
    -c "model_providers.deepseek.env_key=DEEPSEEK_API_KEY" \
    "$@"
}

launch_gpt() {
  require_codex
  # No DeepSeek environment variable is exported here.
  # Codex therefore uses the normal ChatGPT/OpenAI authentication/configuration.
  exec "$CODEX_BIN" "$@"
}

status() {
  require_codex
  echo "Codex: $CODEX_BIN ($("$CODEX_BIN" --version 2>/dev/null))"
  echo "Config: $CONFIG"
  if [[ -f "$CONFIG" ]]; then
    echo "--- current config model/provider ---"
    grep -E '^(model|model_provider|preferred_auth_method|forced_login_method)' "$CONFIG" || true
  fi
  echo
  echo "DeepSeek catalog: $MODELS"
  echo "DeepSeek key file: $DEEPSEEK_KEY_FILE ($([[ -r "$DEEPSEEK_KEY_FILE" ]] && echo present || echo MISSING))"
}

# --- Desktop app (ChatGPT/Codex app) -----------------------------------------
# The app ignores -c overrides and the shell environment: it only reads
# config.toml. These commands edit it in place; lines they own are tagged.
TAG="# codex-switch"
ORIG_MODEL_FILE="$BACKUP_DIR/app-original-model"

strip_app_switch() {
  # Drop tagged lines and the tagged provider table.
  awk -v tag="$TAG" '
    index($0, tag " begin") { skip = 1; next }
    index($0, tag " end")   { skip = 0; next }
    skip { next }
    index($0, tag) { next }
    { print }
  ' "$CONFIG"
}

top_level_model() {
  awk '/^\[/ { exit } /^model[ ]*=/ { sub(/^model[ ]*=[ ]*/, ""); gsub(/"/, ""); sub(/[ ]*#.*/, ""); print; exit }' "$CONFIG"
}

app_deepseek() {
  local model="${1:-deepseek-flash}" tmp current
  load_deepseek_key
  [[ -f "$CONFIG" ]] || die "Missing $CONFIG"
  mkdir -p "$BACKUP_DIR"
  cp "$CONFIG" "$BACKUP_DIR/config.toml.before-app-deepseek"
  if ! grep -q "$TAG" "$CONFIG"; then
    current="$(top_level_model)"
    [[ -n "$current" ]] && echo "$current" > "$ORIG_MODEL_FILE"
  fi
  tmp="$(mktemp)"
  {
    echo "model = \"$model\" $TAG"
    echo "model_provider = \"deepseek\" $TAG"
    # Auto-review calls model `codex-auto-review` on the active provider, which
    # DeepSeek rejects: every escalation then fails. Ask the human instead.
    echo "approvals_reviewer = \"user\" $TAG"
    strip_app_switch | awk 'BEGIN { top = 1 } /^\[/ { top = 0 } top && /^(model|model_provider|approvals_reviewer)[ ]*=/ { next } { print }'
    echo ""
    echo "$TAG begin"
    echo "[model_providers.deepseek]"
    echo "name = \"DeepSeek\""
    echo "base_url = \"https://api.deepseek.com/\""
    echo "wire_api = \"responses\""
    echo "experimental_bearer_token = \"$DEEPSEEK_API_KEY\""
    echo ""
    echo "[sandbox_workspace_write]"
    echo "writable_roots = [\"$DEEPSEEK_WRITABLE_ROOT\"]"
    echo "$TAG end"
  } > "$tmp"
  cat "$tmp" > "$CONFIG" && rm -f "$tmp"
  chmod 600 "$CONFIG"
  echo "Desktop app now uses DeepSeek ($model). Quit the app (Cmd+Q) and reopen it."
  echo "Backup: $BACKUP_DIR/config.toml.before-app-deepseek"
}

app_gpt() {
  local model tmp
  [[ -f "$CONFIG" ]] || die "Missing $CONFIG"
  grep -q "$TAG" "$CONFIG" || { echo "Desktop app already uses ChatGPT."; return 0; }
  model="$(cat "$ORIG_MODEL_FILE" 2>/dev/null || true)"
  tmp="$(mktemp)"
  {
    [[ -n "$model" ]] && echo "model = \"$model\""
    strip_app_switch
  } > "$tmp"
  # Remove the trailing blank line left by the provider block.
  awk '{ lines[NR] = $0 } END { n = NR; while (n > 0 && lines[n] == "") n--; for (i = 1; i <= n; i++) print lines[i] }' "$tmp" > "$CONFIG"
  rm -f "$tmp"
  chmod 600 "$CONFIG"
  echo "Desktop app back on ChatGPT (${model:-default model}). Quit the app (Cmd+Q) and reopen it."
}

case "${1:-}" in
  # Plain names switch config.toml (read by the desktop app AND the CLI).
  gpt|openai|app-gpt|app-openai)
    app_gpt
    ;;
  deepseek|ds|deepseek-flash|flash|app-deepseek|app-ds|app-flash)
    app_deepseek "deepseek-flash"
    ;;
  deepseek-v4-pro|v4-pro|pro|app-pro|app-deepseek-v4-pro)
    app_deepseek "deepseek-v4-pro"
    ;;
  # cli-* launch an interactive Codex session in this terminal instead.
  cli-gpt)
    shift
    launch_gpt "$@"
    ;;
  cli-deepseek|cli-flash)
    shift
    launch_deepseek "deepseek-flash" "$@"
    ;;
  cli-pro)
    shift
    launch_deepseek "deepseek-v4-pro" "$@"
    ;;
  install)
    require_codex
    mkdir -p "$CODEX_DIR"
    backup
    install_deepseek_catalog
    echo "Installed DeepSeek model catalog: $MODELS"
    echo "Your original Codex config was not replaced."
    ;;
  status)
    status
    ;;
  *)
    cat <<'USAGE'
Usage (switches ~/.codex/config.toml, then Cmd+Q and reopen the app):
  codex-switch gpt                  -> ChatGPT
  codex-switch deepseek             -> DeepSeek Flash
  codex-switch pro                  -> DeepSeek V4 Pro
  codex-switch status               Show configuration status

Interactive Codex session in this terminal (config.toml untouched):
  codex-switch cli-gpt | cli-deepseek | cli-pro [codex args...]
  codex-switch install              Install/update DeepSeek model catalog
USAGE
    exit 2
    ;;
esac
