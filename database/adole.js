/**
 * ADOLE Data Layer v2.0 - Pure SQL implementation
 * 
 * Implements the ADOLE (Append-only Distributed Object Ledger Engine) data model.
 * 
 * Tables:
 * - objects: Identity, category, ownership (no properties)
 * - properties: Current live state of each property
 * - property_versions: Full history for undo/redo, time-travel, sync
 * - permissions: Fine-grained ACL per property
 * - snapshots: Full state backups
 * 
 * No ORM. Pure SQL. Fast. Predictable.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    connect,
    getDatabase as getDriverDb,
    closeDatabase as closeDriver
} from './driver.js';

let db = null;
let isAsync = false;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

export async function initDatabase(config = {}) {
    if (db) return db;

    console.log('[ADOLE] Initializing database v2.0...');
    db = await connect(config);
    isAsync = db.type === 'libsql';

    // Run schema
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, 'schema.sql');

    try {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await query('exec', schema);
        console.log('[ADOLE] Schema applied successfully');
    } catch (e) {
        console.log('[ADOLE] Schema already exists or error:', e.message);
    }

    return db;
}

async function query(method, sql, params = []) {
    if (!db) await initDatabase();
    if (isAsync) {
        return await db[method](sql, params);
    }
    return db[method](sql, params);
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

// ============================================================================
// OBJECT OPERATIONS
// ============================================================================

/**
 * Create a new object (atome)
 * @param {Object} data - { id?, type, kind?, parent?, owner, creator? }
 * @returns {Object} Created object
 */
export async function createObject({ id, type, kind, parent, owner, creator }) {
    const objectId = id || uuidv4();
    const now = new Date().toISOString();

    await query('run', `
        INSERT INTO objects (id, type, kind, parent, owner, creator, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [objectId, type, kind || null, parent || null, owner, creator || owner, now, now]);

    return {
        id: objectId,
        type,
        kind,
        parent,
        owner,
        creator: creator || owner,
        created_at: now,
        updated_at: now
    };
}

/**
 * Get object by ID (metadata only, no properties)
 */
export async function getObjectById(id) {
    const row = await query('get', 'SELECT * FROM objects WHERE id = ?', [id]);
    return row || null;
}

/**
 * Get object with all its properties
 */
export async function getObject(id) {
    const obj = await getObjectById(id);
    if (!obj) return null;

    const props = await query('all', 'SELECT name, value FROM properties WHERE object_id = ?', [id]);

    // Build properties object
    const properties = {};
    for (const prop of props) {
        try {
            properties[prop.name] = JSON.parse(prop.value);
        } catch {
            properties[prop.name] = prop.value;
        }
    }

    return { ...obj, properties };
}

/**
 * Get all objects owned by a user
 */
export async function getObjectsByOwner(ownerId, options = {}) {
    const { type, parent, limit = 100, offset = 0 } = options;

    let sql = 'SELECT * FROM objects WHERE owner = ?';
    const params = [ownerId];

    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }
    if (parent !== undefined) {
        if (parent === null) {
            sql += ' AND parent IS NULL';
        } else {
            sql += ' AND parent = ?';
            params.push(parent);
        }
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await query('all', sql, params);
}

/**
 * Get children of an object
 */
export async function getObjectChildren(parentId) {
    return await query('all', 'SELECT * FROM objects WHERE parent = ?', [parentId]);
}

/**
 * Update object metadata (type, kind, parent, owner)
 */
export async function updateObject(id, updates) {
    const fields = [];
    const values = [];

    if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
    if (updates.kind !== undefined) { fields.push('kind = ?'); values.push(updates.kind); }
    if (updates.parent !== undefined) { fields.push('parent = ?'); values.push(updates.parent); }
    if (updates.owner !== undefined) { fields.push('owner = ?'); values.push(updates.owner); }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await query('run', `UPDATE objects SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Delete object and all its properties
 */
export async function deleteObject(id) {
    await query('run', 'DELETE FROM objects WHERE id = ?', [id]);
}

// ============================================================================
// PROPERTY OPERATIONS
// ============================================================================

/**
 * Set a property on an object (creates or updates)
 * Also records the change in property_versions for history
 */
export async function setProperty(objectId, name, value, author = null) {
    const now = new Date().toISOString();
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Check if property exists
    const existing = await query('get',
        'SELECT id, version FROM properties WHERE object_id = ? AND name = ?',
        [objectId, name]
    );

    let propertyId;
    let version;

    if (existing) {
        // Update existing property
        version = existing.version + 1;
        await query('run', `
            UPDATE properties SET value = ?, version = ?, updated_at = ?
            WHERE object_id = ? AND name = ?
        `, [valueStr, version, now, objectId, name]);
        propertyId = existing.id;
    } else {
        // Create new property
        version = 1;
        const result = await query('run', `
            INSERT INTO properties (object_id, name, value, version, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `, [objectId, name, valueStr, version, now]);
        propertyId = result.lastInsertRowid;
    }

    // Record in property_versions for history
    await query('run', `
        INSERT INTO property_versions (property_id, object_id, name, version, value, author, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [propertyId, objectId, name, version, valueStr, author, now]);

    // Update object's updated_at
    await query('run', 'UPDATE objects SET updated_at = ? WHERE id = ?', [now, objectId]);

    return { propertyId, version };
}

/**
 * Set multiple properties at once
 */
export async function setProperties(objectId, properties, author = null) {
    for (const [name, value] of Object.entries(properties)) {
        await setProperty(objectId, name, value, author);
    }
}

/**
 * Get a single property value
 */
export async function getProperty(objectId, name) {
    const row = await query('get',
        'SELECT value FROM properties WHERE object_id = ? AND name = ?',
        [objectId, name]
    );
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
}

/**
 * Get all properties of an object
 */
export async function getProperties(objectId) {
    const rows = await query('all', 'SELECT name, value FROM properties WHERE object_id = ?', [objectId]);
    const result = {};
    for (const row of rows) {
        try {
            result[row.name] = JSON.parse(row.value);
        } catch {
            result[row.name] = row.value;
        }
    }
    return result;
}

/**
 * Delete a property
 */
export async function deleteProperty(objectId, name) {
    await query('run', 'DELETE FROM properties WHERE object_id = ? AND name = ?', [objectId, name]);
}

// ============================================================================
// PROPERTY VERSIONS (History / Time-Travel)
// ============================================================================

/**
 * Get version history of a property
 */
export async function getPropertyHistory(objectId, name, limit = 50) {
    return await query('all', `
        SELECT * FROM property_versions 
        WHERE object_id = ? AND name = ?
        ORDER BY version DESC
        LIMIT ?
    `, [objectId, name, limit]);
}

/**
 * Restore a property to a specific version
 */
export async function restorePropertyVersion(objectId, name, version, author = null) {
    const versionRow = await query('get', `
        SELECT value FROM property_versions
        WHERE object_id = ? AND name = ? AND version = ?
    `, [objectId, name, version]);

    if (!versionRow) throw new Error(`Version ${version} not found for property ${name}`);

    await setProperty(objectId, name, versionRow.value, author);
}

/**
 * Get all changes since a specific version (for sync)
 */
export async function getChangesSince(sinceVersionId = 0) {
    return await query('all', `
        SELECT pv.*, o.type, o.kind, o.parent, o.owner
        FROM property_versions pv
        JOIN objects o ON pv.object_id = o.id
        WHERE pv.id > ?
        ORDER BY pv.id ASC
    `, [sinceVersionId]);
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * Create a snapshot of an object's current state
 */
export async function createSnapshot(objectId) {
    const obj = await getObject(objectId);
    if (!obj) throw new Error('Object not found');

    const snapshotData = JSON.stringify(obj);
    const result = await query('run', `
        INSERT INTO snapshots (object_id, snapshot, created_at)
        VALUES (?, ?, ?)
    `, [objectId, snapshotData, new Date().toISOString()]);

    return result.lastInsertRowid;
}

/**
 * Get snapshots for an object
 */
export async function getSnapshots(objectId, limit = 10) {
    return await query('all', `
        SELECT * FROM snapshots WHERE object_id = ? ORDER BY created_at DESC LIMIT ?
    `, [objectId, limit]);
}

/**
 * Restore an object from a snapshot
 */
export async function restoreSnapshot(snapshotId, author = null) {
    const snap = await query('get', 'SELECT * FROM snapshots WHERE id = ?', [snapshotId]);
    if (!snap) throw new Error('Snapshot not found');

    const data = JSON.parse(snap.snapshot);

    // Clear current properties
    await query('run', 'DELETE FROM properties WHERE object_id = ?', [snap.object_id]);

    // Restore all properties
    if (data.properties) {
        await setProperties(snap.object_id, data.properties, author);
    }

    return data;
}

// ============================================================================
// PERMISSIONS
// ============================================================================

/**
 * Set permission for a user on an object
 */
export async function setPermission(objectId, userId, canRead = true, canWrite = false, propertyName = null) {
    // Check if exists
    const existing = await query('get', `
        SELECT id FROM permissions 
        WHERE object_id = ? AND user_id = ? AND (property_name = ? OR (property_name IS NULL AND ? IS NULL))
    `, [objectId, userId, propertyName, propertyName]);

    if (existing) {
        await query('run', `
            UPDATE permissions SET can_read = ?, can_write = ?
            WHERE id = ?
        `, [canRead ? 1 : 0, canWrite ? 1 : 0, existing.id]);
    } else {
        await query('run', `
            INSERT INTO permissions (object_id, property_name, user_id, can_read, can_write)
            VALUES (?, ?, ?, ?, ?)
        `, [objectId, propertyName, userId, canRead ? 1 : 0, canWrite ? 1 : 0]);
    }
}

/**
 * Check if user can read an object/property
 */
export async function canRead(objectId, userId, propertyName = null) {
    // Owner always has access
    const obj = await getObjectById(objectId);
    if (obj && obj.owner === userId) return true;

    // Check specific permission
    const perm = await query('get', `
        SELECT can_read FROM permissions
        WHERE object_id = ? AND user_id = ? AND (property_name = ? OR property_name IS NULL)
        ORDER BY property_name DESC LIMIT 1
    `, [objectId, userId, propertyName]);

    return perm ? perm.can_read === 1 : false;
}

/**
 * Check if user can write an object/property
 */
export async function canWrite(objectId, userId, propertyName = null) {
    // Owner always has access
    const obj = await getObjectById(objectId);
    if (obj && obj.owner === userId) return true;

    // Check specific permission
    const perm = await query('get', `
        SELECT can_write FROM permissions
        WHERE object_id = ? AND user_id = ? AND (property_name = ? OR property_name IS NULL)
        ORDER BY property_name DESC LIMIT 1
    `, [objectId, userId, propertyName]);

    return perm ? perm.can_write === 1 : false;
}

// ============================================================================
// SYNC STATE
// ============================================================================

/**
 * Get last sync state for a server
 */
export async function getSyncState(serverId) {
    return await query('get', 'SELECT * FROM sync_state WHERE server_id = ?', [serverId]);
}

/**
 * Update sync state after successful sync
 */
export async function updateSyncState(serverId, lastVersionId) {
    const now = new Date().toISOString();
    await query('run', `
        INSERT INTO sync_state (server_id, last_sync_version, last_sync_at)
        VALUES (?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET last_sync_version = ?, last_sync_at = ?
    `, [serverId, lastVersionId, now, lastVersionId, now]);
}

// ============================================================================
// HIGH-LEVEL API (Convenience wrappers)
// ============================================================================

/**
 * Create a complete atome with properties
 */
export async function createAtome({ id, type, kind, parent, owner, properties = {}, author }) {
    const obj = await createObject({ id, type, kind, parent, owner, creator: author || owner });

    if (Object.keys(properties).length > 0) {
        await setProperties(obj.id, properties, author || owner);
    }

    return { ...obj, properties };
}

/**
 * Get atome with full properties (alias for getObject)
 */
export async function getAtome(id) {
    return await getObject(id);
}

/**
 * Update atome properties
 */
export async function updateAtome(id, properties, author = null) {
    await setProperties(id, properties, author);
    return await getObject(id);
}

/**
 * List atomes for a user
 */
export async function listAtomes(ownerId, options = {}) {
    const objects = await getObjectsByOwner(ownerId, options);

    // Load properties for each object
    const result = [];
    for (const obj of objects) {
        const props = await getProperties(obj.id);
        result.push({ ...obj, properties: props });
    }

    return result;
}

// ============================================================================
// DATASOURCE ADAPTER (for auth.js compatibility)
// ============================================================================

/**
 * DataSource adapter for backwards compatibility with auth.js
 * Provides a dataSource.query() interface for raw SQL
 */
export function getDataSourceAdapter() {
    if (!db) {
        throw new Error('[ADOLE] Database not initialized. Call initDatabase() first.');
    }

    /**
     * Execute raw SQL query
     */
    const executeQuery = async (sql, params = []) => {
        // Determine if this is a write operation
        const trimmedSql = sql.trim().toUpperCase();
        const isWriteOp = trimmedSql.startsWith('INSERT') ||
            trimmedSql.startsWith('UPDATE') ||
            trimmedSql.startsWith('DELETE');

        if (isWriteOp) {
            await query('run', sql, params);
            return [];
        }

        return await query('all', sql, params);
    };

    return {
        isInitialized: true,
        query: executeQuery,
        manager: {
            async transaction(callback) {
                const txContext = { query: executeQuery };
                try {
                    return await callback(txContext);
                } catch (error) {
                    console.error('[ADOLE] Transaction error:', error);
                    throw error;
                }
            }
        }
    };
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
    // Init
    initDatabase,
    getDatabase,
    closeDatabase,

    // Objects
    createObject,
    getObjectById,
    getObject,
    getObjectsByOwner,
    getObjectChildren,
    updateObject,
    deleteObject,

    // Properties
    setProperty,
    setProperties,
    getProperty,
    getProperties,
    deleteProperty,

    // Versions
    getPropertyHistory,
    restorePropertyVersion,
    getChangesSince,

    // Snapshots
    createSnapshot,
    getSnapshots,
    restoreSnapshot,

    // Permissions
    setPermission,
    canRead,
    canWrite,

    // Sync
    getSyncState,
    updateSyncState,

    // High-level
    createAtome,
    getAtome,
    updateAtome,
    listAtomes,

    // Compatibility
    getDataSourceAdapter
};
