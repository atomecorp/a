import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window } = installMockBrowserEnv();

const handlerCalls = [];
window.atome.tools.handlers = new Map([
    ['ui.delete.selection', (payload = {}) => {
        handlerCalls.push(payload);
        return {
            ok: true,
            deleted_ids: Array.isArray(payload?.input?.selection_ids)
                ? payload.input.selection_ids.slice()
                : []
        };
    }]
]);

const { toolRuntimeV2 } = await import('../../eVe/intuition/tools/core/tool_runtime.js');

await toolRuntimeV2.bootstrap({ force: true, reason: 'delete_selection_registry_test' });

const result = await toolRuntimeV2.invokeById({
    tool_id: 'ui.delete.selection',
    action: 'pointer.click',
    input: {
        selection_ids: ['delete_a', 'delete_b'],
        context_type: 'atome'
    },
    source: { type: 'ui', layer: 'flower_menu' },
    presentation: 'ui'
});

assert.equal(result.ok, true, 'delete selection must be invocable through runtime v2');
assert.equal(handlerCalls.length, 1, 'delete selection handler should be called once');
assert.deepEqual(
    handlerCalls[0].input.selection_ids,
    ['delete_a', 'delete_b'],
    'delete selection handler should receive the selected atome ids'
);
