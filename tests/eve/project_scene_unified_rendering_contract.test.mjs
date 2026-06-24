import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    clearAllProjectScenes,
    emitProjectSceneIntent,
    getProjectSceneState,
    renderProjectScene,
    updateProjectSceneRecord,
    updateProjectSceneRecords
} from '../../eVe/domains/rendering/project_scene_runtime.js';
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
    assert.equal(calls.some((call) => call.type === 'resource' && call.payload?.texture), false);
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

test('Late project renders preserve ephemeral Bevy overlay records on request', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    await renderProjectScene({
        projectId: 'project_ephemeral_overlay',
        records: [makeRecord('project_atom', 'shape', 1)],
        host,
        compositor: createTestCompositor()
    });
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
        records: [makeRecord('project_atom', 'shape', 2)],
        host,
        preserveEphemeralRecords: true
    });
    const ids = new Set(getProjectSceneState('project_ephemeral_overlay').records.map((record) => record.id));

    assert.equal(ids.has('project_atom'), true);
    assert.equal(ids.has('__eve_dashboard_background'), true);
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
    const selectedStylePayload = calls
        .filter((call) => call.type === 'style')
        .map((call) => call.payload)
        .find((payload) => payload?.selected === true);
    assert.equal(!!selectedStylePayload, true);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,.eve-atome-text,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});
