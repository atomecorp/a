export const DEFAULT_LANG = 'fr-FR';
export const DEFAULT_STT_SILENCE_MS = 8000;
export const DEFAULT_STT_FINAL_SILENCE_MS = 2400;
export const DEFAULT_STT_MAX_ALTERNATIVES = 5;

export const toDebugPayload = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
};

export const debugVoiceService = (...args) => {
    void args;
};

export const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

export const getSpeechRecognitionCtor = (env) => readEnv(env, 'SpeechRecognition') || readEnv(env, 'webkitSpeechRecognition') || null;

export const getSpeechSynthesisUtteranceCtor = (env) => readEnv(env, 'SpeechSynthesisUtterance') || null;

export const getSpeechSynthesis = (env) => readEnv(env, 'speechSynthesis') || null;

export const getTauriSttBridge = (env) => {
    const tauri = readEnv(env, '__TAURI__');
    if (tauri?.stt && typeof tauri.stt.start === 'function') {
        return tauri.stt;
    }
    const internals = readEnv(env, '__TAURI_INTERNALS__');
    if (internals?.stt && typeof internals.stt.start === 'function') {
        return internals.stt;
    }
    return null;
};

export const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

export const wait = (ms = 0) => new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
});

export const createSegment = (text, confidence = null) => ({
    text: String(text || '').trim(),
    ...(Number.isFinite(confidence) ? { confidence } : {})
});

export const isPermissionGranted = (permission = null) => permission === 'granted';

export const isPermissionDenied = (permission = null) => permission === 'denied';

export const normalizeErrorMessage = (error) => String(error?.message || error?.code || error || '').trim();
