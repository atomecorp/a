// Takes and comping (todo/timeline v1.6 §3.4, TL-60 – TL-62): a looped region's
// passes are windows of one capture; choosing a take slides the window.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addClip, addRecordRegion, createTimeline, setClipTake, splitClip, updateRecordRegion, updateSection } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { splitIntoTakes } from '../../eVe/intuition/tools/molecule/kernel/takes.js';
import { createMoleculeRecordScheduler, resolveRecordLoop } from '../../eVe/intuition/tools/molecule/runtime_record_scheduler.js';

const RATE = 48000;
const base = () => {
    const timeline = createTimeline({ timeline_id: 'tl', project_id: 'p', owner_atome_id: 'm', initial_section_id: 's', initial_track_id: 't' });
    return updateSection(timeline, { section_id: 's', duration_frames: 30 * RATE });
};

test('a looped capture becomes one clip holding every whole pass, the last one playing', () => {
    const window = { start_frame: 2 * RATE, duration_frames: 3 * RATE + 100, source_in_frame: 24000, source_out_frame: 24000 + 3 * RATE + 100 };
    const { timeline, takes } = splitIntoTakes(window, { count: 3, lengthFrames: RATE, startFrame: 2 * RATE });
    assert.deepEqual(timeline, { start_frame: 2 * RATE, duration_frames: RATE, source_in_frame: 24000 + 2 * RATE, source_out_frame: 24000 + 3 * RATE });
    assert.deepEqual(takes, { count: 3, length_frames: RATE, active: 3 });
    const late = splitIntoTakes({ ...window, start_frame: 2 * RATE + 5 }, { count: 3, lengthFrames: RATE, startFrame: 2 * RATE });
    assert.equal(late.takes, undefined, 'a capture that missed the start gives a single take');
});

test('choosing a take slides the source window by whole passes, also on a split piece', () => {
    let timeline = addClip(base(), {
        clip_id: 'c', track_id: 't', kind: 'audio', source: { type: 'atome', atome_id: 'a' },
        timeline: { start_frame: 2 * RATE, duration_frames: RATE, source_in_frame: 2 * RATE, source_out_frame: 3 * RATE },
        takes: { count: 3, length_frames: RATE, active: 3 }, next_empty_track_id: 't2', next_empty_track_name: 'Piste 2'
    });
    timeline = setClipTake(timeline, { clip_id: 'c', take: 1 });
    assert.deepEqual([timeline.clips[0].timeline.source_in_frame, timeline.clips[0].timeline.source_out_frame], [0, RATE]);
    timeline = splitClip(timeline, { clip_id: 'c', at_seconds: 2.5, left_clip_id: 'l', right_clip_id: 'r' });
    timeline = setClipTake(timeline, { clip_id: 'r', take: 2 });
    const right = timeline.clips.find((clip) => clip.clip_id === 'r');
    assert.deepEqual([right.timeline.source_in_frame, right.takes.active], [RATE + 0.5 * RATE, 2], 'comping: the right half plays take 2');
    assert.equal(timeline.clips.find((clip) => clip.clip_id === 'l').takes.active, 1, 'the left half keeps take 1');
    assert.throws(() => setClipTake(timeline, { clip_id: 'r', take: 4 }), /1\.\.3/);
});

test('a region asks for 1..16 takes and loops itself while it records', () => {
    let timeline = addRecordRegion(base(), { record_region_id: 'r', section_id: 's', track_id: 't', source_kind: 'audio', start_frame: 2 * RATE, duration_frames: RATE, armed: true });
    assert.throws(() => updateRecordRegion(timeline, { record_region_id: 'r', takes: 17 }), /takes/);
    timeline = updateRecordRegion(timeline, { record_region_id: 'r', takes: 3 });
    assert.deepEqual(resolveRecordLoop(timeline, RATE), { start: 2, end: 3 });
});

test('scheduler: the capture spans every pass; the next regions of the track replay the first take', async () => {
    let timeline = addRecordRegion(base(), { record_region_id: 'r1', section_id: 's', track_id: 't', source_kind: 'audio', start_frame: 2 * RATE, duration_frames: RATE, armed: true, takes: 2,
        next_empty_track_id: 't2', next_empty_track_name: 'Piste 2' });
    timeline = addRecordRegion(timeline, { record_region_id: 'r2', section_id: 's', track_id: 't', source_kind: 'audio', start_frame: 6 * RATE, duration_frames: RATE, armed: true });
    const timers = [];
    const started = [];
    const replayed = [];
    const scheduler = createMoleculeRecordScheduler({ schedule: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, cancelSchedule: () => {} });
    await scheduler.start({
        groupId: 'g', timeline, startFrame: 0, exactPlacement: true,
        startCapture: async (input) => { started.push(input); return { capture_id: 'k' }; },
        stopCapture: async () => ({ clip: { clip_id: 'take', kind: 'audio', source: { type: 'atome', atome_id: 'a' }, timeline: { duration_frames: RATE, source_in_frame: 7 } } }),
        cancelCapture: async () => {},
        replayTake: async (input) => { replayed.push(input); }
    });
    assert.equal(timers.length, 1, 'one capture: the second region of the track does not record');
    await timers[0].callback();
    assert.deepEqual([started[0].timeline_end_frame, started[0].takes, started[0].take_length_frames], [4 * RATE, 2, RATE]);
    assert.equal(timers[1].delay, ((4 * RATE + 0.5 * RATE) - (2 * RATE - 0.5 * RATE)) / RATE * 1000, 'the capture stops after both passes and the tail');
    await timers[1].callback();
    assert.deepEqual(replayed.map((entry) => entry.region.record_region_id), ['r2']);
});
