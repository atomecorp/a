import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import {
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

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

test('Bevy web runtime defers uncached videos after initial scene spawn', async () => {
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
    await new Promise((resolve) => dom.window.setTimeout(resolve, 160));

    assert.equal(result.ok, true);
    assert.equal(result.node_count, 1);
    assert.equal(calls[1].initialNodes.nodes[0].id, 'pending_video');
    assert.equal(calls[1].initialNodes.nodes[0].texture, undefined);
    assert.deepEqual(calls.find((call) => call.type === 'resource')?.payload?.texture, {
        width: 1,
        height: 1,
        rgba: [0, 255, 0, 255]
    });
    assert.equal(readBevyWebRendererState(surface).deferred_nodes.length, 0);
    assert.deepEqual(readBevyWebRendererState(surface).resolved_deferred_nodes, ['pending_video']);
});
