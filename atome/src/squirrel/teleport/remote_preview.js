// Remote preview (§9.4) — see what you are manipulating when the surface is not in
// front of you.
//
// The constraint that shapes this module is §9.4's second sentence: the preview must
// appear only when it is useful and must never become a screen share by default. So
// there is no subscription, no cadence and no auto-start — one request, one still.
// Asking again is an explicit act.
//
// The captured frame is produced by the *controlled* surface from its own canvas; this
// module never reads another surface's pixels.

import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';

// A still, not a stream: small enough to send in one message, large enough to
// recognise what is on screen.
const PREVIEW_MAX_WIDTH = 480;
const PREVIEW_QUALITY = 0.6;

const state = {
    lifecycleInstalled: false,
    // sessionId -> latest received frame, for the controller side.
    frames: new Map(),
    // Supplies the canvas to capture. Injected so this module does not reach into the
    // renderer to find one.
    captureSource: null
};

const send = async (action, fields = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
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

export const setRemotePreviewCaptureSource = (resolver) => {
    state.captureSource = typeof resolver === 'function' ? resolver : null;
    return state.captureSource;
};

const resolveCanvas = () => {
    if (state.captureSource) {
        try {
            const canvas = state.captureSource();
            if (canvas?.toDataURL) return canvas;
        } catch (_) { }
    }
    if (typeof document === 'undefined') return null;
    return document.querySelector?.('canvas') || null;
};

/** Capture one downscaled still of this surface. Returns null when there is nothing to
 *  capture, rather than sending an empty frame. */
export const captureLocalPreviewFrame = () => {
    const canvas = resolveCanvas();
    if (!canvas?.toDataURL) return null;
    const width = Number(canvas.width || 0);
    const height = Number(canvas.height || 0);
    if (!width || !height) return null;

    try {
        if (width <= PREVIEW_MAX_WIDTH || typeof document === 'undefined') {
            return { frame: canvas.toDataURL('image/webp', PREVIEW_QUALITY), width, height };
        }
        const scale = PREVIEW_MAX_WIDTH / width;
        const scaled = document.createElement('canvas');
        scaled.width = Math.max(1, Math.round(width * scale));
        scaled.height = Math.max(1, Math.round(height * scale));
        const context = scaled.getContext?.('2d');
        if (!context) return null;
        context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        return {
            frame: scaled.toDataURL('image/webp', PREVIEW_QUALITY),
            width: scaled.width,
            height: scaled.height
        };
    } catch (_) {
        return null;
    }
};

/** Controller side: ask the surface you are driving for one still. */
export const requestRemotePreview = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'remote_control_session_required' };
    const result = await send('preview-request', { session_id: id });
    return { ok: result?.success === true, error: result?.error || null };
};

export const stopRemotePreview = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'remote_control_session_required' };
    state.frames.delete(id);
    const result = await send('preview-stop', { session_id: id });
    return { ok: result?.success === true, error: result?.error || null };
};

export const readRemotePreviewFrame = (sessionId) => state.frames.get(String(sessionId || '')) || null;

export const installRemotePreviewLifecycle = () => {
    if (typeof window === 'undefined' || state.lifecycleInstalled) return false;
    state.lifecycleInstalled = true;

    // Target side: answer a request with exactly one frame.
    window.addEventListener('squirrel:remote-control-preview-request', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (!sessionId) return;
        const captured = captureLocalPreviewFrame();
        if (!captured) return;
        void send('preview-frame', {
            session_id: sessionId,
            frame: captured.frame,
            width: captured.width,
            height: captured.height,
            noReply: true
        });
    });

    // Controller side: a frame arrived, hand it to whoever is showing it.
    window.addEventListener('squirrel:remote-control-preview-frame', (event) => {
        const detail = event?.detail || {};
        const sessionId = String(detail.sessionId || '').trim();
        if (!sessionId || !detail.frame) return;
        const frame = {
            sessionId,
            frame: detail.frame,
            width: detail.width || null,
            height: detail.height || null,
            timestamp: detail.timestamp || null
        };
        state.frames.set(sessionId, frame);
        dispatch('squirrel:remote-preview-updated', frame);
    });

    window.addEventListener('squirrel:remote-control-preview-stopped', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (sessionId) state.frames.delete(sessionId);
        dispatch('squirrel:remote-preview-closed', { sessionId });
    });

    // A dead session must not leave a stale picture of someone's screen behind.
    window.addEventListener('squirrel:remote-control-ended', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (sessionId) state.frames.delete(sessionId);
    });

    window.addEventListener('squirrel:user-logged-out', () => { state.frames.clear(); });
    return true;
};

export const __resetRemotePreview = () => {
    state.frames.clear();
    state.captureSource = null;
};

installRemotePreviewLifecycle();
