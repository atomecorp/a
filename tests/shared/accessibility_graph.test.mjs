import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCESSIBILITY_GRAPH_VERSION,
    buildAccessibilityGraph
} from '../../atome/shared/accessibility_graph.js';
import { buildAtomGraph } from '../../atome/shared/atom_graph.js';

const records = [
    {
        id: 'project_a',
        type: 'project',
        properties: {
            order: 0,
            accessibility: { label: 'Demo project' }
        }
    },
    {
        id: 'group_a',
        type: 'group',
        parent_id: 'project_a',
        properties: {
            order: 1,
            accessibility: { label: 'Media group', reading_order: 6 }
        }
    },
    {
        id: 'text_a',
        type: 'text',
        parent_id: 'group_a',
        properties: {
            order: 2,
            text: 'Scene title',
            accessibility: { reading_order: 1 }
        }
    },
    {
        id: 'shape_a',
        type: 'shape',
        parent_id: 'group_a',
        properties: {
            order: 3,
            accessibility: { label: 'Background block', reading_order: 2 }
        }
    },
    {
        id: 'image_a',
        type: 'image',
        parent_id: 'group_a',
        properties: {
            order: 4,
            alt_text: 'Portrait photograph',
            accessibility: { label: 'Portrait', reading_order: 3 }
        }
    },
    {
        id: 'video_a',
        type: 'video',
        parent_id: 'group_a',
        properties: {
            order: 5,
            accessibility: {
                label: 'Intro video',
                description: 'Short opening clip',
                reading_order: 4,
                actions: ['play', 'pause']
            }
        }
    },
    {
        id: 'audio_a',
        type: 'audio',
        parent_id: 'group_a',
        properties: {
            order: 6,
            accessibility: {
                label: 'Narration',
                reading_order: 5,
                focus_order: 1,
                actions: ['play', 'pause']
            }
        }
    }
];

test('builds AccessibilityGraph nodes for text, shape, image, video, audio, and group Atomes', () => {
    const graph = buildAccessibilityGraph({ id: 'scene_a', records });

    assert.equal(graph.version, ACCESSIBILITY_GRAPH_VERSION);
    assert.equal(graph.atom_graph_id, 'scene_a');
    assert.deepEqual(graph.roots, ['project_a']);
    assert.deepEqual(graph.byId.get('project_a').children, ['group_a']);
    assert.deepEqual(graph.byId.get('group_a').children, [
        'text_a',
        'shape_a',
        'image_a',
        'video_a',
        'audio_a'
    ]);
    assert.equal(graph.byId.get('text_a').role, 'text');
    assert.equal(graph.byId.get('text_a').label, 'Scene title');
    assert.equal(graph.byId.get('shape_a').role, 'shape');
    assert.equal(graph.byId.get('image_a').role, 'image');
    assert.equal(graph.byId.get('image_a').alt_text, 'Portrait photograph');
    assert.equal(graph.byId.get('video_a').role, 'video');
    assert.deepEqual(graph.byId.get('video_a').actions.map((action) => action.type), ['play', 'pause']);
    assert.equal(graph.byId.get('audio_a').role, 'audio');
    assert.deepEqual(graph.byId.get('audio_a').actions.map((action) => action.type), ['play', 'pause']);
    assert.equal(graph.byId.get('group_a').role, 'group');
    assert.deepEqual(graph.diagnostics.invalid_nodes, []);
});

test('derives reading and focus order from AtomGraph without reading DOM state', () => {
    const graph = buildAccessibilityGraph({ id: 'scene_a', records });

    assert.deepEqual(graph.orders.reading, [
        'project_a',
        'text_a',
        'shape_a',
        'image_a',
        'video_a',
        'audio_a',
        'group_a'
    ]);
    assert.deepEqual(graph.orders.focus, ['audio_a', 'video_a']);
    assert.deepEqual(graph.nodes.map((node) => node.id), graph.orders.reading);
});

test('derives structural accessibility relations from AtomGraph hierarchy', () => {
    const graph = buildAccessibilityGraph({ id: 'scene_a', records });
    const group = graph.byId.get('group_a');
    const text = graph.byId.get('text_a');

    assert.ok(group.relations.some((relation) => (
        relation.type === 'contains' && relation.target_id === 'text_a'
    )));
    assert.ok(text.relations.some((relation) => (
        relation.type === 'child_of' && relation.target_id === 'group_a'
    )));
    assert.deepEqual(graph.links[0], { parent_id: 'project_a', child_id: 'group_a' });
});

test('filters inaccessible nodes and promotes reachable children', () => {
    const graph = buildAccessibilityGraph({
        records: [
            { id: 'project_a', type: 'project', properties: { order: 0 } },
            {
                id: 'hidden_group',
                type: 'group',
                parent_id: 'project_a',
                properties: { order: 1, accessibility: { hidden: true } }
            },
            {
                id: 'visible_text',
                type: 'text',
                parent_id: 'hidden_group',
                properties: { order: 2, text: 'Reachable text' }
            }
        ]
    });

    assert.deepEqual(graph.roots, ['project_a', 'visible_text']);
    assert.equal(graph.byId.has('hidden_group'), false);
    assert.deepEqual(graph.diagnostics.omitted_inaccessible_ids, ['hidden_group']);
    assert.equal(graph.byId.get('visible_text').label, 'Reachable text');
});

test('can derive from a prebuilt AtomGraph object', () => {
    const atomGraph = buildAtomGraph({ id: 'prebuilt_scene', records });
    const graph = buildAccessibilityGraph({ atomGraph });

    assert.equal(graph.atom_graph_id, 'prebuilt_scene');
    assert.equal(graph.byId.get('group_a').role, 'group');
});
