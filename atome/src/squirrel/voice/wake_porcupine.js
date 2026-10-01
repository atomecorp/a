import { createGlobalSecurityApi } from '../security/bootstrap.js';
import { loadRuntimeUserProfile } from '../ai/profile_loader.js';
import { getTauriInvoke, isTauriAudioRuntime, isIosHostAppRuntime } from '../../application/audio_runtime/runtime_audio_backend.js';

const entryId = userId => 'voice.wake.porcupine.' + encodeURIComponent(userId);
export const createPorcupineWakeBackend = ({ env = globalThis,
    loadSdk = () => import('../../assets/vendor/porcupine/porcupine.bundle.js'),
    loadProfile = () => loadRuntimeUserProfile({ env }),
    security = createGlobalSecurityApi({ env })
} = {}) => {
    const principal = async () => {
        const profile = await loadProfile();
        if (!profile?.ok || !profile.userId) throw new Error('wake_principal_unavailable');
        return profile.userId;
    };
    const vault = () => {
        if (security.vaultStatus().configured !== true) throw new Error('wake_vault_locked');
    };
    const validate = value => {
        if (!value?.accessKey) throw new Error('wake_key_missing');
        if (!value?.keywordPath || !value?.modelPath) throw new Error('wake_model_missing');
        for (const path of [value.keywordPath, value.modelPath]) {
            const url = new URL(path, env.location?.href);
            if (url.origin !== env.location?.origin) throw new Error('wake_model_origin_invalid');
        }
        return value;
    };
    return {
        async captureAvailable() {
            if (!isTauriAudioRuntime(env) && !isIosHostAppRuntime(env)) return false;
            const data = await getTauriInvoke(env)('audio_wake_read', {});
            return data?.busy !== true && data?.failed !== true;
        },
        async configure(config) {
            const value = validate(config), userId = await principal();
            vault();
            await security.storeToken(entryId(userId), {
                accessKey: String(value.accessKey), keywordPath: String(value.keywordPath), modelPath: String(value.modelPath),
                locale: 'fr-FR', phrase: 'Ève, écoute-moi', modelVersion: String(value.modelVersion || '1')
            }, { provider: 'porcupine' });
        },
        async create({ onDetection, onError }) {
            const userId = await principal();
            vault();
            const stored = await security.readToken(entryId(userId));
            const config = validate(stored?.ok ? stored.value : null);
            const { PorcupineWorker, WebVoiceProcessor } = await loadSdk();
            if (userId !== await principal()) throw new Error('wake_principal_changed');
            // All hosts execute the WASM engine in a worker, so the custom keyword targets Web (WASM).
            const engine = await PorcupineWorker.create(config.accessKey, [{ publicPath: config.keywordPath,
                label: config.phrase, sensitivity: 0.5, customWritePath: 'eve-wake-fr-' + config.modelVersion,
                version: Number(config.modelVersion) || 1 }], onDetection,
                { publicPath: config.modelPath, customWritePath: 'eve-wake-fr-params-' + config.modelVersion },
                { processErrorCallback: () => onError(new Error('wake_engine_failed')) }).catch(() => { throw new Error('wake_engine_failed'); });
            let subscribed = false, timer = null, closed = false, closing = null, input = [];
            const native = isTauriAudioRuntime(env) || isIosHostAppRuntime(env);
            const invoke = native ? getTauriInvoke(env) : null;
            const stopCapture = async () => {
                if (timer !== null) env.clearTimeout(timer);
                timer = null; input = [];
                if (native && subscribed) await invoke('audio_wake_stop', {});
                if (!native && subscribed) await WebVoiceProcessor.unsubscribe(engine);
                subscribed = false;
            };
            const readNative = async () => {
                if (closed || !subscribed) return;
                try {
                    const data = await invoke('audio_wake_read', {});
                    if (closed || !subscribed) return;
                    if (data?.active !== true) throw new Error(data?.busy ? 'wake_capture_busy' : 'wake_capture_failed');
                    if (data.overrun === true) throw new Error('wake_capture_overrun');
                    input.push(...data.samples);
                    while (input.length >= engine.frameLength) {
                        const frame = Int16Array.from(input.splice(0, engine.frameLength));
                        engine.worker.postMessage({ command: 'process', inputFrame: frame }, [frame.buffer]);
                    }
                    timer = env.setTimeout(readNative, 80);
                } catch (error) { if (!closed) onError(new Error(['wake_capture_busy', 'wake_capture_overrun'].includes(error.message) ? error.message : 'wake_capture_failed')); }
            };
            return {
                async start() {
                    if (closed) throw new Error('wake_engine_closed');
                    if (native) {
                        if (!invoke) throw new Error('wake_native_capture_unavailable');
                        subscribed = true;
                        await invoke('audio_wake_start', { sampleRate: engine.sampleRate });
                        if (closed) return stopCapture();
                        void readNative();
                    } else {
                        WebVoiceProcessor.setOptions({ outputSampleRate: engine.sampleRate, frameLength: engine.frameLength });
                        // Mark acquisition before awaiting permission so a late answer is released on cancellation.
                        subscribed = true;
                        await WebVoiceProcessor.subscribe(engine);
                        if (closed) await stopCapture();
                    }
                },
                close() {
                    if (closing) return closing;
                    closed = true;
                    closing = (async () => {
                        try { await stopCapture(); }
                        finally { try { await engine.release(); } finally { engine.terminate(); } }
                    })();
                    return closing;
                }
            };
        }
    };
};
