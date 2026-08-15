import db from '../database/adole.js';
import {
    eventDeletedPropertyKeys,
    eventPropertyPatch,
    eventTouchedPropertyKeys
} from '../database/adole_event_contract.js';
import { commitAtomeEvents } from './atomeRoutes.orm.js';

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
    requestId,
    authenticatedUserId
} = {}) {
    if (operation !== 'undo' && operation !== 'redo') return { ok: false, error: 'history_operation_invalid' };
    if (!sourceTxId) return { ok: false, error: 'history_source_transaction_required' };
    if (!requestId) return { ok: false, error: 'history_request_id_required' };

    const sourceEvents = await db.listEvents({ txId: sourceTxId, order: 'asc', limit: 10000 });
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
