#!/usr/bin/env bash
# Canonical Xcode project, scheme and target discovery for both release channels.

xcodebuild_for_container() {
    xcodebuild "$CONTAINER_FLAG" "$CONTAINER_PATH" "$@"
}

extract_setting() {
    local settings="$1"
    local key="$2"
    printf '%s\n' "$settings" | sed -n "s/^[[:space:]]*${key} = //p" | tail -n 1
}

append_json_values() {
    local json="$1"
    local key="$2"

    while IFS= read -r value; do
        [ -n "$value" ] && printf '%s\n' "$value"
    done < <(
        printf '%s' "$json" | /usr/bin/ruby -rjson -e '
            document = JSON.parse(STDIN.read)
            root = document["workspace"] || document.fetch("project")
            root.fetch(ARGV.fetch(0), []).each { |value| puts value }
        ' "$key"
    )
}

resolve_xcode_container() {
    local workspaces=()
    local projects=()

    shopt -s nullglob
    workspaces=("$IOS_DIRECTORY"/*.xcworkspace)
    projects=("$IOS_DIRECTORY"/*.xcodeproj)
    shopt -u nullglob

    if [ "${#workspaces[@]}" -eq 1 ]; then
        CONTAINER_FLAG="-workspace"
        CONTAINER_PATH="${workspaces[0]}"
        return
    fi

    if [ "${#workspaces[@]}" -gt 1 ]; then
        fail "Multiple top-level workspaces were found; choose one before releasing."
    fi

    if [ "${#projects[@]}" -eq 1 ]; then
        CONTAINER_FLAG="-project"
        CONTAINER_PATH="${projects[0]}"
        return
    fi

    fail "Expected exactly one top-level .xcworkspace or .xcodeproj in $IOS_DIRECTORY."
}

resolve_version_ledger() {
    local project_path
    local project_count=0

    shopt -s nullglob
    for project_path in "$IOS_DIRECTORY"/*.xcodeproj; do
        VERSION_LEDGER_PROJECT_FILE="$project_path/project.pbxproj"
        ((project_count += 1))
    done
    shopt -u nullglob

    [ "$project_count" -eq 1 ] || fail "Expected exactly one top-level .xcodeproj to store release versions."

    [ -f "$VERSION_LEDGER_PROJECT_FILE" ] || fail "Xcode version ledger is missing: $VERSION_LEDGER_PROJECT_FILE"
}

release_settings_for_target() {
    xcodebuild_for_container -target "$1" -configuration "$CONFIGURATION" -showBuildSettings
}

release_settings_for_scheme() {
    xcodebuild_for_container -scheme "$1" -configuration "$CONFIGURATION" -destination "generic/platform=iOS" -showBuildSettings
}

discover_application_scheme() {
    local project_json
    local scheme
    local target
    local settings
    local product_type
    local application_schemes=()
    local application_targets=()
    local matching_schemes=()
    local matching_scheme_count=0

    project_json="$(xcodebuild_for_container -list -json)"
    printf '%s' "$project_json" | /usr/bin/ruby -rjson -e 'JSON.parse(STDIN.read)' 2>/dev/null \
        || fail "xcodebuild -list -json did not return readable JSON."
    while IFS= read -r target; do
        settings="$(release_settings_for_target "$target")"
        product_type="$(extract_setting "$settings" "PRODUCT_TYPE")"
        # The Apple Watch app ships inside the iOS app: it is never the scheme's application.
        if [ "$product_type" = "com.apple.product-type.application" ] && [ "$(extract_setting "$settings" "PLATFORM_NAME")" != "watchos" ]; then
            application_targets+=("$target")
        fi
    done < <(append_json_values "$project_json" "targets")

    # Only a scheme named after an iOS application target can be the app's: another scheme (the
    # Apple Watch app's) has no iOS destination to read its settings for.
    while IFS= read -r scheme; do
        for target in ${application_targets[@]+"${application_targets[@]}"}; do
            [ "$scheme" = "$target" ] || continue
            settings="$(release_settings_for_scheme "$scheme")"
            product_type="$(extract_setting "$settings" "PRODUCT_TYPE")"
            if [ "$product_type" = "com.apple.product-type.application" ]; then
                application_schemes+=("$scheme")
            fi
        done
    done < <(append_json_values "$project_json" "schemes")

    # macOS ships bash 3.2, where an empty "${array[@]}" is an unbound
    # variable under `set -u`; the guarded form reports the real error instead.
    for scheme in ${application_schemes[@]+"${application_schemes[@]}"}; do
        for target in ${application_targets[@]+"${application_targets[@]}"}; do
            if [ "$scheme" = "$target" ]; then
                matching_schemes+=("$scheme")
                ((matching_scheme_count += 1))
            fi
        done
    done

    if [ "$matching_scheme_count" -ne 1 ]; then
        fail "Expected one app scheme named after its application target, found $matching_scheme_count."
    fi

    APP_SCHEME="${matching_schemes[0]}"
}

discover_release_targets() {
    local project_json
    local target
    local settings
    local product_type
    local target_bundle_identifier
    local target_marketing_version
    local target_build
    local application_targets=()
    local application_target_count=0
    local app_settings

    project_json="$(xcodebuild_for_container -list -json)"
    while IFS= read -r target; do
        settings="$(release_settings_for_target "$target")"
        product_type="$(extract_setting "$settings" "PRODUCT_TYPE")"
        target_bundle_identifier="$(extract_setting "$settings" "PRODUCT_BUNDLE_IDENTIFIER")"

        # The Apple Watch app ships inside the iOS app: versioned with it, like an extension.
        if [ "$product_type" = "com.apple.product-type.application" ] && [ "$(extract_setting "$settings" "PLATFORM_NAME")" = "watchos" ]; then
            EXTENSION_TARGETS+=("$target")
            ((EXTENSION_TARGET_COUNT += 1))
        elif [ "$product_type" = "com.apple.product-type.application" ]; then
            application_targets+=("$target")
            ((application_target_count += 1))
            if [ "$target_bundle_identifier" = "$APP_BUNDLE_IDENTIFIER" ]; then
                APP_TARGET="$target"
                app_settings="$settings"
            fi
        elif [ "$product_type" = "com.apple.product-type.app-extension" ]; then
            EXTENSION_TARGETS+=("$target")
            ((EXTENSION_TARGET_COUNT += 1))
        fi
    done < <(append_json_values "$project_json" "targets")

    if [ "$application_target_count" -ne 1 ] || [ -z "$APP_TARGET" ]; then
        fail "Expected exactly one application target matching scheme $APP_SCHEME."
    fi

    MARKETING_VERSION="$(extract_setting "$app_settings" "MARKETING_VERSION")"
    CURRENT_BUILD="$(extract_setting "$app_settings" "CURRENT_PROJECT_VERSION")"
    TEAM_ID="$(extract_setting "$app_settings" "DEVELOPMENT_TEAM")"
    SIGNING_STYLE="$(extract_setting "$app_settings" "CODE_SIGN_STYLE")"
    SIGNING_IDENTITY="$(extract_setting "$app_settings" "CODE_SIGN_IDENTITY")"

    [ -n "$MARKETING_VERSION" ] || fail "MARKETING_VERSION is not configured for $APP_TARGET."
    [[ "$CURRENT_BUILD" =~ ^[0-9]+$ ]] || fail "CURRENT_PROJECT_VERSION must be an integer, found: $CURRENT_BUILD"
    [ -n "$TEAM_ID" ] || fail "DEVELOPMENT_TEAM is not configured for $APP_TARGET."
    [ -n "$SIGNING_STYLE" ] || fail "CODE_SIGN_STYLE is not configured for $APP_TARGET."

    for target in ${EXTENSION_TARGETS[@]+"${EXTENSION_TARGETS[@]}"}; do
        settings="$(release_settings_for_target "$target")"
        target_marketing_version="$(extract_setting "$settings" "MARKETING_VERSION")"
        target_build="$(extract_setting "$settings" "CURRENT_PROJECT_VERSION")"
        target_bundle_identifier="$(extract_setting "$settings" "PRODUCT_BUNDLE_IDENTIFIER")"

        [ "$target_marketing_version" = "$MARKETING_VERSION" ] || fail "Extension $target ($target_bundle_identifier) has MARKETING_VERSION $target_marketing_version, expected $MARKETING_VERSION."
        [ "$target_build" = "$CURRENT_BUILD" ] || fail "Extension $target ($target_bundle_identifier) has build $target_build, expected $CURRENT_BUILD."
    done

    NEXT_BUILD=$((10#$CURRENT_BUILD + 1))
    increment_marketing_version
    align_with_product_versions
}

