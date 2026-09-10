import { getAudioPlaybackAPI } from '../../application/audio_runtime/audio_playback_api.js';
import { analyzePcmRange, pcm16WavBytes, vowelFamilyForPhoneme } from './tts_pcm_analysis.js';
import { createTtsFrameBus } from './tts_frame_bus.js';

const FRAME_MS = 20;
const audiblePhonemes = (phonemes) => phonemes.filter((phoneme) => !/^[_^$ (),.!?:;\-]$/.test(phoneme));

export const createTtsRuntime = ({
    env = globalThis,
    synthesize = null, provider = 'local_onnx',
    audio = getAudioPlaybackAPI(env),
    frameBus = createTtsFrameBus(),
    workerFactory = () => new env.Worker('/src/squirrel/voice/local_tts_worker.js', { type: 'module' }),
    now = () => env.performance?.now?.() ?? Date.now(),
    setTimer = (callback, delay) => env.setInterval(callback, delay),
    clearTimer = (id) => env.clearInterval(id),
    setDelay = (callback, delay) => env.setTimeout(callback, delay),
    clearDelay = (id) => env.clearTimeout(id)
} = {}) => {
    const pending = new Map();
    const sessions = new Map();
    const generating = new Map();
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
        const pendingSynthesis = generating.get(id);
        pendingSynthesis?.abort(); generating.delete(id);
        const state = sessions.get(id);
        if (!state) return { session_id: id, stopped: Boolean(pendingSynthesis) };
        sessions.delete(id);
        clearTimer(state.frameTimer);
        clearDelay(state.endTimer);
        try {
            try { await audio.stopVoice({ voiceId: state.voiceId, source_layer: 'voice_tts' }); }
            finally { await audio.releaseTransientAsset(state.assetId); }
            state.resolve({ session_id: id, provider, stopped: true, reason });
        } catch (error) { state.reject(error); throw error; }
        return { session_id: id, stopped: true };
    };

    const speak = async (sessionId, text) => {
        const id = String(sessionId || '').trim();
        if (!id) throw new Error('local_tts_session_required');
        await stop(id, 'tts_replaced');
        const controller = new AbortController();
        generating.set(id, controller);
        let generated, pcm, sampleRate, loaded = false;
        const assetId = `__voice_tts_asset_${id}_${++sequence}`;
        const voiceId = `__voice_tts_voice_${id}_${sequence}`;
        try {
            generated = synthesize ? await synthesize(String(text || ''), controller.signal)
                : await request('synthesize', { text: String(text || '') });
            controller.signal.throwIfAborted();
            pcm = generated.pcm instanceof Float32Array ? generated.pcm : new Float32Array(generated.pcm);
            sampleRate = Math.trunc(Number(generated.sampleRate));
            if (!pcm.length || sampleRate <= 0) throw new Error('tts_pcm_invalid');
            await audio.loadTransientAsset({ assetId, bytes: pcm16WavBytes(pcm, sampleRate), source_layer: 'voice_tts' });
            loaded = true; controller.signal.throwIfAborted();
            await audio.startVoice({ assetId, voiceId, source_layer: 'voice_tts' });
            controller.signal.throwIfAborted();
        } catch (error) {
            if (loaded) {
                try { await audio.stopVoice({ voiceId }); }
                finally { await audio.releaseTransientAsset(assetId); }
            }
            throw error;
        } finally { if (generating.get(id) === controller) generating.delete(id); }
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
                try { await audio.stopVoice({ voiceId, source_layer: 'voice_tts' }); }
                finally { await audio.releaseTransientAsset(assetId); }
                resolvePlayback({ session_id: id, provider, text });
            } catch (error) {
                rejectPlayback(error);
            }
        };
        const state = {
            assetId,
            voiceId,
            resolve: resolvePlayback, reject: rejectPlayback,
            frameTimer: setTimer(publishCurrentFrame, FRAME_MS),
            endTimer: setDelay(() => { void finish(); }, durationMs)
        };
        sessions.set(id, state);
        publishCurrentFrame();
        return { session_id: id, provider, promise };
    };

    return Object.freeze({
        preload: () => request('preload'),
        speak,
        stop,
        subscribeFrames: (listener) => frameBus.subscribe(listener)
    });
};

// Reading an existing reply is an output-only action, separate from microphone
// capture. Its generation also covers lazy voice-service initialization.
export const createReadAloudController = ({ getText, prepareVoice, pauseInput, isActive, observeBudget = null, budgetMessage, onError = error => console.error(error.message) }) => {
    let generation = 0, voice = null, sessionId = null;
    const sessionKey = globalThis.crypto.randomUUID();
    const stop = async () => {
        generation++;
        const id = sessionId; sessionId = null;
        if (id) await voice?.stopSpeaking(id);
    };
    const api = Object.freeze({
        stop,
        async read({ text = getText(), engine = 'openai' } = {}) {
            pauseInput(); await stop();
            const token = generation;
            if (!text) return;
            voice = await prepareVoice();
            if (token !== generation || !isActive()) return;
            if (!voice) throw new Error('voice_api_unavailable');
            const session = await voice.createSession({ session_id: sessionKey, source_layer: 'assistant_read_aloud' });
            if (token !== generation || !isActive()) return;
            sessionId = session.session_id;
            const playback = await voice.speak(text, { session_id: sessionId, engine });
            void playback?.promise?.catch(onError);
            return playback;
        }
    });
    let lastBudget = 'unknown';
    observeBudget?.(snapshot => {
        const status = snapshot.budget?.budget_state;
        if (!status || status === lastBudget) return;
        lastBudget = status;
        if (isActive() && ['critical', 'exhausted'].includes(status)) {
            void api.read({ text: budgetMessage(status), engine: 'local_onnx' }).catch(onError);
        }
    });
    return api;
};
