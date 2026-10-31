import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createMoleculeRecordScheduler,
    resolveRecordPreRollStartFrame
} from '../../eVe/intuition/tools/molecule/runtime_record_scheduler.js';

test('Record pre-roll begins the configured number of musical bars before the first armed region', () => {
    const timeline = {
        timebase: { sample_rate: 48000, tempo_map: [{ bpm: 120, beats_per_bar: 4 }] },
        transport: { tempo: 120 }, settings: { pre_roll_bars: 1 }
    };
    assert.equal(resolveRecordPreRollStartFrame(timeline, [{ start_frame: 192000 }]), 96000);
    assert.equal(resolveRecordPreRollStartFrame(timeline, [{ start_frame: 48000 }]), 0);
});

test('natural transport schedules armed regions, starts inside a region immediately, and stops at its bound', async () => {
    const timers = [];
    const starts = [];
    const stops = [];
    const scheduler = createMoleculeRecordScheduler({
        schedule: (callback, delay) => {
            const timer = { callback, delay, cancelled: false };
            timers.push(timer);
            return timer;
        },
        cancelSchedule: (timer) => { timer.cancelled = true; }
    });
    const timeline = {
        timebase: { sample_rate: 1000 },
        record_regions: [
            { record_region_id: 'inside', section_id: 'section', track_id: 'voice', source_kind: 'audio', start_frame: 1000, duration_frames: 3000, armed: true },
            { record_region_id: 'future', section_id: 'section', track_id: 'camera', source_kind: 'video', start_frame: 5000, duration_frames: 1000, armed: true },
            { record_region_id: 'ignored', section_id: 'section', track_id: 'photo', source_kind: 'photo', start_frame: 0, duration_frames: 1000, armed: true }
        ]
    };
    const result = await scheduler.start({
        groupId: 'molecule', timeline, startFrame: 2000,
        startCapture: async (input) => {
            starts.push(input);
            if (input.source_kind === 'photo') return { completed: true };
            return { capture_id: `capture_${input.record_region_id}` };
        },
        stopCapture: async (captureId) => stops.push(captureId),
        cancelCapture: async () => {}
    });
    assert.equal(result.scheduled, 3);
    await Promise.resolve();
    assert.equal(starts[0].record_region_id, 'inside');
    assert.equal(starts[1].record_region_id, 'ignored');
    const insideStop = timers.find((timer) => timer.delay === 2000);
    assert.ok(insideStop);
    await insideStop.callback();
    assert.deepEqual(stops, ['capture_inside']);
    const futureStart = timers.find((timer) => timer.delay === 3000);
    await futureStart.callback();
    await Promise.resolve();
    assert.equal(starts[2].record_region_id, 'future');
    const futureStop = timers.find((timer) => timer.delay === 1000);
    await futureStop.callback();
    assert.deepEqual(stops, ['capture_inside', 'capture_future']);
});

test('a late capture from an old session is cancelled after the same group restarts', async () => {
    const timers = new Set(), cancelled = [], stopped = [];
    const scheduler = createMoleculeRecordScheduler({ schedule: fn => { timers.add(fn); return fn; },
        cancelSchedule: fn => timers.delete(fn) });
    const timeline = { timebase: { sample_rate: 1000 }, record_regions: [{ record_region_id: 'voice',
        track_id: 'voice', source_kind: 'audio', start_frame: 0, duration_frames: 1000, armed: true }] };
    let finishOld;
    await scheduler.start({ groupId: 'same_group', timeline,
        startCapture: () => new Promise(resolve => { finishOld = resolve; }),
        stopCapture: async id => stopped.push(id), cancelCapture: async id => cancelled.push(id) });
    await scheduler.stop('same_group');
    await scheduler.start({ groupId: 'same_group', timeline,
        startCapture: async () => ({ capture_id: 'new_capture' }),
        stopCapture: async id => stopped.push(id), cancelCapture: async id => cancelled.push(id) });
    await new Promise(resolve => setImmediate(resolve));
    finishOld({ capture_id: 'old_capture' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(cancelled, ['old_capture']);
    assert.equal(timers.size, 1, 'only the current capture owns a stop timer');
    await scheduler.stop('same_group');
    assert.deepEqual(stopped, ['new_capture']);
    assert.equal(timers.size, 0);
});

test('an already queued old launch cannot enter a replacement group session', async () => {
    const timers = [], started = [];
    const scheduler = createMoleculeRecordScheduler({ schedule: fn => { timers.push(fn); return fn; }, cancelSchedule() {} });
    const region = { record_region_id: 'voice', track_id: 'voice', source_kind: 'audio', start_frame: 1000, duration_frames: 1000, armed: true };
    const input = { groupId: 'same_group', timeline: { timebase: { sample_rate: 1000 }, record_regions: [region] },
        startCapture: async () => { started.push('capture'); return { capture_id: 'capture' }; },
        stopCapture: async () => {}, cancelCapture: async () => {} };
    await scheduler.start(input);
    const oldLaunch = timers[0];
    await scheduler.start(input);
    oldLaunch();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(started, []);
    await scheduler.stop('same_group');
});
