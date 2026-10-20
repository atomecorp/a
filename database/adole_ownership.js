// ============================================================================
// ADOLE OWNERSHIP — deferred owner/parent references + owner transfer (ADOLE v3.0)
// ============================================================================
// Resolves `_pending_owner_id` / `_pending_parent_id` particles once their
// targets exist, and transfers ownership (including guest workspace adoption).

import { query, safeParseJson, withTransaction } from './adole_db_core.js';

/**
 * Resolve pending owner_id references after sync
 * This fixes atomes that were created with NULL owner_id due to FK constraints
 */
export async function resolvePendingOwners(targetId = null) {
    const now = new Date().toISOString();

    // Find all atomes with deferred FK references
    const pending = await query('all', `
		SELECT p.atome_id, p.particle_key, p.particle_value
		FROM particles p
		WHERE p.particle_key IN ('_pending_owner_id', '_pending_parent_id')
		${targetId ? 'AND p.particle_value = ?' : ''}
	`, targetId ? [JSON.stringify(String(targetId))] : []);

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

function adoptionDigest(operationId) {
    return operationId ? String(operationId) : null;
}

export async function isGuestWorkspacePrincipal(userId) {
    if (!userId) return false;
    const record = await query('get', `SELECT status FROM guest_workspace_principals
        WHERE guest_principal_id = ? LIMIT 1`, [String(userId)]);
    return record?.status === 'active';
}

export async function transferOwner({ fromOwnerId, toOwnerId, includeCreator = true, operationId = null } = {}) {
    if (!fromOwnerId || !toOwnerId) {
        throw new Error('Missing fromOwnerId or toOwnerId');
    }
    if (String(fromOwnerId) === String(toOwnerId)) {
        return { updated: 0 };
    }

    const pendingOwner = JSON.stringify(fromOwnerId);
    const guestWorkspace = await isGuestWorkspacePrincipal(fromOwnerId);
    const digest = adoptionDigest(operationId);
    if (guestWorkspace && !digest) throw new Error('guest_adoption_operation_required');
    if (guestWorkspace) {
        const existing = await query('get', `SELECT status, adopted_principal_id FROM guest_workspace_principals
            WHERE guest_principal_id = ? AND adoption_operation_digest = ?`, [fromOwnerId, digest]);
        if (existing?.status === 'adopted') {
            if (String(existing.adopted_principal_id) !== String(toOwnerId)) throw new Error('guest_adoption_operation_conflict');
            return { updated: 0, replayed: true, adopted: true };
        }
    }
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
        WHERE a.atome_id != ? AND a.atome_type NOT IN ('user', 'guest_workspace')
          AND (a.owner_id = ?${creatorClause} OR (a.owner_id IS NULL AND p.particle_value = ?))
    `, [fromOwnerId, ...params]);

    const ids = (rows || []).map((row) => row.atome_id).filter(Boolean);
    if (!ids.length) {
        if (guestWorkspace) {
            await withTransaction(async () => {
                await query('run', `UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?,
                    adoption_operation_digest = ?, adopted_at = ? WHERE guest_principal_id = ? AND status = 'active'`,
                [toOwnerId, digest, new Date().toISOString(), fromOwnerId]);
            });
        }
        return { updated: 0, adopted: guestWorkspace };
    }

    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(', ');

    await withTransaction(async () => {
        await query(
            'run',
            `UPDATE atomes SET owner_id = ?, creator_id = CASE WHEN ? THEN ? ELSE creator_id END,
             updated_at = ?, sync_status = 'pending' WHERE atome_id IN (${placeholders})`,
            [toOwnerId, includeCreator ? 1 : 0, toOwnerId, now, ...ids]
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
        if (guestWorkspace) {
            await query('run', `UPDATE permissions SET principal_id = ? WHERE principal_id = ?`, [toOwnerId, fromOwnerId]);
            await query('run', `UPDATE permissions SET granted_by = ? WHERE granted_by = ?`, [toOwnerId, fromOwnerId]);
            await query('run', `UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?,
                adoption_operation_digest = ?, adopted_at = ? WHERE guest_principal_id = ? AND status = 'active'`,
            [toOwnerId, digest, now, fromOwnerId]);
        }
    });

    return { updated: ids.length, adopted: guestWorkspace };
}
