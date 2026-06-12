import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccessibilityBridgeProjection } from '../../atome/shared/accessibility_bridge_contract.js';
import { buildAccessibilityGraph } from '../../atome/shared/accessibility_graph.js';
import { applySemanticRenameToRecord } from '../../atome/shared/semantic_rename_contract.js';
import {
    INLINE_EDIT_MODES,
    INLINE_EDIT_OPENED_BY,
    commitInlineEditSession,
    createInlineEditSession,
    readInlineEditFocusRestoration
} from '../../eVe/domains/rendering/inline_edit_session.js';

const baseRecords = () => [
    {
        id: 'project_accessibility_behavior',
        type: 'project',
        properties: {
            order: 0,
            accessibility: {
                label: 'Accessibility behavior project',
                reading_order: 0
            }
        }
    },
    {
        id: 'shape_background',
        type: 'shape',
        parent_id: 'project_accessibility_behavior',
        properties: {
            order: 1,
            accessibility: {
                label: 'Background shape',
                reading_order: 30
            }
        }
    },
    {
        id: 'text_title',
        type: 'text',
        parent_id: 'project_accessibility_behavior',
        properties: {
            order: 2,
            label: 'Draft title',
            text: 'Visible title',
            accessibility: {
                label: 'Draft title',
                reading_order: 10,
                focus_order: 2,
                actions: [
                    { type: 'edit', label: 'Edit title' },
                    { type: 'rename', label: 'Rename title' }
                ]
            }
        }
    },
    {
        id: 'button_open_details',
        type: 'button',
        parent_id: 'project_accessibility_behavior',
        properties: {
            order: 3,
            accessibility: {
                label: 'Open details',
                reading_order: 20,
                focus_order: 1,
                actions: [
                    { type: 'activate', label: 'Open details' }
                ]
            }
        }
    }
];

const renameRecord = (records, id, label) => records.map((record) => (
    record.id === id ? applySemanticRenameToRecord(record, label) : record
));

test('accessibility graph and bridge preserve reading order, focus order, actions, rename labels, and focus restoration', () => {
    const renamedRecords = renameRecord(baseRecords(), 'text_title', 'Published title');
    const graph = buildAccessibilityGraph({
        id: 'accessibility_behavior_graph',
        records: renamedRecords
    });
    const bridge = buildAccessibilityBridgeProjection({ accessibilityGraph: graph });

    assert.deepEqual(graph.orders.reading, [
        'project_accessibility_behavior',
        'text_title',
        'button_open_details',
        'shape_background'
    ]);
    assert.deepEqual(graph.orders.focus, [
        'button_open_details',
        'text_title'
    ]);
    assert.deepEqual(bridge.orders.reading, graph.orders.reading);
    assert.deepEqual(bridge.orders.focus, graph.orders.focus);
    assert.equal(graph.byId.get('text_title').label, 'Published title');
    assert.equal(bridge.byId.get('text_title').label, 'Published title');
    assert.deepEqual(
        bridge.byId.get('text_title').actions.map((action) => action.type),
        ['edit', 'rename']
    );
    assert.deepEqual(bridge.byId.get('button_open_details').actions, [
        { type: 'activate', label: 'Open details', disabled: false }
    ]);

    const focusIndex = bridge.orders.focus.indexOf('text_title');
    const readingIndex = bridge.orders.reading.indexOf('text_title');
    const session = createInlineEditSession({
        session_id: 'inline_accessibility_behavior',
        project_id: 'project_accessibility_behavior',
        atom_id: 'text_title',
        mode: INLINE_EDIT_MODES.rename,
        opened_by: INLINE_EDIT_OPENED_BY.accessibilityAction,
        initial_value: { label: 'Draft title' },
        draft_value: { label: 'Published title' },
        focus_origin: {
            bridge_id: bridge.id,
            bridge_node_id: 'text_title',
            focus_order_index: focusIndex,
            reading_order_index: readingIndex
        },
        overlay_anchor: {
            atom_id: 'text_title',
            coordinate_space: 'project',
            x: 12,
            y: 18,
            width: 220,
            height: 44
        },
        tx_id: 'tx_accessibility_behavior_rename',
        selection_snapshot: {
            focused_atom_id: 'text_title',
            selected_atom_ids: ['text_title']
        }
    });
    const committed = commitInlineEditSession(session);
    const restoration = readInlineEditFocusRestoration(committed);

    assert.deepEqual(restoration, {
        project_id: 'project_accessibility_behavior',
        atom_id: 'text_title',
        focus_origin: {
            bridge_id: bridge.id,
            bridge_node_id: 'text_title',
            focus_order_index: focusIndex,
            reading_order_index: readingIndex
        },
        selection_snapshot: {
            focused_atom_id: 'text_title',
            selected_atom_ids: ['text_title']
        }
    });
    assert.equal(bridge.orders.focus[restoration.focus_origin.focus_order_index], 'text_title');
    assert.equal(bridge.orders.reading[restoration.focus_origin.reading_order_index], 'text_title');
    assert.equal(JSON.stringify(bridge.nodes).includes('selector'), false);
    assert.equal(JSON.stringify(restoration).includes('element'), false);
});
