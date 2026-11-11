import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { resolveBevyMainMenuItemSize } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { isBevyPanelMobileSurface, resolveBevyPanelGeometry, resolveBevyPanelGridSlab } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js';
import { panelBandReserve } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_band.js';
import { BEVY_MENU_TOKENS } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import { buildBevyPanelTree, measurePanelNaturalHeight } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { setAtomeContextualEditApi } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js';
import { bevyPanelRuntimeState, closeBevyPanelSurface, openBevyPanelSurface, registerBevyPanelSurface, schedulePanelRefresh } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { waitAnimationFrame } from '../../eVe/domains/rendering/animation_frame_runtime.js';
import { createProjectSceneRenderScheduler } from '../../eVe/domains/rendering/project_scene_render_scheduler.js';

test('panel refresh has a bounded fallback when requestAnimationFrame stalls', async () => {
    let frameCallback = null;
    let cancelledFrame = 0;
    const win = {
        requestAnimationFrame(callback) {
            frameCallback = callback;
            return 41;
        },
        cancelAnimationFrame(handle) { cancelledFrame = handle; },
        setTimeout,
        clearTimeout
    };
    const startedAt = Date.now();
    await new Promise((resolve) => schedulePanelRefresh(win, resolve));
    assert.ok(Date.now() - startedAt < 250);
    assert.equal(cancelledFrame, 41);
    frameCallback?.(Date.now());
});

test('two Bevy startup frames stay bounded when requestAnimationFrame stalls', async () => {
    let cancelledFrames = 0;
    const win = {
        requestAnimationFrame() { return 51; },
        cancelAnimationFrame() { cancelledFrames += 1; },
        setTimeout,
        clearTimeout
    };
    const startedAt = Date.now();
    await waitAnimationFrame(win);
    await waitAnimationFrame(win);

    assert.ok(Date.now() - startedAt < 250);
    assert.equal(cancelledFrames, 2);
});

test('project scene scheduling renders through the shared frame watchdog', async () => {
    const originalWindow = globalThis.window;
    globalThis.window = {
        requestAnimationFrame() { return 61; },
        cancelAnimationFrame() {},
        setTimeout,
        clearTimeout
    };
    try {
        const calls = [];
        const scheduler = createProjectSceneRenderScheduler({
            renderProjection: async (runtime) => calls.push(runtime.project_id)
        });
        scheduler.schedule({ project_id: 'home-panel' });
        await new Promise((resolve) => setTimeout(resolve, 80));

        assert.deepEqual(calls, ['home-panel']);
    } finally {
        globalThis.window = originalWindow;
    }
});

const findNode = (tree, id) => {
    let found = null;
    const visit = (node) => {
        if (!node || found) return;
        if (node.id === id) {
            found = node;
            return;
        }
        (node.children || []).forEach(visit);
    };
    visit(tree.root);
    return found;
};

test('the shared fixed area measures a taller responsive action block', () => {
    const tree = buildBevyPanelTree({
        id: 'fixed_fixture', title: 'Fixture', geometry: { x: 0, y: 0, width: 320, height: 400 },
        surfaceSize: { width: 390, height: 844 },
        fixedChildren: [{ id: 'two_lines', kind: 'column', style: { size: [300, 72] }, children: [] }]
    });
    assert.deepEqual(findNode(tree, 'fixed_fixture_fixed_actions').style.size,
        [320, 72 + (BEVY_PANEL_TOKENS.paddingPx * 2)]);
});

// The asked box is the placement; the slab drawn is that box laid on the one screen grid
// (bevy_panel_layout.js#resolveBevyPanelGridSlab, AGENTS.md rule 13).
const onGrid = (surface, placement) => resolveBevyPanelGridSlab({ surface, x: placement.left, width: placement.width });

test('shared panel geometry glues a bottom anchor and docks side anchors at the dock gap, on the screen grid', () => {
    const surface = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 1000, height: 800 }) };
    const base = { surface, defaultGeometry: { width: 300, height: 180 }, naturalHeight: 180 };
    const dock = BEVY_PANEL_TOKENS.dockGapPx;
    const bottom = resolveBevyPanelGeometry({
        ...base,
        anchor: { edge: 'bottom', rect: { left: 500, right: 560, top: 700, bottom: 740, width: 60, height: 40 } }
    });
    // Centred on the anchor, its foot glued to the anchor's top.
    assert.deepEqual([bottom.placement.left, bottom.placement.width], [280, 300]);
    assert.deepEqual([bottom.y, bottom.height], [470, 180]);
    assert.deepEqual({ x: bottom.x, width: bottom.width }, onGrid(surface, bottom.placement));
    // A side anchor: the dock gap from its edge, the foot against the main bar like every panel.
    const foot = 800 - bottom.toolboxReservedHeight - 180;
    const left = resolveBevyPanelGeometry({
        ...base,
        anchor: { edge: 'left', rect: { left: 100, right: 160, top: 250, bottom: 310, width: 60, height: 60 } }
    });
    assert.deepEqual([left.placement.left, left.y], [60 + dock, foot]);
    assert.deepEqual({ x: left.x, width: left.width }, onGrid(surface, left.placement));
    const right = resolveBevyPanelGeometry({
        ...base,
        anchor: { edge: 'right', rect: { left: 1040, right: 1100, top: 250, bottom: 310, width: 60, height: 60 } }
    });
    assert.deepEqual([right.placement.left, right.y], [940 - 300 - dock, foot]);
    assert.deepEqual({ x: right.x, width: right.width }, onGrid(surface, right.placement));
});

test('natural panel height is exactly content, padding, gaps and the band reserve', () => {
    assert.equal(measurePanelNaturalHeight({
        width: 320,
        bodyChildren: [
            { id: 'a', kind: 'panel', style: { size: [300, 32] }, children: [] },
            { id: 'b', kind: 'panel', style: { size: [300, 32] }, children: [] }
        ],
        bodyGap: 8
    }), Math.ceil(64 + 8 + BEVY_PANEL_TOKENS.paddingPx * 2 + panelBandReserve()));
});

// A host's rectangle (the Dashboard stage): a short form asked to fit its content lies at the
// rectangle's foot, as tall as its content; taller content keeps the whole rectangle.
test('a hosted panel fitted to its content lies at the foot of the host rectangle', () => {
    const surface = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 430, height: 932 }) };
    const bounds = { x: 10, y: 120, width: 410, height: 680 };
    const whole = resolveBevyPanelGeometry({ surface, bounds, naturalHeight: 90 });
    assert.deepEqual([whole.x, whole.y, whole.width, whole.height], [10, 120, 410, 680]);
    const fitted = resolveBevyPanelGeometry({ surface, bounds, naturalHeight: 90, hostFit: 'content' });
    assert.deepEqual([fitted.x, fitted.y, fitted.width, fitted.height], [10, 710, 410, 90]);
    const tall = resolveBevyPanelGeometry({ surface, bounds, naturalHeight: 2000, hostFit: 'content' });
    assert.deepEqual([tall.y, tall.height], [120, 680]);
});

// On a phone a panel spans the width and sits at the foot, as tall as its content (bevy_panel_layout.js
// #phonePlacement, AGENTS.md rule 14): neither its default box nor a remembered drag moves it off.
test('mobile panels span the width at the foot and keep their geometry through viewport changes', () => {
    const surface = {
        getBoundingClientRect: () => ({ width: 390, height: 844 })
    };
    const reserved = resolveBevyMainMenuItemSize() + BEVY_PANEL_TOKENS.dockGapPx;
    const phone = (height) => ({ left: 0, bottomGap: 0, width: 390, height });
    const defaultGeometry = { left: 260, top: 120, width: 420, height: 340 };
    const standardMobileGeometry = resolveBevyPanelGeometry({ surface, defaultGeometry });
    assert.deepEqual(standardMobileGeometry, {
        ...onGrid(surface, phone(340)), y: 844 - reserved - 340, height: 340,
        toolboxReservedHeight: reserved, mobile: true, placement: phone(340)
    });
    const resizedPanelLabGeometry = resolveBevyPanelGeometry({
        surface,
        defaultGeometry: { x: 70, y: 160, width: 300, height: 280 },
        restoredGeometry: { x: 70, y: 160, width: 300, height: 280 },
    });
    assert.deepEqual(
        resizedPanelLabGeometry,
        {
            ...onGrid(surface, phone(280)), y: 844 - reserved - 280, height: 280,
            toolboxReservedHeight: reserved, mobile: true, placement: phone(280)
        },
        'a remembered drag on a phone keeps the panel at the foot, as tall as asked'
    );
    const keyboardSurface = {
        getBoundingClientRect: () => ({ width: 390, height: 463 })
    };
    const keyboardGeometry = resolveBevyPanelGeometry({
        surface: keyboardSurface,
        defaultGeometry,
        restoredGeometry: standardMobileGeometry,
    });
    assert.deepEqual(
        keyboardGeometry,
        {
            ...onGrid(keyboardSurface, phone(340)), y: 463 - reserved - 340, height: 340,
            toolboxReservedHeight: reserved, mobile: true, placement: phone(340)
        },
        'keyboard contraction must lift the panel above the keyboard without changing its size'
    );
    assert.deepEqual(
        resolveBevyPanelGeometry({
            surface,
            defaultGeometry,
            restoredGeometry: standardMobileGeometry,
            }),
        standardMobileGeometry,
        'restoring the viewport must restore the exact pre-keyboard panel geometry'
    );
});

test('Contact uses the same content-sized compact geometry as every panel', () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    const desktopSurface = { getBoundingClientRect: () => ({ width: 1000, height: 800 }) };
    const mobileSurface = { getBoundingClientRect: () => ({ width: 390, height: 844 }) };
    try {
        setMainMenuRuntime({ handedness: 'left', getReservedHeight: () => 74 }, dom.window);
        // The main bar's reserve plus the dock gap: a panel's foot stops just above the bar.
        const reserved = 74 + BEVY_PANEL_TOKENS.dockGapPx;
        const desktop = { left: 290, bottomGap: 0, width: 420, height: 620 };
        assert.deepEqual(resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: { width: 420, height: 620 },
        }), {
            ...onGrid(desktopSurface, desktop), y: 800 - reserved - 620, height: 620, toolboxReservedHeight: reserved, mobile: false,
            placement: desktop
        });
        const phone = { left: 0, bottomGap: 0, width: 390, height: 620 };
        assert.deepEqual(resolveBevyPanelGeometry({
            surface: mobileSurface,
            defaultGeometry: { width: 420, height: 620 },
        }), {
            ...onGrid(mobileSurface, phone), y: 844 - reserved - 620, height: 620, toolboxReservedHeight: reserved, mobile: true,
            placement: phone
        });

    } finally {
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow; globalThis.document = previousDocument;
    }
});

// A desktop panel moves and resizes from its foot band; on a phone the panel is held at the foot across the
// width (bevy_panel_layout.js#phonePlacement), so the band offers neither (bevy_panel_tree.js `resizeEnabled`).
test('Contact-style panels use the shared footer drag and resize handles on desktop, none on a phone', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement, previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'mobile_docked_fixture', transitioning: false };
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    const surface = dom.window.document.getElementById('eve_surface_project');
    let width = 1000;
    let height = 800;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height });
    const mounted = [];
    dom.window.eveBevyUiRuntime = {
        treeScrollRevision: () => 0, captureTreeScroll: () => ({ userRevision: 0, offsets: [] }),
        mountTree: async ({ tree }) => { mounted.push(tree); return tree; },
        updateTree: async ({ tree }) => { mounted.push(tree); return tree; },
        unmountTree: async (id) => ({ id })
    };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74, handedness: 'left' }, dom.window);
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    registerBevyPanelSurface({
        surfaceKey: 'mobile_docked_fixture', title: 'Fixture', defaultGeometry: { width: 420, height: 620 },
        readState: () => ({ title: 'Fixture' }), buildContent: () => []
    });

    try {
        await openBevyPanelSurface('mobile_docked_fixture');
        assert.equal(typeof findNode(mounted.at(-1), 'eve_bevy_panel_mobile_docked_fixture_footer_drag').on.drag, 'function');
        assert.equal(typeof findNode(mounted.at(-1), 'eve_bevy_panel_mobile_docked_fixture_footer_resize').on.drag, 'function');
        await closeBevyPanelSurface('mobile_docked_fixture');

        width = 390;
        height = 844;
        assert.ok(isBevyPanelMobileSurface(surface));
        await openBevyPanelSurface('mobile_docked_fixture');
        const initialTree = mounted.at(-1);
        assert.equal(findNode(initialTree, 'eve_bevy_panel_mobile_docked_fixture_footer_drag'), null,
            'a phone panel is not dragged off the foot');
        assert.equal(findNode(initialTree, 'eve_bevy_panel_mobile_docked_fixture_footer_resize'), null,
            'a phone panel is not resized off the width');
        const phonePanel = findNode(initialTree, 'eve_bevy_panel_mobile_docked_fixture_panel');
        const reserved = 74 + BEVY_PANEL_TOKENS.dockGapPx;
        assert.equal(phonePanel.style.position[1] + phonePanel.style.size[1], 844 - reserved, 'the phone panel sits at the foot');
        assert.deepEqual([phonePanel.style.position[0], phonePanel.style.size[0]],
            Object.values(resolveBevyPanelGridSlab({ surface, x: 0, width: 390 })), 'the phone panel spans the width on the grid');
        await closeBevyPanelSurface('mobile_docked_fixture');
    } finally {
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow; globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});

test('Bevy panel restores its pre-keyboard position after the iOS viewport expands', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    dom.window.__eveWorkspaceMode = {
        mode: 'project',
        projectId: 'ios_keyboard_restore_project',
        transitioning: false
    };
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    const viewport = new dom.window.EventTarget();
    Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: viewport });
    const surface = dom.window.document.getElementById('eve_surface_project');
    let viewportHeight = 844;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: viewportHeight, width: 390, height: viewportHeight });
    const mounted = [];
    dom.window.eveBevyUiRuntime = {
        treeScrollRevision: () => 0, captureTreeScroll: () => ({ userRevision: 0, offsets: [] }),
        mountTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        updateTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        unmountTree: async (id) => ({ id })
    };
    setMainMenuRuntime({
        showFully: async () => true,
        getReservedHeight: () => 74,
        measure: () => ({ active: true, treeMounted: true })
    }, dom.window);
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    registerBevyPanelSurface({
        surfaceKey: 'ios_keyboard_restore_fixture',
        title: 'Fixture',
        defaultGeometry: { left: 0, top: 120, width: 390, height: 340 },
        readState: () => ({ title: 'Fixture' }),
        buildContent: () => []
    });
    await openBevyPanelSurface('ios_keyboard_restore_fixture');
    const panelId = 'eve_bevy_panel_ios_keyboard_restore_fixture_panel';
    const initialPosition = [...findNode(mounted.at(-1), panelId).style.position];
    // The main bar's reserve plus the dock gap; on a phone the panel spans the width on the screen grid.
    const reserved = 74 + BEVY_PANEL_TOKENS.dockGapPx;
    assert.equal(initialPosition[0], resolveBevyPanelGridSlab({ surface, x: 0, width: 390 }).x);
    assert.equal(initialPosition[1] + findNode(mounted.at(-1), panelId).style.size[1], 844 - reserved);

    viewportHeight = 500;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    viewportHeight = 480;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    viewportHeight = 463;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
    assert.equal(findNode(mounted.at(-1), panelId).style.position[0], initialPosition[0]);
    assert.equal(findNode(mounted.at(-1), panelId).style.position[1] + findNode(mounted.at(-1), panelId).style.size[1], 463 - reserved);
    assert.equal(mounted.length, 2, 'one settled keyboard transition must produce one panel update');

    viewportHeight = 844;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
    assert.deepEqual(
        findNode(mounted.at(-1), panelId).style.position,
        initialPosition,
        'keyboard dismissal must restore the exact pre-keyboard position'
    );
    await closeBevyPanelSurface('ios_keyboard_restore_fixture');
});

test('structural viewport resize and orientation reanchor every open Bevy panel and publish lifecycle state', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement, previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'resize_fixture_project', transitioning: false };
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    const surface = dom.window.document.getElementById('eve_surface_project');
    let width = 1000;
    let height = 800;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height, width, height });
    const projected = new Map();
    dom.window.eveBevyUiRuntime = {
        treeScrollRevision: () => 0, captureTreeScroll: () => ({ userRevision: 0, offsets: [] }),
        mountTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        updateTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        unmountTree: async (id) => { projected.delete(id); return { id }; }
    };
    const lifecycle = [];
    dom.window.addEventListener('eve:surface-state', (event) => lifecycle.push(event.detail));
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    const fixture = (surfaceKey, left) => ({
        surfaceKey,
        title: surfaceKey,
        defaultGeometry: { left, top: 20, width: 320, height: 300 },
        readState: () => ({ title: surfaceKey }),
        buildContent: () => []
    });
    registerBevyPanelSurface(fixture('resize_fixture_a', 20));
    registerBevyPanelSurface(fixture('resize_fixture_b', 700));
    registerBevyPanelSurface({
        ...fixture('resize_fixture_edge', 180),
        defaultGeometry: { left: 180, top: 20, width: 480, height: 300 },
        openAtHandednessEdge: true
    });
    try {
        await openBevyPanelSurface('resize_fixture_a');
        await openBevyPanelSurface('resize_fixture_b');
        await openBevyPanelSurface('resize_fixture_edge');
        width = 760;
        height = 620;
        dom.window.dispatchEvent(new dom.window.Event('orientationchange'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
        // Every panel, the one opened at the hand's edge included, sits at the foot above the main bar
        // (its reserve plus the dock gap) and inside the surface.
        const reserved = 74 + BEVY_PANEL_TOKENS.dockGapPx;
        for (const key of ['resize_fixture_a', 'resize_fixture_b', 'resize_fixture_edge']) {
            const tree = projected.get(`eve_bevy_panel_${key}`);
            const panel = findNode(tree, `eve_bevy_panel_${key}_panel`);
            assert.equal(panel.style.position[1] + panel.style.size[1], height - reserved, key);
            assert.ok(panel.style.position[0] >= 0 && panel.style.position[0] + panel.style.size[0] <= width);
        }
        width = 390;
        height = 844;
        dom.window.dispatchEvent(new dom.window.Event('resize'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
        // On a phone it spans the width at the foot.
        let edgePanel = findNode(projected.get('eve_bevy_panel_resize_fixture_edge'), 'eve_bevy_panel_resize_fixture_edge_panel');
        assert.deepEqual([edgePanel.style.position[0], edgePanel.style.size[0]],
            Object.values(resolveBevyPanelGridSlab({ surface, x: 0, width: 390 })));
        assert.equal(edgePanel.style.position[1] + edgePanel.style.size[1], height - reserved);
        width = 1000;
        height = 800;
        dom.window.dispatchEvent(new dom.window.Event('resize'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
        // Back on the desktop it takes its own width again, laid on the grid.
        edgePanel = findNode(projected.get('eve_bevy_panel_resize_fixture_edge'), 'eve_bevy_panel_resize_fixture_edge_panel');
        assert.equal(edgePanel.style.size[0], resolveBevyPanelGridSlab({ surface, x: edgePanel.style.position[0], width: 480 }).width);
        assert.equal(edgePanel.style.position[1] + edgePanel.style.size[1], height - reserved);
        await closeBevyPanelSurface('resize_fixture_a');
        await closeBevyPanelSurface('resize_fixture_b');
        await closeBevyPanelSurface('resize_fixture_edge');
        assert.deepEqual(lifecycle.map(({ kind, surface_key: key }) => `${kind}:${key}`), [
            'opened:resize_fixture_a',
            'opened:resize_fixture_b',
            'opened:resize_fixture_edge',
            'closed:resize_fixture_a',
            'closed:resize_fixture_b',
            'closed:resize_fixture_edge'
        ]);
        assert.equal(projected.size, 0);
        assert.equal(bevyPanelRuntimeState.mounted.size, 0);
    } finally {
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow; globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});

test('the panel runtime reserves the contextual rail only while it is visible', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement, previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'contextual_rail_project', transitioning: false };
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
    const projected = new Map();
    dom.window.eveBevyUiRuntime = {
        treeScrollRevision: () => 0, captureTreeScroll: () => ({ userRevision: 0, offsets: [] }),
        mountTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        updateTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        unmountTree: async (id) => { projected.delete(id); return { id }; }
    };
    setMainMenuRuntime({ handedness: 'right', showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    let menuVisible = true;
    setAtomeContextualEditApi({ readState: () => ({ menuVisible }) });
    const surfaceKey = 'contextual_rail_fixture';
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    registerBevyPanelSurface({
        surfaceKey,
        title: 'Contextual rail fixture',
        defaultGeometry: { left: 0, top: 0, width: 400, height: 500 },
        openAtHandednessEdge: true,
        openBesideContextualRail: true,
        resolveHandednessEdgeInsetPx: () => menuVisible ? resolveBevyMainMenuItemSize() : 0,
        readState: () => ({}),
        buildContent: () => []
    });
    try {
        await openBevyPanelSurface(surfaceKey);
        let panel = findNode(projected.get(`eve_bevy_panel_${surfaceKey}`), `eve_bevy_panel_${surfaceKey}_panel`);
        // The rail's column: its margin, its cell and the dock gap (bevy_panel_layout.js#resolveContextualRailReservation).
        const railColumn = Math.round(resolveBevyMainMenuItemSize() + BEVY_MENU_TOKENS.toolGapPx + BEVY_PANEL_TOKENS.dockGapPx);
        const railEdge = 1000 - railColumn;
        assert.deepEqual([panel.style.position[0], panel.style.size[0]],
            Object.values(resolveBevyPanelGridSlab({ surface, x: railEdge - 400, width: 400, right: railEdge })),
            'the panel lies against the rail column, on the screen grid');
        assert.ok(panel.style.position[0] + panel.style.size[0] <= railEdge, 'never over the rail column');
        assert.equal(panel.style.position[1] + panel.style.size[1], 800 - 74 - BEVY_PANEL_TOKENS.dockGapPx);
        const besideRailRight = panel.style.position[0] + panel.style.size[0];
        await closeBevyPanelSurface(surfaceKey);

        menuVisible = false;
        await openBevyPanelSurface(surfaceKey);
        panel = findNode(projected.get(`eve_bevy_panel_${surfaceKey}`), `eve_bevy_panel_${surfaceKey}_panel`);
        // Without the rail the column is released: the panel docks against the bare edge, past the rail's place.
        assert.deepEqual([panel.style.position[0], panel.style.size[0]],
            Object.values(resolveBevyPanelGridSlab({ surface, x: 1000 - 400 - BEVY_PANEL_TOKENS.dockGapPx, width: 400 })));
        assert.ok(panel.style.position[0] + panel.style.size[0] > besideRailRight);
        await closeBevyPanelSurface(surfaceKey);
    } finally {
        bevyPanelRuntimeState.definitions.delete(surfaceKey);
        setAtomeContextualEditApi(null);
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow; globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});
