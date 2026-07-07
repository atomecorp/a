import assert from 'node:assert/strict';
import { test } from 'vitest';

import { hydrateImageTree } from '../../eVe/domains/rendering/bevy_ui_image_runtime.js';
import { projectBevyUiTreeOverlay } from '../../eVe/domains/rendering/bevy_ui_project_overlay_runtime.js';
import {
    clearAllProjectScenes,
    getProjectSceneState,
    reconcileProjectSceneRecordsByPrefix,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { buildBevyMainMenuTree } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';

const projectDom = () => installDom('<!doctype html><html><body><main id="project"></main></body></html>');

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
    const iconRecords = menuRecords.filter((record) => String(record.id || '').endsWith('_icon_image'));

    assert.deepEqual(state.effects, dashboardEffects);
    assert.equal(recordsById.has('__eve_dashboard_card_media_projects_alpha'), true);
    assert.equal(menuRecords.length, 27);
    assert.equal(iconRecords.length, 9);
    assert.equal(iconRecords.every((record) => record.bevyTexture?.rgba?.length === 4), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_view_icon_image'), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_capture_label_text'), true);
    assert.equal(recordsById.has('__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_atome_icon_image'), true);
});
