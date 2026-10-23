#!/usr/bin/env bash
# Shared release version computation, product-file rollback and publication ledger.

increment_marketing_version() {
    local version_prefix
    local version_component
    local component_width
    local next_component

    [[ "$MARKETING_VERSION" =~ ^[0-9]+(\.[0-9]+)+$ ]] || fail "MARKETING_VERSION must contain dot-separated numeric components, found: $MARKETING_VERSION"

    version_prefix="${MARKETING_VERSION%.*}"
    version_component="${MARKETING_VERSION##*.}"
    component_width=${#version_component}
    next_component=$((10#$version_component + 1))
    printf -v next_component "%0${component_width}d" "$next_component"
    NEXT_MARKETING_VERSION="$version_prefix.$next_component"
}

# Returns the version, or a non-zero status with a one-line diagnostic the
# caller reports. This helper runs inside command substitutions where `fail`
# would be swallowed by the surrounding command, so it never calls it.
read_product_version() {
    local file="$1"
    local version

    [ -s "$file" ] || {
        printf '%s is missing or empty.\n' "$file" >&2
        return 1
    }

    if [[ "$file" == *.json ]]; then
        version="$(/usr/bin/ruby -rjson -e '
            begin
                document = JSON.parse(File.read(ARGV[0]))
            rescue JSON::ParserError, SystemCallError => error
                detail = error.message.gsub(/\s+/, " ").strip[0, 200]
                warn "#{ARGV[0]} is not readable as JSON: #{detail}"
                exit 1
            end
            print document.fetch("version", "")
        ' "$file")" || return 1
    else
        version="$(tr -d '[:space:]' < "$file")" || return 1
    fi

    [[ "$version" =~ ^[0-9]+(\.[0-9]+)+$ ]] || {
        printf '%s must hold dot-separated numeric components, found: %s\n' "$file" "$version" >&2
        return 1
    }

    printf '%s' "$version"
}

highest_version() {
    /usr/bin/ruby -e 'puts ARGV.max_by { |version| Gem::Version.new(version) }' "$@"
}

# The App Store version, atome and eVe move together. The next release is the
# highest of the incremented Xcode ledger and both product version files, so a
# product version bumped by hand is published as is instead of being overtaken.
align_with_product_versions() {
    local ledger_version="$NEXT_MARKETING_VERSION"
    local json_version

    ATOME_VERSION="$(read_product_version "$ATOME_VERSION_FILE")" \
        || fail "The atome version file is unusable: $ATOME_VERSION_FILE"
    EVE_VERSION="$(read_product_version "$EVE_VERSION_FILE")" \
        || fail "The eVe version file is unusable: $EVE_VERSION_FILE"
    # Read before calling highest_version: a failure inside an argument
    # substitution is invisible to `set -e`, which is how an emptied
    # version.json used to pass discovery and only break the version writers.
    json_version="$(read_product_version "$ATOME_VERSION_JSON_FILE")" \
        || fail "The version ledger is unusable: $ATOME_VERSION_JSON_FILE is empty or invalid JSON; restore it before releasing."

    NEXT_MARKETING_VERSION="$(highest_version "$ledger_version" "$ATOME_VERSION" "$EVE_VERSION" "$json_version")"
}

# Written before the archive so the published bundle carries its own version;
# restored if the release does not complete.
write_product_version_files() {
    local file
    local content

    for file in "$ATOME_VERSION_FILE" "$EVE_VERSION_FILE" "$ATOME_VERSION_JSON_FILE"; do
        # The sentinel keeps a trailing newline that $(...) would strip.
        content="$(cat "$file"; printf x)"
        PRODUCT_VERSION_BACKUPS+=("$file" "${content%x}")

    done
    node "$REPO_ROOT/scripts/ios/version-ledger.mjs" products "$NEXT_MARKETING_VERSION"
}

restore_product_version_files() {
    local index

    for ((index = 0; index < ${#PRODUCT_VERSION_BACKUPS[@]}; index += 2)); do
        printf '%s' "${PRODUCT_VERSION_BACKUPS[index + 1]}" > "${PRODUCT_VERSION_BACKUPS[index]}"
    done
    PRODUCT_VERSION_BACKUPS=()
}

persist_version_ledger() {
    node "$REPO_ROOT/scripts/ios/version-ledger.mjs" ledger \
        "$MARKETING_VERSION" "$NEXT_MARKETING_VERSION" "$CURRENT_BUILD" "$NEXT_BUILD" "$((1 + EXTENSION_TARGET_COUNT))"
}
