import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ATOM_GRAPH_VERSION,
    buildAtomGraph,
    normalizeAtomGraphRecord
} from '../../atome/shared/atom_graph.js';

test('normalizes AtomGraph records without exposing internal merge state', () => {
    const node = normalizeAtomGraphRecord({
        id: 'text_a',
        type: 'text',
        parent_id: 'project_a',
        properties: {
            id: 'ignored_id',
            type: 'ignored_type',
            parent_id: 'ignored_parent',
            text: 'Hello'
        }
    });

    assert.equal(node.id, 'text_a');
    assert.equal(node.type, 'text');
    assert.equal(node.parent_id, 'project_a');
    assert.deepEqual(node.properties, { text: 'Hello' });
    assert.equal(Object.hasOwn(node, '_merge'), false);
});

test('builds deterministic roots, parent-child links, and visual order from state rows', () => {
    const graph = buildAtomGraph({
        id: 'project_graph',
        records: [
            { id: 'project_a', type: 'project', properties: { order: 0 } },
            { id: 'shape_b', type: 'shape', parent_id: 'project_a', properties: { order: 2, z_index: 1 } },
            { id: 'shape_a', type: 'shape', parent_id: 'project_a', properties: { order: 1, z_index: 1 } },
            { id: 'loose_text', type: 'text', properties: { order: 3 } }
        ]
    });

    assert.equal(graph.id, 'project_graph');
    assert.equal(graph.version, ATOM_GRAPH_VERSION);
    assert.deepEqual(graph.roots, ['project_a', 'loose_text']);
    assert.deepEqual(graph.byId.get('project_a').children, ['shape_a', 'shape_b']);
    assert.deepEqual(graph.links, [
        { parent_id: 'project_a', child_id: 'shape_a' },
        { parent_id: 'project_a', child_id: 'shape_b' }
    ]);
    assert.deepEqual(graph.nodes.map((node) => node.id), ['project_a', 'shape_a', 'shape_b', 'loose_text']);
    assert.deepEqual(graph.nodes.map((node) => node.visual_order), [0, 1, 2, 3]);
    assert.deepEqual(graph.diagnostics, {
        omitted_deleted_ids: [],
        orphan_links: [],
        cycle_links: [],
        duplicate_ids: []
    });
});

test('folds event rows, preserves existing metadata on partial patches, and filters deleted nodes', () => {
    const events = [
        {
            atome_id: 'project_a',
            kind: 'set',
            ts: '2026-06-12T10:00:00.000Z',
            payload: { props: { type: 'project', order: 0 } }
        },
        {
            atome_id: 'text_a',
            kind: 'set',
            ts: '2026-06-12T10:00:01.000Z',
            payload: { props: { type: 'text', parent_id: 'project_a', order: 1, text: 'Draft' } }
        },
        {
            atome_id: 'text_a',
            kind: 'set',
            ts: '2026-06-12T10:00:02.000Z',
            payload: { props: { text: 'Final', color: '#ffffff' } }
        },
        {
            atome_id: 'image_a',
            kind: 'set',
            ts: '2026-06-12T10:00:03.000Z',
            payload: { props: { type: 'image', parent_id: 'project_a', order: 2, media_source: '/uploads/a.png' } }
        },
        {
            atome_id: 'image_a',
            kind: 'delete',
            ts: '2026-06-12T10:00:04.000Z'
        }
    ];

    const graph = buildAtomGraph({ events });
    const textNode = graph.byId.get('text_a');

    assert.equal(textNode.type, 'text');
    assert.equal(textNode.parent_id, 'project_a');
    assert.equal(textNode.sort.order, 1);
    assert.deepEqual(textNode.properties, {
        order: 1,
        text: 'Final',
        color: '#ffffff'
    });
    assert.deepEqual(graph.byId.get('project_a').children, ['text_a']);
    assert.deepEqual(graph.diagnostics.omitted_deleted_ids, ['image_a']);
    assert.equal(graph.byId.has('image_a'), false);

    const graphWithDeleted = buildAtomGraph({ events }, { includeDeleted: true });
    const imageNode = graphWithDeleted.byId.get('image_a');

    assert.deepEqual(graphWithDeleted.byId.get('project_a').children, ['text_a', 'image_a']);
    assert.equal(imageNode.type, 'image');
    assert.equal(imageNode.parent_id, 'project_a');
    assert.equal(imageNode.deleted, true);
    assert.equal(imageNode.deleted_at, '2026-06-12T10:00:04.000Z');
    assert.equal(imageNode.properties.media_source, '/uploads/a.png');
});

test('promotes missing-parent nodes to roots with orphan diagnostics', () => {
    const graph = buildAtomGraph({
        records: [
            { id: 'shape_a', type: 'shape', parent_id: 'missing_parent', properties: { order: 1 } }
        ]
    });

    assert.deepEqual(graph.roots, ['shape_a']);
    assert.deepEqual(graph.links, []);
    assert.deepEqual(graph.diagnostics.orphan_links, [
        { child_id: 'shape_a', parent_id: 'missing_parent' }
    ]);
    assert.deepEqual(graph.diagnostics.duplicate_ids, []);
});

test('flags cycle links and keeps cyclic nodes reachable as roots', () => {
    const graph = buildAtomGraph({
        records: [
            { id: 'cycle_a', type: 'group', parent_id: 'cycle_b', properties: { order: 1 } },
            { id: 'cycle_b', type: 'group', parent_id: 'cycle_a', properties: { order: 2 } }
        ]
    });

    assert.deepEqual(graph.roots, ['cycle_a', 'cycle_b']);
    assert.deepEqual(graph.links, []);
    assert.deepEqual(graph.nodes.map((node) => node.id), ['cycle_a', 'cycle_b']);
    assert.deepEqual(graph.diagnostics.cycle_links, [
        { child_id: 'cycle_a', parent_id: 'cycle_b' },
        { child_id: 'cycle_b', parent_id: 'cycle_a' }
    ]);
});

test('diagnoses duplicate state row ids while preserving one deterministic projection', () => {
    const graph = buildAtomGraph({
        records: [
            { id: 'project_a', type: 'project', properties: { order: 0 } },
            { id: 'shape_a', type: 'shape', parent_id: 'project_a', properties: { order: 2, fill: 'red' } },
            { id: 'shape_a', properties: { order: 1, fill: 'blue', width: 120 } },
            { id: 'shape_b', type: 'shape', parent_id: 'project_a', properties: { order: 3 } }
        ]
    });

    assert.deepEqual(graph.diagnostics.duplicate_ids, ['shape_a']);
    assert.deepEqual(graph.nodes.map((node) => node.id), ['project_a', 'shape_a', 'shape_b']);
    assert.deepEqual(graph.byId.get('project_a').children, ['shape_a', 'shape_b']);
    assert.equal(graph.byId.get('shape_a').type, 'shape');
    assert.equal(graph.byId.get('shape_a').parent_id, 'project_a');
    assert.deepEqual(graph.byId.get('shape_a').properties, {
        order: 1,
        fill: 'blue',
        width: 120
    });
});

test('keeps child order stable by z index, order, and source order', () => {
    const graph = buildAtomGraph({
        records: [
            { id: 'project_a', type: 'project', properties: { order: 0 } },
            { id: 'late_z', type: 'shape', parent_id: 'project_a', properties: { z_index: 2, order: 1 } },
            { id: 'same_a', type: 'shape', parent_id: 'project_a', properties: { z_index: 1, order: 1 } },
            { id: 'low_z', type: 'shape', parent_id: 'project_a', properties: { z_index: 0, order: 99 } },
            { id: 'same_b', type: 'shape', parent_id: 'project_a', properties: { z_index: 1, order: 1 } },
            { id: 'late_order', type: 'shape', parent_id: 'project_a', properties: { z_index: 1, order: 5 } }
        ]
    });

    assert.deepEqual(graph.byId.get('project_a').children, [
        'low_z',
        'same_a',
        'same_b',
        'late_order',
        'late_z'
    ]);
    assert.deepEqual(graph.nodes.map((node) => node.id), [
        'project_a',
        'low_z',
        'same_a',
        'same_b',
        'late_order',
        'late_z'
    ]);
});

test('keeps visual, semantic reading, and focus orders separate', () => {
    const graph = buildAtomGraph({
        records: [
            { id: 'project_a', type: 'project', properties: { order: 0 } },
            {
                id: 'visual_front',
                type: 'shape',
                parent_id: 'project_a',
                properties: { z_index: 0, order: 1, semantic_order: 3, focus_order: 2 }
            },
            {
                id: 'visual_middle',
                type: 'text',
                parent_id: 'project_a',
                properties: { z_index: 1, order: 2, accessibility: { reading_order: 2, focus_order: 1 } }
            },
            {
                id: 'visual_back',
                type: 'image',
                parent_id: 'project_a',
                properties: { z_index: 2, order: 3, semantic_order: 1, focus_order: 3 }
            }
        ]
    });

    assert.deepEqual(graph.orders.visual, ['project_a', 'visual_front', 'visual_middle', 'visual_back']);
    assert.deepEqual(graph.orders.semantic, ['project_a', 'visual_back', 'visual_middle', 'visual_front']);
    assert.deepEqual(graph.orders.focus, ['project_a', 'visual_middle', 'visual_front', 'visual_back']);
    assert.deepEqual(graph.byId.get('project_a').children, ['visual_front', 'visual_middle', 'visual_back']);
    assert.equal(graph.byId.get('visual_front').visual_order, 1);
    assert.equal(graph.byId.get('visual_front').semantic_order, 3);
    assert.equal(graph.byId.get('visual_front').focus_order, 2);
});

test('keeps children reachable when a deleted parent is filtered out', () => {
    const records = [
        { id: 'project_a', type: 'project', properties: { order: 0 } },
        { id: 'deleted_group', type: 'group', parent_id: 'project_a', deleted: true, properties: { order: 1 } },
        { id: 'child_a', type: 'text', parent_id: 'deleted_group', properties: { order: 2 } },
        { id: 'sibling_a', type: 'shape', parent_id: 'project_a', properties: { order: 3 } }
    ];

    const graph = buildAtomGraph({ records });

    assert.deepEqual(graph.roots, ['project_a', 'child_a']);
    assert.deepEqual(graph.byId.get('project_a').children, ['sibling_a']);
    assert.deepEqual(graph.diagnostics.omitted_deleted_ids, ['deleted_group']);
    assert.deepEqual(graph.diagnostics.orphan_links, [
        { child_id: 'child_a', parent_id: 'deleted_group' }
    ]);

    const graphWithDeleted = buildAtomGraph({ records }, { includeDeleted: true });

    assert.deepEqual(graphWithDeleted.roots, ['project_a']);
    assert.deepEqual(graphWithDeleted.byId.get('project_a').children, ['deleted_group', 'sibling_a']);
    assert.deepEqual(graphWithDeleted.byId.get('deleted_group').children, ['child_a']);
    assert.deepEqual(graphWithDeleted.diagnostics.omitted_deleted_ids, []);
});
