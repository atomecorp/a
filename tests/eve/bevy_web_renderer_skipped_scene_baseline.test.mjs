import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    applyBevyWebRendererDiffs,
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';
import { VIRTUAL_SCENE_DIFF_TYPES } from '../../eVe/domains/rendering/virtual_scene_contract.js';

const texture = (red = 255, green = 255, blue = 255) => ({
    width: 1,
    height: 1,
    rgba: [red, green, blue, 255]
});

const imageNode = (id, source, extra = {}) => ({
    id,
    kind: 'image',
    parentId: null,
    bounds: { x: 0, y: 0, width: 24, height: 24 },
    localTransform: { x: 0, y: 0 },
    renderLayer: 1,
    material: { fill: '#ffffff' },
    content: { source },
    ...extra
});

const scene = (nodes = []) => ({
    id: 'bevy_skipped_scene_baseline',
    revision: nodes.length,
    roots: nodes.map((node) => node.id),
    nodes,
    effects: [],
    byId: new Map(nodes.map((node) => [node.id, node]))
});

const createHarness = async (resolver) => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_skip"></canvas></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const calls = [];
    const wasmModule = {
        default: async () => calls.push({ type: 'init' }),
        run_atome_bevy_renderer: (_selector, _width, _height, _surfaceMetrics, initialScene) => {
            calls.push({ type: 'run', scene: initialScene });
        },
        apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops })
    };
    const surface = dom.window.document.getElementById('eve_surface_project_skip');
    await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: scene(),
        wasmModule,
        mediaTextureResolver: resolver
    });
    return { calls, surface };
};

test('Bevy web renderer omits skipped image spawns from the applied scene baseline until retry succeeds', async () => {
    let failTexture = true;
    const resolver = async () => {
        if (failTexture) throw new Error('bevy_media_texture_image_decode_failed:menu_icon');
        return texture(50, 90, 130);
    };
    const { calls, surface } = await createHarness(resolver);
    const node = imageNode('menu_icon', '/icons/menu.svg');
    const nextScene = scene([node]);
    const spawnOp = { type: VIRTUAL_SCENE_DIFF_TYPES.spawn, node };

    const failed = await applyBevyWebRendererDiffs({
        surface,
        ops: [spawnOp],
        virtualScene: nextScene,
        waitForPresentation: false
    });
    const afterFailure = readBevyWebRendererState(surface);

    assert.equal(failed.ok, true);
    assert.equal(afterFailure.node_count, 0);
    assert.equal(afterFailure.virtual_scene.byId.has('menu_icon'), false);
    assert.deepEqual(afterFailure.virtual_scene.nodes, []);
    assert.deepEqual(afterFailure.skipped_nodes.map((entry) => entry.id), ['menu_icon']);
    assert.equal(calls.some((call) => call.type === 'ops'), false);

    failTexture = false;
    await applyBevyWebRendererDiffs({
        surface,
        ops: [spawnOp],
        virtualScene: nextScene,
        waitForPresentation: false
    });
    const afterRetry = readBevyWebRendererState(surface);
    const opsCall = calls.find((call) => call.type === 'ops');

    assert.equal(afterRetry.node_count, 1);
    assert.equal(afterRetry.virtual_scene.byId.get('menu_icon'), node);
    assert.deepEqual(afterRetry.skipped_nodes, []);
    assert.equal(opsCall.ops.length, 1);
    assert.equal(opsCall.ops[0].type, 'spawn');
    assert.equal(opsCall.ops[0].node.id, 'menu_icon');
    assert.deepEqual(opsCall.ops[0].node.texture, texture(50, 90, 130));
});

test('Bevy web renderer omits skipped initial image nodes from the startup applied scene baseline', async () => {
    let failTexture = true;
    const resolver = async () => {
        if (failTexture) throw new Error('bevy_media_texture_image_decode_failed:initial_menu_icon');
        return texture(80, 100, 120);
    };
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_initial_skip"></canvas></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const calls = [];
    const wasmModule = {
        default: async () => calls.push({ type: 'init' }),
        run_atome_bevy_renderer: (_selector, _width, _height, _surfaceMetrics, initialScene) => {
            calls.push({ type: 'run', scene: initialScene });
        },
        apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops })
    };
    const surface = dom.window.document.getElementById('eve_surface_project_initial_skip');
    const node = imageNode('initial_menu_icon', '/icons/initial-menu.svg');
    const nextScene = scene([node]);

    await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: nextScene,
        wasmModule,
        mediaTextureResolver: resolver
    });
    const afterStart = readBevyWebRendererState(surface);

    assert.equal(calls.find((call) => call.type === 'run').scene.nodes.length, 0);
    assert.equal(afterStart.node_count, 0);
    assert.equal(afterStart.virtual_scene.byId.has('initial_menu_icon'), false);
    assert.deepEqual(afterStart.skipped_nodes.map((entry) => entry.id), ['initial_menu_icon']);

    failTexture = false;
    const retried = await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: nextScene,
        wasmModule,
        mediaTextureResolver: resolver
    });
    const afterRetry = readBevyWebRendererState(surface);
    const opsCall = calls.find((call) => call.type === 'ops');

    assert.equal(retried.synced, true);
    assert.equal(afterRetry.node_count, 1);
    assert.equal(afterRetry.virtual_scene.byId.get('initial_menu_icon'), node);
    assert.deepEqual(afterRetry.skipped_nodes, []);
    assert.equal(opsCall.ops[0].type, 'spawn');
    assert.equal(opsCall.ops[0].node.id, 'initial_menu_icon');
    assert.deepEqual(opsCall.ops[0].node.texture, texture(80, 100, 120));
});

test('Bevy web renderer preserves the previous applied image when a resource texture update is skipped', async () => {
    let currentTexture = texture(20, 40, 60);
    let failTexture = false;
    const resolver = async () => {
        if (failTexture) throw new Error('bevy_media_texture_image_decode_failed:menu_icon');
        return currentTexture;
    };
    const initialNode = imageNode('menu_icon', '/icons/menu-small.svg');
    const { calls, surface } = await createHarness(resolver);

    await applyBevyWebRendererDiffs({
        surface,
        ops: [{ type: VIRTUAL_SCENE_DIFF_TYPES.spawn, node: initialNode }],
        virtualScene: scene([initialNode]),
        waitForPresentation: false
    });
    assert.equal(readBevyWebRendererState(surface).virtual_scene.byId.get('menu_icon').content.source, '/icons/menu-small.svg');

    const resizedNode = imageNode('menu_icon', '/icons/menu-large.svg', {
        bounds: { x: 0, y: 0, width: 36, height: 36 }
    });
    const resourceOp = {
        type: VIRTUAL_SCENE_DIFF_TYPES.updateResource,
        id: 'menu_icon',
        content: resizedNode.content,
        node: resizedNode
    };
    failTexture = true;
    await applyBevyWebRendererDiffs({
        surface,
        ops: [resourceOp],
        virtualScene: scene([resizedNode]),
        waitForPresentation: false
    });
    const afterFailure = readBevyWebRendererState(surface);

    assert.equal(afterFailure.virtual_scene.byId.get('menu_icon').content.source, '/icons/menu-small.svg');
    assert.deepEqual(afterFailure.skipped_nodes.map((entry) => entry.id), ['menu_icon']);
    assert.equal(calls.filter((call) => call.type === 'ops').length, 1);

    currentTexture = texture(90, 120, 150);
    failTexture = false;
    await applyBevyWebRendererDiffs({
        surface,
        ops: [resourceOp],
        virtualScene: scene([resizedNode]),
        waitForPresentation: false
    });
    const afterRetry = readBevyWebRendererState(surface);
    const resourceOps = calls.filter((call) => call.type === 'ops').at(-1).ops;

    assert.equal(afterRetry.virtual_scene.byId.get('menu_icon').content.source, '/icons/menu-large.svg');
    assert.deepEqual(afterRetry.skipped_nodes, []);
    assert.equal(resourceOps.length, 1);
    assert.equal(resourceOps[0].type, 'resource');
    assert.equal(resourceOps[0].patch.id, 'menu_icon');
    assert.deepEqual(resourceOps[0].patch.texture, texture(90, 120, 150));
});
