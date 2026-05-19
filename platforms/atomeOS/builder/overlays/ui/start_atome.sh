#!/bin/sh
# overlays/ui/start_atome.sh
# Lancé par le service rc.d atome sous l'utilisateur atome.
#
# Stratégie :
#   1. Attendre que le réseau soit up (ou timeout)
#   2. Démarrer le backend Atome (Fastify + Tauri si profil le prévoit)
#   3. Lancer cage (kiosk Wayland) qui affiche la webview plein écran
#
# Cage pointe vers http://127.0.0.1:3001 (Fastify) ou 3000 (Axum/Tauri).

set -eu

. "${HOME}/.config/atome/ui.conf"

LOG_DIR="${HOME}/.local/state/atome"
mkdir -p "${LOG_DIR}"

ATOME_DIR="${HOME}/atome"
BACKEND_URL="${ATOME_BACKEND_URL:-http://127.0.0.1:3001}"
WAIT_TIMEOUT="${ATOME_WAIT_TIMEOUT:-30}"

# ---------------------------------------------------------------------------
# Démarrage backend
# ---------------------------------------------------------------------------
start_backend() {
    cd "${ATOME_DIR}"
    if [ -x ./run.sh ]; then
        # run.sh lance Fastify + Tauri
        nohup ./run.sh > "${LOG_DIR}/atome_backend.log" 2>&1 &
    elif [ -f server/server.js ]; then
        nohup node server/server.js > "${LOG_DIR}/atome_backend.log" 2>&1 &
    else
        echo "[atome] Aucun backend détecté, webview seule" >&2
    fi
}

wait_backend() {
    i=0
    while [ "${i}" -lt "${WAIT_TIMEOUT}" ]; do
        if curl -sf "${BACKEND_URL}/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

# ---------------------------------------------------------------------------
# Démarrage UI : cage + webview
# ---------------------------------------------------------------------------
start_ui() {
    export XDG_RUNTIME_DIR="/tmp/wayland-${UID:-$(id -u)}"
    mkdir -p "${XDG_RUNTIME_DIR}"
    chmod 0700 "${XDG_RUNTIME_DIR}"

    # cage -s (secure) lance une app en plein écran sans window manager.
    # L'app lancée est un navigateur minimal en mode kiosk.
    # On utilise cog (WebKit runtime kiosk) si dispo, sinon fallback sur epiphany.
    if command -v cog >/dev/null 2>&1; then
        BROWSER="cog --platform=wl --fullscreen ${BACKEND_URL}"
    elif command -v epiphany >/dev/null 2>&1; then
        BROWSER="epiphany --application-mode ${BACKEND_URL}"
    else
        # Dernier recours : WebKit2 via script minimal
        BROWSER="/usr/local/bin/webkit-webview-kiosk ${BACKEND_URL}"
    fi

    exec cage -s -- sh -c "${BROWSER}" \
        > "${LOG_DIR}/atome_ui.log" 2>&1
}

# ---------------------------------------------------------------------------
# Watchdog : relance la boucle si elle tombe
# ---------------------------------------------------------------------------
main() {
    start_backend
    wait_backend || echo "[atome] Timeout backend, UI lancée quand même" >&2
    start_ui
}

main "$@"
