// Remote Control Manager — the `remote-control` family on `/ws/api`.
//
// Deliberately a separate brick from teleport (§10.3): a phone can drive a Mac
// without having teleported anything, and a teleported object can be controlled from
// its source. They interoperate through the surface registry, nothing else.
//
// The message envelope mirrors the local Tauri `/ws/control` prototype
// (`{action, requestId, payload}` → `{type, requestId, success, data}`) — that shape is
// the only reusable part of it; its transport is loopback-only and relays nothing.
//
// Security posture (§28): every relayed input event is re-checked against a live
// session on arrival. A session id is not a capability — the sender's principal *and*
// surface must match the session's controller, so replaying a captured envelope from
// another socket does nothing. Revocation takes effect on the next event, with no
// grace period.

import crypto from 'crypto';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import {
    getWsApiSurface,
    normalizeSurfaceId,
    wsSendJsonToSurface
} from './wsApiState.js';
import { hasSurfaceCapability } from './surfaceGrants.js';
import { wsResponse, wsErrorResponse } from './wsResponse.js';

// Family-bound aliases over the shared envelope (server/wsResponse.js).
const response = (message, success, fields) => wsResponse('remote-control', message, success, fields);
const errorResponse = (message, error) => wsErrorResponse('remote-control', message, error);


const SUPPORTED_ACTIONS = new Set([
    'request', 'grant', 'deny', 'revoke', 'list', 'pointer', 'gesture', 'key',
    'preview-request', 'preview-frame', 'preview-stop'
]);

// Input kinds a controller may send. Anything else is refused rather than forwarded:
// the target must never receive an event type it has not agreed to accept.
const INPUT_ACTIONS = Object.freeze({
    pointer: 'remote_pointer',
    gesture: 'remote_pointer',
    key: 'remote_keyboard'
});

// A control session is a live delegation of input, not a stored preference: it dies
// with the socket. Anything longer-lived belongs to the permission model.
export const REMOTE_CONTROL_SESSION_TTL_MS = (() => {
    const configured = Number(process.env.REMOTE_CONTROL_SESSION_TTL_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 60 * 1000;
})();

// sessionId -> session
const sessions = new Map();

function publicSession(session) {
    return {
        session_id: session.sessionId,
        controller_surface_id: session.controllerSurfaceId,
        target_surface_id: session.targetSurfaceId,
        capabilities: [...session.capabilities],
        state: session.state,
        created_at: session.createdAt,
        expires_at: session.expiresAt
    };
}

function isExpired(session, now = Date.now()) {
    return Date.parse(session.expiresAt) <= now;
}

function dropSession(sessionId, reason) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    sessions.delete(sessionId);
    // Both ends are told, so neither keeps a trackpad live against a dead session.
    [
        [session.controllerUserId, session.controllerSurfaceId],
        [session.targetUserId, session.targetSurfaceId]
    ].forEach(([userId, surfaceId]) => {
        wsSendJsonToSurface(userId, surfaceId, {
            type: 'remote-control-ended',
            session_id: sessionId,
            reason,
            timestamp: new Date().toISOString()
        }, { scope: 'ws/api', op: 'remote-control-ended' });
    });
    return session;
}

/** Resolve the session a message claims, and prove the sender is really its
 *  controller. Returns an error string instead of a session when it is not. */
function authorizeController(message, connection, userId) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    if (!sessionId) return { error: 'remote_control_session_required' };
    const session = sessions.get(sessionId);
    if (!session) return { error: 'remote_control_session_unknown' };
    if (session.state !== 'granted') return { error: 'remote_control_not_granted' };
    if (isExpired(session)) {
        dropSession(sessionId, 'expired');
        return { error: 'remote_control_session_expired' };
    }
    if (String(userId) !== session.controllerUserId) return { error: 'remote_control_not_controller' };
    if (normalizeSurfaceId(connection?._wsApiSurfaceId) !== session.controllerSurfaceId) {
        return { error: 'remote_control_not_controller_surface' };
    }
    return { session };
}

async function handleRequest(message, connection, userId) {
    const controllerSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const targetSurfaceId = normalizeSurfaceId(message?.target_surface_id ?? message?.targetSurfaceId);
    if (!controllerSurfaceId) return errorResponse(message, 'surface_not_announced');
    if (!targetSurfaceId) return errorResponse(message, 'remote_control_target_required');
    if (targetSurfaceId === controllerSurfaceId) {
        return errorResponse(message, 'remote_control_target_is_controller');
    }

    const targetUserId = String(message?.target_user_id || message?.targetUserId || userId);
    const crossUser = targetUserId !== String(userId);

    const target = getWsApiSurface(targetUserId, targetSurfaceId);
    if (!target) return errorResponse(message, 'remote_control_target_offline');

    const requested = Array.isArray(message?.capabilities) && message.capabilities.length
        ? message.capabilities.map((value) => String(value || '').trim()).filter(Boolean)
        : ['remote_pointer'];
    const capabilities = new Set(requested.filter((value) => Object.values(INPUT_ACTIONS).includes(value)));
    if (capabilities.size === 0) return errorResponse(message, 'remote_control_capabilities_invalid');

    // Controlling someone else's device is the §11.2 case: it needs a grant they gave
    // explicitly, and each input capability is checked on its own (§11.3) so a grant to
    // move the pointer never implies permission to type.
    if (crossUser) {
        for (const capability of capabilities) {
            const allowed = await hasSurfaceCapability({
                ownerId: targetUserId,
                surfaceId: targetSurfaceId,
                granteeId: userId,
                capability
            });
            if (!allowed) return errorResponse(message, 'remote_control_cross_user_not_authorized');
        }
    }

    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const session = {
        sessionId,
        controllerUserId: String(userId),
        controllerSurfaceId,
        targetUserId,
        targetSurfaceId,
        capabilities,
        // Same account: trusted by default (§11.1), no repeated confirmation. The
        // indicator below is what keeps it visible rather than silent.
        state: 'granted',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + REMOTE_CONTROL_SESSION_TTL_MS).toISOString()
    };
    sessions.set(sessionId, session);

    // Even an auto-granted session is announced: §11.1 asks for an active-session
    // indicator, not for silence.
    wsSendJsonToSurface(targetUserId, targetSurfaceId, {
        type: 'remote-control-started',
        session: publicSession(session),
        from_surface_id: controllerSurfaceId,
        timestamp: session.createdAt
    }, { scope: 'ws/api', op: 'remote-control-started' });

    return response(message, true, { session: publicSession(session) });
}

function handleRevoke(message, connection, userId) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    const session = sessions.get(sessionId);
    if (!session) return errorResponse(message, 'remote_control_session_unknown');

    const callerSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const isTarget = String(userId) === session.targetUserId && callerSurfaceId === session.targetSurfaceId;
    const isController = String(userId) === session.controllerUserId
        && callerSurfaceId === session.controllerSurfaceId;
    // The controlled surface may always take its control back (§11.2); the controller
    // may hand it back. Nobody else.
    if (!isTarget && !isController) return errorResponse(message, 'remote_control_not_party');

    dropSession(sessionId, isTarget ? 'revoked_by_target' : 'released_by_controller');
    return response(message, true, { session_id: sessionId });
}

function handleList(message, connection, userId) {
    const surfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const now = Date.now();
    const mine = [];
    for (const [sessionId, session] of [...sessions.entries()]) {
        if (isExpired(session, now)) {
            dropSession(sessionId, 'expired');
            continue;
        }
        const involved = (session.controllerUserId === String(userId) && session.controllerSurfaceId === surfaceId)
            || (session.targetUserId === String(userId) && session.targetSurfaceId === surfaceId);
        if (involved) mine.push(publicSession(session));
    }
    return response(message, true, { sessions: mine });
}

function handleInput(message, connection, userId, action) {
    const authorized = authorizeController(message, connection, userId);
    if (authorized.error) return errorResponse(message, authorized.error);
    const { session } = authorized;

    const capability = INPUT_ACTIONS[action];
    if (!session.capabilities.has(capability)) {
        return errorResponse(message, `remote_control_capability_denied:${capability}`);
    }

    const delivery = wsSendJsonToSurface(session.targetUserId, session.targetSurfaceId, {
        type: 'remote-control-input',
        session_id: session.sessionId,
        input: action,
        payload: message?.payload && typeof message.payload === 'object' ? message.payload : {},
        from_surface_id: session.controllerSurfaceId,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: `remote-control-${action}` });

    if (!delivery.delivered) {
        dropSession(session.sessionId, 'target_unreachable');
        return errorResponse(message, 'remote_control_target_offline');
    }

    // Input is high frequency: acknowledge without echoing the payload back.
    if (message?.noReply === true) return null;
    return response(message, true, { session_id: session.sessionId, delivered: true });
}

// Remote preview (§9.4) — an *on-demand* still, never a running screen share.
//
// The spec is explicit that this must appear only when it is useful and must not become
// a permanent stream by default, so there is no subscription and no cadence here: the
// controller asks, the target answers once, and that is the whole protocol. Repeating
// it is the caller's decision, which keeps §30 ("not a screen-share clone") true by
// construction.
function handlePreviewRequest(message, connection, userId) {
    const authorized = authorizeController(message, connection, userId);
    if (authorized.error) return errorResponse(message, authorized.error);
    const { session } = authorized;

    const delivery = wsSendJsonToSurface(session.targetUserId, session.targetSurfaceId, {
        type: 'remote-control-preview-request',
        session_id: session.sessionId,
        from_surface_id: session.controllerSurfaceId,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'remote-control-preview-request' });

    if (!delivery.delivered) {
        dropSession(session.sessionId, 'target_unreachable');
        return errorResponse(message, 'remote_control_target_offline');
    }
    return response(message, true, { session_id: session.sessionId, requested: true });
}

/** The controlled surface answering with one frame. Only the *target* may send this —
 *  a controller cannot push a picture onto the screen it is driving. */
function handlePreviewFrame(message, connection, userId) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    const session = sessions.get(sessionId);
    if (!session) return errorResponse(message, 'remote_control_session_unknown');
    if (String(userId) !== session.targetUserId) return errorResponse(message, 'remote_control_not_target');
    if (normalizeSurfaceId(connection?._wsApiSurfaceId) !== session.targetSurfaceId) {
        return errorResponse(message, 'remote_control_not_target_surface');
    }
    if (isExpired(session)) {
        dropSession(sessionId, 'expired');
        return errorResponse(message, 'remote_control_session_expired');
    }

    const frame = typeof message?.frame === 'string' ? message.frame : '';
    if (!frame) return errorResponse(message, 'remote_control_preview_frame_missing');
    // A still image, bounded. Anything larger is a stream in disguise.
    if (frame.length > 2 * 1024 * 1024) return errorResponse(message, 'remote_control_preview_frame_too_large');

    wsSendJsonToSurface(session.controllerUserId, session.controllerSurfaceId, {
        type: 'remote-control-preview-frame',
        session_id: sessionId,
        frame,
        width: Number(message?.width || 0) || null,
        height: Number(message?.height || 0) || null,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'remote-control-preview-frame' });

    if (message?.noReply === true) return null;
    return response(message, true, { session_id: sessionId, delivered: true });
}

function handlePreviewStop(message, connection, userId) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    const session = sessions.get(sessionId);
    if (!session) return errorResponse(message, 'remote_control_session_unknown');
    const callerSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const isParty = (String(userId) === session.controllerUserId && callerSurfaceId === session.controllerSurfaceId)
        || (String(userId) === session.targetUserId && callerSurfaceId === session.targetSurfaceId);
    if (!isParty) return errorResponse(message, 'remote_control_not_party');

    [
        [session.controllerUserId, session.controllerSurfaceId],
        [session.targetUserId, session.targetSurfaceId]
    ].forEach(([principalId, surfaceId]) => {
        wsSendJsonToSurface(principalId, surfaceId, {
            type: 'remote-control-preview-stopped',
            session_id: sessionId,
            timestamp: new Date().toISOString()
        }, { scope: 'ws/api', op: 'remote-control-preview-stopped' });
    });
    return response(message, true, { session_id: sessionId, stopped: true });
}

export async function handleWsRemoteControlOperation(message, connection) {
    if (String(message?.type || '').trim() !== 'remote-control') return null;

    const action = String(message?.action || message?.op || '').trim().toLowerCase();
    if (!SUPPORTED_ACTIONS.has(action)) {
        return errorResponse(message, `Unknown remote-control action: ${action || 'missing'}`);
    }

    let userId = null;
    try {
        userId = resolveWsApiPrincipal(connection, message);
    } catch (error) {
        return errorResponse(message, error);
    }
    if (!userId) return errorResponse(message, 'Unauthenticated ws/api connection');
    if (!await isWsApiPrincipalProvisioned(userId)) {
        return errorResponse(message, 'remote_account_not_provisioned');
    }

    try {
        if (action === 'request') return await handleRequest(message, connection, userId);
        if (action === 'revoke' || action === 'deny') return handleRevoke(message, connection, userId);
        if (action === 'list') return handleList(message, connection, userId);
        if (action === 'preview-request') return handlePreviewRequest(message, connection, userId);
        if (action === 'preview-frame') return handlePreviewFrame(message, connection, userId);
        if (action === 'preview-stop') return handlePreviewStop(message, connection, userId);
        if (action === 'grant') {
            // Reserved for the cross-user flow: same-account sessions are granted on
            // request, so an explicit grant here would have nothing to approve.
            return errorResponse(message, 'remote_control_grant_not_required');
        }
        return handleInput(message, connection, userId, action);
    } catch (error) {
        return errorResponse(message, error);
    }
}

/** A surface disappeared: every session it was part of ends immediately. A control
 *  session outliving its controller would leave the target accepting input from a
 *  socket nobody owns. */
export function handleRemoteControlSurfaceLoss({ userId, surfaceId } = {}) {
    const lost = normalizeSurfaceId(surfaceId);
    const principalId = String(userId || '');
    if (!lost || !principalId) return [];
    const ended = [];
    for (const [sessionId, session] of [...sessions.entries()]) {
        const involved = (session.controllerUserId === principalId && session.controllerSurfaceId === lost)
            || (session.targetUserId === principalId && session.targetSurfaceId === lost);
        if (!involved) continue;
        dropSession(sessionId, 'surface_lost');
        ended.push(sessionId);
    }
    return ended;
}

// Test seams only.
export function __remoteControlSessions() {
    return [...sessions.values()].map(publicSession);
}

export function __clearRemoteControlSessions() {
    sessions.clear();
}
