// Remote input applicator — the controlled end of a remote-control session.
//
// The relay is only half of remote control: something has to *apply* what arrives.
// This module keeps a virtual cursor for each incoming session and replays the deltas
// as ordinary pointer events on the surface that is already there.
//
// It deliberately synthesises events rather than reaching into the renderer: the
// canonical surface interceptor is the single pointer owner, and a second pointer path
// into the canvas would be exactly the kind of parallel owner the codebase forbids.
// Whatever handles a finger handles a remote finger identically.

const state = {
    installed: false,
    // sessionId -> { x, y }
    cursors: new Map(),
    // Set by the host so the applicator knows where to aim; defaults to the document.
    targetResolver: null,
    enabled: true
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const viewportSize = () => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    return {
        width: Number(window.innerWidth || 0),
        height: Number(window.innerHeight || 0)
    };
};

/** Where a fresh remote cursor appears: the middle of the surface, so the first move
 *  is visible wherever it goes rather than starting off-screen. */
const initialCursor = () => {
    const { width, height } = viewportSize();
    return { x: Math.round(width / 2), y: Math.round(height / 2) };
};

export const setRemoteInputTargetResolver = (resolver) => {
    state.targetResolver = typeof resolver === 'function' ? resolver : null;
    return state.targetResolver;
};

/** A local escape hatch: the controlled surface can stop applying without waiting for
 *  the server round-trip of a revoke. Revoking remains the authoritative action. */
export const setRemoteInputEnabled = (enabled) => {
    state.enabled = enabled !== false;
    if (!state.enabled) state.cursors.clear();
    return state.enabled;
};

export const readRemoteCursor = (sessionId) => {
    const cursor = state.cursors.get(String(sessionId || ''));
    return cursor ? { ...cursor } : null;
};

const resolveTarget = (point) => {
    if (state.targetResolver) {
        try {
            const resolved = state.targetResolver(point);
            if (resolved) return resolved;
        } catch (_) { }
    }
    if (typeof document === 'undefined') return null;
    // elementFromPoint is what makes the remote pointer behave like a real one: it
    // lands on whatever is actually under it, including the canvas interceptor.
    return document.elementFromPoint?.(point.x, point.y) || document.body || null;
};

const emitPointerEvent = (type, point, sessionId) => {
    const target = resolveTarget(point);
    if (!target?.dispatchEvent || typeof window === 'undefined') return false;
    const EventCtor = window.PointerEvent || window.MouseEvent;
    if (!EventCtor) return false;
    const event = new EventCtor(type, {
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true,
        composed: true
    });
    // Marked so the local pointer path can tell a remote finger from a local one —
    // useful for the active-session indicator, and for never echoing it back.
    try {
        event.remoteControlSessionId = sessionId;
        event.isRemoteControlInput = true;
    } catch (_) { }
    return target.dispatchEvent(event);
};

export const applyRemotePointer = (sessionId, payload = {}) => {
    if (!state.enabled) return null;
    const id = String(sessionId || '').trim();
    if (!id) return null;

    const { width, height } = viewportSize();
    const current = state.cursors.get(id) || initialCursor();
    const next = {
        x: clamp(current.x + Number(payload.dx || 0), 0, Math.max(0, width)),
        y: clamp(current.y + Number(payload.dy || 0), 0, Math.max(0, height))
    };
    state.cursors.set(id, next);

    emitPointerEvent('pointermove', next, id);
    return { ...next };
};

// Keyboard needs its own capability (§11.3) and a focus target: typing into whatever
// happens to be under the cursor would be worse than not typing at all. So the key is
// delivered to the focused element, and only when the controlled surface has opted in.
const state_keyboard = { enabled: false };

export const setRemoteKeyboardEnabled = (enabled) => {
    state_keyboard.enabled = enabled === true;
    return state_keyboard.enabled;
};

export const isRemoteKeyboardEnabled = () => state_keyboard.enabled;

const emitKeyboardEvent = (type, payload, sessionId) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const EventCtor = window.KeyboardEvent;
    if (!EventCtor) return false;
    // The focused element, not the element under the pointer: a remote key must go
    // where a local key would.
    const target = document.activeElement || document.body;
    if (!target?.dispatchEvent) return false;
    const event = new EventCtor(type, {
        key: String(payload.key ?? ''),
        code: String(payload.code ?? ''),
        ctrlKey: payload.ctrlKey === true,
        shiftKey: payload.shiftKey === true,
        altKey: payload.altKey === true,
        metaKey: payload.metaKey === true,
        bubbles: true,
        cancelable: true,
        composed: true
    });
    try {
        event.remoteControlSessionId = sessionId;
        event.isRemoteControlInput = true;
    } catch (_) { }
    return target.dispatchEvent(event);
};

export const applyRemoteKey = (sessionId, payload = {}) => {
    if (!state.enabled) return null;
    // Opt-in is local and defaults to off: a granted capability authorises the sender,
    // it does not force the receiver to accept synthetic keystrokes.
    if (!state_keyboard.enabled) return { applied: null, reason: 'remote_keyboard_disabled' };
    const id = String(sessionId || '').trim();
    if (!id) return null;
    const key = String(payload.key ?? '');
    if (!key) return { applied: null, reason: 'remote_key_missing' };

    emitKeyboardEvent('keydown', payload, id);
    emitKeyboardEvent('keyup', payload, id);
    return { applied: 'key', key };
};

export const applyRemoteGesture = (sessionId, payload = {}) => {
    if (!state.enabled) return null;
    const id = String(sessionId || '').trim();
    if (!id) return null;
    const cursor = state.cursors.get(id) || initialCursor();
    state.cursors.set(id, cursor);

    const kind = String(payload.kind || payload.gesture || '').trim().toLowerCase();
    if (kind === 'tap' || kind === 'click') {
        emitPointerEvent('pointerdown', cursor, id);
        emitPointerEvent('pointerup', cursor, id);
        return { ...cursor, applied: 'tap' };
    }
    if (kind === 'down') {
        emitPointerEvent('pointerdown', cursor, id);
        return { ...cursor, applied: 'down' };
    }
    if (kind === 'up') {
        emitPointerEvent('pointerup', cursor, id);
        return { ...cursor, applied: 'up' };
    }
    // Unknown gestures are dropped rather than approximated: applying the wrong
    // gesture on someone's screen is worse than applying none.
    return { ...cursor, applied: null };
};

export const installRemoteInputApplicator = () => {
    if (typeof window === 'undefined' || state.installed) return false;
    state.installed = true;

    window.addEventListener('squirrel:remote-control-input', (event) => {
        const detail = event?.detail || {};
        const sessionId = String(detail.sessionId || '').trim();
        if (!sessionId) return;
        if (detail.input === 'pointer') applyRemotePointer(sessionId, detail.payload || {});
        else if (detail.input === 'gesture') applyRemoteGesture(sessionId, detail.payload || {});
        else if (detail.input === 'key') applyRemoteKey(sessionId, detail.payload || {});
    });

    window.addEventListener('squirrel:remote-control-ended', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (sessionId) state.cursors.delete(sessionId);
    });

    window.addEventListener('squirrel:user-logged-out', () => { state.cursors.clear(); });
    return true;
};

export const __resetRemoteInputApplicator = () => {
    state.cursors.clear();
    state.enabled = true;
    state.targetResolver = null;
    state_keyboard.enabled = false;
};

installRemoteInputApplicator();
