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
import { runAdoleSchemaMigrations } from './adole_schema_migrations.js';

let db = null;
let isAsync = false;

export async function initDatabase(config = {}) {
    if (db) return db;

    console.log('[ADOLE v3.0] Initializing unified database...');
    db = await connect(config);
    isAsync = db.type === 'libsql';

    // Run schema from file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, 'schema.sql');

    try {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await query('exec', schema);
        console.log('[ADOLE v3.0] Unified schema applied successfully');
    } catch (e) {
        console.log('[ADOLE v3.0] Schema already exists or error:', e.message);
    }

    await runAdoleSchemaMigrations(query);

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
