import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

window.open_delete_panel = () => {};
window.close_delete_panel = () => {};
window.__selectedAtomeIds = ['keyboard_delete_a', 'keyboard_delete_b'];
window.__selectedAtomeId = 'keyboard_delete_b';
window.SelectionAPI = {
    selected: () => ['keyboard_delete_a', 'keyboard_delete_b']
};

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
await toolRuntimeV2.bootstrap({ force: true, reason: 'delete_shortcut_existing_binding_test' });

await import(`../../eVe/default/shortcuts.js?delete-shortcut-test=${Date.now()}`);

const registrations = [];
window.shortcut = (combo, handler) => {
    registrations.push({ combo, handler });
};

await new Promise((resolve) => setTimeout(resolve, 180));

const backspace = registrations.find((entry) => entry.combo === 'backspace');
assert.ok(backspace, 'existing Backspace shortcut should register when window.shortcut becomes available');

let prevented = false;
let stopped = false;
backspace.handler('backspace', {
    key: 'Backspace',
    target: document.body,
    preventDefault: () => {
        prevented = true;
    },
    stopPropagation: () => {
        stopped = true;
    }
});

for (let attempt = 0; attempt < 20 && handlerCalls.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
}

assert.equal(prevented, true, 'Backspace shortcut should prevent browser navigation/default deletion');
assert.equal(stopped, true, 'Backspace shortcut should stop propagation after handling');
assert.equal(handlerCalls.length, 1, 'Backspace should invoke the existing delete selection handler once');
assert.deepEqual(
    handlerCalls[0].input.selection_ids,
    ['keyboard_delete_a', 'keyboard_delete_b'],
    'Backspace delete handler should receive the active atome selection'
);
