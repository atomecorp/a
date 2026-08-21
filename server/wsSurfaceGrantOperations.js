// `surface-grant` family on `/ws/api` — the §11.2 flow.
//
//   A requests  → B is notified  → B accepts or refuses  → A may act  → B may revoke
//
// The request itself is never an authorization: only `decide` with `accept` turns it
// into one, and only the owner of the surface can do that.

import {
    DEFAULT_REQUESTED_CAPABILITIES,
    decideSurfaceGrant,
    getSurfaceGrant,
    listSurfaceGrants,
    normalizeCapabilities,
    requestSurfaceGrant,
    revokeSurfaceGrant
} from './surfaceGrants.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import {
    getWsApiSurface,
    listWsApiSurfacesForUser,
    normalizeSurfaceId,
    wsSendJsonToUser
} from './wsApiState.js';
import { wsResponse, wsErrorResponse } from './wsResponse.js';

// Family-bound aliases over the shared envelope (server/wsResponse.js).
const response = (message, success, fields) => wsResponse('surface-grant', message, success, fields);
const errorResponse = (message, error) => wsErrorResponse('surface-grant', message, error);


const SUPPORTED_ACTIONS = new Set(['request', 'accept', 'deny', 'revoke', 'list']);

// Notifications go to the *principal*, not to one surface: the owner must be able to
// answer from whichever device they are actually holding.
function notify(userId, payload) {
    wsSendJsonToUser(String(userId), {
        ...payload,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: payload.type });
}

async function handleRequest(message, userId) {
    const ownerId = String(message?.owner_id || message?.ownerId || '').trim();
    const surfaceId = normalizeSurfaceId(message?.surface_id ?? message?.surfaceId);
    if (!ownerId) return errorResponse(message, 'surface_grant_owner_required');

    // Asking by *user* rather than by surface is the normal starting point: a requester
    // has no way to know another account's surface ids, and exposing them before any
    // authorization would leak the shape of someone's devices. So an omitted surface
    // fans the request across the owner's announced seats and lets the owner decide
    // which of them to allow — per-device control, which is what §11.3 is about.
    const targets = surfaceId
        ? [surfaceId]
        : listWsApiSurfacesForUser(ownerId).map((surface) => surface.surface_id);
    if (targets.length === 0) return errorResponse(message, 'surface_grant_owner_offline');

    if (surfaceId && !getWsApiSurface(ownerId, surfaceId)) {
        // A request aimed at an id the owner does not actually control.
        return errorResponse(message, 'surface_grant_surface_unknown');
    }

    const capabilities = normalizeCapabilities(message?.capabilities).length
        ? normalizeCapabilities(message.capabilities)
        : DEFAULT_REQUESTED_CAPABILITIES;

    const grants = [];
    for (const target of targets) {
        const result = await requestSurfaceGrant({
            ownerId,
            surfaceId: target,
            granteeId: userId,
            capabilities,
            expiresAt: message?.expires_at || message?.expiresAt || null
        });
        if (!result.ok) return errorResponse(message, result.error);
        grants.push(result.grant);
        if (!result.reused) {
            notify(ownerId, {
                type: 'surface-grant-request',
                grant: result.grant,
                from_user_id: String(userId)
            });
        }
    }

    return response(message, true, { grant: grants[0], grants });
}

async function handleDecision(message, userId, accept) {
    const grantId = String(message?.grant_id || message?.grantId || '').trim();
    const result = await decideSurfaceGrant({
        grantId,
        ownerId: userId,
        accept,
        // An owner may approve a subset of what was asked.
        capabilities: Array.isArray(message?.capabilities) ? message.capabilities : null
    });
    if (!result.ok) return errorResponse(message, result.error);

    notify(result.grant.grantee_id, {
        type: accept ? 'surface-grant-granted' : 'surface-grant-denied',
        grant: result.grant
    });
    return response(message, true, { grant: result.grant });
}

async function handleRevoke(message, userId) {
    const grantId = String(message?.grant_id || message?.grantId || '').trim();
    const before = await getSurfaceGrant(grantId);
    const result = await revokeSurfaceGrant({ grantId, principalId: userId });
    if (!result.ok) return errorResponse(message, result.error);

    // Both sides learn immediately: a revoked grant must not keep looking live on the
    // grantee's screen.
    [before?.owner_id, before?.grantee_id].filter(Boolean).forEach((principalId) => {
        notify(principalId, { type: 'surface-grant-revoked', grant: result.grant });
    });
    return response(message, true, { grant: result.grant, revoked_by: result.revokedBy });
}

export async function handleWsSurfaceGrantOperation(message, connection) {
    if (String(message?.type || '').trim() !== 'surface-grant') return null;

    const action = String(message?.action || message?.op || '').trim().toLowerCase();
    if (!SUPPORTED_ACTIONS.has(action)) {
        return errorResponse(message, `Unknown surface-grant action: ${action || 'missing'}`);
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
        if (action === 'request') return await handleRequest(message, userId);
        if (action === 'accept') return await handleDecision(message, userId, true);
        if (action === 'deny') return await handleDecision(message, userId, false);
        if (action === 'revoke') return await handleRevoke(message, userId);
        return response(message, true, {
            grants: await listSurfaceGrants({ principalId: userId, role: message?.role || 'all' })
        });
    } catch (error) {
        return errorResponse(message, error);
    }
}
