import { afterEach, expect, test, vi } from 'vitest';
const { gatewayRuntime } = vi.hoisted(() => ({ gatewayRuntime: {} }));
vi.mock('../../eVe/intuition/tools/core/tool_runtime.js', () => ({ toolRuntimeV2: gatewayRuntime }));
vi.mock('../../eVe/intuition/tools/core/tool_runtime_context.js', () => ({
    buildRuntimeContext: () => ({ selection: { ids: [] } }), readInputSelectionIds: () => []
}));
vi.mock('../../eVe/domains/dashboard/dashboard_mystic_sources.js', () => ({
    dashboardMysticLabelItem: input => input, dashboardMysticTool: vi.fn()
}));
import { createMusicMysticItem as createAppleMusicMysticItem } from '../../eVe/domains/music/music_mystic_items.js';
import { setEveLocale } from '../../eVe/i18n/i18n.js';
import { invokeToolGateway } from '../../eVe/intuition/runtime/tool_gateway.js';
import { createToolRuntimeLeafExecutors } from '../../eVe/intuition/tools/core/tool_runtime_executors.js';
import { createToolRuntimeDispatch } from '../../eVe/intuition/tools/core/tool_runtime_dispatch.js';
import { createToolRuntimeInvokeMethods } from '../../eVe/intuition/tools/core/tool_runtime_invoke_methods.js';
import { APPLE_MUSIC_COMMANDS } from '../../atome/src/squirrel/apple_music/contracts.js';
import { contractCommandHandlers } from '../../eVe/intuition/tools/core/tool_runtime_service_commands.js';
setEveLocale('en');
afterEach(() => vi.unstubAllGlobals());
const makeItem = input => input;

test('the real gateway and registered executor expose iOS consent rather than the Web-only tile', async () => {
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
    expect(envelope.result.result).toMatchObject({ supported: true, authorization: 'not_determined' });
    const palette = await createAppleMusicMysticItem({ makeItem, command, supported: () => true });
    palette.children = await palette.loadChildren();
    expect(palette.children[0].key).toBe('apple_music_authorize');
    expect(palette.children[0].disabled).not.toBe(true);
    await palette.children[0].onSelect();
    expect(native).toHaveBeenLastCalledWith('authorize', {}, expect.any(Object));
});
test('unsupported hosts omit the tile before any command or authorization request', async () => {
    const command = vi.fn();
    expect(await createAppleMusicMysticItem({ makeItem, command, supported: () => false })).toBe(null);
    expect(command).not.toHaveBeenCalled();
});
test('an iOS app missing native consent exposes the authorization action', async () => {
    const command = vi.fn(async () => ({ ok: true, result: { ok: true, supported: true, authorization: 'not_determined' } }));
    const palette = await createAppleMusicMysticItem({ makeItem, command, supported: () => true });
    palette.children = await palette.loadChildren();
    expect(palette.children[0].label).toBe('Authorize Apple Music');
    await palette.children[0].onSelect(); expect(command).toHaveBeenLastCalledWith('apple_music.authorize', {});
});
test('search, transport, named creation and song additions all use canonical commands and native IDs', async () => {
    const notices = [];
    const command = vi.fn(async (name) => ({ ok: true, result: name === 'apple_music.get_state'
        ? { ok: true, supported: true, authorization: 'authorized' }
        : name === 'apple_music.list_playlists' ? { ok: true, items: [{ id: 'p.1', name: 'Morning', kind: 'playlist', scope: 'library' }] }
        : name === 'apple_music.list_library' ? { ok: true, items: [{ id: 'i.123', name: 'Library song', kind: 'song', scope: 'library' }] }
        : name === 'apple_music.favorite_current' ? { ok: true, favorited: true }
        : name === 'apple_music.search' ? { ok: true, items: [{ id: '123', name: 'Song', kind: 'song', scope: 'catalog' }] }
        : { ok: true, playlist_id: 'p.1' } }));
    const palette = await createAppleMusicMysticItem({ makeItem, command, supported: () => true, notice: async value => notices.push(value), createId: () => 'unique' });
    palette.children = await palette.loadChildren();
    const library = palette.children[0];
    expect(library).toMatchObject({ key: 'apple_music_library', label: 'My library', icon: 'view_list' });
    expect(library.children.map(item => item.label)).toEqual(['My songs', 'My playlists']);
    await library.children[0].children[0].children[0].onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.play', { id: 'i.123', kind: 'song', scope: 'library' });
    await library.children[1].children[0].children[0].onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.play', { id: 'p.1', kind: 'playlist', scope: 'library' });
    await library.children[0].search('Library');
    expect(command).toHaveBeenLastCalledWith('apple_music.search', { query: 'Library', kind: 'song', scope: 'library', limit: 25 });
    await palette.children.find(item => item.key === 'apple_music_pause').onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.pause', {});
    const [song] = await palette.search('Song'); await song.children[0].onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.play', { id: '123', kind: 'song', scope: 'catalog' });
    expect(song.children[1].label).toBe('Add to “Morning”');
    await song.children[1].onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.add_tracks', { playlist_id: 'p.1', track_ids: ['123'], scope: 'catalog', request_id: 'unique' });
    const create = palette.children.find(item => item.key === 'apple_music_new_playlist');
    const [named] = await create.search('Evening'); await named.onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.create_playlist', { name: 'Evening', request_id: 'unique' });
    expect(notices).toEqual(['Song added to the playlist', 'Playlist created in Apple Music']);
    await palette.children.find(item => item.key === 'apple_music_favorite_current').onSelect();
    expect(command).toHaveBeenLastCalledWith('apple_music.favorite_current', {});
    expect(notices.at(-1)).toBe('Song added to Apple Music favorites');
});
