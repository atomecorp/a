#!/bin/sh
# Public entry point; all image operations belong to the existing builder.
set -eu
AOS_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
command -v node >/dev/null 2>&1 || { printf '%s\n' 'AOS requires Node.js on the control host.' >&2; exit 1; }
exec node "${AOS_ROOT}/platforms/atomeOS/builder/core/cli.mjs" "$@"
