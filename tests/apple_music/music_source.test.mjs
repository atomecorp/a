import { afterEach, expect, test, vi } from 'vitest';
const { gatewayRuntime } = vi.hoisted(() => ({ gatewayRuntime: {} }));
vi.mock('../../eVe/intuition/tools/core/tool_runtime.js', () => ({ toolRuntimeV2: gatewayRuntime }));
vi.mock('../../eVe/intuition/tools/core/tool_runtime_context.js', () => ({
    buildRuntimeContext: () => ({ selection: { ids: [] } }), readInputSelectionIds: () => []
}));
vi.mock('../../eVe/domains/dashboard/dashboard_mystic_sources.js', () => ({
    dashboardMysticLabelItem: input => input, dashboardMysticTool: vi.fn()
}));
import { createMusicSource, resolveMusicProvider } from '../../eVe/domains/music/music_source.js';
import { setEveLocale } from '../../eVe/i18n/i18n.js';
import { invokeToolGateway } from '../../eVe/intuition/runtime/tool_gateway.js';
import { createToolRuntimeLeafExecutors } from '../../eVe/intuition/tools/core/tool_runtime_executors.js';
import { createToolRuntimeDispatch } from '../../eVe/intuition/tools/core/tool_runtime_dispatch.js';
import { createToolRuntimeInvokeMethods } from '../../eVe/intuition/tools/core/tool_runtime_invoke_methods.js';
import { APPLE_MUSIC_COMMANDS } from '../../atome/src/squirrel/apple_music/contracts.js';
import { contractCommandHandlers } from '../../eVe/intuition/tools/core/tool_runtime_service_commands.js';
setEveLocale('en');
afterEach(() => vi.unstubAllGlobals());

test('the real gateway and registered executor expose iOS consent, and Authorize asks the device', async () => {
    const native = vi.fn(async action => action === 'get_state'
        ? { ok: true, supported: true, authorization: 'not_determined' }
        : { ok: true, supported: true, authorization: 'authorized' });
    vi.stubGlobal('window', { atome: { tools: { handlers: new Map(Object.entries(contractCommandHandlers(APPLE_MUSIC_COMMANDS, native))) } } });
    const options = { DEFAULT_PRESENTATION: 'ui', V2_SOURCE_LAYER: 'dashboard_mystic',
        normalizeAction: value => value, normalizeEventFromAction: () => 'touch', isSelectionTargetAllowed: () => true };
    const { executeRegisteredHandler } = createToolRuntimeLeafExecutors(options);
    const tools = APPLE_MUSIC_COMMANDS.map(({ name }) => ({ id: name, tool_key: name.replace('.', '_'),
        behavior: { effects: { 'pointer.click': 'ephemeral' } } }));
    Object.assign(gatewayRuntime, createToolRuntimeInvokeMethods({ ...createToolRuntimeDispatch(options),
        validateCapabilities: async () => ({ ok: true }), resolveExecutionMode: () => 'v2_registered_handler',
        resolveExecutor: () => executeRegisteredHandler, latchTraceEnabled: () => false,
        validateProtectedSystemToolContract: () => ({ ok: true }) }), {
        resolveTool: async id => tools.find(tool => tool.id === id || tool.tool_key === id),
        updateLatchTrackingAfterInvoke: async () => {}, handleSelectionLatchPropagationAfterInvoke: async () => {}
    });
    const command = (tool_id, input) => invokeToolGateway({ tool_id, action: 'pointer.click', input,
        source: { type: 'ui', layer: 'dashboard_mystic' } });
    const envelope = await command('apple_music.get_state', {});
    expect(envelope.result.bridged).toBe('registered_handler');
    const source = createMusicSource({ provider: 'apple_music', command, notice: async () => {} });
    expect(await source.state()).toEqual({ ok: true, need: 'authorize', now: null });
    await source.authorize();
    expect(native).toHaveBeenLastCalledWith('authorize', {}, expect.any(Object));
});
test('Musique is Apple Music on the device, found without any command; elsewhere nothing local', async () => {
    const command = vi.fn();
    expect(await resolveMusicProvider({ command, apple: async () => true })).toBe('apple_music');
    expect(await resolveMusicProvider({ command, remote: false, apple: async () => false })).toBe('');
    expect(command).not.toHaveBeenCalled();
});
test('the song playing, its cover, the songs, search, transport, seek and writes all use canonical commands and native IDs', async () => {
    const notices = [];
    const answers = {
        'apple_music.get_state': { ok: true, supported: true, authorization: 'authorized', playback: 'playing', title: 'Song', artist: 'Artist',
            current_song_id: 'i.1', current_entry_id: 'e1', duration: 200, position: 40 },
        'apple_music.artwork': { ok: true, items: [{ id: 'i.1', artwork: 'data:image/jpeg;base64,AA' }] },
        'apple_music.list_library': { ok: true, items: [{ id: 'i.1', name: 'Song', artist: 'Artist', kind: 'song', scope: 'library', duration: 200 }], has_more: true },
        'apple_music.favorite_current': { ok: true, favorited: true }
    };
    const command = vi.fn(async (name, input) => ({ ok: true, result: name === 'apple_music.search'
        ? { ok: true, items: [{ id: input.kind === 'song' ? '123' : 'x.' + input.kind, name: 'Found', kind: input.kind, scope: 'catalog' }] }
        : answers[name] || { ok: true, playlist_id: 'p.1' } }));
    const source = createMusicSource({ provider: 'apple_music', command, notice: async value => notices.push(value), createId: () => 'unique' });
    const state = await source.state();
    expect(state.now).toEqual({ id: 'i.1', title: 'Song', artist: 'Artist', duration: 200, position: 40, playing: true, artwork: '' });
    expect(await source.nowCover(state.now)).toBe('data:image/jpeg;base64,AA');
    expect(command).toHaveBeenLastCalledWith('apple_music.artwork', { size: 512 });
    const songs = await source.songs(0);
    expect(command).toHaveBeenLastCalledWith('apple_music.list_library', { kind: 'song', limit: 25, offset: 0 });
    expect(songs).toMatchObject({ ok: true, more: true, items: [{ id: 'i.1', kind: 'song', scope: 'library', title: 'Song', duration: 200 }] });
    expect([...(await source.covers(songs.items))]).toEqual([['i.1', 'data:image/jpeg;base64,AA']]);
    expect(command).toHaveBeenLastCalledWith('apple_music.artwork', { ids: ['i.1'], scope: 'library', size: 112 });
    await source.play(songs.items[0]);
    expect(command).toHaveBeenLastCalledWith('apple_music.play', { id: 'i.1', kind: 'song', scope: 'library' });
    await source.transport('pause'); expect(command).toHaveBeenLastCalledWith('apple_music.pause', {});
    await source.seek(120); expect(command).toHaveBeenLastCalledWith('apple_music.seek', { seconds: 120 });
    const found = await source.search('Found');
    expect(command.mock.calls.filter(([name]) => name === 'apple_music.search').map(([, input]) => input)).toEqual([
        { query: 'Found', kind: 'song', limit: 25 }, { query: 'Found', kind: 'artist', limit: 3 }, { query: 'Found', kind: 'playlist', limit: 2 }]);
    expect(found.songs.map(item => item.id)).toEqual(['123']); expect(found.tiles.map(item => item.kind)).toEqual(['artist', 'playlist']);
    await source.addTo({ id: 'p.1' }, found.songs[0]);
    expect(command).toHaveBeenLastCalledWith('apple_music.add_tracks', { playlist_id: 'p.1', track_ids: ['123'], scope: 'catalog', request_id: 'unique' });
    await source.createPlaylist('Evening');
    expect(command).toHaveBeenLastCalledWith('apple_music.create_playlist', { name: 'Evening', request_id: 'unique' });
    await source.favorite();
    expect(command).toHaveBeenLastCalledWith('apple_music.favorite_current', { request_id: 'unique' });
    expect(notices).toEqual(['Song added to playlist', 'Playlist created', 'Song added to favorites']);
});
test('a refused command says why and changes nothing', async () => {
    const notices = [];
    const command = vi.fn(async () => ({ ok: true, result: { ok: false, error: 'SUBSCRIPTION_REQUIRED' } }));
    const source = createMusicSource({ provider: 'apple_music', command, notice: async value => notices.push(value) });
    expect(await source.play({ id: '1', kind: 'song', scope: 'catalog' })).toEqual({ ok: false, error: 'SUBSCRIPTION_REQUIRED' });
    expect(notices).toEqual(['An Apple Music subscription is required to play the catalogue']);
});
