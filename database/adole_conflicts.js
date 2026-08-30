import {
    eventDeletedPropertyKeys,
    eventPropertyPatch,
    eventTouchedPropertyKeys,
    resolveEventPayload
} from './adole_event_contract.js';

const LIFECYCLE_KEY = '__lifecycle__';

const timestampRank = (value) => {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? { valid: true, value: parsed } : { valid: false, value: Number.NEGATIVE_INFINITY };
};

const conflictKeys = (event) => {
    const keys = eventTouchedPropertyKeys(event);
    const kind = String(event?.kind || '').toLowerCase();
    if (kind === 'delete' || kind === 'restore') keys.push(LIFECYCLE_KEY);
    return Array.from(new Set(keys));
};

const compareCandidate = (event, current) => {
    if (!current) return { wins: true, reason: 'first_event' };
    const incoming = timestampRank(event.ts);
    const previous = timestampRank(current.event_ts);
    if (incoming.valid !== previous.valid) {
        return incoming.valid
            ? { wins: true, reason: 'valid_timestamp_over_invalid' }
            : { wins: false, reason: 'invalid_timestamp_below_valid' };
    }
    if (incoming.valid && incoming.value !== previous.value) {
        return incoming.value > previous.value
            ? { wins: true, reason: 'newer_timestamp' }
            : { wins: false, reason: 'older_timestamp' };
    }
    const lexical = String(event.id).localeCompare(String(current.event_id));
    return lexical > 0
        ? { wins: true, reason: incoming.valid ? 'equal_timestamp_event_id' : 'invalid_timestamp_event_id' }
        : { wins: false, reason: incoming.valid ? 'equal_timestamp_event_id' : 'invalid_timestamp_event_id' };
};

const projectionEvent = (event, decisions, mode) => {
    if (mode !== 'offline-lww') return event;
    const kind = String(event?.kind || '').toLowerCase();
    if ((kind === 'delete' || kind === 'restore') && decisions[LIFECYCLE_KEY]?.winner !== true) return null;
    const sourcePayload = resolveEventPayload(event);
    const payload = sourcePayload && typeof sourcePayload === 'object' ? { ...sourcePayload } : {};
    const patch = eventPropertyPatch(event) || {};
    const props = Object.fromEntries(
        Object.entries(patch).filter(([key]) => decisions[key]?.winner === true)
    );
    const deleteKeys = eventDeletedPropertyKeys(event).filter((key) => decisions[key]?.winner === true);
    if (!Object.keys(props).length && !deleteKeys.length && kind !== 'delete' && kind !== 'restore') return null;
    return {
        ...event,
        payload: { ...payload, props, delete_keys: deleteKeys }
    };
};

export function createAdoleConflictApi({ query }) {
    const evaluate = async (event, mode = 'interactive') => {
        const decisions = {};
        for (const key of conflictKeys(event)) {
            const current = await query(
                'get',
                `SELECT event_id, event_ts, timestamp_valid, sequence, decision
                 FROM event_property_winners WHERE atome_id = ? AND particle_key = ?`,
                [event.atome_id, key]
            );
            const decision = mode === 'offline-lww'
                ? compareCandidate(event, current)
                : { wins: true, reason: 'interactive_commit' };
            decisions[key] = {
                winner: decision.wins,
                reason: decision.reason,
                compared_event_id: current?.event_id || null
            };
        }
        return {
            mode,
            decisions,
            projectionEvent: projectionEvent(event, decisions, mode)
        };
    };

    const record = async (event, evaluation) => {
        const timestampValid = timestampRank(event.ts).valid ? 1 : 0;
        for (const [key, decision] of Object.entries(evaluation.decisions || {})) {
            if (!decision.winner) continue;
            await query(
                'run',
                `INSERT INTO event_property_winners
                 (atome_id, particle_key, event_id, event_ts, timestamp_valid, sequence, decision, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                 ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                    event_id = excluded.event_id,
                    event_ts = excluded.event_ts,
                    timestamp_valid = excluded.timestamp_valid,
                    sequence = excluded.sequence,
                    decision = excluded.decision,
                    updated_at = excluded.updated_at`,
                [event.atome_id, key, event.id, event.ts, timestampValid, event.sequence, decision.reason]
            );
        }
    };

    return { evaluate, record };
}

export { LIFECYCLE_KEY, compareCandidate, timestampRank };
