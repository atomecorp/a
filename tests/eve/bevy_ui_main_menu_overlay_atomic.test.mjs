import assert from 'node:assert/strict';
import { test } from 'vitest';

import { hydrateImageTree } from '../../eVe/domains/rendering/bevy_ui_image_runtime.js';
import { mapVirtualSceneNodeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { projectBevyUiTreeOverlay } from '../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js';
import { WORKSPACE_SCENE_LAYER_IDS } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import {
    clearAllProjectScenes,
    getProjectSceneState,
    reconcileProjectSceneRecordsByPrefix,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { normalizeAtomeRenderNode } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { RIBBON_TOKENS } from '../../eVe/intuition/ribbon/tokens.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';

const projectDom = () => installDom('<!doctype html><html><body><main id="project"></main></body></html>');

const findTreeNode = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
        const found = findTreeNode(child, id);
        if (found) return found;
    }
    return null;
};

const menuContent = () => ({
    toolbox: { children: ['home', 'find', 'capture', 'time', 'communicate', 'mode', 'view'] },
    home: { atome_tool: true, label: 'accueil', icon: 'home', tool_id: 'tool.home' },
    find: { atome_tool: true, label: 'trouver', icon: 'find', tool_id: 'tool.find' },
    capture: { atome_tool: true, label: 'enr.', icon: 'capture', tool_id: 'tool.capture' },
    time: { atome_tool: true, label: 'temps', icon: 'time', tool_id: 'tool.time' },
    communicate: { atome_tool: true, label: 'communication', icon: 'communicate', tool_id: 'tool.communicate' },
    mode: { atome_tool: true, label: 'mode', icon: 'mode', tool_id: 'tool.mode' },
    view: { atome_tool: true, label: 'Vue', icon: 'view', tool_id: 'tool.view' }
});

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
    assert.equal(menuRecords.length, 24);
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

test('BevyUI progressive overlay keeps mounted structure while adding detail records', async () => {
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

    assert.equal(records.get('__eve_bevy_ui_dashboard_bevy_ui___eve_dashboard_background')?.properties?.color, '#ff0000');
    assert.equal(records.get('__eve_bevy_ui_dashboard_bevy_ui___eve_dashboard_header_projects')?.properties?.text, 'Projects');
    assert.equal(secondIds.length, 2);
});

test('BevyUI main menu projects an inner accent across palette parents and visible children', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    const surface = getProjectSceneState('__eve_dashboard_workspace__').surface;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 720, width: 600, height: 720 });
    const content = {
        toolbox: { children: ['capture', 'find'] },
        capture: {
            atome_tool: true,
            label: 'capture',
            icon: 'capture',
            tool_id: 'tool.main.capture',
            type: 'palette',
            children: ['import']
        },
        import: { label: 'import', icon: 'import', tool_id: 'ui.capture.import', type: 'tool' },
        find: { atome_tool: true, label: 'find', icon: 'find', tool_id: 'tool.main.find', type: 'tool' }
    };
    const baseState = { latchedByToolId: new Map(), externalOpenByToolId: new Map() };
    const closedTree = buildBevyMainMenuTree({ content, surface, itemSize: 60, state: baseState });
    const parentAccentId = 'eve_bevy_ui_main_menu_tool_capture_palette_accent';

    assert.deepEqual(findTreeNode(closedTree.root, parentAccentId)?.style, {
        position: [0, 0],
        size: [60, RIBBON_TOKENS.mainMenuPaletteAccentHeightPx],
        background: RIBBON_TOKENS.mainMenuPaletteAccentColor,
        z_index: 3
    });
    assert.equal(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_capture__import_palette_accent'), null);
    assert.equal(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_find_palette_accent'), null);
    assert.equal(findTreeNode(closedTree.root, 'eve_bevy_ui_main_menu_tool_atome_palette_accent'), null);

    const expandedTree = buildBevyMainMenuTree({
        content,
        surface,
        itemSize: 60,
        state: { ...baseState, activePaletteKey: 'capture' }
    });
    const childAccentId = 'eve_bevy_ui_main_menu_tool_capture__import_palette_accent';
    assert.ok(findTreeNode(expandedTree.root, parentAccentId));
    assert.ok(findTreeNode(expandedTree.root, childAccentId));
    const paletteItemIds = new Set([
        'eve_bevy_ui_main_menu_tool_capture',
        'eve_bevy_ui_main_menu_tool_capture__import'
    ]);
    assert.deepEqual(
        findTreeNode(expandedTree.root, 'eve_bevy_ui_main_menu_bar').children
            .map((node) => node.id)
            .filter((id) => paletteItemIds.has(id)),
        ['eve_bevy_ui_main_menu_tool_capture__import', 'eve_bevy_ui_main_menu_tool_capture']
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
        ['eve_bevy_ui_main_menu_tool_capture', 'eve_bevy_ui_main_menu_tool_capture__import']
    );

    await projectBevyUiTreeOverlay({ tree: expandedTree, documentRef: dom.window.document, previousIds: [] });
    const records = getProjectSceneState('__eve_dashboard_workspace__').records;
    const projectedParent = records.find((record) => record.id.endsWith(`_${parentAccentId}`));
    const projectedChild = records.find((record) => record.id.endsWith(`_${childAccentId}`));
    assert.equal(projectedParent?.properties?.width, 60);
    assert.equal(projectedParent?.properties?.height, 2);
    assert.equal(projectedParent?.properties?.color, 'rgba(138,206,255,0.65)');
    assert.equal(projectedChild?.properties?.height, 2);
    assert.equal(projectedChild?.properties?.color, projectedParent?.properties?.color);
    assert.equal(Math.abs(projectedParent.properties.left - projectedChild.properties.left), 60);
    assert.equal(projectedParent.properties.top, projectedChild.properties.top);
});

test('BevyUI main menu overlay follows the foreground project instead of the dashboard workspace', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: 'project_left',
        records: [{ id: 'left_atom', type: 'shape', properties: { left: 4, top: 4, width: 20, height: 20, color: '#ff0000' } }],
        host,
        compositor: createTestCompositor()
    });
    const surface = getProjectSceneState('project_left').surface;
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
    const firstIds = await projectBevyUiTreeOverlay({ tree: hydrated, documentRef: dom.window.document, previousIds: [] });
    assert.equal(firstIds.length > 0, true);
    assert.equal(
        getProjectSceneState('project_left').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        true
    );
    assert.equal(getProjectSceneState('__eve_dashboard_workspace__'), null);

    await renderProjectScene({
        projectId: 'project_right',
        records: [{ id: 'right_atom', type: 'shape', properties: { left: 8, top: 8, width: 20, height: 20, color: '#00ff00' } }],
        host,
        compositor: createTestCompositor()
    });
    const secondIds = await projectBevyUiTreeOverlay({ tree: hydrated, documentRef: dom.window.document, previousIds: firstIds });
    assert.deepEqual(secondIds, firstIds);
    assert.equal(
        getProjectSceneState('project_right').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        true
    );
    assert.equal(
        getProjectSceneState('project_left').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        false
    );
});

test('BevyUI main menu overlay projects into the target project during workspace transition', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: 'project_left',
        records: [{ id: 'left_atom', type: 'shape', properties: { left: 4, top: 4, width: 20, height: 20, color: '#ff0000' } }],
        host,
        compositor: createTestCompositor()
    });
    dom.window.__eveWorkspaceMode = {
        mode: 'transition',
        projectId: 'project_right',
        transitioning: true,
        targetMode: 'project'
    };
    const surface = getProjectSceneState('project_left').surface;
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
    const ids = await projectBevyUiTreeOverlay({ tree, documentRef: dom.window.document, previousIds: [] });

    assert.equal(ids.length, 24);
    assert.equal(
        getProjectSceneState('project_right').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        true
    );
    assert.equal(
        getProjectSceneState('project_left').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        false
    );
});

test('BevyUI overlay carries a petal shadow through to the projected shape material', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    const shadow = {
        color: [0, 0, 0, 0.38],
        blur: 14,
        spread: 1,
        offset: [0, 5]
    };
    const backdrop = { blurPx: 12, tint: [0.36, 0.4, 0.47, 0.58] };
    await projectBevyUiTreeOverlay({
        tree: {
            id: 'eve_bevy_ui_flower',
            root: {
                id: 'root',
                kind: 'root',
                style: { size: [200, 160] },
                children: [{
                    id: 'petal_palette',
                    kind: 'button',
                    style: {
                        position: [20, 24],
                        size: [58, 58],
                        background: [0.2, 0.3, 0.4, 1],
                        radius: 3,
                        shadow,
                        backdrop
                    }
                }]
            }
        },
        documentRef: dom.window.document,
        previousIds: []
    });
    const record = getProjectSceneState('__eve_dashboard_workspace__').records.find((entry) => (
        entry.id === '__eve_bevy_ui_eve_bevy_ui_flower_petal_palette'
    ));

    assert.deepEqual(record?.properties?.material?.shadow, {
        color: [0, 0, 0, 0.38],
        blur: 14,
        spread: 1,
        offsetX: 0,
        offsetY: 5
    });
    assert.deepEqual(record?.properties?.material?.backdrop, {
        blur_px: 12,
        tint: [0.36, 0.4, 0.47, 0.58]
    });
    assert.equal(record?.properties?.presentation, true);
    const flowerRecords = getProjectSceneState('__eve_dashboard_workspace__').records.filter((entry) => (
        entry.id.startsWith('__eve_bevy_ui_eve_bevy_ui_flower_')
    ));
    assert.ok(flowerRecords.length > 0);
    assert.ok(
        flowerRecords.every((entry) => entry.properties?.presentation === true),
        'every Flower child must remain outside the workspace backdrop capture'
    );
    assert.deepEqual(
        mapVirtualSceneNodeToBevyPayload(normalizeAtomeRenderNode(record)).shadow,
        {
            color: [0, 0, 0, 0.38],
            blur: 14,
            spread: 1,
            offset_x: 0,
            offset_y: 5
        }
    );
    assert.deepEqual(
        mapVirtualSceneNodeToBevyPayload(normalizeAtomeRenderNode(record)).backdrop,
        { blur_px: 12, tint: [0.36, 0.4, 0.47, 0.58] }
    );
});
