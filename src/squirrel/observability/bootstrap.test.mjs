import assert from 'node:assert/strict';

import { createGlobalObservabilityApi } from './bootstrap.js';

const listeners = new Map();
const env = {
    CustomEvent: class CustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    },
    addEventListener(name, handler) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(handler);
    },
    removeEventListener(name, handler) {
        const list = listeners.get(name) || [];
        listeners.set(name, list.filter((entry) => entry !== handler));
    },
    dispatchEvent(event) {
        (listeners.get(event.type) || []).forEach((handler) => handler(event));
    },
    atome: {
        tools: {
            v2CommandBus: {
                subscribe(handler) {
                    env.__runtimeHandler = handler;
                    return () => {
                        env.__runtimeHandler = null;
                    };
                }
            }
        }
    }
};

const api = createGlobalObservabilityApi({ env });

assert.equal(env.Squirrel.observability, api, 'observability bootstrap should expose a global Squirrel API');
assert.equal(env.atome.observability, api, 'observability bootstrap should expose a global atome API');
assert.equal(env.atome.tools.observability, api, 'observability bootstrap should expose observability under atome.tools');

env.dispatchEvent(new env.CustomEvent('squirrel:mcp', {
    detail: {
        type: 'mcp.operation.failed',
        payload: { error: 'boom' }
    }
}));
env.dispatchEvent(new env.CustomEvent('squirrel:voice:orchestrator', {
    detail: {
        type: 'voice.intent.executed',
        payload: { ok: false, error: 'voice_execution_bridge_unavailable' }
    }
}));
env.__runtimeHandler({
    kind: 'tool_execution_error',
    error: 'runtime_failed'
});

const summary = api.summary();
assert.equal(summary.total, 3, 'observability should ingest browser and runtime failure events');
assert.equal(summary.errors, 3, 'observability should classify failure events as errors');

const runtimeItems = api.list({ channel: 'runtime' });
assert.equal(runtimeItems.items.length, 1, 'observability should expose runtime-channel entries');

api.clear();
assert.equal(api.summary().total, 0, 'observability should clear the local store');

console.log('observability_bootstrap: ok');
