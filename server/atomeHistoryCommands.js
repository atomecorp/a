import db from '../database/adole.js';
import {
    eventDeletedPropertyKeys,
    eventPropertyPatch,
    eventTouchedPropertyKeys
} from '../database/adole_event_contract.js';
import { classifyHistoryEvent, HISTORY_EVENT_CLASS } from '../database/adole_history_transactions.js';
import { commitAtomeEvents } from './atomeRoutes.orm.js';
import { wsResponse, wsErrorResponse, requestIdOf } from './wsResponse.js';

export async function handleAtomeHistoryCommand(message, userId, connection) {
    const options = { operation: String(message.action || message.action_type || message.op || ''),
        sourceTxId: message.source_tx_id || message.sourceTxId || null,
        atomeIds: message.atome_ids || message.atomeIds || [], requestId: requestIdOf(message) };
    const router = connection?._wsApiVaultRouter;
    const result = router ? await router.applyHistory(userId, options)
        : await executeAtomeHistoryCommand({ ...options, authenticatedUserId: userId });
    if (!result.ok) return wsErrorResponse('history', message, result.error);
    for (const event of result.inserted_events || result.events || []) await connection?._wsApiSyncRuntime?.publish(event);
    return wsResponse('history', message, true, { events: result.events });
}

const parseStoredValue = (value) => {
    if (value === null || value === undefined) return null;
    try { return JSON.parse(value); } catch { return value; }
};

const currentProperties = async (atomeId, keys) => {
    const properties = {};
    for (const key of keys) {
        const row = await db.query(
            'get',
            'SELECT particle_value, value_type, version FROM particles WHERE atome_id = ? AND particle_key = ?',
            [atomeId, key]
        );
        properties[key] = {
            version: Number(row?.version || 0),
            deleted: !row || row.value_type === 'deleted',
            value: !row || row.value_type === 'deleted' ? null : parseStoredValue(row.particle_value)
        };
    }
    return properties;
};

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const collapseContinuousGestureEvents = (events = []) => {
    const hasFrames = events.some((event) => (
        classifyHistoryEvent(event).class === HISTORY_EVENT_CLASS.CONTINUOUS_FRAME
    ));
    if (!hasFrames) return events.filter((event) => classifyHistoryEvent(event).undo_visible);
    const groups = new Map();
    for (const event of events) {
        const atomeId = String(event?.atome_id || '');
        if (!atomeId) continue;
        if (!groups.has(atomeId)) groups.set(atomeId, []);
        groups.get(atomeId).push(event);
    }
    return Array.from(groups.values()).map((group) => {
        const marker = group.filter((event) => classifyHistoryEvent(event).undo_visible).at(-1) || group.at(-1);
        const props = {};
        const before = {};
        const beforeMissing = new Set();
        const firstTouch = new Set();
        let beforeIdentity;
        for (const event of group) {
            const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
            const patch = eventPropertyPatch(event) || {};
            for (const key of eventTouchedPropertyKeys(event)) {
                if (!firstTouch.has(key)) {
                    if (Object.hasOwn(payload.before || {}, key)) before[key] = payload.before[key];
                    else if ((payload.before_missing || []).includes(key)) beforeMissing.add(key);
                    firstTouch.add(key);
                }
                if (Object.hasOwn(patch, key)) props[key] = patch[key];
            }
            if (beforeIdentity === undefined && Object.hasOwn(payload, 'before_identity')) {
                beforeIdentity = payload.before_identity;
            }
        }
        return {
            ...marker,
            payload: {
                ...(marker?.payload || {}), props, before, before_missing: Array.from(beforeMissing),
                ...(beforeIdentity === undefined ? {} : { before_identity: beforeIdentity })
            }
        };
    });
};

const historyPayload = (source, operation) => {
    if (operation === 'redo') {
        return {
            props: eventPropertyPatch(source) || {},
            delete_keys: eventDeletedPropertyKeys(source)
        };
    }
    const payload = source?.payload && typeof source.payload === 'object' ? source.payload : {};
    return {
        props: payload.before && typeof payload.before === 'object' ? payload.before : {},
        delete_keys: Array.isArray(payload.before_missing) ? payload.before_missing : []
    };
};

export async function executeAtomeHistoryCommand({
    operation,
    sourceTxId,
    atomeIds = [],
    requestId,
    authenticatedUserId
} = {}) {
    if (operation !== 'undo' && operation !== 'redo') return { ok: false, error: 'history_operation_invalid' };
    if (!sourceTxId) return { ok: false, error: 'history_source_transaction_required' };
    if (!requestId) return { ok: false, error: 'history_request_id_required' };

    const requestedIds = new Set((Array.isArray(atomeIds) ? atomeIds : []).map(String).filter(Boolean));
    const transactionEvents = await db.listEvents({ txId: sourceTxId, order: 'asc', limit: 10000 });
    const undoVisibleEvents = collapseContinuousGestureEvents(transactionEvents);
    const sourceEvents = requestedIds.size
        ? undoVisibleEvents.filter((event) => requestedIds.has(String(event?.atome_id || '')))
        : undoVisibleEvents;
    if (!sourceEvents.length) return { ok: false, error: 'history_source_transaction_not_found' };
    if (sourceEvents.some((event) => (
        String(event?.kind || '').toLowerCase() !== 'delete'
        && (!event?.payload || !Object.hasOwn(event.payload, 'before'))
    ))) {
        return { ok: false, error: 'history_source_transaction_not_invertible' };
    }

    const ordered = operation === 'undo' ? [...sourceEvents].reverse() : sourceEvents;
    const propertyStateByTarget = new Map();
    const events = [];
    for (const source of ordered) {
        const atomeId = source.atome_id;
        if (Object.hasOwn(source.payload || {}, 'before_identity') && source.payload.before_identity === null) {
            events.push({
                id: 'history:' + operation + ':' + requestId + ':' + source.id,
                kind: operation === 'undo' ? 'delete' : 'restore', atome_id: atomeId,
                project_id: source.project_id || null,
                payload: { ...(operation === 'redo' ? historyPayload(source, operation) : {}),
                    source_tx_id: sourceTxId, source_event_id: source.id }
            });
            continue;
        }
        if (String(source?.kind || '').toLowerCase() === 'delete') {
            if (!atomeId) continue;
            events.push({
                id: `history:${operation}:${requestId}:${source.id}`,
                kind: operation === 'undo' ? 'restore' : 'delete',
                atome_id: atomeId,
                project_id: source.project_id || null,
                payload: {
                    source_tx_id: sourceTxId,
                    source_event_id: source.id
                }
            });
            continue;
        }
        const keys = eventTouchedPropertyKeys(source);
        if (!atomeId || !keys.length) continue;
        if (!propertyStateByTarget.has(atomeId)) {
            propertyStateByTarget.set(atomeId, await currentProperties(atomeId, keys));
        } else {
            const properties = propertyStateByTarget.get(atomeId);
            const missing = keys.filter((key) => !Object.hasOwn(properties, key));
            Object.assign(properties, await currentProperties(atomeId, missing));
        }
        const payload = historyPayload(source, operation);
        const properties = propertyStateByTarget.get(atomeId);
        const expected = Object.fromEntries(keys.map((key) => [key, properties[key].version]));
        for (const key of keys) {
            const property = properties[key];
            if (payload.delete_keys.includes(key)) {
                if (!property.deleted) property.version += 1;
                property.deleted = true;
                property.value = null;
            } else if (Object.hasOwn(payload.props, key)) {
                const value = payload.props[key];
                if (property.deleted || !sameValue(property.value, value)) property.version += 1;
                property.deleted = false;
                property.value = value;
            }
        }
        events.push({
            id: `history:${operation}:${requestId}:${source.id}`,
            kind: `history.${operation}`,
            atome_id: atomeId,
            project_id: source.project_id || null,
            payload: {
                ...payload,
                expected_versions: expected,
                source_tx_id: sourceTxId,
                source_event_id: source.id
            }
        });
    }
    if (!events.length) return { ok: false, error: 'history_source_transaction_empty' };
    return commitAtomeEvents({
        events,
        authenticatedUserId,
        actor: { type: 'user', id: authenticatedUserId },
        txId: `history:${operation}:${sourceTxId}:${requestId}`
    });
}
