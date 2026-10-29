#!/bin/sh
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
[ ! -f "${WORK_DIR}/root-mounted" ] && [ ! -f "${WORK_DIR}/md-unit" ] || { log_error 'Refusing to publish a mounted image'; exit 1; }
aos_job finalize
