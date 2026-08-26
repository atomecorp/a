import assert from 'node:assert/strict';

import {
    createMediaPlaybackCommand,
    mediaPlaybackCommandEndSeconds,
    resolveMediaPlaybackAudioSource
} from '../../eVe/domains/media/shared/media_playback_command.js';
import { MediaPlaybackAudioExecutor } from '../../eVe/domains/media/shared/media_playback_audio_executor.js';

const recordedVideo = createMediaPlaybackCommand({
    atomeId: 'video_recording_1',
    kind: 'video_recording',
    source: '/api/recordings/video_1.mp4?media_user_id=user_1',
    startSeconds: 2,
    durationSeconds: 3.626,
    sourceInSeconds: 0.5,
    hasAudio: true
});
assert.equal(recordedVideo.kind, 'video');
assert.equal(recordedVideo.playbackRate, 1, 'natural playback must not stretch implicitly');
assert.equal(recordedVideo.durationSeconds, 3.626, 'the scheduler duration must remain unchanged');
assert.equal(recordedVideo.sourceInSeconds, 0.5, 'an explicit crop point must be preserved');
assert.equal(mediaPlaybackCommandEndSeconds(recordedVideo), 5.6259999999999994);
assert.match(
    resolveMediaPlaybackAudioSource(recordedVideo).url,
    /\/api\/extract-audio\/video_1\.mp4\?source=recording&media_user_id=user_1$/
);

const recordedAudio = createMediaPlaybackCommand({
    atomeId: 'audio_recording_1',
    kind: 'audio_recording',
    source: '/api/recordings/audio_1.wav',
    playbackRate: 0.75,
    gain: 0.25,
    pan: -0.4
});
assert.equal(recordedAudio.kind, 'audio');
assert.equal(recordedAudio.playbackRate, 0.75, 'an explicit user speed must be preserved');
assert.equal(recordedAudio.gain, 0.25);
assert.equal(recordedAudio.pan, -0.4);
assert.equal(resolveMediaPlaybackAudioSource(recordedAudio).url, '/api/recordings/audio_1.wav');

const silentVideo = createMediaPlaybackCommand({
    kind: 'video', source: '/api/uploads/silent.mp4', hasAudio: false
});
assert.equal(resolveMediaPlaybackAudioSource(silentVideo), null);

const calls = [];
const env = {
    Squirrel: {
        av: {
            audio: {
                playback: {
                    loadAsset: async (payload) => { calls.push({ type: 'load', payload }); return { ok: true, duration_seconds: 8 }; }
                },
                play_instance: async (payload) => { calls.push({ type: 'play', payload }); return { ok: true }; },
                stop_instance: async (payload) => { calls.push({ type: 'stop_voice', payload }); return { ok: true }; },
                stop: async (payload) => { calls.push({ type: 'stop_asset', payload }); return { ok: true }; }
            }
        }
    }
};
const executor = new MediaPlaybackAudioExecutor(env);
const prepared = await executor.prepareCommand(createMediaPlaybackCommand({
    atomeId: 'shared_audio',
    kind: 'audio_recording',
    source: '/api/recordings/shared.wav',
    durationSeconds: 8,
    playbackRate: 1,
    gain: 0.25,
    pan: 0.4,
    assetId: 'shared_asset',
    voiceId: 'shared_voice'
}));
assert.equal(prepared.ok, true);
const started = await executor.startPrepared(prepared, 0);
assert.equal(started.ok, true);
assert.equal(calls.find(({ type }) => type === 'play').payload.rate, 1, 'the executor must not derive stretch from transport duration');
assert.equal(calls.find(({ type }) => type === 'play').payload.gain, 0.25);
assert.equal(calls.find(({ type }) => type === 'play').payload.pan, 0.4);
await executor.stopPrepared(started);
assert.equal(calls.filter(({ type }) => type === 'stop_voice').length, 1);
assert.equal(calls.filter(({ type }) => type === 'stop_asset').length, 1);

console.log('media_playback_command.probe: PASS');
