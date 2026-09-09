/**
 * Unified Database Driver for SQLite / libSQL (Turso)
 * 
 * Minimal SQL driver without ORM - direct SQL execution only.
 * Supports:
 * - SQLite native (better-sqlite3 for Node.js, wa-sqlite for browser)
 * - libSQL (Turso) for cloud deployment
 * 
 * API:
 * - connect(config) → Promise<Database>
 * - db.exec(sql) → void (for DDL/schema)
 * - db.run(sql, params) → { changes, lastInsertRowid }
 * - db.get(sql, params) → row | undefined
 * - db.all(sql, params) → rows[]
 * - db.close() → void
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Driver type detection
let driverType = null; // 'sqlite' | 'libsql'
let db = null;

/**
 * Detect which driver to use based on environment
 * Priority: LIBSQL_URL > TURSO_DATABASE_URL > SQLite fallback
 */
function detectDriverType() {
    if (process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL) {
        return 'libsql';
    }
    return 'sqlite';
}

/**
 * Get SQLite database path
 * Note: database_storage/ is outside src/ to avoid triggering Tauri hot-reload
 */
function getSqlitePath() {
    return process.env.SQLITE_PATH ||
        process.env.ADOLE_SQLITE_PATH ||
        path.join(PROJECT_ROOT, 'database_storage', 'adole.db');
}

/**
 * Ensure directory exists for SQLite file
 */
function ensureDirectory(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * SQLite Driver (better-sqlite3)
 * Synchronous API wrapped in async for consistency
 */
class SqliteDriver {
    static STATEMENT_CACHE_MAX = 256;

    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.type = 'sqlite';
        this.statements = new Map();
    }

    async connect() {
        // Dynamic import to avoid requiring better-sqlite3 when using libSQL
        const Database = (await import('better-sqlite3')).default;

        ensureDirectory(this.dbPath);
        this.db = new Database(this.dbPath);

        // Enable foreign keys and WAL mode for better performance
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');

        console.log(`[DB] Connected to SQLite: ${this.dbPath}`);
        return this;
    }

    /**
     * Execute raw SQL (for schema/DDL)
     */
    exec(sql) {
        // DDL changes the schema, which invalidates every compiled statement.
        this.statements.clear();
        return this.db.exec(sql);
    }

    /**
     * Compiled-statement cache.
     *
     * run/get/all used to call `this.db.prepare(sql)` on EVERY call, so the same
     * dozen queries were recompiled thousands of times per session. better-sqlite3
     * statements are reusable and synchronous, so caching them is safe; the cache
     * is bounded and cleared by `exec` (DDL) and `close`.
     */
    prepared(sql) {
        let stmt = this.statements.get(sql);
        if (stmt) return stmt;
        stmt = this.db.prepare(sql);
        if (this.statements.size >= SqliteDriver.STATEMENT_CACHE_MAX) {
            this.statements.delete(this.statements.keys().next().value);
        }
        this.statements.set(sql, stmt);
        return stmt;
    }

    /**
     * Run a statement (INSERT/UPDATE/DELETE)
     * @returns {{ changes: number, lastInsertRowid: number }}
     */
    run(sql, params = []) {
        const result = this.prepared(sql).run(...(Array.isArray(params) ? params : [params]));
        return {
            changes: result.changes,
            lastInsertRowid: result.lastInsertRowid
        };
    }

    /**
     * Get a single row
     * @returns {Object|undefined}
     */
    get(sql, params = []) {
        return this.prepared(sql).get(...(Array.isArray(params) ? params : [params]));
    }

    /**
     * Get all matching rows
     * @returns {Array<Object>}
     */
    all(sql, params = []) {
        return this.prepared(sql).all(...(Array.isArray(params) ? params : [params]));
    }

    /**
     * Run multiple statements in a transaction
     */
    transaction(fn) {
        const trx = this.db.transaction(fn);
        return trx();
    }

    /**
     * Begin a manual transaction
     */
    beginTransaction() {
        this.db.exec('BEGIN TRANSACTION');
    }

    /**
     * Commit transaction
     */
    commit() {
        this.db.exec('COMMIT');
    }

    /**
     * Rollback transaction
     */
    rollback() {
        this.db.exec('ROLLBACK');
    }

    /**
     * Check if table exists
     */
    tableExists(tableName) {
        const row = this.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            [tableName]
        );
        return !!row;
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.statements.clear();
            this.db.close();
            this.db = null;
            console.log('[DB] SQLite connection closed');
        }
    }
}

/**
 * libSQL Driver (Turso)
 * Async API for cloud database
 */
class LibsqlDriver {
    constructor(url, authToken) {
        this.url = url;
        this.authToken = authToken;
        this.client = null;
        this.type = 'libsql';
    }

    async connect() {
        // Dynamic import for @libsql/client
        const { createClient } = await import('@libsql/client');

        this.client = createClient({
            url: this.url,
            authToken: this.authToken
        });

        // Enable foreign keys
        await this.client.execute('PRAGMA foreign_keys = ON');

        console.log(`[DB] Connected to libSQL: ${this.url}`);
        return this;
    }

    /**
     * Execute raw SQL (for schema/DDL)
     */
    async exec(sql) {
        // libSQL doesn't have batch exec, split by semicolon
        const statements = sql.split(';').filter(s => s.trim());
        for (const stmt of statements) {
            if (stmt.trim()) {
                await this.client.execute(stmt);
            }
        }
    }

    /**
     * Run a statement (INSERT/UPDATE/DELETE)
     */
    async run(sql, params = []) {
        const result = await this.client.execute({
            sql,
            args: Array.isArray(params) ? params : [params]
        });
        return {
            changes: result.rowsAffected,
            lastInsertRowid: result.lastInsertRowid
        };
    }

    /**
     * Get a single row
     */
    async get(sql, params = []) {
        const result = await this.client.execute({
            sql,
            args: Array.isArray(params) ? params : [params]
        });

        if (result.rows.length === 0) {
            return undefined;
        }

        // Convert libSQL row to plain object
        return this._rowToObject(result.rows[0], result.columns);
    }

    /**
     * Get all matching rows
     */
    async all(sql, params = []) {
        const result = await this.client.execute({
            sql,
            args: Array.isArray(params) ? params : [params]
        });

        return result.rows.map(row => this._rowToObject(row, result.columns));
    }

    /**
     * Convert libSQL row to plain object
     */
    _rowToObject(row, columns) {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = row[i];
        }
        return obj;
    }

    /**
     * Run multiple statements in a transaction
     */
    async transaction(fn) {
        await this.client.execute('BEGIN TRANSACTION');
        try {
            const result = await fn(this);
            await this.client.execute('COMMIT');
            return result;
        } catch (error) {
            await this.client.execute('ROLLBACK');
            throw error;
        }
    }

    /**
     * Begin a manual transaction
     */
    async beginTransaction() {
        await this.client.execute('BEGIN TRANSACTION');
    }

    /**
     * Commit transaction
     */
    async commit() {
        await this.client.execute('COMMIT');
    }

    /**
     * Rollback transaction
     */
    async rollback() {
        await this.client.execute('ROLLBACK');
    }

    /**
     * Check if table exists
     */
    async tableExists(tableName) {
        const row = await this.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            [tableName]
        );
        return !!row;
    }

    /**
     * Close the connection
     */
    close() {
        if (this.client) {
            this.client.close();
            this.client = null;
            console.log('[DB] libSQL connection closed');
        }
    }
}

/**
 * Connect to database (auto-detect driver)
 * @param {Object} [config] - Optional configuration override
 * @returns {Promise<SqliteDriver|LibsqlDriver>}
 */
// The driver handle used to be published on `db` BEFORE `await db.connect()`
// resolved, so a second concurrent caller could take the early return above and
// receive a driver whose underlying handle was still null. The in-flight promise
// makes every concurrent caller await the same connection.
let connecting = null;

export async function connect(config = {}) {
    if (db) {
        return db;
    }
    if (connecting) {
        return connecting;
    }
    connecting = openConnection(config).finally(() => { connecting = null; });
    return connecting;
}

async function openConnection(config) {
    driverType = config.type || detectDriverType();
    let resolvedUrl = null;
    let resolvedAuthToken = null;
    let resolvedPath = null;

    if (driverType === 'libsql') {
        const url = config.url ||
            process.env.LIBSQL_URL ||
            process.env.TURSO_DATABASE_URL;
        const authToken = config.authToken ||
            process.env.LIBSQL_AUTH_TOKEN ||
            process.env.TURSO_AUTH_TOKEN;

        if (!url) {
            throw new Error('[DB] libSQL URL not configured. Set LIBSQL_URL or TURSO_DATABASE_URL');
        }

        resolvedUrl = url;
        resolvedAuthToken = authToken;
    } else {
        resolvedPath = config.path || getSqlitePath();
    }

    // `db` is published only once the handle is actually open.
    const pending = driverType === 'libsql'
        ? new LibsqlDriver(resolvedUrl, resolvedAuthToken)
        : new SqliteDriver(resolvedPath);
    await pending.connect();
    db = pending;
    return db;
}

/**
 * Get the current database instance
 * @returns {SqliteDriver|LibsqlDriver}
 */
export function getDatabase() {
    if (!db) {
        throw new Error('[DB] Database not connected. Call connect() first.');
    }
    return db;
}

/**
 * Get the driver type ('sqlite' or 'libsql')
 */
export function getDriverType() {
    return driverType;
}

/**
 * Check if using SQLite
 */
export function isSqlite() {
    return driverType === 'sqlite';
}

/**
 * Check if using libSQL (Turso)
 */
export function isLibsql() {
    return driverType === 'libsql';
}

/**
 * Close database connection
 */
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        driverType = null;
    }
}

/**
 * Serialize JSON for storage (consistent across drivers)
 * SQLite TEXT columns store strings, so always stringify
 */
export function serializeJson(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return JSON.stringify(value);
}

/**
 * Deserialize JSON from storage
 */
export function deserializeJson(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'object') {
        return value; // Already parsed
    }
    try {
        return JSON.parse(value);
    } catch {
        return value; // Return as-is if not valid JSON
    }
}

// Export classes for direct instantiation if needed
export { SqliteDriver, LibsqlDriver };

export default {
    connect,
    getDatabase,
    getDriverType,
    isSqlite,
    isLibsql,
    closeDatabase,
    serializeJson,
    deserializeJson
};
