import db from '../database/adole.js';
import { buildStateSnapshotRestoreEvents } from '../database/state_snapshot_restore.js';
import {
    commitAtomeEvent,
    commitAtomeEvents
} from './atomeRoutes.orm.js';
import { resolveWsApiPrincipal } from './wsApiIdentity.js';

const MUTATING_ACTIONS = new Set([
    'events:commit',
    'events:commit-batch',
    'snapshot:create',
    'snapshot:restore',
    'user-data:delete-all',
    'sync:push',
    'sync:ack'
]);

function requestIdOf(message) {
    return message?.requestId || message?.request_id || null;
}

function actionOf(message) {
    return String(message?.action || message?.action_type || message?.op || '').trim();
}

function response(type, message, success, fields = {}) {
    return {
        type: `${type}-response`,
        requestId: requestIdOf(message),
        success,
        ...fields
    };
}

function errorResponse(type, message, error) {
    return response(type, message, false, {
        error: error instanceof Error ? error.message : String(error)
    });
}

function requestCache(connection) {
    if (!connection._wsApiRequestResults) connection._wsApiRequestResults = new Map();
    return connection._wsApiRequestResults;
}

function cachedMutation(connection, message) {
    const requestId = requestIdOf(message);
    const key = `${message?.type || ''}:${actionOf(message)}`;
    if (!requestId || !MUTATING_ACTIONS.has(key)) return null;
    return requestCache(connection).get(`${key}:${requestId}`) || null;
}

function rememberMutation(connection, message, result) {
    const requestId = requestIdOf(message);
    const key = `${message?.type || ''}:${actionOf(message)}`;
    if (!requestId || !MUTATING_ACTIONS.has(key)) return result;
    const cache = requestCache(connection);
    cache.set(`${key}:${requestId}`, result);
    while (cache.size > 200) cache.delete(cache.keys().next().value);
    return result;
}

async function requirePrincipal(connection, message, type) {
    try {
        const userId = resolveWsApiPrincipal(connection, message);
        if (userId) return { userId };
        return { error: errorResponse(type, message, 'Authentication required') };
    } catch (error) {
        return { error: errorResponse(type, message, error) };
    }
}

async function canReadTarget(userId, targetId) {
    return Boolean(userId && targetId && await db.canRead(String(targetId), String(userId)));
}

async function canWriteTarget(userId, targetId) {
    return Boolean(userId && targetId && await db.canWrite(String(targetId), String(userId)));
}

async function filterReadableEvents(events, userId) {
    const result = [];
    for (const event of events) {
        const targetId = event?.atome_id || event?.project_id || null;
        if (await canReadTarget(userId, targetId)) result.push(event);
    }
    return result;
}

async function handleEvents(message, connection, userId) {
    const action = actionOf(message);
    if (action === 'commit') {
        const event = message.event || message.body || message.payload || null;
        const result = await commitAtomeEvent({
            event,
            authenticatedUserId: userId,
            syncSource: message.sync_source || event?.sync_source || ''
        });
        return response('events', message, result.ok, result.ok
            ? { event: result.event }
            : { error: result.error || 'commit_failed' });
    }
    if (action === 'commit-batch') {
        const events = Array.isArray(message.events) ? message.events : [];
        const result = await commitAtomeEvents({
            events,
            authenticatedUserId: userId,
            actor: message.actor || null,
            txId: message.tx_id || message.txId || null,
            syncSource: message.sync_source || ''
        });
        return response('events', message, result.ok, result.ok
            ? { events: result.events }
            : { error: result.error || 'commit_batch_failed' });
    }
    if (action === 'list') {
        const events = await db.listEvents({
            projectId: message.project_id || message.projectId || null,
            atomeId: message.atome_id || message.atomeId || null,
            txId: message.tx_id || message.txId || null,
            gestureId: message.gesture_id || message.gestureId || null,
            since: message.since || null,
            until: message.until || null,
            limit: message.limit,
            offset: message.offset,
            order: message.order || 'asc'
        });
        return response('events', message, true, {
            events: await filterReadableEvents(events, userId)
        });
    }
    return errorResponse('events', message, `Unknown events action: ${action || 'missing'}`);
}

async function handleStateCurrent(message, userId) {
    const action = actionOf(message);
    if (action === 'get') {
        const atomeId = message.atome_id || message.atomeId || null;
        if (!atomeId) return errorResponse('state-current', message, 'Missing atome_id');
        if (!await canReadTarget(userId, atomeId)) {
            return errorResponse('state-current', message, 'Access denied');
        }
        const state = await db.getStateCurrent(atomeId);
        return state
            ? response('state-current', message, true, { state })
            : errorResponse('state-current', message, 'State not found');
    }
    if (action === 'list') {
        const states = await db.listStateCurrent(
            message.project_id || message.projectId || null,
            {
                limit: message.limit,
                offset: message.offset,
                ownerId: userId,
                includeShared: message.include_shared === true || message.includeShared === true
            }
        );
        return response('state-current', message, true, { states });
    }
    return errorResponse('state-current', message, `Unknown state-current action: ${action || 'missing'}`);
}

async function requireSnapshotAccess(snapshot, userId, mode) {
    const targetId = snapshot?.project_id || snapshot?.atome_id || null;
    return mode === 'write'
        ? canWriteTarget(userId, targetId)
        : canReadTarget(userId, targetId);
}

async function handleSnapshot(message, userId) {
    const action = actionOf(message);
    if (action === 'create') {
        const projectId = message.project_id || message.projectId || null;
        const atomeId = message.atome_id || message.atomeId || null;
        const targetId = projectId || atomeId;
        if (!targetId) return errorResponse('snapshot', message, 'Missing project_id or atome_id');
        if (!await canWriteTarget(userId, targetId)) {
            return errorResponse('snapshot', message, 'Access denied');
        }
        const actor = { type: 'user', id: userId };
        const snapshotId = await db.createStateSnapshot({
            projectId,
            atomeId,
            label: message.label || null,
            actor,
            state: message.state || message.state_blob || null,
            snapshotType: message.snapshot_type || message.snapshotType || 'manual'
        });
        const committed = await commitAtomeEvent({
            authenticatedUserId: userId,
            event: {
                kind: 'snapshot',
                atome_id: atomeId || projectId,
                project_id: projectId,
                actor,
                payload: { snapshot_id: snapshotId, label: message.label || null }
            }
        });
        if (!committed.ok) return errorResponse('snapshot', message, committed.error);
        return response('snapshot', message, true, { snapshot_id: snapshotId });
    }
    if (action === 'list') {
        const projectId = message.project_id || message.projectId || null;
        if (!projectId) return errorResponse('snapshot', message, 'Missing project_id');
        if (!await canReadTarget(userId, projectId)) {
            return errorResponse('snapshot', message, 'Access denied');
        }
        const snapshots = await db.listStateSnapshots(projectId, {
            limit: message.limit,
            offset: message.offset
        });
        return response('snapshot', message, true, { snapshots });
    }
    if (action === 'get' || action === 'restore') {
        const snapshotId = message.snapshot_id || message.snapshotId || message.id || null;
        const snapshot = await db.getStateSnapshot(snapshotId);
        if (!snapshot) return errorResponse('snapshot', message, 'Snapshot not found');
        const mode = action === 'restore' ? 'write' : 'read';
        if (!await requireSnapshotAccess(snapshot, userId, mode)) {
            return errorResponse('snapshot', message, 'Access denied');
        }
        if (action === 'get') return response('snapshot', message, true, { snapshot });

        const actor = { type: 'user', id: userId };
        const events = buildStateSnapshotRestoreEvents(snapshot, { actor });
        for (const event of events) {
            if (!await canWriteTarget(userId, event.atome_id)) {
                return errorResponse('snapshot', message, `Access denied for ${event.atome_id}`);
            }
        }
        const committed = await commitAtomeEvents({
            events,
            authenticatedUserId: userId,
            actor,
            txId: message.tx_id || message.txId || `snapshot_restore_${snapshotId}`
        });
        if (!committed.ok) return errorResponse('snapshot', message, committed.error);
        return response('snapshot', message, true, {
            snapshot_id: snapshotId,
            events: committed.events
        });
    }
    return errorResponse('snapshot', message, `Unknown snapshot action: ${action || 'missing'}`);
}

async function handleAtomeHistory(message, userId) {
    const atomeId = message.atome_id || message.atomeId || message.id || null;
    if (!atomeId) return errorResponse('atome', message, 'Missing atome_id');
    if (!await canReadTarget(userId, atomeId)) {
        return errorResponse('atome', message, 'Access denied');
    }
    const events = await db.listEvents({
        atomeId,
        limit: message.limit || 100,
        offset: message.offset,
        order: message.order || 'desc'
    });
    return response('atome', message, true, {
        history: events,
        versions: events,
        events
    });
}

async function handleUserData(message, userId) {
    const action = actionOf(message);
    const rows = await db.getAtomesByOwner(userId, { limit: 10000 });
    const ownedIds = rows.map((row) => row.atome_id).filter((id) => id && id !== userId);
    if (action === 'export') {
        const atomes = [];
        for (const id of ownedIds) {
            const atome = await db.getAtome(id);
            if (atome) atomes.push(atome);
        }
        const events = await filterReadableEvents(await db.listEvents({
            limit: Number(message.limit) || 10000,
            order: 'asc'
        }), userId);
        return response('user-data', message, true, { atomes, events });
    }
    if (action === 'delete-all') {
        const actor = { type: 'user', id: userId };
        const events = [];
        for (const id of ownedIds) {
            if (!await db.canDelete(id, userId)) continue;
            events.push({
                kind: 'delete',
                atome_id: id,
                actor,
                payload: null
            });
        }
        if (!events.length) return response('user-data', message, true, { deleted: 0, events: [] });
        const committed = await commitAtomeEvents({
            events,
            authenticatedUserId: userId,
            actor,
            txId: message.tx_id || message.txId || `user_data_delete_${requestIdOf(message)}`
        });
        if (!committed.ok) return errorResponse('user-data', message, committed.error);
        return response('user-data', message, true, {
            deleted: committed.events.length,
            events: committed.events
        });
    }
    return errorResponse('user-data', message, `Unknown user-data action: ${action || 'missing'}`);
}

async function handleSync(message, userId) {
    const action = actionOf(message);
    if (action === 'get-pending') {
        const changes = await db.getPendingForSync(userId);
        return response('sync', message, true, { changes });
    }
    if (action === 'pull') {
        const events = await db.listEvents({
            since: message.since || null,
            until: message.until || null,
            limit: message.limit,
            offset: message.offset,
            order: 'asc'
        });
        return response('sync', message, true, {
            changes: await filterReadableEvents(events, userId)
        });
    }
    if (action === 'push') {
        const events = Array.isArray(message.events)
            ? message.events
            : (Array.isArray(message.changes) ? message.changes : []);
        const committed = await commitAtomeEvents({
            events,
            authenticatedUserId: userId,
            actor: { type: 'user', id: userId },
            txId: message.tx_id || message.txId || null,
            syncSource: message.sync_source || 'ws-api'
        });
        return committed.ok
            ? response('sync', message, true, { changes: committed.events })
            : errorResponse('sync', message, committed.error);
    }
    if (action === 'ack') {
        const ids = Array.isArray(message.atome_ids)
            ? message.atome_ids
            : (Array.isArray(message.atomeIds) ? message.atomeIds : []);
        const authorized = [];
        for (const id of ids) {
            if (await canWriteTarget(userId, id)) authorized.push(id);
        }
        if (authorized.length !== ids.length) {
            return errorResponse('sync', message, 'Access denied');
        }
        await db.markAsSynced(authorized);
        return response('sync', message, true, { acknowledged: authorized });
    }
    return errorResponse('sync', message, `Unknown sync action: ${action || 'missing'}`);
}

export async function handleWsAtomeOperation(message, connection) {
    const type = String(message?.type || '').trim();
    const action = actionOf(message);
    const supported = type === 'events'
        || type === 'state-current'
        || type === 'snapshot'
        || type === 'user-data'
        || type === 'sync'
        || (type === 'atome' && action === 'history');
    if (!supported) return null;

    const cached = cachedMutation(connection, message);
    if (cached) return cached;
    const auth = await requirePrincipal(connection, message, type);
    if (auth.error) return auth.error;

    try {
        let result;
        if (type === 'events') result = await handleEvents(message, connection, auth.userId);
        else if (type === 'state-current') result = await handleStateCurrent(message, auth.userId);
        else if (type === 'snapshot') result = await handleSnapshot(message, auth.userId);
        else if (type === 'user-data') result = await handleUserData(message, auth.userId);
        else if (type === 'sync') result = await handleSync(message, auth.userId);
        else result = await handleAtomeHistory(message, auth.userId);
        return rememberMutation(connection, message, result);
    } catch (error) {
        return errorResponse(type, message, error);
    }
}
