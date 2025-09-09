#!/usr/bin/env bash
#
# sanitize-all-128fit.sh
# ----------------------
# Fit & center all SVGs into 128×128 using a wrapper transform.
#
# Usage:
#   ./sanitize-all-128fit.sh
set -euo pipefail

DIRS=(
  "src/assets/images/icons"
  "src/assets/images/logos"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
