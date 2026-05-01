import {
    getTauriInvoke,
    resolveAudioRuntime,
    resolveVoiceCaptureProvider
} from './runtime_audio_backend.js';

// Unified recorder API (Tauri + AUv3 + browser fallback)
// Contract:
// - record_start(params) -> Promise<sessionId>
// - record_stop(sessionId) -> Promise<payload> or throws

(function () {
    if (typeof window === 'undefined') return;

    const PENDING = new Map();
    let listenersReady = false;

    function updateRecordProvider() {
        window.__SQUIRREL_RECORD_PROVIDER__ = resolveVoiceCaptureProvider(window);
        return window.__SQUIRREL_RECORD_PROVIDER__;
    }

    function normalizeSource(raw) {
        const v = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
        if (v === 'plugin' || v === 'plugin_output') return 'plugin';
        return 'mic';
    }

    function detectContext() {
        const runtime = resolveAudioRuntime(window);
        if (runtime.runtime === 'tauri_native') return 'tauri';
        if (runtime.runtime === 'ios_auv3') return 'auv3';
        return 'browser';
    }

    function defaultSampleRate(context, source) {
        if (context === 'tauri' && source === 'mic') return 16000;
        return null;
    }

    function defaultChannels(context, source) {
        if (context === 'tauri' && source === 'mic') return 1;
        return null;
    }

    function randomSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `rec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function defaultFileName(source) {
        return `${source}_${Date.now()}.wav`;
    }

    function getAdoleUserId() {
        try {
            const api = window.AdoleAPI || (typeof AdoleAPI !== 'undefined' ? AdoleAPI : null);
            if (!api || !api.auth || typeof api.auth.current !== 'function') return Promise.resolve(null);
            return api.auth.current().then((res) => {
                const user = res && res.logged ? res.user : null;
                return user ? (user.user_id || user.atome_id || user.id || null) : null;
            }).catch(() => null);
        } catch (_) {
            return Promise.resolve(null);
        }
    }

    function sendNativeMessage(msg) {
        if (typeof window.__toDSP === 'function') {
            window.__toDSP(msg);
            return true;
        }
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
            window.webkit.messageHandlers.swiftBridge.postMessage(msg);
            return true;
        }
        return false;
    }

    function ensureListeners() {
        if (listenersReady) return;
        listenersReady = true;
        window.addEventListener('iplug_recording', (ev) => {
            const detail = ev && ev.detail ? ev.detail : {};
            handleNativeEvent(detail);
        });
    }

    function handleNativeEvent(detail) {
        if (!detail || typeof detail !== 'object') return;
        const type = detail.type || null;
        if (!type) return;
        const sessionId = detail.session_id || detail.sessionId || '';
        if (!sessionId) return;
        const entry = PENDING.get(sessionId);
        if (!entry) return;

        if (type === 'record_started') {
            if (entry.start) {
                entry.start.resolve(sessionId);
                entry.start = null;
            }
            return;
        }

        if (type === 'record_done') {
            if (entry.stop) {
                const frameCount = Number(detail.frame_count || detail.frameCount || 0);
                const sampleRate = Number(detail.sample_rate || detail.sampleRate || entry.sampleRate || 0);
                entry.stop.resolve({
                    ...detail,
                    session_id: sessionId,
                    file_name: detail.file_name || detail.fileName || entry.fileName || null,
                    file_path: detail.file_path || detail.path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(detail.duration_sec || detail.durationSec || 0),
                    frame_count: frameCount,
                    sample_rate: sampleRate,
                    channels: Number(detail.channels || entry.channels || 0),
                    provider: entry.provider || 'iplug_native_recorder'
                });
                entry.stop = null;
            }
            PENDING.delete(sessionId);
            return;
        }

        if (type === 'record_error') {
            const error = detail.error || detail.message || 'Recording error';
            if (entry.stop) {
                entry.stop.reject(new Error(error));
            } else if (entry.start) {
                entry.start.reject(new Error(error));
            }
            PENDING.delete(sessionId);
        }
    }

    async function ensureBrowserRecordAudio() {
        if (typeof window.record_audio === 'function') return window.record_audio;
        await import('../eVe/domains/media/api/audio_api.js');
        return (typeof window.record_audio === 'function') ? window.record_audio : null;
    }

    async function record_start(params = {}) {
        ensureListeners();
        updateRecordProvider();
        const context = detectContext();
        const source = normalizeSource(params.source || 'mic');
        const sessionId = params.sessionId || params.session_id || randomSessionId();
        const fileName = (typeof params.fileName === 'string' && params.fileName.trim())
            ? params.fileName.trim()
            : defaultFileName(source);
        const sampleRate = (typeof params.sampleRate === 'number')
            ? params.sampleRate
            : defaultSampleRate(context, source);
        const channels = (typeof params.channels === 'number')
            ? params.channels
            : defaultChannels(context, source);

        if (context === 'tauri') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                throw new Error('Tauri audio engine bridge is not available');
            }
            let userId = params.userId || params.user_id || null;
            if (!userId) {
                userId = await getAdoleUserId();
            }
            if (!userId) {
                throw new Error('Missing userId for native recording');
            }
            const filePath = (typeof params.filePath === 'string' && params.filePath.trim())
                ? params.filePath.trim()
                : `data/users/${userId}/recordings/${fileName}`;
            await invoke('audio_record_start', {
                sessionId,
                filePath,
                sampleRate: Number(sampleRate) || defaultSampleRate(context, source) || 16000,
                channels: Number(channels) || defaultChannels(context, source) || 1
            });
            PENDING.set(sessionId, {
                provider: 'iplug_native_recorder',
                transport: 'tauri',
                fileName,
                filePath,
                sampleRate: Number(sampleRate) || defaultSampleRate(context, source) || 16000,
                channels: Number(channels) || defaultChannels(context, source) || 1
            });
            window.__SQUIRREL_RECORD_PROVIDER__ = 'iplug_native_recorder';
            return sessionId;
        }

        if (context === 'browser') {
            const recordAudio = await ensureBrowserRecordAudio();
            if (typeof recordAudio !== 'function') {
                throw new Error('Browser capture recorder is not available');
            }
            const ctrl = await recordAudio(fileName, params.path || null, {
                backend: 'webaudio',
                source
            });
            PENDING.set(sessionId, {
                provider: 'web_capture_recorder',
                transport: 'browser',
                fileName,
                ctrl
            });
            window.__SQUIRREL_RECORD_PROVIDER__ = 'web_capture_recorder';
            return sessionId;
        }

        let userId = params.userId || params.user_id || null;
        if (!userId && context === 'tauri') {
            userId = await getAdoleUserId();
        }

        const msg = {
            type: 'iplug',
            action: 'record_start',
            sessionId,
            fileName,
            source,
            sampleRate,
            channels,
            userId
        };

        // Pre-register the PENDING entry BEFORE creating the Promise to avoid
        // a race where the native event fires before the Promise executor runs.
        const pendingEntry = {
            provider: 'iplug_native_recorder',
            transport: 'auv3',
            fileName,
            sampleRate: Number(sampleRate) || null,
            channels: Number(channels) || null,
            start: null,
            stop: null
        };
        PENDING.set(sessionId, pendingEntry);

        return new Promise((resolve, reject) => {
            pendingEntry.start = { resolve, reject };
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sessionId);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    async function record_stop(sessionId) {
        ensureListeners();
        updateRecordProvider();
        const sid = typeof sessionId === 'string' ? sessionId : '';
        if (!sid) throw new Error('Missing sessionId');

        const entry = PENDING.get(sid);
        if (entry?.transport === 'tauri') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                PENDING.delete(sid);
                throw new Error('Tauri audio engine bridge is not available');
            }
            try {
                const result = await invoke('audio_record_stop', {
                    sessionId: sid
                });
                const frameCount = Number(result?.frame_count || result?.frameCount || 0);
                const sampleRate = Number(result?.sample_rate || result?.sampleRate || entry.sampleRate || 0);
                return {
                    session_id: sid,
                    file_name: entry.fileName,
                    file_path: entry.filePath,
                    absolute_file_path: result?.absolute_file_path || result?.file_path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(result?.duration_sec || 0),
                    frame_count: frameCount,
                    sample_rate: sampleRate,
                    channels: Number(result?.channels || entry.channels || 0),
                    provider: entry.provider
                };
            } finally {
                PENDING.delete(sid);
            }
        }

        if (entry?.transport === 'browser') {
            try {
                if (!entry.ctrl || typeof entry.ctrl.stop !== 'function') {
                    throw new Error('Browser capture session is not active');
                }
                const result = await entry.ctrl.stop();
                return {
                    session_id: sid,
                    file_name: entry.fileName,
                    provider: entry.provider,
                    ...(result && typeof result === 'object' ? result : {})
                };
            } finally {
                PENDING.delete(sid);
            }
        }

        const msg = {
            type: 'iplug',
            action: 'record_stop',
            sessionId: sid
        };

        return new Promise((resolve, reject) => {
            const pendingEntry = PENDING.get(sid) || {
                provider: 'iplug_native_recorder',
                start: null,
                stop: null
            };
            pendingEntry.stop = { resolve, reject };
            PENDING.set(sid, pendingEntry);
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sid);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    window.record_start = record_start;
    window.record_stop = record_stop;
    updateRecordProvider();
})();
