#!/bin/sh

============================================

Reset Framework Script (POSIX portable)

Works on Linux (sh/dash/bash) and macOS

============================================

set -e

Get script directory and project root

SCRIPT_DIR=”$(cd “$(dirname “$0”)” && pwd)”
PROJECT_ROOT=”$(dirname “$SCRIPT_DIR”)”

echo “🧹 Resetting framework…”
echo “Project root: $PROJECT_ROOT”

Remove Tauri build artifacts

TAURI_TARGET=”$PROJECT_ROOT/src-tauri/target”
if [ -d “$TAURI_TARGET” ]; then
echo “📦 Removing Tauri build artifacts: $TAURI_TARGET”
rm -rf “$TAURI_TARGET”
echo “   ✅ Removed src-tauri/target/”
else
echo “   ⏭️  src-tauri/target/ does not exist, skipping”
fi

Remove database storage

DATABASE_STORAGE=”$PROJECT_ROOT/database_storage”
if [ -d “$DATABASE_STORAGE” ]; then
echo “🗃️  Removing database storage: $DATABASE_STORAGE”
rm -rf “$DATABASE_STORAGE”
echo “   ✅ Removed database_storage/”
else
echo “   ⏭️  database_storage/ does not exist, skipping”
fi

Remove Tauri local data directory (includes local ADOLE DB + user data)

DATA_DIR=”$PROJECT_ROOT/data”
if [ -d “$DATA_DIR” ]; then
echo “🗃️  Removing Tauri data directory: $DATA_DIR”
rm -rf “$DATA_DIR”
echo “   ✅ Removed data/”
else
echo “   ⏭️  data/ does not exist, skipping”
fi

Remove uploads directory (optional, used for shared assets)

UPLOADS_DIR=”$PROJECT_ROOT/uploads”
if [ -d “$UPLOADS_DIR” ]; then
echo “🗂️  Removing uploads directory: $UPLOADS_DIR”
rm -rf “$UPLOADS_DIR”
echo “   ✅ Removed uploads/”
else
echo “   ⏭️  uploads/ does not exist, skipping”
fi

echo “”
echo “🎉 Framework reset complete!”

Optional: purge Tauri WebView storage (macOS only)

OS_NAME=”$(uname -s)”
if [ “$OS_NAME” = “Darwin” ]; then
APP_ID=“com.squirrel.desktop”
APP_NAME=“squirrel”

if command -v python3 >/dev/null 2>&1 && [ -f "$PROJECT_ROOT/src-tauri/tauri.conf.json" ]; then
    APP_ID="$(python3 -c "import json;print(json.load(open('$PROJECT_ROOT/src-tauri/tauri.conf.json')).get('identifier','com.squirrel.desktop'))" 2>/dev/null || echo com.squirrel.desktop)"
    APP_NAME="$(python3 -c "import json;print(json.load(open('$PROJECT_ROOT/src-tauri/tauri.conf.json')).get('productName','squirrel'))" 2>/dev/null || echo squirrel)"
fi

echo "🧹 Removing Tauri WebView storage for base id: $APP_ID"

purge_path() {
    if [ -e "$1" ]; then
        rm -rf "$1"
        echo "   ✅ Removed $1"
    fi
}

for suffix in "" ".dev" ".debug" ".development" ".beta"; do
    ID="$APP_ID$suffix"
    purge_path "$HOME/Library/WebKit/$ID"
    purge_path "$HOME/Library/Containers/$ID"
    purge_path "$HOME/Library/Application Support/$ID"
    purge_path "$HOME/Library/Caches/$ID"
    purge_path "$HOME/Library/HTTPStorages/$ID"
    purge_path "$HOME/Library/HTTPStorages/$ID.binarycookies"
    purge_path "$HOME/Library/Preferences/$ID.plist"
    purge_path "$HOME/Library/Saved Application State/$ID.savedState"
done

# Extra cleanup by app name
for base in "$HOME/Library/WebKit" "$HOME/Library/HTTPStorages" "$HOME/Library/Caches"; do
    if [ -d "$base" ]; then
        for entry in "$base"/*"$APP_NAME"*; do
            [ -e "$entry" ] || continue
            purge_path "$entry"
        done
    fi
done

else
echo “ℹ️  WebView storage purge not implemented for $OS_NAME”
fi