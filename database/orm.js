/**
 * Unified ORM Layer for ADOLE/Eden Database
 * 
 * This module provides a database abstraction layer that works with both:
 * - SQLite (for iOS/Tauri local storage)
 * - PostgreSQL (for Fastify cloud server)
 * 
 * Uses Knex.js as the SQL query builder for cross-database compatibility.
 * 
 * Schema follows ADOLE specification:
 * - objects: base table for all entities
 * - users: FK to objects
 * - atomes: FK to objects, has properties
 * - properties: key/value storage per object
 * - property_versions: time-travel/versioning
 * - acls: granular permissions per property
 */

import knex from 'knex';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Deep merge two objects recursively (ADOLE principle: patch, don't replace)
 * @param {Object} target - The base object
 * @param {Object} source - The patch object with changes
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (
            source[key] !== null &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            target[key] !== null &&
            typeof target[key] === 'object' &&
            !Array.isArray(target[key])
        ) {
            // Recursively merge nested objects
            result[key] = deepMerge(target[key], source[key]);
        } else {
            // Overwrite with new value
            result[key] = source[key];
        }
    }

    return result;
}

// Determine database type from environment
function getDatabaseType() {
    // Check for explicit setting
    if (process.env.ADOLE_DB_TYPE) {
        return process.env.ADOLE_DB_TYPE; // 'sqlite' or 'postgres'
    }

    // Check if PostgreSQL connection string exists
    if (process.env.ADOLE_PG_DSN || process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL) {
        return 'postgres';
    }

    // Default to SQLite for local/mobile
    return 'sqlite';
}

// Get Knex configuration based on database type
function getKnexConfig() {
    const dbType = getDatabaseType();

    if (dbType === 'postgres') {
        const connectionString = process.env.ADOLE_PG_DSN ||
            process.env.PG_CONNECTION_STRING ||
            process.env.DATABASE_URL;

        return {
            client: 'pg',
            connection: connectionString,
            pool: { min: 0, max: 10 },
            migrations: {
                tableName: 'knex_migrations',
                directory: path.join(__dirname, 'migrations')
            }
        };
    }

    // SQLite configuration
    const sqlitePath = process.env.ADOLE_SQLITE_PATH ||
        path.join(PROJECT_ROOT, 'src', 'assets', 'adole.db');

    // Ensure directory exists
    const sqliteDir = path.dirname(sqlitePath);
    if (!fs.existsSync(sqliteDir)) {
        fs.mkdirSync(sqliteDir, { recursive: true });
    }

    return {
        client: 'sqlite3',
        connection: {
            filename: sqlitePath
        },
        useNullAsDefault: true,
        pool: {
            afterCreate: (conn, cb) => {
                // Enable foreign keys in SQLite
                conn.run('PRAGMA foreign_keys = ON', cb);
            }
        },
        migrations: {
            tableName: 'knex_migrations',
            directory: path.join(__dirname, 'migrations')
        }
    };
}

// Singleton Knex instance
let db = null;
let dbType = null;

/**
 * Initialize the database connection
 * @returns {Promise<import('knex').Knex>}
 */
export async function initDatabase() {
    if (db) return db;

    const config = getKnexConfig();
    dbType = getDatabaseType();
    db = knex(config);

    console.log(`[ORM] Initializing ${dbType.toUpperCase()} database...`);

    // Test connection
    try {
        await db.raw('SELECT 1');
        console.log(`[ORM] ✅ Database connection successful`);
    } catch (error) {
        console.error(`[ORM] ❌ Database connection failed:`, error.message);
        throw error;
    }

    // Create schema if needed
    await createSchema();

    return db;
}

/**
 * Get the database instance (must call initDatabase first)
 * @returns {import('knex').Knex}
 */
export function getDatabase() {
    if (!db) {
        throw new Error('[ORM] Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Check if we're using PostgreSQL
 * @returns {boolean}
 */
export function isPostgres() {
    return dbType === 'postgres';
}

/**
 * Check if we're using SQLite
 * @returns {boolean}
 */
export function isSQLite() {
    return dbType === 'sqlite';
}

/**
 * Create database schema
 * Creates all ADOLE tables if they don't exist
 */
async function createSchema() {
    console.log('[ORM] Creating/verifying schema...');

    // Tenants table
    if (!await db.schema.hasTable('tenants')) {
        await db.schema.createTable('tenants', (table) => {
            table.uuid('tenant_id').primary();
            table.text('name').notNullable();
            table.timestamp('created_at').defaultTo(db.fn.now());
        });
        console.log('[ORM] Created table: tenants');
    }

    // Principals (users/services) table
    if (!await db.schema.hasTable('principals')) {
        await db.schema.createTable('principals', (table) => {
            table.uuid('principal_id').primary();
            table.uuid('tenant_id').notNullable().references('tenant_id').inTable('tenants');
            table.text('kind').checkIn(['user', 'service']);
            table.text('email');
            table.text('phone');
            table.text('password_hash');
            table.text('username');
            table.timestamp('created_at').defaultTo(db.fn.now());
        });
        console.log('[ORM] Created table: principals');
    } else {
        // Add missing columns if they don't exist
        const hasPhone = await db.schema.hasColumn('principals', 'phone');
        if (!hasPhone) {
            await db.schema.alterTable('principals', (table) => {
                table.text('phone');
            });
            console.log('[ORM] Added column: principals.phone');
        }
        const hasUsername = await db.schema.hasColumn('principals', 'username');
        if (!hasUsername) {
            await db.schema.alterTable('principals', (table) => {
                table.text('username');
            });
            console.log('[ORM] Added column: principals.username');
        }
        const hasPasswordHash = await db.schema.hasColumn('principals', 'password_hash');
        if (!hasPasswordHash) {
            await db.schema.alterTable('principals', (table) => {
                table.text('password_hash');
            });
            console.log('[ORM] Added column: principals.password_hash');
        }
    }

    // Objects table (base for all entities)
    if (!await db.schema.hasTable('objects')) {
        await db.schema.createTable('objects', (table) => {
            table.uuid('object_id').primary();
            table.uuid('tenant_id').notNullable().references('tenant_id').inTable('tenants');
            table.text('type').notNullable(); // 'atome', 'project', 'user', etc.
            table.text('kind'); // domain logic type
            table.uuid('created_by').references('principal_id').inTable('principals');
            table.uuid('parent_id').references('object_id').inTable('objects');
            table.timestamp('created_at').defaultTo(db.fn.now());
            table.timestamp('updated_at').defaultTo(db.fn.now());
            table.integer('schema_version').defaultTo(1);
            table.json('meta').defaultTo('{}');
            table.boolean('deleted').defaultTo(false);
            table.timestamp('deleted_at');
        });
        console.log('[ORM] Created table: objects');
    } else {
        // Add missing columns
        const hasDeleted = await db.schema.hasColumn('objects', 'deleted');
        if (!hasDeleted) {
            await db.schema.alterTable('objects', (table) => {
                table.boolean('deleted').defaultTo(false);
            });
            console.log('[ORM] Added column: objects.deleted');
        }
        const hasDeletedAt = await db.schema.hasColumn('objects', 'deleted_at');
        if (!hasDeletedAt) {
            await db.schema.alterTable('objects', (table) => {
                table.timestamp('deleted_at');
            });
            console.log('[ORM] Added column: objects.deleted_at');
        }
        const hasKind = await db.schema.hasColumn('objects', 'kind');
        if (!hasKind) {
            await db.schema.alterTable('objects', (table) => {
                table.text('kind');
            });
            console.log('[ORM] Added column: objects.kind');
        }
        const hasUpdatedAt = await db.schema.hasColumn('objects', 'updated_at');
        if (!hasUpdatedAt) {
            await db.schema.alterTable('objects', (table) => {
                table.timestamp('updated_at').defaultTo(db.fn.now());
            });
            console.log('[ORM] Added column: objects.updated_at');
        }
        const hasParentId = await db.schema.hasColumn('objects', 'parent_id');
        if (!hasParentId) {
            await db.schema.alterTable('objects', (table) => {
                table.uuid('parent_id');
            });
            console.log('[ORM] Added column: objects.parent_id');
        }
    }

    // Properties table (key/value for objects)
    if (!await db.schema.hasTable('properties')) {
        await db.schema.createTable('properties', (table) => {
            table.uuid('property_id').primary();
            table.uuid('object_id').notNullable().references('object_id').inTable('objects').onDelete('CASCADE');
            table.text('key').notNullable();
            table.json('value');
            table.text('value_type'); // 'string', 'number', 'boolean', 'json', 'blob'
            table.timestamp('created_at').defaultTo(db.fn.now());
            table.timestamp('updated_at').defaultTo(db.fn.now());
            table.unique(['object_id', 'key']);
        });
        console.log('[ORM] Created table: properties');
    }

    // Property versions (time-travel)
    if (!await db.schema.hasTable('property_versions')) {
        await db.schema.createTable('property_versions', (table) => {
            table.uuid('version_id').primary();
            table.uuid('property_id').notNullable().references('property_id').inTable('properties').onDelete('CASCADE');
            table.uuid('object_id').notNullable();
            table.text('key').notNullable();
            table.json('value');
            table.json('previous_value');
            table.uuid('changed_by').references('principal_id').inTable('principals');
            table.timestamp('changed_at').defaultTo(db.fn.now());
            table.text('change_type'); // 'create', 'update', 'delete'

            table.index(['object_id', 'key', 'changed_at']);
        });
        console.log('[ORM] Created table: property_versions');
    }

    // ACLs (permissions)
    if (!await db.schema.hasTable('acls')) {
        await db.schema.createTable('acls', (table) => {
            table.uuid('acl_id').primary();
            table.uuid('tenant_id').notNullable().references('tenant_id').inTable('tenants');
            table.uuid('object_id').notNullable().references('object_id').inTable('objects').onDelete('CASCADE');
            table.text('property_path'); // null = whole object, specific key = that property only
            table.uuid('principal_id').notNullable().references('principal_id').inTable('principals');
            table.text('action').notNullable(); // 'read', 'write', 'delete', 'admin'
            table.boolean('allow').notNullable().defaultTo(true);
            table.timestamp('created_at').defaultTo(db.fn.now());

            table.index(['object_id', 'principal_id', 'action']);
        });
        console.log('[ORM] Created table: acls');
    }

    // Sync queue (for offline/online sync)
    if (!await db.schema.hasTable('sync_queue')) {
        await db.schema.createTable('sync_queue', (table) => {
            table.increments('id').primary();
            table.uuid('tenant_id').notNullable();
            table.uuid('object_id').notNullable();
            table.uuid('device_id');
            table.text('action').notNullable(); // 'push', 'pull', 'merge'
            table.text('status').defaultTo('pending');
            table.json('payload');
            table.timestamp('created_at').defaultTo(db.fn.now());
            table.timestamp('updated_at').defaultTo(db.fn.now());
        });
        console.log('[ORM] Created table: sync_queue');
    }

    console.log('[ORM] ✅ Schema verified/created');
}

// ============================================================================
// TENANT OPERATIONS
// ============================================================================

/**
 * Create or get a tenant
 * @param {string} name - Tenant name (usually phone number for users)
 * @param {string} [tenantId] - Optional specific UUID
 * @returns {Promise<{tenant_id: string, name: string, created_at: Date}>}
 */
export async function getOrCreateTenant(name, tenantId = null) {
    const id = tenantId || uuidv4();

    // Try to find existing tenant by name
    const existing = await db('tenants').where('name', name).first();
    if (existing) {
        return existing;
    }

    // Create new tenant
    await db('tenants').insert({
        tenant_id: id,
        name: name
    });

    return { tenant_id: id, name, created_at: new Date() };
}

// ============================================================================
// PRINCIPAL (USER) OPERATIONS
// ============================================================================

/**
 * Create a principal (user)
 * @param {Object} data
 * @param {string} data.tenant_id
 * @param {string} data.kind - 'user' or 'service'
 * @param {string} [data.email]
 * @param {string} [data.phone]
 * @param {string} [data.username]
 * @param {string} [data.password_hash]
 * @param {string} [data.principal_id] - Optional specific UUID
 * @returns {Promise<{principal_id: string}>}
 */
export async function createPrincipal(data) {
    const id = data.principal_id || uuidv4();

    await db('principals').insert({
        principal_id: id,
        tenant_id: data.tenant_id,
        kind: data.kind || 'user',
        email: data.email,
        phone: data.phone,
        username: data.username,
        password_hash: data.password_hash
    });

    return { principal_id: id };
}

/**
 * Find a principal by phone
 * @param {string} phone
 * @returns {Promise<Object|null>}
 */
export async function findPrincipalByPhone(phone) {
    return db('principals').where('phone', phone).first();
}

/**
 * Find a principal by email
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function findPrincipalByEmail(email) {
    return db('principals').where('email', email).first();
}

/**
 * Find a principal by ID
 * @param {string} principalId
 * @returns {Promise<Object|null>}
 */
export async function findPrincipalById(principalId) {
    return db('principals').where('principal_id', principalId).first();
}

/**
 * Delete a principal and all their data
 * @param {string} principalId
 * @returns {Promise<void>}
 */
export async function deletePrincipal(principalId) {
    // First delete all objects created by this principal
    await db('objects').where('created_by', principalId).del();

    // Then delete ACLs
    await db('acls').where('principal_id', principalId).del();

    // Finally delete the principal
    await db('principals').where('principal_id', principalId).del();
}

// ============================================================================
// OBJECT OPERATIONS
// ============================================================================

/**
 * Create an object
 * @param {Object} data
 * @param {string} data.tenant_id
 * @param {string} data.type - 'atome', 'project', etc.
 * @param {string} [data.kind] - domain logic type
 * @param {string} [data.created_by] - principal_id
 * @param {string} [data.parent_id]
 * @param {Object} [data.meta]
 * @param {string} [data.object_id] - Optional specific UUID
 * @returns {Promise<{object_id: string}>}
 */
export async function createObject(data) {
    const id = data.object_id || uuidv4();

    await db('objects').insert({
        object_id: id,
        tenant_id: data.tenant_id,
        type: data.type,
        kind: data.kind,
        created_by: data.created_by,
        parent_id: data.parent_id,
        meta: JSON.stringify(data.meta || {}),
        created_at: db.fn.now(),
        updated_at: db.fn.now()
    });

    return { object_id: id };
}

/**
 * Get an object by ID
 * @param {string} objectId
 * @param {boolean} [includeDeleted=false]
 * @returns {Promise<Object|null>}
 */
export async function getObject(objectId, includeDeleted = false) {
    let query = db('objects').where('object_id', objectId);
    if (!includeDeleted) {
        query = query.where('deleted', false);
    }
    return query.first();
}

/**
 * Get all objects for a principal
 * @param {string} principalId
 * @param {string} [type] - Filter by type
 * @param {boolean} [includeDeleted=false]
 * @returns {Promise<Object[]>}
 */
export async function getObjectsByPrincipal(principalId, type = null, includeDeleted = false) {
    let query = db('objects').where('created_by', principalId);
    if (type) {
        query = query.where('type', type);
    }
    if (!includeDeleted) {
        query = query.where('deleted', false);
    }
    return query.orderBy('created_at', 'desc');
}

/**
 * Soft delete an object
 * @param {string} objectId
 * @returns {Promise<void>}
 */
export async function deleteObject(objectId) {
    await db('objects')
        .where('object_id', objectId)
        .update({
            deleted: true,
            deleted_at: db.fn.now()
        });
}

/**
 * Hard delete an object and all its properties
 * @param {string} objectId
 * @returns {Promise<void>}
 */
export async function hardDeleteObject(objectId) {
    // Properties are deleted by CASCADE
    await db('objects').where('object_id', objectId).del();
}

/**
 * Update an object
 * @param {string} objectId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateObject(objectId, updates) {
    await db('objects')
        .where('object_id', objectId)
        .update({
            ...updates,
            updated_at: db.fn.now()
        });
}

// ============================================================================
// PROPERTY OPERATIONS
// ============================================================================

/**
 * Set a property on an object (creates or updates)
 * @param {string} objectId
 * @param {string} key
 * @param {any} value
 * @param {string} [changedBy] - principal_id for versioning
 * @returns {Promise<{property_id: string}>}
 */
export async function setProperty(objectId, key, value, changedBy = null) {
    // Check if property exists
    const existing = await db('properties')
        .where({ object_id: objectId, key })
        .first();

    let finalValue = value;

    // If property exists and both old and new values are objects, do a deep merge
    // This is the ADOLE principle: alterations patch, they don't replace
    if (existing && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        try {
            const existingValue = JSON.parse(existing.value);
            if (typeof existingValue === 'object' && existingValue !== null && !Array.isArray(existingValue)) {
                // Deep merge: new values override existing, but existing keys not in new are preserved
                finalValue = deepMerge(existingValue, value);
                console.log(`[ORM] Deep merging property '${key}':`, { existing: existingValue, patch: value, result: finalValue });
            }
        } catch (e) {
            // If parsing fails, use the new value as-is
            console.warn(`[ORM] Could not parse existing value for merge, replacing:`, e.message);
        }
    }

    const valueJson = JSON.stringify(finalValue);
    const valueType = typeof finalValue;

    if (existing) {
        // Update existing property
        await db('properties')
            .where('property_id', existing.property_id)
            .update({
                value: valueJson,
                value_type: valueType,
                updated_at: db.fn.now()
            });

        // Create version record
        await db('property_versions').insert({
            version_id: uuidv4(),
            property_id: existing.property_id,
            object_id: objectId,
            key: key,
            value: valueJson,
            previous_value: existing.value,
            changed_by: changedBy,
            change_type: 'update'
        });

        return { property_id: existing.property_id };
    } else {
        // Create new property
        const propertyId = uuidv4();

        await db('properties').insert({
            property_id: propertyId,
            object_id: objectId,
            key: key,
            value: valueJson,
            value_type: valueType
        });

        // Create version record
        await db('property_versions').insert({
            version_id: uuidv4(),
            property_id: propertyId,
            object_id: objectId,
            key: key,
            value: valueJson,
            previous_value: null,
            changed_by: changedBy,
            change_type: 'create'
        });

        return { property_id: propertyId };
    }
}

/**
 * Get a property value
 * @param {string} objectId
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getProperty(objectId, key) {
    const prop = await db('properties')
        .where({ object_id: objectId, key })
        .first();

    if (!prop) return undefined;

    try {
        return JSON.parse(prop.value);
    } catch {
        return prop.value;
    }
}

/**
 * Get all properties for an object
 * @param {string} objectId
 * @returns {Promise<Object>}
 */
export async function getAllProperties(objectId) {
    const props = await db('properties').where('object_id', objectId);

    const result = {};
    for (const prop of props) {
        try {
            result[prop.key] = JSON.parse(prop.value);
        } catch {
            result[prop.key] = prop.value;
        }
    }
    return result;
}

/**
 * Delete a property
 * @param {string} objectId
 * @param {string} key
 * @param {string} [changedBy]
 * @returns {Promise<void>}
 */
export async function deleteProperty(objectId, key, changedBy = null) {
    const existing = await db('properties')
        .where({ object_id: objectId, key })
        .first();

    if (existing) {
        // Create version record before delete
        await db('property_versions').insert({
            version_id: uuidv4(),
            property_id: existing.property_id,
            object_id: objectId,
            key: key,
            value: null,
            previous_value: existing.value,
            changed_by: changedBy,
            change_type: 'delete'
        });

        await db('properties').where('property_id', existing.property_id).del();
    }
}

/**
 * Set multiple properties at once
 * @param {string} objectId
 * @param {Object} properties
 * @param {string} [changedBy]
 * @returns {Promise<void>}
 */
export async function setProperties(objectId, properties, changedBy = null) {
    for (const [key, value] of Object.entries(properties)) {
        await setProperty(objectId, key, value, changedBy);
    }
}

// ============================================================================
// PROPERTY VERSION OPERATIONS (TIME-TRAVEL)
// ============================================================================

/**
 * Get property history
 * @param {string} objectId
 * @param {string} key
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
export async function getPropertyHistory(objectId, key, limit = 100) {
    return db('property_versions')
        .where({ object_id: objectId, key })
        .orderBy('changed_at', 'desc')
        .limit(limit);
}

/**
 * Get property value at a specific time
 * @param {string} objectId
 * @param {string} key
 * @param {Date} timestamp
 * @returns {Promise<any>}
 */
export async function getPropertyAtTime(objectId, key, timestamp) {
    const version = await db('property_versions')
        .where({ object_id: objectId, key })
        .where('changed_at', '<=', timestamp)
        .orderBy('changed_at', 'desc')
        .first();

    if (!version) return undefined;

    try {
        return JSON.parse(version.value);
    } catch {
        return version.value;
    }
}

// ============================================================================
// ACL OPERATIONS
// ============================================================================

/**
 * Grant permission
 * @param {Object} data
 * @param {string} data.tenant_id
 * @param {string} data.object_id
 * @param {string} data.principal_id
 * @param {string} data.action - 'read', 'write', 'delete', 'admin'
 * @param {string} [data.property_path] - specific property or null for whole object
 * @param {boolean} [data.allow=true]
 * @returns {Promise<{acl_id: string}>}
 */
export async function grantPermission(data) {
    const id = uuidv4();

    await db('acls').insert({
        acl_id: id,
        tenant_id: data.tenant_id,
        object_id: data.object_id,
        property_path: data.property_path || null,
        principal_id: data.principal_id,
        action: data.action,
        allow: data.allow !== false
    });

    return { acl_id: id };
}

/**
 * Check if a principal has permission on an object
 * @param {string} principalId
 * @param {string} objectId
 * @param {string} action
 * @param {string} [propertyPath]
 * @returns {Promise<boolean>}
 */
export async function hasPermission(principalId, objectId, action, propertyPath = null) {
    // Check object-level permission first
    const objectPerm = await db('acls')
        .where({
            object_id: objectId,
            principal_id: principalId,
            action: action,
            allow: true
        })
        .whereNull('property_path')
        .first();

    if (objectPerm) return true;

    // If checking specific property, check property-level permission
    if (propertyPath) {
        const propPerm = await db('acls')
            .where({
                object_id: objectId,
                principal_id: principalId,
                property_path: propertyPath,
                action: action,
                allow: true
            })
            .first();

        if (propPerm) return true;
    }

    // Check if user is the creator (implicit admin)
    const obj = await getObject(objectId);
    if (obj && obj.created_by === principalId) {
        return true;
    }

    return false;
}

/**
 * Revoke permission
 * @param {string} objectId
 * @param {string} principalId
 * @param {string} action
 * @param {string} [propertyPath]
 * @returns {Promise<void>}
 */
export async function revokePermission(objectId, principalId, action, propertyPath = null) {
    let query = db('acls')
        .where({
            object_id: objectId,
            principal_id: principalId,
            action: action
        });

    if (propertyPath) {
        query = query.where('property_path', propertyPath);
    } else {
        query = query.whereNull('property_path');
    }

    await query.del();
}

// ============================================================================
// SYNC QUEUE OPERATIONS
// ============================================================================

/**
 * Add to sync queue
 * @param {Object} data
 * @param {string} data.tenant_id
 * @param {string} data.object_id
 * @param {string} data.action - 'push', 'pull', 'merge'
 * @param {string} [data.device_id]
 * @param {Object} [data.payload]
 * @returns {Promise<{id: number}>}
 */
export async function addToSyncQueue(data) {
    const [id] = await db('sync_queue').insert({
        tenant_id: data.tenant_id,
        object_id: data.object_id,
        action: data.action,
        device_id: data.device_id,
        payload: JSON.stringify(data.payload || {}),
        status: 'pending'
    }).returning('id');

    return { id: typeof id === 'object' ? id.id : id };
}

/**
 * Get pending sync items
 * @param {string} [deviceId]
 * @returns {Promise<Array>}
 */
export async function getPendingSyncItems(deviceId = null) {
    let query = db('sync_queue').where('status', 'pending');
    if (deviceId) {
        query = query.where('device_id', deviceId);
    }
    return query.orderBy('created_at', 'asc');
}

/**
 * Mark sync item as complete
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function completeSyncItem(id) {
    await db('sync_queue')
        .where('id', id)
        .update({
            status: 'completed',
            updated_at: db.fn.now()
        });
}

/**
 * Mark sync item as failed
 * @param {number} id
 * @param {string} error
 * @returns {Promise<void>}
 */
export async function failSyncItem(id, error) {
    await db('sync_queue')
        .where('id', id)
        .update({
            status: 'failed',
            payload: db.raw(`payload || ?`, [JSON.stringify({ error })]),
            updated_at: db.fn.now()
        });
}

// ============================================================================
// HIGH-LEVEL ATOME OPERATIONS
// ============================================================================

/**
 * Create a complete atome with properties
 * @param {Object} data
 * @param {string} data.tenant_id
 * @param {string} data.created_by - principal_id
 * @param {string} [data.kind] - domain logic type
 * @param {string} [data.parent_id]
 * @param {Object} [data.properties] - initial properties
 * @param {string} [data.object_id] - optional specific ID
 * @returns {Promise<{object_id: string, properties: Object}>}
 */
export async function createAtome(data) {
    const { object_id } = await createObject({
        object_id: data.object_id,
        tenant_id: data.tenant_id,
        type: 'atome',
        kind: data.kind,
        created_by: data.created_by,
        parent_id: data.parent_id
    });

    if (data.properties) {
        await setProperties(object_id, data.properties, data.created_by);
    }

    return {
        object_id,
        properties: data.properties || {}
    };
}

/**
 * Get a complete atome with all its properties
 * @param {string} objectId
 * @returns {Promise<Object|null>}
 */
export async function getAtome(objectId) {
    const obj = await getObject(objectId);
    if (!obj || obj.type !== 'atome') return null;

    const properties = await getAllProperties(objectId);

    return {
        ...obj,
        properties
    };
}

/**
 * Get all atomes for a user
 * @param {string} principalId
 * @param {boolean} [includeDeleted=false]
 * @returns {Promise<Array>}
 */
export async function getAtomesByUser(principalId, includeDeleted = false) {
    const objects = await getObjectsByPrincipal(principalId, 'atome', includeDeleted);

    const atomes = [];
    for (const obj of objects) {
        const properties = await getAllProperties(obj.object_id);
        atomes.push({
            ...obj,
            properties
        });
    }

    return atomes;
}

/**
 * Update atome properties
 * @param {string} objectId
 * @param {Object} properties
 * @param {string} [changedBy]
 * @returns {Promise<void>}
 */
export async function updateAtome(objectId, properties, changedBy = null) {
    await updateObject(objectId, {});
    await setProperties(objectId, properties, changedBy);
}

/**
 * Delete an atome (soft delete)
 * @param {string} objectId
 * @returns {Promise<void>}
 */
export async function deleteAtome(objectId) {
    await deleteObject(objectId);
}

// ============================================================================
// CLEANUP & UTILITY
// ============================================================================

/**
 * Close database connection
 */
export async function closeDatabase() {
    if (db) {
        await db.destroy();
        db = null;
        dbType = null;
        console.log('[ORM] Database connection closed');
    }
}

/**
 * Get database info
 * @returns {Object}
 */
export function getDatabaseInfo() {
    return {
        type: dbType,
        isPostgres: isPostgres(),
        isSQLite: isSQLite(),
        initialized: db !== null
    };
}

// Export default for convenience
export default {
    initDatabase,
    getDatabase,
    isPostgres,
    isSQLite,
    closeDatabase,
    getDatabaseInfo,

    // Tenant
    getOrCreateTenant,

    // Principal
    createPrincipal,
    findPrincipalByPhone,
    findPrincipalByEmail,
    findPrincipalById,
    deletePrincipal,

    // Object
    createObject,
    getObject,
    getObjectsByPrincipal,
    deleteObject,
    hardDeleteObject,
    updateObject,

    // Property
    setProperty,
    getProperty,
    getAllProperties,
    deleteProperty,
    setProperties,

    // Property versions
    getPropertyHistory,
    getPropertyAtTime,

    // ACL
    grantPermission,
    hasPermission,
    revokePermission,

    // Sync
    addToSyncQueue,
    getPendingSyncItems,
    completeSyncItem,
    failSyncItem,

    // Atome high-level
    createAtome,
    getAtome,
    getAtomesByUser,
    updateAtome,
    deleteAtome
};
