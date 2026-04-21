#!/bin/sh
# scripts/configure_audio.sh — JACK + tuning basse latence
#
# Lancé uniquement si le profil inclut la stack "audio" ET a lowlatency=true
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
OVERLAY="${BUILDER_ROOT}/overlays/audio"
PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"

LOWLAT=$(grep -E '^\s*lowlatency:' "${PROFILE_FILE}" | awk '{print $2}')
JACK=$(grep -E '^\s*jack:' "${PROFILE_FILE}" | awk '{print $2}')

# ---------------------------------------------------------------------------
# OSS tuning — activé dans tous les profils audio
# ---------------------------------------------------------------------------
cat "${OVERLAY}/sysctl_audio.conf" >> "${WORK_MNT}/etc/sysctl.conf"
log_info "Sysctl audio appliqués"

# ---------------------------------------------------------------------------
# JACK config utilisateur
# ---------------------------------------------------------------------------
if [ "${JACK}" = "true" ]; then
    INSTALL_USER=$(grep -E '^\s*install_user:' "${BUILDER_ROOT}/core/config.yml" | awk '{print $2}')
    INSTALL_HOME=$(grep -E '^\s*install_home:' "${BUILDER_ROOT}/core/config.yml" | awk '{print $2}')
    : "${INSTALL_USER:=atome}"
    : "${INSTALL_HOME:=/home/atome}"

    mkdir -p "${WORK_MNT}${INSTALL_HOME}/.jack"
    install -m 644 "${OVERLAY}/jackdrc" "${WORK_MNT}${INSTALL_HOME}/.jackdrc"
    install -m 644 "${OVERLAY}/jack_tuning.conf" "${WORK_MNT}${INSTALL_HOME}/.jack/tuning.conf"

    # service rc.d pour démarrer jackd au boot en profil audio
    install -m 755 "${OVERLAY}/jackd.rc" "${WORK_MNT}/etc/rc.d/jackd"
    cat >> "${WORK_MNT}/etc/rc.conf" <<EOF

# AtomeOS — JACK
jackd_enable="YES"
jackd_user="${INSTALL_USER}"
EOF

    chroot "${WORK_MNT}" chown -R "${INSTALL_USER}:${INSTALL_USER}" "${INSTALL_HOME}/.jack" "${INSTALL_HOME}/.jackdrc"
    log_ok "JACK configuré"
fi

# ---------------------------------------------------------------------------
# Priorité temps réel pour l'utilisateur audio
# ---------------------------------------------------------------------------
if [ "${LOWLAT}" = "true" ]; then
    cat >> "${WORK_MNT}/etc/login.conf" <<'EOF'

# AtomeOS — classe audio basse latence
audio:\
    :priority=-5:\
    :ignoretime@:\
    :memorylocked=unlimited:\
    :umask=022:\
    :tc=default:
EOF

    # Applique la classe à l'utilisateur
    INSTALL_USER=$(grep -E '^\s*install_user:' "${BUILDER_ROOT}/core/config.yml" | awk '{print $2}')
    : "${INSTALL_USER:=atome}"
    chroot "${WORK_MNT}" cap_mkdb /etc/login.conf 2>/dev/null || true
    chroot "${WORK_MNT}" pw usermod "${INSTALL_USER}" -L audio 2>/dev/null || true
    log_ok "Classe login audio appliquée"
fi

log_ok "Configuration audio terminée"
