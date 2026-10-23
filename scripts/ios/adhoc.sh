#!/usr/bin/env bash
# Ad Hoc lifecycle composes the canonical discovery, archive and version owners.

release_cleanup() {
    if [ -n "$RELEASE_LOCK" ]; then rmdir "$RELEASE_LOCK"; fi
}

acquire_release_lock() {
    RELEASE_LOCK="$REPO_ROOT/temp/ios-release.lock"
    mkdir -p "$REPO_ROOT/temp"
    if ! mkdir "$RELEASE_LOCK" 2>/dev/null; then
        RELEASE_LOCK=""
        fail "Another iOS release owns temp/ios-release.lock; inspect its process before removing a stale lock."
    fi
    trap release_cleanup EXIT
    trap 'restore_product_version_files; exit 130' INT
    trap 'restore_product_version_files; exit 143' TERM
}

finish_adhoc_release() {
    local directory="$1"
    local ipa="$2"
    CURRENT_STEP="Ad Hoc signature and provisioning validation"
    node "$REPO_ROOT/scripts/ios/signing.mjs" validate "$ipa" "$directory" "$TEAM_ID"
    # Prepared bundles carry the intended versions; source files remain unchanged
    # until publication is confirmed. The report pins their original contents.
    restore_product_version_files
    node "$REPO_ROOT/scripts/ios/release.mjs" prepare "$directory" "$ipa" "$MARKETING_VERSION" "$CURRENT_BUILD"
    if [ "$PREPARE_ONLY" = true ]; then
        printf '\nPREPARED (not published)\nVersion: %s\nBuild: %s\nReport: %s/release.json\n' "$NEXT_MARKETING_VERSION" "$NEXT_BUILD" "$directory"
        return
    fi
    publish_prepared_release "$directory/release.json"
}

publish_prepared_release() {
    local report="$1"
    CURRENT_STEP="Prepared release verification"
    node "$REPO_ROOT/scripts/ios/release.mjs" check "$report"
    CURRENT_STEP="Ad Hoc atomic publication"
    node "$REPO_ROOT/scripts/ios/release.mjs" publish "$report"
    CURRENT_STEP="Published release version reconciliation"
    # Publication receipts survive a local crash. A retry reconciles this exact
    # release instead of consuming a second version or uploading a second build.
    node "$REPO_ROOT/scripts/ios/release.mjs" reconcile "$report"
    printf '\nSUCCESS\nAd Hoc publication and version ledger: OK\nNotifications: manual\n'
}
