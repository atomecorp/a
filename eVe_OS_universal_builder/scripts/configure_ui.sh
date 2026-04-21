#!/bin/sh
# scripts/configure_ui.sh — autostart compositor Wayland + webview fullscreen
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
OVERLAY="${BUILDER_ROOT}/overlays/ui"
PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"

# Le profil minimal n'a pas d'UI
UI_ENABLED=$(grep -E '^\s*enabled:' "${PROFILE_FILE}" | head -n1 | awk '{print $2}')
if [ "${UI_ENABLED}" = "false" ]; then
    log_info "Profil ${PROFILE} : UI désactivée, skip"
    exit 0
fi

INSTALL_USER=$(grep -E '^\s*install_user:' "${BUILDER_ROOT}/core/config.yml" | awk '{print $2}')
INSTALL_HOME=$(grep -E '^\s*install_home:' "${BUILDER_ROOT}/core/config.yml" | awk '{print $2}')
: "${INSTALL_USER:=atome}"
: "${INSTALL_HOME:=/home/atome}"

# ---------------------------------------------------------------------------
# Service rc.d : atome — démarre seatd, cage, et le runtime Atome
# ---------------------------------------------------------------------------
log_info "Installation service rc.d atome"
install -m 755 "${OVERLAY}/atome.rc" "${WORK_MNT}/etc/rc.d/atome"

# ---------------------------------------------------------------------------
# Script de lancement utilisateur
# ---------------------------------------------------------------------------
mkdir -p "${WORK_MNT}${INSTALL_HOME}/.config/atome"
install -m 755 "${OVERLAY}/start_atome.sh" "${WORK_MNT}${INSTALL_HOME}/.config/atome/start_atome.sh"
install -m 644 "${OVERLAY}/atome_ui.conf" "${WORK_MNT}${INSTALL_HOME}/.config/atome/ui.conf"

chroot "${WORK_MNT}" chown -R "${INSTALL_USER}:${INSTALL_USER}" "${INSTALL_HOME}/.config"

# ---------------------------------------------------------------------------
# Activation du service
# ---------------------------------------------------------------------------
cat >> "${WORK_MNT}/etc/rc.conf" <<EOF

# AtomeOS — UI autostart
seatd_enable="YES"
atome_enable="YES"
atome_user="${INSTALL_USER}"
EOF

# ---------------------------------------------------------------------------
# /etc/gettytab : bannière vide + autologin kiosk sur ttyv0 si voulu
# (désactivé par défaut : on préfère que le service atome lance tout)
# ---------------------------------------------------------------------------

log_ok "UI / webview configurée"
