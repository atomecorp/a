import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addClip,
    addTrack,
    createTimeline,
    musicalToSeconds,
    secondsToMusical,
    setPlayhead,
    setTempo,
    validateTimeline
} from '../../eVe/intuition/tools/molecule/kernel/index.js';

const createTrackTimeline = () => addTrack(createTimeline({
    timeline_id: 'timeline_dual_time',
    project_id: 'project_dual_time',
    owner_atome_id: 'owner_dual_time'
}), {
    track_id: 'track_video',
    section_id: 'timeline_dual_time:section:1',
    kind: 'video',
    name: 'Video',
    order: 10
});

test('Molecule timeline snapshots carry tempo map and playhead dual time', () => {
    const timeline = createTimeline({
        timeline_id: 'timeline_timebase',
        project_id: 'project_timebase',
        owner_atome_id: 'owner_timebase'
    });
    assert.deepEqual(timeline.timebase.tempo_map, [{
        start_seconds: 0,
        bpm: 120,
        beats_per_bar: 4,
        beat_unit: 4,
        ticks_per_beat: 960
    }]);
    assert.equal(timeline.timebase.sample_rate, 48000);
    assert.equal(timeline.transport.playhead_frame, 0);
    assert.deepEqual(timeline.transport.playhead_time, {
        seconds: 0,
        musical: { bar: 1, beat: 1, tick: 0 }
    });
});

test('Molecule clip positions are stored with seconds and musical references', () => {
    const timeline = addClip(createTrackTimeline(), {
        clip_id: 'clip_video',
        track_id: 'track_video',
        kind: 'video',
        source: { type: 'atome', atome_id: 'video_source' },
        timeline: {
            start_seconds: 4,
            duration_seconds: 3,
            source_in_seconds: 1,
            source_out_seconds: 4
        }
    });
    assert.deepEqual(timeline.clips[0].timeline.start_time, {
        seconds: 4,
        musical: { bar: 3, beat: 1, tick: 0 }
    });
    assert.deepEqual(timeline.clips[0].timeline.source_in_time, {
        seconds: 1,
        musical: { bar: 1, beat: 3, tick: 0 }
    });
    assert.equal(timeline.clips[0].timeline.start_frame, 192000);
    assert.equal(timeline.clips[0].timeline.duration_frames, 144000);
    assert.equal(timeline.clips[0].timeline.source_in_frame, 48000);
    assert.equal(timeline.clips[0].timeline.source_out_frame, 192000);
});

test('Molecule clip frame positions derive their seconds projection at one-sample precision', () => {
    const timeline = addClip(createTrackTimeline(), {
        clip_id: 'clip_frame_exact',
        track_id: 'track_video',
        kind: 'video',
        source: { type: 'atome', atome_id: 'video_frame_source' },
        timeline: {
            start_frame: 1,
            duration_frames: 2,
            source_in_frame: 0,
            source_out_frame: 2
        }
    });
    assert.equal(timeline.clips[0].timeline.start_frame, 1);
    assert.equal(timeline.clips[0].timeline.start_seconds, 1 / 48000);
    assert.equal(timeline.clips[0].timeline.duration_seconds, 2 / 48000);
});

test('Molecule tempo map resolves seconds and musical positions deterministically', () => {
    let timeline = createTrackTimeline();
    timeline = setTempo(timeline, {
        start_seconds: 4,
        tempo: 60,
        beats_per_bar: 4,
        beat_unit: 4
    });
    timeline = setPlayhead(timeline, { playhead_seconds: 5 });
    assert.equal(timeline.timebase.tempo_map.length, 2);
    assert.deepEqual(secondsToMusical(5, timeline.timebase.tempo_map), {
        bar: 3,
        beat: 2,
        tick: 0
    });
    assert.equal(musicalToSeconds({ bar: 3, beat: 2, tick: 0 }, timeline.timebase.tempo_map), 5);
    assert.deepEqual(timeline.transport.playhead_time, {
        seconds: 5,
        musical: { bar: 3, beat: 2, tick: 0 }
    });
    assert.equal(timeline.transport.playhead_frame, 240000);
});

test('Molecule v2 rejects historical snapshots instead of migrating them', () => {
    const historical = {
        schema: 'molecule_timeline',
        schema_version: 1,
        timeline_id: 'timeline_historical',
        project_id: 'project_historical',
        owner_atome_id: 'owner_historical'
    };
    assert.throws(
        () => validateTimeline(historical),
        (error) => error.code === 'molecule_kernel/invalid_timeline'
    );
});
