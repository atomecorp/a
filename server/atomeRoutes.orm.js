/**
 * Atome API Routes v3.0 - Using ADOLE v3.0 Schema
 * 
 * Server-side routes for Atome CRUD operations.
 * Uses the ADOLE data layer (atomes + particles tables).
 * Uses WebSocket EventBus for real-time sync (no POST).
 * Requires authentication for all operations.
 */

import db from '../database/adole.js';
import {
    resolveSyncAtomeType,
    sanitizeBoundaryAtomeProperties
} from './atomeRouteContract.js';
import {
    syncAtomeViaWebSocket
} from './atomeSyncRuntime.js';
import { registerAtomeCrudRoutes } from './atomeCrudRoutes.js';
import { registerAtomeEventRoutes } from './atomeEventRoutes.js';

const FASTIFY_EVENT_DEBUG =
    process.env.SQUIRREL_FASTIFY_EVENT_DEBUG === '1'
    || process.env.SQUIRREL_FASTIFY_EVENT_DEBUG === 'true'
    || process.env.SQUIRREL_SYNC_DEBUG === '1'
    || process.env.SQUIRREL_SYNC_DEBUG === 'true';
const TAURI_SYNC_URL = process.env.SQUIRREL_TAURI_URL || process.env.TAURI_URL || 'http://127.0.0.1:3000';
const SYNC_REMOTE_ENABLED = process.env.SQUIRREL_SYNC_REMOTE !== '0';
const SYNC_TARGET_SERVER = 'tauri';

function fastifyEventDebugLog(message, data = null) {
    if (!FASTIFY_EVENT_DEBUG) return;
    if (data === null || data === undefined) {
        console.log(`[Fastify] ${message}`);
        return;
    }
    console.log(`[Fastify] ${message}`, data);
}

/**
 * Validate authentication token and return user info
 */
async function validateToken(request) {
    const syncToken = process.env.SQUIRREL_SYNC_TOKEN;
    const headerSyncToken = request.headers['x-sync-token'];
    if (syncToken && headerSyncToken && headerSyncToken === syncToken) {
        const headerUserId = request.headers['x-user-id'] || request.headers['x-userid'];
        return {
            id: headerUserId || 'sync',
            userId: headerUserId || 'sync',
            username: 'sync',
            phone: null
        };
    }

    const authHeader = request.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : null;
    const cookieToken = request.cookies?.access_token || null;
    if (!bearerToken && !cookieToken) return null;

    const verifyCandidate = async (token) => {
        const jwt = await import('jsonwebtoken');
        const jwtSecret = String(process.env.JWT_SECRET || '').trim();
        if (jwtSecret.length < 32) {
            throw new Error('JWT_SECRET must be configured with at least 32 characters');
        }
        const decoded = jwt.default.verify(token, jwtSecret);
        return {
            id: decoded.sub || decoded.id || decoded.userId,
            userId: decoded.sub || decoded.id || decoded.userId,
            username: decoded.username,
            phone: decoded.phone
        };
    };

    try {
        return await verifyCandidate(bearerToken || cookieToken);
    } catch (e) {
        if (bearerToken && cookieToken) {
            try {
                return await verifyCandidate(cookieToken);
            } catch (cookieError) {
                e.cookie_fallback_error = cookieError.message;
            }
        }
        console.error('[Atome] Token verify error:', e.message);
        return null;
    }
}

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
    const created = await db.appendEvent(
        { ...event, actor },
        {
            syncTarget: shouldEnqueue ? SYNC_TARGET_SERVER : null,
            skipQueue: !shouldEnqueue
        }
    );
    await emitCommittedAtomeSync(created);
    return { ok: true, event: created };
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
    const created = await db.appendEvents(normalizedEvents, {
        txId,
        syncTarget: shouldEnqueue ? SYNC_TARGET_SERVER : null,
        skipQueue: !shouldEnqueue
    });
    const latestByAtome = new Map();
    for (const evt of created || []) {
        const atomeId = evt?.atome_id;
        if (!atomeId || evt?.kind === 'snapshot') continue;
        latestByAtome.set(atomeId, evt);
    }
    await Promise.all(Array.from(latestByAtome.values()).map((evt) => emitCommittedAtomeSync(evt)));
    return { ok: true, events: created };
}

/**
 * Register all atome routes
 */
export async function registerAtomeRoutes(server, dataSource = null) {
    // Initialize database (dataSource param is previous, kept for API compatibility)
    await db.initDatabase();

    registerAtomeCrudRoutes({ server, validateToken });

    registerAtomeEventRoutes({
        server,
        validateToken,
        commitAtomeEvent,
        commitAtomeEvents,
        fastifyEventDebugLog
    });

    // NOTE: All sync routes (pull, push, hash, reconcile, queue-status) are retired
    // Synchronization is now handled in real-time via WebSocket EventBus

    console.log('[Atome] Routes v3.0 registered (ADOLE v3.0 schema with WebSocket sync)');
}

export { syncAtomeViaWebSocket };
