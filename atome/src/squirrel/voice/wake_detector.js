import { createGlobalSecurityApi } from '../security/bootstrap.js';
import { loadRuntimeUserProfile } from '../ai/profile_loader.js';
import { createWakeCapture, wakeCaptureAvailable } from './wake_capture.js';

const verifierEntry = userId => 'voice.wake.verifier.' + encodeURIComponent(userId);

// Local openWakeWord detection of "Ève, écoute-moi": no account, key or network.
// The optional personal verifier lives in the account vault, so the user's enrollment
// follows them to a recovered or new device (the assistant it wakes needs the network
// anyway).
export const createWakeDetectorBackend = ({ env = globalThis,
    workerFactory = () => new env.Worker('/src/squirrel/voice/wake_detector_worker.js', { type: 'module' }),
    loadProfile = () => loadRuntimeUserProfile({ env }),
    security = createGlobalSecurityApi({ env })
} = {}) => {
    const principal = async () => {
        const profile = await loadProfile();
        if (!profile?.ok || !profile.userId) throw new Error('wake_principal_unavailable');
        return profile.userId;
    };
    const unlockedPrincipal = async () => {
        const userId = await principal();
        if (security.vaultStatus().configured !== true) throw new Error('wake_vault_locked');
        return userId;
    };
    // No signed-in account means no personal verifier, not a failure.
    const readVerifier = async () => {
        const profile = await loadProfile();
        if (!profile?.ok || !profile.userId || security.vaultStatus().configured !== true) return null;
        const stored = await security.readToken(verifierEntry(profile.userId));
        return stored?.ok ? stored.value : null;
    };

    // The single engine: one worker, hence one ONNX Runtime instance, initialized once and
    // reused by every session (a second instance runs out of memory on iPhone). A fatal
    // engine error or `release()` terminates it; the next session starts a new one.
    let engine = null;
    const drop = (current) => { if (engine === current) engine = null; current.worker.terminate(); };
    const acquire = () => {
        if (engine) return engine.ready;
        const current = { worker: workerFactory(), session: null, pending: null, initialized: false };
        current.ready = new Promise((resolve, reject) => {
            const fatal = (code) => {
                drop(current);
                current.pending?.reject(new Error(code)); current.pending = null;
                if (!current.initialized) reject(new Error(code)); else current.session?.fail(code);
            };
            current.worker.onmessage = ({ data }) => {
                if (data.type === 'ready') { current.initialized = true; resolve(current); }
                else if (data.type === 'configured') { current.pending?.resolve(); current.pending = null; }
                else if (data.type === 'detected') current.session?.onDetection(data.score);
                else if (data.type === 'window') current.session?.onWindow(data);
                else if (data.type === 'error' && ['wake_engine_failed', 'wake_model_missing'].includes(data.error)) fatal(data.error);
                else if (data.type === 'error') current.session?.fail(data.error);
            };
            current.worker.onerror = () => fatal('wake_engine_failed');
            current.worker.postMessage({ type: 'init' });
        });
        engine = current;
        return current.ready;
    };

    // One session on the engine: a mode (detection or collection) plus the microphone.
    const open = async ({ onDetection = () => {}, onWindow = () => {}, onError, collect = false, verifier }) => {
        const current = await acquire();
        if (current.session) throw new Error('wake_engine_busy');
        let closed = false, closing = null, capture = null;
        const session = { onDetection: score => { if (!closed) onDetection(score); }, onWindow: data => { if (!closed) onWindow(data); },
            fail: code => { if (!closed) onError(new Error(code)); } };
        current.session = session;
        const configured = new Promise((resolve, reject) => { current.pending = { resolve, reject }; });
        current.worker.postMessage({ type: 'configure', verifier, collect });
        try { await configured; } catch (error) { if (current.session === session) current.session = null; throw error; }
        return {
            async start() {
                if (closed) throw new Error('wake_engine_closed');
                capture = createWakeCapture({ env, onError: error => session.fail(error.message),
                    onFrame: samples => { if (!closed) current.worker.postMessage({ type: 'frame', samples }, [samples.buffer]); } });
                await capture.start();
                if (closed) await capture.close();
            },
            close() {
                closed = true;
                closing ||= (async () => {
                    try { await capture?.close(); }
                    finally {
                        if (current.session === session) current.session = null;
                        if (engine === current) current.worker.postMessage({ type: 'idle' });
                    }
                })();
                return closing;
            }
        };
    };

    return {
        captureAvailable: () => wakeCaptureAvailable(env),
        // Frees the engine's memory once voice activation is off.
        release() { if (engine) drop(engine); },
        async create({ onDetection, onError }) { return open({ onDetection, onError, verifier: await readVerifier() }); },
        // Enrollment scores windows with the base model only.
        openCollector: ({ onWindow, onError }) => open({ onWindow, onError, collect: true, verifier: null }),
        async hasVerifier() { return Boolean(await readVerifier()); },
        async storeVerifier(model) {
            const userId = await unlockedPrincipal();
            await security.storeToken(verifierEntry(userId), model, { provider: 'openwakeword' });
        }
    };
};
