#!/bin/sh
# core/lib/common.sh — fonctions utilitaires partagées
# POSIX sh, fonctionne sur FreeBSD /bin/sh et bash

# --- Couleurs (désactivées si non-TTY) -------------------------------------
if [ -t 2 ]; then
    C_RED='\033[0;31m'
    C_GRN='\033[0;32m'
    C_YLW='\033[0;33m'
    C_BLU='\033[0;34m'
    C_RST='\033[0m'
else
    C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_RST=''
fi

log_info()  { printf '%b[INFO]%b  %s\n'  "${C_BLU}" "${C_RST}" "$*" >&2; }
log_ok()    { printf '%b[OK]%b    %s\n'  "${C_GRN}" "${C_RST}" "$*" >&2; }
log_warn()  { printf '%b[WARN]%b  %s\n'  "${C_YLW}" "${C_RST}" "$*" >&2; }
log_error() { printf '%b[ERROR]%b %s\n'  "${C_RED}" "${C_RST}" "$*" >&2; }

# --- Helpers --------------------------------------------------------------
require_cmd() {
    for c in "$@"; do
        if ! command -v "$c" >/dev/null 2>&1; then
            log_error "Commande manquante : $c"
            return 1
        fi
    done
}

is_freebsd() {
    [ "$(uname -s)" = "FreeBSD" ]
}

is_linux() {
    [ "$(uname -s)" = "Linux" ]
}

# Télécharge une URL en essayant fetch puis curl puis wget
download() {
    url="$1"
    dest="$2"
    if command -v fetch >/dev/null 2>&1; then
        fetch -o "${dest}" "${url}"
    elif command -v curl >/dev/null 2>&1; then
        curl -L --fail -o "${dest}" "${url}"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "${dest}" "${url}"
    else
        log_error "Aucun outil de téléchargement disponible (fetch/curl/wget)"
        return 1
    fi
}

# Calcule un chemin absolu portable
abspath() {
    ( cd "$(dirname "$1")" && printf '%s/%s\n' "$(pwd)" "$(basename "$1")" )
}

# Retourne 0 si le profil YAML contient la stack donnée
profile_has_stack() {
    profile_file="$1"
    stack_name="$2"
    grep -E "^[[:space:]]*-[[:space:]]*${stack_name}[[:space:]]*\$" "${profile_file}" >/dev/null 2>&1
}

# Nettoyage propre à l'exit
cleanup_on_exit() {
    if [ "${KEEP_WORK:-false}" = "true" ]; then
        log_warn "KEEP_WORK=true → le répertoire de travail est conservé"
        return
    fi
    if [ -n "${WORK_MNT:-}" ] && [ -d "${WORK_MNT}" ]; then
        log_info "Démontage ${WORK_MNT}"
        umount -f "${WORK_MNT}" 2>/dev/null || true
    fi
}
trap cleanup_on_exit EXIT
