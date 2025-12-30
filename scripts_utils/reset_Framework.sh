#!/bin/zsh
# ============================================
# Reset Framework Script
# Cleans build artifacts and database storage
# ============================================

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧹 Resetting framework..."
echo "Project root: $PROJECT_ROOT"

# Remove Tauri build artifacts
TAURI_TARGET="$PROJECT_ROOT/src-tauri/target"
if [ -d "$TAURI_TARGET" ]; then
    echo "📦 Removing Tauri build artifacts: $TAURI_TARGET"
    rm -rf "$TAURI_TARGET"
    echo "   ✅ Removed src-tauri/target/"
else
    echo "   ⏭️  src-tauri/target/ does not exist, skipping"
fi

# Remove database storage
DATABASE_STORAGE="$PROJECT_ROOT/database_storage"
if [ -d "$DATABASE_STORAGE" ]; then
    echo "🗃️  Removing database storage: $DATABASE_STORAGE"
    rm -rf "$DATABASE_STORAGE"
    echo "   ✅ Removed database_storage/"
else
    echo "   ⏭️  database_storage/ does not exist, skipping"
fi

# Remove Tauri local data directory (includes local ADOLE DB + user data)
DATA_DIR="$PROJECT_ROOT/data"
if [ -d "$DATA_DIR" ]; then
    echo "🗃️  Removing Tauri data directory: $DATA_DIR"
    rm -rf "$DATA_DIR"
    echo "   ✅ Removed data/"
else
    echo "   ⏭️  data/ does not exist, skipping"
fi

# Remove uploads directory (optional, used for shared assets)
UPLOADS_DIR="$PROJECT_ROOT/uploads"
if [ -d "$UPLOADS_DIR" ]; then
    echo "🗂️  Removing uploads directory: $UPLOADS_DIR"
    rm -rf "$UPLOADS_DIR"
    echo "   ✅ Removed uploads/"
else
    echo "   ⏭️  uploads/ does not exist, skipping"
fi

echo ""
echo "🎉 Framework reset complete!"

# Optional: purge Tauri WebView storage (localStorage/cache)
# This does NOT live in src-tauri/target; it is stored in OS user dirs.
OS_NAME="$(uname -s)"
if [[ "$OS_NAME" == "Darwin" ]]; then
    APP_ID="$(python3 - <<PY
import json, pathlib
path = pathlib.Path("${PROJECT_ROOT}/src-tauri/tauri.conf.json")
try:
    data = json.loads(path.read_text())
    print(data.get("identifier") or "com.squirrel.desktop")
except Exception:
    print("com.squirrel.desktop")
PY
)"

    APP_NAME="$(python3 - <<PY
import json, pathlib
path = pathlib.Path("${PROJECT_ROOT}/src-tauri/tauri.conf.json")
try:
    data = json.loads(path.read_text())
    name = data.get("productName") or "squirrel"
    print(name)
except Exception:
    print("squirrel")
PY
)"

    APP_ID_VARIANTS=(
        "$APP_ID"
        "$APP_ID.dev"
        "$APP_ID.debug"
        "$APP_ID.development"
        "$APP_ID.beta"
    )

    echo "🧹 Removing Tauri WebView storage for: ${APP_ID_VARIANTS[*]}"

    purge_webview_path() {
        local target="$1"
        if [ -e "$target" ]; then
            rm -rf "$target"
            echo "   ✅ Removed $target"
        else
            echo "   ⏭️  $target does not exist, skipping"
        fi
    }

    for id in "${APP_ID_VARIANTS[@]}"; do
        purge_webview_path "$HOME/Library/WebKit/$id"
        purge_webview_path "$HOME/Library/Containers/$id"
        purge_webview_path "$HOME/Library/Application Support/$id"
        purge_webview_path "$HOME/Library/Caches/$id"
        purge_webview_path "$HOME/Library/HTTPStorages/$id"
        purge_webview_path "$HOME/Library/HTTPStorages/$id.binarycookies"
        purge_webview_path "$HOME/Library/Preferences/$id.plist"
        purge_webview_path "$HOME/Library/Saved Application State/$id.savedState"
    done

    # Extra cleanup by app name (handles dev identifiers that don't match exactly).
    # This is still scoped to common WebKit/localStorage locations.
    for base in "$HOME/Library/WebKit" "$HOME/Library/HTTPStorages" "$HOME/Library/Caches"; do
        if [ -d "$base" ]; then
            for entry in "$base"/*"$APP_NAME"*; do
                [ -e "$entry" ] || continue
                purge_webview_path "$entry"
            done
        fi
    done
else
    echo "ℹ️  WebView storage purge not implemented for $OS_NAME"
fi
