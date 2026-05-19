import {
    getTauriInvoke,
    resolveAudioRuntime,
    resolveVoiceCaptureProvider
} from './runtime_audio_backend.js';
import { installSharedAVContracts } from './av_contracts.js';

// Unified recorder API (Tauri + AUv3 + browser capture backend)
// Contract:
// - record_start(params) -> Promise<sessionId>
// - record_stop(sessionId) -> Promise<payload> or throws

(function () {
    if (typeof window === 'undefined') return;

    const PENDING = new Map();
    let listenersReady = false;
    const av = installSharedAVContracts(window);

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
        if (runtime.runtime === 'ios_app') return 'ios_app';
        if (runtime.runtime === 'ios_auv3') return 'auv3';
        return 'browser';
    }

    function defaultSampleRate(context, source) {
        return null;
    }

    function reportRecordingOverrun(result = {}, entry = {}) {
        const overrunFrames = Number(result?.overrun_frames || result?.overrunFrames || 0);
        if (!Number.isFinite(overrunFrames) || overrunFrames <= 0) return null;
        return av.monitoring.reportStreamOverrun({
            media_kind: 'audio',
            session_id: result.session_id || result.sessionId || entry.sessionId || '',
            stream_id: result.session_id || result.sessionId || entry.sessionId || '',
            provider: result.provider || entry.provider || '',
            overrun_frames: overrunFrames,
            sample_rate: result.sample_rate || result.sampleRate || entry.sampleRate || 0,
            channels: result.channels || entry.channels || 0
        });
    }

    function defaultChannels(context, source) {
        return null;
    }

    function randomSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `rec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function defaultFileName(source) {
        return `${source}_${Date.now()}.wav`;
    }

    function extractUserId(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed && trimmed !== 'anonymous' ? trimmed : null;
        }
        if (typeof value !== 'object') return null;
        const user = value.logged && value.user ? value.user : value;
        const nested = user.user || user.currentUser || user.current_user || null;
        return extractUserId(user.user_id)
            || extractUserId(user.userId)
            || extractUserId(user.atome_id)
            || extractUserId(user.atomeId)
            || extractUserId(user.id)
            || extractUserId(nested);
    }

    function readStoredUserId(storage) {
        if (!storage || typeof storage.getItem !== 'function') return null;
        const keys = [
            'current_user',
            'currentUser',
            'adole_current_user',
            'auth_user',
            'user',
            'user_id',
            'userId'
        ];
        for (const key of keys) {
            let raw = null;
            try { raw = storage.getItem(key); } catch (_) { raw = null; }
            if (!raw) continue;
            const trimmed = String(raw || '').trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    const parsedId = extractUserId(parsed);
                    if (parsedId) return parsedId;
                } catch (_) { }
            } else {
                const direct = extractUserId(trimmed);
                if (direct) return direct;
            }
        }
        return null;
    }

    function callUserIdProvider(provider) {
        if (typeof provider !== 'function') return null;
        try {
            return provider();
        } catch (_) {
            return null;
        }
    }

    function resolveUserIdSync() {
        const api = window.AdoleAPI || (typeof AdoleAPI !== 'undefined' ? AdoleAPI : null);
        return extractUserId(window.__currentUser)
            || extractUserId(window.__CURRENT_USER__)
            || extractUserId(window.currentUser)
            || extractUserId(callUserIdProvider(api?.auth?.getCurrentInfo?.bind(api.auth)))
            || extractUserId(api?.auth?.currentUser)
            || extractUserId(api?.auth?.user)
            || extractUserId(callUserIdProvider(api?.security?.getAnonymousUserId?.bind(api.security)))
            || readStoredUserId(window.localStorage)
            || readStoredUserId(window.sessionStorage)
            || null;
    }

    function withTimeout(promise, ms) {
        return new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                resolve(null);
            }, ms);
            Promise.resolve(promise).then((value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(value);
            }).catch(() => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(null);
            });
        });
    }

    async function getAdoleUserId() {
        const syncUserId = resolveUserIdSync();
        if (syncUserId) return syncUserId;
        try {
            const api = window.AdoleAPI || (typeof AdoleAPI !== 'undefined' ? AdoleAPI : null);
            if (!api || !api.auth) return null;
            if (typeof api.auth.getCurrentUser === 'function') {
                const user = await withTimeout(api.auth.getCurrentUser(), 1500);
                const userId = extractUserId(user);
                if (userId) return userId;
            }
            if (typeof api.auth.current === 'function') {
                const res = await withTimeout(api.auth.current(), 1500);
                const userId = extractUserId(res);
                if (userId) return userId;
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    function sendNativeMessage(msg) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
            window.webkit.messageHandlers.swiftBridge.postMessage(msg);
            return true;
        }
        return false;
    }

    function ensureListeners() {
        if (listenersReady) return;
        listenersReady = true;
        window.addEventListener('native_audio_recording', (ev) => {
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
        if (!entry) {
            return;
        }

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
                const overrunFrames = Number(detail.overrun_frames || detail.overrunFrames || 0);
                const sampleRate = Number(detail.sample_rate || detail.sampleRate || entry.sampleRate || 0);
                const resolved = {
                    ...detail,
                    session_id: sessionId,
                    file_name: detail.file_name || detail.fileName || entry.fileName || null,
                    file_path: detail.file_path || detail.path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(detail.duration_sec || detail.durationSec || 0),
                    frame_count: frameCount,
                    overrun_frames: Number.isFinite(overrunFrames) && overrunFrames > 0 ? overrunFrames : 0,
                    sample_rate: sampleRate,
                    channels: Number(detail.channels || entry.channels || 0),
                    provider: entry.provider || 'native_audio_recorder'
                };
                const monitoring = reportRecordingOverrun(resolved, entry);
                entry.stop.resolve(monitoring ? { ...resolved, monitoring } : resolved);
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
        await import('../../../eVe/domains/media/api/audio_api.js');
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


        if (context === 'tauri' || context === 'ios_app') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                throw new Error(context === 'ios_app'
                    ? 'iOS native audio recorder bridge is not available'
                    : 'Tauri audio engine bridge is not available');
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
            const requestedSampleRate = Number(sampleRate) || 0;
            const requestedChannels = Number(channels) || 0;
            await invoke('audio_record_start', {
                sessionId,
                fileName,
                filePath,
                userId,
                sampleRate: requestedSampleRate,
                channels: requestedChannels
            });
            PENDING.set(sessionId, {
                provider: 'native_audio_recorder',
                transport: context,
                fileName,
                filePath,
                sampleRate: requestedSampleRate,
                channels: requestedChannels
            });
            window.__SQUIRREL_RECORD_PROVIDER__ = 'native_audio_recorder';
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
        if (!userId && (context === 'tauri' || context === 'ios_app')) {
            userId = await getAdoleUserId();
        }

        const msg = {
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
            provider: 'native_audio_recorder',
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
        if (entry?.transport === 'tauri' || entry?.transport === 'ios_app') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                PENDING.delete(sid);
                throw new Error(entry.transport === 'ios_app'
                    ? 'iOS native audio recorder bridge is not available'
                    : 'Tauri audio engine bridge is not available');
            }
            try {
                const result = await invoke('audio_record_stop', {
                    sessionId: sid
                });
                const frameCount = Number(result?.frame_count || result?.frameCount || 0);
                const overrunFrames = Number(result?.overrun_frames || result?.overrunFrames || 0);
                const sampleRate = Number(result?.sample_rate || result?.sampleRate || entry.sampleRate || 0);
                const resolved = {
                    session_id: sid,
                    file_name: entry.fileName,
                    file_path: entry.filePath,
                    absolute_file_path: result?.absolute_file_path || result?.file_path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(result?.duration_sec || 0),
                    frame_count: frameCount,
                    overrun_frames: Number.isFinite(overrunFrames) && overrunFrames > 0 ? overrunFrames : 0,
                    sample_rate: sampleRate,
                    channels: Number(result?.channels || entry.channels || 0),
                    provider: entry.provider
                };
                const monitoring = reportRecordingOverrun(resolved, entry);
                return monitoring ? { ...resolved, monitoring } : resolved;
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
            action: 'record_stop',
            sessionId: sid
        };

        return new Promise((resolve, reject) => {
            const pendingEntry = PENDING.get(sid) || {
                provider: 'native_audio_recorder',
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
