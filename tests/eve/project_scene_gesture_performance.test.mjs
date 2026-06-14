import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { ensureBevyPerfDiagnostics } from '../../eVe/domains/rendering/bevy_perf_diagnostics_runtime.js';
import { getRenderSurfaceState } from '../../eVe/domains/rendering/surface_runtime.js';
import { createRealtimeAtomeEventsRuntime } from '../../eVe/intuition/runtime/realtime_atome_events_runtime.js';
import {
    resetRealtimeDedup,
    shouldIgnoreRealtimePatch
} from '../../atome/src/squirrel/apis/unified/realtime_dedupe.js';

const makeRecord = (id) => ({
    id,
    type: 'image',
    properties: {
        kind: 'image',
        left: 10,
        top: 20,
        width: 40,
        height: 30,
        z_index: 1,
        media_url: `/media/${id}`
    }
});

const createTestCompositor = (calls = []) => ({
    default: async () => {},
    resolve_bevy_media_texture: async () => ({
        width: 1,
        height: 1,
        rgba: [255, 0, 0, 255]
    }),
    run_atome_bevy_renderer: (canvasSelector, width, height, initialNodes) => {
        calls.push({ type: 'run', canvasSelector, width, height, initialNodes, scene: { atoms: initialNodes.nodes } });
    },
    apply_atome_bevy_spawn: (payload) => calls.push({ type: 'spawn', payload }),
    apply_atome_bevy_despawn: (id) => calls.push({ type: 'despawn', id }),
    apply_atome_bevy_transform: (payload) => calls.push({ type: 'transform', payload }),
    apply_atome_bevy_style: (payload) => calls.push({ type: 'style', payload }),
    apply_atome_bevy_reparent: (payload) => calls.push({ type: 'reparent', payload }),
    apply_atome_bevy_layer: (payload) => calls.push({ type: 'layer', payload }),
    apply_atome_bevy_visibility: (payload) => calls.push({ type: 'visibility', payload }),
    apply_atome_bevy_resource: (payload) => calls.push({ type: 'resource', payload }),
    apply_atome_bevy_text_metadata: (payload) => calls.push({ type: 'text', payload }),
    apply_atome_bevy_surface: (payload) => calls.push({ type: 'surface', payload })
});

const installFrameScheduler = (windowRef) => {
    const callbacks = [];
    windowRef.requestAnimationFrame = (callback) => {
        callbacks.push(callback);
        return callbacks.length;
    };
    const flushAnimationFrames = async () => {
        while (callbacks.length) {
            const next = callbacks.shift();
            next(Date.now());
            await Promise.resolve();
        }
    };
    const flushFrames = async () => {
        await flushAnimationFrames();
        await new Promise((resolve) => windowRef.setTimeout(resolve, 0));
    };
    flushFrames.animationFrames = flushAnimationFrames;
    return flushFrames;
};

const pointerEvent = (windowRef, type, options = {}) => {
    const event = new windowRef.MouseEvent(type, { bubbles: true, ...options });
    Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
    return event;
};

test('Project scene drag applies direct Bevy transforms without full projection during move frames', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    const renders = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };

    await renderProjectScene({
        projectId: 'project_gesture_perf',
        records: [makeRecord('drag_perf_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(renders)
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        clientX: 12,
        clientY: 22,
        bubbles: true
    }));
    await flushFrames();
    const callsAfterPointerDown = renders.length;

    for (let index = 1; index <= 5; index += 1) {
        dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', {
            clientX: 12 + index * 4,
            clientY: 22 + index * 3,
            bubbles: true
        }));
    }

    await flushFrames.animationFrames();

    assert.equal(commits.length, 0);
    const directTransformCalls = renders.slice(callsAfterPointerDown);
    assert.equal(directTransformCalls.length, 5);
    assert.equal(directTransformCalls.every((call) => call.type === 'transform'), true);
    assert.deepEqual(directTransformCalls.at(-1).payload, {
        id: 'drag_perf_atom',
        logical_position: [30, 35],
        logical_size: [40, 30],
        scale: [1, 1],
        rotation: 0,
        origin: [0, 0]
    });

    await flushFrames();

    assert.equal(commits.length, 1);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    assert.deepEqual(commits[0][0].props, { left: 30, top: 35 });
    assert.equal(renders.slice(callsAfterPointerDown).every((call) => call.type === 'transform'), true);
    assert.equal(getProjectSceneState('project_gesture_perf').records[0].properties.left, 30);
    assert.equal(getProjectSceneState('project_gesture_perf').records[0].properties.top, 35);

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', {
        clientX: 32,
        clientY: 37,
        bubbles: true
    }));
    await flushFrames();

    assert.equal(commits.length, 2);
    assert.equal(commits[1][0].kind, 'set');
    assert.deepEqual(commits[1][0].props, { left: 30, top: 35 });
    assert.equal(commits[0][0].gesture_id, commits[1][0].gesture_id);
    assert.equal(renders.filter((call) => call.type === 'transform').at(-1).payload.id, 'drag_perf_atom');
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('Project scene pointermove stays on direct Bevy transforms without commits, sync, texture work, or rebuilds', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    const renders = [];
    const networkCalls = [];
    const textureCalls = [];
    const canvasReadbacks = [];
    let guardArmed = false;
    dom.window.fetch = (...args) => {
        networkCalls.push(args);
        throw new Error('project_pointermove_network_sync_forbidden');
    };
    dom.window.Atome = {
        commit: async (event, options) => {
            commits.push({ method: 'commit', event, options });
            return { ok: true };
        },
        commitBatch: async (events, options) => {
            commits.push({ method: 'commitBatch', events, options });
            return { ok: true };
        }
    };
    const canvasPrototype = dom.window.HTMLCanvasElement?.prototype;
    const originalGetContext = canvasPrototype?.getContext;
    if (canvasPrototype) {
        canvasPrototype.getContext = function patchedGetContext(type) {
            if (guardArmed) canvasReadbacks.push({ type: String(type || '') });
            return {
                canvas: this,
                drawImage: () => {
                    if (guardArmed) canvasReadbacks.push({ type: 'drawImage' });
                },
                getImageData: () => {
                    if (guardArmed) canvasReadbacks.push({ type: 'getImageData' });
                    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
                },
                createImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
                putImageData: () => null,
                clearRect: () => null,
                fillRect: () => null
            };
        };
    }

    try {
        const compositor = createTestCompositor(renders);
        compositor.resolve_bevy_media_texture = async (node) => {
            textureCalls.push({ armed: guardArmed, id: node?.id || null, kind: node?.kind || null });
            if (guardArmed) throw new Error('project_pointermove_texture_resolution_forbidden');
            return { width: 1, height: 1, rgba: [255, 0, 0, 255] };
        };

        await renderProjectScene({
            projectId: 'project_pointermove_direct_lane',
            records: [makeRecord('direct_lane_atom')],
            host: dom.window.document.getElementById('project'),
            compositor
        });

        dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 11 }));
        await flushFrames();
        const callsAfterPointerDown = renders.length;
        const textureCallsAfterPointerDown = textureCalls.length;
        commits.length = 0;
        ensureBevyPerfDiagnostics().reset();
        guardArmed = true;

        [
            { clientX: 16, clientY: 26 },
            { clientX: 24, clientY: 34 },
            { clientX: 36, clientY: 48 }
        ].forEach((move) => {
            dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
                ...move,
                pointerId: 11
            }));
        });
        await flushFrames.animationFrames();
        guardArmed = false;

        const pointerMoveRenderCalls = renders.slice(callsAfterPointerDown);
        const perf = ensureBevyPerfDiagnostics().summary();
        assert.equal(commits.length, 0);
        assert.equal(networkCalls.length, 0);
        assert.equal(textureCalls.length, textureCallsAfterPointerDown);
        assert.deepEqual(canvasReadbacks, []);
        assert.equal(pointerMoveRenderCalls.length, 3);
        assert.equal(pointerMoveRenderCalls.every((call) => call.type === 'transform'), true);
        assert.equal(perf.counters['gesture.frame.direct_transform'], 3);
        assert.equal(perf.counters['gesture.frame.projection_fallback'] || 0, 0);
        assert.equal(perf.counters['projection.runtime.total'] || 0, 0);
        assert.equal(perf.counters['projection.video_decode_sync'] || 0, 0);
        assert.equal(perf.counters['bevy.diff.video_decode_sync'] || 0, 0);
        assert.equal(perf.counters['bevy.op.spawn'] || 0, 0);
        assert.equal(perf.counters['bevy.op.resource'] || 0, 0);
        assert.equal(perf.counters['bevy.op.despawn'] || 0, 0);
        assert.equal(perf.counters['bevy.diff.map_resource'] || 0, 0);

        dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 36, clientY: 48, pointerId: 11 }));
        await flushFrames();
    } finally {
        guardArmed = false;
        if (canvasPrototype) canvasPrototype.getContext = originalGetContext;
    }
});

test('Project scene drag hit-testing uses logical surface coordinates when the canvas is visually scaled', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 160 });
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const record = makeRecord('scaled_drag_atom');
    record.properties.left = 20;
    record.properties.top = 40;
    record.properties.width = 60;
    record.properties.height = 40;

    await renderProjectScene({
        projectId: 'project_scaled_drag',
        records: [record],
        host,
        compositor: createTestCompositor()
    });

    const canvas = dom.window.document.getElementById('eve_surface_project');
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 80,
        width: 100,
        height: 80
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 25, clientY: 30, pointerId: 3 }));
    await Promise.resolve();
    assert.deepEqual(dom.window.__selectedAtomeIds, ['scaled_drag_atom']);

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', { clientX: 35, clientY: 45, pointerId: 3 }));
    await flushFrames();
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 35, clientY: 45, pointerId: 3 }));
    await flushFrames();

    const updated = getProjectSceneState('project_scaled_drag').records[0];
    assert.equal(updated.properties.left, 40);
    assert.equal(updated.properties.top, 70);
    assert.equal(commits.at(-1)[0].kind, 'set');
    assert.deepEqual(commits.at(-1)[0].props, { left: 40, top: 70 });
});

test('Project scene direct drag keeps project media dimensions when width and height are not direct props', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    const renders = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };
    const record = makeRecord('project_sized_media');
    delete record.properties.width;
    delete record.properties.height;
    record.properties.project_width = 320;
    record.properties.project_height = 180;
    record.properties.scale_x = 1.5;
    record.properties.scale_y = 0.75;
    record.properties.rotation = 22;
    record.properties.origin_x = 0.5;
    record.properties.origin_y = 0.5;

    await renderProjectScene({
        projectId: 'project_direct_drag_project_size',
        records: [record],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(renders)
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 9 }));
    await flushFrames();
    const callsAfterPointerDown = renders.length;
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', { clientX: 42, clientY: 52, pointerId: 9 }));
    await flushFrames.animationFrames();

    const transform = renders.slice(callsAfterPointerDown).find((call) => call.type === 'transform');
    assert.deepEqual(transform.payload.logical_size, [320, 180]);
    assert.deepEqual(transform.payload.logical_position, [40, 50]);
    assert.deepEqual(transform.payload.scale, [1.5, 0.75]);
    assert.equal(transform.payload.rotation, 22);
    assert.deepEqual(transform.payload.origin, [0.5, 0.5]);
    assert.equal(commits.length, 0);
});

test('Project scene direct drag keeps ordered gesture frames for realtime sharing and film replay', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    const renders = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events.map((event) => ({
                ...event,
                props: { ...(event.props || {}) },
                payload: event.payload ? {
                    ...event.payload,
                    props: { ...(event.payload.props || {}) }
                } : event.payload
            })));
            return { ok: true };
        }
    };

    await renderProjectScene({
        projectId: 'project_drag_film_replay',
        records: [makeRecord('film_drag_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(renders)
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 19 }));
    await flushFrames();
    const callsAfterPointerDown = renders.length;
    const moves = [
        { clientX: 20, clientY: 30, left: 18, top: 28 },
        { clientX: 28, clientY: 38, left: 26, top: 36 },
        { clientX: 40, clientY: 50, left: 38, top: 48 },
        { clientX: 54, clientY: 62, left: 52, top: 60 }
    ];

    for (const move of moves) {
        dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
            clientX: move.clientX,
            clientY: move.clientY,
            pointerId: 19
        }));
        await flushFrames();
    }

    const gestureFrameBatches = commits.filter((batch) => batch[0]?.kind === 'gesture_frame');
    const expectedFrames = moves.map(({ left, top }) => ({ left, top }));
    const replayableGestureFrames = gestureFrameBatches
        .map((batch) => batch[0])
        .filter((event) => expectedFrames.some((expected) => (
            event.props?.left === expected.left && event.props?.top === expected.top
        )));
    assert.ok(gestureFrameBatches.length >= moves.length);
    assert.deepEqual(replayableGestureFrames.map((event) => event.props), expectedFrames);
    assert.equal(new Set(replayableGestureFrames.map((event) => event.gesture_id)).size, 1);
    assert.equal(gestureFrameBatches.every((batch) => batch[0].payload?.meta?.action === 'drag'), true);

    const directTransforms = renders.slice(callsAfterPointerDown).filter((call) => call.type === 'transform');
    assert.ok(directTransforms.length >= moves.length);
    assert.deepEqual(
        directTransforms
            .map((call) => call.payload.logical_position)
            .filter(([left, top]) => expectedFrames.some((expected) => left === expected.left && top === expected.top)),
        moves.map(({ left, top }) => [left, top])
    );

    const replayedPositions = [];
    const replayState = { left: 10, top: 20 };
    replayableGestureFrames.forEach((event) => {
        Object.assign(replayState, event.props);
        replayedPositions.push({ left: replayState.left, top: replayState.top });
    });
    assert.deepEqual(replayedPositions, expectedFrames);

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 54, clientY: 62, pointerId: 19 }));
    await flushFrames();

    const finalBatch = commits.at(-1);
    assert.equal(finalBatch[0].kind, 'set');
    assert.deepEqual(finalBatch[0].props, { left: 52, top: 60 });
    assert.equal(finalBatch[0].gesture_id, replayableGestureFrames.at(-1).gesture_id);
    assert.equal(getProjectSceneState('project_drag_film_replay').records[0].properties.left, 52);
    assert.equal(getProjectSceneState('project_drag_film_replay').records[0].properties.top, 60);
});

test('Project scene resize accepts five extra logical pixels inside the Atome edge', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };

    await renderProjectScene({
        projectId: 'project_resize_inner_tolerance',
        records: [makeRecord('resize_inner_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
        clientX: 36,
        clientY: 36,
        pointerId: 5
    }));
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
        clientX: 46,
        clientY: 46,
        pointerId: 5
    }));
    await flushFrames();
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
        clientX: 46,
        clientY: 46,
        pointerId: 5
    }));
    await flushFrames();

    const updated = getProjectSceneState('project_resize_inner_tolerance').records[0];
    assert.equal(commits.at(-1)[0].kind, 'set');
    assert.deepEqual(commits.at(-1)[0].props, { width: 53, height: 40 });
    assert.equal(updated.properties.left, 10);
    assert.equal(updated.properties.top, 20);
    assert.equal(updated.properties.width, 53);
    assert.equal(updated.properties.height, 40);
});

test('Project scene ignores move and end events from a non-owner pointer', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };

    await renderProjectScene({
        projectId: 'project_pointer_owner',
        records: [makeRecord('drag_pointer_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 7 }));
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', { clientX: 44, clientY: 55, pointerId: 8 }));
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 44, clientY: 55, pointerId: 8 }));
    await flushFrames();

    const state = getProjectSceneState('project_pointer_owner');
    assert.equal(commits.length, 0);
    assert.equal(state.records[0].properties.left, 10);
    assert.equal(state.records[0].properties.top, 20);
});

test('Project scene cancels active drag when the render surface resizes', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const host = dom.window.document.getElementById('project');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 80 });
    const flushFrames = installFrameScheduler(dom.window);
    const commits = [];
    dom.window.Atome = {
        commitBatch: async (events) => {
            commits.push(events);
            return { ok: true };
        }
    };

    await renderProjectScene({
        projectId: 'project_resize_cancel',
        records: [makeRecord('drag_resize_atom')],
        host,
        compositor: createTestCompositor()
    });

    const canvas = dom.window.document.getElementById('eve_surface_project');
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 2 }));
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 140 });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await flushFrames();
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', { clientX: 40, clientY: 50, pointerId: 2 }));
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 40, clientY: 50, pointerId: 2 }));
    await flushFrames();

    assert.equal(getRenderSurfaceState(canvas).pointerSession, null);
    assert.equal(commits.length, 0);
    assert.equal(getProjectSceneState('project_resize_cancel').records[0].properties.left, 10);
});

test('Project scene surface records async commit timeout failures without an unhandled rejection', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    let commitCalls = 0;
    dom.window.Atome = {
        commitBatch: async () => {
            commitCalls += 1;
            throw new Error('Request timeout');
        }
    };

    await renderProjectScene({
        projectId: 'project_gesture_timeout',
        records: [makeRecord('drag_timeout_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    const canvas = dom.window.document.getElementById('eve_surface_project');
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        clientX: 12,
        clientY: 22,
        bubbles: true
    }));
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', {
        clientX: 20,
        clientY: 30,
        bubbles: true
    }));
    await flushFrames();

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup', {
        clientX: 20,
        clientY: 30,
        bubbles: true
    }));
    await flushFrames();

    const state = getRenderSurfaceState(canvas);
    assert.equal(commitCalls, 2);
    assert.equal(state.last_intent_error.message, 'Request timeout');
    assert.equal(state.last_intent_error.kind, 'drag.end');
    const guard = dom.window.__EVE_RECENT_LOCAL_DRAG_ENDS__?.drag_timeout_atom;
    assert.equal(guard.left, 18);
    assert.equal(guard.top, 28);
    assert.equal(shouldIgnoreRealtimePatch('drag_timeout_atom', {
        left: 10,
        top: 20,
        gesture_id: guard.gestureId
    }, {
        authorId: 'delayed_author_echo',
        gestureId: guard.gestureId
    }), true);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
});

test('Project scene records local drag end geometry for delayed realtime guards', async () => {
    resetRealtimeDedup();
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    dom.window.Atome = {
        commitBatch: async () => ({ ok: true })
    };

    await renderProjectScene({
        projectId: 'project_local_drag_guard',
        records: [makeRecord('drag_guard_atom')],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor()
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', { clientX: 12, clientY: 22, pointerId: 4 }));
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', { clientX: 38, clientY: 48, pointerId: 4 }));
    await flushFrames();
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', { clientX: 38, clientY: 48, pointerId: 4 }));
    await flushFrames();

    const guard = dom.window.__EVE_RECENT_LOCAL_DRAG_ENDS__?.drag_guard_atom;
    assert.equal(guard.left, 36);
    assert.equal(guard.top, 46);
    assert.match(guard.gestureId, /^project_drag_drag_guard_atom_/);
    assert.equal(shouldIgnoreRealtimePatch('drag_guard_atom', { left: 10, top: 20 }), true);
    assert.equal(getProjectSceneState('project_local_drag_guard').records[0].properties.left, 36);
});

test('Realtime dedupe rejects delayed authored geometry echo for recent project-scene gesture', () => {
    resetRealtimeDedup();
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const endedAt = Date.now();
    dom.window.AdoleAPI = {
        auth: {
            getCurrentInfo: () => ({ user_id: 'current_user' })
        }
    };
    dom.window.__EVE_RECENT_LOCAL_DRAG_ENDS__ = {
        delayed_echo_atom: {
            endedAt,
            left: 120,
            top: 130,
            gestureId: 'project_drag_delayed_echo_atom_1',
            txId: 'project_drag_delayed_echo_atom_1'
        }
    };

    assert.equal(shouldIgnoreRealtimePatch('delayed_echo_atom', {
        left: 60,
        top: 70
    }, {
        authorId: 'other_user'
    }), false);

    assert.equal(shouldIgnoreRealtimePatch('delayed_echo_atom', {
        left: 60,
        top: 70
    }, {
        authorId: 'transport_echo_author',
        gestureId: 'project_drag_delayed_echo_atom_1'
    }), true);
});

test('Realtime atome events route project-scene patches before stale state fetch fallback', () => {
    const listeners = new Map();
    const projectScenePatches = [];
    let fallbackFetches = 0;
    const runtime = createRealtimeAtomeEventsRuntime({
        eventBus: {
            on(name, handler) {
                listeners.set(name, handler);
            }
        },
        removeAtomeElement: () => null,
        applyRealtimeProps: () => false,
        applyProjectSceneProps: (atomeId, props, meta) => {
            projectScenePatches.push({ atomeId, props, meta });
            return true;
        },
        ensureAtomeRenderState: () => {
            fallbackFetches += 1;
            return Promise.resolve(null);
        }
    });

    globalThis.window = { addEventListener: () => null };
    runtime.bindRealtimeAtomeEvents();
    listeners.get('atome:changed')?.({
        event: {
            kind: 'gesture_frame',
            atome_id: 'canvas_atom',
            gesture_id: 'project_drag_canvas_atom_1',
            tx_id: 'project_drag_canvas_atom_1',
            props: { left: 12, top: 24 }
        },
        state: null
    });

    assert.deepEqual(projectScenePatches, [{
        atomeId: 'canvas_atom',
        props: { left: 12, top: 24 },
        meta: {
            source: 'event_bus:gesture_frame',
            author_id: null,
            gesture_id: 'project_drag_canvas_atom_1',
            tx_id: 'project_drag_canvas_atom_1'
        }
    }]);
    assert.equal(fallbackFetches, 0);
});
