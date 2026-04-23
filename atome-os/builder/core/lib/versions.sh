#!/bin/sh
# core/lib/versions.sh — résolution dynamique des versions "latest"
#
# Toute version marquée "latest" dans config.yml est résolue au build time.

# --- FreeBSD RELEASE courant ---------------------------------------------
# Interroge l'index des releases et extrait la plus haute version RELEASE
# (pas RC, pas BETA, pas STABLE).
resolve_freebsd_latest() {
    index_url="https://download.freebsd.org/releases/amd64/amd64/"
    html="$(download "${index_url}" /dev/stdout 2>/dev/null || true)"

    if [ -z "${html}" ]; then
        log_warn "Impossible de contacter ${index_url}, fallback 15.0-RELEASE"
        echo "15.0-RELEASE"
        return
    fi

    # Extrait les "XX.Y-RELEASE/" du listing HTML
    version="$(printf '%s' "${html}" \
        | grep -oE '[0-9]+\.[0-9]+-RELEASE/' \
        | sed 's#/##' \
        | sort -V \
        | tail -n1)"

    if [ -z "${version}" ]; then
        log_warn "Version FreeBSD non détectée, fallback 15.0-RELEASE"
        echo "15.0-RELEASE"
    else
        echo "${version}"
    fi
}

# --- Node LTS courant ----------------------------------------------------
# Interroge https://nodejs.org/dist/index.json et prend la dernière LTS.
resolve_node_lts() {
    idx_url="https://nodejs.org/dist/index.json"
    tmp="$(mktemp)"
    if download "${idx_url}" "${tmp}" >/dev/null 2>&1; then
        # Première entrée avec "lts":"..." non false = la plus récente
        ver="$(grep -oE '"version":"v[0-9]+\.[0-9]+\.[0-9]+","date":"[^"]+","[^"]+":"[^"]+","lts":"[^"]+"' "${tmp}" \
            | head -n1 \
            | sed -E 's/.*"version":"v([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')"
        rm -f "${tmp}"
        if [ -n "${ver}" ]; then
            echo "${ver}"
            return
        fi
    fi
    rm -f "${tmp}" 2>/dev/null
    log_warn "Node LTS non détecté, fallback 22.x"
    echo "22"
}

# --- Ruby 3.x courant ----------------------------------------------------
# Interroge https://www.ruby-lang.org/en/downloads/releases/ (via cache pkg FreeBSD
# comme stratégie fiable : on se contentera de la version pkg installera).
resolve_ruby_latest() {
    # Valeur symbolique : le pkg install de FreeBSD fournira la dernière 3.x.
    echo "3"
}

# --- Rust stable ---------------------------------------------------------
resolve_rust_latest() {
    tmp="$(mktemp)"
    if download "https://static.rust-lang.org/dist/channel-rust-stable.toml" "${tmp}" >/dev/null 2>&1; then
        ver="$(grep -m1 '^version = ' "${tmp}" | sed -E 's/.*"([^"]+)".*/\1/' | awk '{print $1}')"
        rm -f "${tmp}"
        [ -n "${ver}" ] && { echo "${ver}"; return; }
    fi
    rm -f "${tmp}" 2>/dev/null
    echo "stable"
}
