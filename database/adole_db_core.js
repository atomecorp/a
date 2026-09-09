// ============================================================================
// ADOLE DB CORE — shared database foundation (ADOLE v3.0)
// ============================================================================
// Single source of truth for the live driver connection, the low-level query
// entry point, JSON (de)serialization, transactions, and schema bootstrap.
// Every adole_* section module imports `query`/`serializeJson`/`safeParseJson`
// from here so the mutable `db`/`isAsync` state stays a single ESM singleton.

import {
    connect,
    getDatabase as getDriverDb,
    closeDatabase as closeDriver
} from './driver.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runAdoleSchemaMigrations } from './adole_schema_migrations.js';

let db = null;
let isAsync = false;
let transactionTail = Promise.resolve();
const transactionContext = new AsyncLocalStorage();

// Concurrent first queries used to each run a full initialisation: `db` is only
// assigned after `await connect()`, so every caller passed the `if (db)` guard.
// The schema was applied N times and the DROP/CREATE VIEW of the migration chain
// then failed for all but one of them. One in-flight promise serialises them.
let initializing = null;

export async function initDatabase(config = {}) {
    if (db) return db;
    if (initializing) return initializing;
    initializing = openDatabase(config).finally(() => { initializing = null; });
    return initializing;
}

// Schema + migrations are pure DDL: replaying them on every boot costs a full
// `exec` of schema.sql plus ~15 PRAGMA/scan round-trips, and it is the only
// reason `users_view` is dropped and recreated at each start. `PRAGMA
// user_version` records a fingerprint of the DDL that produced the current
// file; when it matches, the whole chain is skipped. The fingerprint is derived
// from the DDL sources themselves, so editing schema.sql or the migration module
// re-runs them automatically -- no version constant to remember to bump.
const ddlFingerprint = (...sources) => {
    let hash = 0x811c9dc5;
    for (const source of sources) {
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
    }
    return hash & 0x7fffffff;
};

async function openDatabase(config) {
    console.log('[ADOLE v3.0] Initializing unified database...');
    db = await connect(config);
    isAsync = db.type === 'libsql';

    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
    const migrations = fs.readFileSync(path.join(here, 'adole_schema_migrations.js'), 'utf8');
    const expectedVersion = ddlFingerprint(schema, migrations);

    const [{ user_version: currentVersion = 0 } = {}] = await query('all', 'PRAGMA user_version');
    if (currentVersion === expectedVersion) return db;

    // A schema failure used to be logged as "already exists or error" and
    // swallowed, leaving the server running against a half-built database.
    await query('exec', schema);
    await runAdoleSchemaMigrations(query);
    await query('exec', `PRAGMA user_version = ${expectedVersion}`);
    console.log(`[ADOLE v3.0] Schema and migrations applied (ddl ${expectedVersion})`);

    return db;
}

export async function query(method, sql, params = []) {
    if (!db) await initDatabase();
    if (isAsync) {
        return await db[method](sql, params);
    }
    return db[method](sql, params);
}

export function safeParseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function serializeJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

export async function withTransaction(work) {
    if (!db) await initDatabase();
    if (transactionContext.getStore() === true) return work();
    const previousTransaction = transactionTail;
    let releaseTransaction;
    transactionTail = new Promise((resolve) => {
        releaseTransaction = resolve;
    });
    await previousTransaction;
    try {
        return await transactionContext.run(true, async () => {
            try {
                await db.beginTransaction();
                const result = await work();
                await db.commit();
                return result;
            } catch (error) {
                try {
                    await db.rollback();
                } catch (rollbackError) {
                    error.rollback_error = rollbackError.message;
                }
                throw error;
            }
        });
    } finally {
        releaseTransaction();
    }
}

export function getDatabase() {
    return db;
}

export async function closeDatabase() {
    if (db) {
        await closeDriver();
        db = null;
    }
}
