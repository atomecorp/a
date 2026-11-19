// R-108 (2 Nov. 2026): since R-104 the voice opening preloaded 167 tools; the realtime relay accepts at most
// PROVIDER_SESSION_TOOL_LIMIT, so every opening was refused (provider_tool_not_authorized) and she never answered.
// R-173 L6 (19 Nov. 2026): the cut then kept the first 94 names, so 92 family commands were preloaded in name only.
// Each family now preloads its entry command alone, and the whole list fits without a cut.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConversationSession } from '../../atome/src/squirrel/ai/conversation_session.js';
import { MCP_CONTRACT_FAMILIES, MCP_CONTRACT_PRELOAD } from '../../atome/src/squirrel/atome/mcp_contract_families.js';
import { ASSISTANT_CONTEXT_COMMAND_NAMES } from '../../atome/src/shared/assistant_context_contract.js';
import { PROVIDER_SESSION_TOOL_LIMIT } from '../../atome/src/shared/provider_tool_limit.js';

const CORE = ['calendar.time.read', 'ui.draw.edit', 'ui.ai.image.generate'];
const base = [...new Set([...ASSISTANT_CONTEXT_COMMAND_NAMES, ...CORE, ...MCP_CONTRACT_PRELOAD])];
const opened = Array.from({ length: PROVIDER_SESSION_TOOL_LIMIT }, (_, n) => `open.tool_${n}`);
const session = (preload, names) => createConversationSession({ actor: () => ({ id: 'u' }), quota: { getSummary: () => ({}) },
    toolContext: () => ({ preload }),
    mcp: async ({ method }) => ({ result: method === 'runtime.tools.list'
        ? { tools: names.map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } })) }
        : { tools: [] } }),
    request: async () => { throw new Error('no provider request expected'); } });
const voiceOf = (preload, names) => session(preload, names).createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
const named = voice => voice.tools.slice(2).map(tool => tool.description.split(':')[0]);

test('with no tool open, every preloaded name reaches the voice session: nothing is cut', async () => {
    assert.ok(base.length <= PROVIDER_SESSION_TOOL_LIMIT - 2, `${base.length} preloaded names for ${PROVIDER_SESSION_TOOL_LIMIT - 2} places`);
    const voice = await voiceOf([], base);
    // The session's own tools first: discovery and the held action's yes (AGENTS.md rule 22).
    assert.deepEqual(voice.tools.slice(0, 2).map(tool => tool.name), ['atome_tool_search', 'atome_confirm']);
    assert.deepEqual(named(voice), base);
});

test('every preloaded family name is a command of its family and of the registry', () => {
    const registry = JSON.parse(fs.readFileSync(new URL('../../eVe/registry/generated/full-map.json', import.meta.url), 'utf8')).entries;
    for (const family of MCP_CONTRACT_FAMILIES) for (const name of family.preload) {
        assert.ok(family.commands.some(command => command.name === name), `${family.id}: ${name} is not one of its commands`);
        assert.ok(registry[`action_contract:${name}`], `${family.id}: ${name} is not in the registry`);
    }
});

test('the open tools come first and the session still stops at the provider limit', async () => {
    const voice = await voiceOf(opened, [...opened, ...base]);
    assert.equal(voice.tools.length, PROVIDER_SESSION_TOOL_LIMIT);
    assert.deepEqual(named(voice), opened.slice(0, PROVIDER_SESSION_TOOL_LIMIT - 2));
    assert.ok(voice.tools.every(tool => tool.type === 'function'));
});
