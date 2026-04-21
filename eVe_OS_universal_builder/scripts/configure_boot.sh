#!/bin/sh
# scripts/configure_boot.sh — boot silencieux, splash, rc.conf minimal
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
OVERLAY="${BUILDER_ROOT}/overlays/boot"

# ---------------------------------------------------------------------------
# /boot/loader.conf — silencieux + splash + vt framebuffer
# ---------------------------------------------------------------------------
log_info "Installation /boot/loader.conf"
install -m 644 "${OVERLAY}/loader.conf" "${WORK_MNT}/boot/loader.conf.atome"

# Merge avec l'existant (on ne casse pas les defaults FreeBSD)
cat "${WORK_MNT}/boot/loader.conf.atome" >> "${WORK_MNT}/boot/loader.conf"
rm "${WORK_MNT}/boot/loader.conf.atome"

# Copie du logo splash
if [ -f "${OVERLAY}/atome_logo.bmp" ]; then
    install -m 644 "${OVERLAY}/atome_logo.bmp" "${WORK_MNT}/boot/atome_logo.bmp"
    log_info "Splash BMP installé"
else
    log_warn "Aucun atome_logo.bmp, splash désactivé"
    sed -i '' -e '/splash_bmp/d;/bitmap_load/d;/bitmap_name/d' \
        "${WORK_MNT}/boot/loader.conf" 2>/dev/null \
        || sed -i -e '/splash_bmp/d;/bitmap_load/d;/bitmap_name/d' \
                "${WORK_MNT}/boot/loader.conf"
fi

# ---------------------------------------------------------------------------
# /etc/rc.conf — services minimaux, startmsgs off
# ---------------------------------------------------------------------------
log_info "Installation /etc/rc.conf"
cat "${OVERLAY}/rc.conf" >> "${WORK_MNT}/etc/rc.conf"

# ---------------------------------------------------------------------------
# Supprime les messages motd
# ---------------------------------------------------------------------------
echo '' > "${WORK_MNT}/etc/motd.template"
echo '' > "${WORK_MNT}/var/run/motd" 2>/dev/null || true

# ---------------------------------------------------------------------------
# /etc/ttys — désactive getty sur ttyv1..v7 (aucune console visible)
# On garde ttyv0 en "off secure" pour urgences en mode rescue.
# ---------------------------------------------------------------------------
log_info "Désactivation getty sur consoles virtuelles"
sed -E -i '' \
    -e 's/^(ttyv[1-7].*)on( +secure)?/\1off\2/' \
    "${WORK_MNT}/etc/ttys" 2>/dev/null \
    || sed -E -i \
        -e 's/^(ttyv[1-7].*)on( +secure)?/\1off\2/' \
        "${WORK_MNT}/etc/ttys"

# ---------------------------------------------------------------------------
# /etc/sysctl.conf — silence noyau
# ---------------------------------------------------------------------------
cat >> "${WORK_MNT}/etc/sysctl.conf" <<'EOF'

# AtomeOS — silence console
kern.consmsgbuf_size=131072
kern.quiet_boot=1
EOF

log_ok "Boot silencieux configuré"
