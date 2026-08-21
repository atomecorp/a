// Typed `/ws/api` surface family.
//
// A surface is one renderable device seat (browser tab, Tauri window, iOS app).
// The registry itself lives in `wsApiState.js` next to the connection registry it
// refines; this module owns only the wire protocol and its authorization.
//
// Security contract: the principal always comes from `resolveWsApiPrincipal`, never
// from the payload. A surface id in a message is only ever interpreted inside the
// announcing principal's own namespace, so no client can address or impersonate a
// surface belonging to another account through this family.

import { listSurfaceGrants } from './surfaceGrants.js';
import {
    attachWsApiSurface,
    detachWsApiSurface,
    getWsApiSurface,
    listWsApiSurfacesForUser,
    normalizeSurfaceId,
    touchWsApiSurface,
    wsSendJsonToUserExcept
} from './wsApiState.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import { handleTeleportSurfaceReconnect } from './wsTeleportOperations.js';
import { wsResponse, wsErrorResponse, actionOf } from './wsResponse.js';

// Family-bound aliases over the shared envelope (server/wsResponse.js).
const response = (message, success, fields) => wsResponse('surface', message, success, fields);
const errorResponse = (message, error) => wsErrorResponse('surface', message, error);


const SUPPORTED_ACTIONS = new Set(['announce', 'list', 'ping', 'retire']);

function broadcastPresence(userId, connection, event, surface) {
    if (!surface) return;
    wsSendJsonToUserExcept(
        String(userId),
        {
            type: 'surface-presence',
            event,
            surface,
            timestamp: new Date().toISOString()
        },
        connection,
        { scope: 'ws/api', op: `surface-${event}`, targetUserId: String(userId) }
    );
}

async function handleAnnounce(message, connection, userId) {
    const surfaceId = normalizeSurfaceId(message?.surface_id ?? message?.surfaceId);
    if (!surfaceId) return errorResponse(message, 'surface_id_invalid');

    const surface = attachWsApiSurface(connection, userId, {
        surfaceId,
        label: message?.label,
        platform: message?.platform,
        capabilities: message?.capabilities
    });
    if (!surface) return errorResponse(message, 'surface_announce_failed');

    broadcastPresence(userId, connection, 'online', surface);

    // A returning surface reclaims the objects that went DISCONNECTED when it left.
    // Done here rather than in a background sweep so the object is reachable again by
    // the time the surface has finished announcing itself.
    let restored = [];
    try {
        const reconnected = await handleTeleportSurfaceReconnect({ userId, surfaceId });
        restored = reconnected.restored || [];
    } catch (error) {
        console.warn('[ws/api] teleport reconnect failed', error?.message || error);
    }

    return response(message, true, {
        surface,
        surfaces: listWsApiSurfacesForUser(userId, { excludeSurfaceId: surfaceId }),
        restored_atome_ids: restored
    });
}

async function handleList(message, connection, userId) {
    const excludeSelf = message?.exclude_self === true || message?.excludeSelf === true;
    const own = listWsApiSurfacesForUser(userId, {
        excludeSurfaceId: excludeSelf ? connection?._wsApiSurfaceId || '' : ''
    });

    // Surfaces of *other* accounts are only ever listed once their owner has granted
    // something (§19: "devices d'utilisateurs autorisés"). Before that they stay
    // invisible — listing someone's devices is itself information they did not share.
    let shared = [];
    if (message?.include_shared === true || message?.includeShared === true) {
        const { outgoing } = await listSurfaceGrants({ principalId: userId, role: 'outgoing' });
        shared = (outgoing || [])
            .filter((grant) => grant.status === 'granted')
            .map((grant) => getWsApiSurface(grant.owner_id, grant.surface_id))
            .filter(Boolean)
            .map((surface) => ({ ...surface, shared: true }));
    }

    return response(message, true, { surfaces: own, shared });
}

function handlePing(message, connection) {
    const surface = touchWsApiSurface(connection);
    if (!surface) return errorResponse(message, 'surface_not_announced');
    return response(message, true, { surface });
}

function handleRetire(message, connection, userId) {
    const surface = detachWsApiSurface(connection);
    if (!surface) return errorResponse(message, 'surface_not_announced');
    broadcastPresence(userId, connection, 'offline', surface);
    return response(message, true, { surface });
}

export async function handleWsSurfaceOperation(message, connection) {
    if (String(message?.type || '').trim() !== 'surface') return null;

    const action = actionOf(message);
    if (!SUPPORTED_ACTIONS.has(action)) {
        return errorResponse(message, `Unknown surface action: ${action || 'missing'}`);
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
        if (action === 'announce') return await handleAnnounce(message, connection, userId);
        if (action === 'list') return await handleList(message, connection, userId);
        if (action === 'ping') return handlePing(message, connection);
        return handleRetire(message, connection, userId);
    } catch (error) {
        return errorResponse(message, error);
    }
}

// Called by the `/ws/api` close handler before the connection leaves the client
// registry, so the account's other surfaces learn the seat went away.
export function announceWsSurfaceDisconnect(connection) {
    const userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (!userId) return null;
    const surface = detachWsApiSurface(connection);
    if (!surface) return null;
    broadcastPresence(userId, connection, 'offline', surface);
    return surface;
}
