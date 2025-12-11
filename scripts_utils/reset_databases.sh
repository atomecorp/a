#!/bin/bash
#
# 🔄 DATABASE RESET SCRIPT
# Resets SQLite/libSQL databases - keeps structure, deletes all data
#
# Usage: ./scripts_utils/reset_databases.sh [options]
# Options:
#   --force          Skip confirmation
#   --help           Show this help
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --force          Skip confirmation prompt"
            echo "  --help           Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           🔄 DATABASE RESET UTILITY                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get SQLite path from env or use default
SQLITE_PATH="${SQLITE_PATH:-$PROJECT_ROOT/database_storage/adole.db}"

# Confirmation
if [ "$FORCE" = false ]; then
    echo -e "${YELLOW}⚠️  WARNING: This will delete ALL data from:${NC}"
    echo -e "   - SQLite: ${SQLITE_PATH}"
    echo ""
    echo -e "${YELLOW}Tables will be TRUNCATED (structure preserved, data deleted).${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
fi

# ==================== SQLite/ADOLE Reset ====================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  📦 Resetting SQLite/ADOLE Database${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "$SQLITE_PATH" ]; then
    echo -e "  Database: ${SQLITE_PATH}"
    
    # Get current counts (ADOLE tables)
    echo -e "\n  ${YELLOW}Before reset:${NC}"
    sqlite3 "$SQLITE_PATH" "SELECT '    Tenants: ' || COUNT(*) FROM tenants;" 2>/dev/null || echo "    Tenants: (table not found)"
    sqlite3 "$SQLITE_PATH" "SELECT '    Principals: ' || COUNT(*) FROM principals;" 2>/dev/null || echo "    Principals: (table not found)"
    sqlite3 "$SQLITE_PATH" "SELECT '    Objects: ' || COUNT(*) FROM objects;" 2>/dev/null || echo "    Objects: (table not found)"
    sqlite3 "$SQLITE_PATH" "SELECT '    Properties: ' || COUNT(*) FROM properties;" 2>/dev/null || echo "    Properties: (table not found)"
    sqlite3 "$SQLITE_PATH" "SELECT '    Property Versions: ' || COUNT(*) FROM property_versions;" 2>/dev/null || echo "    Property_versions: (table not found)"
    
    # Truncate ADOLE tables (order matters due to foreign keys)
    echo -e "\n  ${BLUE}Truncating tables...${NC}"
    
    # Disable foreign keys, truncate, re-enable
    sqlite3 "$SQLITE_PATH" "PRAGMA foreign_keys=OFF;" 2>/dev/null
    
    sqlite3 "$SQLITE_PATH" "DELETE FROM sync_queue;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} sync_queue cleared" || echo -e "    ${YELLOW}⚠${NC} sync_queue not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM acls;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} acls cleared" || echo -e "    ${YELLOW}⚠${NC} acls not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM property_versions;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} property_versions cleared" || echo -e "    ${YELLOW}⚠${NC} property_versions not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM properties;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} properties cleared" || echo -e "    ${YELLOW}⚠${NC} properties not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM objects;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} objects cleared" || echo -e "    ${YELLOW}⚠${NC} objects not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM principals;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} principals cleared" || echo -e "    ${YELLOW}⚠${NC} principals not found"
    sqlite3 "$SQLITE_PATH" "DELETE FROM tenants;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} tenants cleared" || echo -e "    ${YELLOW}⚠${NC} tenants not found"
    
    # Keep migration tracking
    echo -e "    ${BLUE}ℹ${NC} Keeping _migrations table (schema version tracking)"
    
    sqlite3 "$SQLITE_PATH" "PRAGMA foreign_keys=ON;" 2>/dev/null
    
    # Verify
    echo -e "\n  ${GREEN}After reset:${NC}"
    sqlite3 "$SQLITE_PATH" "SELECT '    Tenants: ' || COUNT(*) FROM tenants;" 2>/dev/null || true
    sqlite3 "$SQLITE_PATH" "SELECT '    Principals: ' || COUNT(*) FROM principals;" 2>/dev/null || true
    sqlite3 "$SQLITE_PATH" "SELECT '    Objects: ' || COUNT(*) FROM objects;" 2>/dev/null || true
    sqlite3 "$SQLITE_PATH" "SELECT '    Properties: ' || COUNT(*) FROM properties;" 2>/dev/null || true
    
    echo -e "\n  ${GREEN}✅ SQLite/ADOLE reset complete!${NC}"
else
    echo -e "  ${YELLOW}⚠️  SQLite database not found at: ${SQLITE_PATH}${NC}"
    echo -e "  ${YELLOW}    Database will be created on first server start.${NC}"
fi

# Also reset Tauri local databases if they exist
TAURI_DBS=(
    "$PROJECT_ROOT/src-tauri/target/release/_up_/src/assets/adole.db"
    "$PROJECT_ROOT/src-tauri/target/debug/_up_/src/assets/adole.db"
)

for db in "${TAURI_DBS[@]}"; do
    if [ -f "$db" ]; then
        echo -e "\n  ${BLUE}Resetting Tauri DB: $(basename "$db")${NC}"
        # Get tables and truncate each
        tables=$(sqlite3 "$db" ".tables" 2>/dev/null | tr ' ' '\n' | grep -v '^$')
        for table in $tables; do
            if [[ "$table" != "_migrations" ]]; then
                sqlite3 "$db" "DELETE FROM $table;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} $table cleared"
            fi
        done
    fi
done

# ==================== Summary ====================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Database reset complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Note: You may need to restart your server for changes to take effect.${NC}"
echo ""
