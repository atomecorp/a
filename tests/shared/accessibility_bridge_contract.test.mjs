import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCESSIBILITY_BRIDGE_CONTRACT_VERSION,
    buildAccessibilityBridgeProjection
} from '../../atome/shared/accessibility_bridge_contract.js';
import { buildAccessibilityGraph } from '../../atome/shared/accessibility_graph.js';

const records = [
    { id: 'project_a', type: 'project', properties: { order: 0, accessibility: { label: 'Project' } } },
    {
        id: 'text_a',
        type: 'text',
        parent_id: 'project_a',
        properties: {
            order: 1,
            text: 'Title',
            accessibility: { reading_order: 1 }
        }
    },
    {
        id: 'button_a',
        type: 'button',
        parent_id: 'project_a',
        properties: {
            order: 2,
            accessibility: {
                label: 'Open details',
                reading_order: 2,
                focus_order: 1,
                actions: ['activate']
            }
        }
    }
];

test('builds a disposable accessibility bridge projection from raw Atome records', () => {
    const bridge = buildAccessibilityBridgeProjection({ id: 'bridge_case', records });

    assert.equal(bridge.version, ACCESSIBILITY_BRIDGE_CONTRACT_VERSION);
    assert.equal(bridge.kind, 'semantic_accessibility_bridge_projection');
    assert.equal(bridge.disposable, true);
    assert.equal(bridge.source_graph_id, 'bridge_case');
    assert.deepEqual(bridge.nodes.map((node) => node.id), ['project_a', 'text_a', 'button_a']);
    assert.equal(bridge.byId.get('text_a').label, 'Title');
    assert.equal(bridge.byId.get('button_a').label, 'Open details');
});

test('mirrors graph ids, labels, actions, and focus order from AccessibilityGraph', () => {
    const accessibilityGraph = buildAccessibilityGraph({ id: 'graph_case', records });
    const bridge = buildAccessibilityBridgeProjection({ accessibilityGraph });

    assert.equal(bridge.source_graph_id, 'graph_case');
    assert.deepEqual(bridge.orders.reading, accessibilityGraph.orders.reading);
    assert.deepEqual(bridge.orders.focus, ['button_a']);
    assert.deepEqual(bridge.nodes.map((node) => node.id), accessibilityGraph.nodes.map((node) => node.id));
    assert.deepEqual(bridge.byId.get('button_a').actions, [
        { type: 'activate', label: null, disabled: false }
    ]);
});

test('keeps bridge payload free of DOM authority fields', () => {
    const bridge = buildAccessibilityBridgeProjection({ id: 'bridge_case', records });
    const serialized = JSON.stringify(bridge.nodes);

    assert.equal(serialized.includes('selector'), false);
    assert.equal(serialized.includes('element'), false);
    assert.equal(serialized.includes('dom'), false);
    assert.equal(serialized.includes('data-atome-id'), false);
    assert.equal(serialized.includes('aria'), false);
});
