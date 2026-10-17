// `molecule.clip.join` (todo/timeline v1.6 §3.6): the exact inverse of split;
// anything that would invent material is refused.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addClip, createTimeline, joinClips, setClipFades, splitClip, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const RATE = 48000;
const fixture = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 20 * RATE });
    timeline = addClip(timeline, {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_seconds: 1, duration_seconds: 4, source_in_seconds: 0.5, source_out_seconds: 4.5 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    return setClipFades(timeline, { clip_id: 'c', in_frames: 480, out_frames: 960 });
};
const frames = (clip) => [clip.timeline.start_frame, clip.timeline.duration_frames, clip.timeline.source_in_frame, clip.timeline.source_out_frame];

test('split then join gives back the original block, fades included', () => {
    const original = fixture();
    const split = splitClip(original, { clip_id: 'c', at_seconds: 2.37, left_clip_id: 'l', right_clip_id: 'r' });
    const joined = joinClips(split, { left_clip_id: 'l', right_clip_id: 'r' });
    assert.equal(joined.clips.length, 1);
    assert.deepEqual(frames(joined.clips[0]), frames(original.clips[0]));
    assert.deepEqual(joined.clips[0].fades, { in_frames: 480, out_frames: 960 });
    assert.equal(joined.clips[0].clip_id, 'l');
});

test('a gap, another source or a source jump is refused', () => {
    const split = splitClip(fixture(), { clip_id: 'c', at_seconds: 3, left_clip_id: 'l', right_clip_id: 'r' });
    assert.throws(() => joinClips(split, { left_clip_id: 'r', right_clip_id: 'l' }), /not adjacent/);
    const other = addClip(split, {
        clip_id: 'x', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'b' },
        timeline: { start_seconds: 5, duration_seconds: 1, source_in_seconds: 0, source_out_seconds: 1 }
    });
    assert.throws(() => joinClips(other, { left_clip_id: 'r', right_clip_id: 'x' }), /different sources/);
});

test('session: clip.join is a durable operation reachable by its verb', async () => {
    const session = createMoleculeSession({ timeline: splitClip(fixture(), { clip_id: 'c', at_seconds: 3, left_clip_id: 'l', right_clip_id: 'r' }), eventSink: { append: async (event) => event } });
    await session.apply('eve.timeline.clip.join', { left_clip_id: 'l', right_clip_id: 'r' });
    assert.equal(session.getState().clips.length, 1);
});
