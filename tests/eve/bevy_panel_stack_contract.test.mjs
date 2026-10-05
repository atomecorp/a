import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildBevyPanelTree, node, textNode, panelBodyLayer } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { projectPanelStack } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { bevyPanelRuntimeState, registerBevyPanelSurface, openBevyPanelSurface, closeBevyPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

const fixture = (key, openingOrder, { x = 0, overlay = false, levels = 4 } = {}) => {
    let content = textNode(`${key}_text`, key, { size: [140, 30] });
    for (let i = 0; i < levels; i++) content = node(`${key}_level_${i}`, 'panel', {
        size: [160, 60], background: [0.1, 0.2, 0.3, 1]
    }, [content]);
    const tree = buildBevyPanelTree({ id: `eve_bevy_panel_${key}`, title: key,
        geometry: { x, y: 0, width: 200, height: 300 }, surfaceSize: { width: 800, height: 600 },
        bodyChildren: [content, node(`${key}_media`, 'image', { size: [80, 80] }, [], {
            image: { source: 'fixture.png' }, overlayRecord: { id: 'source', type: 'image',
                properties: { source: 'fixture.png', renderLayer: 999999, layer: 'project' } }
        })], fixedChildren: [node(`${key}_command_surface`, 'button', { size: [140, 30], background: [0.2, 0.2, 0.2, 1] },
            [textNode(`${key}_command`, 'Export', { size: [140, 30] })])],
        overlayChildren: overlay ? [node(`${key}_popup`, 'panel', { size: [80, 60], z_index: 1000000,
            background: [0, 0, 0, 1] }, [textNode(`${key}_popup_label`, 'Popup', { size: [70, 30] })])] : [],
        onClose: () => {}, onDrag: () => {}, onResize: () => {} });
    return { openingOrder, relativeTree: tree, tree, surface: null };
};
const records = entry => projectBevyUiTreeRecords({ tree: entry.tree, treeId: entry.tree.id, workspaceLayer: 'panel' });
const extent = entry => {
    const layers = records(entry).map(record => record.properties.renderLayer);
    return { min: Math.min(...layers), max: Math.max(...layers) };
};
const separated = mounted => {
    let highest = 0;
    [...mounted.values()].sort((a, b) => a.openingOrder - b.openingOrder).forEach(entry => {
        const span = extent(entry);
        assert.ok(span.min > highest, `${span.min} must exceed previous ${highest}`);
        assert.ok(span.max < 5000);
        highest = span.max;
    });
};
const noRender = { mountTree: async ({ tree }) => tree, updateTree: async ({ tree }) => tree };

test('all paints including sparse popup layers, media and footer belong to disjoint panel bands', async () => {
    const mounted = new Map([['contact', fixture('contact', 1, { overlay: true })], ['info', fixture('info', 2)]]);
    await projectPanelStack({ mounted, runtime: noRender, changedKey: 'info' });
    separated(mounted);
    const shell = records(mounted.get('info')).find(record => record.id.endsWith('_panel'));
    assert.equal(shell.properties.opacity, 1);
    assert.match(shell.properties.color, /,1\)$/);
    const media = records(mounted.get('info')).find(record => record.properties.source === 'fixture.png');
    assert.ok(media.properties.renderLayer >= extent(mounted.get('info')).min);
    assert.ok(media.properties.renderLayer <= extent(mounted.get('info')).max);
    const fixedBand = records(mounted.get('info')).find(record => record.id.endsWith('_fixed_actions'));
    const command = records(mounted.get('info')).find(record => record.properties.text === 'Export');
    const commandSurface = records(mounted.get('info')).find(record => record.id.endsWith('_command_surface'));
    assert.ok(commandSurface.properties.renderLayer > fixedBand.properties.renderLayer);
    assert.ok(command.properties.renderLayer > commandSurface.properties.renderLayer);
});

test('refresh keeps order, reopen raises the whole panel, and close compacts the surviving bands', async () => {
    const mounted = new Map(['a', 'b', 'c'].map((key, i) => [key, fixture(key, i + 1)]));
    const writes = [];
    const runtime = { updateTree: async ({ tree }) => { writes.push(tree.id); return tree; } };
    await projectPanelStack({ mounted, runtime });
    const original = [...mounted.values()].map(entry => entry.tree.root.style.z_index);
    writes.length = 0;
    await projectPanelStack({ mounted, runtime, changedKey: 'a' });
    assert.deepEqual([...mounted.values()].map(entry => entry.tree.root.style.z_index), original);
    assert.deepEqual(writes, ['eve_bevy_panel_a']);
    mounted.get('a').openingOrder = 4;
    await projectPanelStack({ mounted, runtime, changedKey: 'a' });
    separated(mounted);
    assert.ok(extent(mounted.get('a')).min > extent(mounted.get('c')).max);
    mounted.delete('a');
    await projectPanelStack({ mounted, runtime });
    separated(mounted);
    assert.equal(mounted.get('b').tree.root.style.z_index, 1250);
});

test('22 simultaneous surfaces and 200 reopen cycles never grow compositor depth', async () => {
    const mounted = new Map(Array.from({ length: 22 }, (_, i) => [`p${i}`, fixture(`p${i}`, i + 1, { overlay: true })]));
    for (let cycle = 0; cycle < 200; cycle++) {
        mounted.get(`p${cycle % 22}`).openingOrder = 23 + cycle;
        await projectPanelStack({ mounted, runtime: noRender });
        separated(mounted);
    }
});

test('the shared Bevy hit-test follows paint order and blocks covered controls after reopening', async () => {
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.querySelector('canvas');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const runtime = createEveBevyUiRuntime({ overlayProjector: async () => [], requestFrame: () => 0,
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba: new Uint8ClampedArray([255, 255, 255, 255]) }) });
    const mounted = new Map([['a', fixture('a', 1)], ['b', fixture('b', 2, { x: 60 })], ['c', fixture('c', 3, { x: 120 })]]);
    for (const entry of mounted.values()) entry.surface = surface;
    try {
        await projectPanelStack({ mounted, runtime });
        assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 180, clientY: 180 }).treeId, 'eve_bevy_panel_c');
        assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 30, clientY: 180 }).treeId, 'eve_bevy_panel_a');
        mounted.get('a').openingOrder = 4;
        await projectPanelStack({ mounted, runtime, changedKey: 'a' });
        assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 180, clientY: 180 }).treeId, 'eve_bevy_panel_a');
        await runtime.unmountTree('eve_bevy_panel_a');
        mounted.delete('a');
        await projectPanelStack({ mounted, runtime });
        assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 180, clientY: 180 }).treeId, 'eve_bevy_panel_c');
    } finally {
        for (const entry of mounted.values()) await runtime.unmountTree(entry.tree.id);
        dom.window.close();
    }
});

test('opening requests retain their order even when onOpen completes out of order', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousRuntime = bevyPanelRuntimeState.runtime;
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    dom.window.__eveWorkspaceMode = { mode: 'project' };
    dom.window.requestAnimationFrame = cb => dom.window.setTimeout(cb, 0);
    dom.window.cancelAnimationFrame = id => dom.window.clearTimeout(id);
    const surface = dom.window.document.querySelector('canvas');
    surface.getBoundingClientRect = () => ({ width: 800, height: 600 });
    bevyPanelRuntimeState.runtime = { ...noRender, unmountTree: async () => {} };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 60 }, dom.window);
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    registerBevyPanelSurface({ surfaceKey: 'slow_stack_fixture', title: 'Slow', onOpen: () => ready, buildContent: () => [] });
    let disposeSuperseded = 0;
    registerBevyPanelSurface({ surfaceKey: 'superseded_stack_fixture', title: 'Superseded',
        onOpen: async ({ context }) => { await context.wait; return () => { disposeSuperseded++; }; }, buildContent: () => [] });
    registerBevyPanelSurface({ surfaceKey: 'fast_stack_fixture', title: 'Fast', buildContent: () => [] });
    try {
        const slow = openBevyPanelSurface('slow_stack_fixture');
        await openBevyPanelSurface('fast_stack_fixture');
        release(); await slow;
        assert.ok(extent(bevyPanelRuntimeState.mounted.get('fast_stack_fixture')).min > extent(bevyPanelRuntimeState.mounted.get('slow_stack_fixture')).max);
        const front = extent(bevyPanelRuntimeState.mounted.get('fast_stack_fixture'));
        await bevyPanelRuntimeState.mounted.get('slow_stack_fixture').refresh();
        assert.deepEqual(extent(bevyPanelRuntimeState.mounted.get('fast_stack_fixture')), front);
        await openBevyPanelSurface('slow_stack_fixture');
        assert.ok(extent(bevyPanelRuntimeState.mounted.get('slow_stack_fixture')).min > extent(bevyPanelRuntimeState.mounted.get('fast_stack_fixture')).max);
        let unblock;
        const blocked = new Promise(resolve => { unblock = resolve; });
        const obsolete = openBevyPanelSurface('superseded_stack_fixture', { wait: blocked });
        await openBevyPanelSurface('superseded_stack_fixture', { marker: 'latest' });
        unblock();
        assert.equal((await obsolete).error, 'bevy_panel_open_superseded');
        assert.equal(bevyPanelRuntimeState.mounted.get('superseded_stack_fixture').context.marker, 'latest');
        assert.equal(disposeSuperseded, 1);
        let embedding;
        registerBevyPanelSurface({ surfaceKey: 'embedded_stack_fixture', title: 'Embedded',
            buildContent: () => [textNode('embedded_stack_text', 'Embedded content', { size: [100, 30] })] });
        registerBevyPanelSurface({ surfaceKey: 'embedding_stack_host', title: 'Host', hierarchyRail: false,
            buildContent: (_state, { emit }) => [node('embed_action', 'button', { size: [100, 30] }, [], {
                on: { activate: () => emit({ kind: 'embed' }) }
            })], handleEvent: () => { embedding = openBevyPanelSurface('embedded_stack_fixture'); return embedding; } });
        await openBevyPanelSurface('embedding_stack_host');
        await openBevyPanelSurface('fast_stack_fixture');
        const host = bevyPanelRuntimeState.mounted.get('embedding_stack_host');
        const find = node => node.id === 'embed_action' ? node : (node.children || []).map(find).find(Boolean);
        find(host.tree.root).on.activate();
        assert.equal((await embedding).embedded_in, 'embedding_stack_host');
        assert.equal(bevyPanelRuntimeState.mounted.has('embedded_stack_fixture'), false);
        assert.ok(records(host).some(record => record.properties.text === 'Embedded content'));
        assert.ok(extent(host).max < extent(bevyPanelRuntimeState.mounted.get('fast_stack_fixture')).min);
    } finally {
        await closeBevyPanelSurface('embedding_stack_host');
        bevyPanelRuntimeState.definitions.delete('embedding_stack_host');
        bevyPanelRuntimeState.definitions.delete('embedded_stack_fixture');
        await closeBevyPanelSurface('superseded_stack_fixture');
        bevyPanelRuntimeState.definitions.delete('superseded_stack_fixture');
        await closeBevyPanelSurface('slow_stack_fixture');
        await closeBevyPanelSurface('fast_stack_fixture');
        bevyPanelRuntimeState.definitions.delete('slow_stack_fixture');
        bevyPanelRuntimeState.definitions.delete('fast_stack_fixture');
        bevyPanelRuntimeState.runtime = previousRuntime;
        globalThis.window = previousWindow; globalThis.document = previousDocument;
        dom.window.close();
    }
});


test('shared Assistant/tool consumers retain their existing absolute subtree depths', () => {
    const absolute = panelBodyLayer(node('tool_root', 'panel', { z_index: 1600 },
        [textNode('tool_text', 'Tool', { z_index: 1601 })]), 1600);
    assert.equal(absolute.style.z_index, 1600);
    assert.equal(absolute.children[0].style.z_index, 1601);
});
