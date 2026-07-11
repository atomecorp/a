import { getAudioPlaybackAPI } from '../../application/audio_runtime/audio_playback_api.js';
import { analyzePcmRange, pcm16WavBytes, vowelFamilyForPhoneme } from './tts_pcm_analysis.js';
import { createTtsFrameBus } from './tts_frame_bus.js';

const FRAME_MS = 20;
const audiblePhonemes = (phonemes) => phonemes.filter((phoneme) => !/^[_^$ (),.!?:;\-]$/.test(phoneme));

export const createLocalTtsRuntime = ({
    env = globalThis,
    audio = getAudioPlaybackAPI(env),
    frameBus = createTtsFrameBus(),
    workerFactory = () => new env.Worker(new URL('./local_tts_worker.js', import.meta.url), { type: 'module' }),
    now = () => env.performance?.now?.() ?? Date.now(),
    setTimer = (callback, delay) => env.setInterval(callback, delay),
    clearTimer = (id) => env.clearInterval(id),
    setDelay = (callback, delay) => env.setTimeout(callback, delay),
    clearDelay = (id) => env.clearTimeout(id)
} = {}) => {
    const pending = new Map();
    const sessions = new Map();
    let sequence = 0;
    let worker;

    const ensureWorker = () => {
        if (worker) return worker;
        worker = workerFactory();
        worker.onmessage = ({ data }) => {
            const request = pending.get(data?.id);
            if (!request) return;
            pending.delete(data.id);
            if (data.type === 'error') request.reject(new Error(data.error));
            else request.resolve(data);
        };
        worker.onerror = (event) => {
            const error = new Error(event?.message || 'local_tts_worker_failed');
            pending.forEach(({ reject }) => reject(error));
            pending.clear();
        };
        return worker;
    };

    const request = (type, payload = {}) => new Promise((resolve, reject) => {
        const id = `local_tts_${++sequence}`;
        pending.set(id, { reject, resolve });
        ensureWorker().postMessage({ id, type, ...payload });
    });

    const stop = async (sessionId, reason = 'tts_stop') => {
        const id = String(sessionId || '');
        const state = sessions.get(id);
        if (!state) return { session_id: id, stopped: false };
        sessions.delete(id);
        clearTimer(state.frameTimer);
        clearDelay(state.endTimer);
        await audio.stopVoice({ voiceId: state.voiceId, source_layer: 'voice_local_tts' });
        await audio.releaseTransientAsset(state.assetId);
        state.resolve({ session_id: id, provider: 'local_onnx', stopped: true, reason });
        return { session_id: id, stopped: true };
    };

    const speak = async (sessionId, text) => {
        const id = String(sessionId || '').trim();
        if (!id) throw new Error('local_tts_session_required');
        await stop(id, 'tts_replaced');
        const generated = await request('synthesize', { text: String(text || '') });
        const pcm = generated.pcm instanceof Float32Array ? generated.pcm : new Float32Array(generated.pcm);
        const sampleRate = Math.trunc(Number(generated.sampleRate));
        if (!pcm.length || sampleRate <= 0) throw new Error('local_tts_pcm_invalid');
        const assetId = `__voice_tts_asset_${id}`;
        const voiceId = `__voice_tts_voice_${id}`;
        await audio.loadTransientAsset({
            assetId,
            bytes: pcm16WavBytes(pcm, sampleRate),
            source_layer: 'voice_local_tts'
        });
        await audio.startVoice({ assetId, voiceId, source_layer: 'voice_local_tts' });
        const startedAt = now();
        const durationMs = pcm.length / sampleRate * 1000;
        const phonemes = audiblePhonemes(generated.phonemes || []);
        let resolvePlayback;
        let rejectPlayback;
        const promise = new Promise((resolve, reject) => {
            resolvePlayback = resolve;
            rejectPlayback = reject;
        });
        const publishCurrentFrame = () => {
            const playbackSample = Math.min(pcm.length, Math.max(0, Math.floor((now() - startedAt) * sampleRate / 1000)));
            const windowSamples = Math.max(1, Math.round(sampleRate * FRAME_MS / 1000));
            const analysis = analyzePcmRange(pcm, playbackSample, playbackSample + windowSamples);
            const phoneme = phonemes[Math.min(phonemes.length - 1, Math.floor(playbackSample / pcm.length * phonemes.length))] || '';
            frameBus.publish({
                session_id: id,
                playback_sample: playbackSample,
                sample_rate: sampleRate,
                rms: analysis.rms,
                peak: analysis.peak,
                phoneme,
                vowel: analysis.voiced ? vowelFamilyForPhoneme(phoneme) : '',
                confidence: analysis.voiced ? Math.min(1, analysis.rms * 8) : 0,
                progress: playbackSample / pcm.length
            });
        };
        const finish = async () => {
            const state = sessions.get(id);
            if (!state) return;
            sessions.delete(id);
            clearTimer(state.frameTimer);
            publishCurrentFrame();
            try {
                await audio.stopVoice({ voiceId, source_layer: 'voice_local_tts' });
                await audio.releaseTransientAsset(assetId);
                resolvePlayback({ session_id: id, provider: 'local_onnx', text });
            } catch (error) {
                rejectPlayback(error);
            }
        };
        const state = {
            assetId,
            voiceId,
            resolve: resolvePlayback,
            frameTimer: setTimer(publishCurrentFrame, FRAME_MS),
            endTimer: setDelay(() => { void finish(); }, durationMs)
        };
        sessions.set(id, state);
        publishCurrentFrame();
        return { session_id: id, provider: 'local_onnx', promise };
    };

    return Object.freeze({
        preload: () => request('preload'),
        speak,
        stop,
        subscribeFrames: (listener) => frameBus.subscribe(listener)
    });
};
