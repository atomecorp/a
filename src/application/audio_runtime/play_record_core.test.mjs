import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canonicalizePlayRecordMediaSource,
    PlayRecordCore
} from './play_record_core.js';

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
    const env = {
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

    assert.deepEqual(calls.map((entry) => entry.command), [
        'audio_init',
        'audio_load_clip',
        'audio_play_instance',
        'audio_stop_instance'
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
});
