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
