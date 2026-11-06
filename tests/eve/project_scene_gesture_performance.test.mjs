import assert from 'node:assert/strict';
import { test } from "vitest";
import { JSDOM } from "jsdom";

import { clearAllProjectScenes, getProjectSceneState, renderProjectScene } from "../../eVe/domains/rendering/project_scene_runtime.js";
import { ensureBevyPerfDiagnostics } from "../../eVe/domains/rendering/bevy_perf_diagnostics_runtime.js";




import { makeGestureRecord as makeRecord, createTestCompositor, installFrameScheduler, pointerEvent } from "./unified_rendering_test_helpers.mjs";

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
    const moveCalls = renders.slice(callsAfterPointerDown);
    assert.equal(moveCalls.every(call => call.type === 'transform' || (call.type === 'ops' && call.ops.every(op => op.type === 'style'))), true);
    const directTransformCalls = moveCalls.filter(call => call.type === 'transform');
    assert.equal(directTransformCalls.length, 1);
    assert.equal(directTransformCalls.every((call) => call.type === 'transform'), true);
    assert.deepEqual(directTransformCalls.at(-1).payload, {
        id: 'drag_perf_atom',
        logical_position: [30, 35],
        logical_size: [40, 30],
        scale: [1, 1],
        rotation: 0,
        origin: [0, 0],
        clip_rect: null,
        clip_rotation: 0,
        clip_rounded_rects: [],
        clip_fades: []
    });

    await flushFrames();

    assert.equal(commits.length, 1);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    assert.deepEqual(commits[0][0].props, { left: 30, top: 35 });
    assert.equal(renders.slice(callsAfterPointerDown).every(call => call.type === 'transform' || (call.type === 'ops' && call.ops.every(op => op.type === 'style'))), true);
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

test('Molecule drag coalesces every member to one direct transform per display frame', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>');
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const renders = [];
    dom.window.Atome = { commitBatch: async () => ({ ok: true }) };
    const owner = makeRecord('drag_perf_molecule');
    owner.type = 'group';
    owner.properties = {
        kind: 'group',
        molecule_entity: 'molecule',
        left: 10,
        top: 20,
        width: 100,
        height: 60,
        z_index: 0
    };
    const memberA = makeRecord('drag_perf_member_a');
    memberA.parent_id = owner.id;
    const memberB = makeRecord('drag_perf_member_b');
    memberB.parent_id = owner.id;
    memberB.properties.left = 70;
    memberB.properties.top = 45;

    await renderProjectScene({
        projectId: 'project_molecule_gesture_perf',
        records: [owner, memberA, memberB],
        host: dom.window.document.getElementById('project'),
        compositor: createTestCompositor(renders)
    });

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
        clientX: 20,
        clientY: 25,
        pointerId: 12
    }));
    await flushFrames();
    const callsAfterPointerDown = renders.length;

    for (let index = 1; index <= 6; index += 1) {
        dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
            clientX: 20 + index * 3,
            clientY: 25 + index * 2,
            pointerId: 12
        }));
    }
    await flushFrames.animationFrames();

    const transforms = renders.slice(callsAfterPointerDown).filter((call) => call.type === 'transform');
    assert.equal(transforms.length, 3);
    assert.deepEqual(transforms.map((call) => [call.payload.id, call.payload.logical_position]), [
        ['drag_perf_molecule', [28, 32]],
        ['drag_perf_member_a', [28, 32]],
        ['drag_perf_member_b', [88, 57]]
    ]);
    assert.equal(renders.slice(callsAfterPointerDown).every(call => call.type === 'transform' || (call.type === 'ops' && call.ops.every(op => op.type === 'style'))), true);

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
        clientX: 38,
        clientY: 37,
        pointerId: 12
    }));
    await flushFrames();
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
        ensureBevyPerfDiagnostics().reset({ enabled: true });
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
        assert.equal(pointerMoveRenderCalls.filter(call => call.type === 'transform').length, 1);
        assert.equal(pointerMoveRenderCalls.every(call => call.type === 'transform' || (call.type === 'ops' && call.ops.every(op => op.type === 'style'))), true);
        assert.equal(perf.counters['gesture.frame.direct_transform'], 1);
        assert.equal(perf.counters['gesture.frame.coalesced'], 2);
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
