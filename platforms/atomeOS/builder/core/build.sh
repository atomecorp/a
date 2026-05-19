#!/bin/sh
# =============================================================================
# Atome OS / eVe — Universal Builder
# core/build.sh — orchestrateur principal
#
# Usage:
#   sudo ./core/build.sh --arch amd64 --profile desktop
#   sudo ./core/build.sh --arch arm64 --profile minimal
#   sudo ./core/build.sh --arch amd64 --profile dev
#   sudo ./core/build.sh --arch amd64 --profile audio
#
# Options:
#   --arch <amd64|arm64>         architecture cible
#   --profile <name>             profil (minimal|desktop|dev|audio|custom)
#   --freebsd-version <x.y>      override la détection "latest"
#   --keep-work                  conserve le chroot après build (debug)
#   --no-auto-update             désactive le service auto-update dans l'image
#   --help                       affiche cette aide
# =============================================================================

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILDER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
SCRIPTS_DIR="${BUILDER_ROOT}/scripts"

# shellcheck source=lib/common.sh
. "${LIB_DIR}/common.sh"
# shellcheck source=lib/yaml.sh
. "${LIB_DIR}/yaml.sh"
# shellcheck source=lib/versions.sh
. "${LIB_DIR}/versions.sh"

# ---------------------------------------------------------------------------
# Defaults + parsing arguments
# ---------------------------------------------------------------------------
ARCH=""
PROFILE="desktop"
FREEBSD_VERSION=""
KEEP_WORK=false
AUTO_UPDATE=true

usage() {
    sed -n '2,20p' "$0"
    exit 0
}

while [ $# -gt 0 ]; do
    case "$1" in
        --arch)              ARCH="$2"; shift 2 ;;
        --profile)           PROFILE="$2"; shift 2 ;;
        --freebsd-version)   FREEBSD_VERSION="$2"; shift 2 ;;
        --keep-work)         KEEP_WORK=true; shift ;;
        --no-auto-update)    AUTO_UPDATE=false; shift ;;
        --help|-h)           usage ;;
        *) log_error "Option inconnue: $1"; usage ;;
    esac
done

[ -z "${ARCH}" ] && { log_error "--arch est requis (amd64 ou arm64)"; exit 1; }
[ "$(id -u)" -ne 0 ] && { log_error "build.sh doit être exécuté en root (sudo)"; exit 1; }

case "${ARCH}" in
    amd64|arm64) ;;
    *) log_error "Architecture non supportée: ${ARCH}"; exit 1 ;;
esac

PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"
[ ! -f "${PROFILE_FILE}" ] && { log_error "Profil introuvable: ${PROFILE_FILE}"; exit 1; }

log_info "=========================================="
log_info "Atome OS Universal Builder"
log_info "  Architecture : ${ARCH}"
log_info "  Profil       : ${PROFILE}"
log_info "  Auto-update  : ${AUTO_UPDATE}"
log_info "=========================================="

# ---------------------------------------------------------------------------
# Résolution des versions "latest"
# ---------------------------------------------------------------------------
if [ -z "${FREEBSD_VERSION}" ]; then
    FREEBSD_VERSION="$(resolve_freebsd_latest)"
fi
log_info "FreeBSD RELEASE ciblé : ${FREEBSD_VERSION}"

NODE_VERSION="$(resolve_node_lts)"
log_info "Node LTS ciblé        : ${NODE_VERSION}"

RUBY_VERSION="$(resolve_ruby_latest)"
log_info "Ruby ciblé            : ${RUBY_VERSION}"

export BUILDER_ROOT ARCH PROFILE FREEBSD_VERSION NODE_VERSION RUBY_VERSION AUTO_UPDATE KEEP_WORK

# ---------------------------------------------------------------------------
# Pipeline de build
# ---------------------------------------------------------------------------
run_step() {
    step_name="$1"
    script="$2"
    log_info ">>> [Étape] ${step_name}"
    if ! "${SCRIPTS_DIR}/${script}"; then
        log_error "Étape échouée : ${step_name}"
        exit 1
    fi
    log_ok   "<<< [OK]     ${step_name}"
}

run_step "Pré-vérifs environnement"         preflight.sh
run_step "Téléchargement image FreeBSD"     fetch_base_image.sh
run_step "Montage image de travail"         mount_image.sh
run_step "Installation paquets système"     install_packages.sh
run_step "Installation runtime Atome"       install_runtime.sh
run_step "Configuration boot silencieux"    configure_boot.sh
run_step "Configuration UI / webview"       configure_ui.sh
run_step "Configuration réseau + update"    configure_network.sh

# Config audio uniquement si le profil le demande
if profile_has_stack "${PROFILE_FILE}" audio; then
    run_step "Configuration audio basse latence" configure_audio.sh
fi

run_step "Finalisation image"               finalize_image.sh

log_ok "=========================================="
log_ok "Image générée avec succès dans ${BUILDER_ROOT}/output/"
log_ok "=========================================="
