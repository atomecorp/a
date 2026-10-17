// Scenes and cells kernel (todo/timeline v1.6 §1 bis, §3): Scenes are time
// ranges, cells live references; every cell edit is an exact, non-destructive
// timeline edit.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addClip, addScene, clearCell, createTimeline, moveScene, placeCell, readCellSettings, removeScene, setCellSettings, setClipFades, updateSection
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const RATE = 48000;
const fixture = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 10 * RATE });
    // One clip across both Scenes: 1 s .. 3 s of the timeline, source 0 .. 2 s.
    timeline = addClip(timeline, {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_seconds: 1, duration_seconds: 2, source_in_seconds: 0, source_out_seconds: 2 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    timeline = addScene(timeline, { scene_id: 'A', name: 'A', start_frame: 0, duration_frames: 2 * RATE });
    return addScene(timeline, { scene_id: 'B', name: 'B', start_frame: 2 * RATE, duration_frames: 2 * RATE });
};
const frames = (timeline) => timeline.clips.map((clip) => [clip.clip_id, clip.timeline.start_frame, clip.timeline.duration_frames, clip.timeline.source_in_frame]);

test('Scenes are non-overlapping ranges of the Scenes band', () => {
    assert.throws(() => addScene(fixture(), { scene_id: 'X', start_frame: RATE, duration_frames: RATE }), /overlaps/);
    assert.throws(() => addScene(fixture(), { scene_id: 'A', start_frame: 9 * RATE, duration_frames: RATE }), /already exists/);
});

test('cell settings: only the named ones change, in batch; null resets or means infinite', () => {
    let timeline = setCellSettings(fixture(), { cells: [{ scene_id: 'A', track_id: 't' }, { scene_id: 'B', track_id: 't' }], settings: { passes: 2, fade_in_ms: 1 } });
    timeline = setCellSettings(timeline, { scene_id: 'B', track_id: 't', settings: { play_mode: 'loop', passes: null } });
    assert.deepEqual([readCellSettings(timeline, 'A', 't').passes, readCellSettings(timeline, 'A', 't').fade_in_ms], [2, 1]);
    assert.deepEqual([readCellSettings(timeline, 'B', 't').play_mode, readCellSettings(timeline, 'B', 't').passes, readCellSettings(timeline, 'B', 't').fade_in_ms], ['loop', null, 1]);
    timeline = setCellSettings(timeline, { scene_id: 'B', track_id: 't', settings: { fade_in_ms: null } });
    assert.equal(readCellSettings(timeline, 'B', 't').fade_in_ms, 0, 'null returns a setting to its default');
    assert.throws(() => setCellSettings(timeline, { scene_id: 'A', settings: { quantize_start: 'often' } }), /quantization/);
    timeline = setCellSettings(timeline, { scene_id: 'A', settings: { follow_action: { type: 'target', target_scene_id: 'B' } } });
    assert.throws(() => removeScene(timeline, { scene_id: 'B' }), /Follow Action/);
    assert.equal(removeScene(timeline, { scene_id: 'A' }).cells.some((cell) => cell.scene_id === 'A'), false, 'its cells go with the Scene');
});

test('clearing a cell leaves an exact virtual hole; the source window stays recoverable', () => {
    const timeline = clearCell(setClipFades(fixture(), { clip_id: 'c', in_frames: 480, out_frames: 960 }), { scene_id: 'A', track_id: 't' });
    assert.deepEqual(frames(timeline), [[`c~R${2 * RATE}`, 2 * RATE, RATE, RATE]], 'only the part in B remains, its source starting 1 s in');
    assert.deepEqual(timeline.clips[0].fades, { in_frames: 0, out_frames: 960 }, 'the remaining part keeps the fade-out only');
    assert.equal(timeline.clips[0].source.atome_id, 'a', 'the source atome is untouched');
});

test('placing a cell copies or moves its content exactly into the target range', () => {
    const copied = placeCell(fixture(), { from_scene_id: 'A', from_track_id: 't', to_scene_id: 'B', to_track_id: 't', copy: true });
    assert.deepEqual(frames(copied).sort(), [[`c~L${2 * RATE}`, RATE, RATE, 0], ['c~cB', 3 * RATE, RATE, 0]].sort(),
        'B is replaced by A (the original clip stays, cut at B, and its copy starts 1 s into B)');
});

test('moving a Scene column moves its content with it, to the frame', () => {
    const moved = moveScene(fixture(), { scene_id: 'B', index: 0 });
    assert.deepEqual(moved.scenes.map((scene) => [scene.scene_id, scene.start_frame]).sort(), [['A', 2 * RATE], ['B', 0]]);
    assert.deepEqual(frames(moved).sort(), [['c~sA', 3 * RATE, RATE, 0], ['c~sB', 0, RATE, RATE]].sort());
});

test('session: scene and cell operations are durable, reachable by their verbs', async () => {
    const events = [];
    const session = createMoleculeSession({ timeline: fixture(), eventSink: { append: async (event) => { events.push(event); return event; } } });
    await session.apply('eve.timeline.scene.add', { scene_id: 'C', name: 'C', start_frame: 4 * RATE, duration_frames: RATE });
    await session.apply('eve.timeline.cell.set', { cells: [{ scene_id: 'C' }], settings: { follow_action: { type: 'stop' } } });
    assert.equal(readCellSettings(session.getState(), 'C').follow_action.type, 'stop');
    assert.ok(events.some((event) => JSON.stringify(event).includes('molecule.scene.add')) && events.some((event) => JSON.stringify(event).includes('molecule.cell.set')));
});
