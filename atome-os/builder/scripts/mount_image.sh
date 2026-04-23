#!/bin/sh
# scripts/mount_image.sh — monte l'image FreeBSD pour chroot
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_IMG=$(cat "${WORK_DIR}/current_image.txt")
WORK_MNT="${WORK_DIR}/mnt"
mkdir -p "${WORK_MNT}"

# Gestion FreeBSD vs Linux host
if is_freebsd; then
    # mdconfig + mount UFS
    log_info "Attache image via mdconfig"
    # Détache d'abord d'éventuels restes
    for md in $(mdconfig -l 2>/dev/null | tr ' ' '\n' | grep -E '^md[0-9]+'); do
        if mdconfig -l -u "${md#md}" 2>/dev/null | grep -q "${WORK_IMG}"; then
            mdconfig -d -u "${md#md}" 2>/dev/null || true
        fi
    done
    MD_UNIT=$(mdconfig -a -t vnode -f "${WORK_IMG}")
    log_info "Unité: ${MD_UNIT}"

    # Détection partition principale (p4 sur VM images récentes, p2 sur certaines)
    for p in p4 p3 p2; do
        DEV="/dev/${MD_UNIT}${p}"
        if [ -e "${DEV}" ]; then
            if fsck_ufs -y "${DEV}" >/dev/null 2>&1 || true; then
                if mount "${DEV}" "${WORK_MNT}" 2>/dev/null; then
                    log_info "Monté ${DEV} sur ${WORK_MNT}"
                    echo "${MD_UNIT}" > "${WORK_DIR}/current_md.txt"
                    echo "${DEV}"     > "${WORK_DIR}/current_dev.txt"
                    break
                fi
            fi
        fi
    done

elif is_linux; then
    # losetup + mount UFS (kernel avec module ufs2 requis + binfmt_misc qemu pour chroot arm64)
    log_info "Attache image via losetup"
    LOOP_DEV=$(losetup --show -fP "${WORK_IMG}")
    echo "${LOOP_DEV}" > "${WORK_DIR}/current_loop.txt"

    for p in p4 p3 p2; do
        PART="${LOOP_DEV}${p}"
        [ -e "${PART}" ] || continue
        if mount -t ufs -o ufstype=ufs2,rw "${PART}" "${WORK_MNT}" 2>/dev/null; then
            log_info "Monté ${PART} sur ${WORK_MNT}"
            break
        fi
    done
    [ -z "$(mountpoint -q "${WORK_MNT}" && echo ok)" ] && {
        log_error "Impossible de monter l'image (kernel sans support UFS2 ?)"
        log_error "Sur Linux, vérifier: modprobe ufs && CONFIG_UFS_FS_WRITE"
        exit 1
    }

    # Monte proc/sys/dev pour chroot
    mount --bind /dev     "${WORK_MNT}/dev"     2>/dev/null || true
    mount --bind /proc    "${WORK_MNT}/proc"    2>/dev/null || true
    # Copie qemu pour cross arm64
    if [ "${ARCH}" = "arm64" ]; then
        cp /usr/bin/qemu-aarch64-static "${WORK_MNT}/usr/bin/" 2>/dev/null || true
    fi
else
    log_error "Host non supporté: $(uname -s)"
    exit 1
fi

# Résolution DNS dans le chroot
cp /etc/resolv.conf "${WORK_MNT}/etc/resolv.conf" 2>/dev/null || true

export WORK_MNT
echo "${WORK_MNT}" > "${WORK_DIR}/current_mnt.txt"
log_ok "Image montée: ${WORK_MNT}"
