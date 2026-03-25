import assert from 'node:assert/strict';

import AgentGateway from './agent_gateway.js';

AgentGateway.registerTool({
    name: 'contacts.update_spec_probe',
    domain: 'contacts',
    description: 'Spec-aligned contacts update probe',
    risk_tier: 'moderate',
    parameters: {
        type: 'object',
        required: ['contact_id'],
        properties: {
            contact_id: { type: 'string' },
            email: { type: 'string' }
        }
    },
    output_schema: {
        type: 'object',
        properties: {
            ok: { type: 'boolean' }
        }
    },
    side_effects: ['modifies_contact'],
    idempotent: true,
    undoable: true,
    handler: async ({ params }) => ({
        ok: true,
        contact_id: params.contact_id,
        email: params.email || null
    })
});

AgentGateway.registerTool({
    name: 'mail.list_spec_probe',
    description: 'Legacy list probe',
    risk_level: 'LOW',
    params_schema: {
        type: 'object',
        properties: {
            unread_only: { type: 'boolean' }
        }
    },
    handler: async () => ({
        ok: true,
        items: []
    })
});

const listed = AgentGateway.listTools();
const contactTool = listed.find((entry) => entry.name === 'contacts.update_spec_probe');
const mailTool = listed.find((entry) => entry.name === 'mail.list_spec_probe');

assert.equal(contactTool?.domain, 'contacts', 'listTools should expose the canonical tool domain');
assert.equal(contactTool?.risk_tier, 'moderate', 'listTools should expose canonical risk tiers');
assert.equal(contactTool?.parameters?.required?.includes('contact_id'), true, 'listTools should expose canonical parameters');
assert.equal(contactTool?.undoable, true, 'listTools should expose undo metadata');
assert.equal(mailTool?.domain, 'mail', 'legacy tools should infer their domain from the tool name');
assert.equal(mailTool?.risk_tier, 'low', 'legacy risk levels should be projected to canonical risk tiers');

const confirmation = await AgentGateway.callTool({
    tool_name: 'contacts.update_spec_probe',
    params: {
        contact_id: 'contact_probe_1',
        email: 'probe@example.test'
    }
});

assert.equal(confirmation.status, 'CONFIRMATION_REQUIRED', 'spec moderate tools should require confirmation by default');

const executed = await AgentGateway.callTool({
    tool_name: 'contacts.update_spec_probe',
    confirmed: true,
    params: {
        contact_id: 'contact_probe_1',
        email: 'probe@example.test'
    }
});

assert.equal(executed.status, 'OK', 'confirmed spec moderate tools should execute');

const toolchainValidation = AgentGateway.validateToolchain([
    {
        tool_name: 'mail.list_spec_probe',
        params: { unread_only: true }
    },
    {
        tool_name: 'contacts.update_spec_probe',
        params: { contact_id: 'contact_probe_2' }
    }
]);

assert.equal(toolchainValidation.ok, true, 'toolchain validation should accept valid registered tools');
assert.equal(toolchainValidation.aggregate_risk, 'moderate', 'toolchain validation should compute aggregate risk');

AgentGateway.unregisterTool('contacts.update_spec_probe');
AgentGateway.unregisterTool('mail.list_spec_probe');

console.log('agent_gateway.capabilities.test: PASS');
process.exit(0);
