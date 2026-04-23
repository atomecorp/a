#!/bin/sh
# scripts/finalize_image.sh — démonte, compacte, produit checksums
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_IMG=$(cat "${WORK_DIR}/current_image.txt")
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")

# ---------------------------------------------------------------------------
# Ménage dans l'image : caches, logs, historiques
# ---------------------------------------------------------------------------
log_info "Nettoyage image (caches, logs, bash history)..."
chroot "${WORK_MNT}" sh -c "
    rm -rf /var/cache/pkg/* /tmp/* /var/tmp/* 2>/dev/null || true
    find /var/log -type f -exec truncate -s 0 {} \\; 2>/dev/null || true
    rm -f /root/.*history /home/*/.*history 2>/dev/null || true
"

# ---------------------------------------------------------------------------
# Démontage
# ---------------------------------------------------------------------------
log_info "Démontage"
if is_freebsd; then
    MD_UNIT=$(cat "${WORK_DIR}/current_md.txt" 2>/dev/null || true)
    umount -f "${WORK_MNT}" 2>/dev/null || true
    [ -n "${MD_UNIT}" ] && mdconfig -d -u "${MD_UNIT#md}" 2>/dev/null || true
elif is_linux; then
    umount -f "${WORK_MNT}/dev"  2>/dev/null || true
    umount -f "${WORK_MNT}/proc" 2>/dev/null || true
    umount -f "${WORK_MNT}"      2>/dev/null || true
    LOOP=$(cat "${WORK_DIR}/current_loop.txt" 2>/dev/null || true)
    [ -n "${LOOP}" ] && losetup -d "${LOOP}" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Copie vers output/ + compression
# ---------------------------------------------------------------------------
DATE=$(date +%Y%m%d-%H%M)
OUT_NAME="atome-${PROFILE}-${ARCH}-${FREEBSD_VERSION}-${DATE}.img"
OUT_PATH="${BUILDER_ROOT}/output/${OUT_NAME}"

log_info "Copie vers ${OUT_PATH}"
cp "${WORK_IMG}" "${OUT_PATH}"

log_info "Compression xz (ça peut prendre du temps)..."
xz -T0 -9 "${OUT_PATH}"
OUT_PATH="${OUT_PATH}.xz"

# ---------------------------------------------------------------------------
# Checksums
# ---------------------------------------------------------------------------
log_info "Génération checksums"
( cd "${BUILDER_ROOT}/output" && \
    if command -v sha256 >/dev/null 2>&1; then
        sha256 "$(basename "${OUT_PATH}")" > "$(basename "${OUT_PATH}").sha256"
    else
        sha256sum "$(basename "${OUT_PATH}")" > "$(basename "${OUT_PATH}").sha256"
    fi
)

# Résumé
SIZE=$(du -h "${OUT_PATH}" | awk '{print $1}')
log_ok "Image finale : ${OUT_PATH} (${SIZE})"
log_ok "Checksum     : ${OUT_PATH}.sha256"
