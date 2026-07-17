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
    initDatabase,
    query,
    safeParseJson,
    serializeJson,
    withTransaction,
    getDatabase,
    closeDatabase
} from './adole_db_core.js';
import {
    assertCanonicalPropertyKey,
    normalizeCanonicalAtome,
    sanitizeAtomeProperties
} from '../atome/shared/atome_contract.js';
import {
    projectStoredAtome,
    projectStoredStateCurrent
} from './adole_storage_projection.js';
import { createAdolePermissionApi } from './adole_permissions.js';
import { createAdoleSyncApi } from './adole_sync.js';
import { createAdoleSnapshotsApi } from './adole_snapshots.js';
import { buildStateSnapshotRestoreEvents } from './state_snapshot_restore.js';
import {
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectRedoTransaction,
    selectUndoTransaction
} from './adole_history_transactions.js';

export {
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectRedoTransaction,
    selectUndoTransaction
};

// Public DB foundation, re-exported from the canonical db-core module.
export {
    initDatabase,
    withTransaction,
    getDatabase,
    closeDatabase
} from './adole_db_core.js';

const permissions = createAdolePermissionApi({
    query,
    getAtome,
    getEffectiveOwnerId
});

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
    return sanitizeAtomeProperties(filtered);
}

async function upsertAtomeFromEvent({
    atomeId,
    atomeType,
    parentId,
    ownerId,
    ts,
    deleted,
    properties,
    writeParticles = true
}) {
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

        if (pendingOwnerId && writeParticles) {
            await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, ownerId || null);
        }
        if (pendingParentId && writeParticles) {
            await setParticle(atomeId, '_pending_parent_id', pendingParentId, ownerId || null);
        }
    } else {
        const updates = [];
        const values = [];
        let pendingOwnerId = null;
        let pendingParentId = null;
        let assignedOwnerId = null;
        let assignedParentId = null;
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
        if (!existing.parent_id && parentId && parentId !== atomeId) {
            const parentExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [parentId]);
            if (parentExists) {
                updates.push('parent_id = ?');
                values.push(parentId);
                assignedParentId = parentId;
            } else {
                pendingParentId = parentId;
            }
        }
        if (!existing.owner_id && ownerId) {
            if (ownerId === atomeId) {
                updates.push('owner_id = ?');
                values.push(ownerId);
                assignedOwnerId = ownerId;
            } else {
                const ownerExists = await query('get', 'SELECT 1 FROM atomes WHERE atome_id = ?', [ownerId]);
                if (ownerExists) {
                    updates.push('owner_id = ?');
                    values.push(ownerId);
                    assignedOwnerId = ownerId;
                } else {
                    pendingOwnerId = ownerId;
                }
            }
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
        if (pendingOwnerId && writeParticles) {
            await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, ownerId || null);
        } else if (writeParticles && (assignedOwnerId || existing.owner_id)) {
            await query(
                'run',
                "DELETE FROM particles WHERE atome_id = ? AND particle_key = '_pending_owner_id'",
                [atomeId]
            );
        }
        if (pendingParentId && writeParticles) {
            await setParticle(atomeId, '_pending_parent_id', pendingParentId, ownerId || null);
        } else if (writeParticles && (assignedParentId || existing.parent_id)) {
            await query(
                'run',
                "DELETE FROM particles WHERE atome_id = ? AND particle_key = '_pending_parent_id'",
                [atomeId]
            );
        }
    }

    if (writeParticles && properties && Object.keys(properties).length > 0) {
        await setParticles(atomeId, properties, ownerId || null);
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
    const canonical = normalizeCanonicalAtome({
        id: atomeId,
        type,
        kind,
        properties
    }, {
        boundaryAdapter: true
    }).atome;
    const now = new Date().toISOString();
    const ownerId = owner;
    const creatorId = creator || owner;
    const canonicalProperties = canonical.properties;

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
	`, [atomeId, canonical.type, insertParentId, insertOwnerId, creatorId, atomeId, now, now]);

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
    if (Object.keys(canonicalProperties).length > 0) {
        await setParticles(atomeId, canonicalProperties, creatorId);
    }

    try {
        await upsertStateCurrentFromMutation({
            atomeId,
            type: canonical.type,
            kind: canonical.kind || kind,
            parentId: parentId,
            properties: canonicalProperties,
            ts: now
        });
    } catch (e) {
        console.warn('[createAtome] state_current update failed:', e.message);
    }

    return {
        atome_id: atomeId,
        atome_type: canonical.type,
        kind: canonical.kind || kind,
        parent_id: parent || null,
        owner_id: ownerId,
        creator_id: creatorId,
        properties: canonicalProperties,
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

    const updateResolvedStateCurrentReference = async ({ atomeId, particleKey, resolvedId }) => {
        if (particleKey === '_pending_owner_id') {
            await query(
                'run',
                'UPDATE state_current SET owner_id = ?, updated_at = ? WHERE atome_id = ?',
                [resolvedId, now, atomeId]
            );
            return;
        }
        if (particleKey !== '_pending_parent_id') return;
        const row = await query(
            'get',
            'SELECT properties, project_id FROM state_current WHERE atome_id = ?',
            [atomeId]
        );
        if (!row) return;
        const properties = safeParseJson(row.properties);
        const nextProperties = properties && typeof properties === 'object'
            ? { ...properties, parent_id: resolvedId }
            : { parent_id: resolvedId };
        await query(
            'run',
            'UPDATE state_current SET properties = ?, project_id = COALESCE(project_id, ?), updated_at = ? WHERE atome_id = ?',
            [JSON.stringify(nextProperties), resolvedId, now, atomeId]
        );
    };

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
                await updateResolvedStateCurrentReference({
                    atomeId: row.atome_id,
                    particleKey: row.particle_key,
                    resolvedId: pendingId
                });

                await query('run', 'DELETE FROM particles WHERE atome_id = ? AND particle_key = ?', [row.atome_id, row.particle_key]);
                resolved++;
            } else {
                failed++;
            }
        } catch (e) {
            console.error('[resolvePendingOwners] Error:', e.message);
            failed++;
        }
    }

    return { resolved, failed, total: pending.length };
}

export async function transferOwner({ fromOwnerId, toOwnerId, includeCreator = true } = {}) {
    if (!fromOwnerId || !toOwnerId) {
        throw new Error('Missing fromOwnerId or toOwnerId');
    }
    if (String(fromOwnerId) === String(toOwnerId)) {
        return { updated: 0 };
    }

    const pendingOwner = JSON.stringify(fromOwnerId);
    const creatorClause = includeCreator ? ' OR a.creator_id = ?' : '';
    const params = includeCreator
        ? [fromOwnerId, fromOwnerId, pendingOwner]
        : [fromOwnerId, pendingOwner];

    const rows = await query('all', `
        SELECT DISTINCT a.atome_id
        FROM atomes a
        LEFT JOIN particles p
          ON p.atome_id = a.atome_id
         AND p.particle_key = '_pending_owner_id'
        WHERE a.atome_type != 'user'
          AND (a.owner_id = ?${creatorClause} OR (a.owner_id IS NULL AND p.particle_value = ?))
    `, params);

    const ids = (rows || []).map((row) => row.atome_id).filter(Boolean);
    if (!ids.length) {
        return { updated: 0 };
    }

    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(', ');

    await withTransaction(async () => {
        await query(
            'run',
            `UPDATE atomes SET owner_id = ?, updated_at = ?, sync_status = 'pending' WHERE atome_id IN (${placeholders})`,
            [toOwnerId, now, ...ids]
        );

        await query(
            'run',
            `UPDATE state_current SET owner_id = ?, updated_at = ? WHERE atome_id IN (${placeholders})`,
            [toOwnerId, now, ...ids]
        );

        await query(
            'run',
            `DELETE FROM particles WHERE particle_key = '_pending_owner_id' AND atome_id IN (${placeholders})`,
            ids
        );
    });

    return { updated: ids.length };
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
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
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

    return projectStoredAtome({
        row: atome,
        properties: data,
        kind
    });
}

export async function isAnonymousUser(userId) {
    if (!userId) return false;
    try {
        const atome = await getAtome(userId);
        const data = atome?.properties || {};
        if (data.anonymous === true || data.is_anonymous === true) return true;
        const username = String(data.username || data.name || '').trim().toLowerCase();
        if (username === 'anonymous' || username === 'guest') return true;
        const phone = String(data.phone || '').trim();
        if (phone.startsWith('999') || phone.startsWith('000000')) return true;
    } catch (error) {
        if (process.env.SQUIRREL_ADOLE_DEBUG === '1') {
            console.warn('[ADOLE] anonymous user classification failed:', error.message);
        }
        return false;
    }
    return false;
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
    const normalizedType = String(options.type || options.atome_type || '').trim().toLowerCase();
    const limit = Number(options.limit) || 100;
    const offset = Number(options.offset) || 0;
    const includeDeleted = options.includeDeleted === true || options.include_deleted === true;
    const globalUserListing = normalizedType === 'user'
        && (options.skipOwner === true || options.skip_owner === true || ownerId === '*');
    let atomes;

    if (globalUserListing) {
        let sql = 'SELECT * FROM atomes WHERE atome_type = ?';
        const params = ['user'];
        if (!includeDeleted) {
            sql += ' AND deleted_at IS NULL';
        }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        atomes = await query('all', sql, params);
    } else {
        // For multi-user sharing, listing must include atomes shared with the user.
        atomes = await getAtomesAccessibleToUser(ownerId, options);
    }

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
    const propertyKey = assertCanonicalPropertyKey(key);
    const now = new Date().toISOString();
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : JSON.stringify(value);
    const valueType = typeof value === 'object' ? 'json' : typeof value;

    // Check if particle exists
    const existing = await query('get',
        'SELECT particle_id, version FROM particles WHERE atome_id = ? AND particle_key = ?',
        [atomeId, propertyKey]
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
		`, [valueStr, valueType, version, now, atomeId, propertyKey]);
        particleId = existing.particle_id;
    } else {
        // Create new particle (particle_id is AUTOINCREMENT, don't specify it)
        version = 1;
        await query('run', `
			INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, [atomeId, propertyKey, valueStr, valueType, version, now, now]);

        // Get the auto-generated particle_id
        const inserted = await query('get',
            'SELECT particle_id FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, propertyKey]
        );
        particleId = inserted?.particle_id;
    }

    // Record in particles_versions for history (correct column names)
    await query('run', `
		INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, [particleId, atomeId, propertyKey, version, oldValue, valueStr, author, now]);

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

    const entries = Object.entries(sanitizeAtomeProperties(particles));
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
		SELECT new_value FROM particles_versions
		WHERE atome_id = ? AND particle_key = ? AND version = ?
	`, [atomeId, key, version]);

    if (!versionRow) throw new Error(`Version ${version} not found for particle ${key}`);

    let value;
    try {
        value = JSON.parse(versionRow.new_value);
    } catch {
        value = versionRow.new_value;
    }
    await setParticle(atomeId, key, value, author);
}

/**
 * Get all changes since a specific timestamp (for sync)
 */
export async function getChangesSince(sinceTimestamp = null) {
    if (!sinceTimestamp) {
        return await query('all', `
			SELECT pv.*, pv.changed_at AS created_at, a.atome_type, a.parent_id, a.owner_id
			FROM particles_versions pv
			JOIN atomes a ON pv.atome_id = a.atome_id
			ORDER BY pv.changed_at ASC
			LIMIT 1000
		`);
    }
    return await query('all', `
		SELECT pv.*, pv.changed_at AS created_at, a.atome_type, a.parent_id, a.owner_id
		FROM particles_versions pv
		JOIN atomes a ON pv.atome_id = a.atome_id
		WHERE pv.changed_at > ?
		ORDER BY pv.changed_at ASC
		LIMIT 1000
	`, [sinceTimestamp]);
}

// ============================================================================
// SNAPSHOTS — owned by adole_snapshots.js (restore via canonical appendEvent)
// ============================================================================

const {
    createSnapshot,
    getSnapshots,
    restoreSnapshot
} = createAdoleSnapshotsApi({ getAtome, appendEvent });

export {
    createSnapshot,
    getSnapshots,
    restoreSnapshot
};

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

async function applyEventToStateCurrent(event, options = {}) {
    const atomeId = event.atome_id;
    if (!atomeId) return null;

    const ts = event.ts || new Date().toISOString();
    const sourcePatch = extractEventPatch(event.kind, event.payload, ts);
    if (!sourcePatch) return null;
    const patch = { ...sourcePatch };

    const actorId = resolveActorId(event.actor);
    const patchOwnerId = patch.owner_id || patch.ownerId || patch.owner || null;
    const eventOwnerId = event.owner_id || event.ownerId || event.owner || null;
    const patchType = resolveEventType(patch);
    const patchParent = resolveEventParentId(patch);
    const deleted = patch.__deleted === true;
    const particlePatch = stripEventMetaPatch(patch);

    const ownerFromEvent = eventOwnerId || patchOwnerId || actorId || null;
    await upsertAtomeFromEvent({
        atomeId,
        atomeType: patchType,
        parentId: patchParent,
        ownerId: ownerFromEvent,
        ts,
        deleted,
        properties: particlePatch,
        writeParticles: options.writeParticles !== false
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
        'SELECT properties, version, project_id, owner_id FROM state_current WHERE atome_id = ?',
        [atomeId]
    );

    let resolvedOwnerId = eventOwnerId || patchOwnerId || actorId || existing?.owner_id || null;
    try {
        const ownerRow = await query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        if (ownerRow?.owner_id) {
            resolvedOwnerId = ownerRow.owner_id;
        }
    } catch (error) {
        if (process.env.SQUIRREL_ADOLE_DEBUG === '1') {
            console.warn('[ADOLE] state owner lookup failed:', error.message);
        }
    }

    const parsed = safeParseJson(existing?.properties);
    const currentProps = parsed && typeof parsed === 'object' ? parsed : {};
    const nextProps = { ...currentProps, ...sanitizeAtomeProperties(patch) };
    const nextVersion = (existing?.version || 0) + 1;
    const projectId = event.project_id || existing?.project_id || null;

    if (existing) {
        await query(
            'run',
            'UPDATE state_current SET properties = ?, updated_at = ?, version = ?, project_id = COALESCE(?, project_id), owner_id = COALESCE(?, owner_id) WHERE atome_id = ?',
            [JSON.stringify(nextProps), ts, nextVersion, projectId, resolvedOwnerId, atomeId]
        );
    } else {
        await query(
            'run',
            'INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)',
            [atomeId, resolvedOwnerId, projectId, JSON.stringify(nextProps), ts, nextVersion]
        );
    }

    return {
        atome_id: atomeId,
        owner_id: resolvedOwnerId,
        project_id: projectId,
        properties: nextProps,
        updated_at: ts,
        version: nextVersion
    };
}

export async function rebuildStateCurrentFromEvents(options = {}) {
    const all = options.all === true || options.scope === 'all';
    const projectId = options.projectId || options.project_id || null;
    const atomeId = options.atomeId || options.atome_id || null;
    const limit = Math.max(1, Math.min(Number(options.limit) || 100000, 1000000));
    if (!all && !projectId && !atomeId) {
        throw new Error('rebuild_state_current_scope_required');
    }

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
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const scope = all ? 'all' : (projectId && atomeId ? 'project_and_atome' : (projectId ? 'project' : 'atome'));
    const applied = [];
    let eventCount = 0;

    await withTransaction(async () => {
        if (all) {
            await query('run', 'DELETE FROM state_current');
        } else if (projectId && atomeId) {
            await query('run', 'DELETE FROM state_current WHERE project_id = ? OR atome_id = ?', [projectId, atomeId]);
        } else if (projectId) {
            await query('run', 'DELETE FROM state_current WHERE project_id = ?', [projectId]);
        } else {
            await query('run', 'DELETE FROM state_current WHERE atome_id = ?', [atomeId]);
        }

        const rows = await query(
            'all',
            `SELECT rowid AS replay_rowid, * FROM events ${where} ORDER BY ts ASC, rowid ASC LIMIT ?`,
            [...params, limit]
        );
        eventCount = rows.length;
        for (const row of rows) {
            const projected = await applyEventToStateCurrent({
                ...row,
                payload: safeParseJson(row.payload),
                actor: safeParseJson(row.actor)
            }, {
                writeParticles: false
            });
            if (projected) applied.push(projected);
        }
    });

    return {
        ok: true,
        scope,
        project_id: projectId,
        atome_id: atomeId,
        event_count: eventCount,
        projection_count: applied.length
    };
}

export async function appendEvent(event, options = {}) {
    const normalized = normalizeEventInput(event, options);
    const payloadJson = serializeJson(normalized.payload);
    const actorJson = serializeJson(normalized.actor);
    const syncTarget = options.syncTarget || options.target_server || null;
    const skipQueue = options.skipQueue === true;
    let inserted = false;

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
        inserted = true;

        await applyEventToStateCurrent({
            ...normalized,
            payload: normalized.payload
        });
    });

    if (inserted && syncTarget && !skipQueue) {
        await enqueueSyncOperation({
            atome_id: normalized.atome_id,
            operation: 'events:commit',
            payload: normalized,
            target_server: syncTarget
        });
    }

    return normalized;
}

export async function appendEvents(events, options = {}) {
    if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
    }

    const results = [];
    const created = [];
    const txId = options.tx_id || options.txId || null;
    const syncTarget = options.syncTarget || options.target_server || null;
    const skipQueue = options.skipQueue === true;

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

            created.push(normalized);
            results.push(normalized);
        }
    });

    if (created.length && syncTarget && !skipQueue) {
        await Promise.all(created.map((normalized) => enqueueSyncOperation({
            atome_id: normalized.atome_id,
            operation: 'events:commit',
            payload: normalized,
            target_server: syncTarget
        })));
    }

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
    const row = await query(
        'get',
        `SELECT sc.*, a.atome_type, a.parent_id
         FROM state_current sc
         LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id = ?`,
        [atomeId]
    );
    if (!row) return null;
    return projectStoredStateCurrent(row);
}

export async function listStateCurrent(projectId, options = {}) {
    const limit = Number(options.limit) || 1000;
    const offset = Number(options.offset) || 0;
    const ownerId = options.ownerId || options.owner_id || null;
    const includeShared = options.includeShared === true || options.include_shared === true;

    const params = [];
    const conditions = [];

    if (projectId) {
        conditions.push('sc.project_id = ?');
        params.push(projectId);
    }

    if (ownerId) {
        if (includeShared) {
            // Include rows shared in realtime via permissions.
            conditions.push(`(
                COALESCE(sc.owner_id, a.owner_id) = ?
                OR (
                    p.principal_id = ?
                    AND (p.share_mode IS NULL OR LOWER(p.share_mode) IN ('real-time', 'realtime'))
                )
            )`);
            params.push(ownerId, ownerId);
        } else {
            // Match Tauri behavior: allow owner_id match or NULL (shared/legacy).
            conditions.push('(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)');
            params.push(ownerId);
        }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const join = includeShared && ownerId
        ? `LEFT JOIN atomes a ON a.atome_id = sc.atome_id
           LEFT JOIN permissions p ON p.atome_id = sc.atome_id
             AND p.principal_id = ?
             AND p.can_read = 1
             AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))`
        : 'LEFT JOIN atomes a ON a.atome_id = sc.atome_id';

    const rows = await query(
        'all',
        `SELECT sc.*, COALESCE(sc.owner_id, a.owner_id) AS owner_id FROM state_current sc ${join} ${where} ORDER BY sc.updated_at DESC LIMIT ? OFFSET ?`,
        includeShared && ownerId ? [ownerId, ...params, limit, offset] : [...params, limit, offset]
    );

    return (rows || []).map((row) => projectStoredStateCurrent(row)).filter(Boolean);
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

export async function restoreStateSnapshot(snapshotId, options = {}) {
    const snapshot = await getStateSnapshot(snapshotId);
    if (!snapshot) throw new Error('Snapshot not found');
    const txId = options.tx_id || options.txId || `snapshot_restore_${snapshotId}`;
    const events = buildStateSnapshotRestoreEvents(snapshot, options);
    if (!events.length) return [];
    return appendEvents(events, { txId });
}

// ============================================================================
// PERMISSIONS
// ============================================================================

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
    return await permissions.setPermission(
        atomeId,
        principalId,
        canRead,
        canWrite,
        canDelete,
        canShare,
        particleKey,
        grantedBy,
        options
    );
}

export async function canRead(atomeId, principalId, particleKey = null) {
    return await permissions.canRead(atomeId, principalId, particleKey);
}

export async function canWrite(atomeId, principalId, particleKey = null) {
    return await permissions.canWrite(atomeId, principalId, particleKey);
}

export async function canDelete(atomeId, principalId, particleKey = null) {
    return await permissions.canDelete(atomeId, principalId, particleKey);
}

export async function canShare(atomeId, principalId, particleKey = null) {
    return await permissions.canShare(atomeId, principalId, particleKey);
}

export async function canCreate(atomeId, principalId, particleKey = null) {
    return await permissions.canCreate(atomeId, principalId, particleKey);
}

// ============================================================================
// SYNC STATE + SYNC QUEUE — owned by adole_sync.js (durable sync surface)
// ============================================================================

const {
    getSyncState,
    updateSyncState,
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced
} = createAdoleSyncApi({ getAtome });

export {
    getSyncState,
    updateSyncState,
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced
};

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
    if (!getDatabase()) {
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
    restoreStateSnapshot,

    // Event log + projection
    appendEvent,
    appendEvents,
    listEvents,
    getEvent,
    rebuildStateCurrentFromEvents,
    getStateCurrent,
    listStateCurrent,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectUndoTransaction,
    selectRedoTransaction,
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,

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
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced,
    resolvePendingOwners,
    transferOwner,
    isAnonymousUser,

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
    getDataSourceAdapter,

    // Transactions
    withTransaction
};
