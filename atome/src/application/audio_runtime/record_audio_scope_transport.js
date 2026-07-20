const normalizePair = (pair) => {
    const minimum = Math.max(-1, Math.min(1, Number(pair?.[0]) || 0));
    const maximum = Math.max(-1, Math.min(1, Number(pair?.[1]) || 0));
    return minimum <= maximum ? [minimum, maximum] : [maximum, minimum];
};

const normalizeScope = (payload = {}, sessionId = '') => {
    const pairs = Array.isArray(payload?.pairs) ? payload.pairs.slice(0, 64).map(normalizePair) : [];
    const sequence = Math.max(0, Math.trunc(Number(payload?.sequence) || 0));
    if (payload?.available !== true || sequence < 1 || pairs.length !== 64) return null;
    return {
        type: 'audio_scope',
        session_id: sessionId,
        sequence,
        sample_rate: Math.max(0, Math.round(Number(payload?.sample_rate) || 0)),
        channels: Math.max(1, Math.round(Number(payload?.channels) || 1)),
        pairs,
        rms: Math.max(0, Math.min(1, Number(payload?.rms) || 0)),
        peak: Math.max(0, Math.min(1, Number(payload?.peak) || 0))
    };
};

const latestScopeBySessionId = new Map();
const scopeSubscribersBySessionId = new Map();
const scopeDiagnosticBySessionId = new Map();

export const publishRecordingScopeFrame = (payload = {}, sessionId = '') => {
    const id = String(sessionId || payload?.session_id || payload?.sessionId || '').trim();
    if (!id) return null;
    const frame = normalizeScope({ ...payload, available: payload?.available !== false }, id);
    if (!frame) return null;
    const previous = latestScopeBySessionId.get(id);
    if (previous && frame.sequence <= previous.sequence) return null;
    latestScopeBySessionId.set(id, frame);
    for (const listener of scopeSubscribersBySessionId.get(id) || []) {
        try { listener(frame); } catch (_) { }
    }
    return frame;
};

export const rememberRecordingScopeFrame = publishRecordingScopeFrame;

export const readLatestRecordingScopeFrame = (sessionId) => (
    latestScopeBySessionId.get(String(sessionId || '').trim()) || null
);

export const readRecordingScopeDiagnostic = (sessionId) => (
    scopeDiagnosticBySessionId.get(String(sessionId || '').trim()) || null
);

export const subscribeRecordingScopeFrame = ({ sessionId, listener, replayLatest = true } = {}) => {
    const id = String(sessionId || '').trim();
    if (!id || typeof listener !== 'function') return () => false;
    const subscribers = scopeSubscribersBySessionId.get(id) || new Set();
    subscribers.add(listener);
    scopeSubscribersBySessionId.set(id, subscribers);
    const latest = replayLatest ? latestScopeBySessionId.get(id) : null;
    if (latest) {
        try { listener(latest); } catch (_) { }
    }
    let active = true;
    return () => {
        if (!active) return false;
        active = false;
        subscribers.delete(listener);
        if (subscribers.size === 0) scopeSubscribersBySessionId.delete(id);
        return true;
    };
};

export const clearRecordingScopeSession = (sessionId) => {
    const id = String(sessionId || '').trim();
    const removedFrame = latestScopeBySessionId.delete(id);
    const removedSubscribers = scopeSubscribersBySessionId.delete(id);
    const removedDiagnostic = scopeDiagnosticBySessionId.delete(id);
    return removedFrame || removedSubscribers || removedDiagnostic;
};

export const clearLatestRecordingScopeFrame = clearRecordingScopeSession;

export const createTauriRecordingScopePoller = ({
    windowRef = globalThis.window,
    invoke,
    sessionId,
    intervalMs = 34
} = {}) => {
    if (!windowRef || typeof invoke !== 'function' || !String(sessionId || '').trim()) return () => { };
    const setTimer = windowRef.setTimeout?.bind(windowRef) || globalThis.setTimeout;
    const clearTimer = windowRef.clearTimeout?.bind(windowRef) || globalThis.clearTimeout;
    let active = true;
    let timerId = null;
    let lastSequence = 0;
    const schedule = () => {
        if (!active) return;
        timerId = setTimer(poll, Math.max(34, Number(intervalMs) || 34));
    };
    const poll = async () => {
        if (!active) return;
        try {
            const frame = normalizeScope(await invoke('audio_get_scope'), String(sessionId));
            if (frame && frame.sequence > lastSequence) {
                lastSequence = frame.sequence;
                publishRecordingScopeFrame(frame, sessionId);
                const EventCtor = windowRef.CustomEvent || globalThis.CustomEvent;
                if (typeof EventCtor === 'function') {
                    windowRef.dispatchEvent?.(new EventCtor('native_audio_scope', { detail: frame }));
                }
            }
        } catch (error) {
            const id = String(sessionId);
            if (!scopeDiagnosticBySessionId.has(id)) {
                scopeDiagnosticBySessionId.set(id, Object.freeze({
                    type: 'audio_scope_poll_error',
                    session_id: id,
                    message: String(error?.message || error || 'audio_scope_poll_failed')
                }));
            }
        }
        schedule();
    };
    void poll();
    return () => {
        if (!active) return false;
        active = false;
        if (timerId !== null) clearTimer(timerId);
        timerId = null;
        clearRecordingScopeSession(sessionId);
        return true;
    };
};
