import assert from 'node:assert/strict';
import { MediaPlaybackAudioExecutor } from '../../eVe/domains/media/shared/media_playback_audio_executor.js';

globalThis.window = {
    location: { href: 'http://127.0.0.1:3001/', origin: 'http://127.0.0.1:3001' },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 16),
    cancelAnimationFrame: clearTimeout
};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
globalThis.HTMLVideoElement = class HTMLVideoElement {};

const [{ createMoleculeEngine, __moleculeTestUtils }, { buildVideoAudioSource }, { PlayRecordCore }] = await Promise.all([
    import('../../eVe/core/media_engine/molecule.js'),
    import('../../eVe/core/media_engine/molecule_support.js'),
    import('../../atome/src/application/audio_runtime/play_record_core.js')
]);

const extractedSource = buildVideoAudioSource({
    url: '/api/uploads/Jeezs_s_fire.m4v?media_user_id=probe_owner'
});
assert.deepEqual(extractedSource, {
    url: 'http://127.0.0.1:3001/api/extract-audio/Jeezs_s_fire.m4v?source=upload&media_user_id=probe_owner'
}, 'video extraction must preserve the canonical upload owner');

const nativeExtractedSource = buildVideoAudioSource({
    url: '/api/recordings/native_video.mp4?media_user_id=probe_owner',
    path: 'data/users/probe_owner/recordings/native_video.mp4'
});
assert.deepEqual(nativeExtractedSource, {
    url: 'http://127.0.0.1:3001/api/extract-audio/native_video.mp4?source=recording&media_user_id=probe_owner',
    path: 'data/users/probe_owner/recordings/native_video.mp4'
}, 'video extraction must preserve the local Kira path while deriving the Web URL');

const nativeCalls = [];
const nativeCore = new PlayRecordCore({
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __TAURI_INTERNALS__: {
        invoke: async (command, payload) => {
            nativeCalls.push({ command, payload });
            return { success: true };
        }
    },
    atome: {
        tools: {
            v2CommandBus: { dispatch: () => ({ ok: true }) }
        }
    }
});
await nativeCore.loadAsset({ assetId: 'native_video_audio', ...nativeExtractedSource });
assert.equal(
    nativeCalls.find(({ command }) => command === 'audio_load_clip')?.payload?.path,
    'data/users/probe_owner/recordings/native_video.mp4',
    'native Kira must load the local recording path, never the extraction URL'
);

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

const loadedAssets = new Set();
const identityCalls = [];
const identityEnv = {
    WebAssembly,
    atome: { tools: { v2CommandBus: { dispatch: () => ({ ok: true }) } } },
    Squirrel: { av: { audio: {
        get_backend: () => 'kira',
        __call_backend_method: async (method, payload) => {
            identityCalls.push({ method, payload });
            if (method === 'create_clip') loadedAssets.add(payload.id);
            if (method === 'play_instance' && !loadedAssets.has(payload.asset_id)) {
                throw new Error(`Clip '${payload.asset_id}' not found`);
            }
            return { success: true };
        }
    } } }
};
const identitySession = engine.createSession({ id: 'project_view_recursive_transport' });
identitySession.audio = new MediaPlaybackAudioExecutor(identityEnv, { core: new PlayRecordCore(identityEnv) });
await identitySession.setTimeline({
    tracks: [{ id: 'sequence', kind: 'audio', clips: [0, 1].map((index) => ({
        id: `project_view_clip_audio_recording_${index}`, kind: 'audio',
        start: index, duration: 1, source: { url: '/api/recordings/shared.wav' }
    })) }]
}, { commit: false });
assert.equal(identitySession.timeline.tracks[0].clips[0].source.assetId, '',
    'the reproduction must use the actual normalized unshared source shape');
await identitySession.play({ commit: false });
await identitySession.pause({ commit: false });
await identitySession.play({ startSeconds: 1.2, commit: false });
await identitySession.pause({ commit: false });
await identitySession.scrub(0.25, { previewOnly: true, commit: false });
await identitySession.seek(1.5, { commit: false });
await identitySession.play({ commit: false });
await identitySession.stop({ commit: false });
assert.equal(identitySession.getTransportState().position, 0);
assert.equal(identitySession.voiceState.size, 0);
const expectedAssets = [0, 1].map((index) => (
    `project_view_recursive_transport:project_view_clip_audio_recording_${index}:asset`
));
assert.deepEqual([...loadedAssets], expectedAssets);
assert.equal(identityCalls.filter(({ method }) => method === 'create_clip').length, 2,
    'pause, resume, seek and scrub reuse the two prepared assets without forced re-decoding');
assert.equal(identityCalls.filter(({ method }) => method === 'play_instance').length, 4);
identityCalls.filter(({ method }) => method === 'play_instance').forEach(({ payload }) => {
    assert.ok(expectedAssets.includes(payload.asset_id), 'every voice uses its loaded occurrence identity');
});

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
