import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords } from '../../eVe/domains/dashboard/dashboard_records.js';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { normalizeRenderAtoms } from '../../eVe/domains/rendering/render_atom.js';
import { recordsForBevyProjection } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import {
    clearAllProjectSceneVisuals,
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
import { createSurfacePinchRuntime } from '../../eVe/domains/rendering/surface_pinch_runtime.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { getRenderSurfaceState } from '../../eVe/domains/rendering/surface_runtime.js';
import { setAtomeContextualEditApi } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js';
import { normalizeAtomeContextualKind } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_kind.js';
import {
    startProjectAudioPlaybackProgress,
    stopProjectAudioPlaybackProgress
} from '../../eVe/domains/media/project_audio_playback_progress_runtime.js';
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
const bevyOpId = (op = {}) => op.id || op.payload?.id || op.patch?.id || '';

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

test('Forced workspace projection reconciles the shared WebGPU surface even when its size is unchanged', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    const input = {
        projectId: 'project_force_surface_reconcile',
        records: [makeRecord('force_surface_atom', 'shape', 1)],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(calls)
    };
    await renderProjectScene(input);
    const before = calls.filter((call) => call.type === 'surface').length;
    await renderProjectScene({ ...input, forceSurfaceReconcile: true });
    const after = calls.filter((call) => call.type === 'surface').length;
    assert.equal(after, before + 1);
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
    dom.window.eveDashboardBevyUiRuntime = { state: { active: true, sceneProjectId: 'project_ephemeral_overlay' } };
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

test('Bulk visual cleanup preserves explicitly retained workspace scenes', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="view"><section id="dashboard"></section><section id="project"></section></main></body></html>');
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [makeRecord('dashboard_lane', 'shape', 1)],
        host: dom.window.document.getElementById('dashboard'),
        compositor: createTestCompositor()
    });
    await renderProjectScene({
        projectId: 'previous_user_project',
        records: [makeRecord('private_shape', 'shape', 1)],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(),
        keepForeground: true
    });

    await clearAllProjectSceneVisuals({ preserveProjectIds: ['__eve_dashboard_workspace__'] });

    assert.equal(getProjectSceneState('__eve_dashboard_workspace__').record_count, 1);
    assert.equal(getProjectSceneState('previous_user_project').record_count, 0);
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

test('Natural drop away from any target commits only the final spatial drop', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const source = makeRecord('composition_cancel_source', 'shape', 2);
    const target = makeRecord('composition_cancel_target', 'shape', 1);
    source.parent_id = 'project_composition_cancel';
    target.parent_id = 'project_composition_cancel';
    Object.assign(source.properties, { left: 10, top: 20, width: 20, height: 20 });
    Object.assign(target.properties, { left: 80, top: 20, width: 30, height: 30 });
    await renderProjectScene({
        projectId: 'project_composition_cancel', records: [source, target],
        host: dom.window.document.getElementById('project'), compositor: createTestCompositor()
    });
    const canvas = dom.window.document.getElementById('eve_surface_project');
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 15, clientY: 25, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 90, clientY: 30, bubbles: true }));
    // Le survol n'ouvre plus rien et ne gele plus le point : l'objet suit le doigt
    // jusqu'au bout, et le relachement hors de toute cible ne propose aucun choix.
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        clientX: 200, clientY: 200, bubbles: true
    }));
    await nextTick();
    assert.deepEqual(getRenderSurfaceState(canvas)?.pointerSession?.last, { x: 200, y: 200 });
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 200, clientY: 200, bubbles: true }));
    await nextTick();
    await nextTick();

    const committedSet = finalSetCommit(commits);
    assert.equal(committedSet.atome_id, source.id);
    assert.deepEqual(committedSet.props, { left: 195, top: 195 });
    assert.equal(source.parent_id, 'project_composition_cancel');
    assert.equal(target.parent_id, 'project_composition_cancel');
    assert.equal(getRenderSurfaceState(canvas)?.pointerSession, null);
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
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text,img,audio,svg').length, 0);
    assert.equal(visibleProjectVideos(dom.window.document).length, 0);
});

test('Natural selects a transparent structural Molecule with the canonical WebGPU outline', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const owner = makeRecord('molecule_owner', 'group', 1);
    Object.assign(owner.properties, {
        molecule_entity: 'molecule', left: 10, top: 20, width: 70, height: 20, zIndex: -1
    });
    const member = makeRecord('molecule_member', 'shape', 2);
    member.parent_id = owner.id;
    Object.assign(member.properties, { left: 10, top: 20, width: 20, height: 20 });
    await renderProjectScene({
        projectId: 'project_molecule_selection',
        records: [owner, member],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 15, clientY: 25, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 15, clientY: 25, bubbles: true }));
    await nextTick();
    await nextTick();

    const scene = getProjectSceneState('project_molecule_selection').scene;
    assert.deepEqual(dom.window.__selectedAtomeIds, [owner.id]);
    assert.deepEqual(scene.byId.get(owner.id).style.fill, [0, 0, 0, 0]);
    assert.equal(scene.byId.get(owner.id).visual.selected, true);
    assert.notEqual(scene.byId.get(member.id).visual.selected, true);
});

test('Natural selection keeps Molecule members locked until contextual edition begins', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const owner = makeRecord('locked_molecule', 'group', 1);
    Object.assign(owner.properties, { molecule_entity: 'molecule', left: 10, top: 20, width: 70, height: 20 });
    const member = makeRecord('locked_member', 'shape', 2);
    member.parent_id = owner.id;
    Object.assign(member.properties, { left: 10, top: 20, width: 20, height: 20 });
    let contextLevel = 'selection';
    setAtomeContextualEditApi({
        readState: () => ({ activeAtomeId: owner.id, contextLevel }),
        isEditing: (atomeId) => atomeId === owner.id && contextLevel === 'edition'
    });
    await renderProjectScene({
        projectId: 'project_locked_molecule', records: [owner, member],
        host: dom.window.document.getElementById('project'), compositor: createTestCompositor()
    });
    const canvas = dom.window.document.getElementById('eve_surface_project');

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 15, clientY: 25, bubbles: true }));
    assert.equal(getRenderSurfaceState(canvas)?.pointerSession?.atome_id, owner.id);
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 15, clientY: 25, bubbles: true }));

    contextLevel = 'edition';
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 15, clientY: 25, bubbles: true }));
    assert.equal(getRenderSurfaceState(canvas)?.pointerSession?.atome_id, member.id);
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 15, clientY: 25, bubbles: true }));
    setAtomeContextualEditApi(null);
});

test('Natural member editing commits the member and refreshed Molecule union in one batch', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const owner = makeRecord('edited_molecule', 'group', 1);
    Object.assign(owner.properties, {
        molecule_entity: 'molecule', left: 10, top: 20, width: 70, height: 20, zIndex: -1
    });
    const first = makeRecord('edited_member_first', 'shape', 2);
    first.parent_id = owner.id;
    Object.assign(first.properties, { left: '10px', top: '20px', width: '20px', height: '20px' });
    const second = makeRecord('edited_member_second', 'shape', 3);
    second.parent_id = owner.id;
    Object.assign(second.properties, { left: '60px', top: '20px', width: '20px', height: '20px' });
    setAtomeContextualEditApi({
        readState: () => ({ activeAtomeId: owner.id, contextLevel: 'edition' }),
        isEditing: (atomeId) => atomeId === owner.id
    });
    await renderProjectScene({
        projectId: 'project_molecule_member_edit',
        records: [owner, first, second],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 15, clientY: 25, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 35, clientY: 25, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 35, clientY: 25, bubbles: true }));
    await nextTick();
    await nextTick();
    setAtomeContextualEditApi(null);

    const finalBatch = commits.findLast((events) => events.some((event) => event.kind === 'set'));
    assert.ok(finalBatch);
    assert.deepEqual(finalBatch.map((event) => event.atome_id).sort(), [first.id, owner.id].sort());
    assert.deepEqual(finalBatch.find((event) => event.atome_id === first.id).props, { left: 30, top: 20 });
    assert.deepEqual(finalBatch.find((event) => event.atome_id === owner.id).props, {
        left: 30, top: 20, width: 50, height: 20
    });
    assert.equal(first.parent_id, owner.id);
    assert.equal(second.parent_id, owner.id);
});

test('Natural member editing never turns an internal drag into a Molecule absorption', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const owner = makeRecord('stable_molecule', 'group', 1);
    Object.assign(owner.properties, { molecule_entity: 'molecule', left: 10, top: 20, width: 70, height: 20 });
    const member = makeRecord('stable_member', 'shape', 2);
    member.parent_id = owner.id;
    Object.assign(member.properties, { left: 10, top: 20, width: 20, height: 20 });
    const overlap = makeRecord('overlap_target', 'shape', 3);
    Object.assign(overlap.properties, { left: 60, top: 20, width: 20, height: 20 });
    await renderProjectScene({
        projectId: 'project_stable_molecule', records: [owner, member, overlap],
        host: dom.window.document.getElementById('project'), compositor: createTestCompositor()
    });

    const result = await emitProjectSceneIntent({
        projectId: 'project_stable_molecule',
        intent: {
            kind: 'drag.end', atome_id: member.id, commit: true,
            props: { left: 50, top: 20 }, targets: [{ atome_id: member.id, props: { left: 50, top: 20 } }],
            overlap_target_id: overlap.id, overlap_stationary_ms: 600, overlap_delay_ms: 500
        }
    });

    assert.equal(result.molecule_mutation, undefined);
    assert.deepEqual(commits.at(-1).map((event) => event.atome_id).sort(), [member.id, owner.id].sort());
    assert.equal(member.parent_id, owner.id);
});

test('Project scene double-click enters SVG vector edit and preserves an included multi-selection', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const intents = [];
    const record = makeRecord('contextual_edit_atom', 'shape', 1);
    record.properties.svg_markup = '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>';
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
    assert.equal(intents[0].atome_kind, 'svg');
    setProjectSceneUiIntentHandler(null);
});

test.each([
    ['video_recording', 'spatial_crop'],
    ['audio_recording', 'temporal_crop']
])('an immediate Ctrl-wheel after %s double-click waits for crop edition instead of resizing', async (kind, editMode) => {
    clearAllProjectScenes();
    const dom = projectDom();
    const intents = [];
    let releaseEdit;
    let editing = false;
    const editGate = new Promise((resolve) => { releaseEdit = resolve; });
    const record = makeRecord(`pending_${kind}_crop`, kind, 1);
    Object.assign(record.properties, {
        left: 10, top: 20, width: 160, height: 90,
        media_width: 640, media_height: 360,
        media_duration_seconds: 10, duration_seconds: 10
    });
    setAtomeContextualEditApi({
        readState: () => editing ? {
            contextLevel: 'edition', activeAtomeId: record.id, editMode
        } : { contextLevel: 'selection', activeAtomeId: record.id, editMode: '' },
        isEditing: (id) => editing && id === record.id
    });
    setProjectSceneUiIntentHandler(async (intent) => {
        await editGate;
        editing = true;
        return { ok: true, intent };
    });
    try {
        await renderProjectScene({
            projectId: `project_pending_${kind}_crop`, records: [record],
            host: dom.window.document.getElementById('project'), compositor: createTestCompositor(),
            onIntent: async (intent) => { intents.push(intent); }
        });
        dom.window.document.dispatchEvent(new dom.window.MouseEvent('dblclick', {
            clientX: 80, clientY: 60, bubbles: true, cancelable: true
        }));
        dom.window.document.dispatchEvent(new dom.window.WheelEvent('wheel', {
            clientX: 80, clientY: 60, deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true
        }));
        await nextTick();
        assert.equal(intents.some((intent) => intent.kind === 'resize.move'), false);
        assert.equal(intents.some((intent) => intent.kind === 'media.crop.move'), false);

        releaseEdit();
        await nextTick();
        await nextTick();
        dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
        await nextTick();

        assert.equal(intents.some((intent) => intent.kind === 'resize.move'), false);
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.start').length, 1);
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.move').length, 1);
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.end').length, 1);
    } finally {
        releaseEdit?.();
        setProjectSceneUiIntentHandler(null);
        setAtomeContextualEditApi(null);
    }
});

test('recording and image aliases normalize to the existing contextual media owners', () => {
    assert.equal(normalizeAtomeContextualKind('video_recording'), 'video');
    assert.equal(normalizeAtomeContextualKind('audio_recording'), 'audio');
    assert.equal(normalizeAtomeContextualKind('audio_waveform'), 'audio');
    assert.equal(normalizeAtomeContextualKind('sound'), 'audio');
    assert.equal(normalizeAtomeContextualKind('photo'), 'image');
    assert.equal(normalizeAtomeContextualKind('picture'), 'image');
});

test('Natural Molecule double-click targets its canonical owner and enters group edition', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const intents = [];
    const owner = makeRecord('double_click_molecule', 'group', 1);
    Object.assign(owner.properties, { left: 10, top: 20, width: 100, height: 60, molecule_entity: 'molecule' });
    const member = makeRecord('double_click_member', 'image', 2);
    member.parent_id = owner.id;
    Object.assign(member.properties, { left: 20, top: 30, width: 40, height: 30 });
    setProjectSceneUiIntentHandler(async (intent) => { intents.push(intent); return { ok: true }; });
    await renderProjectScene({
        projectId: 'project_molecule_double_click', records: [owner, member],
        host: dom.window.document.getElementById('project'), compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('dblclick', {
        clientX: 30, clientY: 40, bubbles: true
    }));
    await nextTick();

    assert.equal(intents.length, 1);
    assert.equal(intents[0].kind, 'atome.edit.enter');
    assert.equal(intents[0].atome_id, owner.id);
    assert.equal(intents[0].atome_kind, 'group');
    setProjectSceneUiIntentHandler(null);
});

test('temporal crop pinch previews and commits once when either touch is released', () => {
    const atom = {
        id: 'pinch_audio', type: 'audio_waveform', atomeType: 'audio',
        bounds: { x: 0, y: 0, width: 100, height: 40 },
        content: { mediaDuration: 10, sourceInSeconds: 2, sourceOutSeconds: 8 },
        capabilities: { resizable: true }
    };
    const view = { SelectionAPI: { selected: () => ['pinch_audio'] }, __selectedAtomeIds: ['pinch_audio'] };
    const canvas = { ownerDocument: { defaultView: view } };
    let state = {
        scene: { atoms: [atom], byId: new Map([[atom.id, atom]]) },
        pointerSession: {
            mode: 'crop.seek', pointer_id: 1, pointerType: 'touch', atome_id: atom.id,
            start: { x: 25, y: 20 }, last: { x: 25, y: 20 }, origin: atom.bounds,
            targets: [{ atome_id: atom.id, origin: atom.bounds }], moved: false
        }
    };
    const intents = [];
    setAtomeContextualEditApi({
        readState: () => ({ contextLevel: 'edition', activeAtomeId: atom.id, editMode: 'temporal_crop' }),
        isEditing: () => true
    });
    const pinch = createSurfacePinchRuntime({
        canvas,
        readState: () => state,
        writeState: (_canvas, next) => { state = next; },
        surfacePointFromEvent: (_canvas, event) => ({ x: event.clientX, y: event.clientY }),
        stopSurfaceEvent: () => {},
        endSurfacePointerSession: () => { state.pointerSession?.onEnd?.('pointerup'); state = { ...state, pointerSession: null }; },
        dispatchSurfaceIntent: (_canvas, intent) => { intents.push(intent); },
        hitTarget: () => atom,
        nextGestureId: () => 'pinch_audio_gesture'
    });
    try {
        assert.equal(pinch.pointerDown({ pointerType: 'touch', pointerId: 2, clientX: 75, clientY: 20 }), true);
        assert.equal(pinch.pointerMove({ pointerId: 2, clientX: 100, clientY: 20 }), true);
        assert.doesNotThrow(() => pinch.pointerEnd({ pointerId: 2 }));
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.start').length, 1);
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.move').length, 1);
        assert.equal(intents.filter((intent) => intent.kind === 'media.crop.end').length, 1);
        assert.equal(intents.at(-1).commit, true);
        assert.equal(state.pointerSession, null);
    } finally {
        setAtomeContextualEditApi(null);
    }
});

test('cancelled temporal crop pinch restores its initial window without a commit', () => {
    const atom = {
        id: 'cancelled_pinch_audio', type: 'audio_waveform', atomeType: 'audio',
        bounds: { x: 0, y: 0, width: 100, height: 40 },
        content: { mediaDuration: 10, sourceInSeconds: 2, sourceOutSeconds: 8 },
        capabilities: { resizable: true }
    };
    const view = { SelectionAPI: { selected: () => [atom.id] }, __selectedAtomeIds: [atom.id] };
    const canvas = { ownerDocument: { defaultView: view } };
    let state = {
        scene: { atoms: [atom], byId: new Map([[atom.id, atom]]) },
        pointerSession: {
            mode: 'crop.seek', pointer_id: 1, pointerType: 'touch', atome_id: atom.id,
            start: { x: 25, y: 20 }, last: { x: 25, y: 20 }, origin: atom.bounds,
            targets: [{ atome_id: atom.id, origin: atom.bounds }], moved: false
        }
    };
    const intents = [];
    setAtomeContextualEditApi({
        readState: () => ({ contextLevel: 'edition', activeAtomeId: atom.id, editMode: 'temporal_crop' }),
        isEditing: () => true
    });
    const pinch = createSurfacePinchRuntime({
        canvas,
        readState: () => state,
        writeState: (_canvas, next) => { state = next; },
        surfacePointFromEvent: (_canvas, event) => ({ x: event.clientX, y: event.clientY }),
        stopSurfaceEvent: () => {},
        endSurfacePointerSession: () => { state.pointerSession?.onEnd?.('pointercancel'); state = { ...state, pointerSession: null }; },
        dispatchSurfaceIntent: (_canvas, intent) => { intents.push(intent); },
        hitTarget: () => atom,
        nextGestureId: () => 'cancelled_pinch_audio_gesture'
    });
    try {
        assert.equal(pinch.pointerDown({ pointerType: 'touch', pointerId: 2, clientX: 75, clientY: 20 }), true);
        assert.equal(pinch.pointerMove({ pointerId: 2, clientX: 100, clientY: 20 }), true);
        assert.doesNotThrow(() => pinch.pointerEnd({ pointerId: 2 }, true));
        const cancel = intents.find((intent) => intent.kind === 'media.crop.cancel');
        assert.ok(cancel);
        assert.deepEqual(cancel.props, {
            source_in_seconds: 2, source_out_seconds: 8, duration_seconds: 6, media_duration_seconds: 10
        });
        assert.equal(intents.some((intent) => intent.kind === 'media.crop.end'), false);
        assert.equal(state.pointerSession, null);
    } finally {
        setAtomeContextualEditApi(null);
    }
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
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        clientX: 49, clientY: 49, bubbles: true, altKey: true
    }));
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
    assert.deepEqual(committedSet.props, { left: 10, top: 20, width: 60, height: 45 });
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
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        clientX: 49, clientY: 30, bubbles: true, altKey: true
    }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 69, clientY: 30, bubbles: true }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 69, clientY: 30, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    assert.equal(commits.length, 2);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    const committedSet = finalSetCommit(commits);
    assert.deepEqual(committedSet.props, { left: 10, top: 20, width: 60, height: 30 });
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

test('media crop previews stay disposable and one gesture end commits once', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    sceneState.foregroundProjectId = 'project_crop';
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => { commits.push(events); return { ok: true }; }
    };
    const calls = [];
    const record = makeRecord('crop_atom', 'image', 1);
    Object.assign(record.properties, {
        media_url: '/image.png', media_width: 1000, media_height: 500,
        left: 10, top: 20, width: 200, height: 100
    });
    await renderProjectScene({
        projectId: 'project_crop', records: [record],
        host: dom.window.document.getElementById('project'), compositor: createTestCompositor(calls)
    });
    await nextTick(70);
    const beforePreview = calls.length;
    const props = { source_rect: { x: 100, y: 50, width: 600, height: 300 } };
    await emitProjectSceneIntent({
        projectId: 'project_crop', intent: { kind: 'media.crop.move', atome_id: record.id, props }
    });
    assert.equal(commits.length, 0);
    assert.deepEqual(getProjectSceneState('project_crop').records[0].properties.source_rect, props.source_rect);
    await nextTick(70);
    const previewResource = bevyOpsFromCalls(calls.slice(beforePreview))
        .find((op) => op.type === 'resource' && bevyOpId(op) === record.id);
    assert.ok(previewResource, 'crop preview must reach the real Bevy resource patch');
    assert.deepEqual((previewResource.patch || previewResource.payload).uv_rect, [0.1, 0.1, 0.6, 0.6]);
    await emitProjectSceneIntent({
        projectId: 'project_crop', intent: {
            kind: 'media.crop.end', atome_id: record.id, gesture_id: 'crop_gesture', props, commit: true
        }
    });
    assert.equal(commits.length, 1);
    assert.equal(commits[0].length, 1);
    assert.equal(commits[0][0].atome_id, record.id);
    assert.deepEqual(commits[0][0].props.source_rect, props.source_rect);
});

test('Project scene selection invalidation redraws selected canvas state without DOM Atomes', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    await renderProjectScene({
        projectId: 'project_selection_projection',
        records: [
            makeRecord('recent_video_a', 'video', 1),
            makeRecord('recent_video_b', 'video', 2),
            makeRecord('selectable_canvas_atom', 'audio_recording', 3)
        ],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(calls)
    });
    await nextTick(70);

    const callsBeforeSelection = calls.length;
    dom.window.__selectedAtomeIds = ['selectable_canvas_atom'];
    dom.window.dispatchEvent(new dom.window.CustomEvent('adole-atome-selected', {
        detail: { selected: ['selectable_canvas_atom'] }
    }));
    await nextTick();
    await nextTick();

    assert.equal(
        getProjectSceneState('project_selection_projection').scene.byId.get('selectable_canvas_atom').visual.selected,
        true
    );
    const selectedStylePayload = bevyOpsFromCalls(calls)
        .filter((op) => op.type === 'style')
        .map((op) => op.payload || op.patch)
        .find((payload) => payload?.selected === true);
    assert.equal(!!selectedStylePayload, true);
    const selectionOps = bevyOpsFromCalls(calls.slice(callsBeforeSelection));
    assert.deepEqual([...new Set(selectionOps.map((op) => op.type))], ['style']);
    assert.equal(selectionOps.some((op) => ['recent_video_a', 'recent_video_b'].includes(bevyOpId(op))), false);

    const callsBeforeProgress = calls.length;
    assert.equal(startProjectAudioPlaybackProgress({
        windowRef: dom.window,
        atomeId: 'selectable_canvas_atom',
        durationSeconds: 10
    }), true);
    await nextTick();
    stopProjectAudioPlaybackProgress({ windowRef: dom.window, atomeId: 'selectable_canvas_atom' });
    await nextTick();
    const progressOps = bevyOpsFromCalls(calls.slice(callsBeforeProgress));
    assert.equal(progressOps.length > 0, true);
    assert.deepEqual([...new Set(progressOps.map((op) => op.type))], ['style']);
    const playbackOps = progressOps.filter((op) => (
        Object.prototype.hasOwnProperty.call(op.payload || op.patch || {}, 'playback_progress')
    ));
    assert.equal(playbackOps.length > 0, true);
    assert.equal(playbackOps.every((op) => bevyOpId(op) === 'selectable_canvas_atom'), true);
    assert.equal(progressOps.some((op) => ['spawn', 'despawn', 'resource'].includes(op.type)), false);
    const callsBeforeSelectionStress = calls.length;
    for (let index = 0; index < 50; index += 1) {
        const selected = index % 2 === 0 ? ['selectable_canvas_atom'] : [];
        dom.window.__selectedAtomeIds = selected;
        dom.window.dispatchEvent(new dom.window.CustomEvent('adole-atome-selected', { detail: { selected } }));
    }
    await nextTick();
    await nextTick();
    const stressOps = bevyOpsFromCalls(calls.slice(callsBeforeSelectionStress));
    assert.equal(stressOps.every((op) => op.type === 'style'), true);
    assert.equal(stressOps.some((op) => ['recent_video_a', 'recent_video_b'].includes(bevyOpId(op))), false);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text,img,audio,svg').length, 0);
    assert.equal(visibleProjectVideos(dom.window.document).length, 0);
    assert.equal(dom.window.document.querySelectorAll('#eve_bevy_video_decode_root video').length, 2);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('structured presentation removes Natural pixels and hits while retaining canonical source records', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const calls = [];
    const projectId = 'exclusive_views';
    const natural = makeRecord('natural_atom', 'shape', 1);
    await renderProjectScene({projectId,records:[natural],host:dom.window.document.getElementById('project'),compositor:createTestCompositor(calls)});
    const prefix = '__eve_bevy_ui_eve_bevy_ui_project_view_';
    const structured = makeRecord(`${prefix}root`, 'shape', 9000);
    for (let index=0; index<3; index+=1) {
        await reconcileProjectSceneRecordsByPrefix({projectId,prefix,records:[structured]});
        let snapshot = getProjectSceneState(projectId);
        assert.ok(snapshot.records.some(record => record.id === 'natural_atom'));
        assert.ok(!snapshot.scene.atoms.some(atom => atom.id === 'natural_atom'));
        assert.ok(snapshot.scene.atoms.some(atom => atom.id === structured.id));
        await reconcileProjectSceneRecordsByPrefix({projectId,prefix,records:[]});
        snapshot = getProjectSceneState(projectId);
        assert.ok(snapshot.scene.atoms.some(atom => atom.id === 'natural_atom'));
        assert.ok(!snapshot.scene.atoms.some(atom => atom.id === structured.id));
    }
    clearAllProjectScenes();
});
