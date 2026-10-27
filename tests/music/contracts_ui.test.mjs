import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../../eVe/intuition/tools/core/tool_runtime.js', () => ({ toolRuntimeV2: {} }));
vi.mock('../../eVe/domains/dashboard/dashboard_mystic_sources.js', () => ({ dashboardMysticLabelItem: input => input, dashboardMysticTool: vi.fn() }));
import { MUSIC_COMMANDS, MUSIC_ERRORS, validateMusicInput } from '../../atome/src/squirrel/music/contracts.js';
import { createMusicRuntime } from '../../eVe/domains/music/music_runtime.js';
import { createMusicSource, resolveMusicProvider } from '../../eVe/domains/music/music_source.js';
import { buildServiceCommandDefs, serviceCommandHandlers } from '../../eVe/intuition/tools/core/tool_runtime_service_commands.js';
import { createMcpContractHandlers } from '../../atome/src/squirrel/atome/mcp_handlers_contracts.js';
import { resolveAccessPolicy } from '../../atome/src/squirrel/atome/mcp_security_policy.js';
import { hasActorCapability, resolveActorProfile } from '../../atome/src/squirrel/atome/mcp_security.js';
import { createConversationSession } from '../../atome/src/squirrel/ai/conversation_session.js';
import { setEveLocale } from '../../eVe/i18n/i18n.js';
import { EVE_EN_MUSIC_MESSAGES, EVE_FR_MUSIC_MESSAGES } from '../../eVe/i18n/languages_music.js';
import { openOfficialPage } from '../../atome/src/squirrel/social/client.js';
setEveLocale('en');
afterEach(() => vi.unstubAllGlobals());
test('contracts reject injected endpoints, ambiguous play inputs, tokens and foreign providers', () => {
    for (const [action, input] of [['play', {}], ['play', { id: 'x', query: 'y', kind: 'song' }], ['play', { id: '../x', kind: 'song' }],
        ['connect', { access_token: 'secret' }], ['search', { query: 'x', limit: 11 }]]) {
        expect(validateMusicInput(action, { provider: 'spotify', ...input })).toBe('INVALID_ARGUMENT');
    }
    expect(validateMusicInput('get_state', { provider: 'other' })).toBe('INVALID_ARGUMENT');
    expect(validateMusicInput('play', { provider: 'spotify', id: 'track1', kind: 'song' })).toBeNull();
});
test('every declared command has real Runtime and MCP registration, matching capabilities and write idempotency', () => {
    const defs = buildServiceCommandDefs(value => value, 'registered'), handlers = serviceCommandHandlers(), mcp = createMcpContractHandlers();
    const owner = resolveActorProfile();
    for (const command of MUSIC_COMMANDS) {
        expect(defs.find(def => def.tool_id === command.name)?.input_schema).toEqual(command.input_schema);
        expect(typeof handlers[command.name]).toBe('function'); expect(typeof mcp[command.name]).toBe('function');
        for (const [method, params] of [[command.name, {}], ['runtime.tools.call', { tool_id: command.name }]]) {
            const policy = resolveAccessPolicy(method, params);
            expect(policy.required_capabilities).toEqual([command.capability]);
            expect(hasActorCapability(owner, policy.required_capabilities)).toBe(true);
            if (command.access === 'write') expect(policy.idempotent).toBe(true);
        }
    }
    expect(resolveAccessPolicy('runtime.tools.batch_call', { events: [{ tool_id: 'music.create_playlist' }] }).required_capabilities).toContain('music.write');
    expect(resolveAccessPolicy('mcp.toolchains.execute', { steps: [{ method: 'music.add_tracks' }] }).required_capabilities).toContain('music.write');
});
test('a lost transport reply retains the stable receipt ID and a changed user cannot receive private results', async () => {
    let owner = 'alice';
    const request = vi.fn(async () => { throw new Error('provider_connection_closed'); });
    const runtime = createMusicRuntime({ request, readActor: () => owner });
    const input = { provider: 'spotify', name: 'Morning' }, payload = { idempotency_key: 'same' };
    const first = await runtime.execute('create_playlist', input, payload), second = await runtime.execute('create_playlist', input, payload);
    expect(first).toMatchObject({ error: 'OPERATION_UNCONFIRMED', request_id: expect.any(String) }); expect(second.request_id).toBe(first.request_id);
    expect(request.mock.calls[0][1].input.request_id).toBe(first.request_id);
    const changed = createMusicRuntime({ readActor: () => owner, request: async () => { owner = 'bob'; return { ok: true, items: [{ name: 'private' }] }; } });
    expect(await changed.execute('list_library', { provider: 'spotify' })).toEqual({ ok: false, error: 'CONTEXT_CHANGED' });
});
test('Musique takes the first service entered in Passwords & keys, and Deezer only opens pages', async () => {
    const command = vi.fn(async (name, input) => ({ result: name === 'music.get_state'
        ? (input.provider === 'spotify' ? { ok: true, supported: true, configured: false } : { ok: true, supported: true, configured: true, state: 'catalog_only' })
        : name === 'music.open_item' ? { ok: true, url: 'https://www.deezer.com/track/1', playback: 'opened_unconfirmed' }
            : { ok: true, items: [{ id: '1', name: 'Song', kind: 'song', artist: 'A', artwork_url: 'https://cdn.example/c.jpg', duration: 90 }] } }));
    // Not entered in Passwords & keys: Spotify is skipped, Deezer is the one.
    expect(await resolveMusicProvider({ command, apple: async () => false })).toBe('deezer');
    const deezer = createMusicSource({ provider: 'deezer', command, notice: async () => {}, reserve: () => ({ close: vi.fn() }), open: async () => ({ ok: true }) });
    expect(await deezer.state()).toEqual({ ok: true, need: '', catalogOnly: true, now: null });
    expect(deezer.hasLibrary).toBe(false);
    const found = await deezer.search('Song');
    expect(command).toHaveBeenLastCalledWith('music.search', { provider: 'deezer', query: 'Song', kind: 'song', limit: 10 });
    expect(found.songs[0]).toMatchObject({ id: '1', title: 'Song', artist: 'A', artwork: 'https://cdn.example/c.jpg', duration: 90 });
    expect(await deezer.play(found.songs[0])).toMatchObject({ ok: true, playback: 'opened_unconfirmed' });
    expect(command).toHaveBeenLastCalledWith('music.open_item', { provider: 'deezer', id: '1', kind: 'song' });
});
test('Spotify consent reserves its browser during the gesture and all account requests go through tools', async () => {
    const order = [], reserve = () => { order.push('reserve'); return { close: vi.fn() }; };
    const command = vi.fn(async (name) => {
        order.push(name);
        return { result: name === 'music.get_state' ? { ok: true, supported: true, configured: true, state: 'disconnected' }
            : name === 'music.connect' ? { ok: true, authorization_url: 'https://accounts.spotify.com/authorize', attempt_id: 'a'.repeat(32) } : { ok: true } };
    });
    const spotify = createMusicSource({ provider: 'spotify', command, reserve, open: async () => { order.push('open'); return { ok: true }; }, notice: async () => {} });
    expect((await spotify.state()).need).toBe('connect');
    order.length = 0; await spotify.connect();
    expect(order).toEqual(['reserve', 'music.connect', 'open', 'music.await_connection']);
    expect(command).toHaveBeenLastCalledWith('music.await_connection', { provider: 'spotify', attempt_id: 'a'.repeat(32) });
});
test('official-page capability rejects arbitrary hosts, credentials and ports', async () => {
    const open = vi.fn(() => ({ opener: null })); vi.stubGlobal('window', { open });
    for (const url of ['https://evil.example', 'https://accounts.spotify.com.evil.example', 'https://user:pass@accounts.spotify.com', 'https://accounts.spotify.com:8443']) {
        expect((await openOfficialPage(url)).ok).toBe(false);
    }
    expect((await openOfficialPage('https://accounts.spotify.com/authorize')).ok).toBe(true); expect(open).toHaveBeenCalledTimes(1);
});
test('all provider errors are localized and explicit Spotify tools are immediately available to voice', async () => {
    for (const error of MUSIC_ERRORS) {
        expect(EVE_FR_MUSIC_MESSAGES['eve.music.error.' + error]).toBeTruthy(); expect(EVE_EN_MUSIC_MESSAGES['eve.music.error.' + error]).toBeTruthy();
    }
    const catalog = MUSIC_COMMANDS.map(command => ({ name: command.name, description: command.description, parameters: command.input_schema }));
    const session = createConversationSession({ actor: () => ({ id: 'alice' }), quota: { getSummary: () => ({}) },
        mcp: async ({ method }) => ({ result: method === 'runtime.tools.list' ? { tools: catalog } : { tools: [] } }) });
    const voice = await session.createVoiceTools({ signal: new AbortController().signal, deliver: async () => {} });
    expect(voice.tools.some(tool => tool.description?.startsWith('music.play:'))).toBe(true);
    expect(voice.instructions).toContain('DEVELOPER_ACCESS_REQUIRED'); expect(voice.instructions).toContain('OPERATION_UNCONFIRMED');
});
