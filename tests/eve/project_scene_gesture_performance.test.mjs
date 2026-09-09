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
    const directTransformCalls = renders.slice(callsAfterPointerDown);
    assert.equal(directTransformCalls.length, 1);
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
    assert.equal(renders.slice(callsAfterPointerDown).every((call) => call.type === 'transform'), true);

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
        clientX: 38,
        clientY: 37,
        pointerId: 12
    }));
    await flushFrames();
});

test('Tauri dense media scene keeps a Molecule drag on one native transform batch per display frame', async () => {
    clearAllProjectScenes();
    const dom = new JSDOM('<!doctype html><html><body><main id="project"></main></body></html>', {
        url: 'tauri://localhost/'
    });
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    const flushFrames = installFrameScheduler(dom.window);
    const nativeCalls = [];
    dom.window.__ATOME_NATIVE_BEVY_PRESENTABLE__ = true;
    dom.window.__TAURI_INTERNALS__ = {
        invoke: async (command, payload) => {
            nativeCalls.push({ command, payload });
            return { success: true, native: true, presentable: true, renderer_mode: 'embedded_scene' };
        }
    };
    dom.window.Atome = { commitBatch: async () => ({ ok: true }) };
    const records = [];
    for (let moleculeIndex = 0; moleculeIndex < 10; moleculeIndex += 1) {
        const ownerId = `dense_molecule_${moleculeIndex}`;
        const column = moleculeIndex % 5;
        const row = Math.floor(moleculeIndex / 5);
        const left = 10 + column * 150;
        const top = 20 + row * 130;
        records.push({
            id: ownerId,
            type: 'group',
            properties: {
                kind: 'group', molecule_entity: 'molecule', left, top,
                width: 125, height: 90, z_index: 0
            }
        });
        for (let memberIndex = 0; memberIndex < 3; memberIndex += 1) {
            const member = makeRecord(`dense_member_${moleculeIndex}_${memberIndex}`);
            member.parent_id = ownerId;
            member.properties.left = left + memberIndex * 40;
            member.properties.top = top + memberIndex * 12;
            member.properties.width = 34;
            member.properties.height = 30;
            member.properties.media_url = memberIndex === 2
                ? '/atome/src/assets/images/ballanim.png'
                : `/media/dense_${moleculeIndex}_${memberIndex}.png`;
            records.push(member);
        }
    }

    await renderProjectScene({
        projectId: 'project_tauri_dense_gesture_perf',
        records,
        host: dom.window.document.getElementById('project'),
        bevyMediaTextureResolver: async () => ({ width: 1, height: 1, rgba: [255, 0, 0, 255] })
    });

    nativeCalls.length = 0;
    ensureBevyPerfDiagnostics().reset({ enabled: true });
    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerdown', {
        clientX: 20, clientY: 25, pointerId: 21
    }));
    for (let index = 1; index <= 8; index += 1) {
        dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointermove', {
            clientX: 20 + index * 3, clientY: 25 + index * 2, pointerId: 21
        }));
    }
    await flushFrames.animationFrames();
    await Promise.resolve();

    const nativeTransformCalls = nativeCalls.filter((call) => call.command === 'bevy_native_apply_ops');
    const perf = ensureBevyPerfDiagnostics().summary();
    assert.equal(records.length, 40);
    assert.equal(nativeTransformCalls.length, 1);
    assert.equal(nativeTransformCalls[0].payload.ops.length, 4);
    assert.equal(nativeTransformCalls[0].payload.ops.every((op) => op.type === 'transform'), true);
    assert.deepEqual(nativeTransformCalls[0].payload.ops.map((op) => op.patch.id), [
        'dense_molecule_0',
        'dense_member_0_0',
        'dense_member_0_1',
        'dense_member_0_2'
    ]);
    assert.equal(perf.counters['gesture.frame.projection_fallback'] || 0, 0);
    assert.equal(perf.counters['projection.runtime.total'] || 0, 0);

    dom.window.document.dispatchEvent(pointerEvent(dom.window, 'pointerup', {
        clientX: 44, clientY: 41, pointerId: 21
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
        assert.equal(pointerMoveRenderCalls.length, 1);
        assert.equal(pointerMoveRenderCalls.every((call) => call.type === 'transform'), true);
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
