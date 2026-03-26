import assert from 'node:assert/strict';

import AgentGateway, { TOOL_STATUS } from './agent_gateway.js';

AgentGateway.registerTool({
    name: 'trace.test.low',
    description: 'Low risk trace propagation probe',
    capabilities: ['trace.read'],
    risk_tier: 'LOW',
    handler: async ({ context }) => ({
        status: TOOL_STATUS.OK,
        result: {
            ok: true,
            trace_id: context?.trace_id || null,
            intent_id: context?.intent_id || null,
            source: context?.source || null
        }
    })
});

AgentGateway.registerTool({
    name: 'trace.test.high',
    description: 'High risk proposal trace propagation probe',
    capabilities: ['trace.write'],
    risk_tier: 'HIGH',
    handler: async ({ context }) => ({
        status: TOOL_STATUS.OK,
        result: {
            ok: true,
            trace_id: context?.trace_id || null,
            intent_id: context?.intent_id || null,
            source: context?.source || null
        }
    })
});

const lowResult = await AgentGateway.callTool({
    tool_name: 'trace.test.low',
    params: {},
    source: { type: 'voice', layer: 'voice_session_runtime' }
});

assert.equal(lowResult.status, TOOL_STATUS.OK, 'low risk tool should execute immediately');
assert.ok(lowResult.trace_id, 'low risk tool should expose trace_id');
assert.ok(lowResult.intent_id, 'low risk tool should expose intent_id');

const lowAudit = AgentGateway.audit.list({ trace_id: lowResult.trace_id });
assert.equal(lowAudit.length > 0, true, 'audit list should be filterable by trace_id');
assert.equal(lowAudit.at(-1)?.source, 'voice', 'audit entries should preserve the caller source type');
assert.equal(lowAudit.at(-1)?.source_layer, 'voice_session_runtime', 'audit entries should preserve the caller source layer');

const confirmResult = await AgentGateway.callTool({
    tool_name: 'trace.test.high',
    params: {},
    source: { type: 'mcp', layer: 'atome_mcp_ai_call' }
});

assert.equal(confirmResult.status, TOOL_STATUS.CONFIRMATION_REQUIRED, 'high risk tool should require confirmation');
assert.ok(confirmResult.proposal_id, 'high risk tool should return a proposal_id');
assert.ok(confirmResult.trace_id, 'high risk tool should expose trace_id before execution');
assert.ok(confirmResult.intent_id, 'high risk tool should expose intent_id before execution');

const proposal = AgentGateway.proposal.get(confirmResult.proposal_id);
assert.equal(proposal?.trace_id, confirmResult.trace_id, 'proposal should preserve trace_id');
assert.equal(proposal?.intent_id, confirmResult.intent_id, 'proposal should preserve intent_id');
assert.equal(proposal?.source?.type, 'mcp', 'proposal should preserve source type');
assert.equal(proposal?.source?.layer, 'atome_mcp_ai_call', 'proposal should preserve source layer');

AgentGateway.proposal.approve(confirmResult.proposal_id, 'token_trace_test');
const executed = await AgentGateway.proposal.execute(confirmResult.proposal_id);

assert.equal(executed.status, TOOL_STATUS.OK, 'approved proposal should execute successfully');
assert.equal(executed.trace_id, confirmResult.trace_id, 'proposal execution should preserve trace_id');
assert.equal(executed.intent_id, confirmResult.intent_id, 'proposal execution should preserve intent_id');

const proposalAudit = AgentGateway.audit.list({ trace_id: confirmResult.trace_id });
assert.equal(proposalAudit.length >= 3, true, 'proposal lifecycle should emit multiple audit entries under one trace_id');
assert.equal(
    proposalAudit.some((entry) => entry.status === TOOL_STATUS.CONFIRMATION_REQUIRED),
    true,
    'proposal lifecycle audit should include confirmation_required'
);
assert.equal(
    proposalAudit.some((entry) => entry.status === 'APPROVED'),
    true,
    'proposal lifecycle audit should include approval'
);
assert.equal(
    proposalAudit.some((entry) => entry.status === TOOL_STATUS.OK),
    true,
    'proposal lifecycle audit should include final execution'
);

AgentGateway.unregisterTool('trace.test.low');
AgentGateway.unregisterTool('trace.test.high');

console.log('agent_gateway.trace_policy.test: PASS');
process.exit(0);
