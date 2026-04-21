#!/bin/sh
# scripts/install_runtime.sh — clone + installe le framework Atome dans l'image
#
# - Clone https://github.com/atomecorp/a
# - Audite package.json / Gemfile / Cargo.toml
# - Neutralise la blocklist (wavesurfer.js abandonné)
# - Lance install_full.sh / npm install / bundle install
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"
. "${SCRIPT_DIR}/../core/lib/yaml.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"

FRAMEWORK_URL=$(yaml_get "${BUILDER_ROOT}/core/config.yml" "sources.framework.repo")
FRAMEWORK_BRANCH=$(yaml_get "${BUILDER_ROOT}/core/config.yml" "sources.framework.branch")
INSTALL_USER=$(yaml_get "${BUILDER_ROOT}/core/config.yml" "runtime.install_user")
INSTALL_HOME=$(yaml_get "${BUILDER_ROOT}/core/config.yml" "runtime.install_home")
FRAMEWORK_DIR=$(yaml_get "${BUILDER_ROOT}/core/config.yml" "runtime.framework_dir")

: "${FRAMEWORK_URL:=https://github.com/atomecorp/a}"
: "${FRAMEWORK_BRANCH:=main}"
: "${INSTALL_USER:=atome}"
: "${INSTALL_HOME:=/home/atome}"
: "${FRAMEWORK_DIR:=${INSTALL_HOME}/atome}"

# ---------------------------------------------------------------------------
# Création utilisateur dédié
# ---------------------------------------------------------------------------
if ! chroot "${WORK_MNT}" id "${INSTALL_USER}" >/dev/null 2>&1; then
    log_info "Création utilisateur ${INSTALL_USER}"
    chroot "${WORK_MNT}" pw useradd "${INSTALL_USER}" \
        -m -d "${INSTALL_HOME}" -s /bin/sh \
        -G wheel,operator,video,audio -c "Atome user"
    # Mot de passe vide pour kiosk ; à sécuriser en prod via auto-update
    chroot "${WORK_MNT}" sh -c "echo | pw usermod ${INSTALL_USER} -h 0"
fi

# ---------------------------------------------------------------------------
# Clone du framework
# ---------------------------------------------------------------------------
log_info "Clone ${FRAMEWORK_URL} (branche ${FRAMEWORK_BRANCH})"
chroot "${WORK_MNT}" sh -c "
    rm -rf '${FRAMEWORK_DIR}'
    git clone --depth 1 --branch '${FRAMEWORK_BRANCH}' \
        '${FRAMEWORK_URL}' '${FRAMEWORK_DIR}'
    chown -R ${INSTALL_USER}:${INSTALL_USER} ${INSTALL_HOME}
"

# ---------------------------------------------------------------------------
# Audit des dépendances (log uniquement, sert à vérifier l'alignement)
# ---------------------------------------------------------------------------
audit_framework_deps() {
    log_info "Audit des dépendances du framework..."
    for f in package.json Gemfile Cargo.toml src-tauri/Cargo.toml CMakeLists.txt; do
        target="${WORK_MNT}${FRAMEWORK_DIR}/${f}"
        if [ -f "${target}" ]; then
            log_info "  ✓ ${f} présent"
        else
            log_info "  ✗ ${f} absent"
        fi
    done
}
audit_framework_deps

# ---------------------------------------------------------------------------
# Blocklist : wavesurfer.js abandonné dans Squirrel
#
# Stratégie :
#   1. Supprimer l'entrée de package.json (via jq)
#   2. Si présente dans un lockfile, forcer un re-résolve (npm install --no-audit)
#   3. Supprimer les dossiers node_modules/wavesurfer* éventuels
# ---------------------------------------------------------------------------
BLOCKLIST=$(awk '
    /^[[:space:]]+blocklist:/ { capture=1; next }
    capture && /^[[:space:]]+-/ {
        sub(/^[[:space:]]+-[[:space:]]*/, "")
        sub(/[[:space:]]*#.*$/, "")
        print
        next
    }
    capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
' "${BUILDER_ROOT}/core/config.yml")

log_info "Blocklist: ${BLOCKLIST}"

for pkg in ${BLOCKLIST}; do
    pkg_json="${WORK_MNT}${FRAMEWORK_DIR}/package.json"
    if [ -f "${pkg_json}" ] && grep -q "\"${pkg}\"" "${pkg_json}" 2>/dev/null; then
        log_info "Retrait '${pkg}' de package.json"
        # Utilise jq si dispo dans le chroot, sinon sed prudent
        if chroot "${WORK_MNT}" command -v jq >/dev/null 2>&1; then
            chroot "${WORK_MNT}" sh -c "
                cd '${FRAMEWORK_DIR}' && \
                jq 'del(.dependencies[\"${pkg}\"]) | del(.devDependencies[\"${pkg}\"]) | del(.peerDependencies[\"${pkg}\"])' \
                    package.json > package.json.new && \
                mv package.json.new package.json
            "
        else
            # sed fallback (ligne entière)
            chroot "${WORK_MNT}" sh -c "
                cd '${FRAMEWORK_DIR}' && \
                sed -i '' -E '/\"${pkg}\"[[:space:]]*:/d' package.json 2>/dev/null || \
                sed -i -E '/\"${pkg}\"[[:space:]]*:/d' package.json
            "
        fi
    fi
    # Nettoie les dossiers node_modules éventuels
    find "${WORK_MNT}${FRAMEWORK_DIR}/node_modules" -maxdepth 2 -type d \
        -name "${pkg}*" -exec rm -rf {} + 2>/dev/null || true
done

# ---------------------------------------------------------------------------
# Installation des dépendances
# ---------------------------------------------------------------------------
# Mode éditable (dev) = juste clone, pas de build
FRAMEWORK_MODE=$(grep -E '^\s*framework_mode:' "${PROFILE_FILE}" | awk '{print $2}' || true)

if [ "${FRAMEWORK_MODE}" = "editable" ]; then
    log_info "Mode dev/editable : pas de build, juste clone"
else
    log_info "Installation des deps JS..."
    chroot "${WORK_MNT}" su - "${INSTALL_USER}" -c "
        cd '${FRAMEWORK_DIR}' && npm install --no-audit --no-fund
    " || log_warn "npm install partiel (à retenter au premier boot)"

    # Gemfile présent ?
    if [ -f "${WORK_MNT}${FRAMEWORK_DIR}/Gemfile" ]; then
        log_info "Installation des gems Ruby..."
        chroot "${WORK_MNT}" su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}' && bundle install --path vendor/bundle
        " || log_warn "bundle install partiel"
    fi

    # Cargo.toml Tauri ?
    if [ -f "${WORK_MNT}${FRAMEWORK_DIR}/src-tauri/Cargo.toml" ]; then
        log_info "Build Tauri (peut être long)..."
        chroot "${WORK_MNT}" su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}/src-tauri' && cargo fetch
        " || log_warn "cargo fetch partiel"
        # Le build final est fait au premier boot pour gagner du temps d'image
    fi
fi

# ---------------------------------------------------------------------------
# Marqueur version installé
# ---------------------------------------------------------------------------
chroot "${WORK_MNT}" sh -c "
    cd '${FRAMEWORK_DIR}' && \
    git rev-parse HEAD > '${INSTALL_HOME}/.atome_version' 2>/dev/null || true
    echo '${FRAMEWORK_BRANCH}' > '${INSTALL_HOME}/.atome_branch'
    chown -R ${INSTALL_USER}:${INSTALL_USER} ${INSTALL_HOME}
"

log_ok "Runtime Atome installé dans ${FRAMEWORK_DIR}"
