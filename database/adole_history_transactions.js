export const HISTORY_EVENT_CLASS = Object.freeze({
    PERSISTENT: 'persistent',
    CONTINUOUS_START: 'continuous_start',
    CONTINUOUS_FRAME: 'continuous_frame',
    CONTINUOUS_END: 'continuous_end',
    HISTORY_CONTROL: 'history_control',
    EPHEMERAL: 'ephemeral'
});

export const HISTORY_TRANSACTION_VISIBILITY = Object.freeze({
    UNDO_VISIBLE: 'undo_visible',
    REPLAY_ONLY: 'replay_only',
    AUDIT_ONLY: 'audit_only'
});

export const HISTORY_REDO_RULE = Object.freeze({
    APPEND_ONLY_AFTER_CURSOR: 'append_only_after_cursor',
    NOT_REDO_PERSISTABLE: 'not_redo_persistable'
});

const CONTINUOUS_START_KINDS = new Set(['gesture_start', 'gesture.start']);
const CONTINUOUS_FRAME_KINDS = new Set(['gesture_frame', 'gesture.frame']);
const CONTINUOUS_END_KINDS = new Set(['gesture_end', 'gesture.end']);
const AUDIT_ONLY_KINDS = new Set(['snapshot', 'checkpoint']);
const EPHEMERAL_KINDS = new Set(['hover', 'focus', 'blur', 'preview', 'presence']);
const HISTORY_CONTROL_SUFFIXES = new Set(['undo', 'redo']);

const safeParseJson = (value) => {
    if (!value || typeof value !== 'string') return value || null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const normalizeKey = (value) => {
    const key = String(value || '').trim();
    return key || null;
};

const parseEventTime = (event) => {
    const ts = normalizeKey(event?.ts || event?.timestamp || event?.created_at);
    if (!ts) return 0;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
};

const resolveEventId = (event, index) => (
    normalizeKey(event?.id || event?.event_id || event?.eventId)
    || `event_index_${index}`
);

const resolvePayload = (event) => {
    if (!event || typeof event !== 'object') return null;
    if (event.payload !== undefined) {
        const payload = safeParseJson(event.payload);
        return payload && typeof payload === 'object' ? payload : null;
    }
    const props = event.props || event.properties || event.patch || event.delta || null;
    return props && typeof props === 'object' ? { props } : null;
};

const resolveNestedMetaValue = (payload, key) => (
    payload?.[key]
    || payload?.meta?.[key]
    || payload?.props?.[key]
    || payload?.properties?.[key]
    || null
);

export function classifyHistoryEvent(event = {}) {
    const kind = normalizeKey(event.kind || event.event);
    if (!kind) {
        throw new Error('History event kind is required');
    }
    const normalizedKind = kind.toLowerCase();
    const suffix = normalizedKind.split('.').pop();

    if (CONTINUOUS_START_KINDS.has(normalizedKind)) {
        return {
            class: HISTORY_EVENT_CLASS.CONTINUOUS_START,
            undo_visible: false,
            replay_visible: true,
            redo_persistable: false,
            redo_rule: HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE
        };
    }
    if (CONTINUOUS_FRAME_KINDS.has(normalizedKind)) {
        return {
            class: HISTORY_EVENT_CLASS.CONTINUOUS_FRAME,
            undo_visible: false,
            replay_visible: true,
            redo_persistable: false,
            redo_rule: HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE
        };
    }
    if (CONTINUOUS_END_KINDS.has(normalizedKind)) {
        return {
            class: HISTORY_EVENT_CLASS.CONTINUOUS_END,
            undo_visible: true,
            replay_visible: true,
            redo_persistable: true,
            redo_rule: HISTORY_REDO_RULE.APPEND_ONLY_AFTER_CURSOR
        };
    }
    if (HISTORY_CONTROL_SUFFIXES.has(suffix) || normalizedKind.startsWith('history.')) {
        return {
            class: HISTORY_EVENT_CLASS.HISTORY_CONTROL,
            undo_visible: false,
            replay_visible: true,
            redo_persistable: false,
            redo_rule: HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE
        };
    }
    if (EPHEMERAL_KINDS.has(normalizedKind)) {
        return {
            class: HISTORY_EVENT_CLASS.EPHEMERAL,
            undo_visible: false,
            replay_visible: false,
            redo_persistable: false,
            redo_rule: HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE
        };
    }
    if (AUDIT_ONLY_KINDS.has(normalizedKind)) {
        return {
            class: HISTORY_EVENT_CLASS.PERSISTENT,
            undo_visible: false,
            replay_visible: true,
            redo_persistable: false,
            redo_rule: HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE
        };
    }
    return {
        class: HISTORY_EVENT_CLASS.PERSISTENT,
        undo_visible: true,
        replay_visible: true,
        redo_persistable: true,
        redo_rule: HISTORY_REDO_RULE.APPEND_ONLY_AFTER_CURSOR
    };
}

export function normalizeHistoryEvent(event = {}, index = 0) {
    const payload = resolvePayload(event);
    const id = resolveEventId(event, index);
    const txId =
        normalizeKey(event.tx_id || event.txId)
        || normalizeKey(resolveNestedMetaValue(payload, 'tx_id') || resolveNestedMetaValue(payload, 'txId'))
        || `event:${id}`;
    const classification = classifyHistoryEvent(event);
    return {
        id,
        tx_id: txId,
        tx_source: event.tx_id || event.txId ? 'tx_id' : 'event_id',
        atome_id: normalizeKey(event.atome_id || event.atomeId),
        project_id: normalizeKey(event.project_id || event.projectId),
        gesture_id: normalizeKey(
            event.gesture_id
            || event.gestureId
            || resolveNestedMetaValue(payload, 'gesture_id')
            || resolveNestedMetaValue(payload, 'gestureId')
        ),
        kind: normalizeKey(event.kind || event.event),
        ts: normalizeKey(event.ts || event.timestamp || event.created_at),
        rowid: Number.isFinite(Number(event.rowid)) ? Number(event.rowid) : null,
        original_index: index,
        payload,
        actor: safeParseJson(event.actor) || event.actor || null,
        history_class: classification.class,
        undo_visible: classification.undo_visible,
        replay_visible: classification.replay_visible,
        redo_persistable: classification.redo_persistable,
        redo_rule: classification.redo_rule
    };
}

const compareHistoryEvents = (left, right) => {
    const leftTime = parseEventTime(left);
    const rightTime = parseEventTime(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.rowid !== null && right.rowid !== null && left.rowid !== right.rowid) {
        return left.rowid - right.rowid;
    }
    return left.original_index - right.original_index;
};

const createTransactionDraft = (event, order) => ({
    tx_id: event.tx_id,
    order,
    first_ts: event.ts,
    last_ts: event.ts,
    events: [],
    atomeIds: new Set(),
    projectIds: new Set(),
    gestureIds: new Set(),
    kinds: new Set(),
    classes: new Set(),
    undo_visible_event_count: 0,
    replay_event_count: 0,
    redo_persistable_event_count: 0,
    integrity_violations: []
});

const pushEvent = (transaction, event) => {
    transaction.events.push(event);
    transaction.last_ts = event.ts || transaction.last_ts;
    if (event.atome_id) transaction.atomeIds.add(event.atome_id);
    if (event.project_id) transaction.projectIds.add(event.project_id);
    if (event.gesture_id) transaction.gestureIds.add(event.gesture_id);
    if (event.kind) transaction.kinds.add(event.kind);
    transaction.classes.add(event.history_class);
    if (event.undo_visible) transaction.undo_visible_event_count += 1;
    if (event.replay_visible) transaction.replay_event_count += 1;
    if (event.redo_persistable) transaction.redo_persistable_event_count += 1;
};

const finalizeTransaction = (transaction) => {
    const undoVisible = transaction.undo_visible_event_count > 0;
    const replayOnly = !undoVisible && transaction.replay_event_count > 0;
    return {
        tx_id: transaction.tx_id,
        order: transaction.order,
        first_ts: transaction.first_ts,
        last_ts: transaction.last_ts,
        event_count: transaction.events.length,
        undo_visible_event_count: transaction.undo_visible_event_count,
        replay_event_count: transaction.replay_event_count,
        redo_persistable_event_count: transaction.redo_persistable_event_count,
        visibility: undoVisible
            ? HISTORY_TRANSACTION_VISIBILITY.UNDO_VISIBLE
            : (replayOnly ? HISTORY_TRANSACTION_VISIBILITY.REPLAY_ONLY : HISTORY_TRANSACTION_VISIBILITY.AUDIT_ONLY),
        undo_visible: undoVisible,
        redo_persistable: undoVisible && transaction.redo_persistable_event_count > 0,
        redo_rule: undoVisible && transaction.redo_persistable_event_count > 0
            ? HISTORY_REDO_RULE.APPEND_ONLY_AFTER_CURSOR
            : HISTORY_REDO_RULE.NOT_REDO_PERSISTABLE,
        atome_ids: [...transaction.atomeIds],
        project_ids: [...transaction.projectIds],
        gesture_ids: [...transaction.gestureIds],
        kinds: [...transaction.kinds],
        history_classes: [...transaction.classes],
        integrity_violations: [...transaction.integrity_violations],
        events: transaction.events
    };
};

export function buildHistoryTransactions(events = []) {
    if (!Array.isArray(events)) {
        throw new Error('History events must be an array');
    }
    const normalized = events
        .map((event, index) => normalizeHistoryEvent(event, index))
        .sort(compareHistoryEvents);
    const byTx = new Map();
    const closedTxIds = new Set();
    const ordered = [];
    let lastTxId = null;

    for (const event of normalized) {
        let transaction = byTx.get(event.tx_id);
        if (!transaction) {
            transaction = createTransactionDraft(event, ordered.length);
            byTx.set(event.tx_id, transaction);
            ordered.push(transaction);
        } else if (event.tx_id !== lastTxId && closedTxIds.has(event.tx_id)) {
            transaction.integrity_violations.push('non_contiguous_tx_id');
        }
        if (lastTxId && lastTxId !== event.tx_id) {
            closedTxIds.add(lastTxId);
        }
        pushEvent(transaction, event);
        lastTxId = event.tx_id;
    }

    return ordered.map(finalizeTransaction);
}

const cursorAt = (transactions, index) => ({
    index,
    after_tx_id: index > 0 ? transactions[index - 1]?.tx_id || null : null,
    before_tx_id: index < transactions.length ? transactions[index]?.tx_id || null : null
});

export function resolveHistoryCursor(transactions = [], cursor = null) {
    if (!Array.isArray(transactions)) {
        throw new Error('History transactions must be an array');
    }
    if (cursor == null) return transactions.length;
    if (Number.isFinite(cursor)) return Math.max(0, Math.min(cursor, transactions.length));
    if (typeof cursor !== 'object') {
        throw new Error('Invalid history cursor');
    }
    if (Number.isFinite(cursor.index)) {
        return Math.max(0, Math.min(cursor.index, transactions.length));
    }
    if (cursor.after_tx_id || cursor.afterTxId) {
        const txId = normalizeKey(cursor.after_tx_id || cursor.afterTxId);
        const index = transactions.findIndex((transaction) => transaction.tx_id === txId);
        if (index < 0) throw new Error('History cursor transaction not found');
        return index + 1;
    }
    if (cursor.before_tx_id || cursor.beforeTxId) {
        const txId = normalizeKey(cursor.before_tx_id || cursor.beforeTxId);
        const index = transactions.findIndex((transaction) => transaction.tx_id === txId);
        if (index < 0) throw new Error('History cursor transaction not found');
        return index;
    }
    return transactions.length;
}

export function selectUndoTransaction(transactions = [], cursor = null) {
    const index = resolveHistoryCursor(transactions, cursor);
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
        const transaction = transactions[candidate];
        if (!transaction?.undo_visible) continue;
        return {
            ok: true,
            operation: 'undo',
            transaction,
            cursor: cursorAt(transactions, index),
            next_cursor: cursorAt(transactions, candidate)
        };
    }
    return {
        ok: false,
        error: 'nothing_to_undo',
        cursor: cursorAt(transactions, index)
    };
}

export function selectRedoTransaction(transactions = [], cursor = null) {
    const index = resolveHistoryCursor(transactions, cursor);
    for (let candidate = index; candidate < transactions.length; candidate += 1) {
        const transaction = transactions[candidate];
        if (!transaction?.redo_persistable) continue;
        return {
            ok: true,
            operation: 'redo',
            redo_source: 'append_only_events_after_cursor',
            transaction,
            cursor: cursorAt(transactions, index),
            next_cursor: cursorAt(transactions, candidate + 1)
        };
    }
    return {
        ok: false,
        error: 'nothing_to_redo',
        cursor: cursorAt(transactions, index)
    };
}
