import assert from 'node:assert/strict';
import { test } from 'vitest';

import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { accordionNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_accordion.js';
import { panelLabSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { textNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

test('shared panel accordion has one native header and no hidden body when closed', () => {
    let activations = 0;
    const closed = accordionNode({
        id: 'accordion_fixture',
        label: 'Section',
        bodyChildren: [textNode('accordion_fixture_body_text', 'Body')],
        onActivate: () => { activations += 1; }
    });
    const header = findNode(closed, 'accordion_fixture_header');
    const chevron = findNode(closed, 'accordion_fixture_chevron');

    assert.equal(closed.kind, 'panel');
    assert.equal(closed.on, undefined);
    assert.deepEqual(closed.style.size, [358, 32]);
    assert.equal(header.kind, 'accordion');
    assert.deepEqual(header.style.size, [358, 32]);
    assert.deepEqual(header.style.padding, [0, 10, 0, 10]);
    assert.equal(header.style.radius, 3);
    assert.deepEqual(header.style.background, BEVY_PANEL_TOKENS.accordion.headerBackground);
    assert.deepEqual(header.style.shadow, BEVY_PANEL_TOKENS.accordion.collapsedShadow);
    assert.equal(typeof header.on.activate, 'function');
    assert.deepEqual(chevron.style.size, [12, 12]);
    assert.equal(chevron.style.rotation, 0);
    assert.equal(findNode(closed, 'accordion_fixture_body'), null);
    const closedRecords = projectBevyUiTreeRecords({ tree: { root: closed }, treeId: 'accordion_closed', workspaceLayer: 'panel' });
    assert.deepEqual(
        closedRecords.find((record) => record.id === '__eve_bevy_ui_accordion_closed_accordion_fixture_header')?.properties?.material?.shadow,
        { color: [0, 0, 0, 0.18], blur: 3, spread: 0, offsetX: 0, offsetY: 1 }
    );
    header.on.activate();
    assert.equal(activations, 1);
});

test('shared panel accordion opens a continuous 56 px body and keeps instances independent', () => {
    const open = accordionNode({
        id: 'accordion_open',
        label: 'Section',
        expanded: true,
        bodyChildren: [textNode('accordion_open_body_text', 'Section content')]
    });
    const other = accordionNode({ id: 'accordion_other', label: 'Other' });
    const header = findNode(open, 'accordion_open_header');
    const body = findNode(open, 'accordion_open_body');

    assert.deepEqual(open.style.size, [358, 88]);
    assert.deepEqual(open.style.shadow, BEVY_PANEL_TOKENS.accordion.expandedShadow);
    assert.deepEqual(header.style.radius_corners, [3, 3, 0, 0]);
    assert.equal(header.style.radius, undefined);
    assert.equal(header.style.shadow, undefined);
    assert.deepEqual(findNode(open, 'accordion_open_chevron').style.rotation, 90);
    assert.deepEqual(body.style.position, [0, 32]);
    assert.deepEqual(body.style.size, [358, 56]);
    assert.deepEqual(body.style.radius_corners, [0, 0, 3, 3]);
    assert.deepEqual(body.style.background, BEVY_PANEL_TOKENS.colors.control);
    assert.equal(findNode(open, 'accordion_open_body_text').text, 'Section content');
    assert.equal(findNode(other, 'accordion_other_body'), null);
    const openRecords = projectBevyUiTreeRecords({ tree: { root: open }, treeId: 'accordion_open', workspaceLayer: 'panel' });
    assert.deepEqual(
        openRecords.find((record) => record.id === '__eve_bevy_ui_accordion_open_accordion_open')?.properties?.material?.shadow,
        { color: [0, 0, 0, 0.22], blur: 5, spread: 1, offsetX: 0, offsetY: 2 }
    );
});

test('Panel Lab appends the accordion, toggles it through an intent, and resets it on close', () => {
    panelLabSurface.onOpen();
    try {
        const emit = () => {};
        const closed = panelLabSurface.buildContent(panelLabSurface.readState(), { emit });
        const dividerIndex = closed.findIndex((node) => node.id === 'panel_lab_accordion_divider');
        const accordionIndex = closed.findIndex((node) => node.id === 'panel_lab_accordion');

        assert.equal(closed.length, 41);
        assert.equal(dividerIndex, 15);
        assert.equal(accordionIndex, dividerIndex + 1);
        assert.equal(panelLabSurface.readState().accordion.expanded, false);
        assert.equal(findNode(closed, 'panel_lab_accordion_body'), null);
        assert.equal(EVE_DEFAULT_MESSAGES.fr['eve.panel_lab.accordion.body'], 'Contenu de la section');
        assert.equal(EVE_DEFAULT_MESSAGES.en['eve.panel_lab.accordion.title'], 'Section');

        const toggled = panelLabSurface.handleEvent({ type: 'panel_lab.accordion.toggle' });
        assert.deepEqual(toggled, {
            ok: true,
            expanded: true,
            revealNodeId: 'panel_lab_accordion',
            revealMarginPx: 10
        });
        const open = panelLabSurface.buildContent(panelLabSurface.readState(), { emit });
        assert.equal(findNode(open, 'panel_lab_accordion_body_text').text, 'Contenu de la section');
        assert.equal(panelLabSurface.handleEvent({ type: 'panel_lab.accordion.toggle' }).expanded, false);
    } finally {
        panelLabSurface.onClose();
    }
    assert.equal(panelLabSurface.readState().accordion.expanded, false);
});

test('native accordion headers use the canonical pointer activation route', () => {
    const emitted = [];
    const canvas = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    const target = { treeId: 'accordion_tree', nodeId: 'accordion_header', kind: 'accordion', box: {}, scrollAncestors: [] };
    const runtime = createBevyUiPointerRuntime({
        state: { lastSurfacePoints: new Map(), pointerTarget: null, focusTarget: null, hoverTarget: null, pendingTextActivation: null },
        hitTestTrees: () => target,
        localEventForTarget: (_, type) => ({ type }),
        emitUiEvents: (events) => emitted.push(...events),
        scrollRuntime: { begin: () => {}, drag: () => false, end: () => false, hover: () => {}, wheel: () => false }
    });

    runtime.routePointerEvent({ canvas, phase: 'pointerdown', point: { x: 12, y: 12 }, event: { pointerId: 8 } });
    runtime.routePointerEvent({ canvas, phase: 'pointerup', point: { x: 12, y: 12 }, event: { pointerId: 8 } });
    assert.deepEqual(emitted.map((event) => event.type), ['press', 'focus', 'release', 'activate']);
});

// Regression guard for the per-corner radii defect: the builder tree carried
// `radius_corners` while the active WebGPU overlay projection read only the
// scalar `style.radius`, so an open accordion painted fully square. Asserting
// the tree kept passing throughout — only the projected record catches it.
test('open accordion projects its partial corner radii to the GPU record', () => {
    const open = accordionNode({
        id: 'accordion_corner_fixture',
        label: 'Section',
        expanded: true,
        bodyChildren: [textNode('accordion_corner_fixture_text', 'Contenu', {})]
    });
    const records = projectBevyUiTreeRecords({
        tree: { root: open }, treeId: 'accordion_corners', workspaceLayer: 'panel'
    });
    const recordFor = (suffix) => records.find((record) => record.id.endsWith(suffix))?.properties;

    const header = recordFor('accordion_corner_fixture_header');
    assert.equal(header?.shape, 'rounded_rect');
    assert.deepEqual(header?.corner_radii, [BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx, 0, 0]);

    const body = recordFor('accordion_corner_fixture_body');
    assert.equal(body?.shape, 'rounded_rect');
    assert.deepEqual(body?.corner_radii, [0, 0, BEVY_PANEL_TOKENS.radiusPx, BEVY_PANEL_TOKENS.radiusPx]);
});
