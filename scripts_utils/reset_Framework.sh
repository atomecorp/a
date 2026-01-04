#!/usr/bin/env bash
# ============================================
# Reset Framework Script
# Cleans build artifacts and database storage
# ============================================

set -e

# =============================================================================
# Service management (production)
# =============================================================================
# This script can stop/start the production service to avoid DB locks and prevent
# the server from recreating data while the reset runs.
#
# Controls:
# - AUTO_SERVICE_STOP=1|0   (default: 1)
# - AUTO_SERVICE_START=1|0  (default: 1)
# - SQUIRREL_SERVICE_NAME   (default: squirrel)
#
# Dev controls (opt-in):
# - AUTO_DEV_STOP=1|0        (default: 0)  Stop local Fastify dev server (port)
# - AUTO_DEV_START=1|0       (default: 0)  Start local Fastify dev server via ./run.sh --server
# - DEV_FASTIFY_PORT=3001    (default: 3001)
# - AUTO_RUN_SH_FULL=1|0     (default: 0)  Start full dev framework via ./run.sh (background)

AUTO_SERVICE_STOP="${AUTO_SERVICE_STOP:-1}"
AUTO_SERVICE_START="${AUTO_SERVICE_START:-1}"
SQUIRREL_SERVICE_NAME="${SQUIRREL_SERVICE_NAME:-squirrel}"
STOPPED_SERVICE=0

AUTO_DEV_STOP="${AUTO_DEV_STOP:-0}"
AUTO_DEV_START="${AUTO_DEV_START:-0}"
DEV_FASTIFY_PORT="${DEV_FASTIFY_PORT:-3001}"
STOPPED_DEV_FASTIFY=0

AUTO_RUN_SH_FULL="${AUTO_RUN_SH_FULL:-0}"

PROD_START_DONE=0
DEV_START_DONE=0
PROD_START_ATTEMPTED=0

remove_dir() {
    local target="$1"
    local label="$2"
    if [ -d "$target" ]; then
        echo "$label: $target"
        rm -rf "$target" || true
        if [ -d "$target" ] && have_sudo; then
            echo "   ⚠️  Retrying removal with sudo: $target"
            sudo rm -rf "$target" || true
        fi
        if [ -d "$target" ]; then
            echo "   ⚠️  Failed to fully remove: $target"
            return 1
        fi
        echo "   ✅ Removed $(basename "$target")/"
    else
        echo "   ⏭️  $(basename "$target")/ does not exist, skipping"
    fi
}

remove_file_and_sidecars() {
    local file="$1"
    if [ -z "$file" ]; then
        return 0
    fi
    if [ -f "$file" ]; then
        rm -f "$file" || true
        rm -f "${file}-wal" "${file}-shm" || true
        if [ -f "$file" ] || [ -f "${file}-wal" ] || [ -f "${file}-shm" ]; then
            echo "   ⚠️  Failed to fully remove DB file (or sidecars): $file"
            return 1
        fi
        echo "   ✅ Removed $file (+ -wal/-shm if present)"
    else
        echo "   ⏭️  $file does not exist, skipping"
    fi
}

is_safe_project_path() {
    local target="$1"
    [ -n "$target" ] || return 1
    case "$target" in
        "$PROJECT_ROOT"|"$PROJECT_ROOT/") return 1 ;;
    esac
    case "$target" in
        "$PROJECT_ROOT"/*) return 0 ;;
        *) return 1 ;;
    esac
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

is_production_server_setup() {
    # Mirrors the guard in ./run.sh
    if [[ -f "/etc/systemd/system/${SQUIRREL_SERVICE_NAME}.service" ]] \
        || [[ -f "/etc/squirrel/squirrel.env" ]] \
        || [[ -f "/usr/local/etc/squirrel/squirrel.env" ]]; then
        return 0
    fi
    return 1
}

normalize_systemd_unit() {
    local name="$1"
    if [[ -z "$name" ]]; then
        return 1
    fi
    if [[ "$name" == *.service ]]; then
        printf '%s' "$name"
    else
        printf '%s.service' "$name"
    fi
}

have_sudo() {
    if command -v sudo >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

stop_production_service_if_needed() {
    if [[ "$AUTO_SERVICE_STOP" != "1" ]]; then
        echo "ℹ️  AUTO_SERVICE_STOP!=1; skipping production service stop"
        return 0
    fi

    if ! is_production_server_setup; then
        echo "ℹ️  No production server setup detected; skipping service stop"
        return 0
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        echo "ℹ️  systemctl not found; skipping production service stop"
        return 0
    fi

    local unit
    unit="$(normalize_systemd_unit "$SQUIRREL_SERVICE_NAME")"

    # Only attempt if unit exists.
    if ! systemctl list-unit-files --no-pager "$unit" >/dev/null 2>&1; then
        echo "ℹ️  Systemd unit not found ($unit); skipping service stop"
        return 0
    fi

    if systemctl is-active --quiet "$unit"; then
        echo "🛑 Stopping production service: $unit"
    else
        echo "ℹ️  Production service already inactive: $unit"
    fi
    if have_sudo; then
        sudo systemctl stop "$unit" || true
    else
        systemctl stop "$unit" || true
    fi

    # Wait for clean stop to reduce DB locks.
    local i
    for i in {1..40}; do
        if ! systemctl is-active --quiet "$unit"; then
            break
        fi
        sleep 0.5
    done

    if systemctl is-active --quiet "$unit"; then
        echo "⚠️  Service is still active after stop attempt: $unit"
        echo "    DB files may remain locked. Consider stopping manually and rerun."
    else
        STOPPED_SERVICE=1
    fi
}

start_production_service_if_needed() {
    if [[ "$AUTO_SERVICE_START" != "1" ]]; then
        echo "ℹ️  AUTO_SERVICE_START!=1; skipping production service start"
        return 0
    fi

    if [[ "$STOPPED_SERVICE" != "1" ]]; then
        return 0
    fi

    # Extra guard: avoid double restart even if called twice.
    if [[ "$PROD_START_ATTEMPTED" == "1" ]]; then
        return 0
    fi
    PROD_START_ATTEMPTED=1

    if ! command -v systemctl >/dev/null 2>&1; then
        echo "⚠️  systemctl not found; cannot restart production service"
        return 0
    fi

    local unit
    unit="$(normalize_systemd_unit "$SQUIRREL_SERVICE_NAME")"

    echo "🚀 Starting production service: $unit"
    if have_sudo; then
        sudo systemctl start "$unit" || true
        sudo systemctl status "$unit" --no-pager || true
    else
        systemctl start "$unit" || true
        systemctl status "$unit" --no-pager || true
    fi

    PROD_START_DONE=1
    STOPPED_SERVICE=0
}

stop_dev_fastify_if_needed() {
    if [[ "$AUTO_DEV_STOP" != "1" ]]; then
        return 0
    fi
    if is_production_server_setup; then
        return 0
    fi

    if ! command -v lsof >/dev/null 2>&1; then
        echo "ℹ️  AUTO_DEV_STOP=1 but lsof is not available; skipping dev Fastify stop"
        return 0
    fi

    local pids
    pids="$(lsof -ti":${DEV_FASTIFY_PORT}" 2>/dev/null | tr '\n' ' ' | xargs echo -n 2>/dev/null || true)"
    if [[ -z "$pids" ]]; then
        return 0
    fi

    echo "🛑 Stopping local dev Fastify on port ${DEV_FASTIFY_PORT} (PIDs: ${pids})"
    # Best-effort: TERM then KILL
    kill $pids 2>/dev/null || true
    sleep 0.5
    kill -9 $pids 2>/dev/null || true
    STOPPED_DEV_FASTIFY=1
}

start_dev_fastify_if_needed() {
    if [[ "$AUTO_DEV_START" != "1" ]]; then
        return 0
    fi
    if is_production_server_setup; then
        return 0
    fi
    if [[ "$DEV_START_DONE" == "1" ]]; then
        return 0
    fi
    if [[ ! -x "$PROJECT_ROOT/run.sh" ]]; then
        echo "⚠️  AUTO_DEV_START=1 but ./run.sh is not executable; skipping dev start"
        return 0
    fi

    echo "🚀 Starting local dev Fastify: ./run.sh --server"
    (cd "$PROJECT_ROOT" && ./run.sh --server &) || true
    DEV_START_DONE=1
    STOPPED_DEV_FASTIFY=0
}

start_dev_framework_full_if_needed() {
    if [[ "$AUTO_RUN_SH_FULL" != "1" ]]; then
        return 0
    fi
    if is_production_server_setup; then
        return 0
    fi
    if [[ ! -x "$PROJECT_ROOT/run.sh" ]]; then
        echo "⚠️  AUTO_RUN_SH_FULL=1 but ./run.sh is not executable; skipping"
        return 0
    fi
    echo "🚀 Starting full dev framework: ./run.sh (background)"
    (cd "$PROJECT_ROOT" && ./run.sh &) || true
}

on_exit() {
    # Important: in bash, the EXIT trap can run in subshells (e.g. $(...)).
    # Only run the restart logic in the top-level shell.
    if [[ "${BASH_SUBSHELL:-0}" != "0" ]]; then
        return 0
    fi

    # Extra safety: BASHPID differs in subshells even when $$ stays the same.
    # This helps avoid double restarts on some bash versions/contexts.
    if [[ -n "${BASHPID:-}" && "${BASHPID}" != "$$" ]]; then
        return 0
    fi

    # Best-effort restart if we stopped it.
    if [[ "$STOPPED_SERVICE" == "1" && "$PROD_START_DONE" != "1" ]]; then
        start_production_service_if_needed || true
    fi
    if [[ "$STOPPED_DEV_FASTIFY" == "1" && "$DEV_START_DONE" != "1" ]]; then
        start_dev_fastify_if_needed || true
    fi

    # Optional: start full framework at the end (dev only)
    start_dev_framework_full_if_needed || true
}

trap on_exit EXIT

echo "🧹 Resetting framework..."
echo "Project root: $PROJECT_ROOT"

# Stop production service early (avoid DB locks + data recreation)
stop_production_service_if_needed

# Optional: stop local dev Fastify before deleting DB/data
stop_dev_fastify_if_needed

# Remove Tauri build artifacts
TAURI_TARGET="$PROJECT_ROOT/src-tauri/target"
remove_dir "$TAURI_TARGET" "📦 Removing Tauri build artifacts"

# Remove database storage
DATABASE_STORAGE="$PROJECT_ROOT/database_storage"
remove_dir "$DATABASE_STORAGE" "🗃️  Removing database storage"

# Remove Fastify DB (SQLite) when used.
# Mirrors database/driver.js priorities:
# - LIBSQL_URL/TURSO_DATABASE_URL => remote DB (cannot be wiped by deleting files)
# - SQLITE_PATH/ADOLE_SQLITE_PATH => local SQLite file
if command -v node >/dev/null 2>&1; then
    DB_INFO_TMP=""
    if command -v mktemp >/dev/null 2>&1; then
        DB_INFO_TMP="$(mktemp -t reset_framework_dbinfo.XXXXXX 2>/dev/null || true)"
    fi

    if [[ -z "$DB_INFO_TMP" ]]; then
        DB_INFO_TMP="$PROJECT_ROOT/.reset_framework_dbinfo.tmp"
    fi

    PROJECT_ROOT="$PROJECT_ROOT" node --input-type=module - <<'NODE' >"$DB_INFO_TMP" 2>/dev/null || true
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.env.PROJECT_ROOT || process.cwd();

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
        let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
        if (line.startsWith('export ')) line = line.slice('export '.length).trim();
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (override || !(key in process.env)) process.env[key] = value;
  }
}

// Load env files if present (common patterns)
loadEnvFile(path.join(projectRoot, '.env'), false);
loadEnvFile(path.join(projectRoot, '.env.local'), true);
loadEnvFile(path.join(projectRoot, 'server', '.env'), false);
loadEnvFile(path.join(projectRoot, 'server', '.env.local'), true);

// Production server env file(s) (if readable)
loadEnvFile('/etc/squirrel/squirrel.env', true);
loadEnvFile('/usr/local/etc/squirrel/squirrel.env', true);

// Also parse systemd unit for EnvironmentFile= entries (most reliable on servers)
try {
    const unitName = process.env.SQUIRREL_SERVICE_NAME || 'squirrel';
    const unitPath = `/etc/systemd/system/${unitName}.service`;
    if (fs.existsSync(unitPath)) {
        const unitText = fs.readFileSync(unitPath, 'utf8');
        for (const raw of unitText.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            if (!line.startsWith('EnvironmentFile=')) continue;
            let value = line.slice('EnvironmentFile='.length).trim();
            if (value.startsWith('-')) value = value.slice(1).trim();
            // Remove optional quotes and only take the first token.
            value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
            const filePath = value.split(/\s+/)[0];
            if (filePath) loadEnvFile(filePath, true);
        }
    }
} catch {
    // ignore
}

const libsqlUrl = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL || '';
const sqliteRaw = process.env.FORCE_SQLITE_PATH || process.env.SQLITE_PATH || process.env.ADOLE_SQLITE_PATH || '';
const sqliteDefault = path.join(projectRoot, 'database_storage', 'adole.db');
const sqlitePath = sqliteRaw
  ? (path.isAbsolute(sqliteRaw) ? sqliteRaw : path.join(projectRoot, sqliteRaw))
  : sqliteDefault;

process.stdout.write(`LIBSQL_URL=${libsqlUrl}\nSQLITE_PATH=${sqlitePath}\n`);
NODE

    LIBSQL_URL_VALUE=""
    SQLITE_PATH_VALUE=""
    if [ -f "$DB_INFO_TMP" ]; then
        while IFS= read -r line; do
            case "$line" in
                LIBSQL_URL=*) LIBSQL_URL_VALUE="${line#LIBSQL_URL=}" ;;
                SQLITE_PATH=*) SQLITE_PATH_VALUE="${line#SQLITE_PATH=}" ;;
            esac
        done <"$DB_INFO_TMP"
        rm -f "$DB_INFO_TMP" 2>/dev/null || true
    fi

    echo "ℹ️  Detected DB config:"
    if [ -n "$LIBSQL_URL_VALUE" ]; then
        echo "    - LIBSQL_URL: set"
    else
        echo "    - LIBSQL_URL: (not set)"
    fi
    echo "    - SQLITE_PATH: $SQLITE_PATH_VALUE"

    if [ -n "$LIBSQL_URL_VALUE" ]; then
        echo "ℹ️  Fastify DB appears remote (LIBSQL_URL/TURSO_DATABASE_URL is set)."
        echo "    Cannot wipe remote DB by deleting local files."
    else
        if [ -n "$SQLITE_PATH_VALUE" ]; then
            if is_safe_project_path "$SQLITE_PATH_VALUE"; then
                echo "🗃️  Removing Fastify SQLite DB (if present): $SQLITE_PATH_VALUE"
                remove_file_and_sidecars "$SQLITE_PATH_VALUE" || true
            else
                if [[ "${ALLOW_ABSOLUTE_DB_DELETE:-}" == "1" ]]; then
                    echo "⚠️  Removing SQLite DB outside project root (ALLOW_ABSOLUTE_DB_DELETE=1): $SQLITE_PATH_VALUE"
                    remove_file_and_sidecars "$SQLITE_PATH_VALUE" || true
                else
                    echo "⚠️  Refusing to delete SQLite DB outside project root: $SQLITE_PATH_VALUE"
                    echo "    If this is intended, re-run with ALLOW_ABSOLUTE_DB_DELETE=1"
                fi
            fi

            # Fallback (safe): if SQLITE_PATH doesn't exist, search for adole.db under project root.
            if [ ! -f "$SQLITE_PATH_VALUE" ]; then
                echo "ℹ️  SQLite file not found at SQLITE_PATH; searching for 'adole.db' under project root..."
                FOUND_ANY=0
                while IFS= read -r candidate; do
                    [ -n "$candidate" ] || continue
                    if is_safe_project_path "$candidate"; then
                        echo "🗃️  Removing discovered DB: $candidate"
                        remove_file_and_sidecars "$candidate" || true
                        FOUND_ANY=1
                    else
                        echo "⚠️  Refusing to delete discovered DB outside project root: $candidate"
                    fi
                done < <(find "$PROJECT_ROOT" -maxdepth 6 -type f -name 'adole.db' 2>/dev/null)

                if [ "$FOUND_ANY" -eq 0 ]; then
                    echo "ℹ️  No 'adole.db' found under project root."
                fi
            fi
        fi
    fi
else
    echo "ℹ️  Skipping Fastify DB cleanup: node is not installed"
fi

# Remove Tauri local data directory (includes local ADOLE DB + user data)
DATA_DIR="$PROJECT_ROOT/data"
remove_dir "$DATA_DIR" "🗃️  Removing Tauri data directory"

# Remove uploads directory (optional, used for shared assets)
UPLOADS_DIR="$PROJECT_ROOT/uploads"
remove_dir "$UPLOADS_DIR" "🗂️  Removing uploads directory"

echo ""
echo "🎉 Framework reset complete!"

# Optional: purge Tauri WebView storage (localStorage/cache)
# This does NOT live in src-tauri/target; it is stored in OS user dirs.
OS_NAME="$(uname -s)"

# Optional escape hatch (debugging): allow skipping OS user storage purge.
if [[ "${SKIP_WEBVIEW_PURGE:-}" == "1" ]]; then
    echo "ℹ️  WebView storage purge skipped (SKIP_WEBVIEW_PURGE=1)"
    exit 0
fi

if [[ "$OS_NAME" == "Darwin" || "$OS_NAME" == "Linux" ]]; then
    get_tauri_conf_value() {
        local key="$1"
        local fallback="$2"
        if command -v node >/dev/null 2>&1; then
            PROJECT_ROOT="$PROJECT_ROOT" TAURI_KEY="$key" TAURI_FALLBACK="$fallback" node --input-type=module - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.PROJECT_ROOT || process.cwd();
const key = process.env.TAURI_KEY || '';
const fallback = process.env.TAURI_FALLBACK || '';

try {
  const confPath = path.join(root, 'src-tauri', 'tauri.conf.json');
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  const value = (conf && key in conf) ? conf[key] : fallback;
  process.stdout.write(String(value || fallback));
} catch {
  process.stdout.write(String(fallback));
}
NODE
        else
            printf '%s' "$fallback"
        fi
    }

    APP_ID="$(get_tauri_conf_value identifier com.squirrel.desktop)"
    APP_NAME="$(get_tauri_conf_value productName squirrel)"

    if [ -z "$APP_ID" ]; then
        APP_ID="com.squirrel.desktop"
    fi

    is_safe_user_path() {
        local target="$1"
        [ -n "$target" ] || return 1
        case "$target" in
            "$HOME"|"$HOME/"|"$HOME/Library"|"$HOME/Library/"|"$HOME/.config"|"$HOME/.config/"|"$HOME/.local"|"$HOME/.local/"|"$HOME/.local/share"|"$HOME/.local/share/"|"$HOME/.cache"|"$HOME/.cache/")
                return 1
                ;;
        esac
        case "$target" in
            "$HOME"/*) return 0 ;;
            *) return 1 ;;
        esac
    }

    # Build identifier variants.
    # Heuristic: some builds use the same base but end with ".app" instead of ".desktop".
    APP_ID_BASES=("$APP_ID")
    if [[ "$APP_ID" == *.desktop ]]; then
        APP_ID_BASES+=("${APP_ID%.desktop}.app")
    fi

    APP_ID_VARIANTS=()
    for base in "${APP_ID_BASES[@]}"; do
        APP_ID_VARIANTS+=(
            "$base"
            "$base.dev"
            "$base.debug"
            "$base.development"
            "$base.beta"
        )
    done

    echo "🧹 Removing Tauri WebView storage for: ${APP_ID_VARIANTS[*]} (and productName=$APP_NAME)"

    purge_webview_path() {
        local target="$1"
        if ! is_safe_user_path "$target"; then
            echo "   ⚠️  Refusing to remove unsafe path: $target"
            return 0
        fi
        if [ -e "$target" ]; then
            rm -rf "$target" || true
            echo "   ✅ Removed $target"
        else
            echo "   ⏭️  $target does not exist, skipping"
        fi
    }

    if [[ "$OS_NAME" == "Darwin" ]]; then
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

        # Also purge exact-match productName dirs (no wildcards).
        # Some components store data under productName rather than identifier.
        if [ -n "$APP_NAME" ]; then
            purge_webview_path "$HOME/Library/Application Support/$APP_NAME"
            purge_webview_path "$HOME/Library/Caches/$APP_NAME"
            purge_webview_path "$HOME/Library/HTTPStorages/$APP_NAME"
            purge_webview_path "$HOME/Library/WebKit/$APP_NAME"
        fi

        # Optional: broader sweep by product name (OFF by default for safety).
        if [[ "${EXTRA_WEBVIEW_SWEEP:-}" == "1" ]]; then
            for base in "$HOME/Library/WebKit" "$HOME/Library/HTTPStorages" "$HOME/Library/Caches"; do
                if [ -d "$base" ]; then
                    for entry in "$base"/*"$APP_NAME"*; do
                        [ -e "$entry" ] || continue
                        purge_webview_path "$entry"
                    done
                fi
            done
        fi
    else
        # Linux: scope to XDG dirs (only if they are under $HOME).
        XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
        XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
        XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"

        for id in "${APP_ID_VARIANTS[@]}"; do
            purge_webview_path "$XDG_CONFIG_HOME/$id"
            purge_webview_path "$XDG_DATA_HOME/$id"
            purge_webview_path "$XDG_CACHE_HOME/$id"
        done
        purge_webview_path "$XDG_CONFIG_HOME/$APP_NAME"
        purge_webview_path "$XDG_DATA_HOME/$APP_NAME"
        purge_webview_path "$XDG_CACHE_HOME/$APP_NAME"
    fi
else
    echo "ℹ️  WebView storage purge not implemented for $OS_NAME"
fi

# NOTE: Service/dev restart is handled by the EXIT trap (on_exit)
