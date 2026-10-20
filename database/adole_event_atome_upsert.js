// ============================================================================
// ADOLE EVENT ATOME UPSERT — atome row + particles from a projected event
// ============================================================================
// Applies the structural envelope (type, parent, owner, deletion) of an event
// to the `atomes` row, deferring missing FK targets to pending particles.

import { query } from './adole_db_core.js';
import { setParticle, setParticles } from './adole_particles.js';

export async function upsertAtomeFromEvent({
    atomeId,
    atomeType,
    parentId,
    ownerId,
    ts,
    deleted,
    restored,
    properties,
    writeParticles = true,
    eventId = null
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
            await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, ownerId || null, { eventId, timestamp: now });
        }
        if (pendingParentId && writeParticles) {
            await setParticle(atomeId, '_pending_parent_id', pendingParentId, ownerId || null, { eventId, timestamp: now });
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
        // An explicit event parent replaces the current parent. Membership lives
        // in this column as structural envelope data, not as an ordinary particle.
        if (parentId && parentId !== atomeId && parentId !== existing.parent_id) {
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
        } else if (restored) {
            updates.push('deleted_at = ?');
            values.push(null);
        }
        if (updates.length > 0) {
            updates.push('updated_at = ?');
            values.push(now);
            values.push(atomeId);
            await query('run', `UPDATE atomes SET ${updates.join(', ')} WHERE atome_id = ?`, values);
        }
        if (pendingOwnerId && writeParticles) {
            await setParticle(atomeId, '_pending_owner_id', pendingOwnerId, ownerId || null, { eventId, timestamp: now });
        } else if (writeParticles && (assignedOwnerId || existing.owner_id)) {
            await query(
                'run',
                "DELETE FROM particles WHERE atome_id = ? AND particle_key = '_pending_owner_id'",
                [atomeId]
            );
        }
        if (pendingParentId && writeParticles) {
            await setParticle(atomeId, '_pending_parent_id', pendingParentId, ownerId || null, { eventId, timestamp: now });
        } else if (writeParticles && (assignedParentId || existing.parent_id)) {
            await query(
                'run',
                "DELETE FROM particles WHERE atome_id = ? AND particle_key = '_pending_parent_id'",
                [atomeId]
            );
        }
    }

    if (writeParticles && properties && Object.keys(properties).length > 0) {
        await setParticles(atomeId, properties, ownerId || null, { eventId, timestamp: now });
    }
}
