import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRealtimeAtomeEventsRuntime } from '../../eVe/intuition/runtime/realtime_atome_events_runtime.js';
import { createToolGenesisRealtimePatchRuntime } from '../../eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js';

test('realtime patches update every active projection for the same atome', () => {
    const previousWindow = globalThis.window;
    const windowListeners = new Map();
    const busListeners = new Map();
    const applied = [];

    try {
        globalThis.window = {
            addEventListener: (name, handler) => windowListeners.set(name, handler)
        };
        const runtime = createRealtimeAtomeEventsRuntime({
            eventBus: {
                on: (name, handler) => busListeners.set(name, handler)
            },
            applyRealtimeProps: (atomeId, props, meta) => {
                applied.push({ projection: 'dom', atomeId, props, meta });
                return true;
            },
            applyProjectSceneProps: (atomeId, props, meta) => {
                applied.push({ projection: 'project_scene', atomeId, props, meta });
                return true;
            },
            removeAtomeElement: () => null,
            ensureAtomeRenderState: () => Promise.resolve(null)
        });

        runtime.bindRealtimeAtomeEvents();
        windowListeners.get('squirrel:atome-updated')({
            type: 'squirrel:atome-updated',
            detail: {
                id: 'shared_atom',
                source: 'realtime',
                properties: { left: 320, top: 240 }
            }
        });

        assert.deepEqual(applied.map(({ projection }) => projection), ['dom', 'project_scene']);

        applied.length = 0;
        busListeners.get('atome:changed')({
            event: {
                kind: 'gesture_frame',
                atome_id: 'shared_atom',
                props: { left: 360, top: 280 }
            }
        });

        assert.deepEqual(applied.map(({ projection }) => projection), ['dom', 'project_scene']);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('projection fanout shares one realtime dedup decision', () => {
    const previousDocument = globalThis.document;
    const sceneUpdates = [];
    let dedupChecks = 0;

    try {
        globalThis.document = {
            getElementById: () => null
        };
        const runtime = createToolGenesisRealtimePatchRuntime({
            findProjectSceneByAtomeId: () => ({ project_id: 'receiver_project' }),
            getAtomeElement: () => null,
            resolveAtomeElement: () => null,
            shouldIgnoreRealtimePatch: () => {
                dedupChecks += 1;
                return dedupChecks > 1;
            },
            updateProjectSceneRecordByAtomeId: (update) => {
                sceneUpdates.push(update);
                return Promise.resolve({ ok: true });
            }
        });
        const meta = { source: 'dom:squirrel:atome-updated' };
        const props = { left: 420, top: 280 };

        assert.equal(runtime.applyRealtimeProps('shared_atom', props, meta), false);
        assert.equal(runtime.applyProjectSceneRealtimeProps('shared_atom', props, meta), true);
        assert.equal(dedupChecks, 1);
        assert.deepEqual(sceneUpdates, [{
            atomeId: 'shared_atom',
            properties: props
        }]);
    } finally {
        globalThis.document = previousDocument;
    }
});
