import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    BEVY_RENDERER_ADAPTER_DEFINITIONS,
    DEFAULT_BEVY_RENDERER_ADAPTER_REGISTRY,
    createDefaultBevyRendererAdapterRegistry,
    mapVirtualSceneEffectsToBevyPayload,
    mapVirtualSceneLayerToBevyPatch,
    mapVirtualSceneNodeToBevyPayload,
    mapVirtualSceneResourceToBevyPatch,
    mapVirtualSceneStyleToBevyPatch,
    mapVirtualSceneTransformToBevyPatch,
    normalizeColorFilters,
    normalizeTransition
} from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import {
    createRendererAdapterRegistry,
    getRendererAdapter,
    registerRendererAdapter
} from '../../eVe/domains/rendering/renderer_adapter_registry.js';

const texture = {
    width: 1,
    height: 1,
    rgba: new Uint8ClampedArray([255, 255, 255, 255])
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
    }),
    Object.freeze({
        id: 'procedural_sdf_registry',
        kind: 'procedural_sdf',
        bounds: { x: 20, y: 20, width: 320, height: 320 },
        renderLayer: 8,
        material: {
            procedural: {
                morph: [1, 1, 0, 0], phase: 2, pulse: 0.01, time: 1.5, intensity: 0.4,
                glow_reveal: 1, core_reveal: 0.8, shell_reveal: 0.75, disappearing: 1
            }
        }
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

test('Bevy projection maps backdrop blur scene effects to Rust payloads', () => {
    const effects = mapVirtualSceneEffectsToBevyPayload({
        effects: [{
            id: '__eve_dashboard_backdrop_blur',
            kind: 'backdrop_blur',
            bounds: { x: 0, y: 0, width: 1200, height: 742 },
            sourceLayerMax: 4,
            targetLayer: 4,
            radius: 30,
            downsample: 0.5,
            tint: 'rgba(7,8,10,0.16)'
        }]
    });

    assert.deepEqual(effects, [{
        id: '__eve_dashboard_backdrop_blur',
        kind: 'backdrop_blur',
        bounds: [0, 0, 1200, 742],
        source_layer_max: 4,
        target_layer: 4,
        radius: 30,
        downsample: 0.5,
        tint: [7 / 255, 8 / 255, 10 / 255, 0.16]
    }]);
});

test('Default Bevy renderer adapter registry declares the currently supported kinds', () => {
    assert.deepEqual(
        BEVY_RENDERER_ADAPTER_DEFINITIONS.map((adapter) => adapter.kind),
        ['shape', 'text', 'image', 'video', 'audio_waveform', 'procedural_sdf']
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
        'audio_waveform',
        'procedural_sdf'
    ]);
    assert.ok(defaultPayloads.find((payload) => payload.texture)?.texture.rgba instanceof Uint8Array);
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

test('Bevy projection carries reusable shape corner radius to native payloads', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'rounded_shape',
        kind: 'shape',
        bounds: { x: 4, y: 8, width: 120, height: 60 },
        layer: 3,
        material: {
            fill: '#ffffff',
            cornerRadius: 3
        }
    });
    assert.equal(node.corner_radius, 3);
});

test('Bevy projection carries opacity through initial nodes and style patches', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_opacity',
        kind: 'video',
        parentId: null,
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        renderLayer: 1,
        opacity: 0.42,
        material: null,
        content: { source: '/api/media/video.mp4' }
    });
    const style = mapVirtualSceneStyleToBevyPatch({
        id: 'video_opacity',
        patch: { opacity: 0.35, material: null }
    });
    const clamped = mapVirtualSceneStyleToBevyPatch({
        id: 'video_opacity',
        patch: { opacity: 8, material: null }
    });

    assert.equal(node.opacity, 0.42);
    assert.equal(style.opacity, 0.35);
    assert.equal(clamped.opacity, 1);
});

test('Bevy projection carries canonical local transforms through nodes and transform patches', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_transform_contract',
        kind: 'video',
        parentId: null,
        bounds: { x: 12, y: 24, width: 320, height: 180 },
        localTransform: {
            x: 12,
            y: 24,
            scaleX: 1.5,
            scaleY: 0.75,
            rotation: 22,
            originX: 0.5,
            originY: 0.5
        },
        renderLayer: 1,
        material: null,
        content: { source: '/api/media/video.mp4' }
    });
    const patch = mapVirtualSceneTransformToBevyPatch({
        id: 'video_transform_contract',
        bounds: { x: 30, y: 40, width: 640, height: 360 },
        localTransform: {
            x: 30,
            y: 40,
            scaleX: 1.25,
            scaleY: 1.1,
            rotation: -15,
            originX: 0.25,
            originY: 0.75
        }
    });

    assert.deepEqual(node.logical_position, [12, 24]);
    assert.deepEqual(node.logical_size, [320, 180]);
    assert.deepEqual(node.scale, [1.5, 0.75]);
    assert.equal(node.rotation, 22);
    assert.deepEqual(node.origin, [0.5, 0.5]);
    assert.deepEqual(patch.logical_position, [30, 40]);
    assert.deepEqual(patch.logical_size, [640, 360]);
    assert.deepEqual(patch.scale, [1.25, 1.1]);
    assert.equal(patch.rotation, -15);
    assert.deepEqual(patch.origin, [0.25, 0.75]);
});

test('Bevy projection rejects unsupported advanced blend modes instead of falling back to normal', () => {
    const baseNode = {
        id: 'video_blend_contract',
        kind: 'video',
        parentId: null,
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        renderLayer: 1,
        opacity: 0.75,
        content: { source: '/api/media/video.mp4' }
    };

    assert.equal(mapVirtualSceneNodeToBevyPayload({
        ...baseNode,
        material: { blendMode: 'normal' }
    }).opacity, 0.75);
    assert.equal(mapVirtualSceneStyleToBevyPatch({
        id: 'video_blend_contract',
        patch: { material: { blendMode: 'source_over' } }
    }).color, null);

    for (const blendMode of ['add', 'multiply', 'screen']) {
        assert.throws(
            () => mapVirtualSceneNodeToBevyPayload({
                ...baseNode,
                material: { blendMode }
            }),
            new RegExp(`bevy_projection_blend_mode_unsupported:video_blend_contract:${blendMode}`)
        );
        assert.throws(
            () => mapVirtualSceneStyleToBevyPatch({
                id: 'video_blend_contract',
                patch: { material: { blendMode } }
            }),
            new RegExp(`bevy_projection_blend_mode_unsupported:video_blend_contract:${blendMode}`)
        );
    }
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

test('Bevy video projection carries UV crop rectangles for nodes and resource patches', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_uv_crop',
        kind: 'video',
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        layer: 1,
        material: null,
        content: {
            source: '/api/media/video.mp4',
            uvRect: { x: 0.25, y: 0.125, width: 0.5, height: 0.75 }
        }
    });
    const patch = mapVirtualSceneResourceToBevyPatch({
        id: 'video_uv_crop',
        content: {
            source: '/api/media/video.mp4',
            uv_rect: [0.1, 0.2, 0.6, 0.5]
        },
        node: {
            id: 'video_uv_crop',
            kind: 'video'
        }
    });

    assert.deepEqual(node.uv_rect, [0.25, 0.125, 0.5, 0.75]);
    assert.deepEqual(patch.uv_rect, [0.1, 0.2, 0.6, 0.5]);
});

test('Bevy video resource patch can explicitly clear a previous UV crop rectangle', () => {
    const patch = mapVirtualSceneResourceToBevyPatch({
        id: 'video_uv_crop_clear',
        previousContent: {
            source: '/api/media/video.mp4',
            uvRect: [0.25, 0.125, 0.5, 0.75]
        },
        content: {
            source: '/api/media/video.mp4'
        },
        node: {
            id: 'video_uv_crop_clear',
            kind: 'video'
        }
    });

    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'uv_rect'), true);
    assert.equal(patch.uv_rect, null);
});

test('Bevy video projection converts pixel source crop rectangles to normalized UVs', () => {
    const node = mapVirtualSceneNodeToBevyPayload({
        id: 'video_source_crop',
        kind: 'video',
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        layer: 1,
        material: null,
        content: {
            source: '/api/media/video.mp4',
            naturalWidth: 1920,
            naturalHeight: 1080,
            sourceRect: { x: 480, y: 270, width: 960, height: 540 }
        }
    });
    const patch = mapVirtualSceneResourceToBevyPatch({
        id: 'video_source_crop',
        content: {
            source: '/api/media/video.mp4',
            naturalWidth: 1920,
            naturalHeight: 1080,
            cropRect: [240, 108, 480, 216]
        },
        node: {
            id: 'video_source_crop',
            kind: 'video'
        }
    });

    assert.deepEqual(node.uv_rect, [0.25, 0.25, 0.5, 0.5]);
    assert.deepEqual(patch.uv_rect, [0.125, 0.1, 0.25, 0.2]);
});

test('Bevy video projection rejects crop rectangles outside the media bounds', () => {
    assert.throws(
        () => mapVirtualSceneNodeToBevyPayload({
            id: 'video_uv_invalid',
            kind: 'video',
            bounds: { x: 0, y: 0, width: 320, height: 180 },
            layer: 1,
            material: null,
            content: {
                source: '/api/media/video.mp4',
                uvRect: [0.75, 0, 0.5, 1]
            }
        }),
        /bevy_projection_uv_rect_bounds_invalid:video_uv_invalid/
    );
    assert.throws(
        () => mapVirtualSceneResourceToBevyPatch({
            id: 'video_source_crop_invalid',
            content: {
                source: '/api/media/video.mp4',
                naturalWidth: 1920,
                naturalHeight: 1080,
                sourceRect: [1600, 0, 640, 100]
            },
            node: {
                id: 'video_source_crop_invalid',
                kind: 'video'
            }
        }),
        /bevy_projection_source_rect_bounds_invalid:video_source_crop_invalid/
    );
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
