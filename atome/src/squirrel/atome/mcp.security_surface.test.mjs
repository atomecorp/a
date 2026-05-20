import assert from 'node:assert/strict';

let calendarCreateCalls = 0;

globalThis.AtomeAI = {
    listTools() {
        return [
            {
                name: 'mail.send_spec_probe',
                capabilities: ['mail.send'],
                permissions_required: []
            }
        ];
    },
    getTool(name) {
        return this.listTools().find((entry) => entry.name === name) || null;
    },
    async callTool(request = {}) {
        return { ok: true, request };
    },
    audit: {
        list() {
            return [];
        }
    }
};

globalThis.atome = {
    mail: {
        list() {
            return { ok: true, items: [] };
        },
        send(draftId, options = {}) {
            return {
                ok: true,
                draft: {
                    draft_id: draftId,
                    status: options.confirmed === true ? 'sent' : 'draft'
                }
            };
        }
    },
    calendar: {
        today() {
            return { ok: true, items: [] };
        },
        sources() {
            return { ok: true, items: [{ source_id: 'tauri_caldav_primary' }] };
        },
        create(input = {}) {
            calendarCreateCalls += 1;
            return {
                ok: true,
                event: {
                    id: `calendar_created_${calendarCreateCalls}`,
                    title: input.title || ''
                }
            };
        }
    },
    tools: {
        v2CommandBus: {
            listEvents() {
                return [];
            }
        },
        v2Runtime: {
            async listTools() {
                return [];
            },
            async invokeById(payload = {}) {
                return { ok: true, tool_id: payload.tool_id };
            },
            async invokeBatch(events = []) {
                return { ok: true, count: events.length };
            }
        }
    }
};

await import('./mcp.js');

const proposalGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 1,
    method: 'mail.send',
    params: {
        draft_id: 'draft_security_1'
    }
});
assert.equal(proposalGate.error, undefined, 'mail.send gate should succeed');
assert.equal(proposalGate.result?.confirmation_required, true, 'mail.send should expose a confirmation gate');
assert.ok(proposalGate.result?.proposal_id, 'mail.send should create a proposal record');

const proposal = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 2,
    method: 'mcp.proposals.read',
    params: {
        proposal_id: proposalGate.result.proposal_id
    }
});
assert.equal(proposal.error, undefined, 'mcp.proposals.read should succeed');
assert.equal(proposal.result?.proposal?.subject, 'mail.send', 'mcp.proposals.read should expose the gated subject');

const capabilityDenied = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 3,
    method: 'calendar.create',
    params: {
        title: 'Blocked',
        actor: {
            actor_id: 'viewer_1',
            capabilities: ['mail.read']
        }
    }
});
assert.equal(capabilityDenied.result, undefined, 'capability-denied calls should not produce a result payload');
assert.equal(capabilityDenied.error?.message, 'mcp_capability_denied', 'calendar.create should require calendar.write capability');

const aiToolCapabilityDenied = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 33,
    method: 'ai.tools.call',
    params: {
        tool_name: 'mail.send_spec_probe',
        actor: {
            actor_id: 'ai_delegate_without_mail',
            capabilities: ['ai.execute']
        }
    }
});
assert.equal(aiToolCapabilityDenied.result, undefined, 'ai.tools.call should not execute without target tool capability');
assert.equal(aiToolCapabilityDenied.error?.message, 'mcp_capability_denied', 'ai.tools.call should require target tool capabilities');

const sandboxDenied = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 4,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.capture.audio',
        actor: {
            actor_id: 'runtime_delegate',
            capabilities: ['runtime.execute', 'runtime.sensitive'],
            sandbox_profiles: []
        }
    }
});
assert.equal(sandboxDenied.error?.message, 'mcp_sandbox_denied', 'sensitive runtime tools should require the desktop owner sandbox profile');

for (let index = 0; index < 5; index += 1) {
    const gate = await globalThis.handleAtomeMCPRequestAsync({
        jsonrpc: '2.0',
        id: 10 + index,
        method: 'runtime.tools.call',
        params: {
            tool_id: 'ui.capture.audio'
        }
    });
    assert.equal(gate.result?.confirmation_required, true, 'sensitive runtime calls should keep returning confirmation gates before the rate limit is hit');
}

const rateLimited = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 20,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.capture.audio'
    }
});
assert.equal(rateLimited.error, undefined, 'rate-limited calls should return a gate payload rather than throw');
assert.equal(rateLimited.result?.error, 'mcp_rate_limited', 'sensitive runtime calls should become rate-limited after the configured budget');

const calendarGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 30,
    method: 'calendar.create',
    params: {
        title: 'Idempotent event',
        idempotency_key: 'calendar_create_security_1'
    }
});
assert.equal(calendarGate.result?.confirmation_required, true, 'calendar.create should still require confirmation before execution');

const created = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 31,
    method: 'calendar.create',
    params: {
        title: 'Idempotent event',
        idempotency_key: 'calendar_create_security_1',
        confirmed: true,
        confirmation_id: calendarGate.result.confirmation_id
    }
});
assert.equal(created.error, undefined, 'confirmed calendar.create should succeed');
assert.equal(calendarCreateCalls, 1, 'calendar.create should execute once before idempotent replay');

const replayed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 32,
    method: 'calendar.create',
    params: {
        title: 'Idempotent event',
        idempotency_key: 'calendar_create_security_1'
    }
});
assert.equal(replayed.error, undefined, 'idempotent replay should succeed');
assert.equal(calendarCreateCalls, 1, 'calendar.create should not execute twice when the same idempotency key is replayed');
assert.equal(replayed.result?.event?.id, created.result?.event?.id, 'idempotent replay should reuse the stored result');

const limits = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 40,
    method: 'mcp.rate_limits.list',
    params: {}
});
assert.equal(limits.error, undefined, 'mcp.rate_limits.list should succeed');
assert.equal(limits.result?.rules?.some((entry) => entry.id === 'mail.send'), true, 'mcp.rate_limits.list should expose the configured security rate limits');

const journal = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 41,
    method: 'mcp.security.journal.list',
    params: {
        limit: 50
    }
});
assert.equal(journal.error, undefined, 'mcp.security.journal.list should succeed');
assert.equal(journal.result?.items?.some((entry) => entry.type === 'proposal_created'), true, 'security journal should include proposal creation events');
assert.equal(journal.result?.items?.some((entry) => entry.type === 'capability_denied'), true, 'security journal should include capability denials');
assert.equal(journal.result?.items?.some((entry) => entry.type === 'sandbox_denied'), true, 'security journal should include sandbox denials');
assert.equal(journal.result?.items?.some((entry) => entry.type === 'idempotency_hit'), true, 'security journal should include idempotency hits');

console.log('mcp.security_surface.test: PASS');
