import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { clearAllProjectScenes, getProjectSceneState } from '../../eVe/domains/rendering/project_scene_runtime.js';
import {
    buildAtomeContextualEditTree,
    contextualGestureProps
} from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js';
import {
    BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE,
    BEVY_MENU_TOKENS
} from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import { EVE_COMMON_SKIN_TOKENS } from '../../eVe/elements/skin/tokens.js';
import { buildBevyUiFlowerTree } from '../../eVe/intuition/ribbon/bevy_ui_flower_model.js';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import {
    markDashboardWorkspaceMode,
    markProjectWorkspaceMode
} from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';

test('BevyUI canvas binding owns touch gestures for mobile pointer scroll', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => null,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'touch_tree',
        surface,
        tree: {
            id: 'touch_root',
            kind: 'root',
            style: { size: [120, 80] },
            children: [{ id: 'scroll_target', kind: 'scroll_area', style: { size: [120, 80] } }]
        }
    });

    assert.equal(surface.style.touchAction, 'none');
    surface.getBoundingClientRect = () => ({ left: 20, top: 30, width: 120, height: 80 });
    assert.deepEqual(runtime.hitTestAtClientPoint({ surface, clientX: 40, clientY: 50 }), {
        treeId: 'touch_tree',
        nodeId: 'scroll_target',
        kind: 'scroll_area',
        box: { x: 0, y: 0, width: 120, height: 80 }
    });
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 200, clientY: 200 }), null);
    assert.equal(dom.window.document.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
});

const findNode = (node, id) => {
    if (node?.id === id) return node;
    for (const child of node?.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

test('all three Bevy menu trees stay outside the workspace backdrop capture', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        handedness: 'left',
        content: {
            toolbox: { children: ['view'] },
            view: { atome_tool: true, label: 'Vue', icon: 'view', tool_id: 'tool.view' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const flower = buildBevyUiFlowerTree({
        surface,
        center: { x: 400, y: 300 },
        items: [{ key: 'view', label: 'Vue', type: 'tool' }]
    });
    const contextual = buildAtomeContextualEditTree({
        surface,
        activeAtomeId: 'a',
        definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    for (const tree of [main, flower, contextual]) {
        const normalizedTree = normalizeBevyUiTree({ id: tree.id, tree });
        const records = projectBevyUiTreeRecords({
            tree: normalizedTree,
            treeId: tree.id,
            workspaceLayer: tree.layer
        });
        assert.equal(normalizedTree.presentation, true, tree.id);
        assert.ok(records.length > 0);
        assert.equal(records.every((record) => record.properties.presentation === true), true, tree.id);
    }
    const workspaceTree = normalizeBevyUiTree({
        id: 'workspace_fixture',
        tree: {
            id: 'workspace_fixture',
            root: { id: 'workspace_fixture_root', kind: 'panel', style: { size: [40, 40], background: [1, 1, 1, 1] } }
        }
    });
    const workspaceRecords = projectBevyUiTreeRecords({
        tree: workspaceTree,
        treeId: 'workspace_fixture',
        workspaceLayer: 'project'
    });
    assert.equal(workspaceTree.presentation, false);
    assert.equal(workspaceRecords.every((record) => record.properties.presentation === false), true);
});

test('Atome contextual edit stays on one clipped Bevy tree with handed rail and 3x slider', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const records = [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }, {
        id: 'b', properties: { left: 300, top: 70, width: 160, height: 90 }
    }];
    const input = {
        surface, records, editing: [{ atomeId: 'a' }, { atomeId: 'b' }], activeAtomeId: 'a',
        fullscreenAtomeId: 'a', definitions: [{ key: 'size', toolType: 'slider' }],
        sliderStateByKey: new Map([['size', { expanded: true }]])
    };
    const right = buildAtomeContextualEditTree(input);
    const rail = findNode(right.root, 'eve_bevy_panel_atome_contextual_edit_rail');
    const railBackground = findNode(right.root, 'eve_bevy_panel_atome_contextual_edit_rail_background');
    const contextualSurface = findNode(right.root, 'atome_contextual_edit_a_surface');
    const outline = findNode(right.root, 'atome_contextual_edit_a_outline');
    const footerBackground = findNode(right.root, 'atome_contextual_edit_a_footer_background');
    assert.deepEqual(rail.style.position, [740, 360]);
    assert.equal(railBackground, null, 'the rail is a transparent layout; only its tool surfaces own the shared shadow');
    assert.deepEqual(contextualSurface.style.position, [40, 50]);
    assert.deepEqual(contextualSurface.style.size, [200, 140]);
    assert.equal(contextualSurface.style.shadow, BEVY_MENU_TOKENS.surface.material.shadow);
    assert.equal(outline.style.shadow, undefined, 'the selection outline must not own the exterior shadow');
    assert.equal(footerBackground.style.shadow, undefined);
    assert.equal(rail.children.length, 1);
    assert.deepEqual(findNode(rail, 'atome_contextual_tool_size_background').style.size, [60, 180]);
    assert.equal(findNode(right.root, 'atome_contextual_edit_b_footer'), null);
    assert.equal(findNode(rail, 'atome_contextual_tool_size').style.size[1], 180);
    const left = buildAtomeContextualEditTree({ ...input, handedness: 'left' });
    assert.equal(findNode(left.root, 'eve_bevy_panel_atome_contextual_edit_rail').style.position[0], 0);
});

test('horizontal and vertical tools share the same material structure and relative layer contract', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        content: {
            toolbox: { children: ['detail'] },
            detail: { atome_tool: true, label: 'detail', icon: 'detail', tool_id: 'tool.detail' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const contextual = buildAtomeContextualEditTree({
        surface,
        activeAtomeId: 'a',
        records: [{ id: 'a', properties: { left: 20, top: 20, width: 100, height: 100 } }],
        definitions: [{ key: 'detail', label: 'detail', icon: 'detail', toolType: 'standard' }]
    });
    const mainShell = findNode(main.root, 'eve_bevy_ui_main_menu_tool_detail');
    const mainSurface = findNode(mainShell, `${mainShell.id}_background`);
    const mainIcon = findNode(mainShell, `${mainShell.id}_icon`);
    const contextualShell = findNode(contextual.root, 'atome_contextual_tool_detail');
    const contextualSurface = findNode(contextualShell, `${contextualShell.id}_background`);
    const contextualIcon = findNode(contextualShell, `${contextualShell.id}_icon`);
    for (const property of ['background', 'radius', 'shadow', 'backdrop']) {
        assert.deepEqual(mainSurface.style[property], contextualSurface.style[property], property);
    }
    assert.equal(mainShell.style.z_index - mainSurface.style.z_index, contextualShell.style.z_index - contextualSurface.style.z_index);
    assert.equal(mainIcon.style.z_index - mainSurface.style.z_index, contextualIcon.style.z_index - contextualSurface.style.z_index);
    assert.deepEqual(mainShell.style.background, BEVY_MENU_TOKENS.clear);
    assert.deepEqual(contextualShell.style.background, BEVY_MENU_TOKENS.clear);
});

test('contextual rail remains below the main menu at their shared boundary', () => {
    const surface = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const main = buildBevyMainMenuTree({
        surface,
        content: {
            toolbox: { children: ['detail'] },
            detail: { atome_tool: true, label: 'detail', icon: 'detail', tool_id: 'tool.detail' }
        },
        state: { activePaletteKey: '', latchedByToolId: new Map(), externalOpenByToolId: new Map() }
    });
    const contextual = buildAtomeContextualEditTree({
        surface, activeAtomeId: 'a', definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    const mainRecords = projectBevyUiTreeRecords({
        tree: normalizeBevyUiTree({ id: main.id, tree: main }), treeId: main.id, workspaceLayer: main.layer
    });
    const contextualRecords = projectBevyUiTreeRecords({
        tree: normalizeBevyUiTree({ id: contextual.id, tree: contextual }), treeId: contextual.id, workspaceLayer: contextual.layer
    });
    const mainSurface = mainRecords.find((record) => record.id.endsWith('_eve_bevy_ui_main_menu_tool_detail_background'));
    const contextualSurface = contextualRecords.find((record) => record.id.endsWith('_atome_contextual_tool_detail_background'));
    assert.ok(mainSurface);
    assert.ok(contextualSurface);
    assert.ok(
        mainSurface.properties.renderLayer > contextualSurface.properties.renderLayer,
        'the main menu must paint over any contextual shadow at their shared boundary'
    );
});

test('contextual palettes keep the semantic accent on the rail interior in both handedness modes', () => {
    const input = {
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        activeAtomeId: 'a',
        definitions: [{ key: 'mode', toolType: 'palette', children: [{ key: 'perform', toolType: 'standard' }] }],
        activePaletteKey: 'mode'
    };
    const right = buildAtomeContextualEditTree(input);
    const left = buildAtomeContextualEditTree({ ...input, handedness: 'left' });
    const rightAccent = findNode(right.root, 'atome_contextual_mode_accent');
    const leftAccent = findNode(left.root, 'atome_contextual_mode_accent');
    const verticalPosition = BEVY_MENU_TOKENS.paletteAccent.insetPx + BEVY_MENU_TOKENS.paletteAccent.verticalOffsetPx;
    assert.deepEqual(rightAccent.style.position, [BEVY_MENU_TOKENS.paletteAccent.insetPx, verticalPosition]);
    assert.deepEqual(leftAccent.style.position, [60 - BEVY_MENU_TOKENS.paletteAccent.insetPx - BEVY_MENU_TOKENS.paletteAccent.thicknessPx, verticalPosition]);
    assert.equal(rightAccent.style.size[1], 114);
    assert.equal(leftAccent.style.size[1], 114);
});

test('Flower palette accents are individual rounded top arcs', () => {
    const tree = buildBevyUiFlowerTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        items: [{ key: 'mode', type: 'palette' }, { key: 'view', type: 'palette' }]
    });
    const petals = tree.root.children.filter((node) => node.kind === 'icon_button');
    const accents = petals.map((petal) => findNode(petal, `${petal.id}_accent`));
    assert.equal(accents.length, 2);
    assert.equal(accents.every(Boolean), true);
    assert.equal(accents.every((accent) => accent.style.radius === BEVY_MENU_TOKENS.shape.flowerRadiusPx), true);
    assert.equal(accents.every((accent) => accent.style.position[1] === Math.max(BEVY_MENU_TOKENS.paletteAccent.insetPx, 6)), true);
});

test('Atome contextual footer follows projected media bounds and uses compact dark chrome', () => {
    const tree = buildAtomeContextualEditTree({
        surface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
        records: [{ id: 'media', properties: { left: 40, top: 50, width: 120 } }],
        geometryByAtomeId: new Map([['media', { x: 40, y: 50, width: 310, height: 420 }]]),
        editing: [{ atomeId: 'media', kind: 'image' }], activeAtomeId: 'media',
        definitions: [{ key: 'detail', label: 'detail', toolType: 'standard' }]
    });
    const footer = findNode(tree.root, 'atome_contextual_edit_media_footer');
    const background = findNode(tree.root, 'atome_contextual_edit_media_footer_background');
    const accent = findNode(tree.root, 'atome_contextual_edit_media_footer_accent');
    const contextualSurface = findNode(tree.root, 'atome_contextual_edit_media_surface');
    const footerHeight = BEVY_MENU_TOKENS.footerHeightPx;
    assert.deepEqual(footer.style.position, [40, 470]);
    assert.deepEqual(footer.style.size, [310, footerHeight]);
    assert.deepEqual(contextualSurface.style.position, [40, 50]);
    assert.deepEqual(contextualSurface.style.size, [310, 420 + footerHeight]);
    assert.deepEqual(contextualSurface.style.shadow, BEVY_MENU_TOKENS.surface.material.shadow);
    assert.deepEqual(background.style.background, BEVY_MENU_TOKENS.surface.material.background);
    assert.deepEqual(background.style.backdrop, BEVY_MENU_TOKENS.surface.material.backdrop);
    assert.deepEqual(accent.style.position, [40, 470]);
    assert.deepEqual(accent.style.size, [310, BEVY_MENU_TOKENS.footerAccentThicknessPx]);
    assert.deepEqual(accent.style.background, BEVY_MENU_TOKENS.footerAccentColor);
    assert.equal(accent.style.shadow, undefined);
    assert.equal(accent.style.border, undefined);
    assert.equal(accent.on, undefined);
    assert.ok(accent.style.z_index < footer.style.z_index);
    for (const id of [
        'atome_contextual_edit_media_footer_background',
        'atome_contextual_edit_media_footer',
        'atome_contextual_edit_media_resize_left',
        'atome_contextual_edit_media_close',
        'atome_contextual_edit_media_drag',
        'atome_contextual_edit_media_resize_right'
    ]) {
        assert.equal(findNode(tree.root, id).style.size[1], footerHeight, id);
        assert.equal(findNode(tree.root, id).style.shadow, undefined, id);
    }
    assert.deepEqual(findNode(tree.root, 'atome_contextual_edit_media_close_icon').style.size, [footerHeight, footerHeight]);
    assert.equal(findNode(tree.root, 'atome_contextual_edit_media_title').style.size[1], footerHeight);
    for (const id of [
        'atome_contextual_edit_media_resize_left_icon',
        'atome_contextual_edit_media_close_icon',
        'atome_contextual_edit_media_title',
        'atome_contextual_edit_media_resize_right_icon'
    ]) {
        assert.deepEqual(findNode(tree.root, id).image.tint, EVE_COMMON_SKIN_TOKENS.systemContent.gpu, id);
    }
    assert.deepEqual(findNode(tree.root, 'atome_contextual_edit_media_resize_left_icon').style.scale, [-1, 1]);
    assert.deepEqual(findNode(tree.root, 'atome_contextual_edit_media_resize_right_icon').style.scale, [1, 1]);
    for (const id of [
        'atome_contextual_edit_media_resize_left_icon',
        'atome_contextual_edit_media_resize_right_icon'
    ]) {
        const icon = findNode(tree.root, id);
        assert.equal(icon.image.source, BEVY_CORNER_RESIZE_GRIP_ICON_SOURCE, id);
        assert.equal(icon.image.fit, 'fill', id);
        assert.deepEqual(icon.style.size, [22, footerHeight], id);
        assert.equal(icon.style.position, undefined, id);
    }
    assert.ok(findNode(tree.root, 'atome_contextual_tool_detail_background'));
});

test('Atome contextual drag and homothetic resize stay above the main toolbox', () => {
    const limits = { viewportWidth: 800, viewportHeight: 600, mainMenuHeight: 52 };
    assert.deepEqual(contextualGestureProps({
        ...limits, gesture: { mode: 'drag', origin: { x: 40, y: 30, width: 200, height: 100 }, dx: 900, dy: 900 }
    }), { left: 600, top: 431 });
    assert.deepEqual(contextualGestureProps({
        ...limits, gesture: { mode: 'resize', edge: 'right', origin: { x: 0, y: 30, width: 100, height: 100 }, dx: 900, dy: 900 }
    }), { width: 501, height: 501 });
});

test('Atome contextual rail projects visible tool records inside the lateral rail', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const rgba = new Uint8Array([255, 255, 255, 255]);
    const runtime = createEveBevyUiRuntime({
        nativeUiEnabled: false,
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba }),
        requestFrame: (callback) => { callback(); return 1; }
    });
    const tree = buildAtomeContextualEditTree({
        surface, records: [{ id: 'a', properties: { left: 40, top: 50, width: 200, height: 120 } }],
        editing: [{ atomeId: 'a', kind: 'image' }], activeAtomeId: 'a',
        definitions: [{ key: 'detail', label: 'detail', icon: 'edit', toolType: 'standard' }]
    });
    await runtime.mountTree({ id: tree.id, surface, tree });
    const projected = getProjectSceneState('__eve_dashboard_workspace__');
    const tool = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_background'));
    const toolIcon = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_icon_image'));
    const toolLabel = projected.records.find((record) => record.id.includes('atome_contextual_tool_detail_label_text'));
    const footer = projected.records.find((record) => record.id.includes('atome_contextual_edit_a_footer_background'));
    const footerTitle = projected.records.find((record) => record.id.includes('atome_contextual_edit_a_title_text'));
    assert.deepEqual([tool.properties.left, tool.properties.top, tool.properties.width, tool.properties.height], [740, 480, 60, 60]);
    assert.deepEqual([footer.properties.left, footer.properties.top, footer.properties.width, footer.properties.height], [40, 170, 200, 20]);
    assert.ok(toolIcon.properties.renderLayer > tool.properties.renderLayer);
    assert.ok(toolLabel.properties.renderLayer > tool.properties.renderLayer);
    assert.ok(footerTitle.properties.renderLayer > footer.properties.renderLayer);
});

test('Atome contextual runtime keeps local edits and emits one canonical homothetic resize commit', async () => {
    const records = [{ id: 'a', properties: { left: 40, top: 30, width: 200, height: 100 } }, {
        id: 'b', properties: { left: 300, top: 40, width: 120, height: 80 }
    }];
    const scene = { project_id: 'project', records, text: null };
    const rendered = [];
    const intents = [];
    const runtime = createAtomeContextualEditRuntime({
        legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
        surfaceResolver: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
        bevyRuntimeResolver: () => ({
            mountTree: async ({ tree }) => rendered.push(tree),
            updateTree: async ({ tree }) => rendered.push(tree), unmountTree: async () => null
        }),
        emitSceneIntent: async ({ intent }) => { intents.push(intent); return { ok: true }; },
        findSceneByAtomeId: (id) => records.some((record) => record.id === id) ? scene : null,
        readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52,
        updateSceneRecord: async ({ atomeId, properties }) => Object.assign(records.find((record) => record.id === atomeId).properties, properties)
    });
    runtime.enter({ atomeId: 'a', kind: 'shape' });
    runtime.enter({ atomeId: 'b', kind: 'image' });
    runtime.exit({ atomeId: 'b' });
    assert.deepEqual(runtime.readState().editingAtomeIds, ['a']);
    assert.equal(runtime.readState().menuVisible, false);
    runtime.activate({ atomeId: 'a' });
    await runtime.render();
    const grip = findNode(rendered.at(-1).root, 'atome_contextual_edit_a_resize_left');
    grip.on.press({ client_x: 40, client_y: 130 });
    grip.on.drag({ delta_x: 20, delta_y: 0 });
    await runtime.render();
    assert.deepEqual(findNode(rendered.at(-1).root, 'atome_contextual_edit_a_footer').style.position, [60, 120]);
    assert.deepEqual(findNode(rendered.at(-1).root, 'atome_contextual_edit_a_footer').style.size, [180, 52 / 3]);
    grip.on.release();
    await Promise.resolve();
    assert.deepEqual(intents.map((intent) => intent.kind), ['resize.start', 'resize.move', 'resize.end']);
    assert.deepEqual(intents[2].props, { left: 60, width: 180, height: 90 });
    assert.equal(intents[2].commit, true);
});

test('Dashboard mode suspends contextual edit chrome and project return restores or clears its session', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const { window } = dom;
    window.requestAnimationFrame = () => 1;
    globalThis.window = window;
    globalThis.document = window.document;
    const records = [{ id: 'a', properties: { left: 20, top: 30, width: 100, height: 80 } }];
    const scene = { project_id: 'project_a', records, text: null };
    let mounts = 0;
    let unmounts = 0;
    try {
        window.__eveWorkspaceMode = { mode: 'project', projectId: 'project_a', transitioning: false, targetMode: '' };
        const runtime = createAtomeContextualEditRuntime({
            legacyState: {}, resolveDefinitions: () => [], invokeDefinition: async () => ({ ok: true }),
            surfaceResolver: () => window.document.getElementById('eve_surface_project'),
            bevyRuntimeResolver: () => ({
                mountTree: async () => { mounts += 1; }, updateTree: async () => null,
                unmountTree: async () => { unmounts += 1; }
            }),
            findSceneByAtomeId: (id) => id === 'a' ? scene : null,
            readSceneState: () => scene, hitTestScene: () => null, readMainMenuHeight: () => 52
        });
        runtime.install();
        runtime.enter({ atomeId: 'a', kind: 'image' });
        await runtime.render();
        assert.equal(mounts, 1);

        markDashboardWorkspaceMode();
        await runtime.render();
        assert.equal(runtime.readState().suspended, true);
        assert.equal(runtime.readState().menuVisible, false);
        assert.deepEqual(runtime.readState().editingAtomeIds, ['a']);
        assert.equal(unmounts, 1);

        markProjectWorkspaceMode('project_a');
        await runtime.render();
        assert.equal(runtime.readState().suspended, false);
        assert.deepEqual(runtime.readState().editingAtomeIds, ['a']);
        assert.equal(mounts, 2);

        markDashboardWorkspaceMode();
        markProjectWorkspaceMode('project_b');
        await runtime.render();
        assert.deepEqual(runtime.readState().editingAtomeIds, []);
        assert.equal(runtime.readState().menuVisible, false);
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        dom.window.close();
    }
});

test('canonical vertical slider is relative for touch and collapses on mouse cancel or stylus capture loss', async () => {
    const dom = new JSDOM('<!doctype html><button id="slider"></button>');
    const { window } = dom;
    Object.assign(globalThis, {
        window, document: window.document, Node: window.Node, Element: window.Element,
        HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
        CustomEvent: window.CustomEvent, Event: window.Event, MouseEvent: window.MouseEvent,
        getComputedStyle: window.getComputedStyle.bind(window)
    });
    class PointerEventShim extends window.MouseEvent {
        constructor(type, init = {}) {
            super(type, init);
            Object.defineProperties(this, {
                pointerId: { value: Number(init.pointerId || 1) },
                pointerType: { value: String(init.pointerType || 'touch') },
                button: { value: Number(init.button || 0) }
            });
        }
    }
    window.PointerEvent = PointerEventShim;
    globalThis.PointerEvent = PointerEventShim;
    const { mountIntuitionXSliderToolContent } = await import('../../atome/src/squirrel/components/tool_slider_builder.js');
    const button = document.getElementById('slider');
    mountIntuitionXSliderToolContent({
        button, orientation: 'vertical', collapsedWidthPx: 40, expandedWidthPx: 120,
        definition: { label: 'Size', sliderMin: 0, sliderMax: 100, sliderStep: 1, sliderValue: 50 }
    });
    const hitzone = button.querySelector('[data-role="eve_intuitionx-slider-hitzone"]');
    const input = button.querySelector('[data-role="eve_intuitionx-slider-input"]');
    const rect = { left: 0, top: 0, right: 18, bottom: 120, width: 18, height: 120 };
    hitzone.getBoundingClientRect = () => rect;
    input.getBoundingClientRect = () => rect;
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 7, clientY: 80 }));
    window.dispatchEvent(new PointerEventShim('pointermove', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '120px');
    assert.equal(input.value, '70');
    window.dispatchEvent(new PointerEventShim('pointerup', { bubbles: true, pointerId: 7, clientY: 56 }));
    assert.equal(button.style.height, '40px');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    window.dispatchEvent(new PointerEventShim('pointercancel', { bubbles: true, pointerId: 8, pointerType: 'mouse', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
    hitzone.dispatchEvent(new PointerEventShim('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    input.dispatchEvent(new PointerEventShim('lostpointercapture', { bubbles: true, pointerId: 9, pointerType: 'pen', clientY: 70 }));
    assert.equal(button.dataset.sliderExpanded, 'false');
});
