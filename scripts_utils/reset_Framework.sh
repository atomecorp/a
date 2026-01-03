#!/usr/bin/env bash
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

remove_dir() {
    local target="$1"
    local label="$2"
    if [ -d "$target" ]; then
        echo "$label: $target"
        rm -rf "$target"
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
        rm -f "$file"
        rm -f "${file}-wal" "${file}-shm"
        echo "   ✅ Removed $file (+ -wal/-shm if present)"
    else
        echo "   ⏭️  $file does not exist, skipping"
    fi
}

# Remove Tauri build artifacts
TAURI_TARGET="$PROJECT_ROOT/src-tauri/target"
if [ -d "$TAURI_TARGET" ]; then
    echo "📦 Removing Tauri build artifacts: $TAURI_TARGET"
    rm -rf "$TAURI_TARGET"
    echo "   ✅ Removed src-tauri/target/"
else
    echo "   ⏭️  src-tauri/target/ does not exist, skipping"
fi

# Remove root build/temp artifacts (framework/tooling)
remove_dir "$PROJECT_ROOT/dist" "📦 Removing build output"
remove_dir "$PROJECT_ROOT/target" "📦 Removing build artifacts"
remove_dir "$PROJECT_ROOT/temp" "🧪 Removing temp directory"

# Remove database storage
DATABASE_STORAGE="$PROJECT_ROOT/database_storage"
if [ -d "$DATABASE_STORAGE" ]; then
    echo "🗃️  Removing database storage: $DATABASE_STORAGE"
    rm -rf "$DATABASE_STORAGE"
    echo "   ✅ Removed database_storage/"
else
    echo "   ⏭️  database_storage/ does not exist, skipping"
fi

# Remove Fastify DB (SQLite) if configured.
# Fastify uses database/driver.js:
# - LIBSQL_URL/TURSO_DATABASE_URL => remote DB (cannot be wiped by deleting files)
# - SQLITE_PATH/ADOLE_SQLITE_PATH => local SQLite file
if command -v node >/dev/null 2>&1; then
        DB_INFO=$(node --input-type=module - <<NODE
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = ${PROJECT_ROOT@Q};

function loadEnvFile(filePath, override = false) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.trim().startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        if (!key) continue;
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        value = value.replace(/\\n/g, '\n');
        if (override || !(key in process.env)) process.env[key] = value;
    }
}

loadEnvFile(path.join(projectRoot, '.env'), false);
loadEnvFile(path.join(projectRoot, '.env.local'), true);

const libsqlUrl = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL || '';
const sqliteRaw = process.env.SQLITE_PATH || process.env.ADOLE_SQLITE_PATH || '';
const sqliteDefault = path.join(projectRoot, 'database_storage', 'adole.db');
const sqlitePath = sqliteRaw
    ? (path.isAbsolute(sqliteRaw) ? sqliteRaw : path.join(projectRoot, sqliteRaw))
    : sqliteDefault;

process.stdout.write(`LIBSQL_URL=${libsqlUrl}\nSQLITE_PATH=${sqlitePath}\n`);
NODE
)

        LIBSQL_URL_VALUE=$(printf '%s\n' "$DB_INFO" | sed -n 's/^LIBSQL_URL=//p' | head -n 1)
        SQLITE_PATH_VALUE=$(printf '%s\n' "$DB_INFO" | sed -n 's/^SQLITE_PATH=//p' | head -n 1)

        if [ -n "$LIBSQL_URL_VALUE" ]; then
                echo "ℹ️  Fastify DB uses libSQL/Turso (remote): cannot wipe via local file deletion"
        else
                echo "🗃️  Removing Fastify SQLite DB (if present): $SQLITE_PATH_VALUE"
                remove_file_and_sidecars "$SQLITE_PATH_VALUE"
        fi
else
        echo "ℹ️  Skipping Fastify DB cleanup: node is not installed"
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

if [[ "$OS_NAME" == "Darwin" || "$OS_NAME" == "Linux" ]]; then
    if command -v node >/dev/null 2>&1; then
                echo "🧹 Purging WebView storage for $OS_NAME (Node)"

                PURGE_SCRIPT="$PROJECT_ROOT/scripts_utils/purge_webview_storage.mjs"
                if [[ -f "$PURGE_SCRIPT" ]]; then
                        node "$PURGE_SCRIPT" --projectRoot "$PROJECT_ROOT" || echo "ℹ️  WebView storage purge failed (external script)"
                else
                        echo "ℹ️  purge_webview_storage.mjs not found; using inline purge"
                        node --input-type=module - <<'NODE' || true
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function exists(p) {
    try { fs.accessSync(p); return true; } catch { return false; }
}

function rmrf(p) {
    try {
        if (!exists(p)) return { skipped: true };
        fs.rmSync(p, { recursive: true, force: true });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

function safeReadJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function variantsForIdentifier(identifier) {
    const base = String(identifier || '').trim();
    if (!base) return [];
    return [base, `${base}.dev`, `${base}.debug`, `${base}.development`, `${base}.beta`];
}

function listChildren(dir) {
    try { return fs.readdirSync(dir, { withFileTypes: true }).map(d => d.name); } catch { return []; }
}

function removeMatchesBySubstring({ baseDirs, needle }) {
    const removed = [];
    if (!needle) return removed;
    const n = needle.toLowerCase();
    for (const base of baseDirs) {
        if (!exists(base)) continue;
        for (const name of listChildren(base)) {
            if (!String(name).toLowerCase().includes(n)) continue;
            const full = path.join(base, name);
            const res = rmrf(full);
            if (res.ok) removed.push(full);
        }
    }
    return removed;
}

try {
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    const confPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const conf = safeReadJson(confPath) || {};
    const identifier = conf.identifier || 'com.squirrel.desktop';
    const productName = String(conf.productName || 'squirrel').trim();
    const idVariants = variantsForIdentifier(identifier);

    const platform = process.platform;
    console.log(`WebView storage purge (inline) platform=${platform}`);
    console.log(`App identifier: ${identifier}`);
    console.log(`App productName: ${productName}`);

    const removed = [];

    if (platform === 'darwin') {
        for (const id of idVariants) {
            const targets = [
                path.join(os.homedir(), 'Library', 'WebKit', id),
                path.join(os.homedir(), 'Library', 'Containers', id),
                path.join(os.homedir(), 'Library', 'Application Support', id),
                path.join(os.homedir(), 'Library', 'Caches', id),
                path.join(os.homedir(), 'Library', 'HTTPStorages', id),
                path.join(os.homedir(), 'Library', 'HTTPStorages', `${id}.binarycookies`),
                path.join(os.homedir(), 'Library', 'Preferences', `${id}.plist`),
                path.join(os.homedir(), 'Library', 'Saved Application State', `${id}.savedState`)
            ];
            for (const t of targets) {
                const res = rmrf(t);
                if (res.ok) removed.push(t);
            }
        }
        removed.push(...removeMatchesBySubstring({
            baseDirs: [
                path.join(os.homedir(), 'Library', 'WebKit'),
                path.join(os.homedir(), 'Library', 'HTTPStorages'),
                path.join(os.homedir(), 'Library', 'Caches')
            ],
            needle: productName
        }));
    } else if (platform === 'linux') {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
        const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
        const names = [productName, ...idVariants].filter(Boolean);
        for (const base of [xdgConfig, xdgData, xdgCache]) {
            for (const name of names) {
                const t = path.join(base, name);
                const res = rmrf(t);
                if (res.ok) removed.push(t);
            }
        }
        removed.push(...removeMatchesBySubstring({ baseDirs: [xdgConfig, xdgData, xdgCache], needle: productName }));
    } else {
        console.log(`Unsupported platform for purge: ${platform}`);
    }

    if (!removed.length) {
        console.log('No WebView storage entries removed.');
    } else {
        for (const p of removed) console.log(`Removed: ${p}`);
    }
} catch (e) {
    console.log(`Inline purge failed: ${String(e?.message || e)}`);
}
NODE
                fi
    else
        echo "ℹ️  WebView storage purge skipped: node is not installed"
    fi
else
    echo "ℹ️  WebView storage purge not implemented for $OS_NAME"
fi
