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
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import {
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

test('Bevy web runtime reuses selector runtime after canvas object replacement', async () => {
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

    const second = await startBevyWebRenderer({
        surface: secondSurface,
        width: 320,
        height: 240,
        virtualScene: secondScene,
        wasmModule
    });

    assert.equal(first.started, true);
    assert.equal(second.already_started, true);
    assert.equal(second.synced, true);
    assert.equal(calls.filter((call) => call.type === 'run').length, 1);
    assert.equal(calls.filter((call) => call.type === 'ops').length, 1);
    assert.equal(calls.find((call) => call.type === 'ops').ops[0].node.id, 'login_shape_b');
    assert.equal(readBevyWebRendererState(secondSurface).node_count, 2);
});
