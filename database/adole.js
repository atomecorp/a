/**
 * ADOLE Data Layer v3.0 UNIFIED - Pure SQL implementation
 * 
 * Implements the ADOLE (Append-only Distributed Object Ledger Engine) data model.
 * UNIFIED SCHEMA - Same structure as Tauri (local_atome.rs)
 * 
 * Tables:
 * - atomes: Identity, category, ownership (atome_id, atome_type, parent_id, owner_id, etc.)
 * - particles: Current live state of each property (key-value pairs)
 * - particles_versions: Full history for undo/redo, time-travel, sync
 * - permissions: Fine-grained ACL per particle
 * - snapshots: Full state backups
 * - sync_queue: Pending sync operations
 * - sync_state: Sync metadata per server
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

    try {
        await ensurePermissionsColumns();
    } catch (e) {
        console.log('[ADOLE v3.0] Permissions migration skipped:', e.message);
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

async function ensurePermissionsColumns() {
    const columns = await query('all', "PRAGMA table_info(permissions)");
    const names = new Set((columns || []).map((col) => col.name));

    if (!names.has('can_create')) {
        await query('run', "ALTER TABLE permissions ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0");
    }
    if (!names.has('share_mode')) {
        await query('run', "ALTER TABLE permissions ADD COLUMN share_mode TEXT DEFAULT 'real-time'");
    }
    if (!names.has('conditions')) {
        await query('run', "ALTER TABLE permissions ADD COLUMN conditions TEXT");
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

// ============================================================================
// ATOME OPERATIONS (ADOLE v3.0)
// ============================================================================

/**
 * Create a new atome
 * @param {Object} data - { id?, type, parent?, owner, creator? }
 * @returns {Object} Created atome
 */
export async function createAtome({ id, type, kind, parent, owner, creator, properties = {} }) {
    const atomeId = id || uuidv4();
    const now = new Date().toISOString();
    const ownerId = owner;
    const creatorId = creator || owner;

    console.log('[createAtome Debug] Creating with id:', atomeId, 'type:', type, 'owner:', ownerId, 'parent:', parent);

    const parentId = parent || null;
    const selfOwner = ownerId && ownerId === atomeId;
    const selfParent = parentId && parentId === atomeId;

    // FK-safe strategy:
    // - If owner/parent reference is missing (or self-reference), insert with NULL for that FK.
    // - Store deferred references in particles to be resolved once targets exist.
    // - Then resolve self-references immediately via UPDATE (now FK target exists).

    let insertOwnerId = ownerId || null;
    let insertParentId = parentId;

    let pendingOwnerId = null;
    let pendingParentId = null;

    if (selfOwner) insertOwnerId = null;
    if (selfParent) insertParentId = null;

    if (insertOwnerId) {
        const ownerExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [insertOwnerId]);
        if (!ownerExists) {
            insertOwnerId = null;
            pendingOwnerId = ownerId;
        }
    }

    if (insertParentId) {
        const parentExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [insertParentId]);
        if (!parentExists) {
            insertParentId = null;
            pendingParentId = parentId;
        }
    }

    await query('run', `
        INSERT OR REPLACE INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id,
                           sync_status, created_source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'local', 'fastify',
                COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?), ?), ?)
    `, [atomeId, type, insertParentId, insertOwnerId, creatorId, atomeId, now, now]);

    // Store deferred FK references AFTER the atome row exists (particles.atome_id FK)
    if (pendingOwnerId) {
        await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, creatorId);
    }
    if (pendingParentId) {
        await setParticle(atomeId, '_pending_parent_id', pendingParentId, creatorId);
    }

    // Resolve self-references now that the row exists
    if (selfOwner) {
        await query('run', 'UPDATE atomes SET owner_id = ?, updated_at = ? WHERE atome_id = ?', [atomeId, now, atomeId]);
    }
    if (selfParent) {
        await query('run', 'UPDATE atomes SET parent_id = ?, updated_at = ? WHERE atome_id = ?', [atomeId, now, atomeId]);
    }

    // Store kind as a particle if provided
    if (kind) {
        await setParticle(atomeId, 'kind', kind, creatorId);
    }

    // Store all properties as particles
    if (properties && Object.keys(properties).length > 0) {
        await setParticles(atomeId, properties, creatorId);
    }

    return {
        atome_id: atomeId,
        atome_type: type,
        kind,
        parent_id: parent || null,
        owner_id: ownerId,
        creator_id: creatorId,
        data: properties,
        sync_status: 'local',
        created_source: 'fastify',
        created_at: now,
        updated_at: now
    };
}

/**
 * Resolve pending owner_id references after sync
 * This fixes atomes that were created with NULL owner_id due to FK constraints
 */
export async function resolvePendingOwners() {
    const now = new Date().toISOString();

    // Find all atomes with deferred FK references
    const pending = await query('all', `
        SELECT p.atome_id, p.particle_key, p.particle_value
        FROM particles p
        WHERE p.particle_key IN ('_pending_owner_id', '_pending_parent_id')
    `);

    let resolved = 0;
    let failed = 0;

    for (const row of pending) {
        try {
            const pendingId = JSON.parse(row.particle_value);
            if (!pendingId || pendingId === 'anonymous') {
                await query('run', 'DELETE FROM particles WHERE atome_id = ? AND particle_key = ?', [row.atome_id, row.particle_key]);
                resolved++;
                continue;
            }
            const exists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [pendingId]);

            if (exists) {
                if (row.particle_key === '_pending_owner_id') {
                    await query('run', 'UPDATE atomes SET owner_id = ?, updated_at = ? WHERE atome_id = ?', [pendingId, now, row.atome_id]);
                } else if (row.particle_key === '_pending_parent_id') {
                    await query('run', 'UPDATE atomes SET parent_id = ?, updated_at = ? WHERE atome_id = ?', [pendingId, now, row.atome_id]);
                }

                await query('run', 'DELETE FROM particles WHERE atome_id = ? AND particle_key = ?', [row.atome_id, row.particle_key]);
                console.log('[resolvePendingOwners] Resolved', row.particle_key, 'for:', row.atome_id);
                resolved++;
            } else {
                console.log('[resolvePendingOwners] Reference still missing for:', row.atome_id, row.particle_key, '->', pendingId);
                failed++;
            }
        } catch (e) {
            console.error('[resolvePendingOwners] Error:', e.message);
            failed++;
        }
    }

    return { resolved, failed, total: pending.length };
}

/**
 * Get atome by ID (metadata only, no particles)
 */
export async function getAtomeById(id) {
    const row = await query('get', `
        SELECT atome_id, atome_type, parent_id, owner_id, creator_id,
               sync_status,  last_sync, created_source,
               created_at, updated_at, deleted_at
        FROM atomes WHERE atome_id = ? AND deleted_at IS NULL
    `, [id]);
    return row || null;
}

async function getPendingOwnerId(atomeId) {
    try {
        const row = await query('get', `
            SELECT particle_value
            FROM particles
            WHERE atome_id = ? AND particle_key = '_pending_owner_id'
            LIMIT 1
        `, [atomeId]);
        if (!row?.particle_value) return null;
        return JSON.parse(row.particle_value);
    } catch (_) {
        return null;
    }
}

async function getEffectiveOwnerId(atomeId) {
    const atome = await getAtomeById(atomeId);
    if (!atome) return null;
    if (atome.owner_id) return atome.owner_id;
    return await getPendingOwnerId(atomeId);
}

/**
 * Get atome with all its particles (full data)
 */
export async function getAtome(id) {
    const atome = await getAtomeById(id);
    if (!atome) return null;

    const particles = await query('all',
        'SELECT particle_key, particle_value, value_type FROM particles WHERE atome_id = ?',
        [id]
    );

    // Build data object from particles
    const data = {};
    let kind = null;
    for (const p of particles) {
        try {
            const parsed = JSON.parse(p.particle_value);
            if (p.particle_key === 'kind') {
                kind = parsed;
            } else {
                data[p.particle_key] = parsed;
            }
        } catch {
            if (p.particle_key === 'kind') {
                kind = p.particle_value;
            } else {
                data[p.particle_key] = p.particle_value;
            }
        }
    }

    return {
        atome_id: atome.atome_id,
        atome_type: atome.atome_type,
        kind,
        parent_id: atome.parent_id,
        owner_id: atome.owner_id,
        creator_id: atome.creator_id,
        data,
        sync_status: atome.sync_status,
        last_sync: atome.last_sync,
        created_source: atome.created_source,
        created_at: atome.created_at,
        updated_at: atome.updated_at,
        // Legacy compatibility
        id: atome.atome_id,
        type: atome.atome_type,
        parent: atome.parent_id,
        owner: atome.owner_id,
        properties: data
    };
}

/**
 * Get all atomes owned by a user
 */
export async function getAtomesByOwner(ownerId, options = {}) {
    const { type, parent, limit = 100, offset = 0 } = options;

    let sql = 'SELECT * FROM atomes WHERE owner_id = ? AND deleted_at IS NULL';
    const params = [ownerId];

    if (type) {
        sql += ' AND atome_type = ?';
        params.push(type);
    }
    if (parent !== undefined) {
        if (parent === null) {
            sql += ' AND parent_id IS NULL';
        } else {
            sql += ' AND parent_id = ?';
            params.push(parent);
        }
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await query('all', sql, params);
}

/**
 * Get atomes accessible to a user (owned OR shared via permissions.can_read)
 */
export async function getAtomesAccessibleToUser(userId, options = {}) {
    const { type, parent, limit = 100, offset = 0 } = options;
    const pendingOwner = JSON.stringify(userId);

    let sql = `
        SELECT DISTINCT a.*
        FROM atomes a
        LEFT JOIN permissions p
          ON p.atome_id = a.atome_id
         AND p.principal_id = ?
         AND p.can_read = 1
         AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))
        WHERE a.deleted_at IS NULL
          AND (a.owner_id = ? OR p.permission_id IS NOT NULL
               OR EXISTS (
                   SELECT 1 FROM particles p2
                   WHERE p2.atome_id = a.atome_id
                     AND p2.particle_key = '_pending_owner_id'
                     AND p2.particle_value = ?
               ))
    `;

    const params = [userId, userId, pendingOwner];

    if (type) {
        sql += ' AND a.atome_type = ?';
        params.push(type);
    }

    if (parent !== undefined) {
        if (parent === null) {
            sql += ' AND a.parent_id IS NULL';
        } else {
            sql += ' AND a.parent_id = ?';
            params.push(parent);
        }
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await query('all', sql, params);
}

/**
 * Get children of an atome
 */
export async function getAtomeChildren(parentId) {
    return await query('all',
        'SELECT * FROM atomes WHERE parent_id = ? AND deleted_at IS NULL',
        [parentId]
    );
}

/**
 * Update atome metadata (type, parent, owner)
 */
export async function updateAtomeMetadata(id, updates) {
    const fields = [];
    const values = [];

    if (updates.type !== undefined) { fields.push('atome_type = ?'); values.push(updates.type); }
    if (updates.parent !== undefined) { fields.push('parent_id = ?'); values.push(updates.parent); }
    if (updates.owner !== undefined) { fields.push('owner_id = ?'); values.push(updates.owner); }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    fields.push('sync_status = ?');
    values.push(new Date().toISOString());
    values.push('pending');
    values.push(id);

    await query('run', `UPDATE atomes SET ${fields.join(', ')} WHERE atome_id = ?`, values);
}

/**
 * Update atome with properties
 */
export async function updateAtome(id, properties, author = null) {
    await setParticles(id, properties, author);
    return await getAtome(id);
}

/**
 * Soft delete atome
 */
export async function deleteAtome(id) {
    const now = new Date().toISOString();
    await query('run',
        'UPDATE atomes SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE atome_id = ?',
        [now, now, 'pending', id]
    );
}

/**
 * List atomes for a user with full data
 */
export async function listAtomes(ownerId, options = {}) {
    // For multi-user sharing, listing must include atomes shared with the user.
    const atomes = await getAtomesAccessibleToUser(ownerId, options);

    // Load particles for each atome
    const result = [];
    for (const atome of atomes) {
        const fullAtome = await getAtome(atome.atome_id);
        if (fullAtome) {
            result.push(fullAtome);
        }
    }

    return result;
}

// ============================================================================
// PARTICLE OPERATIONS (ADOLE v3.0)
// ============================================================================

/**
 * Set a particle on an atome (creates or updates)
 * Also records the change in particles_versions for history
 */
export async function setParticle(atomeId, key, value, author = null) {
    const now = new Date().toISOString();
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : JSON.stringify(value);
    const valueType = typeof value === 'object' ? 'json' : typeof value;

    // Check if particle exists
    const existing = await query('get',
        'SELECT particle_id, version FROM particles WHERE atome_id = ? AND particle_key = ?',
        [atomeId, key]
    );

    let particleId;
    let version;
    let oldValue = null;

    if (existing) {
        // Get old value for history
        const oldRow = await query('get',
            'SELECT particle_value FROM particles WHERE particle_id = ?',
            [existing.particle_id]
        );
        oldValue = oldRow?.particle_value || null;

        // Update existing particle
        version = (existing.version || 1) + 1;
        await query('run', `
            UPDATE particles SET particle_value = ?, value_type = ?, version = ?, updated_at = ?
            WHERE atome_id = ? AND particle_key = ?
        `, [valueStr, valueType, version, now, atomeId, key]);
        particleId = existing.particle_id;
    } else {
        // Create new particle (particle_id is AUTOINCREMENT, don't specify it)
        version = 1;
        await query('run', `
            INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [atomeId, key, valueStr, valueType, version, now, now]);

        // Get the auto-generated particle_id
        const inserted = await query('get',
            'SELECT particle_id FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, key]
        );
        particleId = inserted?.particle_id;
    }

    // Record in particles_versions for history (correct column names)
    await query('run', `
        INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [particleId, atomeId, key, version, oldValue, valueStr, author, now]);

    // Update atome's updated_at and sync_status
    await query('run',
        'UPDATE atomes SET updated_at = ?, sync_status = ? WHERE atome_id = ?',
        [now, 'pending', atomeId]
    );

    return { particleId, version };
}

/**
 * Set multiple particles at once
 */
export async function setParticles(atomeId, particles, author = null) {
    // Guard against null/undefined particles
    if (!particles || typeof particles !== 'object') {
        console.warn('[setParticles] Invalid particles:', particles, 'for atome:', atomeId);
        return;
    }
    for (const [key, value] of Object.entries(particles)) {
        await setParticle(atomeId, key, value, author);
    }
}

/**
 * Get a single particle value
 */
export async function getParticle(atomeId, key) {
    const row = await query('get',
        'SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
        [atomeId, key]
    );
    if (!row) return null;
    try {
        return JSON.parse(row.particle_value);
    } catch {
        return row.particle_value;
    }
}

/**
 * Get all particles of an atome
 */
export async function getParticles(atomeId) {
    const rows = await query('all',
        'SELECT particle_key, particle_value FROM particles WHERE atome_id = ?',
        [atomeId]
    );
    const result = {};
    for (const row of rows) {
        try {
            result[row.particle_key] = JSON.parse(row.particle_value);
        } catch {
            result[row.particle_key] = row.particle_value;
        }
    }
    return result;
}

/**
 * Delete a particle
 */
export async function deleteParticle(atomeId, key) {
    await query('run', 'DELETE FROM particles WHERE atome_id = ? AND particle_key = ?', [atomeId, key]);
}

// ============================================================================
// PARTICLE VERSIONS (History / Time-Travel)
// ============================================================================

/**
 * Get version history of a particle
 */
export async function getParticleHistory(atomeId, key, limit = 50) {
    return await query('all', `
        SELECT * FROM particles_versions 
        WHERE atome_id = ? AND particle_key = ?
        ORDER BY version DESC
        LIMIT ?
    `, [atomeId, key, limit]);
}

/**
 * Restore a particle to a specific version
 */
export async function restoreParticleVersion(atomeId, key, version, author = null) {
    const versionRow = await query('get', `
        SELECT particle_value, value_type FROM particles_versions
        WHERE atome_id = ? AND particle_key = ? AND version = ?
    `, [atomeId, key, version]);

    if (!versionRow) throw new Error(`Version ${version} not found for particle ${key}`);

    const value = JSON.parse(versionRow.particle_value);
    await setParticle(atomeId, key, value, author);
}

/**
 * Get all changes since a specific timestamp (for sync)
 */
export async function getChangesSince(sinceTimestamp = null) {
    if (!sinceTimestamp) {
        return await query('all', `
            SELECT pv.*, a.atome_type, a.parent_id, a.owner_id
            FROM particles_versions pv
            JOIN atomes a ON pv.atome_id = a.atome_id
            ORDER BY pv.created_at ASC
            LIMIT 1000
        `);
    }
    return await query('all', `
        SELECT pv.*, a.atome_type, a.parent_id, a.owner_id
        FROM particles_versions pv
        JOIN atomes a ON pv.atome_id = a.atome_id
        WHERE pv.created_at > ?
        ORDER BY pv.created_at ASC
        LIMIT 1000
    `, [sinceTimestamp]);
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

/**
 * Create a snapshot of an atome's current state
 */
export async function createSnapshot(atomeId, createdBy = null) {
    const atome = await getAtome(atomeId);
    if (!atome) throw new Error('Atome not found');

    const snapshotData = JSON.stringify(atome);
    const now = new Date().toISOString();

    await query('run', `
        INSERT INTO snapshots (atome_id, snapshot_data, snapshot_type, created_by, created_at)
        VALUES (?, ?, 'manual', ?, ?)
    `, [atomeId, snapshotData, createdBy, now]);

    // Get the auto-generated snapshot_id
    const inserted = await query('get',
        'SELECT snapshot_id FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT 1',
        [atomeId]
    );

    return inserted?.snapshot_id;
}

/**
 * Get snapshots for an atome
 */
export async function getSnapshots(atomeId, limit = 10) {
    return await query('all', `
        SELECT * FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT ?
    `, [atomeId, limit]);
}

/**
 * Restore an atome from a snapshot
 */
export async function restoreSnapshot(snapshotId, author = null) {
    const snap = await query('get',
        'SELECT * FROM snapshots WHERE snapshot_id = ?',
        [snapshotId]
    );
    if (!snap) throw new Error('Snapshot not found');

    const data = JSON.parse(snap.snapshot_data);

    // Clear current particles
    await query('run', 'DELETE FROM particles WHERE atome_id = ?', [snap.atome_id]);

    // Restore all particles
    if (data.data) {
        await setParticles(snap.atome_id, data.data, author);
    }

    return data;
}

// ============================================================================
// PERMISSIONS
// ============================================================================

/**
 * Set permission for a user on an atome
 */
export async function setPermission(
    atomeId,
    principalId,
    canRead = true,
    canWrite = false,
    canDelete = false,
    canShare = false,
    particleKey = null,
    grantedBy = null,
    options = {}
) {
    const now = new Date().toISOString();
    const canCreate = options.canCreate ? 1 : 0;
    const shareMode = options.shareMode ? String(options.shareMode) : null;
    const conditions = options.conditions ? JSON.stringify(options.conditions) : null;
    const expiresAt = options.expiresAt || null;

    // Check if exists
    const existing = await query('get', `
        SELECT permission_id FROM permissions 
        WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR (particle_key IS NULL AND ? IS NULL))
    `, [atomeId, principalId, particleKey, particleKey]);

    if (existing) {
        await query('run', `
            UPDATE permissions SET can_read = ?, can_write = ?, can_delete = ?, can_share = ?, can_create = ?,
                                   share_mode = COALESCE(?, share_mode),
                                   conditions = COALESCE(?, conditions),
                                   expires_at = COALESCE(?, expires_at)
            WHERE permission_id = ?
        `, [
            canRead ? 1 : 0,
            canWrite ? 1 : 0,
            canDelete ? 1 : 0,
            canShare ? 1 : 0,
            canCreate,
            shareMode,
            conditions,
            expiresAt,
            existing.permission_id
        ]);
    } else {
        await query('run', `
            INSERT INTO permissions (atome_id, particle_key, principal_id, can_read, can_write, can_delete, can_share, can_create,
                                     granted_by, granted_at, share_mode, conditions, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            atomeId,
            particleKey,
            principalId,
            canRead ? 1 : 0,
            canWrite ? 1 : 0,
            canDelete ? 1 : 0,
            canShare ? 1 : 0,
            canCreate,
            grantedBy,
            now,
            shareMode,
            conditions,
            expiresAt
        ]);
    }
}

function parseConditions(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function coerceComparable(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return value;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
    return String(value);
}

function compareValues(actual, op, expected) {
    const left = coerceComparable(actual);
    const right = coerceComparable(expected);

    switch (op) {
        case 'eq': return left === right;
        case 'ne': return left !== right;
        case 'gt': return left > right;
        case 'gte': return left >= right;
        case 'lt': return left < right;
        case 'lte': return left <= right;
        case 'in': return Array.isArray(expected) ? expected.map(coerceComparable).includes(left) : false;
        default: return false;
    }
}

function resolvePath(path, context) {
    if (!path || typeof path !== 'string') return undefined;
    const parts = path.split('.');
    let cur = context;
    for (const part of parts) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}

function evaluateConditionNode(node, context) {
    if (!node || typeof node !== 'object') return true;

    if (Array.isArray(node)) {
        return node.every((child) => evaluateConditionNode(child, context));
    }

    if (node.all && Array.isArray(node.all)) {
        return node.all.every((child) => evaluateConditionNode(child, context));
    }
    if (node.any && Array.isArray(node.any)) {
        return node.any.some((child) => evaluateConditionNode(child, context));
    }

    if (node.after || node.before) {
        const now = context.now ? context.now.getTime() : Date.now();
        if (node.after && now < coerceComparable(node.after)) return false;
        if (node.before && now > coerceComparable(node.before)) return false;
        return true;
    }

    if (node.field && node.op) {
        const actual = resolvePath(node.field, context);
        return compareValues(actual, node.op, node.value);
    }

    if (node.user && typeof node.user === 'object') {
        return Object.entries(node.user).every(([key, rule]) => {
            if (rule && typeof rule === 'object' && rule.op) {
                return compareValues(resolvePath(`user.${key}`, context), rule.op, rule.value);
            }
            return compareValues(resolvePath(`user.${key}`, context), 'eq', rule);
        });
    }

    if (node.atome && typeof node.atome === 'object') {
        return Object.entries(node.atome).every(([key, rule]) => {
            if (rule && typeof rule === 'object' && rule.op) {
                return compareValues(resolvePath(`atome.${key}`, context), rule.op, rule.value);
            }
            return compareValues(resolvePath(`atome.${key}`, context), 'eq', rule);
        });
    }

    return true;
}

async function isPermissionActive(permission, principalId, atomeId) {
    if (!permission) return false;
    if (permission.expires_at) {
        const expiry = new Date(permission.expires_at).getTime();
        if (!Number.isNaN(expiry) && Date.now() > expiry) return false;
    }

    const conditions = parseConditions(permission.conditions);
    if (!conditions) return true;

    const [userAtome, targetAtome] = await Promise.all([
        principalId ? getAtome(principalId) : null,
        atomeId ? getAtome(atomeId) : null
    ]);

    const context = {
        now: new Date(),
        user: userAtome ? (userAtome.data || {}) : {},
        atome: targetAtome ? (targetAtome.data || {}) : {}
    };

    return evaluateConditionNode(conditions, context);
}

async function checkPermissionFlag(atomeId, principalId, particleKey, field) {
    // Owner always has access (including pending owner when FK prevented setting owner_id)
    const ownerId = await getEffectiveOwnerId(atomeId);
    if (ownerId && ownerId === principalId) return true;

    const perm = await query('get', `
        SELECT ${field} as flag, expires_at, conditions
        FROM permissions
        WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
        ORDER BY particle_key DESC LIMIT 1
    `, [atomeId, principalId, particleKey]);

    if (!perm || perm.flag !== 1) return false;
    return await isPermissionActive(perm, principalId, atomeId);
}

/**
 * Check if user can read an atome/particle
 */
export async function canRead(atomeId, principalId, particleKey = null) {
    return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_read');
}

/**
 * Check if user can write an atome/particle
 */
export async function canWrite(atomeId, principalId, particleKey = null) {
    return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_write');
}

/**
 * Check if user can delete an atome/particle
 */
export async function canDelete(atomeId, principalId, particleKey = null) {
    return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_delete');
}

/**
 * Check if user can share an atome/particle
 */
export async function canShare(atomeId, principalId, particleKey = null) {
    return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_share');
}

/**
 * Check if user can create a child under an atome
 */
export async function canCreate(atomeId, principalId, particleKey = null) {
    // Owner always has access (including pending owner when FK prevented setting owner_id)
    const ownerId = await getEffectiveOwnerId(atomeId);
    if (ownerId && ownerId === principalId) return true;

    const perm = await query('get', `
        SELECT can_create as flag, can_share as fallback, expires_at, conditions
        FROM permissions
        WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
        ORDER BY particle_key DESC LIMIT 1
    `, [atomeId, principalId, particleKey]);

    if (!perm || (perm.flag !== 1 && perm.fallback !== 1)) return false;
    return await isPermissionActive(perm, principalId, atomeId);
}

// ============================================================================
// SYNC STATE
// ============================================================================

/**
 * Get sync state for an atome
 */
export async function getSyncState(atomeId) {
    return await query('get', 'SELECT * FROM sync_state WHERE atome_id = ?', [atomeId]);
}

/**
 * Update sync state after successful sync
 */
export async function updateSyncState(atomeId, localHash = null, remoteHash = null, syncStatus = 'synced') {
    const now = new Date().toISOString();
    await query('run', `
        INSERT INTO sync_state (atome_id, local_hash, remote_hash, last_sync_at, sync_status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(atome_id) DO UPDATE SET 
            local_hash = ?, 
            remote_hash = ?, 
            last_sync_at = ?, 
            sync_status = ?
    `, [atomeId, localHash, remoteHash, now, syncStatus, localHash, remoteHash, now, syncStatus]);
}

/**
 * Get pending atomes for sync
 */
export async function getPendingForSync(ownerId) {
    const atomes = await query('all', `
                SELECT DISTINCT a.*
                FROM atomes a
                LEFT JOIN particles po
                    ON po.atome_id = a.atome_id
                 AND po.particle_key = '_pending_owner_id'
                WHERE a.sync_status = 'pending'
                    AND a.deleted_at IS NULL
                    AND (
                        a.owner_id = ?
                        OR json_extract(po.particle_value, '$') = ?
                    )
                ORDER BY a.updated_at ASC
        `, [ownerId, ownerId]);

    const result = [];
    for (const atome of atomes) {
        const fullAtome = await getAtome(atome.atome_id);
        if (fullAtome) {
            result.push({
                ...fullAtome,
                deleted: atome.deleted_at !== null
            });
        }
    }
    return result;
}

/**
 * Mark atomes as synced
 */
export async function markAsSynced(atomeIds) {
    const now = new Date().toISOString();
    for (const id of atomeIds) {
        await query('run',
            'UPDATE atomes SET sync_status = ?, last_sync = ? WHERE atome_id = ?',
            ['synced', now, id]
        );
    }
}

// ============================================================================
// LEGACY COMPATIBILITY (objects/properties API)
// ============================================================================

// Aliases for backwards compatibility
export const createObject = createAtome;
export const getObject = getAtome;
export const getObjectById = getAtomeById;
export const getObjectsByOwner = getAtomesByOwner;
export const getObjectChildren = getAtomeChildren;
export const updateObject = updateAtomeMetadata;
export const deleteObject = deleteAtome;

export const setProperty = setParticle;
export const setProperties = setParticles;
export const getProperty = getParticle;
export const getProperties = getParticles;
export const deleteProperty = deleteParticle;
export const getPropertyHistory = getParticleHistory;
export const restorePropertyVersion = restoreParticleVersion;

// ============================================================================
// DATASOURCE ADAPTER (for auth.js compatibility)
// ============================================================================

/**
 * DataSource adapter for backwards compatibility with auth.js
 * Provides a dataSource.query() interface for raw SQL
 */
export function getDataSourceAdapter() {
    if (!db) {
        throw new Error('[ADOLE v3.0] Database not initialized. Call initDatabase() first.');
    }

    const executeQuery = async (sql, params = []) => {
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
                    console.error('[ADOLE v3.0] Transaction error:', error);
                    throw error;
                }
            }
        }
    };
}

// ============================================================================
// DEBUG ENDPOINTS SUPPORT
// ============================================================================

/**
 * Get all table names in the database
 */
export async function getTableNames() {
    const rows = await query('all',
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    return rows.map(r => r.name);
}

/**
 * Get table row counts
 */
export async function getTableCounts() {
    const tables = await getTableNames();
    const counts = {};
    for (const table of tables) {
        try {
            const row = await query('get', `SELECT COUNT(*) as count FROM ${table}`);
            counts[table] = row?.count || 0;
        } catch {
            counts[table] = 'error';
        }
    }
    return counts;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
    // Init
    initDatabase,
    getDatabase,
    closeDatabase,

    // Atomes (ADOLE v3.0)
    createAtome,
    getAtome,
    getAtomeById,
    getAtomesByOwner,
    getAtomeChildren,
    updateAtome,
    updateAtomeMetadata,
    deleteAtome,
    listAtomes,

    // Particles (ADOLE v3.0)
    setParticle,
    setParticles,
    getParticle,
    getParticles,
    deleteParticle,

    // Versions
    getParticleHistory,
    restoreParticleVersion,
    getChangesSince,

    // Snapshots
    createSnapshot,
    getSnapshots,
    restoreSnapshot,

    // Permissions
    setPermission,
    canRead,
    canWrite,
    canDelete,
    canShare,
    canCreate,

    // Sync
    getSyncState,
    updateSyncState,
    getPendingForSync,
    markAsSynced,
    resolvePendingOwners,

    // Legacy compatibility
    createObject,
    getObject,
    getObjectById,
    getObjectsByOwner,
    getObjectChildren,
    updateObject,
    deleteObject,
    setProperty,
    setProperties,
    getProperty,
    getProperties,
    deleteProperty,
    getPropertyHistory,
    restorePropertyVersion,

    // Debug
    getTableNames,
    getTableCounts,

    // Raw query access
    query,

    // Compatibility
    getDataSourceAdapter
};
