import { sanitizeAtomeProperties } from '../atome/src/shared/atome_contract.js';

function normalizeStateSnapshotRecords(stateBlob) {
    if (Array.isArray(stateBlob)) return stateBlob;
    if (!stateBlob || typeof stateBlob !== 'object') return [];
    if (Array.isArray(stateBlob.records)) return stateBlob.records;
    if (Array.isArray(stateBlob.states)) return stateBlob.states;
    if (Array.isArray(stateBlob.state_current)) return stateBlob.state_current;
    return [];
}

export function buildStateSnapshotRestoreEvents(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Snapshot is required');
    }
    const actor = options.actor ?? snapshot.actor ?? null;
    return normalizeStateSnapshotRecords(snapshot.state_blob)
        .map((record) => {
            const atomeId = record?.atome_id || record?.atomeId || record?.id || null;
            if (!atomeId) return null;
            return {
                kind: 'set',
                atome_id: atomeId,
                project_id: record?.project_id || record?.projectId || snapshot.project_id || null,
                actor,
                payload: {
                    props: sanitizeAtomeProperties(
                        record?.properties && typeof record.properties === 'object'
                            ? record.properties
                            : {}
                    )
                }
            };
        })
        .filter(Boolean);
}
