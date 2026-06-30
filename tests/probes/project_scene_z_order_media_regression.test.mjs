import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { normalizeRenderAtom, normalizeRenderAtoms } from '../../eVe/domains/rendering/render_atom.js';
import { createRenderScene, hitTestRenderScene } from '../../eVe/domains/rendering/scene_graph.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { mapVirtualSceneTreeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import {
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';
import {
    clearProjectScene,
    reconcileProjectSceneRecordsByPrefix,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import {
    mergeProjectSceneStackPosition,
    readProjectSceneStackBounds,
    resolveProjectSceneNextStackPosition
} from '../../eVe/domains/rendering/project_scene_stack_runtime.js';

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

const record = (id, props = {}) => ({
    id,
    type: props.type || 'shape',
    properties: {
        kind: props.type || 'shape',
        left: props.left ?? 0,
        top: props.top ?? 0,
        width: props.width ?? 40,
        height: props.height ?? 30,
        z_index: props.zIndex ?? 0,
        order: props.order ?? 0,
        media_url: props.mediaUrl || `/media/${id}`
    }
});

test('Project hit testing follows z-index before paint-order ties', () => {
    const atoms = normalizeRenderAtoms([
        record('back_high_order', { type: 'image', zIndex: 1, order: 100 }),
        record('front_high_z', { type: 'image', zIndex: 5, order: 1 }),
        record('front_same_z_later_order', { type: 'image', zIndex: 5, order: 2 })
    ]);
    atoms.forEach((atom) => {
        atom.bounds = { x: 0, y: 0, width: 100, height: 100 };
    });
    const scene = createRenderScene(atoms);

    assert.equal(hitTestRenderScene(scene, { x: 20, y: 20 })?.id, 'front_same_z_later_order');
    assert.deepEqual(scene.atoms.map((atom) => atom.id), [
        'back_high_order',
        'front_high_z',
        'front_same_z_later_order'
    ]);
});

test('Bevy projection orders higher z-index above later low-z paint order', () => {
    const scene = createVirtualSceneTree([
        record('late_low_z', { zIndex: 1, order: 100 }),
        record('early_high_z', { zIndex: 9, order: 0 })
    ]);
    const payload = mapVirtualSceneTreeToBevyPayload(scene);

    assert.deepEqual(scene.nodes.map((node) => node.id), ['late_low_z', 'early_high_z']);
    assert.deepEqual(payload.map((node) => [node.id, node.layer]), [
        ['late_low_z', 0],
        ['early_high_z', 1]
    ]);
});

test('Imported media stack position is above the current project scene records', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project"></div></body></html>');
    const host = dom.window.document.getElementById('project');
    host.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        right: 320,
        bottom: 240
    });
    const wasmModule = {
        default: async () => undefined,
        run_atome_bevy_renderer: () => undefined
    };

    await renderProjectScene({
        projectId: 'import_stack_project',
        records: [
            record('existing_front', { type: 'image', zIndex: 7, order: 20 }),
            record('existing_back', { type: 'image', zIndex: 3, order: 100 })
        ],
        host,
        documentRef: dom.window.document,
        bevyWasmModule: wasmModule
    });

    const stack = resolveProjectSceneNextStackPosition('import_stack_project');
    const imported = record('imported_media', {
        type: 'image',
        zIndex: stack.zIndex,
        order: stack.order
    });
    const scene = createRenderScene(normalizeRenderAtoms([
        record('existing_front', { type: 'image', zIndex: 7, order: 20 }),
        record('existing_back', { type: 'image', zIndex: 3, order: 100 }),
        imported
    ]));

    assert.equal(stack.zIndex, 8);
    assert.equal(stack.order, 101);
    assert.equal(hitTestRenderScene(scene, { x: 20, y: 20 })?.id, 'imported_media');
    clearProjectScene('import_stack_project');
});

test('Dashboard ephemeral records do not raise imported media above the project stack', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project"></div></body></html>');
    const host = dom.window.document.getElementById('project');
    host.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        right: 320,
        bottom: 240
    });
    const wasmModule = {
        default: async () => undefined,
        run_atome_bevy_renderer: () => undefined
    };

    await renderProjectScene({
        projectId: 'dashboard_stack_ignore_project',
        records: [
            record('existing_front', { type: 'image', zIndex: 7, order: 20 }),
            record('__eve_dashboard_background', { zIndex: 800, order: 0 }),
            record('__eve_dashboard_header', { zIndex: 813, order: 1 })
        ],
        host,
        documentRef: dom.window.document,
        bevyWasmModule: wasmModule
    });

    const bounds = readProjectSceneStackBounds('dashboard_stack_ignore_project');
    const stack = resolveProjectSceneNextStackPosition('dashboard_stack_ignore_project');

    assert.equal(bounds.maxProjectZIndex, 7);
    assert.equal(bounds.maxProjectOrder, 20);
    assert.equal(bounds.dashboardMinZIndex, 800);
    assert.equal(bounds.dashboardMaxZIndex, 813);
    assert.equal(stack.zIndex, 8);
    assert.equal(stack.order, 21);
    clearProjectScene('dashboard_stack_ignore_project');
});

test('New media stays below visible Dashboard records when the Dashboard band is adjacent', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project"></div></body></html>');
    const host = dom.window.document.getElementById('project');
    host.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        right: 320,
        bottom: 240
    });
    const wasmModule = {
        default: async () => undefined,
        run_atome_bevy_renderer: () => undefined
    };

    await renderProjectScene({
        projectId: 'dashboard_stack_cap_project',
        records: [
            record('existing_front', { type: 'image', zIndex: 797, order: 20 }),
            record('__eve_dashboard_background', { zIndex: 798, order: 0 })
        ],
        host,
        documentRef: dom.window.document,
        bevyWasmModule: wasmModule
    });

    const stack = resolveProjectSceneNextStackPosition('dashboard_stack_cap_project');
    const imported = record('imported_media', {
        type: 'image',
        zIndex: stack.zIndex,
        order: stack.order
    });
    const scene = createRenderScene(normalizeRenderAtoms([
        record('existing_front', { type: 'image', zIndex: 797, order: 20 }),
        imported,
        record('__eve_dashboard_background', { zIndex: 798, order: 0 })
    ]));

    assert.equal(stack.zIndex, 797);
    assert.equal(stack.order, 21);
    assert.equal(hitTestRenderScene(scene, { x: 20, y: 20 })?.id, '__eve_dashboard_background');
    clearProjectScene('dashboard_stack_cap_project');
});

test('Repeated explicit media stack positions are clamped below visible Dashboard records', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project"></div></body></html>');
    const host = dom.window.document.getElementById('project');
    host.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        right: 320,
        bottom: 240
    });
    const wasmModule = {
        default: async () => undefined,
        run_atome_bevy_renderer: () => undefined
    };

    await renderProjectScene({
        projectId: 'dashboard_stack_repeated_project',
        records: [
            record('existing_front', { type: 'image', zIndex: 900, order: 30 }),
            record('__eve_dashboard_background', { zIndex: 901, order: 0 })
        ],
        host,
        documentRef: dom.window.document,
        bevyWasmModule: wasmModule
    });

    const first = resolveProjectSceneNextStackPosition('dashboard_stack_repeated_project');
    const second = mergeProjectSceneStackPosition('dashboard_stack_repeated_project', {
        left: 12,
        top: 14,
        zIndex: first.zIndex + 1,
        z_index: first.zIndex + 1,
        order: first.order + 1,
        render_order: first.order + 1,
        renderOrder: first.order + 1
    });

    assert.equal(first.zIndex, 900);
    assert.equal(first.order, 31);
    assert.equal(second.zIndex, 900);
    assert.equal(second.z_index, 900);
    assert.equal(second.order, 32);
    clearProjectScene('dashboard_stack_repeated_project');
});

test('RenderAtom keeps media natural dimensions out of project bounds', () => {
    const video = normalizeRenderAtom({
        id: 'video_natural_size',
        type: 'video_recording',
        properties: {
            kind: 'video_recording',
            left: 10,
            top: 20,
            media_url: '/api/recordings/video_natural_size.webm',
            media_width: 1920,
            mediaWidth: 1920,
            media_height: 1080,
            mediaHeight: 1080,
            naturalWidth: 1920,
            naturalHeight: 1080
        }
    });

    assert.equal(video.bounds.width, 1);
    assert.equal(video.bounds.height, 1);
    assert.equal(video.content.naturalWidth, 1920);
    assert.equal(video.content.naturalHeight, 1080);
});

test('Bevy web runtime rejects a second canvas after the web event loop is owned', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_login"></canvas></body></html>');
    const firstSurface = dom.window.document.getElementById('eve_surface_project_login');
    const calls = [];
    const wasmModule = {
        default: async () => calls.push({ type: 'init' }),
        run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
            calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
        },
        apply_atome_bevy_spawn: (node) => calls.push({ type: 'ops', ops: [{ type: 'spawn', node }] }),
        apply_atome_bevy_surface: (payload) => calls.push({ type: 'surface', payload })
    };
    const firstScene = createVirtualSceneTree([
        record('login_shape_a', { left: 5, top: 9, width: 30, height: 20, zIndex: 2 })
    ]);

    const first = await startBevyWebRenderer({
        surface: firstSurface,
        width: 320,
        height: 240,
        virtualScene: firstScene,
        wasmModule
    });
    await flushBevyRun();
    firstSurface.remove();
    const secondSurface = dom.window.document.createElement('canvas');
    secondSurface.id = 'eve_surface_project_login';
    dom.window.document.body.appendChild(secondSurface);
    const secondScene = createVirtualSceneTree([
        record('login_shape_a', { left: 5, top: 9, width: 30, height: 20, zIndex: 2 }),
        record('login_shape_b', { left: 55, top: 49, width: 20, height: 20, zIndex: 3 })
    ]);

    await assert.rejects(startBevyWebRenderer({
        surface: secondSurface,
        width: 320,
        height: 240,
        virtualScene: secondScene,
        wasmModule
    }), /bevy_renderer_event_loop_already_owned/);

    assert.equal(first.started, true);
    assert.equal(calls.filter((call) => call.type === 'run').length, 1);
    assert.equal(calls.filter((call) => call.type === 'ops').length, 0);
    assert.equal(readBevyWebRendererState(secondSurface), null);
});

test('Project reconcile restarts Bevy after a failed projection instead of diffing against an invalid baseline', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="project_view_failed_projection"></div></body></html>');
    const host = dom.window.document.getElementById('project_view_failed_projection');
    host.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1681,
        height: 960,
        right: 1681,
        bottom: 960
    });
    let failRun = true;
    const calls = [];
    const wasmModule = {
        default: async () => undefined,
        run_atome_bevy_renderer: (_selector, _width, _height, initialScene) => {
            calls.push({ type: 'run', ids: initialScene.nodes.map((node) => node.id) });
            if (failRun) throw new Error('bevy_safari_initial_projection_failed');
        },
        apply_atome_bevy_spawn: (node) => calls.push({ type: 'spawn', id: node.id }),
        apply_atome_bevy_surface: (payload) => calls.push({ type: 'surface', payload })
    };
    const records = [
        record('__eve_dashboard_header_news', { zIndex: 10 }),
        record('__eve_dashboard_card_projects_slot_0', { left: 20, top: 120, zIndex: 20 })
    ];

    const failed = await renderProjectScene({
        projectId: 'failed_projection',
        records,
        host,
        documentRef: dom.window.document,
        bevyWasmModule: wasmModule
    });

    assert.equal(failed.ok, false);
    assert.equal(readBevyWebRendererState(host.querySelector('#eve_surface_project'))?.started, false);

    failRun = false;
    const recovered = await reconcileProjectSceneRecordsByPrefix({
        projectId: 'failed_projection',
        prefix: '__eve_dashboard_',
        records,
        changedRecords: [records[1]],
        host,
        documentRef: dom.window.document
    });

    assert.equal(recovered.ok, true);
    assert.deepEqual(calls.filter((call) => call.type === 'run').at(-1).ids, [
        '__eve_dashboard_header_news',
        '__eve_dashboard_card_projects_slot_0'
    ]);
    assert.equal(calls.some((call) => call.type === 'surface'), false);
    clearProjectScene('failed_projection');
});

test('Bevy web runtime coalesces concurrent starts on the same canvas', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_concurrent"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_concurrent');
    const calls = [];
    const wasmModule = {
        default: async () => {
            calls.push({ type: 'init' });
            await new Promise((resolve) => dom.window.setTimeout(resolve, 8));
        },
        run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
            calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
        },
        apply_atome_bevy_spawn: (node) => calls.push({ type: 'ops', node }),
        apply_atome_bevy_surface: (payload) => calls.push({ type: 'surface', payload })
    };
    const firstScene = createVirtualSceneTree([
        record('concurrent_a', { left: 2, top: 4, width: 20, height: 20, zIndex: 1 })
    ]);
    const secondScene = createVirtualSceneTree([
        record('concurrent_a', { left: 2, top: 4, width: 20, height: 20, zIndex: 1 }),
        record('concurrent_b', { left: 40, top: 20, width: 20, height: 20, zIndex: 2 })
    ]);

    const firstPromise = startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: firstScene,
        wasmModule
    });
    const secondPromise = startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: secondScene,
        wasmModule
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    assert.equal(first.started, true);
    assert.equal(second.already_started, true);
    assert.equal(calls.filter((call) => call.type === 'run').length, 1);
    assert.deepEqual(calls.filter((call) => call.type === 'ops').map((call) => call.node.id), ['concurrent_b']);
    assert.equal(readBevyWebRendererState(surface).node_count, 2);
});
