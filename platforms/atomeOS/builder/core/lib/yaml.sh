#!/bin/sh
# core/lib/yaml.sh — lecteur YAML minimaliste (POSIX sh)
#
# Pour un YAML robuste, installer `yq` (go-yq) et préférer ses appels.
# Ce wrapper fournit un fallback autonome pour les cas simples clé:valeur.

yaml_has_yq() {
    command -v yq >/dev/null 2>&1
}

# yaml_get <file> <dotted.path>
#   Ex: yaml_get core/config.yml 'builder.output_dir'
yaml_get() {
    file="$1"
    path="$2"
    if yaml_has_yq; then
        yq -r ".${path}" "${file}" 2>/dev/null
        return $?
    fi
    # Fallback grossier : cherche la dernière clé du chemin
    last_key="${path##*.}"
    grep -E "^[[:space:]]*${last_key}:" "${file}" 2>/dev/null \
        | head -n1 \
        | sed -E "s/^[[:space:]]*${last_key}:[[:space:]]*//; s/[[:space:]]*#.*\$//; s/^[\"']//; s/[\"']\$//"
}

# yaml_list <file> <dotted.path>
#   Récupère les items d'une liste YAML sous la clé indiquée.
yaml_list() {
    file="$1"
    path="$2"
    if yaml_has_yq; then
        yq -r ".${path}[]" "${file}" 2>/dev/null
        return $?
    fi
    # Fallback : extrait les lignes "- item" sous la clé
    last_key="${path##*.}"
    awk -v key="${last_key}" '
        $0 ~ "^[[:space:]]*" key ":" { capture=1; next }
        capture && $0 ~ "^[[:space:]]*-[[:space:]]*" {
            sub(/^[[:space:]]*-[[:space:]]*/, "")
            sub(/[[:space:]]*#.*$/, "")
            gsub(/^["'"'"']|["'"'"']$/, "")
            print
            next
        }
        capture && $0 ~ "^[^[:space:]-]" { capture=0 }
    ' "${file}"
}
