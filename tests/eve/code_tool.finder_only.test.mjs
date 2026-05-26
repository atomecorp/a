import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (label, predicate, timeoutMs = 1800) => {
    const started = Date.now();
    while ((Date.now() - started) < timeoutMs) {
        if (await predicate()) return;
        await sleep(24);
    }
    throw new Error(`wait_timeout:${label}`);
};

const { window } = installMockBrowserEnv();
const listeners = new Map();
window.addEventListener = (event, handler) => {
    const key = String(event || '').trim();
    if (!key || typeof handler !== 'function') return;
    const set = listeners.get(key) || new Set();
    set.add(handler);
    listeners.set(key, set);
};

window.__authCheckComplete = true;
window.__authCheckResult = {
    complete: true,
    authenticated: true,
    anonymous: false
};

const { CODE_TOOL_ID } = await import('../../eVe/intuition/tools/code.js');
const { toolRegistryV2 } = await import('../../eVe/intuition/tools/core/tool_registry.js');

await waitFor('code_tool_registered', async () => {
    const localRecord = window.atome?.tools?.registry?.get?.(CODE_TOOL_ID);
    const catalogRecords = await toolRegistryV2.listTools({ includeDisabled: true });
    return !!localRecord && catalogRecords.some((entry) => String(entry?.id || '') === CODE_TOOL_ID);
});

const localRecord = window.atome.tools.registry.get(CODE_TOOL_ID);
const catalogRecords = await toolRegistryV2.listTools({ includeDisabled: true });
const record = catalogRecords.find((entry) => String(entry?.id || '') === CODE_TOOL_ID);

assert.ok(localRecord, 'code tool must be registered locally');
assert.ok(record, 'code tool must be registered in the searchable catalog');
assert.equal(localRecord.tool_scope, 'catalog', 'code tool must stay out of menu scopes');
assert.equal(localRecord.finder_visible, true, 'code tool must be visible from finder/search');
assert.equal(localRecord.icon, './atome/src/assets/images/icons/code.svg', 'code tool must use the requested icon path');
assert.equal(record.tool_key, 'code', 'code tool must keep its finder projection key stable');
assert.equal(record.visibility, 'visible', 'code tool must be catalog-visible');
assert.equal(record.ui.icon, './atome/src/assets/images/icons/code.svg', 'catalog definition must use the requested icon path');
assert.equal(typeof window.atome.tools.handlers.get(CODE_TOOL_ID), 'function', 'code tool must expose its runtime handler');

console.log('code_tool.finder_only.test: PASS');
