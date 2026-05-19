import assert from 'node:assert/strict';

globalThis.AtomeAI = {
    listTools() {
        return [
            { name: 'mail.list', description: 'List mail' },
            { name: 'calendar.today', description: 'Today events' }
        ];
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

globalThis.Squirrel = {
    voice: {
        async listSessions() {
            return [{ session_id: 'voice_session_1', phase: 'listening' }];
        }
    }
};

globalThis.atome = {
    mail: {
        summarize() {
            return { ok: true, summary: 'mail summary' };
        },
        list() {
            return { ok: true, items: [] };
        }
    },
    calendar: {
        sources() {
            return { ok: true, items: [{ source_id: 'tauri_caldav_primary' }] };
        },
        today() {
            return { ok: true, items: [{ id: 'calendar_today_1' }] };
        }
    },
    tools: {
        v2CommandBus: {
            listEvents() {
                return [{ seq: 1, kind: 'tool_execution_result' }];
            }
        },
        v2Runtime: {
            async listTools() {
                return [{
                    id: 'ui.circle',
                    tool_key: 'circle',
                    meta: { name: 'Circle' },
                    capabilities: { contexts: ['project', 'mcp'], selection_required: false, disabled: false },
                    runtime: { execution_mode: 'v2_circle_create' }
                }];
            },
            async invokeById(payload = {}) {
                if (payload.tool_id !== 'ui.long_task') {
                    return { ok: true, tool_id: payload.tool_id };
                }
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        resolve({ ok: true, tool_id: payload.tool_id });
                    }, 50);
                    if (payload.signal && typeof payload.signal.addEventListener === 'function') {
                        payload.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            const error = new Error('aborted');
                            error.name = 'AbortError';
                            reject(error);
                        }, { once: true });
                    }
                });
            },
            async invokeBatch(events = []) {
                return { ok: true, count: events.length };
            }
        }
    }
};

await import('./mcp.js');

const tools = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 1,
    method: 'mcp.tools.list',
    params: {}
});
assert.equal(tools.error, undefined, 'mcp.tools.list should succeed');
assert.equal(tools.result?.tools?.some((entry) => entry.name === 'ui.circle' && entry.source === 'runtime_v2'), true, 'mcp.tools.list should include runtime tools');
assert.equal(tools.result?.tools?.some((entry) => entry.name === 'mail.list' && entry.source === 'atome_ai'), true, 'mcp.tools.list should include AtomeAI tools');

const resources = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 2,
    method: 'mcp.resources.list',
    params: {}
});
assert.equal(resources.error, undefined, 'mcp.resources.list should succeed');
assert.equal(resources.result?.resources?.some((entry) => entry.uri === 'calendar://sources'), true, 'mcp.resources.list should include calendar resources');
assert.equal(resources.result?.resources?.some((entry) => entry.uri === 'voice://sessions/active'), true, 'mcp.resources.list should include voice resources when available');

const resourceRead = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 3,
    method: 'mcp.resources.read',
    params: {
        uri: 'calendar://sources'
    }
});
assert.equal(resourceRead.error, undefined, 'mcp.resources.read should succeed');
assert.equal(resourceRead.result?.content?.items?.[0]?.source_id, 'tauri_caldav_primary', 'mcp.resources.read should read calendar resources through the dynamic registry');

const prompts = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 4,
    method: 'mcp.prompts.list',
    params: {}
});
assert.equal(prompts.error, undefined, 'mcp.prompts.list should succeed');
assert.equal(prompts.result?.prompts?.some((entry) => entry.name === 'confirm_sensitive_action'), true, 'mcp.prompts.list should include the confirmation prompt');

const prompt = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 5,
    method: 'mcp.prompts.get',
    params: {
        name: 'confirm_sensitive_action',
        action: 'mail.send'
    }
});
assert.equal(prompt.error, undefined, 'mcp.prompts.get should succeed');
assert.match(prompt.result?.prompt || '', /mail\.send/, 'mcp.prompts.get should render the requested prompt template');

const acl = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 6,
    method: 'mcp.acl.list',
    params: {}
});
assert.equal(acl.error, undefined, 'mcp.acl.list should succeed');
assert.equal(acl.result?.acl?.tools?.some((entry) => entry.subject === 'mail.send' && entry.access === 'confirm'), true, 'mcp.acl.list should expose the fine-grained MCP tool ACL');

const confirmationGate = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 7,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.capture.audio'
    }
});
assert.equal(confirmationGate.error, undefined, 'sensitive runtime.tools.call confirmation gate should succeed');
assert.equal(confirmationGate.result?.confirmation_required, true, 'sensitive runtime.tools.call should require explicit MCP confirmation');
assert.ok(confirmationGate.result?.confirmation_id, 'sensitive runtime.tools.call should expose an MCP confirmation token');

const confirmationRead = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 8,
    method: 'mcp.confirmations.read',
    params: {
        confirmation_id: confirmationGate.result.confirmation_id
    }
});
assert.equal(confirmationRead.error, undefined, 'mcp.confirmations.read should succeed');
assert.equal(confirmationRead.result?.confirmation?.subject, 'runtime.tools.call:ui.capture.audio', 'mcp.confirmations.read should expose the gated sensitive subject');

const confirmedSensitiveCall = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 9,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.capture.audio',
        confirmed: true,
        confirmation_id: confirmationGate.result.confirmation_id
    }
});
assert.equal(confirmedSensitiveCall.error, undefined, 'confirmed sensitive runtime.tools.call should succeed');
assert.equal(confirmedSensitiveCall.result?.tool_id, 'ui.capture.audio', 'confirmed sensitive runtime.tools.call should execute after MCP confirmation');

const toolchain = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 10,
    method: 'mcp.toolchains.execute',
    params: {
        steps: [
            { method: 'runtime.tools.call', params: { tool_id: 'ui.circle' } },
            { method: 'runtime.tools.call', params: { tool_id: 'ui.circle' } }
        ]
    }
});
assert.equal(toolchain.error, undefined, 'mcp.toolchains.execute should succeed');
assert.equal(toolchain.result?.mode, 'runtime_batch', 'mcp.toolchains.execute should batch runtime-only toolchains cleanly');
assert.equal(toolchain.result?.result?.count, 2, 'mcp.toolchains.execute should preserve the number of batched runtime steps');

const deferred = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 11,
    method: 'runtime.tools.call',
    params: {
        tool_id: 'ui.long_task',
        defer: true
    }
});
assert.equal(deferred.error, undefined, 'deferred runtime.tools.call should succeed');
assert.equal(deferred.result?.deferred, true, 'runtime.tools.call should support deferred MCP execution');
assert.ok(deferred.result?.operation_id, 'deferred runtime.tools.call should expose an operation id');

const listedOperations = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 12,
    method: 'mcp.operations.list',
    params: {
        method: 'runtime.tools.call'
    }
});
assert.equal(listedOperations.error, undefined, 'mcp.operations.list should succeed');
assert.equal(listedOperations.result?.operations?.some((entry) => entry.operation_id === deferred.result.operation_id), true, 'mcp.operations.list should expose the deferred runtime operation');

const cancelled = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 13,
    method: 'mcp.operations.cancel',
    params: {
        operation_id: deferred.result.operation_id
    }
});
assert.equal(cancelled.error, undefined, 'mcp.operations.cancel should succeed');
assert.equal(cancelled.result?.ok, true, 'mcp.operations.cancel should acknowledge cancellation');

await new Promise((resolve) => setTimeout(resolve, 10));

const readOperation = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 14,
    method: 'mcp.operations.read',
    params: {
        operation_id: deferred.result.operation_id
    }
});
assert.equal(readOperation.error, undefined, 'mcp.operations.read should succeed');
assert.equal(readOperation.result?.operation?.status, 'cancelled', 'mcp.operations.read should expose the cancelled operation status');

const events = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 15,
    method: 'mcp.events.list',
    params: {
        limit: 20
    }
});
assert.equal(events.error, undefined, 'mcp.events.list should succeed');
assert.equal(events.result?.events?.some((entry) => entry.type === 'mcp.operation.cancelled'), true, 'mcp.events.list should expose operation lifecycle events');

console.log('mcp.platform_surface.test: PASS');
