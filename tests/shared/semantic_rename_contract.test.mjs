import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applySemanticRenameToRecord,
    buildSemanticRenameEvent,
    buildSemanticRenamePatch,
    normalizeSemanticRenameValue,
    resolveSemanticLabel
} from '../../atome/shared/semantic_rename_contract.js';
import {
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions
} from '../../database/adole.js';
import { buildAccessibilityGraph } from '../../atome/shared/accessibility_graph.js';

test('semantic rename normalizes labels and preserves accessibility metadata', () => {
    const record = {
        id: 'text_rename',
        type: 'text',
        properties: {
            accessibility: {
                role: 'text',
                focus_order: 2
            }
        }
    };
    const patch = buildSemanticRenamePatch(record, '  New   semantic   label  ');

    assert.equal(normalizeSemanticRenameValue('\nLabel\tvalue\n'), 'Label value');
    assert.equal(patch.label, 'New semantic label');
    assert.deepEqual(patch.accessibility, {
        role: 'text',
        focus_order: 2,
        label: 'New semantic label'
    });
    assert.throws(
        () => normalizeSemanticRenameValue('   '),
        (error) => error.details?.code === 'semantic_rename_label_required'
    );
});

test('semantic label fallback is deterministic', () => {
    assert.equal(resolveSemanticLabel({
        id: 'fallback_id',
        meta: { name: 'Meta name' },
        properties: {
            label: 'Primary label',
            accessibility: { label: 'Accessible label' },
            name: 'Property name',
            title: 'Property title',
            text: 'Visible text'
        }
    }), 'Primary label');
    assert.equal(resolveSemanticLabel({
        id: 'fallback_id',
        meta: { name: 'Meta name' },
        properties: {
            accessibility: { label: 'Accessible label' },
            name: 'Property name',
            title: 'Property title',
            text: 'Visible text'
        }
    }), 'Accessible label');
    assert.equal(resolveSemanticLabel({
        id: 'fallback_id',
        meta: { name: 'Meta name' },
        properties: {
            name: 'Property name',
            title: 'Property title',
            text: 'Visible text'
        }
    }), 'Meta name');
    assert.equal(resolveSemanticLabel({
        id: 'fallback_id',
        properties: {
            title: 'Property title',
            text: 'Visible text'
        }
    }), 'Property title');
    assert.equal(resolveSemanticLabel({
        id: 'fallback_id',
        properties: {}
    }), 'fallback_id');
});

test('semantic rename events require tx_id and group as undo-visible history transactions', () => {
    const record = {
        id: 'text_history',
        type: 'text',
        properties: {
            text: 'Old title'
        }
    };
    const event = buildSemanticRenameEvent(record, 'Project title', {
        tx_id: 'tx_rename_text_history',
        gesture_id: 'rename_keyboard'
    });

    assert.deepEqual(event, {
        kind: 'set',
        atome_id: 'text_history',
        props: {
            label: 'Project title',
            accessibility: { label: 'Project title' }
        },
        tx_id: 'tx_rename_text_history',
        gesture_id: 'rename_keyboard'
    });
    assert.throws(
        () => buildSemanticRenameEvent(record, 'Project title'),
        (error) => error.details?.code === 'semantic_rename_tx_id_required'
    );

    const transactions = buildHistoryTransactions([
        {
            id: 'evt_rename_1',
            ts: '2026-06-12T10:00:00.000Z',
            ...event
        }
    ]);

    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].tx_id, 'tx_rename_text_history');
    assert.equal(transactions[0].visibility, HISTORY_TRANSACTION_VISIBILITY.UNDO_VISIBLE);
    assert.equal(transactions[0].undo_visible, true);
    assert.equal(transactions[0].redo_persistable, true);
    assert.deepEqual(transactions[0].atome_ids, ['text_history']);
});

test('semantic rename updates accessible names without reading DOM state', () => {
    const renamed = applySemanticRenameToRecord({
        id: 'text_accessible',
        type: 'text',
        properties: {
            order: 1,
            text: 'Visible text',
            accessibility: {
                label: 'Old accessible label',
                actions: ['rename']
            }
        }
    }, 'Renamed title');
    const graph = buildAccessibilityGraph({
        records: [
            {
                id: 'project_accessible',
                type: 'project',
                properties: { order: 0, label: 'Project' }
            },
            {
                ...renamed,
                parent_id: 'project_accessible'
            }
        ]
    });

    assert.equal(renamed.properties.label, 'Renamed title');
    assert.equal(renamed.properties.accessibility.label, 'Renamed title');
    assert.equal(graph.byId.get('text_accessible').label, 'Renamed title');
    assert.deepEqual(graph.byId.get('text_accessible').actions.map((action) => action.type), ['rename']);
});
