import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import {
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';

const flushBevyRun = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Bevy web runtime skips broken initial media without blocking valid nodes', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project_media_failure"></canvas></body></html>');
    const surface = dom.window.document.getElementById('eve_surface_project_media_failure');
    const calls = [];
    const scene = createVirtualSceneTree([
        {
            id: 'broken_video',
            type: 'node',
            kind: 'video',
            bounds: { x: 0, y: 0, width: 160, height: 90 },
            visual: { color: [1, 1, 1, 1], layer: 1 },
            content: { source: '/api/uploads/broken.mp4' },
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
    await flushBevyRun();

    assert.equal(result.ok, true);
    assert.equal(result.node_count, 1);
    assert.deepEqual(result.skipped_nodes, [{
        id: 'broken_video',
        kind: 'video',
        error: 'bevy_media_texture_video_metadata_failed:broken_video'
    }]);
    assert.equal(calls[1].initialNodes.length, 1);
    assert.equal(calls[1].initialNodes[0].id, 'shape_ok');
    assert.equal(readBevyWebRendererState(surface).node_count, 1);
});
