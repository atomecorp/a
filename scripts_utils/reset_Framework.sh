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

echo ""
echo "🎉 Framework reset complete!"
