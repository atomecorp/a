import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords } from '../../eVe/domains/dashboard/dashboard_records.js';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { normalizeRenderAtoms } from '../../eVe/domains/rendering/render_atom.js';
import { recordsForBevyProjection } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import {
    clearAllProjectScenes,
    clearProjectSceneVisuals,
    emitProjectSceneIntent,
    getProjectSceneState,
    reconcileProjectSceneRecordsByPrefix,
    renderProjectScene,
    setProjectSceneUiIntentHandler,
    updateProjectSceneRecord,
    updateProjectSceneRecords
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { sceneState } from '../../eVe/domains/rendering/project_scene_state.js';
import { createRenderScene, hitTestRenderScene } from '../../eVe/domains/rendering/scene_graph.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import {
    createTestCompositor,
    finalSetCommit,
    installDom,
    makeMixedRecords,
    makeRecord,
    nextTick,
    visibleProjectVideos
} from './unified_rendering_test_helpers.mjs';

const projectDom = () => installDom('<!doctype html><html><body><main id="project"></main></body></html>');

const bevyOpsFromCalls = (calls = []) => calls.flatMap((call) => (
    call.type === 'ops'
        ? (Array.isArray(call.ops) ? call.ops : [])
        : [{ type: call.type, id: call.id, payload: call.payload }]
));

const dashboardCategories = Object.freeze([
    { id: 'news', label_key: 'eve.dashboard.news', color: '#ff5252', icon_id: 'news' },
    { id: 'calendar', label_key: 'eve.dashboard.calendar', color: '#ffa726', icon_id: 'calendar' }
]);

const buildDashboardHitScene = () => {
    const layout = createDashboardLayout({
        width: 1200,
        height: 800,
        toolboxHeight: 74,
        categories: dashboardCategories,
        itemsByCategory: new Map(),
        tokens: DASHBOARD_VISUAL_TOKENS
    });
    const records = buildDashboardRecords({ layout, tokens: DASHBOARD_VISUAL_TOKENS });
    const virtualScene = createVirtualSceneTree(recordsForBevyProjection(records), {
        id: 'dashboard_selection_contract',
        selectedIds: new Set()
    });
    const scene = createRenderScene(normalizeRenderAtoms(records), {
        id: 'dashboard_selection_contract',
        layerOrderById: new Map(virtualScene.nodes.map((node) => [String(node.id), node.renderLayer]))
    });
    return { layout, records, scene };
};

test('Foreground project render claims the canonical project layer when host is omitted', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="view"><canvas id="eve_surface_project"></canvas><section id="project_view_project_hostless"></section></main></body></html>');
    sceneState.foregroundProjectId = 'project_hostless';
    const calls = [];

    await renderProjectScene({
        projectId: 'project_hostless',
        records: [makeRecord('hostless_atom', 'shape', 1)],
        compositor: createTestCompositor(calls)
    });

    const layer = dom.window.document.getElementById('project_view_project_hostless');
    const canvas = dom.window.document.getElementById('eve_surface_project');
    assert.equal(canvas.parentElement, layer);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
    assert.equal(calls.length > 0, true);
});

const assertHiddenDecodeVideoContract = (documentRef, expectedCount) => {
    const root = documentRef.getElementById('eve_bevy_video_decode_root');
    assert.ok(root, 'source-backed project video must use the hidden Bevy decode root');
    assert.equal(root.getAttribute('aria-hidden'), 'true');
    assert.equal(root.style.opacity, '0');
    assert.equal(root.style.pointerEvents, 'none');
    assert.equal(root.style.width, '1px');
    assert.equal(root.style.height, '1px');
    const videos = Array.from(root.querySelectorAll('video'));
    assert.equal(videos.length, expectedCount);
    videos.forEach((video) => {
        assert.equal(video.getAttribute('aria-hidden'), 'true');
        assert.equal(video.style.opacity, '0');
        assert.equal(video.style.pointerEvents, 'none');
        assert.equal(video.style.width, '1px');
        assert.equal(video.style.height, '1px');
    });
};

test('Project scene runtime renders heterogeneous Atomes through one project canvas', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    const projection = await renderProjectScene({
        projectId: 'project_scene_a',
        projectRevision: 9,
        records: makeMixedRecords(100, 'scene_atom'),
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(calls)
    });
    await nextTick();

    assert.equal(projection.ok, true);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome').length, 0);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome-text,img,audio,svg').length, 0);
    assert.equal(visibleProjectVideos(dom.window.document).length, 0);
    assert.equal(projection.scene.atoms.length, 100);
    assert.equal(calls.filter((call) => call.type === 'run').length, 1);
    assert.equal(calls.find((call) => call.type === 'run').initialNodes.nodes.length, 100);
    const initialNodes = calls.find((call) => call.type === 'run').initialNodes.nodes;
    const videoNodeCount = initialNodes.filter((node) => node.kind === 'video').length;
    assert.equal(videoNodeCount > 0, true);
    assertHiddenDecodeVideoContract(dom.window.document, videoNodeCount);
    assert.equal(calls.some((call) => call.type === 'resource' && call.payload?.texture), false);
    await nextTick(70);
    assert.equal(calls.some((call) => call.type === 'resource' && call.payload?.texture), true);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome-text,img,audio,svg').length, 0);
    assert.equal(getProjectSceneState('project_scene_a').record_count, 100);
});

test('Project scene record updates preserve bounded DOM and avoid HTMLElement return contracts', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    await renderProjectScene({
        projectId: 'project_scene_b',
        records: [makeRecord('existing_atom', 'image', 1)],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });
    const updated = await updateProjectSceneRecord({
        projectId: 'project_scene_b',
        record: makeRecord('new_atom', 'text', 2),
        host: dom.window.document.getElementById('project')
    });

    assert.equal(updated.ok, true);
    assert.equal(updated instanceof dom.window.HTMLElement, false);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
    assert.equal(getProjectSceneState('project_scene_b').scene.atoms.length, 2);
});

test('Late project renders preserve Molecule overlays and active same-project dashboard records only', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    const previousDashboardRuntime = dom.window.eveDashboardBevyUiRuntime;
    await renderProjectScene({
        projectId: 'project_ephemeral_overlay',
        records: [makeRecord('project_atom', 'shape', 1)],
        host,
        compositor: createTestCompositor()
    });
    await updateProjectSceneRecords({
        projectId: 'project_ephemeral_overlay',
        records: [
            {
                id: '__eve_dashboard_background',
                type: 'shape',
                properties: { left: 0, top: 0, width: 320, height: 180, color: '#111111' }
            },
            {
                id: 'mol:playhead',
                type: 'shape',
                properties: { left: 4, top: 0, width: 2, height: 180, color: '#ffffff' }
            }
        ]
    });
    await renderProjectScene({
        projectId: 'project_ephemeral_overlay',
        records: [makeRecord('project_atom', 'shape', 2)],
        host,
        preserveEphemeralRecords: true
    });
    const ids = new Set(getProjectSceneState('project_ephemeral_overlay').records.map((record) => record.id));

    assert.equal(ids.has('project_atom'), true);
    assert.equal(ids.has('__eve_dashboard_background'), false);
    assert.equal(ids.has('mol:playhead'), true);
    dom.window.eveDashboardBevyUiRuntime = { state: { active: true, projectId: 'project_ephemeral_overlay' } };
    await updateProjectSceneRecords({
        projectId: 'project_ephemeral_overlay',
        records: [{
            id: '__eve_dashboard_background',
            type: 'shape',
            properties: { left: 0, top: 0, width: 320, height: 180, color: '#111111' }
        }]
    });
    await renderProjectScene({
        projectId: 'project_ephemeral_overlay',
        records: [makeRecord('project_atom', 'shape', 3)],
        host,
        preserveEphemeralRecords: true
    });
    const activeIds = new Set(getProjectSceneState('project_ephemeral_overlay').records.map((record) => record.id));
    assert.equal(activeIds.has('__eve_dashboard_background'), true);
    if (previousDashboardRuntime === undefined) delete dom.window.eveDashboardBevyUiRuntime;
    else dom.window.eveDashboardBevyUiRuntime = previousDashboardRuntime;
});

test('Dashboard prefix reconciliation removes orphan records from runtime and Bevy projection', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: 'project_dashboard_reconcile',
        records: [makeRecord('project_atom', 'shape', 1)],
        host,
        compositor: createTestCompositor(calls)
    });
    await updateProjectSceneRecords({
        projectId: 'project_dashboard_reconcile',
        records: [
            {
                id: '__eve_dashboard_orphan_card',
                type: 'shape',
                properties: { left: 10, top: 10, width: 80, height: 40, color: '#003300' }
            },
            makeRecord('mol:playhead', 'shape', 2)
        ]
    });
    assert.equal(
        getProjectSceneState('project_dashboard_reconcile').records.some((record) => record.id === '__eve_dashboard_orphan_card'),
        true
    );

    calls.length = 0;
    await reconcileProjectSceneRecordsByPrefix({
        projectId: 'project_dashboard_reconcile',
        prefix: '__eve_dashboard_',
        records: [],
        changedRecords: [],
        effects: []
    });
    const ids = new Set(getProjectSceneState('project_dashboard_reconcile').records.map((record) => record.id));
    const despawned = bevyOpsFromCalls(calls).filter((op) => op.type === 'despawn').map((op) => op.id);

    assert.equal(ids.has('__eve_dashboard_orphan_card'), false);
    assert.equal(ids.has('project_atom'), true);
    assert.equal(ids.has('mol:playhead'), true);
    assert.deepEqual(despawned, ['__eve_dashboard_orphan_card']);
});

test('Neutral Dashboard prefix reconciliation claims the shared canvas foreground', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    const calls = [];
    await renderProjectScene({
        projectId: 'previous_user_project',
        records: [makeRecord('previous_project_atom', 'shape', 1)],
        host,
        compositor: createTestCompositor(calls)
    });
    calls.length = 0;
    await reconcileProjectSceneRecordsByPrefix({
        projectId: '__eve_dashboard_workspace__',
        prefix: '__eve_dashboard_',
        records: [{
            id: '__eve_dashboard_header_projects',
            type: 'text',
            properties: { left: 10, top: 10, width: 200, height: 60, text: 'Projects' }
        }],
        changedRecords: null,
        host,
        effects: [],
        keepForeground: false
    });

    assert.equal(sceneState.foregroundProjectId, '__eve_dashboard_workspace__');
    assert.equal(sceneState.surfaceOwnerProjectId, '__eve_dashboard_workspace__');

    calls.length = 0;
    await clearProjectSceneVisuals('previous_user_project');
    const despawned = bevyOpsFromCalls(calls).filter((op) => op.type === 'despawn').map((op) => op.id);
    assert.equal(despawned.includes('__eve_dashboard_header_projects'), false);
    assert.equal(getProjectSceneState('__eve_dashboard_workspace__').record_count, 1);
});

test('User project renders cannot steal foreground while workspace mode is Dashboard', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    dom.window.__eveWorkspaceMode = {
        mode: 'dashboard',
        projectId: '__eve_dashboard_workspace__',
        transitioning: false,
        targetMode: ''
    };
    await reconcileProjectSceneRecordsByPrefix({
        projectId: '__eve_dashboard_workspace__',
        prefix: '__eve_dashboard_',
        records: [{
            id: '__eve_dashboard_header_projects',
            type: 'text',
            properties: { left: 10, top: 10, width: 200, height: 60, text: 'Projects' }
        }],
        host,
        effects: [],
        keepForeground: false
    });
    assert.equal(sceneState.foregroundProjectId, '__eve_dashboard_workspace__');
    assert.equal(host.contains(dom.window.document.getElementById('eve_surface_project')), true);

    const projectHost = dom.window.document.createElement('section');
    projectHost.id = 'project_view_late_project';
    dom.window.document.body.appendChild(projectHost);
    await renderProjectScene({
        projectId: 'late_project',
        records: [makeRecord('late_project_atom', 'shape', 1)],
        host: projectHost,
        compositor: createTestCompositor()
    });

    assert.equal(sceneState.foregroundProjectId, '__eve_dashboard_workspace__');
    assert.equal(sceneState.surfaceOwnerProjectId, '__eve_dashboard_workspace__');
    assert.equal(host.contains(dom.window.document.getElementById('eve_surface_project')), true);
});

test('Project scene visual clear despawns previous Bevy nodes before dropping the baseline', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: 'project_clear_visuals',
        records: [makeRecord('clear_shape', 'shape', 1), makeRecord('clear_text', 'text', 2)],
        host,
        compositor: createTestCompositor(calls)
    });
    calls.length = 0;
    const cleared = await clearProjectSceneVisuals('project_clear_visuals');
    const despawned = bevyOpsFromCalls(calls).filter((op) => op.type === 'despawn').map((op) => op.id).sort();

    assert.equal(cleared, true);
    assert.deepEqual(despawned, ['clear_shape', 'clear_text']);
    assert.equal(getProjectSceneState('project_clear_visuals').record_count, 0);
});

test('Dashboard overlay records stay non-selectable in the project hit-test scene', () => {
    const { layout, records, scene } = buildDashboardHitScene();
    assert.ok(records.length > 0);
    assert.equal(records.every((record) => record.properties.selectable === false), true);

    const reserved = layout.toolbox_reserved_rect;
    const points = [
        { x: reserved.x + reserved.width / 2, y: reserved.y + 8 },
        { x: reserved.x + reserved.width / 2, y: reserved.y + reserved.height / 2 },
        { x: layout.dashboard_rect.width / 2, y: layout.dashboard_rect.height / 2 }
    ];
    assert.deepEqual(points.map((point) => hitTestRenderScene(scene, point)?.id || null), [null, null, null]);
});

test('Project scene drag intent commits canonical geometry through commitBatch', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const record = makeRecord('drag_atom', 'image', 1);
    record.properties.left = 10;
    record.properties.top = 20;
    await renderProjectScene({
        projectId: 'project_drag',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 12, clientY: 22, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 22, clientY: 32, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 22, clientY: 32, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    assert.equal(commits.length, 2);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    assert.equal(commits[0][0].atome_id, 'drag_atom');
    const committedSet = finalSetCommit(commits);
    assert.equal(committedSet.atome_id, 'drag_atom');
    assert.deepEqual(committedSet.props, { left: 20, top: 30 });
    assert.equal(getProjectSceneState('project_drag').records[0].properties.left, 20);
    assert.equal(getProjectSceneState('project_drag').records[0].properties.top, 30);
});

test('Project scene canvas click selects through the existing selection runtime', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const record = makeRecord('canvas_select_atom', 'image', 1);
    record.properties.left = 10;
    record.properties.top = 20;
    record.properties.width = 40;
    record.properties.height = 30;
    await renderProjectScene({
        projectId: 'project_canvas_select',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 20, clientY: 30, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 20, clientY: 30, bubbles: true }));
    await nextTick();
    await nextTick();

    assert.deepEqual(dom.window.__selectedAtomeIds, ['canvas_select_atom']);
    assert.equal(getProjectSceneState('project_canvas_select').scene.atoms[0].visual.selected, true);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text,img,video,audio,svg').length, 0);
});

test('Project scene double-click enters contextual edit and preserves an included multi-selection', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const intents = [];
    const record = makeRecord('contextual_edit_atom', 'image', 1);
    record.properties.left = 10;
    record.properties.top = 20;
    dom.window.__selectedAtomeIds = ['contextual_edit_atom', 'selection_peer'];
    dom.window.__selectedAtomeId = 'selection_peer';
    setProjectSceneUiIntentHandler(async (intent) => {
        intents.push(intent);
        return { ok: true };
    });
    await renderProjectScene({
        projectId: 'project_contextual_edit',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('dblclick', { clientX: 20, clientY: 30, bubbles: true }));
    await nextTick();

    assert.deepEqual(dom.window.__selectedAtomeIds, ['contextual_edit_atom', 'selection_peer']);
    assert.equal(intents.length, 1);
    assert.equal(intents[0].kind, 'atome.edit.enter');
    assert.equal(intents[0].atome_id, 'contextual_edit_atom');
    setProjectSceneUiIntentHandler(null);
});

test('Project surface resize gesture uses scene hit-test and commits canonical dimensions', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const record = makeRecord('resize_atom', 'shape', 1);
    record.properties.left = 10;
    record.properties.top = 20;
    record.properties.width = 40;
    record.properties.height = 30;
    await renderProjectScene({
        projectId: 'project_resize',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 49, clientY: 49, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 69, clientY: 64, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 69, clientY: 64, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    assert.equal(commits.length, 2);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    assert.equal(commits[0][0].atome_id, 'resize_atom');
    const committedSet = finalSetCommit(commits);
    assert.equal(committedSet.atome_id, 'resize_atom');
    assert.deepEqual(committedSet.props, { width: 60, height: 45 });
    assert.equal(getProjectSceneState('project_resize').records[0].properties.width, 60);
    assert.equal(getProjectSceneState('project_resize').records[0].properties.height, 45);
});

test('Project surface resize preserves aspect ratio when dragging one resize axis', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const record = makeRecord('resize_ratio_atom', 'image', 1);
    record.properties.left = 10;
    record.properties.top = 20;
    record.properties.width = 40;
    record.properties.height = 20;
    await renderProjectScene({
        projectId: 'project_resize_ratio',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 49, clientY: 30, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 69, clientY: 30, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 69, clientY: 30, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    assert.equal(commits.length, 2);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    const committedSet = finalSetCommit(commits);
    assert.deepEqual(committedSet.props, { width: 60, height: 30 });
    const resized = getProjectSceneState('project_resize_ratio').records[0].properties;
    assert.equal(resized.width / resized.height, 2);
});

test('Project scene direct text and resize intents commit canonically without DOM hosts', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commit: async (event) => {
            commits.push(event);
            return { ok: true };
        }
    };
    await renderProjectScene({
        projectId: 'project_intents',
        records: [makeRecord('intent_text', 'text', 1)],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    await emitProjectSceneIntent({
        projectId: 'project_intents',
        intent: {
            kind: 'text.commit',
            atome_id: 'intent_text',
            props: { text: 'Intent text' },
            commit: true
        }
    });
    await emitProjectSceneIntent({
        projectId: 'project_intents',
        intent: {
            kind: 'resize.end',
            atome_id: 'intent_text',
            props: { width: 96, height: 48 },
            commit: true
        }
    });

    assert.equal(commits.length, 2);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text').length, 0);
    assert.equal(getProjectSceneState('project_intents').records[0].properties.text, 'Intent text');
    assert.equal(getProjectSceneState('project_intents').records[0].properties.width, 96);
});

test('Project scene selection invalidation redraws selected canvas state without DOM Atomes', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    await renderProjectScene({
        projectId: 'project_selection_projection',
        records: [makeRecord('selectable_canvas_atom', 'image', 1)],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(calls)
    });

    assert.equal(getProjectSceneState('project_selection_projection').scene.atoms[0].visual.selected, undefined);
    dom.window.__selectedAtomeIds = ['selectable_canvas_atom'];
    dom.window.dispatchEvent(new dom.window.CustomEvent('adole-atome-selected', {
        detail: { selected: ['selectable_canvas_atom'] }
    }));
    await nextTick();
    await nextTick();

    assert.equal(getProjectSceneState('project_selection_projection').scene.atoms[0].visual.selected, true);
    const selectedStylePayload = bevyOpsFromCalls(calls)
        .filter((op) => op.type === 'style')
        .map((op) => op.payload || op.patch)
        .find((payload) => payload?.selected === true);
    assert.equal(!!selectedStylePayload, true);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});
