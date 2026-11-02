// R-108 (2 Nov. 2026): since R-104 the voice opening preloaded 167 tools; the realtime relay accepts at most
// PROVIDER_SESSION_TOOL_LIMIT, so every opening was refused (provider_tool_not_authorized) and she never answered.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createConversationSession } from '../../atome/src/squirrel/ai/conversation_session.js';
import { MCP_CONTRACT_PRELOAD } from '../../atome/src/squirrel/atome/mcp_contract_families.js';
import { ASSISTANT_CONTEXT_COMMAND_NAMES } from '../../atome/src/shared/assistant_context_contract.js';
import { PROVIDER_SESSION_TOOL_LIMIT } from '../../atome/src/shared/provider_tool_limit.js';

const names = [...new Set(['ui.draw.edit', 'ui.ai.image.generate', ...MCP_CONTRACT_PRELOAD, ...ASSISTANT_CONTEXT_COMMAND_NAMES, 'tool.open_now'])];
const session = (preload) => createConversationSession({ actor: () => ({ id: 'u' }), quota: { getSummary: () => ({}) },
    toolContext: () => ({ preload }),
    mcp: async ({ method }) => ({ result: method === 'runtime.tools.list'
        ? { tools: names.map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })) }
        : { tools: [] } }),
    request: async () => { throw new Error('no provider request expected'); } });

test('the voice session carries at most the provider limit, the search tool and the open tools first', async () => {
    assert.ok(names.length > PROVIDER_SESSION_TOOL_LIMIT, 'the preload list itself exceeds the limit');
    const voice = await session(['tool.open_now']).createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    assert.equal(voice.tools.length, PROVIDER_SESSION_TOOL_LIMIT);
    assert.equal(voice.tools[0].name, 'atome_tool_search');
    assert.match(voice.tools[1].description, /^tool\.open_now:/);
    const contextFirst = voice.tools.slice(2, 2 + ASSISTANT_CONTEXT_COMMAND_NAMES.length).map(tool => tool.description.split(':')[0]);
    assert.deepEqual(contextFirst, ASSISTANT_CONTEXT_COMMAND_NAMES.filter(name => name !== 'tool.open_now'));
    assert.ok(voice.tools.every(tool => tool.type === 'function'));
});
