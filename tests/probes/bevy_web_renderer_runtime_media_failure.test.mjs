import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import {
    applyBevyWebRendererDiffs,
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import { VIRTUAL_SCENE_DIFF_TYPES } from '../../eVe/domains/rendering/virtual_scene_contract.js';

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

const createTextTextureDocument = ({ devicePixelRatio = 2 } = {}) => {
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
            clearRect: () => null,
            scale: () => null,
            save: () => null,
            restore: () => null,
            beginPath: () => null,
            rect: () => null,
            clip: () => null,
            fillRect: () => null,
            strokeText: () => null,
            fillText: () => null,
            measureText: (text) => ({ width: String(text || '').length * 8 }),
            getImageData: (_x, _y, width, height) => {
                const data = new Uint8ClampedArray(width * height * 4);
                data[0] = 255;
                data[3] = 128;
                data[7] = 0;
                return { data };
            }
        })
    };
    return {
        defaultView: { devicePixelRatio },
        createElement: (name) => {
            assert.equal(name, 'canvas');
            return canvas;
        }
    };
};

test('Bevy web runtime keeps broken initial deferred media present without blocking valid nodes', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_media_failure"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_media_failure');
    const calls = [];
    const scene = createVirtualSceneTree([
        {
            id: 'broken_video',
            type: 'video',
            properties: {
                x: 0,
                y: 0,
                width: 160,
                height: 90,
                source: '/api/uploads/broken.mp4'
            },
            children: []
        },
        {
            id: 'shape_ok',
            type: 'node',
            kind: 'shape',
            bounds: { x: 4, y: 8, width: 40, height: 30 },
            visual: { color: [0.2, 0.4, 0.6, 1], layer: 2 },
            content: {},
            children: []
        }
    ], { id: 'runtime_scene_media_failure' });
    const result = await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: scene,
        mediaTextureResolver: async (node) => {
            throw new Error(`bevy_media_texture_video_metadata_failed:${node.id}`);
        },
        wasmModule: {
            default: async () => calls.push({ type: 'init' }),
            run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
                calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
            }
        }
    });
    assert.equal(result.deferred_nodes.length, 1);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 90));

    assert.equal(result.ok, true);
    assert.equal(result.node_count, 2);
    assert.deepEqual(result.skipped_nodes, []);
    assert.equal(calls[1].initialNodes.nodes.length, 2);
    assert.deepEqual(calls[1].initialNodes.nodes.map((node) => node.id), ['broken_video', 'shape_ok']);
    assert.equal(readBevyWebRendererState(surface).node_count, 2);
    assert.equal(readBevyWebRendererState(surface).deferred_nodes.length, 1);
    assert.equal(readBevyWebRendererState(surface).skipped_nodes.length, 0);
});

test('Bevy web runtime resolves persisted video posters during initial scene projection', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_video_poster"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_video_poster');
    const calls = [];
    const scene = createVirtualSceneTree([{
        id: 'video_with_poster',
        type: 'video',
        properties: {
            x: 0,
            y: 0,
            width: 160,
            height: 90,
            source: '/api/uploads/movie.mp4',
            posterDataUrl: 'data:image/png;base64,poster'
        },
        children: []
    }], { id: 'runtime_scene_video_poster' });
    const result = await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: scene,
        mediaTextureResolver: async () => ({
            width: 1,
            height: 1,
            rgba: [255, 0, 0, 255]
        }),
        wasmModule: {
            default: async () => calls.push({ type: 'init' }),
            run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
                calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
            }
        }
    });
    await flushBevyRun();

    assert.equal(result.ok, true);
    assert.equal(result.node_count, 1);
    assert.equal(result.deferred_nodes.length, 0);
    assert.equal(calls[1].initialNodes.nodes[0].id, 'video_with_poster');
    assert.deepEqual(calls[1].initialNodes.nodes[0].texture, {
        width: 1,
        height: 1,
        rgba: [255, 0, 0, 255]
    });
});

test('Bevy web runtime keeps source-backed uncached videos present after initial scene spawn', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_pending_video"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_pending_video');
    const calls = [];
    const scene = createVirtualSceneTree([{
        id: 'pending_video',
        type: 'video',
        properties: {
            x: 0,
            y: 0,
            width: 160,
            height: 90,
            source: '/api/uploads/pending.mp4'
        },
        children: []
    }], { id: 'runtime_scene_pending_video' });
    const result = await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: scene,
        mediaTextureResolver: async () => ({
            width: 1,
            height: 1,
            rgba: [0, 255, 0, 255]
        }),
        wasmModule: {
            default: async () => calls.push({ type: 'init' }),
            run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
                calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
            },
            apply_atome_bevy_resource: (payload) => calls.push({ type: 'resource', payload })
        }
    });
    assert.equal(result.deferred_nodes.length, 1);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 320));

    assert.equal(result.ok, true);
    assert.equal(result.node_count, 1);
    assert.equal(calls[1].initialNodes.nodes[0].id, 'pending_video');
    assert.equal(calls[1].initialNodes.nodes[0].texture, undefined);
    assert.equal(calls.some((call) => call.type === 'resource'), false);
    assert.equal(readBevyWebRendererState(surface).deferred_nodes.length, 1);
    assert.deepEqual(readBevyWebRendererState(surface).resolved_deferred_nodes, []);
});

test('Bevy text texture resolver oversamples and bleeds transparent edge colors for linear sampling', async () => {
    const resolver = createBrowserBevyMediaTextureResolver({
        documentRef: createTextTextureDocument({ devicePixelRatio: 2 }),
        textTextureScale: 2,
        textMaxTextureSize: 512
    });

    const texture = await resolver({
        id: 'text_quality',
        kind: 'text',
        bounds: { x: 0, y: 0, width: 32, height: 16 },
        material: { fill: '#ff0000' },
        text: { text: 'A', style: { font_size: 12 } },
        content: { text: 'A' }
    });

    assert.equal(texture.width, 64);
    assert.equal(texture.height, 32);
    assert.equal(texture.rgba[4], 255);
    assert.equal(texture.rgba[5], 0);
    assert.equal(texture.rgba[6], 0);
    assert.equal(texture.rgba[7], 0);
});

test('Bevy web runtime refreshes text texture when a transform changes text bounds', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_text_resize"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_text_resize');
    const calls = [];
    const wasmModule = {
        default: async () => calls.push({ type: 'init' }),
        run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
            calls.push({ type: 'run', canvasSelector, width, height, initialNodes });
        },
        apply_atome_bevy_transform: (payload) => calls.push({ type: 'transform', payload }),
        apply_atome_bevy_text_metadata: (payload) => calls.push({ type: 'text', payload }),
        request_atome_bevy_redraw: () => calls.push({ type: 'redraw' })
    };
    const textNode = {
        id: 'resized_text',
        kind: 'text',
        parentId: null,
        localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, originX: 0, originY: 0 },
        bounds: { x: 0, y: 0, width: 80, height: 24 },
        material: { fill: '#ffffff' },
        text: { text: 'Resize me', style: { font_size: 18 } },
        content: { text: 'Resize me' },
        renderLayer: 0,
        selected: false
    };
    const scene = {
        id: 'runtime_scene_text_resize',
        roots: ['resized_text'],
        nodes: [textNode],
        byId: new Map([['resized_text', textNode]])
    };
    await startBevyWebRenderer({
        surface,
        width: 320,
        height: 240,
        virtualScene: scene,
        mediaTextureResolver: async (node) => ({
            width: Math.round(node.bounds.width * 2),
            height: Math.round(node.bounds.height * 2),
            rgba: new Array(Math.round(node.bounds.width * 2) * Math.round(node.bounds.height * 2) * 4).fill(255)
        }),
        wasmModule
    });

    await applyBevyWebRendererDiffs({
        surface,
        virtualScene: scene,
        ops: [{
            type: VIRTUAL_SCENE_DIFF_TYPES.updateTransform,
            id: 'resized_text',
            localTransform: { ...textNode.localTransform },
            bounds: { x: 0, y: 0, width: 120, height: 36 },
            node: {
                ...textNode,
                bounds: { x: 0, y: 0, width: 120, height: 36 }
            }
        }]
    });

    assert.deepEqual(calls.find((call) => call.type === 'transform')?.payload, {
        id: 'resized_text',
        logical_position: [0, 0],
        logical_size: [120, 36],
        scale: [1, 1],
        rotation: 0,
        origin: [0, 0]
    });
    assert.deepEqual(calls.find((call) => call.type === 'text')?.payload?.texture?.width, 240);
    assert.deepEqual(calls.find((call) => call.type === 'text')?.payload?.texture?.height, 72);
});
