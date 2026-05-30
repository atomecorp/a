import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';

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
    return async () => {
        while (callbacks.length) {
            const next = callbacks.shift();
            next(Date.now());
            await Promise.resolve();
        }
        await new Promise((resolve) => windowRef.setTimeout(resolve, 0));
    };
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
