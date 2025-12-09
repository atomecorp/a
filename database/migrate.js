/**
 * Migration Runner for SQLite / libSQL
 * 
 * Applies SQL migration files in order based on version number.
 * Migrations are stored in database/migrations/*.sql
 * 
 * Naming convention: NNN_description.sql (e.g., 001_initial_schema.sql)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

/**
 * Get list of migration files sorted by version
 */
function getMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    return files.map(f => ({
        filename: f,
        version: f.split('_')[0],
        name: f.replace('.sql', ''),
        path: path.join(MIGRATIONS_DIR, f)
    }));
}

/**
 * Get applied migrations from database
 */
async function getAppliedMigrations(db) {
    // Check if migrations table exists
    const tableExists = db.type === 'sqlite'
        ? db.tableExists('schema_migrations')
        : await db.tableExists('schema_migrations');

    if (!tableExists) {
        return [];
    }

    const rows = db.type === 'sqlite'
        ? db.all('SELECT version FROM schema_migrations ORDER BY version')
        : await db.all('SELECT version FROM schema_migrations ORDER BY version');

    return rows.map(r => r.version);
}

/**
 * Apply the base schema from schema.sql
 */
async function applyBaseSchema(db) {
    console.log('[Migrate] Applying base schema...');

    if (!fs.existsSync(SCHEMA_FILE)) {
        throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
    }

    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');

    if (db.type === 'sqlite') {
        db.exec(schema);
    } else {
        await db.exec(schema);
    }

    console.log('[Migrate] Base schema applied successfully');
}

/**
 * Apply a single migration
 */
async function applyMigration(db, migration) {
    console.log(`[Migrate] Applying: ${migration.name}`);

    const sql = fs.readFileSync(migration.path, 'utf8');

    // Skip empty or comment-only migrations
    const cleanSql = sql.replace(/--.*$/gm, '').trim();
    if (cleanSql.length === 0) {
        console.log(`[Migrate] Skipping empty migration: ${migration.name}`);
    } else {
        if (db.type === 'sqlite') {
            db.exec(sql);
        } else {
            await db.exec(sql);
        }
    }

    // Ensure schema_migrations table exists before inserting
    const createMigrationsTable = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    `;

    if (db.type === 'sqlite') {
        db.exec(createMigrationsTable);
    } else {
        await db.exec(createMigrationsTable);
    }

    // Record migration as applied
    const insertSql = `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`;

    if (db.type === 'sqlite') {
        db.run(insertSql, [migration.version, migration.name]);
    } else {
        await db.run(insertSql, [migration.version, migration.name]);
    }

    console.log(`[Migrate] ✅ Applied: ${migration.name}`);
}

/**
 * Run all pending migrations
 * @param {Object} db - Database driver instance
 * @returns {Promise<{applied: string[], skipped: string[]}>}
 */
export async function runMigrations(db) {
    console.log('[Migrate] Starting migration run...');

    // First, ensure base schema exists
    const tenantsExists = db.type === 'sqlite'
        ? db.tableExists('tenants')
        : await db.tableExists('tenants');

    if (!tenantsExists) {
        await applyBaseSchema(db);
    }

    // Get migration status
    const migrations = getMigrationFiles();
    const applied = await getAppliedMigrations(db);

    const pending = migrations.filter(m => !applied.includes(m.version));
    const skipped = migrations.filter(m => applied.includes(m.version));

    console.log(`[Migrate] Found ${migrations.length} migrations, ${pending.length} pending`);

    // Apply pending migrations
    const newlyApplied = [];
    for (const migration of pending) {
        await applyMigration(db, migration);
        newlyApplied.push(migration.name);
    }

    console.log(`[Migrate] Migration complete. Applied: ${newlyApplied.length}, Skipped: ${skipped.length}`);

    return {
        applied: newlyApplied,
        skipped: skipped.map(m => m.name)
    };
}

/**
 * Check migration status without applying
 */
export async function getMigrationStatus(db) {
    const migrations = getMigrationFiles();
    const applied = await getAppliedMigrations(db);

    return migrations.map(m => ({
        ...m,
        applied: applied.includes(m.version)
    }));
}

/**
 * Create a new migration file
 */
export function createMigration(name) {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    }

    const migrations = getMigrationFiles();
    const lastVersion = migrations.length > 0
        ? parseInt(migrations[migrations.length - 1].version, 10)
        : 0;

    const newVersion = String(lastVersion + 1).padStart(3, '0');
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${newVersion}_${safeName}.sql`;
    const filepath = path.join(MIGRATIONS_DIR, filename);

    const template = `-- Migration: ${newVersion}_${safeName}
-- Date: ${new Date().toISOString().split('T')[0]}
-- Description: ${name}

-- Add your SQL statements here

`;

    fs.writeFileSync(filepath, template);
    console.log(`[Migrate] Created: ${filename}`);

    return filepath;
}

export default {
    runMigrations,
    getMigrationStatus,
    createMigration
};
