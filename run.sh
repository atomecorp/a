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
  Darwin*)
    for ARG in "$@"; do
      case "$ARG" in
        --help|-h|--status|--stop|--logs)
          RUN_ENTRYPOINT_OVERRIDE="./run.sh" exec "$ROOT_DIR/scripts/setup/run_unix.sh" "$@"
          ;;
      esac
    done
    maintain_build_cache() {
      if command -v node >/dev/null 2>&1; then
        node "$ROOT_DIR/scripts/build_cache_retention.mjs" --apply --phase="$1"
      else
        echo "[build-cache] Deferred until the existing bootstrap installs Node.js."
      fi
    }
    maintain_build_cache start
    RUN_PID=""
    stop_run() {
      if [[ -n "$RUN_PID" ]]; then kill -TERM "$RUN_PID" 2>/dev/null || true; fi
    }
    trap stop_run INT TERM
    trap 'maintain_build_cache end' EXIT
    RUN_ENTRYPOINT_OVERRIDE="./run.sh" "$ROOT_DIR/scripts/setup/run_unix.sh" "$@" <&0 &
    RUN_PID=$!
    set +e
    wait "$RUN_PID"
    RUN_STATUS=$?
    # An interrupted wait must settle the existing runner before cache cleanup.
    if kill -0 "$RUN_PID" 2>/dev/null; then wait "$RUN_PID"; RUN_STATUS=$?; fi
    exit "$RUN_STATUS"
    ;;
  Linux*|FreeBSD*)
    RUN_ENTRYPOINT_OVERRIDE="./run.sh" exec "$ROOT_DIR/scripts/setup/run_unix.sh" "$@"
    ;;
  *)
    echo "ERROR: Unsupported platform: $UNAME_VALUE"
    exit 1
    ;;
esac
