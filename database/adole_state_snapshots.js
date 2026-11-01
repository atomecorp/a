// ============================================================================
// ADOLE STATE SNAPSHOTS — state_current snapshots + event restore (ADOLE v3.0)
// ============================================================================
// Explicit project/atome snapshots of the projection. Restore replays
// through the canonical appendEvents pipeline, never a direct state write.

import { query, safeParseJson, serializeJson } from './adole_db_core.js';
import { buildStateSnapshotRestoreEvents } from './state_snapshot_restore.js';
import { listStateCurrent, getEvent } from './adole_event_state_reads.js';
import { appendEvents } from './adole_event_log.js';

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

// A snapshot asked once: its record and its `snapshot` event. A device's outbox may send it
// again (its answer lost); the event id names it once, so the resend gets the same snapshot.
// `commitEvent` is the caller's canonical event commit (the server's or the vault's).
export async function createStateSnapshotOnce(request, actor, commitEvent) {
    const known = request.event_id ? await getEvent(request.event_id) : null;
    if (known) {
        if (known.kind !== 'snapshot' || String(known.actor?.id) !== String(actor.id)) throw new Error('event_id_conflict');
        return { snapshot_id: known.payload?.snapshot_id ?? null };
    }
    const snapshotId = await createStateSnapshot({ projectId: request.project_id, atomeId: request.atome_id, label: request.label,
        actor, state: request.state, snapshotType: request.snapshot_type });
    await commitEvent({ ...(request.event_id ? { id: request.event_id } : {}), ...(request.ts ? { ts: request.ts } : {}),
        kind: 'snapshot', atome_id: request.atome_id || request.project_id, project_id: request.project_id, actor,
        payload: { snapshot_id: snapshotId, label: request.label } });
    return { snapshot_id: snapshotId };
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
    // A restore writes back stored truth: history, never re-validated (adole_event_log.js#assertEventProperties).
    return appendEvents(events, { txId, storedTruth: true });
}
