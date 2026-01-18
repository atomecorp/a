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
 * - events: Event log (append-only)
 * - state_current: Projection cache
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

    try {
        await ensureSnapshotColumns();
    } catch (e) {
        console.log('[ADOLE v3.0] Snapshot migration skipped:', e.message);
    }

    try {
        await ensureEventColumns();
    } catch (e) {
        console.log('[ADOLE v3.0] Event migration skipped:', e.message);
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

async function ensureSnapshotColumns() {
    const columns = await query('all', "PRAGMA table_info(snapshots)");
    const names = new Set((columns || []).map((col) => col.name));

    if (!names.has('project_id')) {
        await query('run', "ALTER TABLE snapshots ADD COLUMN project_id TEXT");
    }
    if (!names.has('state_blob')) {
        await query('run', "ALTER TABLE snapshots ADD COLUMN state_blob TEXT");
    }
    if (!names.has('label')) {
        await query('run', "ALTER TABLE snapshots ADD COLUMN label TEXT");
    }
    if (!names.has('actor')) {
        await query('run', "ALTER TABLE snapshots ADD COLUMN actor TEXT");
    }
}

async function ensureEventColumns() {
    const columns = await query('all', "PRAGMA table_info(events)");
    const names = new Set((columns || []).map((col) => col.name));

    if (!names.has('project_id')) {
        await query('run', "ALTER TABLE events ADD COLUMN project_id TEXT");
    }
    if (!names.has('actor')) {
        await query('run', "ALTER TABLE events ADD COLUMN actor TEXT");
    }
    if (!names.has('tx_id')) {
        await query('run', "ALTER TABLE events ADD COLUMN tx_id TEXT");
    }
    if (!names.has('gesture_id')) {
        await query('run', "ALTER TABLE events ADD COLUMN gesture_id TEXT");
    }
}

function safeParseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function serializeJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function resolveEventPayload(event) {
    if (!event || typeof event !== 'object') return null;
    if (event.payload !== undefined) return event.payload;
    const props = event.props || event.properties || event.patch || null;
    if (props && typeof props === 'object') {
        return { props };
    }
    return null;
}

function extractEventPatch(kind, payload, ts) {
    if (!kind) return null;
    if (kind === 'delete') {
        return { __deleted: true, deleted_at: ts };
    }

    const payloadObj = safeParseJson(payload);
    if (!payloadObj || typeof payloadObj !== 'object') return null;

    const patch =
        payloadObj.props ||
        payloadObj.properties ||
        payloadObj.patch ||
        payloadObj.delta ||
        null;

    if (patch && typeof patch === 'object') {
        return patch;
    }

    return null;
}

const EVENT_META_PARTICLE_KEYS = new Set([
    'type',
    'atome_type',
    'kind',
    'parent_id',
    'parentId',
    'project_id',
    'projectId',
    '__deleted',
    'deleted_at'
]);

function resolveActorId(actor) {
    if (!actor || typeof actor !== 'object') return null;
    return actor.id || actor.user_id || actor.userId || null;
}

function resolveEventType(patch) {
    if (!patch || typeof patch !== 'object') return null;
    return patch.type || patch.atome_type || patch.kind || null;
}

function resolveEventParentId(patch) {
    if (!patch || typeof patch !== 'object') return null;
    return patch.parent_id || patch.parentId || patch.project_id || patch.projectId || null;
}

function stripEventMetaPatch(patch) {
    if (!patch || typeof patch !== 'object') return {};
    const filtered = {};
    for (const [key, value] of Object.entries(patch)) {
        if (EVENT_META_PARTICLE_KEYS.has(key)) continue;
        filtered[key] = value;
    }
    return filtered;
}

async function upsertAtomeFromEvent({ atomeId, atomeType, parentId, ownerId, ts, deleted, properties }) {
    if (!atomeId) return;
    const now = ts || new Date().toISOString();

    const existing = await query(
        'get',
        'SELECT atome_id, atome_type, parent_id, owner_id FROM atomes WHERE atome_id = ?',
        [atomeId]
    );

    if (!existing) {
        const safeType = atomeType || 'generic';
        let insertOwnerId = ownerId || null;
        let insertParentId = parentId || null;
        let pendingOwnerId = null;
        let pendingParentId = null;

        if (insertOwnerId === atomeId) insertOwnerId = null;
        if (insertParentId === atomeId) insertParentId = null;

        if (insertOwnerId) {
            const ownerExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [insertOwnerId]);
            if (!ownerExists) {
                pendingOwnerId = insertOwnerId;
                insertOwnerId = null;
            }
        }

        if (insertParentId) {
            const parentExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [insertParentId]);
            if (!parentExists) {
                pendingParentId = insertParentId;
                insertParentId = null;
            }
        }

        await query(
            'run',
            `INSERT OR REPLACE INTO atomes (
				atome_id,
				atome_type,
				parent_id,
				owner_id,
				creator_id,
				sync_status,
				created_source,
				created_at,
				updated_at,
				deleted_at
			) VALUES (?, ?, ?, ?, ?, 'pending', 'fastify', COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?), ?), ?, ?)`,
            [
                atomeId,
                safeType,
                insertParentId,
                insertOwnerId,
                ownerId || null,
                atomeId,
                now,
                now,
                deleted ? now : null
            ]
        );

        if (pendingOwnerId) {
            await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, ownerId || null);
        }
        if (pendingParentId) {
            await setParticle(atomeId, '_pending_parent_id', pendingParentId, ownerId || null);
        }
    } else {
        const updates = [];
        const values = [];
        const existingType = existing.atome_type || '';
        const shouldUpgradeType = !!(
            atomeType
            && (
                !existingType
                || existingType === 'generic'
                || (atomeType === 'user' && existingType !== 'user')
            )
        );
        if (shouldUpgradeType) {
            updates.push('atome_type = ?');
            values.push(atomeType);
        }
        if (!existing.parent_id && parentId) {
            updates.push('parent_id = ?');
            values.push(parentId);
        }
        if (!existing.owner_id && ownerId) {
            updates.push('owner_id = ?');
            values.push(ownerId);
        }
        if (deleted) {
            updates.push('deleted_at = ?');
            values.push(now);
        }
        if (updates.length > 0) {
            updates.push('updated_at = ?');
            values.push(now);
            values.push(atomeId);
            await query('run', `UPDATE atomes SET ${updates.join(', ')} WHERE atome_id = ?`, values);
        }
    }

    if (properties && Object.keys(properties).length > 0) {
        await setParticles(atomeId, properties, ownerId || null);
    }
}

async function withTransaction(work) {
    if (!db) await initDatabase();
    try {
        await db.beginTransaction();
        const result = await work();
        await db.commit();
        return result;
    } catch (error) {
        try {
            await db.rollback();
        } catch (_) { }
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

function resolveStateProjectId({ atomeId, atomeType, parentId, properties }) {
    const props = properties && typeof properties === 'object' ? properties : {};
    const explicitProject = props.projectId || props.project_id || null;
    if (explicitProject) return explicitProject;
    if (atomeType === 'project' && atomeId) return atomeId;
    const explicitParent = props.parentId || props.parent_id || null;
    if (explicitParent) return explicitParent;
    return parentId || null;
}

function buildStatePatch({ atomeType, kind, parentId, projectId, properties }) {
    const patch = properties && typeof properties === 'object' ? { ...properties } : {};
    if (atomeType && patch.type == null && patch.atome_type == null && patch.kind == null) {
        patch.type = atomeType;
    }
    if (kind && patch.kind == null) {
        patch.kind = kind;
    }
    if (parentId && patch.parent_id == null && patch.parentId == null) {
        patch.parent_id = parentId;
    }
    if (projectId && patch.project_id == null && patch.projectId == null) {
        patch.project_id = projectId;
    }
    return patch;
}

async function upsertStateCurrentFromMutation({
    atomeId,
    type,
    kind,
    parentId,
    properties,
    projectId,
    ts
}) {
    if (!atomeId) return null;
    const resolvedProjectId = projectId || resolveStateProjectId({
        atomeId,
        atomeType: type,
        parentId,
        properties
    });
    const patch = buildStatePatch({
        atomeType: type,
        kind,
        parentId,
        projectId: resolvedProjectId,
        properties
    });
    if (!patch || Object.keys(patch).length === 0) return null;
    return applyEventToStateCurrent({
        atome_id: atomeId,
        project_id: resolvedProjectId,
        kind: 'set',
        payload: { props: patch },
        ts: ts || new Date().toISOString()
    });
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

    try {
        await upsertStateCurrentFromMutation({
            atomeId,
            type,
            kind,
            parentId: parentId,
            properties,
            ts: now
        });
    } catch (e) {
        console.warn('[createAtome] state_current update failed:', e.message);
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
    try {
        const existing = await getAtomeById(id);
        await upsertStateCurrentFromMutation({
            atomeId: id,
            type: existing?.atome_type || null,
            parentId: existing?.parent_id || null,
            properties,
            ts: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[updateAtome] state_current update failed:', e.message);
    }
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
    try {
        await applyEventToStateCurrent({
            atome_id: id,
            kind: 'delete',
            payload: null,
            ts: now
        });
    } catch (e) {
        console.warn('[deleteAtome] state_current update failed:', e.message);
    }
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
 * Set multiple particles at once (OPTIMIZED BATCH INSERT)
 * Uses a single transaction for all particles to improve performance
 */
export async function setParticles(atomeId, particles, author = null) {
    // Guard against null/undefined particles
    if (!particles || typeof particles !== 'object') {
        console.warn('[setParticles] Invalid particles:', particles, 'for atome:', atomeId);
        return;
    }

    const entries = Object.entries(particles);
    if (entries.length === 0) return;

    // For small batches (1-3 particles), use sequential for simplicity
    if (entries.length <= 3) {
        for (const [key, value] of entries) {
            await setParticle(atomeId, key, value, author);
        }
        return;
    }

    // For larger batches, use optimized batch operations
    const now = new Date().toISOString();

    // Get all existing particles for this atome in one query
    const existingRows = await query('all',
        'SELECT particle_id, particle_key, particle_value, version FROM particles WHERE atome_id = ?',
        [atomeId]
    );
    const existingMap = new Map(existingRows.map(row => [row.particle_key, row]));

    // Prepare batch arrays
    const toInsert = [];
    const toUpdate = [];
    const historyRecords = [];

    for (const [key, value] of entries) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : JSON.stringify(value);
        const valueType = typeof value === 'object' ? 'json' : typeof value;
        const existing = existingMap.get(key);

        if (existing) {
            const newVersion = (existing.version || 1) + 1;
            toUpdate.push({ key, valueStr, valueType, version: newVersion, particleId: existing.particle_id });
            historyRecords.push({
                particleId: existing.particle_id,
                key,
                version: newVersion,
                oldValue: existing.particle_value,
                newValue: valueStr
            });
        } else {
            toInsert.push({ key, valueStr, valueType });
        }
    }

    // Batch update existing particles
    for (const item of toUpdate) {
        await query('run', `
            UPDATE particles SET particle_value = ?, value_type = ?, version = ?, updated_at = ?
            WHERE atome_id = ? AND particle_key = ?
        `, [item.valueStr, item.valueType, item.version, now, atomeId, item.key]);
    }

    // Batch insert new particles
    for (const item of toInsert) {
        await query('run', `
            INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
        `, [atomeId, item.key, item.valueStr, item.valueType, now, now]);

        // Get the auto-generated particle_id for history
        const inserted = await query('get',
            'SELECT particle_id FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, item.key]
        );
        if (inserted?.particle_id) {
            historyRecords.push({
                particleId: inserted.particle_id,
                key: item.key,
                version: 1,
                oldValue: null,
                newValue: item.valueStr
            });
        }
    }

    // Batch insert history records
    for (const record of historyRecords) {
        await query('run', `
            INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [record.particleId, atomeId, record.key, record.version, record.oldValue, record.newValue, author, now]);
    }

    // Update atome's updated_at only once at the end
    await query('run',
        'UPDATE atomes SET updated_at = ?, sync_status = ? WHERE atome_id = ?',
        [now, 'pending', atomeId]
    );
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
// EVENT LOG + STATE CURRENT (Projection)
// ============================================================================

function normalizeEventInput(event, options = {}) {
    if (!event || typeof event !== 'object') {
        throw new Error('Invalid event payload');
    }

    const kind = String(event.kind || '').trim();
    if (!kind) {
        throw new Error('Missing event kind');
    }

    const now = new Date().toISOString();
    const id = event.id || event.event_id || uuidv4();
    const ts = event.ts || event.timestamp || options.ts || now;
    const atomeId = event.atome_id || event.atomeId || null;
    const projectId = event.project_id || event.projectId || null;
    const payload = resolveEventPayload(event);
    const actor = event.actor ?? null;
    const txId = event.tx_id || event.txId || options.txId || null;
    const gestureId = event.gesture_id || event.gestureId || null;

    return {
        id,
        ts,
        atome_id: atomeId,
        project_id: projectId,
        kind,
        payload,
        actor,
        tx_id: txId,
        gesture_id: gestureId
    };
}

async function applyEventToStateCurrent(event) {
    const atomeId = event.atome_id;
    if (!atomeId) return null;

    const ts = event.ts || new Date().toISOString();
    const patch = extractEventPatch(event.kind, event.payload, ts);
    if (!patch) return null;

    const actorId = resolveActorId(event.actor);
    const patchType = resolveEventType(patch);
    const patchParent = resolveEventParentId(patch);
    const deleted = patch.__deleted === true;
    const particlePatch = stripEventMetaPatch(patch);

    await upsertAtomeFromEvent({
        atomeId,
        atomeType: patchType,
        parentId: patchParent,
        ownerId: actorId,
        ts,
        deleted,
        properties: particlePatch
    });

    if (patch.type == null && patch.atome_type == null && patch.kind == null) {
        const row = await query(
            'get',
            'SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?',
            [atomeId]
        );
        if (row?.atome_type) {
            patch.type = row.atome_type;
        }
        if (row?.parent_id && patch.parent_id == null && patch.parentId == null) {
            patch.parent_id = row.parent_id;
        }
    }

    const existing = await query(
        'get',
        'SELECT properties, version, project_id FROM state_current WHERE atome_id = ?',
        [atomeId]
    );

    const parsed = safeParseJson(existing?.properties);
    const currentProps = parsed && typeof parsed === 'object' ? parsed : {};
    const nextProps = { ...currentProps, ...patch };
    const nextVersion = (existing?.version || 0) + 1;
    const projectId = event.project_id || existing?.project_id || null;

    if (existing) {
        await query(
            'run',
            'UPDATE state_current SET properties = ?, updated_at = ?, version = ?, project_id = COALESCE(?, project_id) WHERE atome_id = ?',
            [JSON.stringify(nextProps), ts, nextVersion, projectId, atomeId]
        );
    } else {
        await query(
            'run',
            'INSERT INTO state_current (atome_id, project_id, properties, updated_at, version) VALUES (?, ?, ?, ?, ?)',
            [atomeId, projectId, JSON.stringify(nextProps), ts, nextVersion]
        );
    }

    return {
        atome_id: atomeId,
        project_id: projectId,
        properties: nextProps,
        updated_at: ts,
        version: nextVersion
    };
}

export async function appendEvent(event, options = {}) {
    const normalized = normalizeEventInput(event, options);
    const payloadJson = serializeJson(normalized.payload);
    const actorJson = serializeJson(normalized.actor);

    await withTransaction(async () => {
        const existing = await query(
            'get',
            'SELECT 1 FROM events WHERE id = ?',
            [normalized.id]
        );
        if (existing) return;
        await query(
            'run',
            `INSERT INTO events (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalized.id,
                normalized.ts,
                normalized.atome_id,
                normalized.project_id,
                normalized.kind,
                payloadJson,
                actorJson,
                normalized.tx_id,
                normalized.gesture_id
            ]
        );

        await applyEventToStateCurrent({
            ...normalized,
            payload: normalized.payload
        });
    });

    return normalized;
}

export async function appendEvents(events, options = {}) {
    if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
    }

    const results = [];
    const txId = options.tx_id || options.txId || null;

    await withTransaction(async () => {
        for (const evt of events) {
            const normalized = normalizeEventInput(evt, { txId });
            const payloadJson = serializeJson(normalized.payload);
            const actorJson = serializeJson(normalized.actor);

            const existing = await query(
                'get',
                'SELECT 1 FROM events WHERE id = ?',
                [normalized.id]
            );
            if (existing) {
                results.push(normalized);
                continue;
            }

            await query(
                'run',
                `INSERT INTO events (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    normalized.id,
                    normalized.ts,
                    normalized.atome_id,
                    normalized.project_id,
                    normalized.kind,
                    payloadJson,
                    actorJson,
                    normalized.tx_id,
                    normalized.gesture_id
                ]
            );

            await applyEventToStateCurrent({
                ...normalized,
                payload: normalized.payload
            });

            results.push(normalized);
        }
    });

    return results;
}

export async function listEvents(options = {}) {
    const {
        projectId = null,
        atomeId = null,
        txId = null,
        gestureId = null,
        since = null,
        until = null,
        limit = 1000,
        offset = 0,
        order = 'asc'
    } = options || {};

    const conditions = [];
    const params = [];

    if (projectId) {
        conditions.push('project_id = ?');
        params.push(projectId);
    }
    if (atomeId) {
        conditions.push('atome_id = ?');
        params.push(atomeId);
    }
    if (txId) {
        conditions.push('tx_id = ?');
        params.push(txId);
    }
    if (gestureId) {
        conditions.push('gesture_id = ?');
        params.push(gestureId);
    }
    if (since) {
        conditions.push('ts >= ?');
        params.push(since);
    }
    if (until) {
        conditions.push('ts <= ?');
        params.push(until);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const rows = await query(
        'all',
        `SELECT * FROM events ${where} ORDER BY ts ${orderBy} LIMIT ? OFFSET ?`,
        [...params, Number(limit) || 1000, Number(offset) || 0]
    );

    return (rows || []).map((row) => ({
        ...row,
        payload: safeParseJson(row.payload),
        actor: safeParseJson(row.actor)
    }));
}

export async function getEvent(eventId) {
    if (!eventId) return null;
    const row = await query('get', 'SELECT * FROM events WHERE id = ?', [eventId]);
    if (!row) return null;
    return {
        ...row,
        payload: safeParseJson(row.payload),
        actor: safeParseJson(row.actor)
    };
}

export async function getStateCurrent(atomeId) {
    if (!atomeId) return null;
    const row = await query('get', 'SELECT * FROM state_current WHERE atome_id = ?', [atomeId]);
    if (!row) return null;
    return {
        ...row,
        properties: safeParseJson(row.properties) || {}
    };
}

export async function listStateCurrent(projectId, options = {}) {
    const limit = Number(options.limit) || 1000;
    const offset = Number(options.offset) || 0;

    const params = [];
    let where = '';
    if (projectId) {
        where = 'WHERE project_id = ?';
        params.push(projectId);
    }

    const rows = await query(
        'all',
        `SELECT * FROM state_current ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return (rows || []).map((row) => ({
        ...row,
        properties: safeParseJson(row.properties) || {}
    }));
}

export async function createStateSnapshot(options = {}) {
    const {
        projectId = null,
        atomeId = null,
        label = null,
        actor = null,
        state = null,
        snapshotType = 'manual'
    } = options || {};

    const snapshotAtomeId = atomeId || projectId;
    if (!snapshotAtomeId) {
        throw new Error('Snapshot requires projectId or atomeId');
    }

    const now = new Date().toISOString();
    const actorJson = serializeJson(actor);
    const createdBy =
        actor && typeof actor === 'object'
            ? (actor.id || actor.user_id || actor.userId || null)
            : (typeof actor === 'string' ? actor : null);

    const statePayload = state || (projectId ? await listStateCurrent(projectId) : null);
    const blob = JSON.stringify(statePayload || {});

    await query(
        'run',
        `INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            snapshotAtomeId,
            projectId,
            blob,
            blob,
            label,
            snapshotType,
            actorJson,
            createdBy,
            now
        ]
    );

    const inserted = await query(
        'get',
        'SELECT snapshot_id FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT 1',
        [snapshotAtomeId]
    );

    return inserted?.snapshot_id;
}

export async function listStateSnapshots(projectId, options = {}) {
    if (!projectId) return [];
    const limit = Number(options.limit) || 20;
    const offset = Number(options.offset) || 0;

    const rows = await query(
        'all',
        'SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [projectId, limit, offset]
    );

    return (rows || []).map((row) => ({
        ...row,
        state_blob: safeParseJson(row.state_blob || row.snapshot_data),
        actor: safeParseJson(row.actor)
    }));
}

export async function getStateSnapshot(snapshotId) {
    if (!snapshotId) return null;
    const row = await query('get', 'SELECT * FROM snapshots WHERE snapshot_id = ?', [snapshotId]);
    if (!row) return null;
    return {
        ...row,
        state_blob: safeParseJson(row.state_blob || row.snapshot_data),
        actor: safeParseJson(row.actor)
    };
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
    createStateSnapshot,
    listStateSnapshots,
    getStateSnapshot,

    // Event log + projection
    appendEvent,
    appendEvents,
    listEvents,
    getEvent,
    getStateCurrent,
    listStateCurrent,

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
