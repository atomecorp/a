import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    BEVY_RENDERER_ADAPTER_DEFINITIONS,
    DEFAULT_BEVY_RENDERER_ADAPTER_REGISTRY,
    createDefaultBevyRendererAdapterRegistry,
    mapVirtualSceneLayerToBevyPatch,
    mapVirtualSceneNodeToBevyPayload,
    mapVirtualSceneResourceToBevyPatch,
    mapVirtualSceneStyleToBevyPatch
} from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import {
    createRendererAdapterRegistry,
    getRendererAdapter,
    registerRendererAdapter
} from '../../eVe/domains/rendering/renderer_adapter_registry.js';

const texture = {
    width: 1,
    height: 1,
    rgba: [255, 255, 255, 255]
};

const projectionFixtures = Object.freeze([
    Object.freeze({
        id: 'shape_registry',
        kind: 'shape',
        bounds: { x: 1, y: 2, width: 40, height: 20 },
        renderLayer: 3,
        material: { fill: '#336699' }
    }),
    Object.freeze({
        id: 'text_registry',
        kind: 'text',
        bounds: { x: 3, y: 4, width: 80, height: 24 },
        renderLayer: 4,
        material: { fill: '#ffffff' },
        text: { text: 'Registry text' },
        bevyTexture: texture
    }),
    Object.freeze({
        id: 'image_registry',
        kind: 'image',
        bounds: { x: 5, y: 6, width: 100, height: 70 },
        renderLayer: 5,
        material: null,
        content: { source: '/api/uploads/image.png' },
        bevyTexture: texture
    }),
    Object.freeze({
        id: 'video_registry',
        kind: 'video',
        bounds: { x: 7, y: 8, width: 160, height: 90 },
        renderLayer: 6,
        material: null,
        content: { source: '/api/recordings/video.webm', naturalWidth: 1920, naturalHeight: 1080 },
        bevyTexture: texture
    }),
    Object.freeze({
        id: 'audio_waveform_registry',
        kind: 'audio_waveform',
        bounds: { x: 9, y: 10, width: 200, height: 48 },
        renderLayer: 7,
        material: { fill: 'rgb(32, 201, 151)' },
        content: { peaks: [0.2, -0.4, 1.4] },
        playbackProgress: 0.25,
        bevyTexture: texture
    })
]);

test('Renderer adapter registry is explicit and clone-safe', () => {
    const registry = createRendererAdapterRegistry();
    registerRendererAdapter(registry, {
        kind: 'CUSTOM_KIND',
        renderer: 'Bevy',
        capabilities: {
            node_payload: true
        }
    });
    const adapter = getRendererAdapter(registry, 'custom_kind');
    const list = registry.list();

    assert.equal(adapter.kind, 'custom_kind');
    assert.equal(adapter.renderer, 'bevy');
    assert.equal(adapter.capabilities.node_payload, true);
    assert.throws(() => {
        list[0].capabilities.node_payload = false;
    }, /read only property|object is not extensible/);
    assert.equal(registry.get('custom_kind').capabilities.node_payload, true);
    assert.throws(() => registry.assert('missing', 'custom_kind_missing'), /custom_kind_missing/);
});

test('Default Bevy renderer adapter registry declares the currently supported kinds', () => {
    assert.deepEqual(
        BEVY_RENDERER_ADAPTER_DEFINITIONS.map((adapter) => adapter.kind),
        ['shape', 'text', 'image', 'video', 'audio_waveform']
    );
    assert.deepEqual(
        createDefaultBevyRendererAdapterRegistry().list().map((adapter) => adapter.kind),
        DEFAULT_BEVY_RENDERER_ADAPTER_REGISTRY.list().map((adapter) => adapter.kind)
    );
});

test('Bevy renderer adapter registry keeps existing node projections identical', () => {
    const registry = createDefaultBevyRendererAdapterRegistry();
    const defaultPayloads = projectionFixtures.map((node) => mapVirtualSceneNodeToBevyPayload(node));
    const registryPayloads = projectionFixtures.map((node) => mapVirtualSceneNodeToBevyPayload(node, { registry }));

    assert.deepEqual(registryPayloads, defaultPayloads);
    assert.deepEqual(defaultPayloads.map((payload) => payload.kind), [
        'shape',
        'text',
        'image',
        'video',
        'audio_waveform'
    ]);
});

test('Bevy projection delegates kind-specific node and resource mapping to registered adapters', () => {
    const registry = createRendererAdapterRegistry([{
        kind: 'shape',
        renderer: 'bevy',
        mapNodePayload: ({ payload }) => ({
            ...payload,
            adapter_marker: 'node'
        }),
        mapResourcePatch: ({ patch }) => ({
            ...patch,
            adapter_marker: 'resource'
        }),
        capabilities: {
            node_payload: true,
            resource_patch: true
        }
    }]);
    const payload = mapVirtualSceneNodeToBevyPayload({
        id: 'shape_adapter_delegate',
        kind: 'shape',
        bounds: { x: 0, y: 0, width: 16, height: 16 },
        renderLayer: 1,
        material: { fill: '#000000' }
    }, { registry });
    const resourcePatch = mapVirtualSceneResourceToBevyPatch({
        id: 'shape_adapter_delegate',
        content: { source: '/adapter/source.png' },
        node: { kind: 'shape' }
    }, { registry });

    assert.equal(payload.adapter_marker, 'node');
    assert.equal(resourcePatch.adapter_marker, 'resource');
});

test('Bevy projection normalizes oversized CSS layers to the Rust i32 boundary', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_recording_layer',
        kind: 'video',
        parentId: null,
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        layer: Date.now(),
        material: null,
        content: { source: '/api/recordings/video.mp4' }
    });
    const style = mapVirtualSceneStyleToBevyPatch({
        id: 'video_recording_layer',
        patch: { zIndex: Number.MAX_SAFE_INTEGER, material: null }
    });
    const layer = mapVirtualSceneLayerToBevyPatch({
        id: 'video_recording_layer',
        layer: Number.MAX_SAFE_INTEGER
    });

    assert.equal(node.layer, 2147483647);
    assert.equal(style.layer, 2147483647);
    assert.equal(layer.layer, 2147483647);
});

test('Bevy video resource patch carries natural media texture size', () => {
    const patch = mapVirtualSceneResourceToBevyPatch({
        id: 'video_resized',
        content: {
            source: '/api/media/video.mp4',
            naturalWidth: 478,
            naturalHeight: 850
        },
        node: {
            id: 'video_resized',
            kind: 'video'
        }
    });

    assert.equal(patch.source, '/api/media/video.mp4');
    assert.deepEqual(patch.texture_size, [478, 850]);
});

test('Bevy video texture size ignores ambiguous display width and height content fields', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_display_size_only',
        kind: 'video',
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        layer: 1,
        material: null,
        content: {
            source: '/api/media/video.mp4',
            width: 320,
            height: 180
        }
    });
    const patch = mapVirtualSceneResourceToBevyPatch({
        id: 'video_display_size_only',
        content: {
            source: '/api/media/video.mp4',
            width: 320,
            height: 180
        },
        node: {
            id: 'video_display_size_only',
            kind: 'video'
        }
    });

    assert.equal(node.texture_size, undefined);
    assert.equal(patch.texture_size, undefined);
});
