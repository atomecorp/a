import assert from 'node:assert/strict';
import { test } from "vitest";
import { hydrateImageTree } from "../../eVe/domains/rendering/bevy_ui_image_runtime.js";



import { patchBevyUiTreeMotion, projectBevyUiTreeOverlay } from "../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js";
import { WORKSPACE_SCENE_LAYER_IDS } from "../../eVe/domains/rendering/workspace_scene_layers.js";
import { clearAllProjectScenes, getProjectSceneState, reconcileProjectSceneRecordsByPrefix, renderProjectScene } from "../../eVe/domains/rendering/project_scene_runtime.js";

import { buildBevyMainMenuTree } from "../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js";
import { BEVY_MENU_TOKENS, resolveBevyMenuFamilyColor } from "../../eVe/intuition/ribbon/bevy_ui_menu_surface.js";

import { createTestCompositor, installDom } from "./unified_rendering_test_helpers.mjs";
import { overlayMenuContent as menuContent, findNode as findTreeNode } from "./bevy_ui_main_menu_test_helpers.mjs";
const projectDom = () => installDom('<!doctype html><html><body><main id="project"></main></body></html>');
test('BevyUI main menu overlay projects the 70px menu atomically without dropping records or effects', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    const dashboardEffects = [{
        id: '__eve_dashboard_backdrop_blur',
        kind: 'backdrop_blur',
        bounds: { x: 0, y: 0, width: 1200, height: 720 },
        sourceLayerMax: 4,
        targetLayer: 4,
        radius: 24,
        downsample: 0.5
    }];
    const dashboardRecords = [{
        id: '__eve_dashboard_card_media_projects_alpha',
        type: 'image',
        properties: {
            left: 16,
            top: 20,
            width: 128,
            height: 72,
            source: '/api/projects/alpha/preview.png',
            media_width: 640,
            media_height: 360
        }
    }, {
        id: '__eve_dashboard_card_title_projects_alpha',
        type: 'text',
        properties: {
            left: 16,
            top: 96,
            width: 128,
            height: 24,
            text: 'Alpha Project',
            color: '#ffffff',
            text_style: { font_size: 14, font_weight: 700 }
        }
    }];
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    await reconcileProjectSceneRecordsByPrefix({
        projectId: '__eve_dashboard_workspace__',
        prefix: '__eve_dashboard_',
        records: dashboardRecords,
        changedRecords: dashboardRecords,
        effects: dashboardEffects,
        host,
        keepForeground: false
    });
    const surface = getProjectSceneState('__eve_dashboard_workspace__').surface;
    surface.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1124,
        bottom: 853,
        width: 1124,
        height: 853
    });
    const tree = buildBevyMainMenuTree({
        content: menuContent(),
        surface,
        itemSize: 70,
        state: { latchedByToolId: new Map(), externalOpenByToolId: new Map() },
        handlers: {}
    });
    const hydrated = await hydrateImageTree({
        tree,
        surface,
        imageResolverFactory: () => async (node) => ({
            width: Math.max(1, Math.round(node.bounds.width * 2)),
            height: Math.max(1, Math.round(node.bounds.height * 2)),
            rgba: [211, 211, 211, 255]
        })
    });
    await projectBevyUiTreeOverlay({ tree: hydrated, documentRef: dom.window.document, previousIds: [] });
    const state = getProjectSceneState('__eve_dashboard_workspace__');
    const recordsById = new Map(state.records.map((record) => [record.id, record]));
    const menuRecords = state.records.filter((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_'));
    const projectedDashboardRecords = state.records.filter((record) => record.properties?.layer === 'dashboard');
    const iconRecords = menuRecords.filter((record) => String(record.id || '').endsWith('_icon_image'));
    assert.deepEqual(state.effects, dashboardEffects);
    assert.equal(recordsById.has('__eve_dashboard_card_media_projects_alpha'), true);
    assert.equal(recordsById.has('__eve_dashboard_card_title_projects_alpha'), true);
    assert.equal(recordsById.get('__eve_dashboard_card_title_projects_alpha')?.properties?.text, 'Alpha Project');
    // Each tool projects its ground, its label and its glyph; Atome projects its glyph alone.
    assert.equal(menuRecords.length, (iconRecords.length - 1) * 3 + 1);
    assert.equal(iconRecords.length, 8);
    assert.equal(menuRecords.every((record) => record.parent_id || record.properties?.parent_id), true);
    assert.equal(menuRecords.every((record) => record.properties?.layer === 'mainMenu'), true);
    assert.equal(menuRecords.every((record) => Number(record.properties?.renderLayer) >= 1200), true);
    assert.equal(menuRecords.every((record) => Number(record.properties?.renderLayer) < 1800), true);
    assert.equal(projectedDashboardRecords.every((record) => Number(record.properties?.renderLayer) >= 600 && Number(record.properties?.renderLayer) < 1100), true);
    assert.equal(
        menuRecords.some((record) => record.parent_id === WORKSPACE_SCENE_LAYER_IDS.mainMenu || record.properties?.parent_id === WORKSPACE_SCENE_LAYER_IDS.mainMenu),
        true,
        'main menu overlay records must attach to the stable main menu layer root'
    );
    assert.equal(iconRecords.every((record) => record.bevyTexture?.rgba?.length === 4), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_view_icon_image'), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_capture_label_text'), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_atome_icon_image'), true);
});
test('BevyUI dashboard overlay replaces its complete snapshot atomically', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    const shapeRecord = (color) => ({
        id: '__eve_dashboard_background',
        type: 'shape',
        properties: { left: 0, top: 0, width: 400, height: 200, color }
    });
    const structuralTree = {
        id: 'dashboard_bevy_ui',
        root: {
            id: 'root',
            kind: 'root',
            style: { size: [400, 200] },
            children: [{
                id: '__eve_dashboard_background',
                kind: 'panel',
                style: { size: [400, 200] },
                overlayRecord: shapeRecord('#ff0000')
            }]
        }
    };
    const firstIds = await projectBevyUiTreeOverlay({
        tree: structuralTree,
        documentRef: dom.window.document,
        previousIds: []
    });
    const completeTree = {
        ...structuralTree,
        preserveMountedOverlayRecords: true,
        root: {
            ...structuralTree.root,
            children: [...structuralTree.root.children.map((node) => ({
                ...node,
                overlayRecord: shapeRecord('#0000ff')
            })), {
                id: '__eve_dashboard_header_projects',
                kind: 'text',
                style: { position: [8, 8], size: [120, 24] },
                text: 'Projects',
                overlayRecord: {
                    id: '__eve_dashboard_header_projects',
                    type: 'text',
                    properties: { left: 8, top: 8, width: 120, height: 24, text: 'Projects', color: '#ffffff' }
                }
            }]
        }
    };
    const secondIds = await projectBevyUiTreeOverlay({
        tree: completeTree,
        documentRef: dom.window.document,
        previousIds: firstIds
    });
    const records = new Map(getProjectSceneState('__eve_dashboard_workspace__').records.map((record) => [record.id, record]));
    assert.equal(records.get('__eve_bevy_ui_dashboard_bevy_ui___eve_dashboard_background')?.properties?.color, '#0000ff');
    assert.equal(records.get('__eve_bevy_ui_dashboard_bevy_ui___eve_dashboard_header_projects')?.properties?.text, 'Projects');
    assert.equal(secondIds.length, 2);
});
test('BevyUI main menu marks each palette group with its folded corner and family glass', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    const compositorCalls = [];
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [{
            id: '__eve_dashboard_sentinel',
            type: 'shape',
            properties: { left: 8, top: 8, width: 20, height: 20, color: '#123456' }
        }],
        host,
        compositor: createTestCompositor(compositorCalls)
    });
    const surface = getProjectSceneState('__eve_dashboard_workspace__').surface;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 720, width: 600, height: 720 });
    const content = {
        toolbox: { children: ['capture', 'mode', 'view', 'find'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import', 'photo']
        },
        import: { label: 'import', icon: 'import', tool_id: 'ui.capture.import', type: 'tool' },
        photo: { label: 'photo', icon: 'photo', tool_id: 'ui.capture.photo', type: 'tool' },
        mode: { atome_tool: true, label: 'mode', icon: 'mode', tool_id: 'tool.main.mode', type: 'palette', children: [] },
        view: { atome_tool: true, label: 'view', icon: 'view', tool_id: 'tool.main.view', type: 'palette', children: [] },
        find: { atome_tool: true, label: 'find', icon: 'find', tool_id: 'tool.main.find', type: 'tool' }
    };
    const baseState = { latchedByToolId: new Map(), externalOpenByToolId: new Map() };
    const closedTree = buildBevyMainMenuTree({ content, surface, itemSize: 60, state: baseState });
    // A palette group is marked by its folded corner (`_corner`) and its family's glass: no accent capsule, no backplate.
    const allIds = (node, acc = []) => { if (node) { acc.push(node.id); (node.children || []).forEach((child) => allIds(child, acc)); } return acc; };
    const captureCornerId = 'eve_bevy_ui_main_menu_tool_capture_corner';
    const familyOf = { capture: 'creation', mode: 'system', view: 'consultation' };
    assert.deepEqual(allIds(closedTree.root).filter((id) => /_(corner|accent|backplate)$/.test(id)).sort(),
        Object.keys(familyOf).map((key) => `eve_bevy_ui_main_menu_tool_${key}_corner`).sort());
    for (const [key, family] of Object.entries(familyOf)) {
        const corner = findTreeNode(closedTree.root, `eve_bevy_ui_main_menu_tool_${key}_corner`);
        assert.match(corner.image.source, /^data:image\/svg\+xml/, `${key}:corner`);
        assert.deepEqual(findTreeNode(closedTree.root, `eve_bevy_ui_main_menu_tool_${key}_background`).style.backdrop.tint,
            resolveBevyMenuFamilyColor({ family }), `${key}:family glass`);
    }
    assert.equal(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_find_corner'), null);
    assert.equal(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_atome_corner'), null);
    assert.deepEqual(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_find_background').style.backdrop.tint,
        BEVY_MENU_TOKENS.surface.material.backdrop.tint, 'a plain tool keeps the common glass');

    const expandedTree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: { ...baseState, activePaletteKey: 'capture' }
    });
    for (const id of [
        'eve_bevy_ui_main_menu_tool_atome',
        'eve_bevy_ui_main_menu_tool_find',
        'eve_bevy_ui_main_menu_tool_mode',
        'eve_bevy_ui_main_menu_tool_view'
    ]) {
        const closedStyle = findTreeNode(closedTree.root, `${id}_background`).style;
        const expandedStyle = findTreeNode(expandedTree.root, `${id}_background`).style;
        assert.deepEqual(expandedStyle.background, closedStyle.background, `${id}:background`);
        assert.deepEqual(expandedStyle.shadow, closedStyle.shadow, `${id}:shadow`);
        assert.deepEqual(expandedStyle.backdrop, closedStyle.backdrop, `${id}:backdrop`);
        assert.equal(expandedStyle.z_index, closedStyle.z_index, `${id}:surface-layer`);
    }
    // The open palette keeps its parent's fold; its children are plain choices, never folded nor accented.
    assert.ok(findTreeNode(expandedTree.root, captureCornerId));
    assert.deepEqual(findTreeNode(expandedTree.root, 'eve_bevy_ui_main_menu_tool_capture').style.translation, [0, 2],
        'the open parent takes the selected look: a sunk translation');
    assert.deepEqual(allIds(expandedTree.root).filter((id) => /_(accent|backplate)$/.test(id)), []);
    assert.equal(findTreeNode(expandedTree.root, 'eve_bevy_ui_main_menu_tool_capture__import_corner'), null);
    const paletteItemIds = new Set([
        'eve_bevy_ui_main_menu_tool_capture',
        'eve_bevy_ui_main_menu_tool_capture__import',
        'eve_bevy_ui_main_menu_tool_capture__photo'
    ]);
    assert.deepEqual(
        findTreeNode(expandedTree.root, 'eve_bevy_ui_main_menu_bar').children
            .map((node) => node.id)
            .filter((id) => paletteItemIds.has(id)),
        [
            'eve_bevy_ui_main_menu_tool_capture__photo',
            'eve_bevy_ui_main_menu_tool_capture__import',
            'eve_bevy_ui_main_menu_tool_capture'
        ]
    );
    const leftExpandedTree = buildBevyMainMenuTree({
        content,
        surface,
        handedness: 'left',
        itemSize: 60,
        state: { ...baseState, activePaletteKey: 'capture' }
    });
    assert.deepEqual(
        findTreeNode(leftExpandedTree.root, 'eve_bevy_ui_main_menu_bar').children
            .map((node) => node.id)
            .filter((id) => paletteItemIds.has(id)),
        [
            'eve_bevy_ui_main_menu_tool_capture',
            'eve_bevy_ui_main_menu_tool_capture__import',
            'eve_bevy_ui_main_menu_tool_capture__photo'
        ]
    );

    compositorCalls.length = 0;
    const closedIds = await projectBevyUiTreeOverlay({ tree: closedTree, documentRef: dom.window.document, previousIds: [] });
    assert.equal(compositorCalls.some((call) => call.type === 'run'), false,
        'a first atomic BevyUI prefix must not rebuild the resident cold scene');
    assert.equal(compositorCalls.filter((call) => Array.isArray(call.ops)).length, 1,
        'a first atomic BevyUI prefix must spawn in one direct renderer batch');
    const pressedTree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: { ...baseState, pressedId: 'eve_bevy_ui_main_menu_tool_capture' }
    });
    compositorCalls.length = 0;
    const pressedIds = await projectBevyUiTreeOverlay({
        tree: pressedTree,
        documentRef: dom.window.document,
        previousIds: closedIds
    });
    const pressedBatches = compositorCalls.filter((call) => Array.isArray(call.ops));
    assert.equal(pressedBatches.length, 1, 'same-id pressed feedback must stay on the prefix batch');
    assert.equal(compositorCalls.some((call) => call.type === 'run'), false, 'pressed feedback must not rebuild the Dashboard');
    assert.equal(getProjectSceneState('__eve_dashboard_workspace__').projection?.render_result?.direct_prefix, true);
    compositorCalls.length = 0;
    const expandedIds = await projectBevyUiTreeOverlay({
        tree: expandedTree,
        documentRef: dom.window.document,
        previousIds: pressedIds
    });
    assert.equal(closedIds.every((id) => expandedIds.includes(id)), true);
    // The open parent keeps its own records (its state is a sunk translation, not a new shell paint).
    assert.deepEqual(
        expandedIds.filter((id) => !closedIds.includes(id)),
        ['photo', 'import'].flatMap((key) => ['background', 'label_text', 'icon_image'].map((part) => (
            `__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_capture__${key}_${part}`))),
        'only the two new palette controls may spawn'
    );
    const openingBatches = compositorCalls.filter((call) => Array.isArray(call.ops));
    const openingOps = openingBatches.flatMap((call) => call.ops);
    assert.equal(openingBatches.length, 1, 'moving records and new palette records must share one renderer batch');
    assert.equal(openingOps.some((operation) => operation.type === 'spawn'), true);
    assert.equal(openingOps.some((operation) => operation.type === 'transform' || operation.type === 'style'), true);
    const projectedState = getProjectSceneState('__eve_dashboard_workspace__');
    assert.equal(
        projectedState.projection?.render_result?.direct_prefix,
        true,
        'palette opening must add and move only the main-menu prefix instead of rebuilding the Dashboard scene'
    );
    const records = projectedState.records;
    assert.equal(records.some((record) => record.id.endsWith(`_${captureCornerId}_image`) || record.id.endsWith(`_${captureCornerId}`)), true,
        'the open palette projects its folded corner');
    assert.equal(records.some((record) => /_(accent|backplate)(_|$)/.test(record.id)), false);

    compositorCalls.length = 0;
    const motionResult = await patchBevyUiTreeMotion({
        treeId: 'eve_bevy_ui_main_menu',
        documentRef: dom.window.document,
        updates: [{
            nodeId: 'eve_bevy_ui_main_menu_tool_capture__import_background',
            position: [12, 640],
            opacity: 1
        }]
    });
    assert.equal(motionResult.ok, true);
    assert.equal(motionResult.batched, true, 'palette frames must stay on the direct GPU motion path');
    assert.equal(
        compositorCalls.filter((call) => Array.isArray(call.ops)).length,
        1,
        'one motion sample must produce one renderer batch without structural reconciliation'
    );

    compositorCalls.length = 0;
    const restoredIds = await projectBevyUiTreeOverlay({
        tree: closedTree,
        documentRef: dom.window.document,
        previousIds: expandedIds
    });
    const closingBatches = compositorCalls.filter((call) => Array.isArray(call.ops));
    const closingOps = closingBatches.flatMap((call) => call.ops);
    const restoredState = getProjectSceneState('__eve_dashboard_workspace__');
    assert.equal(closingBatches.length, 1, 'palette closing must stay one atomic renderer batch');
    assert.equal(
        closingOps.filter((operation) => operation.type === 'despawn').length,
        6,
        'closing removes the two palette controls'
    );
    assert.equal(closingOps.some((operation) => String(operation.id || operation.payload?.id || '').includes('__eve_dashboard_sentinel')), false);
    assert.equal(restoredState.projection?.render_result?.direct_prefix, true);
    assert.equal(restoredState.records.some((record) => record.id === '__eve_dashboard_sentinel'), true);
    assert.deepEqual(restoredIds, closedIds);
});
