#!/bin/sh
# scripts/configure_network.sh — réseau auto + TLS + service auto-update
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
OVERLAY_NET="${BUILDER_ROOT}/overlays/network"
OVERLAY_SVC="${BUILDER_ROOT}/overlays/services"

# ---------------------------------------------------------------------------
# DHCP automatique sur toutes les interfaces ethernet + wifi
# ---------------------------------------------------------------------------
cat >> "${WORK_MNT}/etc/rc.conf" <<'EOF'

# Atome OS — réseau auto
ifconfig_DEFAULT="SYNCDHCP"
# wifi : wpa_supplicant sur toutes les interfaces wlan
wpa_supplicant_enable="YES"
EOF

install -m 644 "${OVERLAY_NET}/wpa_supplicant.conf" \
    "${WORK_MNT}/etc/wpa_supplicant.conf"

# ---------------------------------------------------------------------------
# TLS : trust store CA + update au boot
# ---------------------------------------------------------------------------
chroot "${WORK_MNT}" ln -sf /usr/local/share/certs/ca-root-nss.crt \
    /etc/ssl/cert.pem 2>/dev/null || true

# ---------------------------------------------------------------------------
# Service auto-update : pkg upgrade + pull framework + rebuild si diff
# ---------------------------------------------------------------------------
if [ "${AUTO_UPDATE}" = "true" ]; then
    log_info "Installation service auto-update"
    install -m 755 "${OVERLAY_SVC}/atome_updater.sh" \
        "${WORK_MNT}/usr/local/libexec/atome_updater.sh"
    install -m 755 "${OVERLAY_SVC}/atome_updater.rc" \
        "${WORK_MNT}/etc/rc.d/atome_updater"

    # cron : vérification toutes les 6h (intervalle configurable dans config.yml)
    mkdir -p "${WORK_MNT}/var/cron/tabs"
    cat > "${WORK_MNT}/var/cron/tabs/root" <<'EOF'
# Atome OS auto-update : toutes les 6h avec jitter aléatoire
SHELL=/bin/sh
PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin
MAILTO=""

0 */6 * * * sleep $(jot -r 1 0 1800); /usr/local/libexec/atome_updater.sh >> /var/log/atome_updater.log 2>&1
EOF

    cat >> "${WORK_MNT}/etc/rc.conf" <<'EOF'

# Atome OS — services
cron_enable="YES"
atome_updater_enable="YES"
EOF
    log_ok "Auto-update activé (intervalle 6h + jitter)"
else
    log_info "Auto-update désactivé par option --no-auto-update"
fi

# ---------------------------------------------------------------------------
# Firewall PF minimal : sortant ouvert, entrant fermé (posture kiosk)
# ---------------------------------------------------------------------------
install -m 644 "${OVERLAY_NET}/pf.conf" "${WORK_MNT}/etc/pf.conf"
cat >> "${WORK_MNT}/etc/rc.conf" <<'EOF'

# Atome OS — PF firewall
pf_enable="YES"
pflog_enable="NO"
EOF

log_ok "Réseau + TLS + auto-update configurés"
