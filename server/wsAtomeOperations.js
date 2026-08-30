import db from '../database/adole.js';
import { buildStateSnapshotRestoreEvents } from '../database/state_snapshot_restore.js';
import {
    commitAtomeEvent,
    commitAtomeEvents
} from './atomeRoutes.orm.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import {
    projectAtomeCapabilitiesForRead,
    projectAtomePropertyVersionsForRead,
    projectAtomePropertiesForRead,
    projectEventForRead
} from './atomePropertySecurity.js';
import { createServerConditionAuthority } from './conditionsQueryAuthority.js';
import { executeAtomeHistoryCommand } from './atomeHistoryCommands.js';
import { wsResponse as response, wsErrorResponse as errorResponse, requestIdOf } from './wsResponse.js';


const MUTATING_ACTIONS = new Set([
    'events:commit',
    'events:commit-batch',
    'snapshot:create',
    'snapshot:restore',
    'user-data:delete-all',
    'sync:push',
    'sync:ack',
    'history:undo',
    'history:redo'
]);

function actionOf(message) {
    return String(message?.action || message?.action_type || message?.op || '').trim();
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
        if (userId && await isWsApiPrincipalProvisioned(userId)) return { userId };
        if (userId) return { error: errorResponse(type, message, 'remote_account_not_provisioned') };
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
        const projected = await projectEventForRead(event, userId);
        if (projected) result.push(projected);
    }
    return result;
}

async function projectStateForRead(state, userId) {
    const atomeId = state?.atome_id || state?.id || null;
    if (!atomeId) return null;
    if (state?.vault_principal_id && String(state.vault_principal_id) === String(userId)) {
        return { ...state, capabilities: { read: true, write: true, delete: true, share: true } };
    }
    const properties = await projectAtomePropertiesForRead(atomeId, state.properties || {}, userId);
    if (!Object.keys(properties).length) return null;
    const propertyVersions = await projectAtomePropertyVersionsForRead(
        atomeId,
        Object.keys(properties),
        userId
    );
    const capabilities = await projectAtomeCapabilitiesForRead(
        atomeId,
        Object.keys(properties),
        userId
    );
    return { ...state, properties, property_versions: propertyVersions, capabilities };
}

async function conditionAuthorityFor(userId) {
    const loadStates = async (scope = {}, request = {}) => {
        const projectId = scope.projectId || scope.project_id || request.projectId || request.project_id || null;
        const rawStates = await db.listStateCurrent(projectId, {
            ownerId: userId,
            includeShared: scope.includeShared === true || request.includeShared === true,
            excludeSystem: request.excludeSystem === true,
            limit: request.candidateLimit || 10000
        });
        const projected = (await Promise.all(rawStates.map((state) => projectStateForRead(state, userId)))).filter(Boolean);
        const allowedTypes = new Set((scope.types || []).map((entry) => String(entry).toLowerCase()));
        return allowedTypes.size
            ? projected.filter((state) => allowedTypes.has(String(state.type || state.atome_type || '').toLowerCase()))
            : projected;
    };
    const readState = async (id) => projectStateForRead(await db.getStateCurrent(id), userId);
    return createServerConditionAuthority({ loadStates, readState });
}

async function handleConditions(message, userId) {
    const action = actionOf(message);
    const authority = await conditionAuthorityFor(userId);
    const request = message.request && typeof message.request === 'object' ? message.request : message;
    if (action === 'properties-discover') {
        return response('conditions', message, true, { items: await authority.discover(request) });
    }
    if (action === 'once') {
        return response('conditions', message, true, await authority.once(request));
    }
    return errorResponse('conditions', message, `Unknown conditions action: ${action || 'missing'}`);
}

async function handleDirectory(message, connection, userId) {
    const service = connection?._wsApiDirectoryService;
    if (!service) return errorResponse('directory', message, 'directory_service_unavailable');
    const action = actionOf(message);
    if (action !== 'list' && action !== 'search') {
        return errorResponse('directory', message, `Unknown directory action: ${action || 'missing'}`);
    }
    const entries = await service.list({
        query: action === 'search' ? message.query : null,
        limit: message.limit,
        offset: message.offset,
        requesterId: userId
    });
    return response('directory', message, true, { entries });
}

async function handleEvents(message, connection, userId) {
    const action = actionOf(message);
    const vaultRouter = connection?._wsApiVaultRouter || null;
    if (action === 'commit') {
        const event = message.event || message.body || message.payload || null;
        const result = vaultRouter
            ? await vaultRouter.commit(userId, event, { source: message.source || event?.source || null })
                .then((entry) => ({ ok: true, ...entry }))
            : await commitAtomeEvent({
                event,
                authenticatedUserId: userId,
                syncSource: message.sync_source || event?.sync_source || ''
            });
        if (result.ok && result.inserted) {
            await connection?._wsApiSyncRuntime?.publish(result.event);
            if (String(result.event?.atome_id || '') === String(userId)) {
                await connection?._wsApiDirectoryService?.refreshPrincipal(userId);
            }
        }
        return response('events', message, result.ok, result.ok
            ? { event: result.event }
            : { error: result.error || 'commit_failed' });
    }
    if (action === 'commit-batch') {
        const events = Array.isArray(message.events) ? message.events : [];
        const result = vaultRouter
            ? await vaultRouter.commitBatch(userId, events, {
                txId: message.tx_id || message.txId || null,
                source: message.source || null
            }).then((entries) => {
                const insertedEntries = entries.filter((entry) => entry.inserted);
                return {
                    ok: true,
                    events: entries.map((entry) => entry.event),
                    inserted_events: insertedEntries.map((entry) => entry.event),
                    inserted_count: insertedEntries.length
                };
            })
            : await commitAtomeEvents({
                events,
                authenticatedUserId: userId,
                actor: message.actor || null,
                txId: message.tx_id || message.txId || null,
                syncSource: message.sync_source || ''
            });
        if (result.ok && result.inserted_count > 0) {
            let refreshDirectory = false;
            const insertedEvents = Array.isArray(result.inserted_events)
                ? result.inserted_events
                : (result.events || []).filter((event) => db.wasEventInserted(event));
            for (const committedEvent of insertedEvents) {
                await connection?._wsApiSyncRuntime?.publish(committedEvent);
                if (String(committedEvent?.atome_id || '') === String(userId)) refreshDirectory = true;
            }
            if (refreshDirectory) await connection?._wsApiDirectoryService?.refreshPrincipal(userId);
        }
        return response('events', message, result.ok, result.ok
            ? { events: result.events }
            : { error: result.error || 'commit_batch_failed' });
    }
    if (action === 'list') {
        const listOptions = {
            projectId: message.project_id || message.projectId || null,
            atomeId: message.atome_id || message.atomeId || null,
            txId: message.tx_id || message.txId || null,
            gestureId: message.gesture_id || message.gestureId || null,
            since: message.since || null,
            until: message.until || null,
            limit: message.limit,
            offset: message.offset,
            order: message.order || 'asc'
        };
        const events = vaultRouter
            ? await vaultRouter.listEvents(userId, listOptions)
            : await db.listEvents(listOptions);
        return response('events', message, true, {
            events: await filterReadableEvents(events, userId)
        });
    }
    return errorResponse('events', message, `Unknown events action: ${action || 'missing'}`);
}

async function handleStateCurrent(message, userId, connection) {
    const action = actionOf(message);
    const vaultRouter = connection?._wsApiVaultRouter || null;
    if (action === 'get') {
        const atomeId = message.atome_id || message.atomeId || null;
        if (!atomeId) return errorResponse('state-current', message, 'Missing atome_id');
        const rawState = vaultRouter
            ? await vaultRouter.getState(userId, atomeId)
            : await db.getStateCurrent(atomeId);
        const state = await projectStateForRead(rawState, userId);
        return state
            ? response('state-current', message, true, { state })
            : errorResponse('state-current', message, 'State not found');
    }
    if (action === 'list') {
        const projectId = message.project_id || message.projectId || null;
        const options = {
            limit: message.limit,
            offset: message.offset,
            ownerId: userId,
            includeShared: message.include_shared === true || message.includeShared === true,
            excludeSystem: message.exclude_system === true || message.excludeSystem === true
        };
        const rawStates = vaultRouter
            ? await vaultRouter.listStates(userId, { ...options, project_id: projectId })
            : await db.listStateCurrent(projectId, options);
        const states = (await Promise.all(rawStates.map((state) => projectStateForRead(state, userId)))).filter(Boolean);
        const includeTotal = message.include_total === true || message.includeTotal === true;
        return response('state-current', message, true, { states, ...(includeTotal ? { total: states.length } : {}) });
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
    const events = await db.listEvents({
        atomeId,
        limit: message.limit || 100,
        offset: message.offset,
        order: message.order || 'desc'
    });
    const projected = await filterReadableEvents(events, userId);
    if (!projected.length) return errorResponse('atome', message, 'Access denied');
    return response('atome', message, true, {
        history: projected,
        versions: projected,
        events: projected
    });
}

async function handleHistoryCommand(message, userId) {
    const action = actionOf(message);
    const result = await executeAtomeHistoryCommand({
        operation: action,
        sourceTxId: message.source_tx_id || message.sourceTxId || null,
        requestId: requestIdOf(message),
        authenticatedUserId: userId
    });
    return result.ok
        ? response('history', message, true, { events: result.events })
        : errorResponse('history', message, result.error);
}

async function handleUserData(message, userId) {
    const action = actionOf(message);
    const rows = await db.getAtomesByOwner(userId, { limit: 10000 });
    const ownedIds = rows.map((row) => row.atome_id).filter((id) => id && id !== userId);
    if (action === 'export') {
        const rawStates = await db.listStateCurrent(null, {
            ownerId: userId,
            includeShared: true,
            limit: Number(message.limit) || 10000
        });
        const atomes = (await Promise.all(
            rawStates.map((state) => projectStateForRead(state, userId))
        )).filter(Boolean);
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

async function handleSync(message, userId, connection) {
    const action = actionOf(message);
    const vaultRouter = connection?._wsApiVaultRouter || null;
    if (action === 'get-pending') {
        const changes = await db.getPendingForSync(userId);
        return response('sync', message, true, { changes });
    }
    if (action === 'push') {
        const events = Array.isArray(message.events)
            ? message.events
            : (Array.isArray(message.changes) ? message.changes : []);
        const committed = vaultRouter
            ? await vaultRouter.commitBatch(userId, events, {
                txId: message.tx_id || message.txId || null,
                source: message.source || message.sync_source || 'ws-api',
                conflictMode: 'offline-lww'
            }).then((entries) => ({ ok: true, events: entries.map((entry) => entry.event) }))
            : await commitAtomeEvents({
                events,
                authenticatedUserId: userId,
                actor: { type: 'user', id: userId },
                txId: message.tx_id || message.txId || null,
                syncSource: message.sync_source || 'ws-api'
            });
        if (committed.ok) {
            for (const event of committed.events || []) {
                if (event?.inserted !== true) continue;
                await connection?._wsApiSyncRuntime?.publish(event);
            }
        }
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
        || type === 'history'
        || type === 'conditions'
        || type === 'directory'
        || (type === 'atome' && action === 'history');
    if (!supported) return null;

    const cached = cachedMutation(connection, message);
    if (cached) return cached;
    const auth = await requirePrincipal(connection, message, type);
    if (auth.error) return auth.error;

    try {
        let result;
        if (type === 'events') result = await handleEvents(message, connection, auth.userId);
        else if (type === 'state-current') result = await handleStateCurrent(message, auth.userId, connection);
        else if (type === 'snapshot') result = await handleSnapshot(message, auth.userId);
        else if (type === 'user-data') result = await handleUserData(message, auth.userId);
        else if (type === 'sync') result = await handleSync(message, auth.userId, connection);
        else if (type === 'conditions') result = await handleConditions(message, auth.userId);
        else if (type === 'directory') result = await handleDirectory(message, connection, auth.userId);
        else if (type === 'history') result = await handleHistoryCommand(message, auth.userId);
        else result = await handleAtomeHistory(message, auth.userId);
        return rememberMutation(connection, message, result);
    } catch (error) {
        return errorResponse(type, message, error);
    }
}
