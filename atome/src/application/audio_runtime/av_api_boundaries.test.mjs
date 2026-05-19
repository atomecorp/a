import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioPlaybackAPI } from './audio_playback_api.js';
import { AudioRecordingAPI } from './audio_recording_api.js';
import { installSharedAVContracts } from './av_contracts.js';
import { commandBusV2 } from '../../../../eVe/intuition/runtime/command_bus.js';
import {
    VideoPlaybackAPI,
    VideoRecordingAPI,
    installVideoFacade
} from '../../../../eVe/domains/media/api/video_facade.js';

test.beforeEach(() => {
    commandBusV2.clear();
});

const createNativeAudioEnv = (calls = []) => ({
    __SQUIRREL_FORCE_TAURI_RUNTIME: true,
    __TAURI_INTERNALS__: {
        invoke: async (command, args = {}) => {
            calls.push({ command, args });
            if (command === 'audio_record_start') return { success: true, session_id: args.sessionId || 'native-session' };
            if (command === 'audio_record_stop') return { success: true, path: 'data/users/u/recordings/take.wav' };
            return { success: true };
        }
    },
    record_start: async (params = {}) => params.sessionId || params.session_id || 'record-session',
    record_stop: async (sessionId = '') => ({ ok: true, sessionId }),
    location: {
        protocol: 'tauri:',
        hostname: 'tauri.localhost'
    }
});

const createAtomeEnv = () => {
    const records = new Map();
    return {
        Atome: {
            commit: async (event = {}) => {
                records.set(event.atome_id, {
                    id: event.atome_id,
                    atome_id: event.atome_id,
                    project_id: event.project_id || null,
                    properties: { ...(event.props || {}) }
                });
                return { ok: true, data: records.get(event.atome_id) };
            },
            listStateCurrent: async (projectId = null) => Array.from(records.values()).filter((record) => {
                if (!projectId) return true;
                return record.project_id === projectId;
            })
        }
    };
};

test('audio playback and recording APIs are separate wrappers over the legacy core', async () => {
    const calls = [];
    const env = createNativeAudioEnv(calls);
    const playback = new AudioPlaybackAPI(env);
    const recording = new AudioRecordingAPI(env);

    await playback.loadAsset({
        assetId: 'asset-boundary',
        path: 'data/users/u/recordings/take.wav'
    });
    await playback.startVoice({
        assetId: 'asset-boundary',
        voiceId: 'voice-boundary'
    });

    env.Squirrel.av.clocks.create({ id: 'recording-clock', sampleRate: 48000 });
    const created = recording.createRecordingSession({ id: 'session-boundary', source: 'mic', clockId: 'recording-clock' });
    assert.equal(created.session.media_kind, 'audio');
    assert.equal(created.session.state, 'created');
    assert.equal(created.session.clock_id, 'recording-clock');
    const armed = recording.armRecordingSession('session-boundary');
    assert.equal(armed.session.state, 'armed');

    assert.deepEqual(calls.map((entry) => entry.command), [
        'audio_init',
        'audio_load_clip',
        'audio_play_instance'
    ]);
    assert.ok(commandBusV2.listEvents({ tool_id: 'play_record' }).length >= 2);
});

test('shared AV stores provide media-neutral asset, marker, and region contracts', async () => {
    const env = createAtomeEnv();
    const av = installSharedAVContracts(env);
    const asset = av.assets.create({ id: 'asset-a', media_kind: 'video' });
    const marker = await av.markers.create({ id: 'marker-a', asset_id: asset.id, seconds: 1.25, kind: 'cue' });
    const region = await av.regions.create({ id: 'region-a', asset_id: asset.id, start_marker_id: marker.id });
    const overrun = av.monitoring.reportStreamOverrun({
        media_kind: 'audio',
        session_id: 'session-a',
        provider: 'tauri',
        overrun_frames: 128,
        sample_rate: 48000,
        channels: 2
    });
    const clock = av.clocks.create({ id: 'session-clock', sampleRate: 48000 });

    assert.equal(av.schema_version, 1);
    assert.equal(av.assets.get('asset-a').media_kind, 'video');
    assert.equal(av.markers.list({ assetId: asset.id }).length, 1);
    assert.equal(av.regions.get(region.id).start_marker_id, marker.id);
    await av.markers.refresh(null);
    await av.regions.refresh(null);
    assert.equal(av.markers.get('marker-a').seconds, 1.25);
    assert.equal(av.regions.list({ assetId: asset.id }).length, 1);
    assert.equal(overrun.event_type, 'av.stream.overrun');
    assert.equal(av.monitoring.getStreamOverrunSummary({ session_id: 'session-a' }).overrun_frames, 128);
    assert.equal(av.clocks.requireClock('session-clock').id, clock.id);
    assert.equal(clock.secondsToSamples(0.5), 24000);

    const inputDevice = av.devices.register({ id: 'mic-a', media_kind: 'audio', direction: 'input', label: 'Mic A' });
    assert.equal(av.devices.select({ id: inputDevice.id, scope: 'audio.input' }).device.id, 'mic-a');
    const latency = av.latency.report({ media_kind: 'audio', object_id: 'session-a', input_latency_ms: 4.5 });
    assert.equal(latency.input_latency_ms, 4.5);
    const profile = av.codec.createProfile({ id: 'wav-f32', media_kind: 'audio', codec: 'pcm_f32', container: 'wav' });
    assert.equal(av.codec.getProfile(profile.id).container, 'wav');
    const sourceNode = av.graph.createNode({ id: 'source-a', media_kind: 'audio', node_type: 'source' });
    const outputNode = av.graph.createNode({ id: 'output-a', media_kind: 'audio', node_type: 'output' });
    assert.equal(av.graph.connect({ source: sourceNode.id, target: outputNode.id }).source_id, 'source-a');
    const metrics = av.videoMetrics.report({ object_id: 'video-session', frame_rate: 30, dropped_frames: 1 });
    assert.equal(metrics.dropped_frames, 1);
    assert.throws(
        () => av.export.createJob({ media_kind: 'video' }),
        (error) => error?.code === 'av_capability_unsupported'
            && error.capability === 'offline_export'
            && error.media_kind === 'video'
    );
});

test('video facade exposes playback and recording namespaces with typed unsupported errors', () => {
    const env = {};
    const video = installVideoFacade(env);
    assert.ok(video.playback instanceof VideoPlaybackAPI);
    assert.ok(video.recording instanceof VideoRecordingAPI);

    const loaded = video.playback.loadAsset({ id: 'video-asset', source: '/media/take.mov' });
    assert.equal(loaded.ok, true);
    assert.equal(video.playback.queryState('video-asset').loaded, true);
    assert.equal(loaded.asset.clock_id, 'default');

    const session = video.recording.createRecordingSession({ id: 'video-session' });
    assert.equal(session.session.media_kind, 'video');
    assert.equal(session.session.clock_id, 'default');

    assert.throws(
        () => video.playback.scheduleVoice({ assetId: 'video-asset' }),
        (error) => error?.code === 'av_capability_unsupported'
            && error.capability === 'transport_scheduled_video_playback'
            && error.media_kind === 'video'
    );
});
