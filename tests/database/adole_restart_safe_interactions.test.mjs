import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildSemanticRenameEvent } from '../../atome/shared/semantic_rename_contract.js';

const readStates = async (db, ids = []) => {
    const states = {};
    for (const id of ids) {
        states[id] = await db.getStateCurrent(id);
    }
    return states;
};

const byTxId = (transactions, txId) => {
    const transaction = transactions.find((entry) => entry.tx_id === txId);
    assert.ok(transaction, `missing transaction ${txId}`);
    return transaction;
};

test('ADOLE restart reconstruction preserves text edit, drag, resize, and rename undo transactions', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-restart-safe-interactions-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?restart_safe_interactions=${Date.now()}`);
    const actor = { id: 'user_restart_safe' };
    const projectId = 'project_restart_safe';
    const textId = 'text_restart_safe';
    const shapeId = 'shape_restart_safe';
    const ids = [projectId, textId, shapeId];
    const renameEvent = buildSemanticRenameEvent({
        id: textId,
        type: 'text',
        properties: {
            label: 'Draft title',
            accessibility: {
                label: 'Draft title',
                actions: ['rename']
            }
        }
    }, 'Restart-safe title', {
        tx_id: 'tx_rename_text_restart'
    });

    try {
        await db.initDatabase();
        await db.appendEvents([
            {
                id: 'evt_restart_project_create',
                ts: '2026-06-12T12:00:00.000Z',
                kind: 'set',
                tx_id: 'tx_create_project_restart',
                atome_id: projectId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'project',
                        label: 'Restart-safe project'
                    }
                }
            },
            {
                id: 'evt_restart_text_create',
                ts: '2026-06-12T12:00:01.000Z',
                kind: 'set',
                tx_id: 'tx_create_text_restart',
                atome_id: textId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'text',
                        parent_id: projectId,
                        text: 'Draft text',
                        left: 10,
                        top: 12,
                        width: 180,
                        height: 32,
                        label: 'Draft title',
                        accessibility: {
                            label: 'Draft title',
                            actions: ['rename']
                        }
                    }
                }
            },
            {
                id: 'evt_restart_shape_create',
                ts: '2026-06-12T12:00:02.000Z',
                kind: 'set',
                tx_id: 'tx_create_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        type: 'shape',
                        parent_id: projectId,
                        left: 20,
                        top: 24,
                        width: 100,
                        height: 80
                    }
                }
            },
            {
                id: 'evt_restart_text_edit',
                ts: '2026-06-12T12:00:03.000Z',
                kind: 'set',
                tx_id: 'tx_text_edit_restart',
                atome_id: textId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        text: 'Edited after restart',
                        width: 210,
                        height: 48
                    }
                }
            },
            {
                id: 'evt_restart_drag_start',
                ts: '2026-06-12T12:00:04.000Z',
                kind: 'gesture_start',
                tx_id: 'tx_drag_shape_restart',
                gesture_id: 'gesture_drag_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor
            },
            {
                id: 'evt_restart_drag_frame',
                ts: '2026-06-12T12:00:04.010Z',
                kind: 'gesture_frame',
                tx_id: 'tx_drag_shape_restart',
                gesture_id: 'gesture_drag_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        left: 32,
                        top: 44
                    }
                }
            },
            {
                id: 'evt_restart_drag_end',
                ts: '2026-06-12T12:00:04.020Z',
                kind: 'gesture_end',
                tx_id: 'tx_drag_shape_restart',
                gesture_id: 'gesture_drag_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        left: 42,
                        top: 54
                    }
                }
            },
            {
                id: 'evt_restart_resize_start',
                ts: '2026-06-12T12:00:05.000Z',
                kind: 'gesture_start',
                tx_id: 'tx_resize_shape_restart',
                gesture_id: 'gesture_resize_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor
            },
            {
                id: 'evt_restart_resize_frame',
                ts: '2026-06-12T12:00:05.010Z',
                kind: 'gesture_frame',
                tx_id: 'tx_resize_shape_restart',
                gesture_id: 'gesture_resize_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        width: 140,
                        height: 92
                    }
                }
            },
            {
                id: 'evt_restart_resize_end',
                ts: '2026-06-12T12:00:05.020Z',
                kind: 'gesture_end',
                tx_id: 'tx_resize_shape_restart',
                gesture_id: 'gesture_resize_shape_restart',
                atome_id: shapeId,
                project_id: projectId,
                actor,
                payload: {
                    props: {
                        width: 160,
                        height: 96
                    }
                }
            },
            {
                id: 'evt_restart_rename_text',
                ts: '2026-06-12T12:00:06.000Z',
                project_id: projectId,
                actor,
                ...renameEvent
            }
        ]);

        const expected = await readStates(db, ids);
        const eventHistory = await db.listEvents({ projectId, order: 'asc', limit: 100 });
        const transactions = db.buildHistoryTransactions(eventHistory);

        assert.equal(eventHistory.length, 11);
        assert.equal(expected[textId].properties.text, 'Edited after restart');
        assert.equal(expected[textId].properties.label, 'Restart-safe title');
        assert.equal(expected[textId].properties.accessibility.label, 'Restart-safe title');
        assert.deepEqual(expected[textId].properties.accessibility.actions, ['rename']);
        assert.equal(expected[shapeId].properties.left, 42);
        assert.equal(expected[shapeId].properties.top, 54);
        assert.equal(expected[shapeId].properties.width, 160);
        assert.equal(expected[shapeId].properties.height, 96);

        const textEditTx = byTxId(transactions, 'tx_text_edit_restart');
        const dragTx = byTxId(transactions, 'tx_drag_shape_restart');
        const resizeTx = byTxId(transactions, 'tx_resize_shape_restart');
        const renameTx = byTxId(transactions, 'tx_rename_text_restart');

        assert.equal(textEditTx.undo_visible, true);
        assert.equal(dragTx.event_count, 3);
        assert.equal(dragTx.undo_visible_event_count, 1);
        assert.deepEqual(dragTx.kinds, ['gesture_start', 'gesture_frame', 'gesture_end']);
        assert.equal(resizeTx.event_count, 3);
        assert.equal(resizeTx.undo_visible_event_count, 1);
        assert.deepEqual(resizeTx.kinds, ['gesture_start', 'gesture_frame', 'gesture_end']);
        assert.equal(renameTx.undo_visible, true);
        assert.equal(renameTx.events[0].payload.props.label, 'Restart-safe title');

        const undo = db.selectUndoTransaction(transactions);
        assert.equal(undo.ok, true);
        assert.equal(undo.transaction.tx_id, 'tx_rename_text_restart');
        const redo = db.selectRedoTransaction(transactions, undo.next_cursor);
        assert.equal(redo.ok, true);
        assert.equal(redo.transaction.tx_id, 'tx_rename_text_restart');

        const adapter = db.getDataSourceAdapter();
        await adapter.query(
            'UPDATE state_current SET properties = ?, version = ? WHERE atome_id = ?',
            [JSON.stringify({ corrupted: true }), 999, textId]
        );
        await adapter.query(
            'UPDATE state_current SET properties = ?, version = ? WHERE atome_id = ?',
            [JSON.stringify({ corrupted: true }), 999, shapeId]
        );

        const rebuild = await db.rebuildStateCurrentFromEvents({ projectId });
        const rebuilt = await readStates(db, ids);
        const restartedEvents = await db.listEvents({ projectId, order: 'asc', limit: 100 });
        const restartedTransactions = db.buildHistoryTransactions(restartedEvents);

        assert.equal(rebuild.ok, true);
        assert.equal(rebuild.scope, 'project');
        assert.equal(rebuild.event_count, 11);
        assert.equal(rebuild.projection_count, 9);
        assert.deepEqual(rebuilt, expected);
        assert.deepEqual(
            restartedTransactions.map((transaction) => ({
                tx_id: transaction.tx_id,
                event_count: transaction.event_count,
                undo_visible: transaction.undo_visible,
                redo_persistable: transaction.redo_persistable
            })),
            transactions.map((transaction) => ({
                tx_id: transaction.tx_id,
                event_count: transaction.event_count,
                undo_visible: transaction.undo_visible,
                redo_persistable: transaction.redo_persistable
            }))
        );
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
