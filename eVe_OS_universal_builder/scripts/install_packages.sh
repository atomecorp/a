#!/bin/sh
# scripts/install_packages.sh — pkg install dans le chroot selon profil + stacks
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/../core/lib/common.sh"
. "${SCRIPT_DIR}/../core/lib/yaml.sh"

WORK_DIR="/var/tmp/atome_builder"
WORK_MNT=$(cat "${WORK_DIR}/current_mnt.txt")
PROFILE_FILE="${BUILDER_ROOT}/profiles/${PROFILE}.yml"

# ---------------------------------------------------------------------------
# Force le repo "latest" plutôt que "quarterly" pour avoir les versions à jour
# ---------------------------------------------------------------------------
mkdir -p "${WORK_MNT}/usr/local/etc/pkg/repos"
cat > "${WORK_MNT}/usr/local/etc/pkg/repos/FreeBSD.conf" <<'EOF'
# Forcé par AtomeOS Universal Builder : toujours suivre latest
FreeBSD: {
  url: "pkg+http://pkg.FreeBSD.org/${ABI}/latest",
  mirror_type: "srv",
  signature_type: "fingerprints",
  fingerprints: "/usr/share/keys/pkg",
  enabled: yes
}
EOF
log_info "Repo pkg configuré sur latest"

# ---------------------------------------------------------------------------
# Collecte des stacks à installer pour ce profil
# ---------------------------------------------------------------------------
STACKS=$(awk '
    /^stacks:/ { capture=1; next }
    capture && /^[[:space:]]*-/ {
        sub(/^[[:space:]]*-[[:space:]]*/, "")
        sub(/[[:space:]]*#.*$/, "")
        print
        next
    }
    capture && /^[^[:space:]-]/ { capture=0 }
' "${PROFILE_FILE}")

log_info "Stacks pour profil ${PROFILE}: $(echo ${STACKS} | tr '\n' ' ')"

# ---------------------------------------------------------------------------
# Extraction de la liste pkg: de chaque stack
# ---------------------------------------------------------------------------
ALL_PKGS=""
for stack in ${STACKS}; do
    stack_file="${BUILDER_ROOT}/packages/${stack}.yml"
    [ ! -f "${stack_file}" ] && { log_warn "Stack file absent: ${stack_file}"; continue; }

    pkgs=$(awk '
        /^[[:space:]]+pkg:/ { capture=1; next }
        capture && /^[[:space:]]+-/ {
            sub(/^[[:space:]]+-[[:space:]]*/, "")
            sub(/[[:space:]]*#.*$/, "")
            print
            next
        }
        capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
    ' "${stack_file}")

    ALL_PKGS="${ALL_PKGS} ${pkgs}"
done

# Dédoublonne
UNIQ_PKGS=$(echo ${ALL_PKGS} | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' ')
log_info "Paquets à installer: ${UNIQ_PKGS}"

# ---------------------------------------------------------------------------
# Extras éventuels (section `extras:` du profil)
# ---------------------------------------------------------------------------
EXTRAS=$(awk '
    /^extras:/ { capture=1; next }
    capture && /^[[:space:]]*-/ {
        sub(/^[[:space:]]*-[[:space:]]*/, "")
        sub(/[[:space:]]*#.*$/, "")
        print
        next
    }
    capture && /^[^[:space:]-]/ { capture=0 }
' "${PROFILE_FILE}" | tr '\n' ' ')

# ---------------------------------------------------------------------------
# Installation dans le chroot
# ---------------------------------------------------------------------------
if is_freebsd; then
    CHROOT="chroot ${WORK_MNT}"
else
    CHROOT="chroot ${WORK_MNT}"
fi

log_info "Mise à jour index pkg..."
${CHROOT} pkg update -f || { log_error "pkg update a échoué"; exit 1; }

log_info "Installation des paquets..."
${CHROOT} pkg install -y ${UNIQ_PKGS} ${EXTRAS}

# Post-install spécifiques aux stacks
for stack in ${STACKS}; do
    case "${stack}" in
        js)
            # Installe globalement les outils npm déclarés
            npm_globals=$(awk '
                /^[[:space:]]+npm_global:/ { capture=1; next }
                capture && /^[[:space:]]+-/ {
                    sub(/^[[:space:]]+-[[:space:]]*/, "")
                    gsub(/"/, "")
                    sub(/[[:space:]]*#.*$/, "")
                    print
                }
                capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
            ' "${BUILDER_ROOT}/packages/js.yml")
            if [ -n "${npm_globals}" ]; then
                log_info "npm -g install: ${npm_globals}"
                ${CHROOT} npm install -g ${npm_globals} || log_warn "npm global partiel"
            fi
            ;;
        ruby)
            gems=$(awk '
                /^[[:space:]]+gems_global:/ { capture=1; next }
                capture && /^[[:space:]]+-/ {
                    sub(/^[[:space:]]+-[[:space:]]*/, "")
                    gsub(/"/, "")
                    sub(/[[:space:]]*#.*$/, "")
                    print
                }
                capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
            ' "${BUILDER_ROOT}/packages/ruby.yml")
            if [ -n "${gems}" ]; then
                log_info "gem install: ${gems}"
                ${CHROOT} gem install --no-document ${gems} || log_warn "gem install partiel"
            fi
            ;;
        rust)
            cargos=$(awk '
                /^[[:space:]]+cargo_global:/ { capture=1; next }
                capture && /^[[:space:]]+-/ {
                    sub(/^[[:space:]]+-[[:space:]]*/, "")
                    gsub(/"/, "")
                    sub(/[[:space:]]*#.*$/, "")
                    print
                }
                capture && /^[[:space:]]*[a-z_]+:/ && !/^[[:space:]]+-/ { capture=0 }
            ' "${BUILDER_ROOT}/packages/rust.yml")
            if [ -n "${cargos}" ]; then
                log_info "cargo install: ${cargos}"
                ${CHROOT} cargo install ${cargos} || log_warn "cargo install partiel"
            fi
            ;;
    esac
done

# Nettoyage cache pkg (gain d'espace)
${CHROOT} pkg clean -ay >/dev/null 2>&1 || true

log_ok "Paquets installés"
