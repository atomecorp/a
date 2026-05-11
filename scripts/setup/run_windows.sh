#!/usr/bin/env bash
set -euo pipefail

UNAME_VALUE="$(uname -s 2>/dev/null || true)"
case "$UNAME_VALUE" in
  MINGW*|MSYS*|CYGWIN*)
    ;;
  *)
    echo "INFO: This launcher is for Windows shells only. Use ./run.sh on Unix/macOS/Linux/WSL."
    exec ./run.sh "$@"
    ;;
esac

if ! command -v wsl.exe >/dev/null 2>&1; then
  echo "ERROR: WSL is required but wsl.exe was not found."
  echo "Install WSL and rerun this command."
  exit 1
fi

WIN_PWD="$(pwd -W 2>/dev/null || true)"
if [[ -z "$WIN_PWD" ]] && command -v cygpath >/dev/null 2>&1; then
  WIN_PWD="$(cygpath -w "$(pwd)")"
fi

if [[ -z "$WIN_PWD" || "$WIN_PWD" != *:* ]]; then
  echo "ERROR: Cannot resolve a Windows path for WSL handoff."
  exit 1
fi

DRIVE_LETTER="$(printf '%s' "$WIN_PWD" | cut -d: -f1 | tr '[:upper:]' '[:lower:]')"
REST_PATH="$(printf '%s' "$WIN_PWD" | cut -d: -f2- | sed 's#\\#/#g')"
WSL_PWD="/mnt/$DRIVE_LETTER$REST_PATH"

CMD="cd $(printf '%q' "$WSL_PWD") && ./run.sh"
for arg in "$@"; do
  CMD+=" $(printf '%q' "$arg")"
done

exec wsl.exe bash -lc "$CMD"
