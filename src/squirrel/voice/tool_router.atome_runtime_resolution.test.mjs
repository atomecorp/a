import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';

const calls = [];
const router = createToolRouter({
    bridge: {
        async callRuntimeTool(payload = {}) {
            calls.push(payload);
            return {
                ok: true,
                tool_id: payload.tool_id,
                input: payload.input
            };
        }
    }
});

const createResult = await router.execute({
    domain: 'atome',
    operation: 'create',
    payload: {
        kind: 'shape',
        shape_variant: 'circle',
        color: 'violet'
    },
    filters: {},
    target: { kind: 'none', id: '' },
    source: { locale: 'fr-FR' }
});

assert.equal(createResult.ok, true, 'atome create should resolve through the runtime bridge');
assert.equal(calls[0]?.tool_id, 'ui.circle', 'atome create circle payloads should target ui.circle');
assert.equal(calls[0]?.input?.color, 'violet', 'atome create should preserve the requested color');

const updateResult = await router.execute({
    domain: 'atome',
    operation: 'update',
    payload: {
        color: 'orange'
    },
    filters: {},
    target: { kind: 'current', id: 'atome_voice_target_1' },
    source: { locale: 'fr-FR' }
});

assert.equal(updateResult.ok, true, 'atome update should resolve through the runtime bridge');
assert.equal(calls[1]?.tool_id, 'ui.couleur.apply', 'atome update color payloads should target ui.couleur.apply');
assert.equal(calls[1]?.input?.atome_id, 'atome_voice_target_1', 'atome update should preserve the current target id');
assert.equal(calls[1]?.input?.color, 'orange', 'atome update should preserve the requested color');

const unresolved = await router.execute({
    domain: 'atome',
    operation: 'delete',
    payload: {},
    filters: {},
    target: { kind: 'current', id: 'atome_voice_target_1' },
    source: { locale: 'fr-FR' }
});

assert.equal(unresolved.ok, false, 'unsupported atome operations should fail explicitly');
assert.equal(unresolved.error, 'atome_runtime_tool_unresolved', 'unsupported atome operations should not fall back to legacy tooling');

console.log('tool_router.atome_runtime_resolution.test: PASS');
