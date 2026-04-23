#!/bin/sh
# scripts/fetch_base_image.sh — télécharge l'image FreeBSD officielle
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"

WORK_DIR="/var/tmp/atome_builder"
mkdir -p "${WORK_DIR}"

# ---------------------------------------------------------------------------
# Construction de l'URL en fonction de l'architecture
# ---------------------------------------------------------------------------
case "${ARCH}" in
    amd64)
        # VM images (raw) : plus pratiques que les ISO pour le chroot
        IMG_NAME="FreeBSD-${FREEBSD_VERSION}-amd64.raw.xz"
        URL="https://download.freebsd.org/releases/VM-IMAGES/${FREEBSD_VERSION}/amd64/Latest/${IMG_NAME}"
        ALT_URL="https://download.freebsd.org/releases/VM-IMAGES/${FREEBSD_VERSION}/amd64/${IMG_NAME}"
        ;;
    arm64)
        IMG_NAME="FreeBSD-${FREEBSD_VERSION}-arm64-aarch64.img.xz"
        URL="https://download.freebsd.org/releases/arm64/aarch64/ISO-IMAGES/${FREEBSD_VERSION}/${IMG_NAME}"
        ALT_URL="https://download.freebsd.org/releases/VM-IMAGES/${FREEBSD_VERSION}/aarch64/Latest/${IMG_NAME}"
        ;;
    *)
        log_error "Architecture inconnue: ${ARCH}"; exit 1 ;;
esac

TARGET_XZ="${WORK_DIR}/${IMG_NAME}"
TARGET_RAW="${WORK_DIR}/${IMG_NAME%.xz}"

# ---------------------------------------------------------------------------
# Téléchargement (avec fallback sur miroirs)
# ---------------------------------------------------------------------------
if [ ! -f "${TARGET_RAW}" ]; then
    if [ ! -f "${TARGET_XZ}" ]; then
        log_info "Téléchargement: ${URL}"
        if ! download "${URL}" "${TARGET_XZ}"; then
            log_warn "Échec miroir principal, essai alt..."
            download "${ALT_URL}" "${TARGET_XZ}" || {
                log_error "Téléchargement impossible pour ${IMG_NAME}"
                exit 1
            }
        fi
    fi

    # Vérif checksum si dispo
    SHA_URL="${URL%.xz}.xz.sha256"
    SHA_FILE="${WORK_DIR}/${IMG_NAME}.sha256"
    if download "${SHA_URL}" "${SHA_FILE}" 2>/dev/null; then
        log_info "Vérification SHA256..."
        EXPECTED=$(awk '{print $NF}' "${SHA_FILE}" | head -n1)
        ACTUAL=$(sha256sum "${TARGET_XZ}" 2>/dev/null | awk '{print $1}' \
                 || sha256 -q "${TARGET_XZ}" 2>/dev/null)
        if [ -n "${EXPECTED}" ] && [ "${EXPECTED}" != "${ACTUAL}" ]; then
            log_error "Checksum invalide pour ${IMG_NAME}"
            rm -f "${TARGET_XZ}"
            exit 1
        fi
        log_ok "Checksum OK"
    else
        log_warn "Pas de checksum disponible, on continue sans vérification"
    fi

    log_info "Décompression ${IMG_NAME}..."
    xz -d -k "${TARGET_XZ}"
fi

# Copie de travail pour ne pas polluer l'image source (cache)
WORK_IMG="${WORK_DIR}/work-${ARCH}-${PROFILE}.img"
log_info "Copie image de travail: ${WORK_IMG}"
cp "${TARGET_RAW}" "${WORK_IMG}"

# Extension image à la taille du profil
PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"
SIZE_MB=$(grep -E '^\s*size_mb:' "${PROFILE_FILE}" | awk '{print $2}')
[ -z "${SIZE_MB}" ] && SIZE_MB=6144

log_info "Extension image à ${SIZE_MB} Mo"
truncate -s "${SIZE_MB}m" "${WORK_IMG}"

# Export pour les étapes suivantes
echo "${WORK_IMG}" > "${WORK_DIR}/current_image.txt"
log_ok "Image prête: ${WORK_IMG}"
