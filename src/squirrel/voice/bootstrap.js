import { createVoiceService } from './service.js';
import { bootstrapMainHandleVoiceEntry } from './main_handle_bridge.js';

const READY_PROMISE_KEY = '__SQUIRREL_VOICE_READY_PROMISE__';
const SERVICE_KEY = '__SQUIRREL_VOICE_SERVICE__';
const API_KEY = '__SQUIRREL_VOICE_API__';

const toDebugPayload = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
};

const debugVoiceBootstrap = (...args) => {
    void args;
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const defaultImportModule = (path) => import(path);

const isTauriLikeEnv = (env) => {
    if (!env || typeof env !== 'object') return false;
    if (env.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (env.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = env.location?.protocol || '';
    const host = env.location?.hostname || '';
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || host === 'tauri.localhost') return true;
    const hasTauriInvoke = !!(env.__TAURI_INTERNALS__ && typeof env.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(env.__TAURI__ || env.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    if (typeof env.navigator !== 'undefined' && /tauri/i.test(env.navigator.userAgent || '')) return true;
    return false;
};

export const ensureVoiceBridgeModules = async ({
    env = globalThis,
    importModule = defaultImportModule
} = {}) => {
    if (!env || typeof env !== 'object') return [];
    const loaded = [];
    const tauri = isTauriLikeEnv(env);
    debugVoiceBootstrap('bridge_modules:resolve', {
        tauri,
        hasTauri: !!readEnv(env, '__TAURI__'),
        hasTauriInternals: !!readEnv(env, '__TAURI_INTERNALS__')
    });

    if (tauri && typeof readEnv(env, '__toDSP') !== 'function') {
        await importModule('../../application/audio_runtime/tauri_audio_bridge.js');
        loaded.push('tauri_audio_bridge');
    }

    if (tauri && (typeof readEnv(env, 'record_start') !== 'function' || typeof readEnv(env, 'record_stop') !== 'function')) {
        await importModule('../../application/audio_runtime/record_audio_api.js');
        loaded.push('record_audio_api');
    }

    const tauriGlobal = readEnv(env, '__TAURI__');
    const tauriInternals = readEnv(env, '__TAURI_INTERNALS__');
    if (tauri && !(tauriGlobal?.stt || tauriInternals?.stt)) {
        await importModule('../../application/audio_runtime/stt_api.js');
        loaded.push('stt_api');
    }

    debugVoiceBootstrap('bridge_modules:loaded', {
        loaded
    });
    return loaded;
};

const getOrCreateService = (env) => {
    if (env[SERVICE_KEY]) {
        return env[SERVICE_KEY];
    }
    const service = createVoiceService({
        env
    });
    env[SERVICE_KEY] = service;
    return service;
};

const installVoiceGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.voice = api;

    env.atome = env.atome || {};
    env.atome.voice = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.voice = api;

    env.AtomeVoice = api;
    return api;
};

export const createGlobalVoiceApi = ({
    env = globalThis,
    importModule = defaultImportModule
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global voice bootstrap requires an object-like environment');
    }

    if (env[API_KEY]) {
        return env[API_KEY];
    }

    const ensureReady = async () => {
        if (!env[READY_PROMISE_KEY]) {
            env[READY_PROMISE_KEY] = (async () => {
                debugVoiceBootstrap('ensure_ready:start');
                await ensureVoiceBridgeModules({ env, importModule });
                const service = getOrCreateService(env);
                debugVoiceBootstrap('ensure_ready:service_ready', {
                    stt: service?.providers?.stt?.selected || null,
                    tts: service?.providers?.tts?.selected || null,
                    capture: service?.providers?.capture?.selected || null
                });
                return service;
            })();
        }
        return env[READY_PROMISE_KEY];
    };

    const api = {
        ensureReady,
        get service() {
            return env[SERVICE_KEY] || null;
        },
        get providers() {
            return env[SERVICE_KEY]?.providers || null;
        },
        get runtime() {
            return env[SERVICE_KEY]?.runtime || null;
        },
        get orchestrator() {
            return env[SERVICE_KEY]?.orchestrator || null;
        },
        get telemetry() {
            return env[SERVICE_KEY]?.telemetry || null;
        },
        get vad() {
            return env[SERVICE_KEY]?.vad || null;
        },
        async createSession(options = {}) {
            const service = await ensureReady();
            return service.runtime.createSession(options);
        },
        async getSession(sessionId) {
            const service = await ensureReady();
            return service.runtime.getSession(sessionId);
        },
        async getActiveIntent(sessionId) {
            const service = await ensureReady();
            return service.runtime.getActiveIntent(sessionId);
        },
        async listSessions(options = {}) {
            const service = await ensureReady();
            return service.runtime.listSessions(options);
        },
        subscribe(listener) {
            let unsubscribe = () => {};
            ensureReady()
                .then((service) => {
                    unsubscribe = service.runtime.subscribe(listener);
                })
                .catch((error) => {
                    if (env?.console?.warn) {
                        env.console.warn('[voice.bootstrap] Voice subscription failed:', error?.message || error);
                    }
                });
            return () => unsubscribe();
        },
        async listen(options = {}) {
            const service = await ensureReady();
            return service.listen(options);
        },
        async startListening(options = {}) {
            const service = await ensureReady();
            return service.stt.start(options);
        },
        async stopListening(sessionId, options = {}) {
            const service = await ensureReady();
            return service.stt.stop(sessionId, options);
        },
        async cancelListening(sessionId) {
            const service = await ensureReady();
            return service.stt.cancel(sessionId);
        },
        async speak(text, options = {}) {
            const service = await ensureReady();
            return service.tts.speak(text, options);
        },
        async stopSpeaking(sessionId, options = {}) {
            const service = await ensureReady();
            return service.tts.stop(sessionId, options);
        },
        async interrupt(sessionId, options = {}) {
            const service = await ensureReady();
            return service.interrupt(sessionId, options);
        },
        async startCapture(options = {}) {
            const service = await ensureReady();
            return service.capture.start(options);
        },
        async stopCapture(sessionId) {
            const service = await ensureReady();
            return service.capture.stop(sessionId);
        },
        async cancelCapture(sessionId) {
            const service = await ensureReady();
            return service.capture.cancel(sessionId);
        },
        async runProcessing(sessionId, executor, payload = {}) {
            const service = await ensureReady();
            return service.processing.run(sessionId, executor, payload);
        },
        async takePendingFollowup(sessionId, options = {}) {
            const service = await ensureReady();
            return service.takePendingFollowup(sessionId, options);
        },
        async planUtterance(utterance, options = {}) {
            const service = await ensureReady();
            return service.planUtterance(utterance, options);
        },
        async executeIntent(intent, options = {}) {
            const service = await ensureReady();
            return service.executeIntent(intent, options);
        },
        async executeUtterance(utterance, options = {}) {
            const service = await ensureReady();
            return service.executeUtterance(utterance, options);
        },
        async planFollowup(sessionId, options = {}) {
            const service = await ensureReady();
            return service.planFollowup(sessionId, options);
        },
        async executeFollowup(sessionId, options = {}) {
            const service = await ensureReady();
            return service.executeFollowup(sessionId, options);
        }
    };

    env[API_KEY] = installVoiceGlobals(env, api);
    return env[API_KEY];
};

export const bootstrapGlobalVoice = ({
    env = (typeof window !== 'undefined' ? window : globalThis),
    importModule = defaultImportModule
} = {}) => {
    const api = createGlobalVoiceApi({ env, importModule });
    bootstrapMainHandleVoiceEntry({ env, importModule });
    api.ensureReady().catch((error) => {
        if (env?.console?.warn) {
            env.console.warn('[voice.bootstrap] Voice bootstrap failed:', error?.message || error);
        }
    });
    return api;
};

if (typeof window !== 'undefined') {
    bootstrapGlobalVoice({ env: window });
}
