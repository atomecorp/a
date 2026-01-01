// iPlug2-native recorder API (Tauri + AUv3)
// Contract:
// - record_start(params) -> Promise<sessionId>
// - record_stop(sessionId) -> Promise<payload> (record_done) or throws (record_error)

(function () {
    if (typeof window === 'undefined') return;

    const PENDING = new Map();
    let listenersReady = false;

    function normalizeSource(raw) {
        const v = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
        if (v === 'plugin' || v === 'plugin_output') return 'plugin';
        return 'mic';
    }

    function detectContext() {
        if (window.__TAURI__ || window.__TAURI_INTERNALS__) return 'tauri';
        if (window.__HOST_ENV === 'auv3') return 'auv3';
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) return 'auv3';
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
                entry.stop.resolve(detail);
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

    async function record_start(params = {}) {
        ensureListeners();
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

        return new Promise((resolve, reject) => {
            PENDING.set(sessionId, { start: { resolve, reject }, stop: null });
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sessionId);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    async function record_stop(sessionId) {
        ensureListeners();
        const sid = typeof sessionId === 'string' ? sessionId : '';
        if (!sid) throw new Error('Missing sessionId');

        const msg = {
            type: 'iplug',
            action: 'record_stop',
            sessionId: sid
        };

        return new Promise((resolve, reject) => {
            const entry = PENDING.get(sid) || { start: null, stop: null };
            entry.stop = { resolve, reject };
            PENDING.set(sid, entry);
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sid);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    window.record_start = record_start;
    window.record_stop = record_stop;
})();
