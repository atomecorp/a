import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addTrack,
    createTimeline,
    validateClip
} from '../../eVe/intuition/tools/molecule/kernel/index.js';
import {
    MOLECULE_RECORDING_ERROR_CODES,
    createMoleculeRecordingSession
} from '../../eVe/intuition/tools/molecule/recording/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';

const SAMPLE_RATE = 48000;
const START_FRAME = 24000;
const INPUT_LATENCY_FRAMES = 64;
const OUTPUT_LATENCY_FRAMES = 64;
const ROUNDTRIP_LATENCY_FRAMES = INPUT_LATENCY_FRAMES + OUTPUT_LATENCY_FRAMES;
const FRAME_COUNT = 9600;
const CLOCK_ID = 'kira_clock_probe';
const CLOCK_REFERENCE = 'record_start_render_quantum';
const TIMELINE_CLOCK_ID = 'auv3.host_transport';
const CLOCK_EPOCH = 'auv3_epoch_probe';
const PLAYBACK_START_FRAME = 1000000;
const RECORDING_START_FRAME = PLAYBACK_START_FRAME + ROUNDTRIP_LATENCY_FRAMES;

const createArmedSession = ({ trackKind = 'audio' } = {}) => {
    let timeline = createTimeline({
        timeline_id: 'timeline_recording_probe',
        project_id: 'project_recording_probe',
        owner_atome_id: 'group_recording_probe',
        sample_rate: SAMPLE_RATE
    });
    timeline = addTrack(timeline, {
        track_id: `track_${trackKind}`,
        kind: trackKind,
        name: trackKind,
        order: 10,
        record_arm: true
    });
    const events = [];
    const commits = [];
    const session = createMoleculeSession({
        timeline,
        eventSink: { append: async (event) => events.push(event) },
        onStateCommitted: async (state, detail) => commits.push({ state, detail }),
        txIdFactory: () => 'tx_recording_probe'
    });
    return { session, events, commits };
};

const finishedTiming = () => ({
    source: 'plugin_input',
    clock_id: CLOCK_ID,
    clock_reference: CLOCK_REFERENCE,
    clock_epoch: CLOCK_EPOCH,
    timeline_clock_id: TIMELINE_CLOCK_ID,
    timeline_origin_frame: START_FRAME,
    sample_rate: SAMPLE_RATE,
    recording_start_frame: RECORDING_START_FRAME,
    playback_start_frame: PLAYBACK_START_FRAME,
    playback_observed_frame: RECORDING_START_FRAME,
    input_latency_frames: INPUT_LATENCY_FRAMES,
    output_latency_frames: OUTPUT_LATENCY_FRAMES,
    roundtrip_latency_frames: ROUNDTRIP_LATENCY_FRAMES,
    record_offset_frames_applied: ROUNDTRIP_LATENCY_FRAMES,
    overrun_frames: 0,
    discontinuity_frames: 0,
    provider: 'auv3_plugin_recorder'
});

const createCaptureAdapter = (calls) => ({
    async resolveSampleAccurateCapability(request) {
        calls.push({ phase: 'capability', request });
        return {
            supported: true,
            capability: 'sample_accurate_overdub',
            source: 'plugin_input',
            clock_id: CLOCK_ID,
            clock_reference: CLOCK_REFERENCE,
            timeline_clock_id: TIMELINE_CLOCK_ID,
            timeline_origin_frame: request.timeline_start_frame
        };
    },
    async startCapture(request) {
        calls.push({ phase: 'start', request });
        return {
            capture_id: 'capture_probe',
            clock_id: CLOCK_ID,
            clock_reference: CLOCK_REFERENCE,
            clock_epoch: CLOCK_EPOCH,
            timeline_clock_id: TIMELINE_CLOCK_ID,
            timeline_origin_frame: request.timeline_start_frame
        };
    },
    async finishCapture(captureId, request) {
        calls.push({ phase: 'stop', captureId, request });
        return {
            frame_count: FRAME_COUNT,
            project: { atomeId: 'audio_recording_probe' },
            ...finishedTiming()
        };
    },
    async cancelCapture(captureId, request) {
        calls.push({ phase: 'cancel', captureId, request });
        return { ok: true };
    }
});

test('Molecule recording commits one frame-exact Atome clip through the active session', async () => {
    const { session, events, commits } = createArmedSession();
    const calls = [];
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls),
        idGenerator: () => 'take_1'
    });

    const started = await recording.start({
        kind: 'audio',
        captureSource: 'plugin_input',
        timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE,
        clockId: CLOCK_ID,
        timelineClockId: TIMELINE_CLOCK_ID,
        captureOptions: { clock_reference: CLOCK_REFERENCE },
        clipId: 'clip_recording_probe'
    });

    assert.equal(started.status, 'recording');
    assert.equal(started.track_id, 'track_audio');
    assert.equal(started.clock_epoch, CLOCK_EPOCH);
    assert.equal(calls[0].phase, 'capability');
    assert.equal(calls[0].request.require_sample_accurate, true);
    assert.equal(calls[0].request.timeline_start_frame, START_FRAME);
    assert.equal(calls[0].request.source, 'plugin_input');
    assert.equal(calls[0].request.timeline_clock_id, TIMELINE_CLOCK_ID);

    const stopped = await recording.stop();
    assert.equal(stopped.project_atome_id, 'audio_recording_probe');
    assert.equal(stopped.clip.source.type, 'atome');
    assert.equal(stopped.clip.source.atome_id, 'audio_recording_probe');
    assert.deepEqual(stopped.clip.timeline, {
        start_frame: START_FRAME - ROUNDTRIP_LATENCY_FRAMES,
        duration_frames: FRAME_COUNT,
        source_in_frame: 0,
        source_out_frame: FRAME_COUNT,
        start_seconds: (START_FRAME - ROUNDTRIP_LATENCY_FRAMES) / SAMPLE_RATE,
        duration_seconds: FRAME_COUNT / SAMPLE_RATE,
        source_in_seconds: 0,
        source_out_seconds: FRAME_COUNT / SAMPLE_RATE
    });
    assert.equal(stopped.clip.recording_timing.recording_start_frame, RECORDING_START_FRAME);
    assert.equal(stopped.clip.recording_timing.playback_start_frame, PLAYBACK_START_FRAME);
    assert.equal(stopped.clip.recording_timing.playback_observed_frame, RECORDING_START_FRAME);
    assert.equal(stopped.clip.recording_timing.source, 'plugin_input');
    assert.equal(stopped.clip.recording_timing.clock_reference, CLOCK_REFERENCE);
    assert.equal(stopped.clip.recording_timing.clock_epoch, CLOCK_EPOCH);
    assert.equal(session.getState().clips[0].timeline.start_frame, START_FRAME - ROUNDTRIP_LATENCY_FRAMES);
    assert.equal(session.getState().clips[0].timeline.duration_frames, FRAME_COUNT);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'molecule.clip.add');
    assert.equal(commits.length, 1);
    assert.equal(recording.read().status, 'idle');

    for (const recordingTiming of [
        { ...stopped.clip.recording_timing, source: 'plugin' },
        { ...stopped.clip.recording_timing, playback_start_frame: RECORDING_START_FRAME },
        { ...stopped.clip.recording_timing, playback_observed_frame: RECORDING_START_FRAME + 1 },
        { ...stopped.clip.recording_timing, input_latency_frames: 0 }
    ]) {
        assert.throws(
            () => validateClip(
                { ...stopped.clip, recording_timing: recordingTiming },
                session.getState().tempo_map,
                SAMPLE_RATE
            ),
            (error) => error.code === 'molecule_kernel/invalid_clip'
        );
    }
});

test('Molecule recording retries only the clip commit after session.apply fails', async () => {
    const { session: baseSession } = createArmedSession();
    const calls = [];
    let applyAttempts = 0;
    const session = {
        getState: () => baseSession.getState(),
        apply: async (...args) => {
            applyAttempts += 1;
            if (applyAttempts === 1) throw new Error('transient_commit_failure');
            return baseSession.apply(...args);
        }
    };
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls),
        idGenerator: () => 'commit_retry'
    });
    await recording.start({
        kind: 'audio', captureSource: 'plugin_input', timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE, clockId: CLOCK_ID,
        clockReference: CLOCK_REFERENCE, timelineClockId: TIMELINE_CLOCK_ID
    });

    await assert.rejects(
        recording.stop(),
        (error) => error.code === MOLECULE_RECORDING_ERROR_CODES.CAPTURE_STOP_FAILED
    );
    assert.equal(recording.read().status, 'commit_failed');
    assert.equal(recording.read().active, true);
    assert.equal(calls.filter((entry) => entry.phase === 'stop').length, 1);

    const stopped = await recording.stop();
    assert.equal(stopped.ok, true);
    assert.equal(applyAttempts, 2);
    assert.equal(calls.filter((entry) => entry.phase === 'stop').length, 1);
    assert.equal(baseSession.getState().clips.length, 1);
    assert.equal(recording.read().status, 'idle');
});

test('Molecule dispose cannot erase a finalized take while its clip commit still fails', async () => {
    const { session: baseSession } = createArmedSession();
    const calls = [];
    let applyAttempts = 0;
    const session = {
        getState: () => baseSession.getState(),
        apply: async (...args) => {
            applyAttempts += 1;
            if (applyAttempts < 3) throw new Error('commit_still_unavailable');
            return baseSession.apply(...args);
        }
    };
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls),
        idGenerator: () => 'dispose_commit_retry'
    });
    await recording.start({
        kind: 'audio', captureSource: 'plugin_input', timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE, clockId: CLOCK_ID,
        clockReference: CLOCK_REFERENCE, timelineClockId: TIMELINE_CLOCK_ID
    });
    await assert.rejects(recording.stop(), /commit_still_unavailable/);

    await assert.rejects(recording.dispose(), /commit_still_unavailable/);
    assert.equal(recording.read().status, 'commit_failed');
    assert.equal(recording.read().active, true);
    assert.equal(calls.filter((entry) => entry.phase === 'stop').length, 1);

    const disposed = await recording.dispose();
    assert.equal(disposed.disposed, true);
    assert.equal(applyAttempts, 3);
    assert.equal(baseSession.getState().clips.length, 1);
    assert.equal(calls.filter((entry) => entry.phase === 'stop').length, 1);
    assert.equal(recording.read().status, 'disposed');
});

test('Molecule recording rejects and cancels a capture whose start event has no common-clock epoch', async () => {
    const { session } = createArmedSession();
    let started = 0;
    let canceled = 0;
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: {
            resolveSampleAccurateCapability: async () => ({
                supported: true,
                capability: 'sample_accurate_overdub',
                clock_id: CLOCK_ID,
                clock_reference: CLOCK_REFERENCE,
                timeline_clock_id: TIMELINE_CLOCK_ID,
                timeline_origin_frame: START_FRAME
            }),
            startCapture: async () => {
                started += 1;
                return {
                    capture_id: 'capture_without_epoch',
                    clock_id: CLOCK_ID,
                    clock_reference: CLOCK_REFERENCE,
                    timeline_clock_id: TIMELINE_CLOCK_ID,
                    timeline_origin_frame: START_FRAME
                };
            },
            finishCapture: async () => ({}),
            cancelCapture: async () => {
                canceled += 1;
                return { ok: true };
            }
        }
    });

    await assert.rejects(
        recording.start({
            kind: 'audio',
            captureSource: 'plugin_input',
            timelineStartFrame: START_FRAME,
            timelineSampleRate: SAMPLE_RATE,
            clockId: CLOCK_ID,
            clockReference: CLOCK_REFERENCE,
            timelineClockId: TIMELINE_CLOCK_ID
        }),
        (error) => error.code === 'av_sample_clock_mismatch'
    );
    assert.equal(started, 1);
    assert.equal(canceled, 1);
    assert.equal(recording.read().status, 'idle');
});

test('Molecule recording dispose cancels an active capture before becoming unusable', async () => {
    const { session } = createArmedSession();
    const calls = [];
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls)
    });
    await recording.start({
        trackId: 'track_audio',
        kind: 'audio',
        captureSource: 'plugin_input',
        timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE,
        clockId: CLOCK_ID,
        clockReference: CLOCK_REFERENCE,
        timelineClockId: TIMELINE_CLOCK_ID
    });

    const disposed = await recording.dispose();
    assert.equal(disposed.canceled, true);
    assert.equal(calls.filter((entry) => entry.phase === 'cancel').length, 1);
    assert.equal(recording.read().status, 'disposed');
    await assert.rejects(
        recording.start({
            kind: 'audio',
            captureSource: 'plugin_input',
            timelineStartFrame: START_FRAME,
            timelineSampleRate: SAMPLE_RATE,
            clockId: CLOCK_ID,
            clockReference: CLOCK_REFERENCE,
            timelineClockId: TIMELINE_CLOCK_ID
        }),
        (error) => error.code === MOLECULE_RECORDING_ERROR_CODES.DISPOSED
    );
});

test('Molecule recording retains a failed cancel so the same capture can be retried', async () => {
    const { session } = createArmedSession();
    const calls = [];
    const adapter = createCaptureAdapter(calls);
    let cancelAttempts = 0;
    adapter.cancelCapture = async (captureId, request) => {
        calls.push({ phase: 'cancel', captureId, request });
        cancelAttempts += 1;
        if (cancelAttempts === 1) throw new Error('transient_cancel_failure');
        return { ok: true };
    };
    const recording = createMoleculeRecordingSession({ session, captureAdapter: adapter });
    await recording.start({
        kind: 'audio', captureSource: 'plugin_input', timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE, clockId: CLOCK_ID,
        clockReference: CLOCK_REFERENCE, timelineClockId: TIMELINE_CLOCK_ID
    });

    await assert.rejects(
        recording.cancel(),
        (error) => error.code === MOLECULE_RECORDING_ERROR_CODES.CAPTURE_CANCEL_FAILED
    );
    assert.equal(recording.read().status, 'recording');
    assert.equal(recording.read().active, true);
    assert.equal((await recording.cancel()).canceled, true);
    assert.equal(recording.read().status, 'idle');
    assert.equal(cancelAttempts, 2);
});

test('Molecule recording refuses video until a sample-clock PTS mapping exists', async () => {
    const { session } = createArmedSession({ trackKind: 'video' });
    const calls = [];
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls)
    });

    await assert.rejects(
        recording.start({
            kind: 'video',
            captureSource: 'camera',
            timelineStartFrame: START_FRAME,
            timelineSampleRate: SAMPLE_RATE,
            clockId: CLOCK_ID,
            clockReference: CLOCK_REFERENCE,
            timelineClockId: TIMELINE_CLOCK_ID
        }),
        (error) => error.code === 'av_sample_accurate_overdub_unsupported'
    );
    assert.equal(calls.length, 0);
});

test('Molecule recording rejects an overrun without committing a clip', async () => {
    const { session } = createArmedSession();
    const calls = [];
    const adapter = createCaptureAdapter(calls);
    adapter.finishCapture = async (captureId, request) => {
        calls.push({ phase: 'stop', captureId, request });
        return {
            frame_count: FRAME_COUNT,
            project: { atomeId: 'audio_overrun_probe' },
            ...finishedTiming(),
            overrun_frames: 1
        };
    };
    const recording = createMoleculeRecordingSession({ session, captureAdapter: adapter });
    await recording.start({
        kind: 'audio',
        captureSource: 'plugin_input',
        timelineStartFrame: START_FRAME,
        timelineSampleRate: SAMPLE_RATE,
        clockId: CLOCK_ID,
        clockReference: CLOCK_REFERENCE,
        timelineClockId: TIMELINE_CLOCK_ID
    });

    await assert.rejects(recording.stop(), (error) => error.code === 'av_recording_overrun');
    assert.equal(session.getState().clips.length, 0);
    assert.equal(recording.read().status, 'idle');
});

test('Molecule recording refuses a non-render-quantum clock reference before capture', async () => {
    const { session } = createArmedSession();
    const calls = [];
    const recording = createMoleculeRecordingSession({
        session,
        captureAdapter: createCaptureAdapter(calls)
    });

    await assert.rejects(
        recording.start({
            kind: 'audio',
            captureSource: 'plugin_input',
            timelineStartFrame: START_FRAME,
            timelineSampleRate: SAMPLE_RATE,
            clockId: CLOCK_ID,
            clockReference: 'transport_playhead',
            timelineClockId: TIMELINE_CLOCK_ID
        }),
        (error) => error.code === 'av_sample_clock_invalid'
    );
    assert.equal(calls.length, 0);
});
