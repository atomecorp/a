// R-307: a cell fired like a machine gun keeps its gestures in order. A slow first launch (the output waking) must not
// let the next touch reach the cells transport before the first touch's release, or that touch finds the cell still
// held and stops it instead of launching it again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCellGestures } from '../../eVe/domains/rendering/project_view_timeline_cell_gestures.js';
import { addClip, addScene, createTimeline, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';

const RATE = 48000;
const SCENE = 'A';
const TRACK = 't';

// One Scene whose track cell holds a clap.
const cellsTimeline = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: TRACK });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 10 * RATE });
    timeline = addClip(timeline, {
        clip_id: 'clap', track_id: TRACK, kind: 'audio', source: { type: 'atome', atome_id: 'x' },
        timeline: { start_seconds: 0, duration_seconds: 0.5, source_in_seconds: 0, source_out_seconds: 0.5 },
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    return addScene(timeline, { scene_id: SCENE, name: 'A', start_frame: 0, duration_frames: RATE });
};
const timeline = cellsTimeline();

test('a slow first launch keeps press, release, press, release in order', async () => {
    const calls = [];
    let releaseFirst = null;
    const api = () => ({
        triggerGroupTimelineCells: ({ gesture }) => {
            calls.push(gesture);
            // The first launch waits for the output to wake.
            if (calls.length === 1) return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true }); });
            return Promise.resolve({ ok: true });
        }
    });
    const state = {
        ownerId: 'group_a', timeline, selectedCells: new Set(),
        geometry: { unit: 60, row: 60, laneOffset: 0, firstLane: 0, firstScene: 0, rulerY: 0, cellsWidth: 240, filter: null, maxScrollLanes: 0, lanes: [] }
    };
    const gestures = createCellGestures({
        state, api, apply: async () => ({ ok: true }), clearSelection: () => {}, requestRefresh: () => {}, watchCells: () => {}
    });
    const intent = { target: 'cell', sceneId: SCENE, trackId: TRACK, column: 0, row: 0, event: { x: 10, y: 10 } };
    const first = gestures.begin(intent, {});
    const firstReleased = gestures.commit(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = gestures.begin(intent, {});
    const secondReleased = gestures.commit(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirst();
    await Promise.all([firstReleased, secondReleased]);
    assert.deepEqual(calls, ['press', 'release', 'press', 'release']);
});
