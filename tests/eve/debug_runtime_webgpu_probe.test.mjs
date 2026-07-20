import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { installEveDebugRuntime } from '../../eVe/intuition/runtime/eve_intuition/debug_runtime.js';

const installDebug = (windowRef) => {
    globalThis.window = windowRef;
    globalThis.document = windowRef.document;
    const debug = installEveDebugRuntime({
        atomeEditFooterState: {},
        ensureMoleculeMediaRuntime: () => ({
            getMediaState: () => ({}),
            runSuite: () => ({}),
            runMediaTransportSuite: () => ({})
        }),
        readAtomeEditFooterRecordActionBridgeState: () => ({}),
        readSelectionSnapshot: () => ({ ids: [] }),
        resolveAtomeEditFooterKindFromHost: () => 'shape',
        showAtomeEditFooter: async () => ({ ok: true })
    });
    return debug;
};

test('debug runtime exposes renderer-owned scene diagnostics without probing the project canvas', () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="eve_surface_project"></canvas></body></html>');
    const projectCanvas = dom.window.document.getElementById('eve_surface_project');
    let projectCanvasGetContextCalls = 0;
    projectCanvas.getContext = () => {
        projectCanvasGetContextCalls += 1;
        throw new Error('project_canvas_must_not_be_probed');
    };
    const debug = installDebug(dom.window);

    assert.equal(typeof debug.getWorkspaceSceneState, 'function');
    assert.equal(typeof debug.getGPUStats, 'undefined');
    assert.equal(projectCanvasGetContextCalls, 0);
});

test('debug runtime does not install a detached WebGPU capability probe', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const debug = installDebug(dom.window);

    assert.equal(Object.hasOwn(debug, 'getGPUStats'), false);
    assert.equal(typeof debug.getWorkspaceSceneState, 'function');
});
