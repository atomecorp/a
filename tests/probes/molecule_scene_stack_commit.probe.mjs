import assert from 'node:assert/strict';

import { createProjectSceneMutationRuntime } from '../../eVe/domains/rendering/project_scene_mutation_runtime.js';

const previousWindow = globalThis.window;
const committed = [];
const updated = [];
const runtime = { project_id: 'project_1' };

try {
    globalThis.window = {
        Atome: {
            commitBatch: async (events) => {
                committed.push(...events);
                return { ok: true };
            }
        }
    };
    const mutation = createProjectSceneMutationRuntime({
        getGestureRuntime: () => ({
            flushGesture: async () => null,
            renderNow: async () => ({ ok: true })
        }),
        updateRecord: (_runtime, atomeId, props) => updated.push({ atomeId, props })
    });
    await mutation.commitTargetMutations(runtime, {
        kind: 'record.commit',
        atome_id: 'molecule_member',
        props: { z_index: 7, zIndex: 7 },
        commit: true
    });

    assert.deepEqual(committed, [{
        kind: 'set',
        atome_id: 'molecule_member',
        project_id: 'project_1',
        props: { z_index: 7, zIndex: 7 }
    }]);
    assert.deepEqual(updated, [{
        atomeId: 'molecule_member',
        props: { z_index: 7, zIndex: 7 }
    }]);

} finally {
    globalThis.window = previousWindow;
}

console.log('molecule scene stack commit probe: OK');
