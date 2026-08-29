import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
    MAX_DECODED_ANIMATION_BYTES,
    readPngAnimationMetadata,
    resolveAnimatedPngTexture
} from '../../eVe/domains/rendering/bevy_image_texture_source.js';
import { createBrowserBevyMediaTextureResolver } from '../../eVe/domains/rendering/bevy_media_texture_resolver.js';
import { clearBevyMediaTextureCache } from '../../eVe/domains/rendering/bevy_media_texture_cache.js';
import { mapVirtualSceneTreeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { normalizeTexturePayload } from '../../eVe/domains/rendering/bevy_ui_image_runtime.js';

const bytes = new Uint8Array(readFileSync(new URL('../../atome/src/assets/images/ballanim.png', import.meta.url)));
const options = { source: '/opaque-source-without-extension', width: 100, height: 100, fit: 'contain', cornerRadius: 0,
    fetchResource: async () => new Response(bytes) };

test('APNG contents identify all frames and infinite playback independent of extension', () => {
    expect(readPngAnimationMetadata(bytes)).toEqual({ width: 100, height: 100, frames: 20, plays: 0 });
    expect(readPngAnimationMetadata(new Uint8Array([0, 1, 2]))).toBeNull();
    expect(() => readPngAnimationMetadata(bytes.slice(0, 40))).toThrow(/png_truncated/);
});

test('APNG stays encoded through project and UI projection without creating an image or canvas', async () => {
    clearBevyMediaTextureCache();
    let fetches = 0;
    const resolver = createBrowserBevyMediaTextureResolver({
        documentRef: { defaultView: { devicePixelRatio: 1 }, createElement: () => { throw new Error('APNG must decode in shared core'); } },
        imageTextureScale: 1, fetchResource: async () => { fetches++; return new Response(bytes); }
    });
    const node = { id: 'apng', kind: 'image', bounds: { x: 0, y: 0, width: 100, height: 100 },
        content: { source: options.source }, material: {} };
    const texture = await resolver(node);
    expect(texture.rgba.length).toBe(0);
    expect(texture.animation.bytes).toEqual(bytes);
    const cached = await resolver({ ...node, bounds: { ...node.bounds, x: 200 }, selected: true });
    expect(cached).toEqual(texture);
    expect(fetches).toBe(1);
    const ui = normalizeTexturePayload(texture);
    expect(ui.animation).toBe(texture.animation);
    const payload = mapVirtualSceneTreeToBevyPayload({ nodes: [{ ...node, bevyTexture: ui, renderLayer: 1 }] });
    expect(payload[0].texture.animation.bytes).toEqual(bytes);
    await resolver({ ...node, content: { source: '/replacement.png' } });
    expect(fetches).toBe(2);
});

test('APNG fit keeps transparent margins and bounded downloads reject oversize or failed resources', async () => {
    const texture = await resolveAnimatedPngTexture({ ...options, width: 200 });
    expect(texture.animation.destination_rect).toEqual([50, 0, 100, 100]);
    await expect(resolveAnimatedPngTexture({ ...options, fetchResource: async () => new Response('', { status: 404 }) })).rejects.toThrow(/fetch_failed:404/);
    await expect(resolveAnimatedPngTexture({ ...options, fetchResource: async () => new Response(bytes, { headers: { 'content-length': 33554433 } }) })).rejects.toThrow(/source_limit/);
    let canceled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel() { canceled = true; } });
    await expect(resolveAnimatedPngTexture({ ...options, fetchResource: async () => new Response(stream) })).rejects.toThrow(/source_limit/);
    expect(canceled).toBe(true);
});

test('large Natural APNG bounds keep the decoded animation resident without changing logical display size', async () => {
    const texture = await resolveAnimatedPngTexture({
        ...options,
        width: 1280,
        height: 720,
        cornerRadius: 40
    });
    expect(texture.width).toBeLessThan(1280);
    expect(texture.height).toBeLessThan(720);
    expect(texture.width * texture.height * 4 * 20).toBeLessThanOrEqual(MAX_DECODED_ANIMATION_BYTES);
    expect(texture.width / texture.height).toBeCloseTo(1280 / 720, 2);
    expect(texture.animation.corner_radius).toBeLessThan(40);

    const node = {
        id: 'large_natural_apng',
        kind: 'image',
        bounds: { x: 0, y: 0, width: 1280, height: 720 },
        renderLayer: 1,
        content: { source: options.source },
        bevyTexture: texture
    };
    const [payload] = mapVirtualSceneTreeToBevyPayload({ nodes: [node] });
    expect(payload.logical_size).toEqual([1280, 720]);
    expect([payload.texture.width, payload.texture.height]).toEqual([texture.width, texture.height]);
});

test('Tauri and iOS native mappings preserve animated bytes across JSON bridge startup and resource replacement', async () => {
    const { mapVirtualSceneForNative, mapNativeOps } = await import('../../eVe/domains/rendering/bevy_native_texture_mapping.js');
    const { VIRTUAL_SCENE_DIFF_TYPES } = await import('../../eVe/domains/rendering/virtual_scene_contract.js');
    const texture = await resolveAnimatedPngTexture(options);
    const node = { id: 'apng_native', kind: 'image', bounds: { x: 0, y: 0, width: 100, height: 100 }, renderLayer: 1,
        content: { source: options.source }, bevyTexture: texture };
    const native = JSON.parse(JSON.stringify(await mapVirtualSceneForNative({ nodes: [node] })));
    expect(native.nodes[0].texture.animation.bytes).toEqual(Array.from(bytes));
    const ops = JSON.parse(JSON.stringify(await mapNativeOps([{ type: VIRTUAL_SCENE_DIFF_TYPES.updateResource, id: node.id, content: node.content, node }])));
    expect(ops[0].patch.texture.animation.bytes).toEqual(Array.from(bytes));
});

test('Visual image projection owns its slot layer above the panel and retains clipping', async () => {
    const { projectBevyUiTreeRecords } = await import('../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js');
    const records = projectBevyUiTreeRecords({ treeId: 'visual_test', workspaceLayer: 'projectView', tree: { root: {
        id: 'panel', kind: 'panel', style: { position: [0, 0], size: [300, 300], background: [0.1, 0.1, 0.1, 1], overflow: 'hidden' },
        children: [{ id: 'image', kind: 'panel', style: { position: [0, 0], size: [100, 100], z_index: 2 }, children: [],
            overlayRecordLayout: 'node_box', overlayRecord: { id: 'original', type: 'image', properties: {
                src: options.source, layer: 'project', renderLayer: 0, zIndex: 0
            } } }]
    } } });
    const panel = records.find((r) => r.type === 'shape');
    const image = records.find((r) => r.type === 'image');
    expect(image.properties.renderLayer).toBe(panel.properties.renderLayer + 2);
    expect(image.properties.clip).toBeTruthy();
});

test('selection and translation never replace an animated Atome resource', async () => {
    const { createVirtualSceneTree, diffVirtualSceneTrees } = await import('../../eVe/domains/rendering/virtual_scene_contract.js');
    const record = { id: 'apng_stable', type: 'image', properties: { src: options.source, left: 10, top: 10, width: 100, height: 100 } };
    const before = createVirtualSceneTree([record]);
    const after = createVirtualSceneTree([{ ...record, properties: { ...record.properties, left: 35 } }], { selectedIds: [record.id] });
    expect(diffVirtualSceneTrees(before, after).map((op) => op.type).sort()).toEqual(['updateStyle', 'updateTransform']);
});

test('network failures stay explicit image-resource errors', async () => {
    await expect(resolveAnimatedPngTexture({ ...options, fetchResource: async () => { throw new TypeError('network_failed'); } }))
        .rejects.toThrow('bevy_media_texture_fetch_failed:network_failed');
});
