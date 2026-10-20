// ============================================================================
// ADOLE ATOME READS — atome rows, ownership lookup and listings (ADOLE v3.0)
// ============================================================================
// Read side of the `atomes` table: single atome hydration, owner/accessible
// listings and batched particle hydration. `getEffectiveOwnerId` is shared
// with the permission and privacy-rule owners.

import { query } from './adole_db_core.js';
import { projectStoredAtome } from './adole_storage_projection.js';

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

export async function getEffectiveOwnerId(atomeId) {
    const atome = await query(
        'get',
        'SELECT owner_id FROM atomes WHERE atome_id = ?',
        [atomeId]
    );
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
        "SELECT particle_key, particle_value, value_type FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
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

    return await hydrateStoredAtomes(atomes);
}

// Particle loading for a batch of already-fetched rows.
//
// The previous shape called getAtome(id) per row, and getAtome re-reads the
// `atomes` row the caller already holds before reading its particles: a listing
// of 100 atomes cost 1 + 100x2 = 201 sequential SQLite round-trips, each with a
// fresh `prepare()`. One `IN (...)` query returns every particle instead, and the
// rows in hand are reused. Chunked to stay under SQLite's bound-parameter limit.
const PARTICLE_FETCH_CHUNK = 400;

async function hydrateStoredAtomes(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row?.atome_id) : [];
    if (!list.length) return [];

    const propertiesById = new Map();
    const kindById = new Map();
    for (let offset = 0; offset < list.length; offset += PARTICLE_FETCH_CHUNK) {
        const ids = list.slice(offset, offset + PARTICLE_FETCH_CHUNK).map((row) => row.atome_id);
        const particles = await query('all',
            `SELECT atome_id, particle_key, particle_value FROM particles
             WHERE atome_id IN (${ids.map(() => '?').join(', ')}) AND value_type != 'deleted'`,
            ids
        );
        for (const particle of particles || []) {
            let value;
            try { value = JSON.parse(particle.particle_value); } catch { value = particle.particle_value; }
            if (particle.particle_key === 'kind') { kindById.set(particle.atome_id, value); continue; }
            let bucket = propertiesById.get(particle.atome_id);
            if (!bucket) { bucket = {}; propertiesById.set(particle.atome_id, bucket); }
            bucket[particle.particle_key] = value;
        }
    }

    const result = [];
    for (const row of list) {
        const projected = projectStoredAtome({
            row,
            properties: propertiesById.get(row.atome_id) || {},
            kind: kindById.get(row.atome_id) ?? null
        });
        if (projected) result.push(projected);
    }
    return result;
}
