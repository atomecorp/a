// ============================================================================
// ADOLE PARTICLES — live particles + particles_versions history (ADOLE v3.0)
// ============================================================================
// Owns writes and reads of the `particles` table and its append-only
// `particles_versions` history. Depends only on db-core and the atome contract.

import { query } from './adole_db_core.js';
import { assertCanonicalPropertyKey, sanitizeAtomeProperties } from '../atome/src/shared/atome_contract.js';

// ============================================================================
// PARTICLE OPERATIONS (ADOLE v3.0)
// ============================================================================

/**
 * Set a particle on an atome (creates or updates)
 * Also records the change in particles_versions for history
 */
export async function setParticle(atomeId, key, value, author = null, metadata = {}) {
    const propertyKey = assertCanonicalPropertyKey(key);
    const now = metadata.timestamp || new Date().toISOString();
    const eventId = metadata.eventId || null;
    const valueStr = JSON.stringify(value);
    const valueType = typeof value === 'object' ? 'json' : typeof value;

    // One read: the old value is needed for history anyway, so selecting it here
    // removes the second round-trip that used to re-read the same row below.
    const existing = await query('get',
        'SELECT particle_id, version, particle_value FROM particles WHERE atome_id = ? AND particle_key = ?',
        [atomeId, propertyKey]
    );

    // A write that changes nothing is not history. Without this guard every
    // re-commit of an unchanged property appended a particles_versions row (and
    // flipped the atome back to sync_status='pending'), which is what grew that
    // table to 1.59M rows / 485MB for 27k real particles. Returning early skips
    // the UPDATE, the history INSERT and the atome touch — correct, since with
    // no change there is nothing to replicate either.
    if (existing && existing.particle_value === valueStr) {
        return { particleId: existing.particle_id, version: existing.version, unchanged: true };
    }

    let particleId;
    let version;
    let oldValue = null;

    if (existing) {
        oldValue = existing.particle_value || null;

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
		INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at, event_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, [particleId, atomeId, propertyKey, version, oldValue, valueStr, author, now, eventId]);

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
export async function setParticles(atomeId, particles, author = null, metadata = {}) {
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
            await setParticle(atomeId, key, value, author, metadata);
        }
        return;
    }

    // For larger batches, use optimized batch operations
    const now = metadata.timestamp || new Date().toISOString();
    const eventId = metadata.eventId || null;

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
        const valueStr = JSON.stringify(value);
        const valueType = typeof value === 'object' ? 'json' : typeof value;
        const existing = existingMap.get(key);

        if (existing) {
            // Same no-op guard as setParticle: an unchanged key contributes
            // neither an UPDATE nor a history row.
            if (existing.particle_value === valueStr) continue;
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
            INSERT INTO particles_versions (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at, event_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [record.particleId, atomeId, record.key, record.version, record.oldValue, record.newValue, author, now, eventId]);
    }

    // Nothing actually changed: leave the atome's sync_status alone rather than
    // re-flagging it as pending for a write that never happened.
    if (!toUpdate.length && !toInsert.length && !historyRecords.length) return;

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
        "SELECT particle_value, value_type FROM particles WHERE atome_id = ? AND particle_key = ?",
        [atomeId, key]
    );
    if (!row || row.value_type === 'deleted') return null;
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
        "SELECT particle_key, particle_value FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
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
