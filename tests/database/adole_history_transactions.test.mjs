import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions,
    classifyHistoryEvent,
    selectRedoTransaction,
    selectUndoTransaction
} from '../../database/adole.js';

test('ADOLE HistoryTransaction groups continuous gestures by tx_id with only gesture_end undo-visible', () => {
    const transactions = buildHistoryTransactions([
        {
            id: 'evt_drag_frame_2',
            ts: '2026-06-12T10:00:00.030Z',
            rowid: 3,
            kind: 'gesture_frame',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_drag',
            atome_id: 'shape_tx'
        },
        {
            id: 'evt_drag_start',
            ts: '2026-06-12T10:00:00.010Z',
            rowid: 1,
            kind: 'gesture_start',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_drag',
            atome_id: 'shape_tx'
        },
        {
            id: 'evt_drag_frame_1',
            ts: '2026-06-12T10:00:00.020Z',
            rowid: 2,
            kind: 'gesture_frame',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_drag',
            atome_id: 'shape_tx'
        },
        {
            id: 'evt_drag_end',
            ts: '2026-06-12T10:00:00.040Z',
            rowid: 4,
            kind: 'gesture_end',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_drag',
            atome_id: 'shape_tx',
            payload: {
                props: {
                    left: '42px'
                }
            }
        },
        {
            id: 'evt_snapshot',
            ts: '2026-06-12T10:00:00.050Z',
            rowid: 5,
            kind: 'snapshot',
            tx_id: 'tx_snapshot'
        }
    ]);

    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].tx_id, 'tx_drag');
    assert.equal(transactions[0].event_count, 4);
    assert.equal(transactions[0].replay_event_count, 4);
    assert.equal(transactions[0].undo_visible_event_count, 1);
    assert.equal(transactions[0].visibility, HISTORY_TRANSACTION_VISIBILITY.UNDO_VISIBLE);
    assert.equal(transactions[0].redo_persistable, true);
    assert.equal(transactions[0].redo_rule, HISTORY_REDO_RULE.APPEND_ONLY_AFTER_CURSOR);
    assert.deepEqual(transactions[0].events.map((event) => event.id), [
        'evt_drag_start',
        'evt_drag_frame_1',
        'evt_drag_frame_2',
        'evt_drag_end'
    ]);
    assert.equal(transactions[1].tx_id, 'tx_snapshot');
    assert.equal(transactions[1].visibility, HISTORY_TRANSACTION_VISIBILITY.REPLAY_ONLY);
    assert.equal(transactions[1].redo_persistable, false);
});

test('ADOLE HistoryTransaction derives durable redo from append-only events after restart', () => {
    const persistedEvents = [
        {
            id: 'evt_create',
            ts: '2026-06-12T10:00:00.000Z',
            kind: 'set',
            tx_id: 'tx_create',
            atome_id: 'shape_history',
            payload: {
                props: {
                    left: 0
                }
            }
        },
        {
            id: 'evt_edit',
            ts: '2026-06-12T10:00:01.000Z',
            kind: 'set',
            tx_id: 'tx_edit',
            atome_id: 'shape_history',
            payload: {
                props: {
                    left: 10
                }
            }
        },
        {
            id: 'evt_drag_start',
            ts: '2026-06-12T10:00:02.000Z',
            kind: 'gesture_start',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_history',
            atome_id: 'shape_history'
        },
        {
            id: 'evt_drag_frame',
            ts: '2026-06-12T10:00:02.010Z',
            kind: 'gesture_frame',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_history',
            atome_id: 'shape_history'
        },
        {
            id: 'evt_drag_end',
            ts: '2026-06-12T10:00:02.020Z',
            kind: 'gesture_end',
            tx_id: 'tx_drag',
            gesture_id: 'gesture_history',
            atome_id: 'shape_history',
            payload: {
                props: {
                    left: 20
                }
            }
        },
        {
            id: 'evt_snapshot_audit',
            ts: '2026-06-12T10:00:03.000Z',
            kind: 'snapshot',
            tx_id: 'tx_snapshot'
        },
        {
            id: 'evt_history_undo_audit',
            ts: '2026-06-12T10:00:04.000Z',
            kind: 'history.undo',
            tx_id: 'tx_history_undo'
        }
    ];
    const firstLoadTransactions = buildHistoryTransactions(persistedEvents);
    const undo = selectUndoTransaction(firstLoadTransactions);

    assert.equal(undo.ok, true);
    assert.equal(undo.transaction.tx_id, 'tx_drag');
    assert.deepEqual(undo.next_cursor, {
        index: 2,
        after_tx_id: 'tx_edit',
        before_tx_id: 'tx_drag'
    });

    const restartedTransactions = buildHistoryTransactions(persistedEvents);
    const redo = selectRedoTransaction(restartedTransactions, undo.next_cursor);

    assert.equal(redo.ok, true);
    assert.equal(redo.transaction.tx_id, 'tx_drag');
    assert.equal(redo.redo_source, 'append_only_events_after_cursor');
    assert.deepEqual(redo.next_cursor, {
        index: 3,
        after_tx_id: 'tx_drag',
        before_tx_id: 'tx_snapshot'
    });
});

test('ADOLE HistoryTransaction assigns missing tx_id to isolated event transactions', () => {
    const transactions = buildHistoryTransactions([
        {
            id: 'evt_without_tx_a',
            ts: '2026-06-12T10:00:00.000Z',
            kind: 'set',
            atome_id: 'shape_missing_tx'
        },
        {
            id: 'evt_without_tx_b',
            ts: '2026-06-12T10:00:01.000Z',
            kind: 'set',
            atome_id: 'shape_missing_tx'
        }
    ]);

    assert.deepEqual(transactions.map((transaction) => transaction.tx_id), [
        'event:evt_without_tx_a',
        'event:evt_without_tx_b'
    ]);
    assert.equal(transactions[0].undo_visible, true);
    assert.equal(transactions[1].undo_visible, true);
});

test('ADOLE HistoryTransaction records non-contiguous tx_id reuse as an integrity violation', () => {
    const transactions = buildHistoryTransactions([
        {
            id: 'evt_a_1',
            ts: '2026-06-12T10:00:00.000Z',
            kind: 'set',
            tx_id: 'tx_a',
            atome_id: 'shape_a'
        },
        {
            id: 'evt_b_1',
            ts: '2026-06-12T10:00:01.000Z',
            kind: 'set',
            tx_id: 'tx_b',
            atome_id: 'shape_b'
        },
        {
            id: 'evt_a_2',
            ts: '2026-06-12T10:00:02.000Z',
            kind: 'set',
            tx_id: 'tx_a',
            atome_id: 'shape_a'
        }
    ]);

    const reused = transactions.find((transaction) => transaction.tx_id === 'tx_a');
    assert.ok(reused);
    assert.deepEqual(reused.integrity_violations, ['non_contiguous_tx_id']);
});

test('ADOLE HistoryTransaction classifies history controls as replay-visible but not undo-visible', () => {
    const classification = classifyHistoryEvent({ kind: 'molecule.history.redo' });

    assert.equal(classification.undo_visible, false);
    assert.equal(classification.replay_visible, true);
    assert.equal(classification.redo_persistable, false);
});
