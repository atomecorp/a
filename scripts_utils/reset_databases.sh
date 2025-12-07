#!/bin/bash
#
# 🔄 DATABASE RESET SCRIPT
# Resets SQLite and PostgreSQL databases - keeps structure, deletes all data
#
# Usage: ./scripts_utils/reset_databases.sh [options]
# Options:
#   --sqlite-only    Reset only SQLite
#   --postgres-only  Reset only PostgreSQL
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
RESET_SQLITE=true
RESET_POSTGRES=true
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sqlite-only)
            RESET_POSTGRES=false
            shift
            ;;
        --postgres-only)
            RESET_SQLITE=false
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --sqlite-only    Reset only SQLite databases"
            echo "  --postgres-only  Reset only PostgreSQL database"
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

# Confirmation
if [ "$FORCE" = false ]; then
    echo -e "${YELLOW}⚠️  WARNING: This will delete ALL data from:${NC}"
    [ "$RESET_SQLITE" = true ] && echo -e "   - SQLite: ${PROJECT_ROOT}/server/eDen.db"
    [ "$RESET_POSTGRES" = true ] && echo -e "   - PostgreSQL: squirrel database (if configured)"
    echo ""
    echo -e "${YELLOW}Tables will be TRUNCATED (structure preserved, data deleted).${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
fi

# ==================== SQLite Reset ====================
if [ "$RESET_SQLITE" = true ]; then
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  📦 Resetting SQLite Database${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    SQLITE_DB="$PROJECT_ROOT/server/eDen.db"
    
    if [ -f "$SQLITE_DB" ]; then
        echo -e "  Database: ${SQLITE_DB}"
        
        # Get current counts
        echo -e "\n  ${YELLOW}Before reset:${NC}"
        sqlite3 "$SQLITE_DB" "SELECT '    Users: ' || COUNT(*) FROM user;" 2>/dev/null || echo "    Users: 0"
        sqlite3 "$SQLITE_DB" "SELECT '    Projects: ' || COUNT(*) FROM project;" 2>/dev/null || echo "    Projects: 0"
        sqlite3 "$SQLITE_DB" "SELECT '    Atomes: ' || COUNT(*) FROM atome;" 2>/dev/null || echo "    Atomes: 0"
        
        # Truncate tables (order matters due to foreign keys)
        echo -e "\n  ${BLUE}Truncating tables...${NC}"
        
        sqlite3 "$SQLITE_DB" "DELETE FROM atome;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} atome table cleared"
        sqlite3 "$SQLITE_DB" "DELETE FROM project;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} project table cleared"
        sqlite3 "$SQLITE_DB" "DELETE FROM user;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} user table cleared"
        
        # Reset auto-increment counters
        sqlite3 "$SQLITE_DB" "DELETE FROM sqlite_sequence WHERE name='atome';" 2>/dev/null
        sqlite3 "$SQLITE_DB" "DELETE FROM sqlite_sequence WHERE name='project';" 2>/dev/null
        sqlite3 "$SQLITE_DB" "DELETE FROM sqlite_sequence WHERE name='user';" 2>/dev/null
        echo -e "    ${GREEN}✓${NC} Auto-increment counters reset"
        
        # Verify
        echo -e "\n  ${GREEN}After reset:${NC}"
        sqlite3 "$SQLITE_DB" "SELECT '    Users: ' || COUNT(*) FROM user;"
        sqlite3 "$SQLITE_DB" "SELECT '    Projects: ' || COUNT(*) FROM project;"
        sqlite3 "$SQLITE_DB" "SELECT '    Atomes: ' || COUNT(*) FROM atome;"
        
        echo -e "\n  ${GREEN}✅ SQLite reset complete!${NC}"
    else
        echo -e "  ${YELLOW}⚠️  SQLite database not found at: ${SQLITE_DB}${NC}"
    fi
    
    # Also reset Tauri local databases if they exist
    TAURI_DBS=(
        "$PROJECT_ROOT/src-tauri/target/release/_up_/src/assets/local_users.db"
        "$PROJECT_ROOT/src-tauri/target/debug/_up_/src/assets/local_users.db"
        "$PROJECT_ROOT/src-tauri/target/debug/_up_/src/assets/local_atomes.db"
    )
    
    for db in "${TAURI_DBS[@]}"; do
        if [ -f "$db" ]; then
            echo -e "\n  ${BLUE}Resetting Tauri DB: $(basename "$db")${NC}"
            # Get tables and truncate each
            tables=$(sqlite3 "$db" ".tables" 2>/dev/null | tr ' ' '\n' | grep -v '^$')
            for table in $tables; do
                if [[ "$table" != "sqlite_sequence" && "$table" != "knex_migrations"* ]]; then
                    sqlite3 "$db" "DELETE FROM $table;" 2>/dev/null && echo -e "    ${GREEN}✓${NC} $table cleared"
                fi
            done
        fi
    done
fi

# ==================== PostgreSQL Reset ====================
if [ "$RESET_POSTGRES" = true ]; then
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  🐘 Resetting PostgreSQL Database${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Try to get connection string from environment or use default
    PG_DSN="${ADOLE_PG_DSN:-${PG_CONNECTION_STRING:-${DATABASE_URL:-}}}"
    
    if [ -z "$PG_DSN" ]; then
        # Try default local connection
        PG_DSN="postgresql://postgres:postgres@localhost:5432/squirrel"
        echo -e "  ${YELLOW}No PG_DSN found, trying default: ${PG_DSN}${NC}"
    fi
    
    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        echo -e "  ${RED}❌ psql command not found. Install PostgreSQL client.${NC}"
        echo -e "     macOS: brew install postgresql@16"
        echo -e "     Linux: apt install postgresql-client"
    else
        # Test connection
        if psql "$PG_DSN" -c "SELECT 1;" &> /dev/null; then
            echo -e "  ${GREEN}✓${NC} Connected to PostgreSQL"
            
            # Get ADOLE tables
            echo -e "\n  ${YELLOW}Finding ADOLE tables...${NC}"
            
            # ADOLE uses TypeORM with these potential tables
            ADOLE_TABLES=$(psql "$PG_DSN" -t -c "
                SELECT tablename FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename NOT LIKE 'pg_%'
                AND tablename NOT LIKE 'typeorm_%'
                ORDER BY tablename;
            " 2>/dev/null | tr -d ' ' | grep -v '^$')
            
            if [ -n "$ADOLE_TABLES" ]; then
                echo -e "  Found tables:"
                for table in $ADOLE_TABLES; do
                    count=$(psql "$PG_DSN" -t -c "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null | tr -d ' ')
                    echo -e "    - $table (${count:-0} rows)"
                done
                
                echo -e "\n  ${BLUE}Truncating tables...${NC}"
                
                # Disable foreign key checks, truncate, re-enable
                psql "$PG_DSN" -c "
                    DO \$\$
                    DECLARE
                        r RECORD;
                    BEGIN
                        -- Disable triggers
                        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'typeorm_%'
                        LOOP
                            EXECUTE 'ALTER TABLE \"' || r.tablename || '\" DISABLE TRIGGER ALL';
                        END LOOP;
                        
                        -- Truncate all tables
                        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'typeorm_%'
                        LOOP
                            EXECUTE 'TRUNCATE TABLE \"' || r.tablename || '\" CASCADE';
                        END LOOP;
                        
                        -- Re-enable triggers
                        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'typeorm_%'
                        LOOP
                            EXECUTE 'ALTER TABLE \"' || r.tablename || '\" ENABLE TRIGGER ALL';
                        END LOOP;
                    END \$\$;
                " 2>/dev/null && echo -e "    ${GREEN}✓${NC} All tables truncated"
                
                # Reset sequences
                psql "$PG_DSN" -c "
                    DO \$\$
                    DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
                        LOOP
                            EXECUTE 'ALTER SEQUENCE \"' || r.sequence_name || '\" RESTART WITH 1';
                        END LOOP;
                    END \$\$;
                " 2>/dev/null && echo -e "    ${GREEN}✓${NC} Sequences reset"
                
                echo -e "\n  ${GREEN}After reset:${NC}"
                for table in $ADOLE_TABLES; do
                    count=$(psql "$PG_DSN" -t -c "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null | tr -d ' ')
                    echo -e "    - $table: ${count:-0} rows"
                done
                
                echo -e "\n  ${GREEN}✅ PostgreSQL reset complete!${NC}"
            else
                echo -e "  ${YELLOW}⚠️  No user tables found in PostgreSQL${NC}"
            fi
        else
            echo -e "  ${YELLOW}⚠️  Could not connect to PostgreSQL${NC}"
            echo -e "     Make sure the database is running and connection string is correct."
            echo -e "     Set ADOLE_PG_DSN, PG_CONNECTION_STRING, or DATABASE_URL"
        fi
    fi
fi

# ==================== Summary ====================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Database reset complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Note: You may need to restart your server for changes to take effect.${NC}"
echo ""
