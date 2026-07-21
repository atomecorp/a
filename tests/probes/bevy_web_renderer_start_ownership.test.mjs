import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
    readBevyWebRendererState,
    startBevyWebRenderer
} from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';
import {
    claimBevyEventLoopOwner,
    markBevyEventLoopInvoked,
    releaseBevyEventLoopOwner
} from '../../eVe/domains/rendering/bevy_web_renderer_start_state.js';

const emptyScene = (id) => ({ id, revision: 0, nodes: [], roots: [], effects: [], byId: new Map() });

test('Bevy Web never invokes Winit twice after a same-canvas terminal start failure', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="terminal_start_surface"></canvas>');
    const surface = dom.window.document.getElementById('terminal_start_surface');
    let runnerCalls = 0;
    const wasmModule = {
        default: async () => {},
        run_atome_bevy_renderer: () => {
            runnerCalls += 1;
            throw new Error('runner_failed_after_event_loop_creation');
        }
    };
    const input = {
        surface,
        width: 320,
        height: 240,
        virtualScene: emptyScene('terminal_start_scene'),
        wasmModule
    };

    await assert.rejects(startBevyWebRenderer(input), /runner_failed_after_event_loop_creation/);
    assert.equal(readBevyWebRendererState(surface)?.event_loop_invoked, true);
    await assert.rejects(
        startBevyWebRenderer(input),
        /bevy_renderer_start_failed_terminal:runner_failed_after_event_loop_creation/
    );
    assert.equal(runnerCalls, 1);
});

test('Bevy Web still permits retry when failure occurs before the Winit runner is invoked', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="retryable_start_surface"></canvas>');
    const surface = dom.window.document.getElementById('retryable_start_surface');
    const wasmModule = {
        default: async () => {},
        run_atome_bevy_renderer: () => {}
    };
    const input = {
        surface,
        width: 320,
        height: 240,
        virtualScene: emptyScene('retryable_start_scene'),
        wasmModule
    };

    await assert.rejects(
        startBevyWebRenderer({ ...input, runExportName: 'missing_runner' }),
        /bevy_renderer_export_required:missing_runner/
    );
    assert.equal(readBevyWebRendererState(surface)?.event_loop_invoked, false);
    const result = await startBevyWebRenderer(input);
    assert.equal(result.started, true);
});

test('Bevy Web event-loop ownership survives a re-evaluated renderer module', async () => {
    const dom = new JSDOM('<!doctype html><canvas id="hot_reload_surface"></canvas>');
    const surface = dom.window.document.getElementById('hot_reload_surface');
    const reloadedState = await import(`../../eVe/domains/rendering/bevy_web_renderer_start_state.js?test_reload=${Date.now()}`);

    claimBevyEventLoopOwner({ canvas: surface, ownerWindow: dom.window });
    markBevyEventLoopInvoked({ canvas: surface, ownerWindow: dom.window });
    assert.throws(
        () => reloadedState.claimBevyEventLoopOwner({ canvas: surface, ownerWindow: dom.window }),
        /bevy_renderer_event_loop_already_invoked/
    );
    releaseBevyEventLoopOwner({ canvas: surface, ownerWindow: dom.window });
});
