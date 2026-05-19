#!/bin/sh
# scripts/preflight.sh — vérifications host avant build
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

log_info "Vérifications environnement..."

# Root requis
[ "$(id -u)" -ne 0 ] && { log_error "Requiert root"; exit 1; }

# Commandes host indispensables
MISSING=0
for cmd in awk sed grep tar xz; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Commande manquante: $cmd"
        MISSING=$((MISSING + 1))
    fi
done

# Téléchargement
if ! command -v fetch >/dev/null 2>&1 \
    && ! command -v curl >/dev/null 2>&1 \
    && ! command -v wget >/dev/null 2>&1; then
    log_error "Aucun outil de téléchargement (fetch/curl/wget)"
    MISSING=$((MISSING + 1))
fi

# Outils d'image
if is_freebsd; then
    for cmd in mdconfig newfs gpart makefs; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_warn "Commande FreeBSD manquante: $cmd (certains profils échoueront)"
        fi
    done
else
    log_warn "Host non-FreeBSD détecté (${uname_s:-$(uname -s)})."
    log_warn "Le build cross nécessite qemu-user-static pour l'architecture cible."
    # Cross amd64 depuis linux : binfmt_misc + qemu-aarch64-static pour arm64
    if [ "${ARCH}" = "arm64" ] && ! command -v qemu-aarch64-static >/dev/null 2>&1; then
        log_error "qemu-aarch64-static requis pour builder arm64 depuis Linux"
        MISSING=$((MISSING + 1))
    fi
fi

# Espace disque libre (minimum 20 Go)
AVAIL_KB=$(df -Pk /var/tmp 2>/dev/null | awk 'NR==2 {print $4}')
if [ -z "${AVAIL_KB}" ] || [ "${AVAIL_KB}" -lt 20971520 ]; then
    log_warn "Moins de 20 Go dispo sous /var/tmp — le build peut échouer"
fi

# qemu-user-static service (FreeBSD cross arm64)
if is_freebsd && [ "${ARCH}" = "arm64" ]; then
    if ! service qemu_user_static status >/dev/null 2>&1; then
        log_warn "qemu_user_static non démarré. Tentative d'activation..."
        sysrc qemu_user_static_enable="YES" >/dev/null 2>&1 || true
        service qemu_user_static start 2>/dev/null || \
            log_warn "Échec démarrage qemu_user_static (build arm64 peut planter)"
    fi
fi

if [ "${MISSING}" -gt 0 ]; then
    log_error "${MISSING} prérequis manquant(s). Abandon."
    exit 1
fi

# Prépare l'espace de travail
WORK_DIR="/var/tmp/atome_builder"
mkdir -p "${WORK_DIR}"
mkdir -p "${BUILDER_ROOT}/output"
log_ok "Environnement OK. Work: ${WORK_DIR}"
