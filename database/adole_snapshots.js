// ============================================================================
// ADOLE SNAPSHOTS — manual atome snapshots + snapshot restore (ADOLE v3.0)
// ============================================================================
// Legacy snapshot surface. Restore goes through the canonical event pipeline
// (appendEvent), never a direct state write, so `appendEvent` and `getAtome`
// are injected to avoid a cycle with their owning modules.

import { query, safeParseJson } from './adole_db_core.js';

function parseSnapshotData(snapshotData) {
    const data = safeParseJson(snapshotData);
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid snapshot data');
    }
    return data;
}

function resolveSnapshotRestoreActor(author, snapshot) {
    if (author && typeof author === 'object') return author;
    if (typeof author === 'string' && author.trim()) return { id: author };
    const snapshotActor = safeParseJson(snapshot?.actor);
    if (snapshotActor && typeof snapshotActor === 'object') return snapshotActor;
    if (snapshot?.created_by) return { id: snapshot.created_by };
    return null;
}

function selectSnapshotProperties(data) {
    const candidates = [data?.properties, data?.data, data?.particles];
    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            return candidate;
        }
    }
    return {};
}

function buildSnapshotRestorePatch(snapshot, data) {
    const properties = selectSnapshotProperties(data);
    const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
    const patch = { ...properties };
    const atomeType = data.type || data.atome_type || null;
    const parentId =
        meta.parent_id ||
        meta.parentId ||
        data.parent_id ||
        data.parentId ||
        properties.parent_id ||
        properties.parentId ||
        null;
    const projectId =
        meta.project_id ||
        meta.projectId ||
        data.project_id ||
        data.projectId ||
        properties.project_id ||
        properties.projectId ||
        snapshot.project_id ||
        null;
    const ownerId =
        meta.owner_id ||
        meta.ownerId ||
        data.owner_id ||
        data.ownerId ||
        properties.owner_id ||
        properties.ownerId ||
        snapshot.created_by ||
        null;

    if (atomeType) patch.type = atomeType;
    if (parentId) patch.parent_id = parentId;
    if (projectId) patch.project_id = projectId;
    if (ownerId) patch.owner_id = ownerId;

    return { patch, projectId };
}

export function createAdoleSnapshotsApi({ getAtome, appendEvent }) {
    async function createSnapshot(atomeId, createdBy = null) {
        const atome = await getAtome(atomeId);
        if (!atome) throw new Error('Atome not found');

        const snapshotData = JSON.stringify(atome);
        const now = new Date().toISOString();

        await query('run', `
		INSERT INTO snapshots (atome_id, snapshot_data, snapshot_type, created_by, created_at)
		VALUES (?, ?, 'manual', ?, ?)
	`, [atomeId, snapshotData, createdBy, now]);

        const inserted = await query('get',
            'SELECT snapshot_id FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT 1',
            [atomeId]
        );

        return inserted?.snapshot_id;
    }

    async function getSnapshots(atomeId, limit = 10) {
        return await query('all', `
		SELECT * FROM snapshots WHERE atome_id = ? ORDER BY created_at DESC LIMIT ?
	`, [atomeId, limit]);
    }

    async function restoreSnapshot(snapshotId, author = null, options = {}) {
        const snap = await query('get',
            'SELECT * FROM snapshots WHERE snapshot_id = ?',
            [snapshotId]
        );
        if (!snap) throw new Error('Snapshot not found');

        const data = parseSnapshotData(snap.snapshot_data);
        const actor = resolveSnapshotRestoreActor(author, snap);
        const txId = options.tx_id || options.txId || `legacy_snapshot_restore_${snapshotId}`;
        const { patch, projectId } = buildSnapshotRestorePatch(snap, data);
        await appendEvent({
            kind: 'set',
            atome_id: snap.atome_id,
            project_id: projectId,
            actor,
            payload: {
                props: patch
            }
        }, { txId });

        return data;
    }

    return { createSnapshot, getSnapshots, restoreSnapshot };
}
