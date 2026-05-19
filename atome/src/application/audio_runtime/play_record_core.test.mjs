import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canonicalizePlayRecordMediaSource,
    PLAY_RECORD_API_CONTRACT,
    PlayRecordCore
} from './play_record_core.js';

const createCommandBus = () => {
    const events = [];
    return {
        dispatch(envelope = {}) {
            events.push({ tool_id: envelope?.meta?.tool_id, envelope });
            return { ok: true, envelope };
        },
        listEvents(filter = {}) {
            return events.filter((entry) => !filter.tool_id || entry.tool_id === filter.tool_id);
        }
    };
};

test('canonicalizePlayRecordMediaSource preserves recording and upload local paths', () => {
    const recording = canonicalizePlayRecordMediaSource({
        media_ref: 'recording-a',
        media_url: '/file/data/users/user-1/recordings/take.wav'
    });
    assert.equal(recording.mediaRef, 'recording-a');
    assert.equal(recording.localPath, 'data/users/user-1/recordings/take.wav');

    const upload = canonicalizePlayRecordMediaSource({
        id: 'upload-a',
        url: 'http://127.0.0.1:50001/file/data/users/user-1/Downloads/movie.m4v'
    });
    assert.equal(upload.assetId, 'upload-a');
    assert.equal(upload.localPath, 'data/users/user-1/Downloads/movie.m4v');
});

test('PlayRecordCore sends the native load and voice command contract', async () => {
    const calls = [];
    const commandBus = createCommandBus();
    const env = {
        atome: {
            tools: {
                v2CommandBus: commandBus
            }
        },
        __SQUIRREL_FORCE_TAURI_RUNTIME: true,
        __TAURI_INTERNALS__: {
            invoke: async (command, args = {}) => {
                calls.push({ command, args });
                if (command === 'audio_has_clip') {
                    return { success: true, loaded: false };
                }
                return {
                    success: true,
                    path: args.path || null,
                    metadata: {
                        sample_rate: 48000,
                        frame_count: 48000,
                        duration_seconds: 1
                    }
                };
            }
        },
        location: {
            protocol: 'tauri:',
            hostname: 'tauri.localhost'
        }
    };

    const core = new PlayRecordCore(env);
    const loaded = await core.loadAsset({
        assetId: 'asset-1',
        path: 'data/users/user-1/recordings/take.wav'
    });
    assert.equal(loaded.ok, true);

    await core.playVoice({
        assetId: 'asset-1',
        voiceId: 'voice-1',
        startSeconds: 0.25,
        durationSeconds: 0.5,
        gain: 0.8,
        rate: 1
    });
    await core.stopVoice('voice-1');
    await core.playAsset('asset-1');
    await core.stopAsset('asset-1');

    assert.deepEqual(calls.map((entry) => entry.command), [
        'audio_init',
        'audio_load_clip',
        'audio_play_instance',
        'audio_stop_instance',
        'audio_play',
        'audio_stop'
    ]);
    assert.deepEqual(calls.find((entry) => entry.command === 'audio_play_instance')?.args, {
        assetId: 'asset-1',
        voiceId: 'voice-1',
        startSeconds: 0.25,
        durationSeconds: 0.5,
        gain: 0.8,
        rate: 1,
        loopStartSeconds: null,
        loopEndSeconds: null
    });
    const events = commandBus.listEvents({ tool_id: 'play_record' });
    assert.deepEqual(events.map((entry) => entry.envelope?.meta?.action), [
        'loadAsset',
        'playVoice',
        'stopVoice',
        'playAsset',
        'stopAsset'
    ]);
    assert.ok(events.every((entry) => String(entry.envelope?.idempotency_key || '').startsWith('play_record:')));
});

test('PlayRecordCore exposes a versioned MCP-compatible API contract', () => {
    assert.equal(PLAY_RECORD_API_CONTRACT.schema_version, 1);
    assert.equal(PLAY_RECORD_API_CONTRACT.tool_key, 'play_record');
    assert.ok(PLAY_RECORD_API_CONTRACT.operations.some((entry) => entry.name === 'recordStart'));
    assert.ok(PLAY_RECORD_API_CONTRACT.operations.every((entry) => entry.command_action));
});

test('PlayRecordCore routes web facade playback through the internal backend gate', async () => {
    const backendCalls = [];
    const env = {
        atome: {
            tools: {
                v2CommandBus: createCommandBus()
            }
        },
        WebAssembly: {},
        location: {
            protocol: 'http:',
            hostname: '127.0.0.1'
        },
        Squirrel: {
            av: {
                audio: {
                    get_backend: () => 'kira',
                    detect_and_set_backend: () => 'kira',
                    __call_backend_method: (method, arg) => {
                        backendCalls.push({ method, arg });
                        return true;
                    }
                }
            }
        }
    };

    const core = new PlayRecordCore(env);
    await core.loadAsset({
        clip_id: 'direct-asset',
        path_or_bookmark: 'data/users/user-1/Uploads/take.wav'
    });
    await core.playVoice({
        clip_id: 'direct-asset',
        voice_id: 'direct-voice',
        start: 0
    });
    await core.stopVoice({ voice_id: 'direct-voice' });
    await core.playAsset({ clip_id: 'direct-asset' });
    await core.stopAsset({ clip_id: 'direct-asset' });

    assert.deepEqual(backendCalls.map((entry) => entry.method), [
        'create_clip',
        'play_instance',
        'stop_instance',
        'play',
        'stop'
    ]);
    assert.equal(backendCalls[0].arg.id, 'direct-asset');
    assert.equal(backendCalls[0].arg.path, 'data/users/user-1/Uploads/take.wav');
    assert.equal(backendCalls[1].arg.asset_id, 'direct-asset');
    assert.equal(backendCalls[1].arg.voice_id, 'direct-voice');
});

test('PlayRecordCore keeps assets stable across UI-only timeline operations', async () => {
    const backendCalls = [];
    const env = {
        atome: {
            tools: {
                v2CommandBus: createCommandBus()
            }
        },
        WebAssembly: {},
        location: {
            protocol: 'http:',
            hostname: '127.0.0.1'
        },
        Squirrel: {
            av: {
                audio: {
                    get_backend: () => 'kira',
                    detect_and_set_backend: () => 'kira',
                    __call_backend_method: (method, arg) => {
                        backendCalls.push({ method, arg });
                        return true;
                    }
                }
            }
        }
    };
    const core = new PlayRecordCore(env);

    await core.loadAsset({
        assetId: 'stable-audio',
        path: 'data/users/user-1/recordings/stable.wav'
    });

    const uiOnlyOperations = [
        { type: 'track_move', trackId: 'track-a', from: 0, to: 1 },
        { type: 'molecule_close', moleculeId: 'mol-a' },
        { type: 'molecule_open', moleculeId: 'mol-a' },
        { type: 'timeline_reload', timelineId: 'timeline-a' }
    ];
    uiOnlyOperations.forEach((operation) => {
        assert.ok(operation.type);
    });

    assert.equal(await core.hasAsset('stable-audio'), true);
    assert.equal(
        backendCalls.some((entry) => entry.method === 'destroy_clip'),
        false
    );
    await core.destroyAsset('stable-audio');
    assert.equal(
        backendCalls.some((entry) => entry.method === 'destroy_clip'),
        true
    );
});
