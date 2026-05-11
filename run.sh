#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"

UNAME_VALUE="$(uname -s 2>/dev/null || true)"
case "$UNAME_VALUE" in
  MINGW*|MSYS*|CYGWIN*)
    exec "$ROOT_DIR/scripts/setup/run_windows.sh" "$@"
    ;;
  Darwin*|Linux*|FreeBSD*)
    RUN_ENTRYPOINT_OVERRIDE="./run.sh" exec "$ROOT_DIR/scripts/setup/run_unix.sh" "$@"
    ;;
  *)
    echo "ERROR: Unsupported platform: $UNAME_VALUE"
    exit 1
    ;;
esac
