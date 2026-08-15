// Remote Control Manager — renderer side.
//
// A separate brick from teleport (§10.1): a phone can drive a Mac without having
// teleported anything. They only meet through the surface registry.
//
// The trackpad is an ordinary toolbox tool, never a full-screen mode (§10.2), so this
// module owns no surface and paints nothing. It converts local pointer deltas into
// throttled envelopes and stops the moment the session ends.

import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal, ensureSurfaceAnnounced, getLocalSurfaceId } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';

// Pointer events arrive far faster than anyone can act on them. Coalescing to one
// envelope per frame keeps the socket usable while staying visually continuous.
const INPUT_INTERVAL_MS = 16;

const state = {
    lifecycleInstalled: false,
    // Sessions this surface drives.
    controlling: new Map(),
    // Sessions where this surface is the one being driven.
    controlledBy: new Map(),
    pending: { dx: 0, dy: 0, sessionId: '' },
    flushTimer: null
};

const send = async (action, fields = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
    await ensureSurfaceAnnounced();
    try {
        return await FastifyAdapter.ws.send({ type: 'remote-control', action, ...fields });
    } catch (error) {
        return { ok: false, success: false, error: error?.message || String(error) };
    }
};

const dispatch = (type, detail) => {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (_) { }
};

/** Take control of another surface. Same-account surfaces are granted immediately
 *  (§11.1); another user's device is refused by the server until the permission
 *  model exists. */
export const requestControl = async (targetSurfaceId, capabilities = ['remote_pointer']) => {
    const target = String(targetSurfaceId || '').trim();
    if (!target) return { ok: false, error: 'remote_control_target_required' };
    const result = await send('request', { target_surface_id: target, capabilities });
    if (result?.success !== true) {
        return { ok: false, error: result?.error || 'remote_control_request_failed' };
    }
    const session = result.session;
    state.controlling.set(session.session_id, session);
    dispatch('squirrel:remote-control-active', { session, role: 'controller' });
    return { ok: true, session };
};

export const releaseControl = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'remote_control_session_required' };
    const result = await send('revoke', { session_id: id });
    state.controlling.delete(id);
    if (state.pending.sessionId === id) state.pending = { dx: 0, dy: 0, sessionId: '' };
    return { ok: result?.success === true, error: result?.error || null };
};

/** Stop being driven. The controlled surface may always do this (§11.2). */
export const revokeIncomingControl = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'remote_control_session_required' };
    const result = await send('revoke', { session_id: id });
    state.controlledBy.delete(id);
    return { ok: result?.success === true, error: result?.error || null };
};

const flushPointer = () => {
    state.flushTimer = null;
    const { dx, dy, sessionId } = state.pending;
    state.pending = { dx: 0, dy: 0, sessionId: '' };
    if (!sessionId || (dx === 0 && dy === 0)) return;
    // Fire and forget: a pointer move that fails is stale by the time a reply lands,
    // and the session guard on the server is what actually protects the target.
    void send('pointer', { session_id: sessionId, payload: { dx, dy }, noReply: true });
};

/** Accumulate a pointer delta. Deltas are summed rather than dropped, so a fast
 *  swipe travels the same distance whatever the event rate. */
export const sendPointerDelta = (sessionId, dx, dy) => {
    const id = String(sessionId || '').trim();
    if (!id || !state.controlling.has(id)) return false;
    if (state.pending.sessionId && state.pending.sessionId !== id) flushPointer();
    state.pending = {
        sessionId: id,
        dx: state.pending.dx + Number(dx || 0),
        dy: state.pending.dy + Number(dy || 0)
    };
    if (!state.flushTimer && typeof setTimeout === 'function') {
        state.flushTimer = setTimeout(flushPointer, INPUT_INTERVAL_MS);
        state.flushTimer?.unref?.();
    }
    return true;
};

export const sendGesture = (sessionId, payload = {}) => {
    const id = String(sessionId || '').trim();
    if (!id || !state.controlling.has(id)) return Promise.resolve({ ok: false, error: 'remote_control_not_active' });
    return send('gesture', { session_id: id, payload }).then((result) => ({
        ok: result?.success === true, error: result?.error || null
    }));
};

export const listControlSessions = () => ({
    controlling: [...state.controlling.values()],
    controlledBy: [...state.controlledBy.values()]
});

export const isControlling = (sessionId) => state.controlling.has(String(sessionId || ''));

export const installRemoteControlLifecycle = () => {
    if (typeof window === 'undefined' || state.lifecycleInstalled) return false;
    state.lifecycleInstalled = true;

    window.addEventListener('squirrel:remote-control-started', (event) => {
        const session = event?.detail?.session;
        if (!session?.session_id) return;
        state.controlledBy.set(session.session_id, session);
        // Being controlled is the only reason to load the applicator, so it is pulled
        // in here rather than at boot on every surface.
        void import('./remote_input_applicator.js').catch(() => {});
    });

    window.addEventListener('squirrel:remote-control-ended', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (!sessionId) return;
        state.controlling.delete(sessionId);
        state.controlledBy.delete(sessionId);
        if (state.pending.sessionId === sessionId) state.pending = { dx: 0, dy: 0, sessionId: '' };
    });

    // Logging out must not leave this surface driving, or being driven by, the
    // previous account.
    window.addEventListener('squirrel:user-logged-out', () => {
        state.controlling.clear();
        state.controlledBy.clear();
        state.pending = { dx: 0, dy: 0, sessionId: '' };
    });

    dispatch('squirrel:remote-control-ready', { surfaceId: getLocalSurfaceId() });
    return true;
};

export const __resetRemoteControlManager = () => {
    state.controlling.clear();
    state.controlledBy.clear();
    state.pending = { dx: 0, dy: 0, sessionId: '' };
    if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
    }
};

export const __flushRemoteControlPointer = flushPointer;

installRemoteControlLifecycle();
