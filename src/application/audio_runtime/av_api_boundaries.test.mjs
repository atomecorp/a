import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioPlaybackAPI } from './audio_playback_api.js';
import { AudioRecordingAPI } from './audio_recording_api.js';
import { installSharedAVContracts } from './av_contracts.js';
import { commandBusV2 } from '../eVe/intuition/runtime/command_bus.js';
import {
    VideoPlaybackAPI,
    VideoRecordingAPI,
    installVideoFacade
} from '../eVe/domains/media/api/video_facade.js';

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

    const created = recording.createRecordingSession({ id: 'session-boundary', source: 'mic' });
    assert.equal(created.session.media_kind, 'audio');
    assert.equal(created.session.state, 'created');
    const armed = recording.armRecordingSession('session-boundary');
    assert.equal(armed.session.state, 'armed');

    assert.deepEqual(calls.map((entry) => entry.command), [
        'audio_init',
        'audio_load_clip',
        'audio_play_instance'
    ]);
    assert.ok(commandBusV2.listEvents({ tool_id: 'play_record' }).length >= 2);
});

test('shared AV stores provide media-neutral asset, marker, and region contracts', () => {
    const env = {};
    const av = installSharedAVContracts(env);
    const asset = av.assets.create({ id: 'asset-a', media_kind: 'video' });
    const marker = av.markers.create({ id: 'marker-a', asset_id: asset.id, seconds: 1.25, kind: 'cue' });
    const region = av.regions.create({ id: 'region-a', asset_id: asset.id, start_marker_id: marker.id });

    assert.equal(av.schema_version, 1);
    assert.equal(av.assets.get('asset-a').media_kind, 'video');
    assert.equal(av.markers.list({ assetId: asset.id }).length, 1);
    assert.equal(av.regions.get(region.id).start_marker_id, marker.id);
});

test('video facade exposes playback and recording namespaces with typed unsupported errors', () => {
    const env = {};
    const video = installVideoFacade(env);
    assert.ok(video.playback instanceof VideoPlaybackAPI);
    assert.ok(video.recording instanceof VideoRecordingAPI);

    const loaded = video.playback.loadAsset({ id: 'video-asset', source: '/media/take.mov' });
    assert.equal(loaded.ok, true);
    assert.equal(video.playback.queryState('video-asset').loaded, true);

    const session = video.recording.createRecordingSession({ id: 'video-session' });
    assert.equal(session.session.media_kind, 'video');

    assert.throws(
        () => video.playback.scheduleVoice({ assetId: 'video-asset' }),
        (error) => error?.code === 'av_capability_unsupported'
            && error.capability === 'transport_scheduled_video_playback'
            && error.media_kind === 'video'
    );
});
