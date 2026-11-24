import { createNativeVoiceEngine } from './native_voice_engine.js';

// On a device (Tauri desktop and Android, the iOS app) « Ève, écoute-moi » is heard by the native
// voice engine (atome-audio-engine voice/wake.rs), the detector the guided conversation hangs up on:
// one detector, its models run natively and the microphone never crosses to JavaScript. Standby
// opens the engine in 'wake' mode, which loads the wake models alone; enrollment in 'collect' mode,
// which hands every scored window over. The browser keeps the worker (wake_detector_worker.js).
const NATIVE_CODES = Object.freeze({
    voice_session_busy: 'wake_capture_busy',
    voice_capture_overrun: 'wake_capture_overrun',
    voice_capture_stopped: 'wake_capture_failed',
    voice_session_stopped: 'wake_capture_failed'
});
const KNOWN = new Set(['wake_capture_busy', 'wake_capture_overrun', 'wake_capture_failed', 'microphone_permission_denied']);

const wakeCode = (error) => {
    const code = String(error?.message || error || '');
    if (NATIVE_CODES[code]) return NATIVE_CODES[code];
    if (KNOWN.has(code)) return code;
    return code.startsWith('voice_model_unavailable') || code.includes('wake_classifier_invalid') ? 'wake_model_missing' : 'wake_engine_failed';
};

export const createNativeWakeEngine = ({ env = globalThis, createEngine = createNativeVoiceEngine } = {}) => {
    let session = null;
    const open = async ({ onDetection = () => {}, onWindow = () => {}, onError, collect = false, verifier }) => {
        if (session) throw new Error('wake_engine_busy');
        const current = {};
        session = current;
        let closed = false, closing = null, engine = null;
        const onEvent = (event) => {
            if (closed) return;
            if (event.type === 'wake') onDetection(event.score);
            else if (event.type === 'window') onWindow({ window: Float32Array.from(event.window), baseScore: event.base_score });
            else if (event.type === 'error') onError(new Error(wakeCode(event.code)));
        };
        return {
            async start() {
                if (closed) throw new Error('wake_engine_closed');
                engine = createEngine({ env, onEvent });
                try {
                    await engine.start({ listening: collect ? 'collect' : 'wake' });
                    if (verifier) await engine.setWakeVerifier(typeof verifier === 'string' ? verifier : JSON.stringify(verifier));
                } catch (error) {
                    await engine.stop();
                    throw new Error(wakeCode(error));
                }
                if (closed) await engine.stop();
            },
            close() {
                closed = true;
                closing ||= (async () => {
                    try { await engine?.stop(); }
                    finally { if (session === current) session = null; }
                })();
                return closing;
            }
        };
    };
    // The native engine frees its models when its session stops: nothing is kept between sessions.
    return { open, release() {} };
};
