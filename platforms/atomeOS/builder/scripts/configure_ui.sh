#!/bin/sh
# The server service exists independently of the local display session.
set -eu
. "$(dirname -- "$0")/../core/lib/common.sh"
install -m 755 "${BUILDER_ROOT}/overlays/services/atome_server.rc" "${WORK_MNT}/usr/local/etc/rc.d/atome_server"
install -m 755 "${BUILDER_ROOT}/overlays/services/start_server.sh" "${WORK_MNT}/usr/local/libexec/aos/start_server.sh"
install -m 755 "${BUILDER_ROOT}/overlays/services/supervise.sh" "${WORK_MNT}/usr/local/libexec/aos/supervise.sh"
install -m 644 "${BUILDER_ROOT}/overlays/ui/atome_ui.conf" "${WORK_MNT}/usr/local/etc/aos/ui.conf"
if has_module display; then
    chroot "$WORK_MNT" test -x /usr/local/bin/cage
    chroot "$WORK_MNT" test -x /usr/local/bin/cog
    install -m 755 "${BUILDER_ROOT}/overlays/ui/atome.rc" "${WORK_MNT}/usr/local/etc/rc.d/atome"
    install -m 755 "${BUILDER_ROOT}/overlays/ui/start_atome.sh" "${WORK_MNT}/usr/local/libexec/aos/start_atome.sh"
    chroot "$WORK_MNT" pw groupmod video -m atome
    printf '%s\n' 'seatd_enable="YES"' 'atome_enable="YES"' >> "${WORK_MNT}/etc/rc.conf"
fi
