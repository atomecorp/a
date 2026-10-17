// Recording into an empty cell (todo/timeline v1.6 §4, §5): capture at once,
// useful start on the cell's start step, end on its end step, take placed at
// the Scene's start through the cells' grid mapping.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCellRecorder } from '../../eVe/intuition/tools/molecule/runtime_cell_recording.js';
import { placeExactTake } from '../../eVe/intuition/tools/molecule/recording/exact_placement.js';
import { addScene, createTimeline, setCellSettings, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';

const RATE = 48000;
const timelineWithScene = () => {
    let timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    timeline = updateSection(timeline, { section_id: 's', duration_frames: 30 * RATE });
    timeline = addScene(timeline, { scene_id: 'A', name: 'A', start_frame: 4 * RATE, duration_frames: 2 * RATE });
    return setCellSettings(timeline, { scene_id: 'A', track_id: 't', settings: { quantize_start: 'beat', quantize_end: 'beat' } });
};

test('a cell take starts on the start step, ends on the end step and lands at the Scene start', async () => {
    let heard = 10000;
    const anchor = { render_start_frame: 10000, sample_rate: RATE, base_context_frame: 500, context: { currentTime: 0 } };
    const player = {
        gridFrame: async (quantum) => anchor.render_start_frame + Math.ceil((heard - anchor.render_start_frame) / (quantum * RATE)) * quantum * RATE,
        holdAnchor: () => {}, releaseAnchor: () => {}, anchorNow: () => ({ ...anchor }), heardFrame: () => heard
    };
    const calls = [];
    let started = null;
    const capture = {
        start: async (options) => { started = options; return { capture_id: 'k' }; },
        finish: async (id, options) => { calls.push(options); return { ok: true, id }; }
    };
    const scheduled = [];
    const recorder = createCellRecorder({ player, schedule: (callback, ms) => scheduled.push({ callback, ms }) });
    const timeline = timelineWithScene();
    heard = 10000 + 3000;
    const result = await recorder.start({ timeline, sceneId: 'A', trackId: 't', capture });
    assert.equal(result.start_frame, 10000 + 24000, 'the useful start is the next beat of the grid');
    // The capture's mapping: the start step is heard as the Scene's first frame.
    const placed = placeExactTake({
        playback: started.playback, timelineRate: RATE, startFrame: started.timeline_start_frame, endFrame: started.timeline_end_frame,
        stopped: { frame_count: 4 * RATE, sample_rate: RATE, shared_playback_context: true, first_audio_worklet_frame: 500 + 10000 + 3000 }
    });
    assert.equal(placed.take_start_frame, 4 * RATE - 21000, 'what was captured before the start step precedes the Scene');
    assert.deepEqual([placed.timeline.start_frame, placed.timeline.source_in_frame], [4 * RATE, 21000]);
    heard = 10000 + 24000 + 30000;
    const stop = await recorder.stop({ timeline, key: 'A|t' });
    assert.equal(stop.end_frame, 10000 + 3 * 24000, 'the end lands on the next beat');
    assert.equal(recorder.read()[0].recording, true);
    await scheduled[0].callback();
    assert.deepEqual(calls[0], { timeline_end_frame: 4 * RATE + 2 * 24000 }, 'cut to the beats played, from the Scene start');
    assert.equal(recorder.isRecording('A|t'), false);
});
