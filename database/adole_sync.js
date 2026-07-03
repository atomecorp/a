// ============================================================================
// ADOLE SYNC — sync state + durable sync queue (ADOLE v3.0)
// ============================================================================
// Owns the `sync_state` and `sync_queue` tables. Pure SQL over the shared
// db-core `query`. `getPendingForSync` hydrates atomes, so `getAtome` is
// injected to keep this module free of a cycle with the atome-operations owner.

import { query, serializeJson } from './adole_db_core.js';

export function createAdoleSyncApi({ getAtome }) {
    async function getSyncState(atomeId) {
        return await query('get', 'SELECT * FROM sync_state WHERE atome_id = ?', [atomeId]);
    }

    async function updateSyncState(atomeId, localHash = null, remoteHash = null, syncStatus = 'synced') {
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

    async function enqueueSyncOperation({ atome_id, operation, payload, target_server }) {
        if (!target_server) return null;
        const now = new Date().toISOString();
        const payloadJson = serializeJson(payload);
        const result = await query(
            'run',
            `INSERT INTO sync_queue (atome_id, operation, payload, target_server, status, attempts, max_attempts, created_at)
         VALUES (?, ?, ?, ?, 'pending', 0, 5, ?)`,
            [atome_id || null, operation || 'events:commit', payloadJson, target_server, now]
        );
        return result;
    }

    async function listSyncQueue({ target_server, limit = 50 } = {}) {
        const now = new Date().toISOString();
        return await query(
            'all',
            `SELECT * FROM sync_queue
         WHERE status IN ('pending', 'error')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
           AND (? IS NULL OR target_server = ?)
         ORDER BY created_at ASC
         LIMIT ?`,
            [now, target_server || null, target_server || null, limit]
        );
    }

    async function markSyncQueueSyncing(queueId, attempts) {
        const now = new Date().toISOString();
        await query(
            'run',
            `UPDATE sync_queue
         SET status = 'syncing', attempts = ?, last_attempt_at = ?
         WHERE queue_id = ?`,
            [attempts, now, queueId]
        );
    }

    async function markSyncQueueError(queueId, attempts, errorMessage, nextRetryAt, final = false) {
        const status = final ? 'failed' : 'error';
        await query(
            'run',
            `UPDATE sync_queue
         SET status = ?, attempts = ?, error_message = ?, next_retry_at = ?
         WHERE queue_id = ?`,
            [status, attempts, errorMessage || null, nextRetryAt || null, queueId]
        );
    }

    async function markSyncQueueDone(queueId) {
        await query('run', 'DELETE FROM sync_queue WHERE queue_id = ?', [queueId]);
    }

    async function getPendingForSync(ownerId) {
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

    async function markAsSynced(atomeIds) {
        const now = new Date().toISOString();
        for (const id of atomeIds) {
            await query('run',
                'UPDATE atomes SET sync_status = ?, last_sync = ? WHERE atome_id = ?',
                ['synced', now, id]
            );
        }
    }

    return {
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
}
