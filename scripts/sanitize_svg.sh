#!/usr/bin/env bash
#
# sanitize-all-128fit.sh
# ----------------------
# Fit & center all SVGs into 128×128 using a wrapper transform.
#
# Usage:
#   ./sanitize-all-128fit.sh
set -euo pipefail

# Resolve script directory robustly (works with bash/sh, symlinks, arbitrary launch dirs)
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in
    /*) ;;
    *) SOURCE="$DIR/$SOURCE" ;;
  esac
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DIRS=(
  "$PROJECT_ROOT/src/assets/images/icons"
  "$PROJECT_ROOT/src/assets/images/logos"
)

SANITIZER="$SCRIPT_DIR/sanitize-svgs-128fit.cjs"

if [ ! -f "$SANITIZER" ]; then
  echo "✖ Cannot find sanitize-svgs-128fit.cjs next to this script" >&2
  exit 1
fi

for dir in "${DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "→ 128×128 fit in $dir ..."
    node "$SANITIZER" "$dir"
  else
    echo "⚠ Skipping missing directory: $dir"
  fi
done

echo "✔ All done."
