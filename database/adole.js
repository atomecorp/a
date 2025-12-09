/**
 * ADOLE Data Layer - Unified SQLite/libSQL without ORM
 * 
 * Direct SQL implementation of the ADOLE (Append-only Distributed Object Ledger Engine)
 * data model. No Knex, no TypeORM, no Objection - pure SQL only.
 * 
 * Supports:
 * - SQLite native (better-sqlite3)
 * - libSQL (Turso)
 * 
 * All operations follow ADOLE principles:
 * - Append-only modifications (versioning)
 * - Granular property-level ACL
 * - Time-travel queries
 */

import { v4 as uuidv4 } from 'uuid';
import {
    connect,
    getDatabase as getDriverDb,
    isSqlite,
    isLibsql,
    serializeJson,
    deserializeJson,
    closeDatabase as closeDriver
} from './driver.js';
import { runMigrations } from './migrate.js';

// Database instance reference
let db = null;
let isAsync = false; // true for libSQL, false for SQLite

/**
 * Deep merge two objects recursively (ADOLE principle: patch, don't replace)
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
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

/**
 * Execute a query (handles sync/async transparently)
 */
async function query(method, sql, params = []) {
    if (isAsync) {
        return await db[method](sql, params);
    }
    return db[method](sql, params);
}

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

/**
 * Initialize the database connection and run migrations
 * @param {Object} [config] - Optional configuration
 * @returns {Promise<Object>} Database instance
 */
export async function initDatabase(config = {}) {
    if (db) return db;

    console.log('[ADOLE] Initializing database...');

    db = await connect(config);
    isAsync = db.type === 'libsql';

    console.log(`[ADOLE] Connected to ${db.type.toUpperCase()} database`);

    // Run migrations
    await runMigrations(db);

    console.log('[ADOLE] ✅ Database ready');
    return db;
}

/**
 * Get the database instance
 */
export function getDb() {
    if (!db) {
        throw new Error('[ADOLE] Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Check if using SQLite
 */
export { isSqlite, isLibsql };

/**
 * Close database connection
 */
export async function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('[ADOLE] Database connection closed');
    }
}

// ============================================================================
// TENANT OPERATIONS
// ============================================================================

/**
 * Create or get a tenant
 */
export async function getOrCreateTenant(name, tenantId = null) {
    const id = tenantId || uuidv4();

    // Try to find existing
    const existing = await query('get',
        'SELECT * FROM tenants WHERE name = ?', [name]);

    if (existing) return existing;

    // Create new
    await query('run',
        'INSERT INTO tenants (tenant_id, name) VALUES (?, ?)',
        [id, name]);

    return { tenant_id: id, name, created_at: new Date().toISOString() };
}

/**
 * Get tenant by ID
 */
export async function getTenant(tenantId) {
    return await query('get',
        'SELECT * FROM tenants WHERE tenant_id = ?', [tenantId]);
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Create a user with principal
 */
export async function createUser(data) {
    const userId = data.user_id || uuidv4();
    const principalId = data.principal_id || uuidv4();
    const tenantId = data.tenant_id || 'default';

    // Ensure tenant exists
    await getOrCreateTenant(tenantId, tenantId);

    // Create principal
    await query('run', `
        INSERT INTO principals (principal_id, tenant_id, type, name)
        VALUES (?, ?, 'user', ?)
    `, [principalId, tenantId, data.username || data.phone]);

    // Create user
    await query('run', `
        INSERT INTO users (user_id, principal_id, tenant_id, phone, email, username, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, principalId, tenantId, data.phone, data.email, data.username, data.password_hash]);

    return { user_id: userId, principal_id: principalId };
}

/**
 * Find user by phone
 */
export async function findUserByPhone(phone) {
    return await query('get', `
        SELECT u.*, p.type as principal_type 
        FROM users u 
        JOIN principals p ON u.principal_id = p.principal_id
        WHERE u.phone = ?
    `, [phone]);
}

/**
 * Find user by email
 */
export async function findUserByEmail(email) {
    return await query('get', `
        SELECT u.*, p.type as principal_type 
        FROM users u 
        JOIN principals p ON u.principal_id = p.principal_id
        WHERE u.email = ?
    `, [email]);
}

/**
 * Find user by username
 */
export async function findUserByUsername(username) {
    return await query('get', `
        SELECT u.*, p.type as principal_type 
        FROM users u 
        JOIN principals p ON u.principal_id = p.principal_id
        WHERE u.username = ?
    `, [username]);
}

/**
 * Find user by ID
 */
export async function findUserById(userId) {
    return await query('get', `
        SELECT u.*, p.type as principal_type 
        FROM users u 
        JOIN principals p ON u.principal_id = p.principal_id
        WHERE u.user_id = ?
    `, [userId]);
}

/**
 * Find user by principal ID
 */
export async function findUserByPrincipalId(principalId) {
    return await query('get', `
        SELECT u.*, p.type as principal_type 
        FROM users u 
        JOIN principals p ON u.principal_id = p.principal_id
        WHERE u.principal_id = ?
    `, [principalId]);
}

/**
 * Update user
 */
export async function updateUser(userId, updates) {
    const fields = [];
    const values = [];

    if (updates.password_hash !== undefined) {
        fields.push('password_hash = ?');
        values.push(updates.password_hash);
    }
    if (updates.email !== undefined) {
        fields.push('email = ?');
        values.push(updates.email);
    }
    if (updates.username !== undefined) {
        fields.push('username = ?');
        values.push(updates.username);
    }
    if (updates.last_login_at !== undefined) {
        fields.push('last_login_at = ?');
        values.push(updates.last_login_at);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);

    await query('run', `
        UPDATE users SET ${fields.join(', ')} WHERE user_id = ?
    `, values);
}

/**
 * Delete user
 */
export async function deleteUser(userId) {
    const user = await findUserById(userId);
    if (user) {
        await query('run', 'DELETE FROM users WHERE user_id = ?', [userId]);
        await query('run', 'DELETE FROM principals WHERE principal_id = ?', [user.principal_id]);
    }
}

// ============================================================================
// OBJECT OPERATIONS
// ============================================================================

/**
 * Create an object
 */
export async function createObject(data) {
    const id = data.object_id || uuidv4();
    const tenantId = data.tenant_id || 'default';

    await query('run', `
        INSERT INTO objects (object_id, tenant_id, type, kind, created_by, parent_id, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        tenantId,
        data.type,
        data.kind || null,
        data.created_by || null,
        data.parent_id || null,
        serializeJson(data.meta || {})
    ]);

    return { object_id: id };
}

/**
 * Get an object by ID
 */
export async function getObject(objectId, includeDeleted = false) {
    const sql = includeDeleted
        ? 'SELECT * FROM objects WHERE object_id = ?'
        : 'SELECT * FROM objects WHERE object_id = ? AND deleted_at IS NULL';

    const obj = await query('get', sql, [objectId]);

    if (obj && obj.meta) {
        obj.meta = deserializeJson(obj.meta);
    }

    return obj;
}

/**
 * Get objects by principal (owner)
 */
export async function getObjectsByPrincipal(principalId, type = null, includeDeleted = false) {
    let sql = 'SELECT * FROM objects WHERE created_by = ?';
    const params = [principalId];

    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }

    if (!includeDeleted) {
        sql += ' AND deleted_at IS NULL';
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query('all', sql, params);
    return rows.map(obj => ({
        ...obj,
        meta: obj.meta ? deserializeJson(obj.meta) : {}
    }));
}

/**
 * Update object (only meta and updated_at)
 */
export async function updateObject(objectId, updates = {}) {
    await query('run', `
        UPDATE objects 
        SET meta = ?, updated_at = ?
        WHERE object_id = ?
    `, [
        serializeJson(updates.meta || {}),
        new Date().toISOString(),
        objectId
    ]);
}

/**
 * Soft delete an object
 */
export async function deleteObject(objectId) {
    await query('run', `
        UPDATE objects SET deleted_at = ? WHERE object_id = ?
    `, [new Date().toISOString(), objectId]);
}

/**
 * Hard delete an object (cascade deletes properties)
 */
export async function hardDeleteObject(objectId) {
    await query('run', 'DELETE FROM objects WHERE object_id = ?', [objectId]);
}

// ============================================================================
// PROPERTY OPERATIONS
// ============================================================================

/**
 * Set a property (with ADOLE deep merge for objects)
 */
export async function setProperty(objectId, key, value, changedBy = null) {
    // Check if property exists
    const existing = await query('get', `
        SELECT * FROM properties WHERE object_id = ? AND key = ?
    `, [objectId, key]);

    let finalValue = value;

    // ADOLE deep merge for objects
    if (existing && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const existingValue = deserializeJson(existing.value);
        if (typeof existingValue === 'object' && existingValue !== null && !Array.isArray(existingValue)) {
            finalValue = deepMerge(existingValue, value);
            console.log(`[ADOLE] Deep merging property '${key}'`);
        }
    }

    const valueJson = serializeJson(finalValue);
    const valueType = Array.isArray(finalValue) ? 'array' : typeof finalValue;
    const now = new Date().toISOString();

    if (existing) {
        const previousValueJson = existing.value;

        // Update property
        await query('run', `
            UPDATE properties 
            SET value = ?, value_type = ?, updated_at = ?
            WHERE property_id = ?
        `, [valueJson, valueType, now, existing.property_id]);

        // Create version record
        const versionId = uuidv4();
        await query('run', `
            INSERT INTO property_versions 
            (version_id, property_id, object_id, key, value, previous_value, changed_by, change_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'update')
        `, [versionId, existing.property_id, objectId, key, valueJson, previousValueJson, changedBy]);

        return { property_id: existing.property_id };
    } else {
        // Create new property
        const propertyId = uuidv4();

        await query('run', `
            INSERT INTO properties (property_id, object_id, key, value, value_type)
            VALUES (?, ?, ?, ?, ?)
        `, [propertyId, objectId, key, valueJson, valueType]);

        // Create version record
        const versionId = uuidv4();
        await query('run', `
            INSERT INTO property_versions 
            (version_id, property_id, object_id, key, value, previous_value, changed_by, change_type)
            VALUES (?, ?, ?, ?, ?, NULL, ?, 'create')
        `, [versionId, propertyId, objectId, key, valueJson, changedBy]);

        return { property_id: propertyId };
    }
}

/**
 * Get a property value
 */
export async function getProperty(objectId, key) {
    const prop = await query('get', `
        SELECT * FROM properties WHERE object_id = ? AND key = ?
    `, [objectId, key]);

    if (!prop) return undefined;
    return deserializeJson(prop.value);
}

/**
 * Get all properties for an object
 */
export async function getAllProperties(objectId) {
    const props = await query('all', `
        SELECT * FROM properties WHERE object_id = ?
    `, [objectId]);

    const result = {};
    for (const prop of props) {
        result[prop.key] = deserializeJson(prop.value);
    }
    return result;
}

/**
 * Delete a property
 */
export async function deleteProperty(objectId, key, changedBy = null) {
    const existing = await query('get', `
        SELECT * FROM properties WHERE object_id = ? AND key = ?
    `, [objectId, key]);

    if (existing) {
        // Create version record
        const versionId = uuidv4();
        await query('run', `
            INSERT INTO property_versions 
            (version_id, property_id, object_id, key, value, previous_value, changed_by, change_type)
            VALUES (?, ?, ?, ?, NULL, ?, ?, 'delete')
        `, [versionId, existing.property_id, objectId, key, existing.value, changedBy]);

        await query('run', 'DELETE FROM properties WHERE property_id = ?', [existing.property_id]);
    }
}

/**
 * Set multiple properties
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
 */
export async function getPropertyHistory(objectId, key, limit = 100) {
    return await query('all', `
        SELECT * FROM property_versions 
        WHERE object_id = ? AND key = ?
        ORDER BY changed_at DESC
        LIMIT ?
    `, [objectId, key, limit]);
}

/**
 * Get property value at a specific time
 */
export async function getPropertyAtTime(objectId, key, timestamp) {
    const version = await query('get', `
        SELECT * FROM property_versions 
        WHERE object_id = ? AND key = ? AND changed_at <= ?
        ORDER BY changed_at DESC
        LIMIT 1
    `, [objectId, key, timestamp]);

    if (!version) return undefined;
    return deserializeJson(version.value);
}

/**
 * Get all history for an object (all properties)
 */
export async function getObjectHistory(objectId, limit = 100) {
    return await query('all', `
        SELECT * FROM property_versions 
        WHERE object_id = ?
        ORDER BY changed_at DESC
        LIMIT ?
    `, [objectId, limit]);
}

// ============================================================================
// ACL OPERATIONS
// ============================================================================

/**
 * Grant permission
 */
export async function grantPermission(data) {
    const id = uuidv4();

    await query('run', `
        INSERT OR REPLACE INTO acls 
        (acl_id, tenant_id, object_id, principal_id, property_path, action, allow, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        data.tenant_id,
        data.object_id,
        data.principal_id,
        data.property_path || null,
        data.action,
        data.allow !== false ? 1 : 0,
        data.created_by || null
    ]);

    return { acl_id: id };
}

/**
 * Check if principal has permission
 */
export async function hasPermission(principalId, objectId, action, propertyPath = null) {
    // Check object-level permission
    const objectPerm = await query('get', `
        SELECT * FROM acls 
        WHERE object_id = ? AND principal_id = ? AND action = ? AND allow = 1 AND property_path IS NULL
    `, [objectId, principalId, action]);

    if (objectPerm) return true;

    // Check property-level permission
    if (propertyPath) {
        const propPerm = await query('get', `
            SELECT * FROM acls 
            WHERE object_id = ? AND principal_id = ? AND action = ? AND allow = 1 AND property_path = ?
        `, [objectId, principalId, action, propertyPath]);

        if (propPerm) return true;
    }

    // Check if user is creator (implicit admin)
    const obj = await getObject(objectId);
    if (obj && obj.created_by === principalId) return true;

    return false;
}

/**
 * Revoke permission
 */
export async function revokePermission(aclId) {
    await query('run', 'DELETE FROM acls WHERE acl_id = ?', [aclId]);
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Add to sync queue
 */
export async function addToSyncQueue(data) {
    const result = await query('run', `
        INSERT INTO sync_queue (tenant_id, object_id, action, device_id, payload, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    `, [
        data.tenant_id,
        data.object_id,
        data.action,
        data.device_id || null,
        serializeJson(data.payload || {})
    ]);

    return { id: result.lastInsertRowid };
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(deviceId = null) {
    let sql = "SELECT * FROM sync_queue WHERE status = 'pending'";
    const params = [];

    if (deviceId) {
        sql += ' AND device_id = ?';
        params.push(deviceId);
    }

    sql += ' ORDER BY created_at ASC';

    return await query('all', sql, params);
}

/**
 * Complete sync item
 */
export async function completeSyncItem(id) {
    const now = new Date().toISOString();
    await query('run', `
        UPDATE sync_queue 
        SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE id = ?
    `, [now, now, id]);
}

/**
 * Fail sync item
 */
export async function failSyncItem(id, error) {
    const now = new Date().toISOString();
    await query('run', `
        UPDATE sync_queue 
        SET status = 'failed', payload = ?, updated_at = ?
        WHERE id = ?
    `, [serializeJson({ error }), now, id]);
}

// ============================================================================
// ATOME HIGH-LEVEL OPERATIONS
// ============================================================================

/**
 * Create a complete atome with properties
 */
export async function createAtome(data) {
    const { object_id } = await createObject({
        object_id: data.object_id,
        tenant_id: data.tenant_id || 'default',
        type: 'atome',
        kind: data.kind || data.atome_type,
        created_by: data.created_by,
        parent_id: data.parent_id
    });

    // Also insert into atomes table for convenience
    const atomeId = data.atome_id || object_id;
    await query('run', `
        INSERT INTO atomes (atome_id, object_id, tenant_id, owner_id, atome_type, name)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        atomeId,
        object_id,
        data.tenant_id || 'default',
        data.created_by,
        data.kind || data.atome_type || 'default',
        data.name || null
    ]);

    if (data.properties) {
        await setProperties(object_id, data.properties, data.created_by);
    }

    return {
        atome_id: atomeId,
        object_id,
        properties: data.properties || {}
    };
}

/**
 * Get a complete atome with all properties
 */
export async function getAtome(objectId) {
    const obj = await getObject(objectId);
    if (!obj || obj.type !== 'atome') return null;

    const properties = await getAllProperties(objectId);
    const atomeRecord = await query('get',
        'SELECT * FROM atomes WHERE object_id = ?', [objectId]);

    return {
        ...obj,
        ...(atomeRecord || {}),
        properties
    };
}

/**
 * Get all atomes for a user
 */
export async function getAtomesByUser(principalId, includeDeleted = false) {
    const objects = await getObjectsByPrincipal(principalId, 'atome', includeDeleted);

    const atomes = [];
    for (const obj of objects) {
        const properties = await getAllProperties(obj.object_id);
        atomes.push({ ...obj, properties });
    }

    return atomes;
}

/**
 * Update atome properties
 */
export async function updateAtome(objectId, properties, changedBy = null) {
    await updateObject(objectId, {});
    await setProperties(objectId, properties, changedBy);

    // Update atomes table
    const now = new Date().toISOString();
    if (properties.name !== undefined) {
        await query('run', `
            UPDATE atomes SET name = ?, updated_at = ? WHERE object_id = ?
        `, [properties.name, now, objectId]);
    } else {
        await query('run', `
            UPDATE atomes SET updated_at = ? WHERE object_id = ?
        `, [now, objectId]);
    }
}

/**
 * Delete an atome (soft delete)
 */
export async function deleteAtome(objectId) {
    await deleteObject(objectId);
    const now = new Date().toISOString();
    await query('run', `
        UPDATE atomes SET deleted_at = ? WHERE object_id = ?
    `, [now, objectId]);
}

// ============================================================================
// COMPATIBILITY LAYER (for auth.js)
// ============================================================================

/**
 * DataSource adapter for backwards compatibility with TypeORM-style code
 */
export function getDataSourceAdapter() {
    if (!db) {
        throw new Error('[ADOLE] Database not initialized. Call initDatabase() first.');
    }

    return {
        isInitialized: true,

        /**
         * Execute raw SQL query
         */
        async query(sql, params = []) {
            // Convert $1, $2 PostgreSQL params to ? SQLite params
            let convertedSql = sql;
            if (params && params.length > 0) {
                for (let i = params.length; i >= 1; i--) {
                    convertedSql = convertedSql.replace(new RegExp(`\\$${i}`, 'g'), '?');
                }
            }

            return await query('all', convertedSql, params);
        },

        manager: {
            async transaction(callback) {
                if (db.type === 'sqlite') {
                    db.beginTransaction();
                    try {
                        const result = await callback({ query: this.query });
                        db.commit();
                        return result;
                    } catch (error) {
                        db.rollback();
                        throw error;
                    }
                } else {
                    return await db.transaction(callback);
                }
            }
        }
    };
}

/**
 * Get database info
 */
export function getDatabaseInfo() {
    return {
        type: db?.type || null,
        isSqlite: isSqlite(),
        isLibsql: isLibsql(),
        initialized: db !== null
    };
}

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================================

// Alias functions for backwards compatibility with old orm.js
export const initDatabase_legacy = initDatabase;
export const getDatabase = getDb;
export const isPostgres = () => false; // No longer supported
export const isSQLite = isSqlite;

// Principal aliases
export const createPrincipal = createUser;
export const findPrincipalByPhone = findUserByPhone;
export const findPrincipalByEmail = findUserByEmail;
export const findPrincipalById = findUserByPrincipalId;
export const deletePrincipal = deleteUser;

// Default export
export default {
    // Core
    initDatabase,
    getDb,
    getDatabase,
    closeDatabase,
    getDatabaseInfo,
    isSqlite,
    isLibsql,

    // Tenant
    getOrCreateTenant,
    getTenant,

    // User
    createUser,
    findUserByPhone,
    findUserByEmail,
    findUserByUsername,
    findUserById,
    findUserByPrincipalId,
    updateUser,
    deleteUser,

    // Object
    createObject,
    getObject,
    getObjectsByPrincipal,
    updateObject,
    deleteObject,
    hardDeleteObject,

    // Property
    setProperty,
    getProperty,
    getAllProperties,
    deleteProperty,
    setProperties,

    // Property Versions
    getPropertyHistory,
    getPropertyAtTime,
    getObjectHistory,

    // ACL
    grantPermission,
    hasPermission,
    revokePermission,

    // Sync
    addToSyncQueue,
    getPendingSyncItems,
    completeSyncItem,
    failSyncItem,

    // Atome
    createAtome,
    getAtome,
    getAtomesByUser,
    updateAtome,
    deleteAtome,

    // Compatibility
    getDataSourceAdapter,

    // Legacy aliases
    createPrincipal,
    findPrincipalByPhone,
    findPrincipalByEmail,
    findPrincipalById,
    deletePrincipal,
    isPostgres,
    isSQLite
};
