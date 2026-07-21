import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { WORKSPACE_SCENE_LAYER_IDS } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { EVE_TOOL_SKIN_TOKENS } from '../../eVe/elements/skin/tool_skin.js';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const installPanelDom = () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1024,
        bottom: 768,
        width: 1024,
        height: 768
    });
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'panel_project', transitioning: false };
    let menuActive = false;
    setMainMenuRuntime({
        showFully: async () => {
            menuActive = true;
            return true;
        },
        measure: () => ({ active: menuActive, treeMounted: menuActive })
    }, dom.window);
    return { dom, surface };
};

const visit = (node, fn) => {
    if (!node) return;
    fn(node);
    (node.children || []).forEach((child) => visit(child, fn));
};

const findNode = (tree, id) => {
    let found = null;
    visit(tree.root, (node) => {
        if (node.id === id) found = node;
    });
    return found;
};

test('Bevy panel contract removes tools dock and keeps system controls in footer', async () => {
    const { dom } = installPanelDom();
    const mounted = [];
    const unmounted = [];
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        updateTree: async ({ tree }) => {
            mounted.push(tree);
            return tree;
        },
        unmountTree: async (id) => {
            unmounted.push(id);
            return { id };
        }
    };
    dom.window.AtomeTimeline = {
        load: async () => [],
        onUpdate: () => () => false
    };
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();

    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });

    const result = await runtime.openPanelSurface('timeline');
    assert.equal(result.ok, true);
    assert.equal(result.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.equal(mounted.length >= 1, true);

    const tree = mounted[0];
    const ids = [];
    visit(tree.root, (node) => ids.push(node.id));
    assert.equal(tree.layer, 'panel');
    assert.equal(tree.root.layer, 'panel');
    assert.equal(tree.root.parent_id, WORKSPACE_SCENE_LAYER_IDS.panel);
    assert.equal(ids.some((id) => id.includes('tools_dock')), false);

    const footer = findNode(tree, 'eve_bevy_panel_timeline_footer');
    const body = findNode(tree, 'eve_bevy_panel_timeline_body');
    const panel = findNode(tree, 'eve_bevy_panel_timeline_panel');
    const accent = findNode(tree, 'eve_bevy_panel_timeline_footer_accent');
    const close = findNode(tree, 'eve_bevy_panel_timeline_footer_close');
    const drag = findNode(tree, 'eve_bevy_panel_timeline_footer_drag');
    assert.equal(body.kind, 'scroll_area');
    assert.equal(footer.kind, 'row');
    assert.equal(BEVY_PANEL_TOKENS.footerHeightPx, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerHeightPx);
    assert.equal(close.accessibility?.role, 'button');
    assert.deepEqual(close.accessibility?.actions, ['activate']);
    assert.equal(findNode(tree, 'eve_bevy_panel_timeline_header'), null);
    assert.equal(footer.children.some((node) => node.id.endsWith('_close')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_drag')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_resize_left')), true);
    assert.equal(footer.children.some((node) => node.id.endsWith('_resize')), true);
    assert.equal(drag.on.activate, undefined, 'only Panel Lab opts into footer fullscreen activation');
    assert.equal(body.style.overflow, 'scroll');
    assert.deepEqual(body.style.position, [0, 0]);
    assert.equal(footer.style.shadow, undefined);
    assert.ok(panel.style.shadow, 'only the outer panel owns the drop shadow');
    assert.deepEqual(accent.style.position, [0, 0]);
    assert.deepEqual(accent.style.size, [panel.style.size[0], EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentThicknessPx]);
    assert.deepEqual(accent.style.background, EVE_TOOL_SKIN_TOKENS.bevyMenu.footerAccentColor);
    assert.equal(accent.style.shadow, undefined);
    assert.equal(accent.style.border, undefined);
    assert.equal(accent.on, undefined);
    assert.ok(findNode(tree, 'eve_bevy_panel_timeline_footer_close_label').style.z_index > accent.style.z_index);
    const { BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE } = await import('../../eVe/intuition/ribbon/bevy_ui_menu_surface.js');
    const leftGripIcon = findNode(tree, 'eve_bevy_panel_timeline_footer_resize_left_icon');
    const rightGripIcon = findNode(tree, 'eve_bevy_panel_timeline_footer_resize_icon');
    assert.equal(leftGripIcon.image.source, BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE);
    assert.equal(rightGripIcon.image.source, BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE);
    assert.deepEqual(leftGripIcon.style.size, [BEVY_PANEL_TOKENS.resizeHandlePx, BEVY_PANEL_TOKENS.footerHeightPx]);
    assert.deepEqual(rightGripIcon.style.size, [BEVY_PANEL_TOKENS.resizeHandlePx, BEVY_PANEL_TOKENS.footerHeightPx]);
    assert.deepEqual(leftGripIcon.style.scale, [-1, 1]);
    assert.deepEqual(rightGripIcon.style.scale, [1, 1]);
    assert.equal(leftGripIcon.style.position, undefined);
    assert.equal(rightGripIcon.style.position, undefined);

    await drag.on.drag({ delta_x: 40, delta_y: 30 });
    const movedPanel = findNode(mounted.at(-1), 'eve_bevy_panel_timeline_panel');
    assert.deepEqual(movedPanel.style.position, [250, 150]);

    await close.on.activate();
    assert.deepEqual(unmounted, ['eve_bevy_panel_timeline']);
});

test('Calendar and Contact panel surfaces route to Bevy UI instead of legacy HTML', async () => {
    const { dom } = installPanelDom();
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
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });

    const calendar = await runtime.openPanelSurface('calendar');
    const contact = await runtime.openPanelSurface('contact');

    assert.equal(calendar.ok, true);
    assert.equal(calendar.bevy, true);
    assert.equal(contact.ok, true);
    assert.equal(contact.bevy, true);
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_calendar_root'), 'calendar must mount as a Bevy panel tree');
    assert.ok(mounted.some((tree) => tree.root.id === 'eve_bevy_panel_contact_root'), 'contact must mount as a Bevy panel tree');
    assert.equal(mounted.every((tree) => tree.layer === 'panel' && tree.root.parent_id === WORKSPACE_SCENE_LAYER_IDS.panel), true);
});

test('legacy Timeline module no longer creates an HTML dialog', () => {
    const source = readFileSync(join(repoRoot, 'eVe/intuition/tools/timeline.js'), 'utf8');
    assert.doesNotMatch(source, /createEveDialog/);
    assert.doesNotMatch(source, /createEveButton|createEveSlider|createEveNumberInput/);
});

test('Panel Lab is development-gated and uses the shared panel skin', async () => {
    const { dom } = installPanelDom();
    const mounted = [];
    dom.window.__EVE_PANEL_LAB__ = true;
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => { mounted.push(tree); return tree; },
        updateTree: async ({ tree }) => { mounted.push(tree); return tree; },
        unmountTree: async (id) => ({ id })
    };
    const { panelLabSurfaceDefinition, registerBevyPanelSurfaces } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js');
    const { bevyPanelRuntimeState } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
    const { createPanelSurfaceRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js');
    const { EVE_COMMON_SKIN_TOKENS, EVE_PANEL_SKIN_TOKENS } = await import('../../eVe/elements/skin/index.js');
    const { BEVY_MENU_TOKENS } = await import('../../eVe/intuition/ribbon/bevy_ui_menu_surface.js');
    bevyPanelRuntimeState.runtime = null;
    bevyPanelRuntimeState.mounted.clear();
    registerBevyPanelSurfaces();
    const runtime = createPanelSurfaceRuntime({
        capturePanelVisibilitySnapshot: () => ({}),
        preparePanelSurfaceDuringOpen: () => {
            throw new Error('legacy_panel_prepare_should_not_run');
        },
        resolvePanelAnchorRect: () => null
    });
    runtime.registerPanelSurfaceDefinition(panelLabSurfaceDefinition);
    const result = await runtime.openPanelSurface('panel_lab');
    assert.equal(result.ok, true);
    assert.equal(mounted.length, 1);
    assert.equal(PANEL_SURFACE_DEFINITIONS.panel_lab, undefined);
    const material = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    assert.equal(BEVY_PANEL_TOKENS.material, material);
    assert.equal(BEVY_MENU_TOKENS.surface.material, material);
    assert.deepEqual(material.shadow.offset, [0, 0]);
    assert.equal(material.shadow.spread, 0);
    assert.deepEqual(material.backdrop, { blurPx: 18, tint: [0, 0, 0, 0.3] });
    const panel = findNode(mounted[0], 'eve_bevy_panel_panel_lab_panel');
    const body = findNode(mounted[0], 'eve_bevy_panel_panel_lab_body');
    const footer = findNode(mounted[0], 'eve_bevy_panel_panel_lab_footer');
    const drag = findNode(mounted[0], 'eve_bevy_panel_panel_lab_footer_drag');
    assert.deepEqual(panel.style.background, material.background);
    assert.deepEqual(panel.style.backdrop, material.backdrop);
    assert.deepEqual(panel.style.shadow, material.shadow);
    assert.equal(mounted[0].presentation, true);
    assert.deepEqual(body.style.background, EVE_PANEL_SKIN_TOKENS.bevyPanel.colors.transparent);
    assert.deepEqual(footer.style.background, BEVY_MENU_TOKENS.clear);
    assert.equal(typeof drag.on.activate, 'function');
    const contentTint = EVE_COMMON_SKIN_TOKENS.systemContent.gpu;
    for (const id of [
        'eve_bevy_panel_panel_lab_footer_resize_left_icon',
        'eve_bevy_panel_panel_lab_footer_close_label',
        'eve_bevy_panel_panel_lab_footer_status',
        'eve_bevy_panel_panel_lab_footer_resize_icon'
    ]) {
        assert.deepEqual(findNode(mounted[0], id).image.tint, contentTint, id);
    }
    assert.equal(dom.window.document.querySelectorAll('button,input,select,textarea').length, 0);
    await drag.on.activate();
    await drag.on.activate();
    const fullscreenPanel = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_panel');
    assert.deepEqual(fullscreenPanel.style.position, [0, 0]);
    assert.deepEqual(fullscreenPanel.style.size, [1024, 694]);
    const fullscreenDrag = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_footer_drag');
    await fullscreenDrag.on.activate();
    await fullscreenDrag.on.activate();
    const restoredPanel = findNode(mounted.at(-1), 'eve_bevy_panel_panel_lab_panel');
    assert.deepEqual(restoredPanel.style.position, [260, 120]);
    assert.deepEqual(restoredPanel.style.size, [420, 280]);
    await runtime.closePanelSurface('panel_lab');
});

test('Panel layer wins canvas hit-testing over Dashboard-local z-index', async () => {
    const { surface } = installPanelDom();
    const uiRuntime = createEveBevyUiRuntime({
        overlayProjector: { project: async () => [], clear: async () => [] },
        requestFrame: () => 0
    });
    const dashboardTree = {
        id: 'dashboard_bevy_ui',
        layer: 'dashboard',
        root: {
            id: 'dashboard_root', kind: 'root',
            style: { size: [1024, 768], z_index: 9000 },
            children: [{
                id: 'dashboard_card', kind: 'button',
                style: { position: [100, 100], size: [300, 240] },
                on: { activate: () => null }
            }]
        }
    };
    const panelTree = {
        id: 'eve_bevy_panel_test',
        layer: 'panel',
        root: {
            id: 'panel_root', kind: 'root',
            style: { size: [1024, 768], z_index: 1250 },
            children: [{
                id: 'panel_footer_drag', kind: 'drag_handle',
                style: { position: [100, 100], size: [300, 240] },
                on: { drag: () => null }
            }]
        }
    };
    await uiRuntime.mountTree({ id: dashboardTree.id, surface, tree: dashboardTree });
    await uiRuntime.mountTree({ id: panelTree.id, surface, tree: panelTree });
    const hit = uiRuntime.hitTestAtClientPoint({ surface, clientX: 220, clientY: 180 });
    assert.equal(hit?.treeId, 'eve_bevy_panel_test');
    assert.equal(hit?.nodeId, 'panel_footer_drag');
});
