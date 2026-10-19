import test from 'node:test';
import assert from 'node:assert/strict';

import {
    tryApplyIncrementalProjectSceneRecord
} from '../../eVe/domains/rendering/project_scene_incremental_update_runtime.js';

// A YouTube/TV Atome stopped in place stayed invisible: the poster update, still
// fetching its texture, landed after the media-window update and put the stale
// render kind back. Incremental updates now wait their turn in the project's
// direct-mutation queue, so each one diffs against what the previous one drew.
test('an incremental record update waits for the pending direct mutations of its project', async () => {
    let release = null;
    const pending = new Promise((resolve) => { release = resolve; });
    const runtime = { project_id: 'p', directMutationQueue: pending, records: new Map() };
    let settled = false;
    const update = tryApplyIncrementalProjectSceneRecord({ runtime, record: { id: 'a', properties: {} } })
        .then((result) => { settled = true; return result; });

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled, false);
    assert.notEqual(runtime.directMutationQueue, pending);

    release();
    assert.equal(await update, null);
    assert.equal(settled, true);
});

test('an incremental update without a runtime resolves to the full-render fallback', async () => {
    assert.equal(await tryApplyIncrementalProjectSceneRecord({ record: { id: 'a' } }), null);
});

// A drawing stroke updates one atome every frame. Each update used to wait for the
// previous one's texture, so the queue (and the lag behind the Pencil) grew with
// the stroke. A newer record of the same atome now replaces the one still waiting.
test('a burst of updates of one atome collapses into its latest record', async () => {
    let release = null;
    const blocked = new Promise((resolve) => { release = resolve; });
    let runs = 0;
    const runtime = {
        project_id: 'p', directMutationQueue: blocked, records: new Map(), projection: null,
        renderScheduler: { getState: () => { runs += 1; return {}; } }
    };
    const burst = [1, 2, 3].map((version) => tryApplyIncrementalProjectSceneRecord({
        runtime, record: { id: 'stroke', properties: { version } }
    }));
    release();
    const results = await Promise.all(burst);
    assert.equal(runs, 1);
    // Only the latest caller may fall back to a full render with its record.
    assert.equal(results[2], null);
    assert.deepEqual(results.slice(0, 2), [{ ok: true, superseded: true }, { ok: true, superseded: true }]);
});

test('an update queued after another mutation is never folded before it', async () => {
    let release = null;
    const blocked = new Promise((resolve) => { release = resolve; });
    let runs = 0;
    const runtime = {
        project_id: 'p', directMutationQueue: blocked, records: new Map(),
        renderScheduler: { getState: () => { runs += 1; return {}; } }
    };
    const first = tryApplyIncrementalProjectSceneRecord({ runtime, record: { id: 'stroke', properties: { version: 1 } } });
    const { enqueueProjectSceneDirectMutation } = await import('../../eVe/domains/rendering/project_scene_state.js');
    const other = enqueueProjectSceneDirectMutation(runtime, () => 'motion');
    const second = tryApplyIncrementalProjectSceneRecord({ runtime, record: { id: 'stroke', properties: { version: 2 } } });
    release();
    assert.deepEqual(await Promise.all([first, other, second]), [null, 'motion', null]);
    assert.equal(runs, 2);
});
