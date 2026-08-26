import assert from 'node:assert/strict';

globalThis.window = {
    location: { href: 'http://127.0.0.1:3001/', origin: 'http://127.0.0.1:3001' },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 16),
    cancelAnimationFrame: clearTimeout
};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
globalThis.HTMLVideoElement = class HTMLVideoElement {};

const [{ createMoleculeEngine, __moleculeTestUtils }, { buildVideoAudioSource }] = await Promise.all([
    import('../../eVe/core/media_engine/molecule.js'),
    import('../../eVe/core/media_engine/molecule_support.js')
]);

const extractedSource = buildVideoAudioSource({
    url: '/api/uploads/Jeezs_s_fire.m4v?media_user_id=probe_owner'
});
assert.deepEqual(extractedSource, {
    url: 'http://127.0.0.1:3001/api/extract-audio/Jeezs_s_fire.m4v?source=upload&media_user_id=probe_owner'
}, 'video extraction must preserve the canonical upload owner');

const engine = createMoleculeEngine();
const normalSession = engine.createSession({ id: 'molecule_audio_mix_normal' });
const normalCalls = [];
normalSession.audio = {
    loadAsset: async (payload) => { normalCalls.push({ action: 'load', payload }); return { ok: true }; },
    stopVoice: async (voiceId) => { normalCalls.push({ action: 'stop', voiceId }); return { ok: true }; },
    playVoice: async (payload) => { normalCalls.push({ action: 'play', payload }); return { ok: true }; }
};

const normalClips = [
    {
        id: 'video_clip', kind: 'video', start: 0, duration: 5, inPoint: 0,
        playbackRate: 1, gain: 1, trackGain: 1, trackPan: 0, fadeIn: 0, fadeOut: 0
    },
    {
        id: 'audio_clip', kind: 'audio', start: 0, duration: 8, inPoint: 0,
        playbackRate: 1, gain: 1, trackGain: 1, trackPan: 0, fadeIn: 0, fadeOut: 0
    }
];
normalSession.runtimeClips.set('video_clip', {
    clipId: 'video_clip', assetId: 'video_asset', voiceId: 'video_voice',
    previewVoiceId: 'video_preview', audioAvailable: false, audioLoading: null,
    audioLoadError: '', audioSource: extractedSource, playing: false, lastGain: null, video: null
});
normalSession.runtimeClips.set('audio_clip', {
    clipId: 'audio_clip', assetId: 'audio_asset', voiceId: 'audio_voice',
    previewVoiceId: 'audio_preview', audioAvailable: true, audioLoading: null,
    audioLoadError: '', audioSource: null, playing: false, lastGain: null, video: null
});

await normalSession._playActiveVoices(0, normalClips, {});
assert.equal(normalCalls.filter((call) => call.action === 'load').length, 1,
    'normal play must load the extracted video-audio asset');
assert.deepEqual(normalCalls.filter((call) => call.action === 'play').map((call) => call.payload.voiceId),
    ['video_voice', 'audio_voice'], 'normal play must use durable voices for both simultaneous clips');
assert.equal(normalSession.runtimeClips.get('video_clip').playing, true);
assert.equal(normalSession.runtimeClips.get('audio_clip').playing, true);
assert.equal(normalSession.voiceState.size, 2);

const delayedClip = {
    id: 'delayed_audio', kind: 'audio', start: 2, duration: 3, inPoint: 0,
    playbackRate: 1, gain: 1, trackGain: 0.25, trackPan: 0.2, fadeIn: 0, fadeOut: 0
};
normalSession.runtimeClips.set('delayed_audio', {
    clipId: 'delayed_audio', assetId: 'delayed_asset', voiceId: 'delayed_voice',
    previewVoiceId: 'delayed_preview', audioAvailable: true, audioLoading: null,
    audioLoadError: '', audioSource: null, playing: false, lastGain: null
});
await normalSession._syncVoiceEnvelopes(2, [delayedClip]);
const delayedStart = normalCalls.find((call) => call.action === 'play' && call.payload.voiceId === 'delayed_voice');
assert.equal(delayedStart.payload.startSeconds, 0,
    'a clip entering the active window must start when its timeline instant is reached');
assert.equal(delayedStart.payload.gain, 0.25,
    'the persisted Track gain must be applied once, not squared');

const failureSession = engine.createSession({ id: 'molecule_audio_mix_failure' });
const failureCalls = [];
failureSession.timeline = __moleculeTestUtils.normalizeTimeline({
    id: 'failure_timeline',
    tracks: [
        { id: 'audio_track', type: 'audio', clips: [{ id: 'first_audio', kind: 'audio', start: 0, duration: 8 }] },
        {
            id: 'video_track', type: 'video',
            clips: [{
                id: 'failing_video', kind: 'video', start: 0, duration: 5,
                source: { url: '/api/uploads/failing.m4v?media_user_id=probe_owner' }
            }]
        }
    ]
});
failureSession.transport.duration = failureSession.timeline.duration;
failureSession.prepare = async () => ({ ok: true });
failureSession.audio = {
    loadAsset: async () => { throw new Error('kira_decode_failed'); },
    playVoice: async (payload) => { failureCalls.push({ action: 'play', payload }); return { ok: true }; },
    stopVoice: async (voiceId) => { failureCalls.push({ action: 'stop', voiceId }); return { ok: true }; }
};
failureSession.runtimeClips.set('first_audio', {
    clipId: 'first_audio', assetId: 'first_asset', voiceId: 'first_voice',
    previewVoiceId: 'first_preview', audioAvailable: true, audioLoading: null,
    audioLoadError: '', audioSource: null, playing: false, lastGain: null, video: null
});
failureSession.runtimeClips.set('failing_video', {
    clipId: 'failing_video', assetId: 'video_asset', voiceId: 'video_voice',
    previewVoiceId: 'video_preview', audioAvailable: false, audioLoading: null,
    audioLoadError: '', audioSource: buildVideoAudioSource({ url: '/api/uploads/failing.m4v?media_user_id=probe_owner' }),
    playing: false, lastGain: null, video: null
});

await assert.rejects(
    () => failureSession._startAt(0),
    /molecule_video_audio_load_failed:failing_video:kira_decode_failed/
);
assert.equal(failureSession.transport.playing, false, 'failed multi-voice start must stop the transport');
assert.equal(failureSession.voiceState.size, 0, 'failed multi-voice start must clear all active voice state');
assert.equal(failureSession.runtimeClips.get('first_audio').playing, false,
    'a voice started before the failure must be released atomically');
assert.ok(failureCalls.some((call) => call.action === 'stop' && call.voiceId === 'first_voice'),
    'atomic cleanup must stop the already-started durable voice');
assert.equal(failureSession.runtimeClips.get('failing_video').audioSource.url,
    'http://127.0.0.1:3001/api/extract-audio/failing.m4v?source=upload&media_user_id=probe_owner',
    'a failed load must retain its canonical source for diagnosis and retry');

console.log(JSON.stringify({
    ok: true,
    extracted_source: extractedSource.url,
    normal_voice_ids: normalCalls.filter((call) => call.action === 'play').map((call) => call.payload.voiceId),
    atomic_cleanup_stops: failureCalls.filter((call) => call.action === 'stop').map((call) => call.voiceId)
}, null, 2));
