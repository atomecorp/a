#!/usr/bin/env bash
set -euo pipefail
umask 077

# Opens two independent Codex CLI sessions in macOS Terminal windows.
# GPT uses the regular Codex home; DeepSeek uses its isolated worker home.
# The ChatGPT/Codex desktop app configuration is never modified.

MAIN_CODEX_HOME="${MAIN_CODEX_HOME:-$HOME/.codex}"
DEEPSEEK_CODEX_HOME="${DEEPSEEK_CODEX_HOME:-$HOME/.codex-deepseek-worker}"

say() { printf '%s\n' "$*"; }
err() { printf 'ERROR: %s\n' "$*" >&2; }

if [[ "${OSTYPE:-}" != darwin* ]]; then
  err "This launcher runs on macOS only."
  exit 1
fi
if ! command -v osascript >/dev/null 2>&1; then
  err "AppleScript support (osascript) was not found."
  exit 1
fi
if [[ $# -gt 1 ]]; then
  err "Usage: $0 [PROJECT_DIRECTORY]"
  exit 2
fi

PROJECT_DIR="${1:-${ATOME_PROJECT_DIR:-$PWD}}"
if [[ ! -d "$PROJECT_DIR" ]]; then
  err "Project directory does not exist: $PROJECT_DIR"
  exit 2
fi
PROJECT_DIR="$(cd -- "$PROJECT_DIR" && pwd -P)"

find_codex() {
  local candidate
  if [[ -n "${CODEX_BIN:-}" ]]; then
    [[ -x "$CODEX_BIN" ]] && { printf '%s\n' "$CODEX_BIN"; return 0; }
    return 1
  fi

  for candidate in \
    "$HOME/.local/bin/codex" \
    "/opt/homebrew/bin/codex" \
    "/usr/local/bin/codex" \
    "$HOME/.npm-global/bin/codex" \
    "$HOME/.volta/bin/codex" \
    "$HOME/.bun/bin/codex"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  candidate="$(command -v codex 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  # Codex may be on the interactive zsh PATH but absent from the environment
  # inherited by this Bash script (for example when launched from a shortcut).
  if command -v zsh >/dev/null 2>&1; then
    while IFS= read -r candidate; do
      if [[ -n "$candidate" && -x "$candidate" ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done < <(zsh -lic 'whence -p codex' </dev/null 2>/dev/null || true)
  fi

  # Also check the active npm global prefix, used by some Codex CLI installs.
  if command -v npm >/dev/null 2>&1; then
    candidate="$(npm prefix -g 2>/dev/null || true)/bin/codex"
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  return 1
}

CODEX_EXECUTABLE="$(find_codex || true)"
if [[ -z "$CODEX_EXECUTABLE" ]]; then
  if [[ -n "${CODEX_BIN:-}" ]]; then
    err "CODEX_BIN is set but does not point to an executable: $CODEX_BIN"
    exit 1
  fi

  err "Codex CLI was not found in PATH, the interactive zsh PATH, common install paths, or npm's global prefix."
  err "Current PATH: $PATH"

  if [[ ! -t 0 ]]; then
    err "Codex CLI was not found. Run this script in Terminal to install it, or install it with:"
    err "curl -fsSL https://chatgpt.com/codex/install.sh | sh"
    exit 1
  fi

  printf 'Codex CLI is missing. Install it with the official macOS installer now? [y/N] '
  read -r install_choice
  case "$install_choice" in
    y|Y|yes|YES|Yes) ;;
    *)
      err "Codex CLI is required to open the two Terminal sessions."
      err "Install it with: curl -fsSL https://chatgpt.com/codex/install.sh | sh"
      exit 1
      ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    err "curl is required to install Codex CLI."
    exit 1
  fi
  curl -fsSL https://chatgpt.com/codex/install.sh | sh
  CODEX_EXECUTABLE="$(find_codex || true)"
  if [[ -z "$CODEX_EXECUTABLE" ]]; then
    err "The installer finished, but Codex CLI was not found. Open a new Terminal and run: command -v codex"
    exit 1
  fi
fi

if [[ "$MAIN_CODEX_HOME" == "$DEEPSEEK_CODEX_HOME" ]]; then
  err "GPT and DeepSeek must use separate CODEX_HOME directories."
  exit 1
fi
if [[ ! -f "$DEEPSEEK_CODEX_HOME/config.toml" ]]; then
  err "DeepSeek configuration was not found at: $DEEPSEEK_CODEX_HOME/config.toml"
  err "Run your DeepSeek setup once first, then launch this script again."
  exit 1
fi
if ! grep -qE '^model_provider[[:space:]]*=[[:space:]]*"deepseek"' "$DEEPSEEK_CODEX_HOME/config.toml"; then
  err "The isolated DeepSeek config does not select the DeepSeek provider."
  err "Expected model_provider = \"deepseek\" in $DEEPSEEK_CODEX_HOME/config.toml"
  exit 1
fi

KEY_FILE="$PROJECT_DIR/private/DeepSeek_key"
if [[ -z "${DEEPSEEK_API_KEY:-}" && ! -f "$KEY_FILE" ]]; then
  err "DeepSeek API key not found."
  err "Set DEEPSEEK_API_KEY or put it in: $KEY_FILE"
  exit 1
fi

# Stage the key privately because a newly opened Terminal shell does not
# reliably inherit environment variables from an already running Terminal.
KEY_TEMP="$(mktemp "${TMPDIR:-/tmp}/codex-deepseek-key.XXXXXX")"
trap 'rm -f "$KEY_TEMP"' EXIT
if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  printf '%s' "$DEEPSEEK_API_KEY" > "$KEY_TEMP"
else
  tr -d '\r\n' < "$KEY_FILE" > "$KEY_TEMP"
fi
chmod 600 "$KEY_TEMP"

printf -v quoted_project '%q' "$PROJECT_DIR"
printf -v quoted_codex '%q' "$CODEX_EXECUTABLE"
printf -v quoted_main_home '%q' "$MAIN_CODEX_HOME"
printf -v quoted_deepseek_home '%q' "$DEEPSEEK_CODEX_HOME"
printf -v quoted_key_temp '%q' "$KEY_TEMP"

GPT_COMMAND="cd $quoted_project && unset DEEPSEEK_API_KEY DEEPSEEK_MODEL DEEPSEEK_REASONING DEEPSEEK_CODEX_HOME CODEX_SQLITE_HOME && export CODEX_HOME=$quoted_main_home && exec $quoted_codex"
DEEPSEEK_COMMAND="cd $quoted_project && export DEEPSEEK_API_KEY=\"\$(cat $quoted_key_temp)\" && rm -f $quoted_key_temp && export CODEX_HOME=$quoted_deepseek_home && unset CODEX_SQLITE_HOME && exec $quoted_codex"

say "Opening two Codex CLI windows in Terminal."
say "GPT: $MAIN_CODEX_HOME"
say "DeepSeek: $DEEPSEEK_CODEX_HOME"
say "Project: $PROJECT_DIR"

osascript - "$GPT_COMMAND" "$DEEPSEEK_COMMAND" "$KEY_TEMP" <<'APPLESCRIPT'
on run argv
  set gptCommand to item 1 of argv
  set deepseekCommand to item 2 of argv
  set keyFile to item 3 of argv
  tell application "Terminal"
    activate
    do script gptCommand
    do script deepseekCommand
  end tell
  repeat 50 times
    try
      do shell script "test -e " & quoted form of keyFile
    on error
      return
    end try
    delay 0.1
  end repeat
end run
APPLESCRIPT
