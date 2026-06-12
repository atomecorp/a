import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCESSIBLE_ATOM_NODE_VERSION,
    assertAccessibleAtomNode,
    sanitizeAccessibleAtomNode
} from '../../atome/shared/accessible_atom_node.js';

test('sanitizes a valid AccessibleAtomNode from Atome accessibility properties', () => {
    const result = sanitizeAccessibleAtomNode({
        id: 'image_a',
        type: 'image',
        properties: {
            accessibility: {
                role: 'image',
                label: 'Album cover',
                description: 'Front artwork',
                alt_text: 'Blue square with white title',
                focusable: true,
                actions: [{ type: 'activate', label: 'Open image' }, 'focus'],
                relations: [{ type: 'described_by', target_id: 'caption_a' }]
            }
        }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.node, {
        id: 'image_a',
        version: ACCESSIBLE_ATOM_NODE_VERSION,
        role: 'image',
        label: 'Album cover',
        description: 'Front artwork',
        alt_text: 'Blue square with white title',
        focusable: true,
        visible_to_accessibility: true,
        actions: [
            { type: 'activate', label: 'Open image', disabled: false },
            { type: 'focus', label: null, disabled: false }
        ],
        relations: [{ type: 'described_by', target_id: 'caption_a' }]
    });
});

test('derives labels and default focusability without reading the DOM', () => {
    const node = assertAccessibleAtomNode({
        id: 'text_a',
        type: 'text',
        meta: { description: 'Scene title node' },
        properties: { text: 'Scene title' }
    });

    assert.equal(node.role, 'text');
    assert.equal(node.label, 'Scene title');
    assert.equal(node.description, 'Scene title node');
    assert.equal(node.focusable, false);
    assert.deepEqual(node.actions, []);
});

test('deduplicates actions and relations while preserving explicit disabled state', () => {
    const node = assertAccessibleAtomNode({
        id: 'button_a',
        type: 'button',
        properties: {
            accessibility: {
                actions: [
                    { type: 'activate', disabled: true },
                    { type: 'activate', disabled: false },
                    { type: 'focus' }
                ],
                relations: [
                    { type: 'controls', target_id: 'panel_a' },
                    { type: 'controls', target_id: 'panel_a' }
                ]
            }
        }
    });

    assert.equal(node.focusable, true);
    assert.deepEqual(node.actions, [
        { type: 'activate', label: null, disabled: true },
        { type: 'focus', label: null, disabled: false }
    ]);
    assert.deepEqual(node.relations, [{ type: 'controls', target_id: 'panel_a' }]);
});

test('reports invalid AccessibleAtomNode fields and strict assertion throws', () => {
    const result = sanitizeAccessibleAtomNode({
        type: 'unsupported_role',
        properties: {
            accessibility: {
                actions: ['teleport'],
                relations: [{ type: 'controls' }]
            }
        }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
        'missing_id',
        'unsupported_role',
        'invalid_action',
        'invalid_relation'
    ]);
    assert.throws(
        () => assertAccessibleAtomNode({ type: 'unsupported_role' }),
        /Invalid AccessibleAtomNode/
    );
});
