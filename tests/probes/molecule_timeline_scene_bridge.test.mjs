import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline,
    deleteClip,
    setPlayhead
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeTimelineSceneBridge } from '../../eVe/intuition/runtime/molecule_timeline_scene_bridge.js';

const buildTimeline = () => {
    let timeline = createTimeline({ timeline_id: 'tl_b', project_id: 'proj_b', owner_atome_id: 'grp_b' });
    timeline = addTrack(timeline, { track_id: 'track_video', kind: 'video', name: 'video', order: 10 });
    timeline = addClip(timeline, {
        clip_id: 'clip_a', track_id: 'track_video', kind: 'video',
        source: { type: 'atome', atome_id: 'atome_a' },
        timeline: { start_seconds: 0, duration_seconds: 4, source_in_seconds: 0, source_out_seconds: 4 }
    });
    timeline = addClip(timeline, {
        clip_id: 'clip_b', track_id: 'track_video', kind: 'video',
        source: { type: 'atome', atome_id: 'atome_b' },
        timeline: { start_seconds: 5, duration_seconds: 3, source_in_seconds: 0, source_out_seconds: 3 }
    });
    return timeline;
};

const makeBridge = () => {
    const calls = [];
    const ops = [];
    let interceptor = null;
    const bridge = createMoleculeTimelineSceneBridge({
        updateRecords: async (payload) => { calls.push(payload); return { ok: true }; },
        applyTimelineOperation: async (detail) => { ops.push(detail); return { ok: true }; },
        registerCommitInterceptor: (fn) => { interceptor = fn; return fn; }
    });
    return { bridge, calls, ops, getInterceptor: () => interceptor };
};

test('render pushes lane/clip/playhead records and tracks them per project', async () => {
    const { bridge, calls } = makeBridge();
    const result = await bridge.render({ projectId: 'proj_b', timeline: buildTimeline() });

    assert.equal(result.ok, true);
    assert.equal(result.node_count, calls[0].records.length);
    assert.ok(result.record_ids.includes('mol:lane:track_video'));
    assert.ok(result.record_ids.includes('mol:clip:clip_a'));
    assert.ok(result.record_ids.includes('mol:clip:clip_b'));
    assert.ok(result.record_ids.includes('mol:playhead'));
    assert.deepEqual(calls[0].removeAtomeIds, [], 'first frame removes nothing');
    assert.deepEqual(bridge.getRenderedIds('proj_b').sort(), result.record_ids.slice().sort());
});

test('re-render reconciles removed clips as stale record removals', async () => {
    const { bridge, calls } = makeBridge();
    const timeline = buildTimeline();
    await bridge.render({ projectId: 'proj_b', timeline });

    const fewer = deleteClip(timeline, { clip_id: 'clip_b' });
    const result = await bridge.render({ projectId: 'proj_b', timeline: fewer });

    assert.deepEqual(result.removed_ids, ['mol:clip:clip_b'], 'dropped clip is removed from the scene');
    assert.deepEqual(calls[1].removeAtomeIds, ['mol:clip:clip_b']);
    assert.ok(!bridge.getRenderedIds('proj_b').includes('mol:clip:clip_b'));
});

test('scrub re-render keeps the same record set (only the playhead moves)', async () => {
    const { bridge } = makeBridge();
    const timeline = buildTimeline();
    await bridge.render({ projectId: 'proj_b', timeline });
    const scrubbed = setPlayhead(timeline, { playhead_seconds: 6 });
    const result = await bridge.render({ projectId: 'proj_b', timeline: scrubbed });

    assert.deepEqual(result.removed_ids, [], 'scrub adds/removes no records');
    assert.ok(result.record_ids.includes('mol:playhead'));
});

test('a canvas clip drag is translated into a clip.move (px -> seconds) and skips the generic commit', async () => {
    const { bridge, ops, getInterceptor } = makeBridge();
    await bridge.render({ projectId: 'proj_b', timeline: buildTimeline() }); // 80 px/s default

    // The render registered the interceptor; simulate a drag.end on a clip block.
    const handled = await getInterceptor()({
        kind: 'drag.end',
        commit: true,
        targets: [{ atome_id: 'mol:clip:clip_a', props: { left: 560, top: 4 } }]
    });

    assert.equal(handled, true, 'the bridge claims the clip drag so the generic atome commit is skipped');
    assert.deepEqual(ops, [{ operation: 'clip.move', command: { clip_id: 'clip_a', start_seconds: 7 } }]);
});

test('the interceptor ignores drags that touch no clip records', async () => {
    const { bridge, ops, getInterceptor } = makeBridge();
    await bridge.render({ projectId: 'proj_b', timeline: buildTimeline() });
    const handled = await getInterceptor()({
        kind: 'drag.end', commit: true,
        targets: [{ atome_id: 'real_atome_123', props: { left: 100, top: 50 } }]
    });
    assert.equal(handled, false, 'real atome drags fall through to the generic commit');
    assert.deepEqual(ops, []);
});

test('clear removes every tracked record for the project', async () => {
    const { bridge, calls } = makeBridge();
    await bridge.render({ projectId: 'proj_b', timeline: buildTimeline() });
    const cleared = await bridge.clear({ projectId: 'proj_b' });

    assert.equal(cleared.cleared, 4, '1 lane + 2 clips + 1 playhead cleared');
    assert.equal(calls[1].records.length, 0);
    assert.ok(calls[1].removeAtomeIds.includes('mol:playhead'));
    assert.deepEqual(bridge.getRenderedIds('proj_b'), []);
});
