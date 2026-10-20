// ============================================================================
// ADOLE ATOME WRITES — create / update / soft-delete atomes (ADOLE v3.0)
// ============================================================================
// Direct atome mutations; each keeps `state_current` aligned through the
// state projection owner.

import { v4 as uuidv4 } from 'uuid';
import { query } from './adole_db_core.js';
import { normalizeCanonicalAtome } from '../atome/src/shared/atome_contract.js';
import { setParticle, setParticles } from './adole_particles.js';
import { getAtome, getAtomeById } from './adole_atome_reads.js';
import { applyEventToStateCurrent, upsertStateCurrentFromMutation } from './adole_state_projection.js';

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
