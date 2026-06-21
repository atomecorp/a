import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import {
    createMoleculeNestedResolver,
    renderNestedMoleculePreview
} from '../../eVe/intuition/tools/molecule/nested/index.js';

// In-memory projectStore keyed by timeline_id (the resolver loads by timeline id).
const makeStore = (timelines) => ({
    loadTimeline: async (_projectId, timelineId) => {
        const tl = timelines.get(timelineId);
        if (!tl) throw new Error(`timeline ${timelineId} not found`);
        return tl;
    }
});

const childTimeline = () => {
    let tl = createTimeline({ timeline_id: 'tl_child', project_id: 'p', owner_atome_id: 'child' });
    tl = addTrack(tl, { track_id: 'tk', kind: 'video', name: 'v', order: 10 });
    tl = addClip(tl, { clip_id: 'c1', track_id: 'tk', kind: 'video', source: { type: 'atome', atome_id: 'a1' }, timeline: { start_seconds: 0, duration_seconds: 4, source_in_seconds: 0, source_out_seconds: 4 } });
    tl = addClip(tl, { clip_id: 'c2', track_id: 'tk', kind: 'video', source: { type: 'atome', atome_id: 'a2' }, timeline: { start_seconds: 4, duration_seconds: 4, source_in_seconds: 0, source_out_seconds: 4 } });
    return tl;
};

const parentClipRef = {
    clip_id: 'nest', track_id: 'tk', kind: 'group',
    source: { type: 'molecule_ref', timeline_id: 'tl_child' },
    timeline: { start_seconds: 10, duration_seconds: 6, source_in_seconds: 2, source_out_seconds: 8 }
};

test('nested resolver loads the referenced timeline', async () => {
    const store = makeStore(new Map([['tl_child', childTimeline()]]));
    const resolver = createMoleculeNestedResolver({ projectStore: store, projectId: 'p' });
    const resolved = await resolver.resolveNestedTimeline({ parentTimelineId: 'tl_parent', source: parentClipRef.source });
    assert.equal(resolved.timeline.timeline_id, 'tl_child');
    assert.equal(resolved.source.timeline_id, 'tl_child');
});

test('nested resolver rejects cycles', async () => {
    // child references the parent -> resolving parent's nested child must reject.
    const child = childTimeline();
    child.clips.push({ clip_id: 'back', track_id: 'tk', kind: 'group', source: { type: 'molecule_ref', timeline_id: 'tl_parent' }, timeline: { start_seconds: 0, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 } });
    const store = makeStore(new Map([['tl_child', child]]));
    const resolver = createMoleculeNestedResolver({ projectStore: store, projectId: 'p' });
    await assert.rejects(
        () => resolver.resolveNestedTimeline({ parentTimelineId: 'tl_parent', source: parentClipRef.source }),
        (err) => err.code === 'molecule_nested/cycle_rejected'
    );
});

test('nested preview windows child clips into the parent clip range', () => {
    // parent window is source_in 2 .. source_out 8 at parent_start 10.
    const preview = renderNestedMoleculePreview({ parentClip: parentClipRef, nestedTimeline: childTimeline() });
    assert.equal(preview.type, 'nested_molecule_preview');
    assert.equal(preview.nested_timeline_id, 'tl_child');
    // c1 (0..4) overlaps window 2..4 -> nested 2..4; mapped to parent 10 + (2-2)=10
    const c1 = preview.clips.find((c) => c.clip_id === 'c1');
    assert.equal(c1.nested_start_seconds, 2);
    assert.equal(c1.nested_duration_seconds, 2);
    assert.equal(c1.parent_start_seconds, 10);
    // c2 (4..8) overlaps window 4..8 -> nested 4..8; mapped to parent 10 + (4-2)=12
    const c2 = preview.clips.find((c) => c.clip_id === 'c2');
    assert.equal(c2.nested_start_seconds, 4);
    assert.equal(c2.parent_start_seconds, 12);
});
