import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
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

test('Project scene drag coalesces move frames into one render and one gesture event per animation frame', async () => {
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
        compositor: {
            async renderAtTime(payload) {
                renders.push(payload);
                return { ok: true, scene: payload.scene };
            }
        }
    });

    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        clientX: 12,
        clientY: 22,
        bubbles: true
    }));
    await flushFrames();
    const rendersAfterPointerDown = renders.length;

    for (let index = 1; index <= 5; index += 1) {
        dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove', {
            clientX: 12 + index * 4,
            clientY: 22 + index * 3,
            bubbles: true
        }));
    }

    await flushFrames.animationFrames();

    assert.equal(commits.length, 0);
    assert.equal(renders.length, rendersAfterPointerDown + 1);

    await flushFrames();

    assert.equal(commits.length, 1);
    assert.equal(commits[0][0].kind, 'gesture_frame');
    assert.deepEqual(commits[0][0].props, { left: 30, top: 35 });
    assert.equal(renders.length, rendersAfterPointerDown + 1);
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
    assert.equal(renders.length, rendersAfterPointerDown + 2);
    assert.equal(dom.window.document.querySelectorAll('.eve-atome,img,video,audio,svg').length, 0);
    assert.equal(dom.window.document.querySelectorAll('canvas#eve_surface_project').length, 1);
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
        compositor: { async renderAtTime(payload) { return { ok: true, scene: payload.scene }; } }
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
        compositor: { async renderAtTime(payload) { return { ok: true, scene: payload.scene }; } }
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
        compositor: {
            async renderAtTime(payload) {
                return { ok: true, scene: payload.scene };
            }
        }
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
        compositor: { async renderAtTime(payload) { return { ok: true, scene: payload.scene }; } }
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
