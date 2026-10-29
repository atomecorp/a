#!/bin/sh
# Native executor for the canonical AOS recipe; macOS uses the CLI/SSH boundary.
set -eu
[ "$#" -eq 1 ] && [ -f "$1" ] || { printf '%s\n' 'Use scripts/aOS.sh build --target ... --source-commit ...' >&2; exit 1; }
AOS_PLAN=$1
BUILDER_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export AOS_PLAN BUILDER_ROOT
. "${BUILDER_ROOT}/core/lib/common.sh"
cleanup() {
    result=0
    if [ -f "${WORK_DIR}/devfs-mounted" ]; then
        if umount "${WORK_MNT}/dev"; then rm "${WORK_DIR}/devfs-mounted"; else result=1; fi
    fi
    if [ -f "${WORK_DIR}/root-mounted" ]; then
        if umount "${WORK_MNT}"; then rm "${WORK_DIR}/root-mounted"; else result=1; fi
    fi
    if [ -f "${WORK_DIR}/md-unit" ] && [ "$result" -eq 0 ]; then
        unit=$(cat "${WORK_DIR}/md-unit")
        case "$unit" in md*[!0-9]*|'') result=1 ;; md*)
            if mdconfig -d -u "${unit#md}"; then rm "${WORK_DIR}/md-unit"; else result=1; fi ;;
            *) result=1 ;;
        esac
    fi
    [ "$result" -eq 0 ] || log_error "Cleanup incomplete: keep ${WORK_DIR} and detach its recorded resources manually"
    return "$result"
}
trap 'status=$?; trap - EXIT; if ! cleanup; then status=1; fi; exit "$status"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for stage in preflight fetch_base_image mount_image install_packages install_runtime configure_boot configure_ui configure_audio configure_network; do
    log_info "Stage: ${stage} (${TARGET})"
    /bin/sh "${BUILDER_ROOT}/scripts/${stage}.sh"
done
cleanup
/bin/sh "${BUILDER_ROOT}/scripts/finalize_image.sh"
log_info "Assembly complete. Boot, WebGPU, audio and MIDI remain unvalidated."
