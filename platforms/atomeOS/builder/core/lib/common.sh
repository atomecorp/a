#!/bin/sh
# Shared stage context. Only the orchestrator owns mount lifecycle and traps.
set -eu
: "${AOS_PLAN:?Use scripts/aOS.sh to create an explicit build plan}"
BUILDER_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# Stages are in scripts/, the orchestrator is in core/ (both one level below root).
WORK_DIR=$(dirname -- "$AOS_PLAN")
WORK_MNT="${WORK_DIR}/mnt"
WORK_IMG="${WORK_DIR}/work.img"
aos_field() { node "${BUILDER_ROOT}/core/job.mjs" "$AOS_PLAN" field "$1"; }
aos_job() { node "${BUILDER_ROOT}/core/job.mjs" "$AOS_PLAN" "$1"; }
TARGET=$(aos_field target.id)
ARCH=$(aos_field target.arch)
PROFILE=$(aos_field profile)
export BUILDER_ROOT WORK_DIR WORK_MNT WORK_IMG TARGET ARCH PROFILE
log_info() { printf '[AOS] %s\n' "$*" >&2; }
log_error() { printf '[AOS ERROR] %s\n' "$*" >&2; }
has_module() { aos_field modules | tr ' ' '\n' | grep -qx "$1"; }
