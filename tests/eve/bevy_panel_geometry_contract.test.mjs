import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { resolveBevyMainMenuItemSize } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { isBevyPanelMobileSurface, resolveBevyPanelGeometry } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { setAtomeContextualEditApi } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js';

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

test('Panel Lab can retain floating geometry on a mobile viewport', () => {
    const surface = {
        getBoundingClientRect: () => ({ width: 390, height: 844 })
    };
    const defaultGeometry = { left: 260, top: 120, width: 420, height: 340 };
    const standardMobileGeometry = resolveBevyPanelGeometry({ surface, defaultGeometry });
    const panelLabGeometry = resolveBevyPanelGeometry({
        surface,
        defaultGeometry,
        allowMobileFloating: true
    });
    assert.deepEqual(
        standardMobileGeometry,
        { x: 0, y: 0, width: 390, height: 770, toolboxReservedHeight: 74, mobile: true, placement: null },
        'product panels must retain their existing mobile fullscreen policy'
    );
    assert.deepEqual(
        panelLabGeometry,
        {
            x: 0, y: 430, width: 390, height: 340, toolboxReservedHeight: 74, mobile: false,
            placement: { left: 260, bottomGap: 0, width: 390, height: 340 }
        },
        'Panel Lab must open with its bottom edge against the mobile main toolbar'
    );
    const resizedPanelLabGeometry = resolveBevyPanelGeometry({
        surface,
        defaultGeometry: { x: 70, y: 160, width: 300, height: 280 },
        restoredGeometry: { x: 70, y: 160, width: 300, height: 280 },
        allowMobileFloating: true
    });
    assert.deepEqual(
        resizedPanelLabGeometry,
        {
            x: 70, y: 160, width: 300, height: 280, toolboxReservedHeight: 74, mobile: false,
            placement: { left: 70, bottomGap: 330, width: 300, height: 280 }
        },
        'Panel Lab mobile drag and resize results must not be replaced by fullscreen geometry'
    );
    const keyboardSurface = {
        getBoundingClientRect: () => ({ width: 390, height: 463 })
    };
    const keyboardGeometry = resolveBevyPanelGeometry({
        surface: keyboardSurface,
        defaultGeometry,
        restoredGeometry: panelLabGeometry,
        allowMobileFloating: true
    });
    assert.deepEqual(
        keyboardGeometry,
        {
            x: 0, y: 49, width: 390, height: 340, toolboxReservedHeight: 74, mobile: false,
            placement: { left: 260, bottomGap: 0, width: 390, height: 340 }
        },
        'keyboard contraction must clamp the floating panel without overwriting its full-viewport geometry'
    );
    assert.deepEqual(
        resolveBevyPanelGeometry({
            surface,
            defaultGeometry,
            restoredGeometry: panelLabGeometry,
            allowMobileFloating: true
        }),
        panelLabGeometry,
        'restoring the viewport must restore the exact pre-keyboard panel geometry'
    );
});

test('Contact docks beside the active Dashboard header and above the main menu', () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const desktopSurface = { getBoundingClientRect: () => ({ width: 1000, height: 800 }) };
    const mobileSurface = { getBoundingClientRect: () => ({ width: 390, height: 844 }) };
    try {
        setMainMenuRuntime({ handedness: 'left', getReservedHeight: () => 74 }, dom.window);
        assert.deepEqual(resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: { width: 420, height: 620 },
            dockToDashboardHeader: true
        }), {
            x: 120, y: 0, width: 420, height: 726, toolboxReservedHeight: 74, mobile: false, placement: null
        }, 'a left header must stay visible beside the docked Contact panel');
        assert.deepEqual(resolveBevyPanelGeometry({
            surface: mobileSurface,
            defaultGeometry: { width: 420, height: 620 },
            dockToDashboardHeader: true
        }), {
            x: 120, y: 0, width: 270, height: 770, toolboxReservedHeight: 74, mobile: true, placement: null
        }, 'mobile Contact must preserve both the side header and the main menu');

        setMainMenuRuntime({ handedness: 'right', getReservedHeight: () => 74 }, dom.window);
        assert.deepEqual(resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: { width: 420, height: 620 },
            dockToDashboardHeader: true
        }), {
            x: 460, y: 0, width: 420, height: 726, toolboxReservedHeight: 74, mobile: false, placement: null
        }, 'a right header must stay visible beside the docked Contact panel');
    } finally {
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('A docked Contact-style panel unlocks its footer drag and resize handles only on mobile', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
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
        mountTree: async ({ tree }) => { mounted.push(tree); return tree; },
        updateTree: async ({ tree }) => { mounted.push(tree); return tree; },
        unmountTree: async (id) => ({ id })
    };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74, handedness: 'left' }, dom.window);
    const {
        bevyPanelRuntimeState,
        closeBevyPanelSurface,
        openBevyPanelSurface,
        registerBevyPanelSurface
    } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    bevyPanelRuntimeState.mobileFloatingSurfaceKeys.clear();
    registerBevyPanelSurface({
        surfaceKey: 'mobile_docked_fixture', title: 'Fixture', defaultGeometry: { width: 420, height: 620 },
        dockToDashboardHeader: true, allowMobileFloating: true, readState: () => ({ title: 'Fixture' }), buildContent: () => []
    });

    try {
        await openBevyPanelSurface('mobile_docked_fixture');
        assert.equal(findNode(mounted.at(-1), 'eve_bevy_panel_mobile_docked_fixture_footer_drag'), null, 'desktop Contact must remain docked');
        assert.equal(findNode(mounted.at(-1), 'eve_bevy_panel_mobile_docked_fixture_footer_resize'), null, 'desktop Contact must not expose a resize handle');
        await closeBevyPanelSurface('mobile_docked_fixture');

        width = 390;
        height = 844;
        assert.equal(isBevyPanelMobileSurface(surface), true, 'the fixture must use the mobile geometry policy');
        assert.equal(bevyPanelRuntimeState.definitions.get('mobile_docked_fixture')?.allowMobileFloating, true, 'the fixture must opt into mobile floating');
        await openBevyPanelSurface('mobile_docked_fixture');
        const initialTree = mounted.at(-1);
        const dragHandle = findNode(initialTree, 'eve_bevy_panel_mobile_docked_fixture_footer_drag');
        const resizeHandle = findNode(initialTree, 'eve_bevy_panel_mobile_docked_fixture_footer_resize');
        assert.equal(typeof dragHandle?.on?.drag, 'function', 'mobile Contact must expose its canonical footer drag handle');
        assert.equal(typeof resizeHandle?.on?.drag, 'function', 'mobile Contact must expose its canonical footer resize handle');

        dragHandle.on.press({ client_x: 120, client_y: 20 });
        await dragHandle.on.drag({ client_x: 100, client_y: 20 });
        dragHandle.on.release();
        const movedPanel = findNode(mounted.at(-1), 'eve_bevy_panel_mobile_docked_fixture_panel');
        assert.equal(movedPanel.style.position[0], 100, 'a mobile footer drag must release the initial dock and move the panel');
        await closeBevyPanelSurface('mobile_docked_fixture');
    } finally {
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});

test('Bevy panel restores its pre-keyboard position after the iOS viewport expands', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
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
    surface.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 390,
        bottom: viewportHeight,
        width: 390,
        height: viewportHeight
    });
    const mounted = [];
    dom.window.eveBevyUiRuntime = {
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
    const {
        bevyPanelRuntimeState,
        closeBevyPanelSurface,
        openBevyPanelSurface,
        registerBevyPanelSurface
    } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    bevyPanelRuntimeState.geometryBySurfaceKey.clear();
    bevyPanelRuntimeState.desktopGeometryBySurfaceKey.clear();
    registerBevyPanelSurface({
        surfaceKey: 'ios_keyboard_restore_fixture',
        title: 'Fixture',
        allowMobileFloating: true,
        defaultGeometry: { left: 0, top: 120, width: 390, height: 340 },
        readState: () => ({ title: 'Fixture' }),
        buildContent: () => []
    });
    await openBevyPanelSurface('ios_keyboard_restore_fixture');
    const panelId = 'eve_bevy_panel_ios_keyboard_restore_fixture_panel';
    assert.deepEqual(findNode(mounted.at(-1), panelId).style.position, [0, 430]);

    viewportHeight = 500;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    viewportHeight = 480;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    viewportHeight = 463;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
    assert.deepEqual(findNode(mounted.at(-1), panelId).style.position, [0, 49]);
    assert.equal(mounted.length, 2, 'one settled keyboard transition must produce one panel update');

    viewportHeight = 844;
    viewport.dispatchEvent(new dom.window.Event('resize'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
    assert.deepEqual(
        findNode(mounted.at(-1), panelId).style.position,
        [0, 430],
        'keyboard dismissal must restore the exact pre-keyboard position'
    );
    await closeBevyPanelSurface('ios_keyboard_restore_fixture');
});

test('structural viewport resize and orientation reanchor every open Bevy panel and publish lifecycle state', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
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
        mountTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        updateTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        unmountTree: async (id) => { projected.delete(id); return { id }; }
    };
    const lifecycle = [];
    dom.window.addEventListener('eve:surface-state', (event) => lifecycle.push(event.detail));
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    const {
        bevyPanelRuntimeState,
        closeBevyPanelSurface,
        openBevyPanelSurface,
        registerBevyPanelSurface
    } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
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
        allowMobileFloating: true,
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
        for (const key of ['resize_fixture_a', 'resize_fixture_b', 'resize_fixture_edge']) {
            const tree = projected.get(`eve_bevy_panel_${key}`);
            const panel = findNode(tree, `eve_bevy_panel_${key}_panel`);
            assert.equal(panel.style.position[1] + panel.style.size[1], height - 74);
            assert.ok(panel.style.position[0] >= 0 && panel.style.position[0] + panel.style.size[0] <= width);
        }
        width = 390;
        height = 844;
        dom.window.dispatchEvent(new dom.window.Event('resize'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
        let edgePanel = findNode(projected.get('eve_bevy_panel_resize_fixture_edge'), 'eve_bevy_panel_resize_fixture_edge_panel');
        assert.deepEqual(edgePanel.style.position, [0, 470]);
        assert.equal(edgePanel.style.size[0], 390);
        width = 1000;
        height = 800;
        dom.window.dispatchEvent(new dom.window.Event('resize'));
        await new Promise((resolve) => dom.window.setTimeout(resolve, 120));
        edgePanel = findNode(projected.get('eve_bevy_panel_resize_fixture_edge'), 'eve_bevy_panel_resize_fixture_edge_panel');
        assert.equal(edgePanel.style.size[0], 480);
        assert.equal(edgePanel.style.position[1] + edgePanel.style.size[1], height - 74);
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
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});

test('the panel runtime reserves the contextual rail only while it is visible', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousCustomEvent = globalThis.CustomEvent;
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'contextual_rail_project', transitioning: false };
    dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
    dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
    const projected = new Map();
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        updateTree: async ({ id, tree }) => { projected.set(id, tree); return tree; },
        unmountTree: async (id) => { projected.delete(id); return { id }; }
    };
    setMainMenuRuntime({ handedness: 'right', showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    let menuVisible = true;
    setAtomeContextualEditApi({ readState: () => ({ menuVisible }) });
    const {
        bevyPanelRuntimeState,
        closeBevyPanelSurface,
        openBevyPanelSurface,
        registerBevyPanelSurface
    } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
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
        assert.equal(panel.style.position[0] + panel.style.size[0], 1000 - resolveBevyMainMenuItemSize());
        assert.equal(panel.style.position[1] + panel.style.size[1], 800 - 74);
        await closeBevyPanelSurface(surfaceKey);

        menuVisible = false;
        await openBevyPanelSurface(surfaceKey);
        panel = findNode(projected.get(`eve_bevy_panel_${surfaceKey}`), `eve_bevy_panel_${surfaceKey}_panel`);
        assert.equal(panel.style.position[0] + panel.style.size[0], 1000);
        await closeBevyPanelSurface(surfaceKey);
    } finally {
        bevyPanelRuntimeState.definitions.delete(surfaceKey);
        setAtomeContextualEditApi(null);
        setMainMenuRuntime(null, dom.window);
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.CustomEvent = previousCustomEvent;
    }
});
