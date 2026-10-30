#!/bin/sh
# Package the already-built real system as a distribution for native bsdinstall.
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
[ "$(aos_field mode)" = installer ] || exit 0
chroot "$WORK_MNT" test -x /usr/sbin/bsdinstall
# Snapshot before adding installer files or changing its service startup. This
# excludes the payload itself and all device/runtime state from the distribution.
tar --one-file-system --exclude './dev/*' --exclude './tmp/*' --exclude './var/run/*' \
    --exclude './boot/efi/*' -cJf "${WORK_DIR}/system.txz" -C "$WORK_MNT" .
DIST="${WORK_MNT}/usr/local/share/aos-installer"
mkdir -p "$DIST" "${WORK_MNT}/usr/local/libexec/aos/installer/desktop" "${WORK_MNT}/usr/local/libexec/aos/core" "${WORK_MNT}/usr/local/sbin"
install -m 644 "${WORK_DIR}/system.txz" "${DIST}/system.txz"
install -m 644 "${BUILDER_ROOT}/installer/desktop/install.mjs" "${WORK_MNT}/usr/local/libexec/aos/installer/desktop/install.mjs"
install -m 644 "${BUILDER_ROOT}/core/artifacts.mjs" "${WORK_MNT}/usr/local/libexec/aos/core/artifacts.mjs"
install -m 755 "${BUILDER_ROOT}/installer/desktop/aOS-install" "${WORK_MNT}/usr/local/sbin/aOS-install"
aos_job installer-metadata
# Installer boot does not start atome/eVe, create device identities or modify
# another disk. Native installation requires its own explicit confirmations.
printf '%s\n' 'atome_firstboot_enable="NO"' 'atome_server_enable="NO"' 'atome_enable="NO"' 'seatd_enable="NO"' >> "${WORK_MNT}/etc/rc.conf"
printf '%s\n' '/usr/local/sbin/aOS-install </dev/console >/dev/console 2>&1' >> "${WORK_MNT}/etc/rc.local"
