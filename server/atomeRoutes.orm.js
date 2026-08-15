/**
 * Atome API Routes v3.0 - Using ADOLE v3.0 Schema
 * 
 * Canonical authenticated Atome event commit owner used by /ws/api.
 * Uses the ADOLE data layer and emits realtime sync only after commit.
 */

import db from '../database/adole.js';
import {
    resolveSyncAtomeType,
    sanitizeBoundaryAtomeProperties
} from './atomeRouteContract.js';
import {
    syncAtomeViaWebSocket
} from './atomeSyncRuntime.js';
import {
    authorizeAtomeEventBatch,
    authorizeAtomeEventWrite
} from './atomePropertySecurity.js';

const SYNC_REMOTE_ENABLED = process.env.SQUIRREL_SYNC_REMOTE !== '0';
const SYNC_TARGET_SERVER = 'tauri';

function resolveSyncOperation(kind) {
    if (!kind) return 'update';
    const normalized = String(kind).toLowerCase();
    if (normalized === 'delete') return 'delete';
    if (normalized === 'create') return 'create';
    return 'update';
}

function normalizeAtomeCommitActor(candidate, authenticatedUserId) {
    const secondary = { type: 'user', id: authenticatedUserId };
    if (!candidate || typeof candidate !== 'object') return secondary;
    const actorId = candidate.id || candidate.user_id || candidate.userId || null;
    if (!actorId) return secondary;
    if (String(actorId) !== String(authenticatedUserId)) return secondary;
    return {
        ...candidate,
        id: actorId
    };
}

async function resolveAtomeForSync(event) {
    const atomeId = event?.atome_id || null;
    if (!atomeId) return null;

    const [state, atome] = await Promise.all([
        db.getStateCurrent(atomeId),
        db.getAtome(atomeId)
    ]);

    const properties = sanitizeBoundaryAtomeProperties({
        properties: state?.properties || null,
        id: state?.atome_id || atome?.atome_id || atome?.id || null,
        type: atome?.atome_type || atome?.type || null
    });
    const atomeType = resolveSyncAtomeType(
        atome?.atome_type,
        atome?.type,
        properties.kind
    );
    const parentId = atome?.meta?.parent_id
        || atome?.parent_id
        || properties.parent_id
        || null;
    const ownerId = atome?.meta?.owner_id
        || atome?.owner_id
        || properties.owner_id
        || null;

    return {
        atome_id: atomeId,
        atome_type: atomeType || null,
        parent_id: parentId,
        owner_id: ownerId,
        created_at: atome?.created_at || state?.updated_at || null,
        updated_at: state?.updated_at || atome?.updated_at || null,
        id: atomeId,
        type: atomeType || null,
        kind: properties.kind || null,
        properties
    };
}

async function emitCommittedAtomeSync(event) {
    if (!event?.atome_id || event?.kind === 'snapshot') return;
    const syncAtome = await resolveAtomeForSync(event);
    if (syncAtome) {
        syncAtomeViaWebSocket(syncAtome, resolveSyncOperation(event.kind));
        return;
    }
    if (event.kind === 'delete') {
        syncAtomeViaWebSocket({ atome_id: event.atome_id }, 'delete');
    }
}

export async function commitAtomeEvent({
    event,
    authenticatedUserId,
    syncSource = ''
} = {}) {
    if (!authenticatedUserId) {
        return { ok: false, error: 'authenticated_user_missing' };
    }
    if (!event || typeof event !== 'object') {
        return { ok: false, error: 'invalid_event_payload' };
    }
    const actor = normalizeAtomeCommitActor(event.actor, authenticatedUserId);
    const normalizedSyncSource = String(syncSource || event.sync_source || '').toLowerCase();
    const shouldEnqueue = SYNC_REMOTE_ENABLED && normalizedSyncSource !== SYNC_TARGET_SERVER;
    let created = null;
    let authorization;
    try {
        authorization = await db.withTransaction(async () => {
            const decision = await authorizeAtomeEventWrite(event, authenticatedUserId);
            if (!decision.allowed) return decision;
            created = await db.appendEvent(
                { ...event, actor },
                {
                    syncTarget: shouldEnqueue ? SYNC_TARGET_SERVER : null,
                    skipQueue: !shouldEnqueue
                }
            );
            return decision;
        });
    } catch (error) {
        if (['property_version_conflict', 'event_id_conflict'].includes(error?.code || error?.message)) {
            return { ok: false, error: error.code || error.message };
        }
        throw error;
    }
    if (!authorization.allowed) {
        return {
            ok: false,
            error: authorization.reason,
            denied_keys: authorization.deniedKeys
        };
    }
    const inserted = db.wasEventInserted(created);
    if (inserted) await emitCommittedAtomeSync(created);
    return { ok: true, event: created, inserted };
}

export async function commitAtomeEvents({
    events,
    authenticatedUserId,
    actor = null,
    txId = null,
    syncSource = ''
} = {}) {
    if (!authenticatedUserId) {
        return { ok: false, error: 'authenticated_user_missing' };
    }
    if (!Array.isArray(events) || !events.length) {
        return { ok: false, error: 'missing_events_array' };
    }
    const secondaryActor = normalizeAtomeCommitActor(actor, authenticatedUserId);
    const normalizedEvents = events.map((evt) => ({
        ...evt,
        actor: evt?.actor
            ? normalizeAtomeCommitActor(evt.actor, authenticatedUserId)
            : secondaryActor
    }));
    const normalizedSyncSource = String(syncSource || '').toLowerCase();
    const shouldEnqueue = SYNC_REMOTE_ENABLED && normalizedSyncSource !== SYNC_TARGET_SERVER;
    let created = [];
    let authorization;
    try {
        authorization = await db.withTransaction(async () => {
            const decision = await authorizeAtomeEventBatch(normalizedEvents, authenticatedUserId);
            if (!decision.allowed) return decision;
            created = await db.appendEvents(normalizedEvents, {
                txId,
                syncTarget: shouldEnqueue ? SYNC_TARGET_SERVER : null,
                skipQueue: !shouldEnqueue
            });
            return decision;
        });
    } catch (error) {
        if (['property_version_conflict', 'event_id_conflict'].includes(error?.code || error?.message)) {
            return { ok: false, error: error.code || error.message };
        }
        throw error;
    }
    if (!authorization.allowed) {
        return {
            ok: false,
            error: authorization.denied?.reason || 'event_batch_write_denied',
            denied_event: authorization.denied?.eventId || null,
            denied_keys: authorization.denied?.deniedKeys || []
        };
    }
    const latestByAtome = new Map();
    const insertedEvents = (created || []).filter((evt) => db.wasEventInserted(evt));
    for (const evt of insertedEvents) {
        const atomeId = evt?.atome_id;
        if (!atomeId || evt?.kind === 'snapshot') continue;
        latestByAtome.set(atomeId, evt);
    }
    await Promise.all(Array.from(latestByAtome.values()).map((evt) => emitCommittedAtomeSync(evt)));
    return { ok: true, events: created, inserted_count: insertedEvents.length };
}

export { syncAtomeViaWebSocket };
