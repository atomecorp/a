#!/bin/sh
# overlays/services/atome_updater.sh
# Vérifie et applique les mises à jour en arrière-plan.
#
# Cibles :
#   1. pkg upgrade (système FreeBSD + runtimes)
#   2. git pull du framework Atome
#   3. re-install deps (npm ci / bundle) si package-lock ou Gemfile.lock a changé
#
# Exécuté par cron toutes les 6h (avec jitter) ou au boot via rc.d.
# Logs dans /var/log/atome_updater.log.

set -eu

LOGFILE="${LOGFILE:-/var/log/atome_updater.log}"
INSTALL_USER="${INSTALL_USER:-atome}"
INSTALL_HOME="${INSTALL_HOME:-/home/${INSTALL_USER}}"
FRAMEWORK_DIR="${FRAMEWORK_DIR:-${INSTALL_HOME}/atome}"

log() {
    printf '[%s] %s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "$*" >> "${LOGFILE}"
}

exec >> "${LOGFILE}" 2>&1

log "=== atome_updater start ==="

# ---------------------------------------------------------------------------
# 1. Vérifie connectivité
# ---------------------------------------------------------------------------
if ! fetch -q -T 5 -o /dev/null http://pkg.FreeBSD.org/ 2>/dev/null; then
    log "Pas de connectivité, skip"
    exit 0
fi

# ---------------------------------------------------------------------------
# 2. pkg upgrade système
# ---------------------------------------------------------------------------
log "pkg update"
pkg update -f >> "${LOGFILE}" 2>&1 || log "pkg update failed"

log "pkg upgrade"
pkg upgrade -y -n >> "${LOGFILE}" 2>&1    # -n = dry run pour loguer
pkg upgrade -y    >> "${LOGFILE}" 2>&1 || log "pkg upgrade failed"

# ---------------------------------------------------------------------------
# 3. Framework Atome : git pull + npm install si nécessaire
# ---------------------------------------------------------------------------
if [ -d "${FRAMEWORK_DIR}/.git" ]; then
    log "Framework: git fetch"
    su - "${INSTALL_USER}" -c "
        cd '${FRAMEWORK_DIR}' && \
        git fetch --depth 1 origin >> '${LOGFILE}' 2>&1
    " || log "git fetch failed"

    # Compare HEAD local et remote
    LOCAL=$(su - "${INSTALL_USER}" -c "cd '${FRAMEWORK_DIR}' && git rev-parse HEAD")
    REMOTE=$(su - "${INSTALL_USER}" -c "cd '${FRAMEWORK_DIR}' && git rev-parse @{u}" 2>/dev/null)

    if [ -n "${REMOTE}" ] && [ "${LOCAL}" != "${REMOTE}" ]; then
        log "Update disponible : ${LOCAL} -> ${REMOTE}"

        # Sauvegarde (simple : symlink vers tag local)
        su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}' && \
            git tag atome-backup-\$(date +%Y%m%d%H%M) HEAD 2>/dev/null || true
        "

        # Reset et pull
        su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}' && \
            git reset --hard origin/HEAD >> '${LOGFILE}' 2>&1
        "

        # npm install si package-lock a changé
        NEED_NPM=$(su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}' && \
            git diff --name-only ${LOCAL} HEAD 2>/dev/null | \
                grep -E '^(package(-lock)?\\.json|pnpm-lock\\.yaml|yarn\\.lock)\$' || true
        ")

        if [ -n "${NEED_NPM}" ]; then
            log "Réinstallation deps npm"
            su - "${INSTALL_USER}" -c "
                cd '${FRAMEWORK_DIR}' && npm ci --no-audit --no-fund
            " >> "${LOGFILE}" 2>&1 || log "npm ci failed"
        fi

        # bundle install si Gemfile.lock a changé
        NEED_BUNDLE=$(su - "${INSTALL_USER}" -c "
            cd '${FRAMEWORK_DIR}' && \
            git diff --name-only ${LOCAL} HEAD 2>/dev/null | grep -E 'Gemfile(\\.lock)?\$' || true
        ")

        if [ -n "${NEED_BUNDLE}" ] && [ -f "${FRAMEWORK_DIR}/Gemfile" ]; then
            log "Réinstallation gems"
            su - "${INSTALL_USER}" -c "
                cd '${FRAMEWORK_DIR}' && bundle install
            " >> "${LOGFILE}" 2>&1 || log "bundle install failed"
        fi

        # Restart service atome si UI active
        if service atome status >/dev/null 2>&1; then
            log "Restart service atome"
            service atome restart >> "${LOGFILE}" 2>&1 || log "restart failed"
        fi

        log "Update appliqué : ${REMOTE}"
    else
        log "Framework à jour (${LOCAL})"
    fi
fi

log "=== atome_updater end ==="
