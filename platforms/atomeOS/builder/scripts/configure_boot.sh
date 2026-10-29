#!/bin/sh
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
cat "${BUILDER_ROOT}/overlays/boot/rc.conf" >> "${WORK_MNT}/etc/rc.conf"
# Keep the official target bootloader, DTBs, loader configuration and rescue console.
# No blanket console muting before physical boot and recovery have been validated.
mkdir -p "${WORK_MNT}/usr/local/libexec/aos" "${WORK_MNT}/usr/local/etc/rc.d" "${WORK_MNT}/usr/local/etc/aos"
install -m 755 "${BUILDER_ROOT}/overlays/services/atome_firstboot.rc" "${WORK_MNT}/usr/local/etc/rc.d/atome_firstboot"
install -m 644 "${BUILDER_ROOT}/overlays/services/firstboot.mjs" "${WORK_MNT}/usr/local/libexec/aos/firstboot.mjs"
# Never distribute a shared SSH host identity, even while SSH is disabled.
for host_key in "${WORK_MNT}/etc/ssh/ssh_host_"*; do
    if [ -f "$host_key" ]; then rm "$host_key"; fi
done
