import assert from 'node:assert/strict';

import AgentGateway from './agent_gateway.js';

const calls = [];

AgentGateway.registerTool({
    name: 'toolchain.read_probe',
    risk_tier: 'read',
    parameters: {
        type: 'object',
        properties: {
            label: { type: 'string' }
        }
    },
    handler: async ({ params }) => {
        calls.push(`read:${params.label || ''}`);
        return { ok: true, label: params.label || null };
    }
});

AgentGateway.registerTool({
    name: 'toolchain.update_probe',
    risk_tier: 'moderate',
    parameters: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string' }
        }
    },
    handler: async ({ params }) => {
        calls.push(`update:${params.id}`);
        return { ok: true, id: params.id };
    }
});

const gated = await AgentGateway.executeToolchain({
    steps: [{
        tool_name: 'toolchain.read_probe',
        params: { label: 'first' }
    }, {
        tool_name: 'toolchain.update_probe',
        params: { id: 'contact_chain_1' }
    }]
});

assert.equal(gated.status, 'CONFIRMATION_REQUIRED', 'mixed read/mutate toolchains should stop for confirmation at moderate aggregate risk');
assert.equal(calls.length, 0, 'toolchain confirmation should prevent premature execution');

const executed = await AgentGateway.executeToolchain({
    confirmed: true,
    steps: [{
        tool_name: 'toolchain.read_probe',
        params: { label: 'first' }
    }, {
        tool_name: 'toolchain.update_probe',
        params: { id: 'contact_chain_1' }
    }]
});

assert.equal(executed.status, 'OK', 'confirmed toolchains should execute');
assert.deepEqual(calls, ['read:first', 'update:contact_chain_1'], 'toolchain execution should preserve declared order');

const rejected = await AgentGateway.executeToolchain({
    steps: [{
        tool_name: 'toolchain.read_probe',
        params: { label: 'ok' }
    }, {
        tool_name: 'toolchain.missing_probe',
        params: {}
    }]
});

assert.equal(rejected.status, 'ERROR', 'unknown tools should invalidate a toolchain before execution');
assert.equal(rejected.invalid_step_index, 1, 'toolchain validation should report the failing step index');

AgentGateway.unregisterTool('toolchain.read_probe');
AgentGateway.unregisterTool('toolchain.update_probe');

console.log('agent_gateway.toolchain_policy.test: PASS');
process.exit(0);
