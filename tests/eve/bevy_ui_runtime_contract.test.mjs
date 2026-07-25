import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createEveBevyUiRuntime, normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { hydrateImageTree } from '../../eVe/domains/rendering/bevy_ui_image_runtime.js';
import { DEFERRED_TEXTURE_BATCH_SIZE, withResolvedMediaTexture } from '../../eVe/domains/rendering/bevy_media_resource_runtime.js';
import { mapVirtualSceneNodeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import {
    clearAllProjectScenes,
    getProjectSceneState,
    reconcileProjectSceneRecordsByPrefix,
    renderProjectScene,
    updateProjectSceneOverlay
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import {
    clearAllFlowerPointerLocks,
    clearFlowerPointerLock,
    setFlowerPointerLock
} from '../../eVe/intuition/flower/context_pointer_lock.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';

const createSurface = () => {
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    return dom.window.document.getElementById('eve_surface_project');
};

const projectDom = () => installDom('<!doctype html><html><body><main id="project"></main></body></html>');

test('BevyUI image prewarming hydrates without mounting or projecting a tree', async () => {
    const surface = createSurface();
    let resolutions = 0;
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => {
            resolutions += 1;
            return { width: 1, height: 1, rgba: [255, 255, 255, 255] };
        },
        requestFrame: () => 0
    });
    const hydrated = await runtime.prewarmTreeImages({
        surface,
        tree: {
            id: 'prewarm_tree',
            root: {
                id: 'prewarm_root',
                kind: 'root',
                children: [{
                    id: 'prewarm_icon',
                    kind: 'image',
                    image: { source: 'prewarm.svg' },
                    style: { size: [24, 24] }
                }]
            }
        }
    });

    assert.equal(resolutions, 1);
    assert.equal(hydrated.root.children[0].image.texture.rgba.length, 4);
    assert.equal(runtime.state.trees.size, 0);
    assert.equal(runtime.state.sourceTrees.size, 0);
    assert.equal(runtime.readOverlayDiagnostics().treeCount, 0);
});

test('BevyUI label hydration retains its requested global content tint', async () => {
    const hydrated = await hydrateImageTree({
        surface: createSurface(),
        imageResolverFactory: () => async () => ({
            width: 1, height: 1, rgba: new Uint8ClampedArray([255, 255, 255, 255])
        }),
        requestFrame: () => 0,
        tree: {
            id: 'label_tree', kind: 'root', children: [{
                id: 'system_label', kind: 'image',
                image: { source: 'bevy-ui-label:system_label', text: 'System', tint: [1, 0, 0, 0.5] },
                style: { size: [80, 20], font_size: 10 }
            }]
        }
    });
    assert.deepEqual(hydrated.children[0].image.tint, [1, 0, 0, 0.5]);
});

test('BevyUI tree normalization keeps supported minimal panel controls deterministic', () => {
    const handlers = new Map();
    const tree = normalizeBevyUiTree({
        id: 'panel_tree',
        handlers,
        tree: {
            kind: 'root',
            id: 'panel_root',
            style: {
                size: [320, 240],
                background: [0.1, 0.2, 0.3, 1],
                translation: [4, 6],
                scale: [0.8, 1.1],
                rotation: 12,
                origin: [0.5, 0.5]
            },
            children: [
                {
                    kind: 'tabs',
                    id: 'panel_tabs',
                    children: [
                        { kind: 'tab', id: 'tab_info', text: 'Info', on: { activate: () => 'info' } }
                    ]
                },
                { kind: 'accordion', id: 'section_main', text: 'Main' },
                { kind: 'icon', id: 'panel_icon', image: { source: './assets/images/icons/home.svg' } },
                { kind: 'image', id: 'panel_image', source: './assets/images/icons/atome.svg' },
                { kind: 'text_input', id: 'title_input', text: 'Name' },
                { kind: 'slider', id: 'opacity_slider', style: { size: [140, 24] } }
            ]
        }
    });

    assert.equal(tree.id, 'panel_tree');
    assert.equal(tree.root.children.length, 6);
    assert.equal(tree.root.children[0].children[0].kind, 'tab');
    assert.equal(tree.root.children[2].image.source, './assets/images/icons/home.svg');
    assert.equal(tree.root.children[3].image.source, './assets/images/icons/atome.svg');
    assert.deepEqual(tree.root.style.size, [320, 240]);
    assert.deepEqual(tree.root.style.translation, [4, 6]);
    assert.deepEqual(tree.root.style.scale, [0.8, 1.1]);
    assert.equal(tree.root.style.rotation, 12);
    assert.deepEqual(tree.root.style.origin, [0.5, 0.5]);
    assert.equal(handlers.has('panel_tree:tab_info:activate'), true);
});

test('BevyUI runtime sends mount/update/unmount ops without creating component DOM', async () => {
    const surface = createSurface();
    const calls = [];
    const module = {
        apply_atome_bevy_ui_ops: (ops) => calls.push(...ops),
        read_atome_bevy_ui_diagnostics: () => ({ mounted_trees: 1, mounted_nodes: 2 }),
        drain_atome_bevy_ui_events: () => []
    };
    const runtime = createEveBevyUiRuntime({
        moduleProvider: async () => module,
        nativeUiEnabled: true,
        requestFrame: () => 0
    });
    const tree = {
        id: 'ui_root',
        kind: 'root',
        children: [{ id: 'open_button', kind: 'button', text: 'Open' }]
    };

    await runtime.mountTree({ id: 'ui_tree', surface, tree });
    await runtime.updateTree({ id: 'ui_tree', surface, tree });
    await runtime.updateTreeMotion({
        id: 'ui_tree',
        updates: [{ nodeId: 'open_button', position: [20, 30], scale: [0.9, 1.05], rotation: 8, origin: [0.5, 0.5], opacity: 0.7 }]
    });
    await runtime.unmountTree('ui_tree');

    assert.deepEqual(calls.map((op) => op.type), ['mount_tree', 'update_tree', 'update_node_style', 'unmount_tree']);
    assert.deepEqual(calls[2].style.scale, [0.9, 1.05]);
    assert.equal(calls[2].style.rotation, 8);
    assert.equal(calls[0].tree.root.children[0].id, 'open_button');
    assert.equal(surface.ownerDocument.querySelectorAll('button, input, [data-bevy-ui]').length, 0);
    assert.deepEqual(runtime.readDiagnostics(), {
        mounted_trees: 1,
        mounted_nodes: 2,
        overlay: {
            treeCount: 0,
            lastOverlayRecordCount: 0,
            lastOverlayError: null,
            trees: []
        }
    });
});

test('BevyUI runtime uses the project overlay path without native WASM UI ops by default', async () => {
    const surface = createSurface();
    let moduleRequested = false;
    const runtime = createEveBevyUiRuntime({
        moduleProvider: async () => {
            moduleRequested = true;
            return { apply_atome_bevy_ui_ops: () => {} };
        },
        imageResolverFactory: () => async () => null,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'ui_tree',
        surface,
        tree: {
            id: 'ui_root',
            kind: 'root',
            children: [{ id: 'open_button', kind: 'button', text: 'Open' }]
        }
    });
    await runtime.unmountTree('ui_tree');

    assert.equal(moduleRequested, false);
    assert.deepEqual(runtime.readDiagnostics(), {
        overlay: {
            treeCount: 0,
            lastOverlayRecordCount: 0,
            lastOverlayError: null,
            trees: []
        }
    });
    assert.deepEqual(runtime.drainEvents(), []);
    assert.equal(runtime.state.nativeUiEnabled, false);
});

test('BevyUI tree suspension retains projection records and disables hit-testing atomically', async () => {
    const surface = createSurface();
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
    const projections = [];
    const runtime = createEveBevyUiRuntime({
        requestFrame: () => 0,
        overlayProjector: {
            clear: async () => null,
            project: async ({ previousIds, opacity }) => {
                projections.push({ previousIds: [...previousIds], opacity });
                return ['retained_dashboard_record'];
            }
        }
    });
    await runtime.mountTree({
        id: 'dashboard_tree',
        surface,
        tree: {
            id: 'dashboard_tree',
            root: {
                id: 'dashboard_root',
                kind: 'root',
                style: { size: [200, 200] },
                children: [{
                    id: 'dashboard_action',
                    kind: 'button',
                    style: { position: [0, 0], size: [80, 80] },
                    on: { activate: () => null }
                }]
            }
        }
    });
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 20, clientY: 20 })?.nodeId, 'dashboard_action');

    const suspended = await runtime.setTreeSuspended({ id: 'dashboard_tree', suspended: true });
    assert.equal(suspended.suspended, true);
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 20, clientY: 20 }), null);
    assert.deepEqual(runtime.state.overlayRecordIds.get('dashboard_tree'), ['retained_dashboard_record']);
    assert.equal(runtime.readOverlayDiagnostics().trees[0].interactiveNodeCount, 0);
    assert.equal(runtime.readOverlayDiagnostics().trees[0].suspended, true);
    assert.equal(runtime.readOverlayDiagnostics().trees[0].opacity, 0);

    await runtime.setTreeSuspended({ id: 'dashboard_tree', suspended: false });
    assert.equal(runtime.hitTestAtClientPoint({ surface, clientX: 20, clientY: 20 })?.nodeId, 'dashboard_action');
    assert.equal(runtime.readOverlayDiagnostics().trees[0].suspended, false);
    assert.equal(runtime.readOverlayDiagnostics().trees[0].opacity, 1);
    assert.deepEqual(projections.map((entry) => entry.opacity), [1]);
});

test('BevyUI runtime resolves image nodes into texture payloads before WASM ops', async () => {
    const surface = createSurface();
    const calls = [];
    const resolvedNodes = [];
    const module = {
        apply_atome_bevy_ui_ops: (ops) => calls.push(...ops),
        drain_atome_bevy_ui_events: () => []
    };
    const runtime = createEveBevyUiRuntime({
        moduleProvider: async () => module,
        nativeUiEnabled: true,
        imageResolverFactory: () => async (node) => {
            resolvedNodes.push(node);
            return {
            width: 4,
            height: 4,
            rgba: new Uint8ClampedArray([
                0, 0, 0, 255,
                ...new Array((4 * 4 * 4) - 4).fill(0)
            ])
            };
        },
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'ui_tree',
        surface,
        tree: {
            id: 'ui_root',
            kind: 'root',
            children: [
                {
                    id: 'home_icon',
                    kind: 'image',
                    image: { source: './assets/images/icons/home.svg', tint: [1, 1, 1, 1] },
                    style: { size: [24, 24], radius: 6 }
                }
            ]
        }
    });

    assert.equal(calls[0].tree.root.children[0].image.source, './assets/images/icons/home.svg');
    assert.equal(calls[0].tree.root.children[0].image.texture.width, 4);
    assert.equal(calls[0].tree.root.children[0].image.texture.height, 4);
    assert.equal(calls[0].tree.root.children[0].image.texture.rgba.length, 64);
    assert.deepEqual(Array.from(calls[0].tree.root.children[0].image.texture.rgba.slice(0, 4)), [255, 255, 255, 255]);
    assert.equal(resolvedNodes[0].material.cornerRadius, 6, 'image texture rasterization must receive the BevyUI node corner radius');
    assert.equal(surface.ownerDocument.querySelectorAll('img, svg, button, input, [data-bevy-ui]').length, 0);
});

test('BevyUI image hydration uses a three-texture frame budget in tree order', async () => {
    const surface = createSurface();
    const resolved = [];
    let frameYields = 0;
    await hydrateImageTree({
        surface,
        imageResolverFactory: () => async (node) => {
            resolved.push(node.id);
            return {
                width: 1,
                height: 1,
                rgba: new Uint8ClampedArray([255, 255, 255, 255])
            };
        },
        requestFrame: (callback) => {
            frameYields += 1;
            callback();
            return frameYields;
        },
        tree: {
            id: 'ui_root',
            kind: 'root',
            children: Array.from({ length: 7 }, (_value, index) => ({
                id: `preview_${index + 1}`,
                kind: 'image',
                image: { source: `preview_${index + 1}.png` },
                style: { size: [12, 12] }
            }))
        }
    });

    assert.deepEqual(resolved, ['preview_1', 'preview_2', 'preview_3', 'preview_4', 'preview_5', 'preview_6', 'preview_7'], 'BevyUI image hydration must preserve visible-first tree order');
    assert.equal(DEFERRED_TEXTURE_BATCH_SIZE, 3);
    assert.equal(frameYields, 2, 'seven images must yield twice with the shared deferred texture frame budget');
});

test('BevyUI live image hydration resolves an already-mounted tree without frame-budget waits', async () => {
    const surface = createSurface();
    let frameYields = 0;
    await hydrateImageTree({
        surface,
        imageResolverFactory: () => async () => ({
            width: 1,
            height: 1,
            rgba: new Uint8ClampedArray([255, 255, 255, 255])
        }),
        requestFrame: (callback) => {
            frameYields += 1;
            callback();
            return frameYields;
        },
        yieldBetweenBatches: false,
        tree: {
            id: 'ui_root',
            kind: 'root',
            children: Array.from({ length: 7 }, (_value, index) => ({
                id: `live_${index + 1}`,
                kind: 'image',
                image: { source: `live_${index + 1}.png` },
                style: { size: [12, 12] }
            }))
        }
    });

    assert.equal(frameYields, 0, 'live updates must not inherit fresh-mount hydration delays');
});

test('BevyUI runtime keeps WASM tree in logical UI units like the CSS hit-test tree', async () => {
    const surface = createSurface();
    surface.width = 200;
    surface.height = 100;
    surface.getBoundingClientRect = () => ({ width: 100, height: 50, left: 0, top: 0, right: 100, bottom: 50 });
    const calls = [];
    const module = {
        apply_atome_bevy_ui_ops: (ops) => calls.push(...ops),
        drain_atome_bevy_ui_events: () => []
    };
    const runtime = createEveBevyUiRuntime({
        moduleProvider: async () => module,
        nativeUiEnabled: true,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'ui_tree',
        surface,
        tree: {
            id: 'ui_root',
            kind: 'root',
            style: { position: [10, 12], size: [40, 20], gap: 2, font_size: 9 },
            children: [{ id: 'open_button', kind: 'button', text: 'Open', style: { size: [20, 10] } }]
        }
    });

    assert.deepEqual(runtime.state.trees.get('ui_tree').tree.root.style.position, [10, 12]);
    assert.deepEqual(calls[0].tree.root.style.position, [10, 12]);
    assert.deepEqual(calls[0].tree.root.style.size, [40, 20]);
    assert.equal(calls[0].tree.root.style.gap, 2);
    assert.equal(calls[0].tree.root.style.font_size, 9);
    assert.deepEqual(calls[0].tree.root.children[0].style.size, [20, 10]);
});

test('BevyUI runtime drains renderer events into stored JS handlers', async () => {
    const surface = createSurface();
    const received = [];
    const module = {
        apply_atome_bevy_ui_ops: () => {},
        drain_atome_bevy_ui_events: () => [
            { tree_id: 'ui_tree', node_id: 'open_button', kind: 'button', event: 'activate' }
        ]
    };
    const runtime = createEveBevyUiRuntime({
        moduleProvider: async () => module,
        nativeUiEnabled: true,
        requestFrame: () => 0
    });

    await runtime.mountTree({
        id: 'ui_tree',
        surface,
        tree: {
            id: 'ui_root',
            kind: 'root',
            children: [
                {
                    id: 'open_button',
                    kind: 'button',
                    on: { activate: (event) => received.push(event.nodeId) }
                }
            ]
        }
    });
    runtime.drainEvents();

    assert.deepEqual(received, ['open_button']);
});

test('BevyUI discards the underlying control release when a primary press becomes a Flower long press', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120 });
    const capturedPointerIds = [];
    const releasedPointerIds = [];
    surface.setPointerCapture = (pointerId) => capturedPointerIds.push(pointerId);
    surface.releasePointerCapture = (pointerId) => releasedPointerIds.push(pointerId);
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const received = [];
    try {
        const runtime = createEveBevyUiRuntime({
            imageResolverFactory: () => async () => null,
            requestFrame: () => 0
        });
        await runtime.mountTree({
            id: 'underlying_tree',
            surface,
            tree: {
                id: 'underlying_root',
                kind: 'root',
                style: { size: [200, 120] },
                children: [{
                    id: 'underlying_button',
                    kind: 'button',
                    style: { position: [20, 20], size: [80, 40] },
                    on: {
                        press: () => received.push('press'),
                        release: () => received.push('release'),
                        activate: () => received.push('activate')
                    }
                }]
            }
        });
        const pointerEvent = (type) => {
            const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, {
                pointerId: { value: 41 },
                clientX: { value: 40 },
                clientY: { value: 40 }
            });
            return event;
        };
        surface.dispatchEvent(pointerEvent('pointerdown'));
        assert.deepEqual(received, ['press'], 'the canonical surface interceptor observes the initial press exactly once');
        assert.deepEqual(capturedPointerIds, [41], 'a BevyUI press must retain its terminal pointer event');
        assert.equal(setFlowerPointerLock(41, { phase: 'long_press' }), true);
        surface.dispatchEvent(pointerEvent('pointerup'));
        assert.deepEqual(received, ['press'], 'the release must not activate the control beneath an opened Flower');
        assert.equal(clearFlowerPointerLock(41), true, 'the opening lock must end with its own terminal release');
        surface.dispatchEvent(pointerEvent('pointerdown'));
        surface.dispatchEvent(pointerEvent('pointerup'));
        assert.deepEqual(
            received,
            ['press', 'press', 'release', 'activate'],
            'the next deliberate press/release must activate its visible BevyUI target'
        );
        assert.deepEqual(releasedPointerIds, [41, 41], 'every handled terminal event must release the captured pointer');
        await runtime.unmountTree('underlying_tree');
    } finally {
        clearAllFlowerPointerLocks();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('BevyUI emits one activation for pointer input and ignores delayed compatibility mouse cycles', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 120, right: 200, bottom: 120 });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const received = [];
    try {
        const runtime = createEveBevyUiRuntime({
            imageResolverFactory: () => async () => null,
            requestFrame: () => 0
        });
        await runtime.mountTree({
            id: 'native_mouse_tree',
            surface,
            tree: {
                id: 'native_mouse_tree',
                root: {
                    id: 'native_mouse_root', kind: 'root', style: { size: [200, 120] }, children: [{
                        id: 'native_mouse_button', kind: 'button', style: { position: [20, 20], size: [80, 40] },
                        on: {
                            press: () => received.push('press'),
                            release: () => received.push('release'),
                            activate: () => received.push('activate')
                        }
                    }]
                }
            }
        });
        const mouse = (type, timeStamp) => {
            const event = new dom.window.MouseEvent(type, {
                bubbles: true, cancelable: true, clientX: 40, clientY: 40
            });
            Object.defineProperty(event, 'timeStamp', { value: timeStamp });
            return event;
        };
        const pointer = (type, { pointerId, pointerType, timeStamp }) => {
            const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, {
                pointerId: { value: pointerId },
                pointerType: { value: pointerType },
                clientX: { value: 40 },
                clientY: { value: 40 },
                timeStamp: { value: timeStamp }
            });
            return event;
        };
        surface.dispatchEvent(pointer('pointerdown', {
            pointerId: 1,
            pointerType: 'mouse',
            timeStamp: 100
        }));
        surface.dispatchEvent(pointer('pointerup', {
            pointerId: 1,
            pointerType: 'mouse',
            timeStamp: 110
        }));
        assert.deepEqual(received, ['press', 'release', 'activate'], 'a real mouse pointer cycle activates once');

        for (const [index, delayMs] of [0, 48, 100, 300, 700].entries()) {
            const pointerId = 10 + index;
            const startedAt = 1000 + (index * 2000);
            surface.dispatchEvent(pointer('pointerdown', {
                pointerId,
                pointerType: 'touch',
                timeStamp: startedAt
            }));
            surface.dispatchEvent(pointer('pointerup', {
                pointerId,
                pointerType: 'touch',
                timeStamp: startedAt + 10
            }));
            surface.dispatchEvent(mouse('mousedown', startedAt + delayMs));
            surface.dispatchEvent(mouse('mouseup', startedAt + 10 + delayMs));
            surface.dispatchEvent(mouse('click', startedAt + 10 + delayMs));
            assert.equal(
                received.filter((entry) => entry === 'activate').length,
                index + 2,
                `the ${delayMs} ms compatibility mouse cycle must not duplicate touch activation`
            );
        }
        await runtime.unmountTree('native_mouse_tree');
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Virtual Scene preserves overlay image textures so tinted SVG payloads reach Bevy', () => {
    const lightgrayTexture = {
        width: 2,
        height: 1,
        rgba: [
            211, 211, 211, 255,
            211, 211, 211, 180
        ]
    };
    const scene = createVirtualSceneTree([{
        id: '__eve_bevy_ui_menu_icon',
        type: 'image',
        properties: {
            left: 0,
            top: 0,
            width: 24,
            height: 24,
            source: './assets/images/icons/ai.svg'
        },
        bevyTexture: lightgrayTexture
    }]);
    const node = scene.nodes[0];
    const payload = mapVirtualSceneNodeToBevyPayload(node);

    assert.deepEqual(node.bevyTexture, lightgrayTexture);
    assert.match(node.content.textureSignature, /^2x1:8:/);
    assert.deepEqual(Array.from(payload.texture.rgba.slice(0, 4)), [211, 211, 211, 255]);
    assert.equal(payload.source, './assets/images/icons/ai.svg');
});

test('Media texture resolution preserves prehydrated BevyUI icon textures', async () => {
    const lightgrayTexture = {
        width: 1,
        height: 1,
        rgba: [211, 211, 211, 255]
    };
    const node = {
        id: 'icon_node',
        kind: 'image',
        content: { source: './assets/images/icons/ai.svg' },
        bevyTexture: lightgrayTexture
    };
    const resolved = await withResolvedMediaTexture(node, () => {
        throw new Error('resolver_should_not_replace_prehydrated_texture');
    });

    assert.equal(resolved, node);
    assert.deepEqual(resolved.bevyTexture, lightgrayTexture);
});

test('BevyUI overlay updates keep stable icon records without duplicate textures', async () => {
    clearAllProjectScenes();
    const surface = createSurface();
    let rect = { width: 240, height: 240 };
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: rect.width, bottom: rect.height, ...rect });
    const texture = { width: 2, height: 1, rgba: [211, 211, 211, 255, 211, 211, 211, 160] };
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => texture,
        requestFrame: () => 0
    });
    const tree = {
        id: 'overlay_root',
        root: {
            id: 'overlay_root_node',
            kind: 'root',
            style: { size: [240, 240] },
            children: [{
                id: 'home_icon',
                kind: 'image',
                image: { source: './assets/images/icons/home.svg', tint: [211 / 255, 211 / 255, 211 / 255, 1] },
                style: { position: [180, 180], size: [24, 24] }
            }]
        }
    };

    await runtime.mountTree({ id: 'ui_tree', surface, tree });
    const firstRecords = getProjectSceneState('__eve_dashboard_workspace__').records.filter((record) => String(record.id || '').startsWith('__eve_bevy_ui_'));
    rect = { width: 120, height: 120 };
    await runtime.updateTree({ id: 'ui_tree', surface, tree });
    const nextRecords = getProjectSceneState('__eve_dashboard_workspace__').records.filter((record) => String(record.id || '').startsWith('__eve_bevy_ui_'));
    const ids = nextRecords.map((record) => record.id);
    const imageRecords = nextRecords.filter((record) => record.type === 'image');

    assert.equal(firstRecords.length, nextRecords.length);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(imageRecords.length, 1);
    assert.deepEqual(Array.from(imageRecords[0].bevyTexture.rgba.slice(0, 4)), [211, 211, 211, 255]);
});

test('BevyUI runtime ignores stale async overlay renders so latest icon texture wins', async () => {
    clearAllProjectScenes();
    const surface = createSurface();
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 120, bottom: 120, width: 120, height: 120 });
    const pending = [];
    const waitForPending = async (count) => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            if (pending.length >= count) return;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        throw new Error(`pending_texture_resolution_missing:${count}`);
    };
    const runtime = createEveBevyUiRuntime({
        imageResolverFactory: () => async (node) => new Promise((resolve) => pending.push({ id: node.id, resolve })),
        requestFrame: () => 0
    });
    const tree = (tint) => ({
        id: 'race_root',
        root: {
            id: 'race_root_node',
            kind: 'root',
            style: { size: [120, 120] },
            children: [{
                id: 'race_icon',
                kind: 'image',
                image: { source: './assets/images/icons/home.svg', tint },
                style: { position: [10, 10], size: [24, 24] }
            }]
        }
    });

    const first = runtime.mountTree({ id: 'race_tree', surface, tree: tree([1, 0, 0, 1]) });
    await waitForPending(1);
    const second = runtime.updateTree({ id: 'race_tree', surface, tree: tree([0, 1, 0, 1]) });
    pending[0].resolve({ width: 1, height: 1, rgba: [255, 255, 255, 255] });
    await waitForPending(2);
    const staleScene = getProjectSceneState('__eve_dashboard_workspace__');
    const staleRecords = (staleScene?.records || []).filter((record) => String(record.id || '').endsWith('race_icon_image'));
    assert.equal(staleRecords.length, 0);
    pending[1].resolve({ width: 1, height: 1, rgba: [255, 255, 255, 255] });
    await Promise.all([first, second]);
    const finalRecords = getProjectSceneState('__eve_dashboard_workspace__').records.filter((record) => String(record.id || '').endsWith('race_icon_image'));

    assert.equal(finalRecords.length, 1);
    assert.deepEqual(Array.from(finalRecords[0].bevyTexture.rgba.slice(0, 4)), [0, 255, 0, 255]);
});

test('BevyUI menu overlay updates preserve Dashboard media records and effects', async () => {
    clearAllProjectScenes();
    const dom = projectDom();
    const host = dom.window.document.getElementById('project');
    const dashboardEffects = [{
        id: '__eve_dashboard_backdrop_blur',
        kind: 'backdrop_blur',
        bounds: { x: 0, y: 0, width: 1200, height: 720 },
        sourceLayerMax: 4,
        targetLayer: 4,
        radius: 24,
        downsample: 0.5
    }];
    const dashboardRecords = [
        {
            id: '__eve_dashboard_card_media_projects_alpha',
            type: 'image',
            properties: {
                left: 16,
                top: 20,
                width: 128,
                height: 72,
                source: '/api/projects/alpha/preview.png',
                media_width: 640,
                media_height: 360,
                source_domain: 'eve.dashboard.projects'
            }
        },
        {
            id: '__eve_dashboard_card_media_contacts_beta',
            type: 'image',
            properties: {
                left: 16,
                top: 116,
                width: 72,
                height: 72,
                source: '/api/contacts/beta/avatar.png',
                media_width: 256,
                media_height: 256,
                source_domain: 'eve.dashboard.contacts'
            }
        }
    ];
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [],
        host,
        compositor: createTestCompositor()
    });
    await reconcileProjectSceneRecordsByPrefix({
        projectId: '__eve_dashboard_workspace__',
        prefix: '__eve_dashboard_',
        records: dashboardRecords,
        changedRecords: dashboardRecords,
        effects: dashboardEffects,
        host,
        keepForeground: false
    });

    await updateProjectSceneOverlay({
        projectId: '__eve_dashboard_workspace__',
        records: [{
            id: '__eve_bevy_ui_main_menu_home_icon_image',
            type: 'image',
            properties: {
                left: 1100,
                top: 660,
                width: 24,
                height: 24,
                source: './assets/images/icons/home.svg'
            },
            bevyTexture: { width: 1, height: 1, rgba: [211, 211, 211, 255] }
        }],
        keepForeground: true,
        force: true
    });
    const state = getProjectSceneState('__eve_dashboard_workspace__');
    const recordsById = new Map(state.records.map((record) => [record.id, record]));

    assert.deepEqual(state.effects, dashboardEffects);
    for (const record of dashboardRecords) {
        assert.equal(recordsById.has(record.id), true);
        assert.equal(recordsById.get(record.id).properties.source, record.properties.source);
        assert.equal(recordsById.get(record.id).properties.media_width, record.properties.media_width);
        assert.equal(recordsById.get(record.id).properties.media_height, record.properties.media_height);
    }
    assert.equal(recordsById.has('__eve_bevy_ui_main_menu_home_icon_image'), true);
});
