import assert from 'node:assert/strict';
import test from 'node:test';

import { installMoleculeGroupTimelineRuntime } from '../../eVe/intuition/tools/molecule/runtime.js';
import { MOLECULE_RECORDING_ERROR_CODES } from '../../eVe/intuition/tools/molecule/recording/index.js';

const SAMPLE_RATE = 48000;
const START_FRAME = 12000;
const INPUT_LATENCY_FRAMES = 32;
const OUTPUT_LATENCY_FRAMES = 32;
const ROUNDTRIP_LATENCY_FRAMES = INPUT_LATENCY_FRAMES + OUTPUT_LATENCY_FRAMES;
const FRAME_COUNT = 4800;
const CLOCK_ID = 'runtime_clock_probe';
const CLOCK_REFERENCE = 'record_start_render_quantum';
const TIMELINE_CLOCK_ID = 'auv3.host_transport';
const CLOCK_EPOCH = 'runtime_epoch_probe';
const PLAYBACK_START_FRAME = 200000;
const RECORDING_START_FRAME = PLAYBACK_START_FRAME + ROUNDTRIP_LATENCY_FRAMES;

const createHarness = ({ withAdapter = true } = {}) => {
    let persisted = null;
    const saves = [];
    const events = [];
    const renders = [];
    const captureCalls = [];
    const projectStore = {
        async loadTimeline() {
            return persisted;
        },
        async saveTimeline(projectId, timeline) {
            persisted = JSON.parse(JSON.stringify(timeline));
            saves.push({ projectId, timeline: persisted });
            return timeline;
        }
    };
    const env = {
        document: {},
        Atome: {
            moleculeStores: {
                projectStore,
                eventStore: { append: async (event) => events.push(event) }
            }
        }
    };
    const captureAdapter = withAdapter ? {
        async resolveSampleAccurateCapability(request) {
            captureCalls.push({ phase: 'capability', request });
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
            captureCalls.push({ phase: 'start', request });
            return {
                capture_id: 'runtime_capture',
                clock_id: CLOCK_ID,
                clock_reference: CLOCK_REFERENCE,
                clock_epoch: CLOCK_EPOCH,
                timeline_clock_id: TIMELINE_CLOCK_ID,
                timeline_origin_frame: request.timeline_start_frame
            };
        },
        async finishCapture(captureId, request) {
            captureCalls.push({ phase: 'stop', captureId, request });
            return {
                frame_count: FRAME_COUNT,
                sample_rate: SAMPLE_RATE,
                project: { atomeId: 'audio_recording_runtime_probe' },
                source: 'plugin_input',
                clock_id: CLOCK_ID,
                clock_reference: CLOCK_REFERENCE,
                clock_epoch: CLOCK_EPOCH,
                timeline_clock_id: TIMELINE_CLOCK_ID,
                timeline_origin_frame: START_FRAME,
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
            };
        },
        async cancelCapture(captureId, request) {
            captureCalls.push({ phase: 'cancel', captureId, request });
            return { ok: true };
        }
    } : null;
    const sceneBridge = {
        async render(detail) {
            renders.push({ phase: 'render', detail });
            return { ok: true };
        },
        async clear(detail) {
            renders.push({ phase: 'clear', detail });
            return { ok: true };
        }
    };
    const api = installMoleculeGroupTimelineRuntime(env, { captureAdapter, sceneBridge });
    return { api, captureCalls, events, renders, saves, readPersisted: () => persisted };
};

const openAndArmAudioTrack = async (api, groupId = 'group_runtime_probe') => {
    await api.openGroupTimeline({
        group_id: groupId,
        project_id: 'project_runtime_probe',
        steps: []
    });
    await api.applyGroupTimelineOperation({
        group_id: groupId,
        operation: 'molecule.track.add',
        command: {
            track_id: 'track_audio',
            kind: 'audio',
            name: 'Audio',
            order: 10,
            record_arm: true
        }
    });
};

test('eveMoleculeTimelineApi exposes recording lifecycle and persists before stop resolves', async () => {
    const { api, captureCalls, events, renders, saves, readPersisted } = createHarness();
    await openAndArmAudioTrack(api);

    const started = await api.startGroupTimelineRecording({
        group_id: 'group_runtime_probe',
        record_source: 'audio',
        capture_source: 'plugin_input',
        clock_id: CLOCK_ID,
        clock_reference: CLOCK_REFERENCE,
        timeline_clock_id: TIMELINE_CLOCK_ID,
        timeline_start_frame: START_FRAME
    });
    assert.equal(started.status, 'recording');
    assert.equal(api.readGroupTimelineRecording({ group_id: 'group_runtime_probe' }).recording.active, true);

    const stopped = await api.stopGroupTimelineRecording({ group_id: 'group_runtime_probe' });
    assert.equal(stopped.clip.timeline.start_frame, START_FRAME - ROUNDTRIP_LATENCY_FRAMES);
    assert.equal(stopped.clip.timeline.duration_frames, FRAME_COUNT);
    assert.equal(stopped.clip.recording_timing.source, 'plugin_input');
    assert.equal(stopped.clip.recording_timing.playback_observed_frame, RECORDING_START_FRAME);
    assert.equal(stopped.clip.recording_timing.roundtrip_latency_frames, ROUNDTRIP_LATENCY_FRAMES);
    assert.equal(captureCalls.map((entry) => entry.phase).join(','), 'capability,start,stop');
    assert.equal(events.at(-1).event_type, 'molecule.clip.add');
    assert.equal(readPersisted().clips[0].source.atome_id, 'audio_recording_runtime_probe');
    assert.equal(readPersisted().clips[0].timeline.duration_frames, FRAME_COUNT);
    assert.equal(saves.at(-1).timeline.clips.length, 1);
    assert.equal(renders.at(-1).detail.timeline.clips.length, 1);

    await api.closeGroupTimeline('group_runtime_probe');
    await api.openGroupTimeline({
        group_id: 'group_runtime_probe',
        project_id: 'project_runtime_probe',
        steps: []
    });
    assert.equal(api.readGroupTimeline({ group_id: 'group_runtime_probe' }).timeline.clips.length, 1);
});

test('closing an active Molecule timeline cancels capture before disposing the session', async () => {
    const { api, captureCalls, renders } = createHarness();
    await openAndArmAudioTrack(api, 'group_close_probe');
    await api.startGroupTimelineRecording({
        group_id: 'group_close_probe',
        track_id: 'track_audio',
        record_source: 'audio',
        capture_source: 'plugin_input',
        clock_id: CLOCK_ID,
        clock_reference: CLOCK_REFERENCE,
        timeline_clock_id: TIMELINE_CLOCK_ID,
        timeline_start_frame: START_FRAME
    });

    const closed = await api.closeGroupTimeline('group_close_probe');
    assert.equal(closed.closed, true);
    assert.equal(captureCalls.at(-1).phase, 'cancel');
    assert.equal(renders.at(-1).phase, 'clear');
});

test('reopening a group cancels its active capture before replacing the session', async () => {
    const { api, captureCalls } = createHarness();
    await openAndArmAudioTrack(api, 'group_replace_probe');
    await api.startGroupTimelineRecording({
        group_id: 'group_replace_probe', track_id: 'track_audio', record_source: 'audio',
        capture_source: 'plugin_input', clock_id: CLOCK_ID, clock_reference: CLOCK_REFERENCE,
        timeline_clock_id: TIMELINE_CLOCK_ID, timeline_start_frame: START_FRAME
    });

    await api.openGroupTimeline({
        group_id: 'group_replace_probe', project_id: 'project_runtime_probe', steps: []
    });
    assert.equal(captureCalls.filter((entry) => entry.phase === 'cancel').length, 1);
    assert.equal(api.readGroupTimelineRecording({ group_id: 'group_replace_probe' }).recording.status, 'idle');
});

test('runtime refuses recording when no sample-accurate capture adapter is injected', async () => {
    const { api } = createHarness({ withAdapter: false });
    await openAndArmAudioTrack(api, 'group_no_adapter');
    await assert.rejects(
        api.startGroupTimelineRecording({
            group_id: 'group_no_adapter',
            record_source: 'audio',
            capture_source: 'plugin_input',
            clock_id: CLOCK_ID,
            clock_reference: CLOCK_REFERENCE,
            timeline_clock_id: TIMELINE_CLOCK_ID,
            timeline_start_frame: START_FRAME
        }),
        (error) => error.code === MOLECULE_RECORDING_ERROR_CODES.CAPTURE_UNAVAILABLE
    );
    assert.equal(api.readGroupTimelineRecording({ group_id: 'group_no_adapter' }).recording.status, 'idle');
});

test('runtime requires an explicit common-clock timeline origin instead of using the playhead', async () => {
    const { api, captureCalls } = createHarness();
    await openAndArmAudioTrack(api, 'group_origin_probe');
    await api.applyGroupTimelineOperation({
        group_id: 'group_origin_probe',
        operation: 'transport.seek',
        command: { playhead_seconds: 2 }
    });

    await assert.rejects(
        api.startGroupTimelineRecording({
            group_id: 'group_origin_probe',
            record_source: 'audio',
            capture_source: 'plugin_input',
            clock_id: CLOCK_ID,
            clock_reference: CLOCK_REFERENCE,
            timeline_clock_id: TIMELINE_CLOCK_ID
        }),
        (error) => error.code === MOLECULE_RECORDING_ERROR_CODES.INVALID_OPTIONS
    );
    assert.equal(captureCalls.length, 0);
});
