import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpTvHandlers } from '../../atome/src/squirrel/atome/mcp_handlers_contracts.js';
import { TV_COMMANDS } from '../../atome/src/squirrel/tv/contracts.js';
import { resolveAccessPolicy } from '../../atome/src/squirrel/atome/mcp_security_policy.js';
import { createConversationSession } from '../../atome/src/squirrel/ai/conversation_session.js';

test('direct MCP contracts validate inputs and use the canonical audited command route', async () => {
    const handlers = createMcpTvHandlers();
    assert.equal(Object.keys(handlers).length, 10);
    assert.equal((await handlers['tv.open_channel']({ channel: 'fr2', source_url: 'https://bad.example' })).error, 'INVALID_ARGUMENT');
    assert.equal((await handlers['tv.get_state']()).error, 'NO_ACTIVE_CLIENT');
    const calls = [];
    globalThis.window = { document: {}, atome: { tools: { v2Runtime: { invokeById: async payload => {
        calls.push(payload); return { ok: true, result: { ok: true, playback: 'opened_unconfirmed' } };
    } } } } };
    try {
        await handlers['tv.open_channel']({ channel: 'fr2', fullscreen: false });
        assert.equal(calls[0].tool_id, 'tv.open_channel'); assert.equal(calls[0].input.channel, 'fr2'); assert.equal(calls[0].input.fullscreen, false);
        for (const command of TV_COMMANDS) {
            assert.deepEqual(resolveAccessPolicy(command.name).required_capabilities, [command.capability]);
            assert.deepEqual(resolveAccessPolicy('runtime.tools.call', { tool_id: command.name }).required_capabilities, [command.capability]);
        }
    } finally { delete globalThis.window; }
});
test('voice context supplies fullscreen by default, preserves small-window requests and deduplicates calls', async () => {
    const invocations = [];
    const session = createConversationSession({ actor: () => ({ id: 'u' }), quota: { getSummary: () => ({}) },
        mcp: async ({ method, params }) => ({ result: method === 'runtime.tools.list' ? { tools: TV_COMMANDS.map(c => ({ name: c.name, description: c.description, parameters: c.input_schema })) }
            : method === 'ai.tools.list' ? { tools: [] } : (invocations.push(params), { ok: true, playback: 'opened_unconfirmed' }) }),
        request: async () => { throw new Error('Voice tool execution must not request a second provider response'); } });
    const voice = await session.createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    await voice.execute({ call_id: 'discover', name: 'atome_tool_search', arguments: '{"query":"tv.open_channel"}' });
    // Runtime catalogue order is the canonical contract order; open_channel is third.
    const first = { call_id: 'view', name: 'atome_2', arguments: '{"input":{"channel":"fr2"},"action":"pointer.click"}' };
    await voice.execute(first); assert.equal(invocations[0].input.fullscreen, true); assert.equal(invocations[0].source.type, 'voice');
    assert.throws(() => voice.execute(first), /duplicate_tool_call/);
    await voice.execute({ ...first, call_id: 'small', arguments: '{"input":{"channel":"fr2","fullscreen":false},"action":"pointer.click"}' });
    assert.equal(invocations[1].input.fullscreen, false);
    await voice.execute({ call_id: 'epg', name: 'atome_6', arguments: '{"input":{"channel":"fr2"},"action":"pointer.click"}' });
    assert.equal(invocations[2].tool_id, 'tv.now'); assert.equal(Object.hasOwn(invocations[2].input, 'fullscreen'), false);
});

test('viewing commands are always at hand; an open tool adds its commands and one line, a closed one nothing', async () => {
    const { YOUTUBE_COMMANDS } = await import('../../atome/src/squirrel/youtube/contracts.js');
    const catalogue = [...TV_COMMANDS, ...YOUTUBE_COMMANDS].map(c => ({ name: c.name, description: c.description, parameters: c.input_schema }));
    let open = null;
    const session = createConversationSession({ actor: () => ({ id: 'u' }), quota: { getSummary: () => ({}) },
        mcp: async ({ method }) => ({ result: method === 'runtime.tools.list' ? { tools: catalogue } : { tools: [] } }),
        toolContext: async () => open,
        request: async () => { throw new Error('no provider response in this test'); } });
    const named = (voice) => voice.tools.map(tool => String(tool.description || '').split(':')[0]).filter(Boolean);
    const closed = await session.createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    assert.deepEqual(named(closed).sort(), ['Discover authorized Atome tools by matching words in their names and descriptions. Search before choosing a tool that is not yet available.', 'tv.open_channel', 'youtube.play'].sort());
    assert.equal(closed.instructions.includes('Open tools:'), false);
    open = { preload: YOUTUBE_COMMANDS.map(c => c.name), notes: ['YouTube is open: « mets … » means youtube.play.'] };
    const opened = await session.createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    assert.ok(['youtube.search', 'youtube.close', 'youtube.set_fullscreen'].every(name => named(opened).includes(name)));
    assert.ok(opened.instructions.endsWith('Open tools: YouTube is open: « mets … » means youtube.play.'));
});

test('the assistant actor may watch television and YouTube but still needs confirmation to publish', async () => {
    const { resolveActorProfile, hasActorCapability } = await import('../../atome/src/squirrel/atome/mcp_security.js');
    const actor = resolveActorProfile({ actor: { user_id: 'u' } });
    for (const tool of ['tv.open_channel', 'tv.list_channels', 'youtube.play', 'youtube.search']) {
        const policy = resolveAccessPolicy('runtime.tools.call', { tool_id: tool });
        assert.equal(hasActorCapability(actor, policy.required_capabilities), true, tool);
    }
    assert.equal(resolveAccessPolicy('runtime.tools.call', { tool_id: 'social.publish' }).confirmation_required, true);
});
