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

export const rememberRecordingScopeFrame = (payload = {}, sessionId = '') => {
    const id = String(sessionId || payload?.session_id || payload?.sessionId || '').trim();
    const frame = normalizeScope({ ...payload, available: payload?.available !== false }, id);
    if (!frame) return null;
    const previous = latestScopeBySessionId.get(id);
    if (!previous || frame.sequence > previous.sequence) latestScopeBySessionId.set(id, frame);
    return latestScopeBySessionId.get(id) || null;
};

export const readLatestRecordingScopeFrame = (sessionId) => (
    latestScopeBySessionId.get(String(sessionId || '').trim()) || null
);

export const clearLatestRecordingScopeFrame = (sessionId) => (
    latestScopeBySessionId.delete(String(sessionId || '').trim())
);

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
                rememberRecordingScopeFrame(frame, sessionId);
                const EventCtor = windowRef.CustomEvent || globalThis.CustomEvent;
                if (typeof EventCtor === 'function') {
                    windowRef.dispatchEvent?.(new EventCtor('native_audio_scope', { detail: frame }));
                }
            }
        } catch (_) { }
        schedule();
    };
    void poll();
    return () => {
        if (!active) return false;
        active = false;
        if (timerId !== null) clearTimer(timerId);
        timerId = null;
        return true;
    };
};
