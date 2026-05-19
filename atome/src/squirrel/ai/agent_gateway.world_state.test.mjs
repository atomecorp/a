import assert from 'node:assert/strict';

import AgentGateway from './agent_gateway.js';

let rollbackCalled = false;

AgentGateway.registerTool({
    name: 'world_state.pre_post_probe',
    domain: 'contacts',
    risk_tier: 'low',
    parameters: {
        type: 'object',
        required: ['contact_id'],
        properties: {
            contact_id: { type: 'string' }
        }
    },
    preconditions: ['entity_exists'],
    postconditions: ['contact_updated'],
    precondition_check: async ({ params }) => ({
        ok: params.contact_id !== 'missing_contact',
        error: 'entity_missing'
    }),
    postcondition_check: async ({ result }) => ({
        ok: result?.updated === true,
        error: 'contact_not_updated'
    }),
    rollback: async () => {
        rollbackCalled = true;
        return { ok: true };
    },
    handler: async ({ params }) => ({
        updated: params.contact_id !== 'post_fail'
    })
});

const preFailed = await AgentGateway.callTool({
    tool_name: 'world_state.pre_post_probe',
    params: {
        contact_id: 'missing_contact'
    }
});

assert.equal(preFailed.status, 'ERROR', 'precondition failures should stop execution');
assert.equal(preFailed.precondition_failed, true, 'precondition failures should be surfaced explicitly');

const postFailed = await AgentGateway.callTool({
    tool_name: 'world_state.pre_post_probe',
    params: {
        contact_id: 'post_fail'
    }
});

assert.equal(postFailed.status, 'ERROR', 'postcondition failures should fail the tool result');
assert.equal(postFailed.postcondition_failed, true, 'postcondition failures should be surfaced explicitly');
assert.equal(rollbackCalled, true, 'postcondition failures should trigger rollback when available');

AgentGateway.unregisterTool('world_state.pre_post_probe');

console.log('agent_gateway.world_state.test: PASS');
process.exit(0);
