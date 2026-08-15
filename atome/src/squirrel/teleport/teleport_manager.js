// Teleport Manager — the renderer-side owner of teleport transitions.
//
// It never mutates teleport properties itself: the server owns the state machine,
// so a surface can only *request* a transition and react to the outcome. That is
// what keeps the object single (§13) — two devices cannot both decide where it is.
//
// Reads of teleport state go through `teleportState.js` semantics mirrored in
// `teleport_view.js`, so the render filter and this module cannot drift apart.

import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal, ensureSurfaceAnnounced, getLocalSurfaceId, listSurfaces } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';

const state = {
    lifecycleInstalled: false,
    // Offers this surface received and has not answered yet, so a decline can be
    // issued later from the toolbox rather than only on arrival.
    incomingOffers: new Map(),
    autoAccept: true
};

const send = async (action, fields = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    // A Tauri/iOS session may be authenticated only against the local backend; the
    // relay lives on Fastify, so the remote principal must exist before anything is
    // addressed by surface.
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
    // Every action is addressed by surface, so the surface must be registered before
    // the server can resolve either end.
    await ensureSurfaceAnnounced();
    try {
        return await FastifyAdapter.ws.send({ type: 'teleport', action, ...fields });
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

/** Push an object to another surface. Resolves once the offer is registered, not
 *  once it arrives — arrival is signalled by `squirrel:teleport-arrived`. */
export const teleportObject = async (atomeId, targetSurfaceId, targetUserId = '') => {
    const id = String(atomeId || '').trim();
    const target = String(targetSurfaceId || '').trim();
    if (!id) return { ok: false, error: 'teleport_atome_required' };
    if (!target) return { ok: false, error: 'teleport_target_required' };
    // A foreign surface must carry its owner, otherwise the server resolves it inside
    // the sender's own namespace and the grant check never runs.
    const owner = String(targetUserId || '').trim();
    const result = await send('offer', {
        atome_id: id,
        target_surface_id: target,
        ...(owner ? { target_user_id: owner } : {})
    });
    return {
        ok: result?.success === true,
        error: result?.error || null,
        sessionId: result?.sessionId || null,
        state: result?.state || null
    };
};

export const acceptTeleport = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'teleport_session_required' };
    const result = await send('accept', { session_id: id });
    if (result?.success === true) state.incomingOffers.delete(id);
    return { ok: result?.success === true, error: result?.error || null, surfaceId: result?.surfaceId || null };
};

export const declineTeleport = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'teleport_session_required' };
    const result = await send('decline', { session_id: id });
    if (result?.success === true) state.incomingOffers.delete(id);
    return { ok: result?.success === true, error: result?.error || null };
};

/** Abort an offer this surface sent. Only the source surface may do this. */
export const cancelTeleport = async (sessionId) => {
    const id = String(sessionId || '').trim();
    if (!id) return { ok: false, error: 'teleport_session_required' };
    const result = await send('cancel', { session_id: id });
    return { ok: result?.success === true, error: result?.error || null };
};

/** "Rapatrier" — bring the object back to its origin, or to an explicit surface. */
export const returnObject = async (atomeId, toSurfaceId = '') => {
    const id = String(atomeId || '').trim();
    if (!id) return { ok: false, error: 'teleport_atome_required' };
    const fields = { atome_id: id };
    const to = String(toSurfaceId || '').trim();
    if (to) fields.to_surface_id = to;
    const result = await send('return', fields);
    return {
        ok: result?.success === true,
        error: result?.error || null,
        destination: result?.destination || null
    };
};

/** "Laisser" — an explicit decision, never inferred from a disconnect (§21). */
export const persistObject = async (atomeId) => {
    const id = String(atomeId || '').trim();
    if (!id) return { ok: false, error: 'teleport_atome_required' };
    const result = await send('persist', { atome_id: id });
    return { ok: result?.success === true, error: result?.error || null };
};

export const readRemoteTeleportState = async (atomeId) => {
    const id = String(atomeId || '').trim();
    if (!id) return { ok: false, error: 'teleport_atome_required' };
    const result = await send('state', { atome_id: id });
    return {
        ok: result?.success === true,
        error: result?.error || null,
        teleport: result?.teleport || null,
        surfaces: Array.isArray(result?.surfaces) ? result.surfaces : []
    };
};

export const listPendingIncomingOffers = () => [...state.incomingOffers.values()];

/** Devices of the same account are trusted by default (§11.1): an object pushed
 *  from your own phone must land on your own Mac without a confirmation dialog.
 *  Cross-user offers do not reach this path — the server refuses them until the
 *  permission model of lot 8 exists. */
export const setTeleportAutoAccept = (enabled) => {
    state.autoAccept = enabled !== false;
    return state.autoAccept;
};

// The renderer decides what to paint from teleport properties, but it must know
// which surface it *is*, and how to name a destination. Both are pushed to it here
// rather than letting the rendering domain reach into the API layer.
const publishSurfaceContext = async () => {
    if (typeof window === 'undefined') return;
    const detail = { surfaceId: getLocalSurfaceId(), surfaces: [] };
    try {
        const result = await FastifyAdapter.ws.send({ type: 'surface', action: 'list' });
        if (Array.isArray(result?.surfaces)) detail.surfaces = result.surfaces;
    } catch (_) { }
    dispatch('squirrel:teleport-surface-context', detail);
};

/** Resolve what a push at the edge should do, and do it.
 *  One eligible surface teleports directly (§5.2), several ask contextually (§5.3),
 *  none gives discreet feedback and leaves the object alone (§20). */
export const resolveEdgeIntent = async (atomeId, edge = '', projectId = '') => {
    const id = String(atomeId || '').trim();
    if (!id) return { ok: false, error: 'teleport_atome_required' };

    const read = await readRemoteTeleportState(id);
    if (!read.ok) return { ok: false, error: read.error || 'teleport_state_unavailable' };

    const local = getLocalSurfaceId();
    const current = read.teleport?.surfaceId || '';
    // Same candidate set as the toolbox: own seats plus authorized foreign surfaces.
    const listed = await listSurfaces({ includeShared: true });
    const candidates = listed.ok ? listed.surfaces : (read.surfaces || []);
    const destinations = candidates.filter((surface) => {
        const surfaceId = String(surface?.surface_id || '');
        return surfaceId && surfaceId !== local && surfaceId !== current;
    });

    if (destinations.length === 0) {
        // Do not lose the object and do not interrupt the drag: the object simply
        // stays, and the surface says so quietly.
        dispatch('squirrel:teleport-no-destination', { atomeId: id, edge, projectId });
        return { ok: false, error: 'teleport_no_destination', destinations: [] };
    }
    if (destinations.length === 1) {
        const sent = await teleportObject(id, destinations[0].surface_id, destinations[0].user_id || '');
        dispatch('squirrel:teleport-edge-resolved', {
            atomeId: id, edge, target: destinations[0], ok: sent.ok, error: sent.error
        });
        return sent;
    }
    // Never pick arbitrarily: the toolbox shows the candidates and calls back.
    dispatch('squirrel:teleport-destination-choice', { atomeId: id, edge, projectId, destinations });
    return { ok: false, error: 'teleport_destination_required', destinations };
};

export const installTeleportLifecycle = () => {
    if (typeof window === 'undefined' || state.lifecycleInstalled) return false;
    state.lifecycleInstalled = true;

    window.addEventListener('squirrel:teleport-edge-intent', (event) => {
        const detail = event?.detail || {};
        const atomeId = String(detail.atomeId || detail.atome_id || '').trim();
        if (!atomeId) return;
        void resolveEdgeIntent(atomeId, detail.edge || '', detail.projectId || '');
    });

    // Destination labels change as devices come and go, and the residual proxy shows
    // them, so republish whenever presence moves.
    window.addEventListener('squirrel:surface-presence', () => { void publishSurfaceContext(); });
    window.addEventListener('squirrel:user-logged-in', () => { void publishSurfaceContext(); });

    window.addEventListener('squirrel:teleport-offer', (event) => {
        const detail = event?.detail || {};
        const sessionId = String(detail.sessionId || '').trim();
        if (!sessionId) return;
        state.incomingOffers.set(sessionId, {
            sessionId,
            atomeId: detail.atomeId || null,
            fromSurfaceId: detail.fromSurfaceId || null,
            fromUserId: detail.fromUserId || null,
            receivedAt: detail.timestamp || null
        });
        if (state.autoAccept) void acceptTeleport(sessionId);
    });

    window.addEventListener('squirrel:teleport-cancelled', (event) => {
        const sessionId = String(event?.detail?.sessionId || '').trim();
        if (sessionId) state.incomingOffers.delete(sessionId);
    });

    // A logged-out surface must not answer offers addressed to the previous account.
    window.addEventListener('squirrel:user-logged-out', () => {
        state.incomingOffers.clear();
    });

    dispatch('squirrel:teleport-ready', { surfaceId: getLocalSurfaceId() });
    if (isAuthenticated()) void publishSurfaceContext();
    return true;
};

// Test seam: probes drive the lifecycle explicitly instead of on import.
export const __resetTeleportManager = () => {
    state.incomingOffers.clear();
    state.autoAccept = true;
};

installTeleportLifecycle();
