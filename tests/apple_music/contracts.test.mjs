import { expect, test, vi } from 'vitest';
import { APPLE_MUSIC_ASSISTANT_INSTRUCTIONS, APPLE_MUSIC_COMMANDS, APPLE_MUSIC_ERRORS, validateAppleMusicInput } from '../../atome/src/squirrel/apple_music/contracts.js';
import { createMcpContractHandlers } from '../../atome/src/squirrel/atome/mcp_handlers_contracts.js';
import { resolveAccessPolicy } from '../../atome/src/squirrel/atome/mcp_security_policy.js';
import { resolveActorProfile, hasActorCapability, writeIdempotencyRecord, readIdempotencyRecord } from '../../atome/src/squirrel/atome/mcp_security.js';
import { getSessionState, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
import { createConversationSession } from '../../atome/src/squirrel/ai/conversation_session.js';
import { createMcpAiRuntimeHandlers } from '../../atome/src/squirrel/atome/mcp_handlers_ai_runtime.js';
import { EVE_FR_APPLE_MUSIC_MESSAGES, EVE_EN_APPLE_MUSIC_MESSAGES } from '../../eVe/i18n/languages_apple_music.js';
import { authorizeProjectTool, restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';

test('typed music commands reject ambiguous IDs, unknown inputs, limits and deletion', () => {
    expect(validateAppleMusicInput('play', { id: '123' })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('play', { id: '123', query: 'song', kind: 'song' })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('play', { query: 'Pink Floyd', kind: 'artist' })).toBeNull();
    expect(validateAppleMusicInput('search', { query: '   ' })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('search', { query: 'A', limit: 26 })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('create_playlist', { name: 'A', token: 'secret' })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('add_tracks', { playlist_id: 'p.1', track_ids: [] })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('add_tracks', { playlist_id: 'p.1', track_ids: ['1', '1'] })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('delete_playlist', {})).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('list_library', { kind: 'song', offset: 25, limit: 25 })).toBeNull();
    expect(validateAppleMusicInput('list_library', {})).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('list_library', { kind: 'artist' })).toBe('INVALID_ARGUMENT');
    expect(validateAppleMusicInput('favorite_current', {})).toBeNull();
    expect(validateAppleMusicInput('favorite_current', { song_id: 'invented' })).toBe('INVALID_ARGUMENT');
});
test('music MCP uses canonical Runtime V2, granular capabilities and write idempotency', async () => {
    const handlers = createMcpContractHandlers(), calls = [], previous = globalThis.window;
    globalThis.window = { document: {}, atome: { tools: { v2Runtime: { invokeById: async input => {
        calls.push(input); return { ok: true, result: { ok: true, playback: 'paused' } };
    } } } } };
    try {
        await handlers['apple_music.pause']({ idempotency_key: 'once', source: { type: 'voice' } });
        expect(calls[0]).toMatchObject({ tool_id: 'apple_music.pause', input: {}, meta: { idempotency_key: 'once' } });
        expect((await handlers['apple_music.search']({ query: 'A', script: 'bad' })).error).toBe('INVALID_ARGUMENT');
        const actor = resolveActorProfile({});
        for (const command of APPLE_MUSIC_COMMANDS) {
            for (const [method, params] of [[command.name, {}], ['runtime.tools.call', { tool_id: command.name }]]) {
                const policy = resolveAccessPolicy(method, params);
                expect(policy.required_capabilities).toEqual([command.capability]);
                expect(hasActorCapability(actor, policy.required_capabilities)).toBe(true);
                if (command.access === 'write') expect(policy.idempotent).toBe(true);
            }
        }
    } finally { globalThis.window = previous; }
});
test('voice gets music listening tools immediately and preserves the same MCP execution path as television', async () => {
    const invoked = [], catalog = APPLE_MUSIC_COMMANDS.map(command => ({ name: command.name, description: command.description, parameters: command.input_schema }));
    const sessionOn = toolContext => createConversationSession({ actor: () => ({ id: 'alice' }), quota: { getSummary: () => ({}) }, toolContext,
        mcp: async ({ method, params }) => ({ result: method === 'runtime.tools.list' ? { tools: catalog } : method === 'ai.tools.list' ? { tools: [] }
            : (invoked.push(params), { ok: true, playback: 'opened_unconfirmed' }) }) });
    // A host without Apple Music (Web, desktop) contributes nothing: the assistant is never told to use it.
    const elsewhere = await sessionOn(async () => null).createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    expect(elsewhere.instructions).not.toContain('Apple Music:');
    expect(elsewhere.tools.some(entry => entry.description?.startsWith('apple_music.'))).toBe(false);
    // The iPhone and iPad app: the Apple Music owner gives play/search and its rules (apple_music_runtime.js#appleMusicAssistantContext).
    const session = sessionOn(async () => ({ preload: ['apple_music.play', 'apple_music.search'], instructions: [APPLE_MUSIC_ASSISTANT_INSTRUCTIONS], notes: [] }));
    const voice = await session.createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    expect(voice.instructions).toContain('Television:'); expect(voice.instructions).toContain('Apple Music:');
    expect(voice.instructions).toContain('OPERATION_UNCONFIRMED');
    expect(voice.instructions).toContain('apple_music.favorite_current');
    const tool = voice.tools.find(entry => entry.description?.startsWith('apple_music.play:'));
    expect(tool).toBeTruthy();
    await voice.execute({ call_id: 'music', name: tool.name, arguments: JSON.stringify({ input: { query: 'Pink Floyd', kind: 'artist' }, action: 'pointer.click' }) });
    expect(invoked[0]).toMatchObject({ tool_id: 'apple_music.play', source: { type: 'voice' }, input: { query: 'Pink Floyd', kind: 'artist' } });
    expect(invoked[0].input).not.toHaveProperty('fullscreen');
});
test('every music error has French and English product text', () => {
    for (const error of APPLE_MUSIC_ERRORS) {
        expect(EVE_FR_APPLE_MUSIC_MESSAGES['eve.apple_music.error.' + error]).toBeTruthy();
        expect(EVE_EN_APPLE_MUSIC_MESSAGES['eve.apple_music.error.' + error]).toBeTruthy();
    }
});
test('MusicKit commands are permitted from a consultation home without allowing arbitrary project edits', async () => {
    const windowRef = { __currentProject: { id: 'home' }, __eveWorkspaceMode: { mode: 'project' } };
    restoreProjectWorkModeValue('home', 'consultation', { windowRef });
    try {
        expect(await authorizeProjectTool({ tool: { id: 'apple_music.pause' }, context: {}, windowRef })).toEqual({ ok: true });
        expect(await authorizeProjectTool({ tool: { id: 'ui.shape.create' }, context: {}, windowRef })).toMatchObject({ ok: false });
    } finally { restoreProjectWorkModeValue('home', 'edit', { windowRef }); }
});
test('batch and toolchain policies retain the Apple Music write capability', () => {
    const actor = resolveActorProfile({ actor: { capabilities: ['runtime.execute'] } });
    const batch = resolveAccessPolicy('runtime.tools.batch_call', { events: [{ tool_id: 'apple_music.create_playlist', input: { name: 'A' } }] });
    expect(batch.required_capabilities).toContain('apple_music.write');
    expect(hasActorCapability(actor, batch.required_capabilities)).toBe(false);
    const chain = resolveAccessPolicy('mcp.toolchains.execute', { steps: [
        { method: 'runtime.tools.call', params: { tool_id: 'ui.capture.audio' } },
        { method: 'runtime.tools.call', params: { tool_id: 'apple_music.add_tracks' } }
    ] });
    expect(chain.required_capabilities).toContain('apple_music.write');
});
test('batch execution inherits the caller actor, dry-run and stable per-step idempotency', async () => {
    const invokeBatch = vi.fn(async () => ({ ok: true })), previous = globalThis.window;
    globalThis.window = { document: {}, atome: { tools: { v2Runtime: { invokeBatch, invokeById: vi.fn() } } } };
    try {
        await createMcpAiRuntimeHandlers()['runtime.tools.batch_call']({ actor: { id: 'alice' }, dry_run: true, idempotency_key: 'batch',
            events: [{ tool_id: 'apple_music.create_playlist', input: { name: 'A' }, actor: { id: 'other' } }] });
        expect(invokeBatch.mock.calls[0][0][0]).toMatchObject({ actor: { id: 'alice' }, dry_run: true, meta: { idempotency_key: 'batch:0' } });
    } finally { globalThis.window = previous; }
});
test('MCP idempotency receipts are isolated by the real Atome account and delegated actor', () => {
    const previous = getSessionState(), policy = resolveAccessPolicy('apple_music.create_playlist');
    const params = { idempotency_key: 'same', actor: { id: 'assistant' } };
    try {
        setSessionState({ mode: 'authenticated', user: { id: 'alice' } }, { persist: false, silent: true });
        writeIdempotencyRecord('apple_music.create_playlist', params, policy, { playlist_id: 'private' });
        expect(readIdempotencyRecord('apple_music.create_playlist', params, policy).result.playlist_id).toBe('private');
        expect(readIdempotencyRecord('apple_music.create_playlist', { ...params, actor: { id: 'other' } }, policy)).toBeNull();
        setSessionState({ mode: 'authenticated', user: { id: 'bob' } }, { persist: false, silent: true });
        expect(readIdempotencyRecord('apple_music.create_playlist', params, policy)).toBeNull();
    } finally { setSessionState(previous, { persist: false, silent: true }); }
});
