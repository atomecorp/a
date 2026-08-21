// Teleport Manager — the `teleport` family on `/ws/api`.
//
// Two-phase by construction, because §16 forbids treating an object as gone before
// the destination confirmed it:
//
//   offer   → TELEPORT_PREPARING committed, `teleport-offer` pushed to the target
//   accept  → REMOTE committed, `teleport_surface_id` finally moves
//   decline / timeout / target vanished → rollback, nothing was ever removed
//
// State transitions live in `teleportState.js`; commits go through the ordinary
// event pipeline (`commitAtomeEvent`) so authorization, history and realtime
// broadcast stay owned by the modules that already own them.

import db from '../database/adole.js';
import crypto from 'crypto';
import { commitAtomeEvent } from './atomeRoutes.orm.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import {
    getWsApiSurface,
    listWsApiSurfacesForUser,
    normalizeSurfaceId,
    wsSendJsonToSurface,
    wsSendJsonToUser
} from './wsApiState.js';
import {
    TELEPORT_STATES,
    buildCancelTeleportPatch,
    buildCommitTeleportPatch,
    buildDisconnectTeleportPatch,
    buildPersistTeleportPatch,
    buildPrepareTeleportPatch,
    buildReconnectTeleportPatch,
    buildReturnTeleportPatch,
    readTeleportState
} from '../atome/src/shared/teleport_state.js';
import { SURFACE_CAPABILITIES, hasSurfaceCapability } from './surfaceGrants.js';
import { wsResponse, wsErrorResponse } from './wsResponse.js';

// Family-bound aliases over the shared envelope (server/wsResponse.js).
const response = (message, success, fields) => wsResponse('teleport', message, success, fields);
const errorResponse = (message, error) => wsErrorResponse('teleport', message, error);


const SUPPORTED_ACTIONS = new Set(['offer', 'accept', 'decline', 'cancel', 'return', 'persist', 'state']);

// Long enough for a sleeping phone to wake and paint, short enough that a user
// pushing an object at a dead screen gets it back rather than a spinner.
const DEFAULT_TELEPORT_OFFER_TIMEOUT_MS = 12000;
export const TELEPORT_OFFER_TIMEOUT_MS = (() => {
    const configured = Number(process.env.TELEPORT_OFFER_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_TELEPORT_OFFER_TIMEOUT_MS;
})();

// sessionId -> { atomeId, ownerId, targetUserId, targetSurfaceId, sourceSurfaceId, timer }
const pendingOffers = new Map();

async function readAtomeProperties(atomeId) {
    const atome = await db.getAtome(atomeId);
    if (!atome) return null;
    return atome.properties || atome.data || {};
}

async function commitTeleportPatch(atomeId, patch, principalId) {
    return commitAtomeEvent({
        event: {
            kind: 'set',
            atome_id: atomeId,
            payload: { props: patch },
            actor: { type: 'user', id: String(principalId) }
        },
        authenticatedUserId: String(principalId)
    });
}

function forgetOffer(sessionId) {
    const pending = pendingOffers.get(sessionId);
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingOffers.delete(sessionId);
    return pending;
}

// Rollback path shared by decline, timeout, explicit cancel and target loss.
async function rollbackOffer(sessionId, reason) {
    const pending = forgetOffer(sessionId);
    if (!pending) return { ok: false, error: 'teleport_session_unknown' };

    const properties = await readAtomeProperties(pending.atomeId);
    if (!properties) return { ok: false, error: 'teleport_atome_missing' };

    const built = buildCancelTeleportPatch(properties, { sessionId, reason });
    if (!built.ok) return built;

    const committed = await commitTeleportPatch(pending.atomeId, built.patch, pending.ownerId);
    if (!committed.ok) return { ok: false, error: committed.error };

    // Both ends must learn the object stayed put, including the source that is
    // still showing it mid-flight.
    wsSendJsonToUser(pending.ownerId, {
        type: 'teleport-cancelled',
        atome_id: pending.atomeId,
        session_id: sessionId,
        reason,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'teleport-cancelled' });

    if (pending.targetUserId !== pending.ownerId) {
        wsSendJsonToSurface(pending.targetUserId, pending.targetSurfaceId, {
            type: 'teleport-cancelled',
            atome_id: pending.atomeId,
            session_id: sessionId,
            reason,
            timestamp: new Date().toISOString()
        }, { scope: 'ws/api', op: 'teleport-cancelled' });
    }
    return { ok: true, reason };
}

async function handleOffer(message, connection, userId) {
    const atomeId = String(message?.atome_id || message?.atomeId || '').trim();
    const targetSurfaceId = normalizeSurfaceId(message?.target_surface_id ?? message?.targetSurfaceId);
    const sourceSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);

    if (!atomeId) return errorResponse(message, 'teleport_atome_required');
    if (!targetSurfaceId) return errorResponse(message, 'teleport_target_required');
    if (!sourceSurfaceId) return errorResponse(message, 'surface_not_announced');

    // The destination principal defaults to the sender, so a cross-user teleport can
    // only happen when it is asked for explicitly — never by omitting a field.
    const targetUserId = String(message?.target_user_id || message?.targetUserId || userId);
    if (targetUserId !== String(userId)) {
        // §11.3: receiving and displaying are distinct capabilities, and both are
        // needed before an object may land on someone else's screen.
        const allowed = await hasSurfaceCapability({
            ownerId: targetUserId,
            surfaceId: targetSurfaceId,
            granteeId: userId,
            capability: SURFACE_CAPABILITIES.TELEPORT_RECEIVE
        }) && await hasSurfaceCapability({
            ownerId: targetUserId,
            surfaceId: targetSurfaceId,
            granteeId: userId,
            capability: SURFACE_CAPABILITIES.TELEPORT_DISPLAY
        });
        if (!allowed) return errorResponse(message, 'teleport_cross_user_not_authorized');
    }

    const target = getWsApiSurface(targetUserId, targetSurfaceId);
    if (!target) return errorResponse(message, 'teleport_target_offline');

    const properties = await readAtomeProperties(atomeId);
    if (!properties) return errorResponse(message, 'teleport_atome_missing');
    if (!await db.canWrite(atomeId, userId)) return errorResponse(message, 'teleport_write_denied');

    // One offer in flight per atome: a second push while the first is unconfirmed
    // would leave two sessions racing to own the same object.
    const existing = readTeleportState(properties);
    if (existing.state === TELEPORT_STATES.PREPARING) {
        return errorResponse(message, 'teleport_already_preparing');
    }

    const sessionId = crypto.randomUUID();
    const built = buildPrepareTeleportPatch(properties, {
        targetSurfaceId,
        sourceSurfaceId,
        sessionId
    });
    if (!built.ok) return errorResponse(message, built.error);

    const committed = await commitTeleportPatch(atomeId, built.patch, userId);
    if (!committed.ok) return errorResponse(message, committed.error);

    pendingOffers.set(sessionId, {
        atomeId,
        ownerId: String(userId),
        targetUserId,
        targetSurfaceId,
        sourceSurfaceId,
        timer: setTimeout(() => {
            void rollbackOffer(sessionId, 'timeout');
        }, TELEPORT_OFFER_TIMEOUT_MS)
    });
    pendingOffers.get(sessionId).timer?.unref?.();

    const delivery = wsSendJsonToSurface(targetUserId, targetSurfaceId, {
        type: 'teleport-offer',
        atome_id: atomeId,
        session_id: sessionId,
        from_surface_id: sourceSurfaceId,
        from_user_id: String(userId),
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'teleport-offer' });

    // The surface was listed a moment ago but its socket is gone: roll back now
    // rather than making the user wait out the timeout.
    if (!delivery.delivered) {
        await rollbackOffer(sessionId, 'target_unreachable');
        return errorResponse(message, 'teleport_target_offline');
    }

    return response(message, true, {
        session_id: sessionId,
        atome_id: atomeId,
        target_surface_id: targetSurfaceId,
        state: TELEPORT_STATES.PREPARING
    });
}

async function handleAccept(message, connection, userId) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    const pending = pendingOffers.get(sessionId);
    if (!pending) return errorResponse(message, 'teleport_session_unknown');

    // Only the surface the offer was addressed to may accept it. Knowing a session
    // id is not authority.
    if (String(userId) !== pending.targetUserId) return errorResponse(message, 'teleport_not_target');
    if (normalizeSurfaceId(connection?._wsApiSurfaceId) !== pending.targetSurfaceId) {
        return errorResponse(message, 'teleport_not_target_surface');
    }

    const properties = await readAtomeProperties(pending.atomeId);
    if (!properties) {
        await rollbackOffer(sessionId, 'atome_missing');
        return errorResponse(message, 'teleport_atome_missing');
    }

    const built = buildCommitTeleportPatch(properties, {
        targetSurfaceId: pending.targetSurfaceId,
        sessionId
    });
    if (!built.ok) return errorResponse(message, built.error);

    const committed = await commitTeleportPatch(pending.atomeId, built.patch, pending.ownerId);
    if (!committed.ok) return errorResponse(message, committed.error);

    forgetOffer(sessionId);

    // The property commit already broadcast the new state to every connection of the
    // owner; this is the arrival signal the source needs to swap in its residual proxy.
    wsSendJsonToUser(pending.ownerId, {
        type: 'teleport-arrived',
        atome_id: pending.atomeId,
        session_id: sessionId,
        surface_id: pending.targetSurfaceId,
        origin_surface_id: pending.sourceSurfaceId,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'teleport-arrived' });

    return response(message, true, {
        atome_id: pending.atomeId,
        surface_id: pending.targetSurfaceId,
        state: TELEPORT_STATES.REMOTE
    });
}

async function handleDeclineOrCancel(message, connection, userId, reason) {
    const sessionId = String(message?.session_id || message?.sessionId || '').trim();
    const pending = pendingOffers.get(sessionId);
    if (!pending) return errorResponse(message, 'teleport_session_unknown');

    const callerSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const isTarget = String(userId) === pending.targetUserId
        && callerSurfaceId === pending.targetSurfaceId;
    // Cancel is bound to the *source surface*, not merely to the owning principal:
    // a same-account teleport has one principal on both ends, so a principal-level
    // check would let the destination cancel the offer it was supposed to answer.
    const isSource = String(userId) === pending.ownerId
        && callerSurfaceId === pending.sourceSurfaceId;
    // Decline belongs to the destination, cancel to the sender; neither may be
    // driven by a third party that guessed the session id.
    if (reason === 'declined' && !isTarget) return errorResponse(message, 'teleport_not_target');
    if (reason === 'cancelled' && !isSource) return errorResponse(message, 'teleport_not_owner');

    const result = await rollbackOffer(sessionId, reason);
    if (!result.ok) return errorResponse(message, result.error);
    return response(message, true, { session_id: sessionId, reason });
}

async function handleReturn(message, userId) {
    const atomeId = String(message?.atome_id || message?.atomeId || '').trim();
    if (!atomeId) return errorResponse(message, 'teleport_atome_required');

    const properties = await readAtomeProperties(atomeId);
    if (!properties) return errorResponse(message, 'teleport_atome_missing');
    if (!await db.canWrite(atomeId, userId)) return errorResponse(message, 'teleport_write_denied');

    const built = buildReturnTeleportPatch(properties, {
        toSurfaceId: message?.to_surface_id ?? message?.toSurfaceId
    });
    if (!built.ok) return errorResponse(message, built.error);

    const committed = await commitTeleportPatch(atomeId, built.patch, userId);
    if (!committed.ok) return errorResponse(message, committed.error);

    return response(message, true, {
        atome_id: atomeId,
        state: TELEPORT_STATES.LOCAL,
        destination: built.destination
    });
}

async function handlePersist(message, userId) {
    const atomeId = String(message?.atome_id || message?.atomeId || '').trim();
    if (!atomeId) return errorResponse(message, 'teleport_atome_required');

    const properties = await readAtomeProperties(atomeId);
    if (!properties) return errorResponse(message, 'teleport_atome_missing');
    if (!await db.canWrite(atomeId, userId)) return errorResponse(message, 'teleport_write_denied');

    const built = buildPersistTeleportPatch(properties);
    if (!built.ok) return errorResponse(message, built.error);

    const committed = await commitTeleportPatch(atomeId, built.patch, userId);
    if (!committed.ok) return errorResponse(message, committed.error);

    return response(message, true, { atome_id: atomeId, state: TELEPORT_STATES.PERSISTED_REMOTE });
}

async function handleStateRead(message, userId) {
    const atomeId = String(message?.atome_id || message?.atomeId || '').trim();
    if (!atomeId) return errorResponse(message, 'teleport_atome_required');
    if (!await db.canRead(atomeId, userId)) return errorResponse(message, 'teleport_read_denied');

    const properties = await readAtomeProperties(atomeId);
    if (!properties) return errorResponse(message, 'teleport_atome_missing');

    return response(message, true, {
        atome_id: atomeId,
        teleport: readTeleportState(properties),
        surfaces: listWsApiSurfacesForUser(userId)
    });
}

export async function handleWsTeleportOperation(message, connection) {
    if (String(message?.type || '').trim() !== 'teleport') return null;

    const action = String(message?.action || message?.op || '').trim().toLowerCase();
    if (!SUPPORTED_ACTIONS.has(action)) {
        return errorResponse(message, `Unknown teleport action: ${action || 'missing'}`);
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
        if (action === 'offer') return await handleOffer(message, connection, userId);
        if (action === 'accept') return await handleAccept(message, connection, userId);
        if (action === 'decline') return await handleDeclineOrCancel(message, connection, userId, 'declined');
        if (action === 'cancel') return await handleDeclineOrCancel(message, connection, userId, 'cancelled');
        if (action === 'return') return await handleReturn(message, userId);
        if (action === 'persist') return await handlePersist(message, userId);
        return await handleStateRead(message, userId);
    } catch (error) {
        return errorResponse(message, error);
    }
}

// A surface disappeared. Two distinct consequences, and conflating them would
// either lose objects or resurrect them on the wrong screen:
//   - offers awaiting that surface roll back, because nothing ever arrived;
//   - objects already living there become DISCONNECTED, not returned — the user
//     decides whether to bring them home (§16).
export async function handleTeleportSurfaceLoss({ userId, surfaceId } = {}) {
    const lostSurfaceId = normalizeSurfaceId(surfaceId);
    const principalId = String(userId || '');
    if (!lostSurfaceId || !principalId) return { rolledBack: [], disconnected: [] };

    const rolledBack = [];
    for (const [sessionId, pending] of [...pendingOffers.entries()]) {
        const involved = (pending.targetUserId === principalId && pending.targetSurfaceId === lostSurfaceId)
            || (pending.ownerId === principalId && pending.sourceSurfaceId === lostSurfaceId);
        if (!involved) continue;
        await rollbackOffer(sessionId, 'surface_lost');
        rolledBack.push(sessionId);
    }

    const disconnected = [];
    for (const row of await atomesHostedBySurface(lostSurfaceId) || []) {
        const atomeId = row?.atome_id;
        if (!atomeId) continue;
        const properties = await readAtomeProperties(atomeId);
        if (!properties) continue;
        const built = buildDisconnectTeleportPatch(properties, { surfaceId: lostSurfaceId });
        if (!built.ok) continue;
        const ownerRow = await db.query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        const ownerId = ownerRow?.owner_id ? String(ownerRow.owner_id) : principalId;
        const committed = await commitTeleportPatch(atomeId, built.patch, ownerId);
        if (committed.ok) disconnected.push(atomeId);
    }

    return { rolledBack, disconnected };
}

/** Objects hosted by a surface, whatever their teleport state. Matches both the raw
 *  and JSON-encoded particle forms, since particles store either depending on the
 *  writer. */
async function atomesHostedBySurface(surfaceId) {
    return await db.query(
        'all',
        `SELECT atome_id FROM particles
         WHERE particle_key = 'teleport_surface_id' AND particle_value IN (?, ?)`,
        [surfaceId, JSON.stringify(surfaceId)]
    ).catch(() => []);
}

/** A surface came back with the same persisted id. Objects that went DISCONNECTED when
 *  it vanished become reachable again — REMOTE, or PERSISTED_REMOTE when the user had
 *  chosen to leave them there. §13: identity must survive a reconnection, so nothing is
 *  recreated and nothing is repatriated behind the user's back. */
export async function handleTeleportSurfaceReconnect({ userId, surfaceId } = {}) {
    const backSurfaceId = normalizeSurfaceId(surfaceId);
    const principalId = String(userId || '');
    if (!backSurfaceId || !principalId) return { restored: [] };

    const restored = [];
    for (const row of await atomesHostedBySurface(backSurfaceId) || []) {
        const atomeId = row?.atome_id;
        if (!atomeId) continue;
        const properties = await readAtomeProperties(atomeId);
        if (!properties) continue;
        const built = buildReconnectTeleportPatch(properties, { surfaceId: backSurfaceId });
        // Not disconnected: nothing to restore, and re-committing would add a
        // meaningless event to the object's history on every reconnection.
        if (!built.ok) continue;
        const ownerRow = await db.query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        const ownerId = ownerRow?.owner_id ? String(ownerRow.owner_id) : principalId;
        const committed = await commitTeleportPatch(atomeId, built.patch, ownerId);
        if (committed.ok) restored.push(atomeId);
    }
    return { restored };
}

// Test seam only: the pending map is process-local and must not leak between probes.
export function __pendingTeleportSessions() {
    return [...pendingOffers.keys()];
}

export function __clearPendingTeleportSessions() {
    for (const sessionId of [...pendingOffers.keys()]) forgetOffer(sessionId);
}
