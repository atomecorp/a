#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"

"$ROOT_DIR/scripts/setup/bootstrap.sh"

if [[ "${1:-}" == "--audit" ]]; then
  exec node "$ROOT_DIR/scripts/setup/cli/run.mjs" --audit
fi

echo "[setup][info] Environment prepared. Use ./run.sh to launch the development runtime."
