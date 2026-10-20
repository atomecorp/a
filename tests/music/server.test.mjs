import { expect, test, vi } from 'vitest';
import { handleMusicAction, musicReceiptApi } from '../../server/music/music_operations.js';
import { handleWsAiProviderOperation } from '../../server/wsAiProviderOperations.js';
import { context, providerDouble, response, session } from './helpers.mjs';

const call = (action, input, ctx) => handleMusicAction('music.' + action, { provider: 'spotify', ...input }, ctx);
const playlist = { id: 'pl1', name: 'Morning', public: false, owner: { id: 'alice-spotify' }, items: { total: 0 } };
test('readiness is explicit without developer access and never requests OpenAI or Spotify credentials', async () => {
    const fetchImpl = vi.fn();
    expect(await call('get_state', {}, context({ config: {}, fetchImpl }))).toMatchObject({ ok: true, state: 'not_configured', capabilities: [] });
    expect(await call('connect', {}, context({ config: {}, fetchImpl }))).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    expect(await handleMusicAction('music.get_state', { provider: 'deezer' }, context({ config: {}, fetchImpl }))).toMatchObject({ ok: true, configured: false, state: 'not_configured' });
    expect(await handleMusicAction('music.search', { provider: 'deezer', query: 'Daft Punk' }, context({ config: {}, fetchImpl }))).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    expect(await handleMusicAction('music.get_state', { provider: 'deezer' }, context({ fetchImpl }))).toMatchObject({ supported: true, state: 'catalog_only', capabilities: ['get_state', 'search', 'open_item'] });
    expect(await handleMusicAction('music.play', { provider: 'deezer', id: '1', kind: 'song' }, context({ fetchImpl }))).toEqual({ ok: false, error: 'DEVELOPER_ACCESS_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
});
test('authenticated provider socket routes music without reading an AI key and rejects anonymous requests', async () => {
    const vault = context().vault, read = vi.fn(async name => name === 'deezer' ? '5' : null), connection = { once() {} };
    const deps = { resolvePrincipal: () => 'alice', provisioned: async () => true, resolveVault: async () => ({ ...vault, read }) };
    const message = { type: 'ai-provider', requestId: 'music-readiness', action: 'music.get_state', payload: { input: { provider: 'deezer' } } };
    expect(await handleWsAiProviderOperation(message, connection, deps)).toMatchObject({ ok: true, data: { provider: 'deezer', state: 'catalog_only' } });
    expect(read.mock.calls.map(([name]) => name).sort()).toEqual(['deezer', 'spotify']);
    expect(await handleWsAiProviderOperation(message, connection, { ...deps, resolvePrincipal: () => null })).toMatchObject({ ok: false, error: 'not_authenticated' });
});
test('canonical receipt adapter uses authenticated event commit and current-state reads', async () => {
    const dispatch = vi.fn(async message => message.type === 'state-current' ? { ok: false, error: 'State not found' } : { ok: true });
    const connection = {}, check = vi.fn(), api = musicReceiptApi(connection, 'credential', check, dispatch);
    expect(await api.getStateCurrent('music_operation_a')).toBeNull();
    await api.commit({ id: 'event1', kind: 'set' });
    expect(dispatch.mock.calls[0]).toEqual([expect.objectContaining({ type: 'state-current', action: 'get', token: 'credential' }), connection]);
    expect(dispatch.mock.calls[1][0]).toMatchObject({ type: 'events', action: 'commit', event: { id: 'event1' } });
    expect(check).toHaveBeenCalledTimes(4);
});
test('private playlist creation is claimed before effect, read back and never duplicated after a retry', async () => {
    const ctx = context();
    const provider = providerDouble([
        ['POST', '/v1/me/playlists', ({ init }) => {
            expect([...ctx.receiptApi.states.values()][0].properties.status).toBe('submitting');
            expect(JSON.parse(init.body)).toMatchObject({ public: false, name: 'Morning' }); return playlist;
        }], ['GET', '/v1/playlists/pl1', () => playlist]
    ]); ctx.fetchImpl = provider.fetchImpl;
    const input = { name: 'Morning', request_id: 'create1' };
    expect(await call('create_playlist', input, ctx)).toMatchObject({ ok: true, playlist_id: 'pl1', status: 'completed' });
    expect(await call('create_playlist', input, ctx)).toMatchObject({ ok: true, status: 'completed' });
    expect(provider.calls.filter(entry => entry.method === 'POST')).toHaveLength(1);
    expect(await call('create_playlist', { ...input, name: 'Different' }, ctx)).toMatchObject({ error: 'OPERATION_CONFLICT' });
    expect(JSON.stringify([...ctx.receiptApi.states.values()])).not.toContain('private-access');
});
test('a lost provider write response stays unconfirmed across restart and operation_status sends nothing', async () => {
    const ctx = context(), provider = providerDouble([['POST', '/v1/me/playlists', () => { throw new Error('lost response'); }]]);
    ctx.fetchImpl = provider.fetchImpl;
    const input = { name: 'Morning', request_id: 'lost' };
    expect(await call('create_playlist', input, ctx)).toMatchObject({ error: 'OPERATION_UNCONFIRMED', status: 'unconfirmed', request_id: 'lost' });
    expect(await call('create_playlist', input, { ...ctx })).toMatchObject({ status: 'unconfirmed' });
    expect(await call('operation_status', { request_id: 'lost' }, ctx)).toMatchObject({ status: 'unconfirmed' });
    expect(provider.calls).toHaveLength(1);
});
test('a refusal during read-back after an accepted effect cannot become a safe failure', async () => {
    const ctx = context({ fetchImpl: providerDouble([
        ['POST', '/v1/me/playlists', () => playlist], ['GET', '/v1/playlists/pl1', () => response({}, 403)]
    ]).fetchImpl });
    expect(await call('create_playlist', { name: 'Morning', request_id: 'readback' }, ctx)).toMatchObject({ status: 'unconfirmed', error: 'OPERATION_UNCONFIRMED' });
});
test('concurrent identical requests acquire only one durable claim', async () => {
    const provider = providerDouble([['POST', '/v1/me/playlists', () => playlist], ['GET', '/v1/playlists/pl1', () => playlist]]);
    const ctx = context({ fetchImpl: provider.fetchImpl }), input = { name: 'Morning', request_id: 'concurrent' };
    const results = await Promise.all([call('create_playlist', input, ctx), call('create_playlist', input, ctx)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(provider.calls.filter(entry => entry.method === 'POST')).toHaveLength(1);
});
test('favorite freezes the actual track, refuses a changed song before effect and never retargets a retry', async () => {
    let reads = 0;
    const provider = providerDouble([['GET', '/v1/me/player', () => ({ is_playing: true,
        item: { type: 'track', id: ++reads === 1 ? 'trackA' : 'trackB', name: 'Track' } })]]);
    const ctx = context({ fetchImpl: provider.fetchImpl }), input = { request_id: 'favorite' };
    expect(await call('favorite_current', input, ctx)).toMatchObject({ error: 'CURRENT_SONG_CHANGED', status: 'failed' });
    expect([...ctx.receiptApi.states.values()][0].properties.request.input.song_id).toBe('trackA');
    expect(await call('favorite_current', input, ctx)).toMatchObject({ error: 'CURRENT_SONG_CHANGED', status: 'failed' });
    expect(reads).toBe(2); expect(provider.calls.every(entry => entry.method === 'GET')).toBe(true);
});
test('favorite is confirmed only by a strict true read-back from the provider', async () => {
    const routes = flag => [
        ['GET', '/v1/me/player', () => ({ item: { type: 'track', id: 'trackA', name: 'A' } })],
        ['PUT', '/v1/me/library', ({ url }) => { expect(url.searchParams.get('uris')).toBe('spotify:track:trackA'); return response(null, 204); }],
        ['GET', '/v1/me/library/contains', () => [flag]]
    ];
    expect(await call('favorite_current', { request_id: 'true' }, context({ fetchImpl: providerDouble(routes(true)).fetchImpl }))).toMatchObject({ ok: true, favorited: true });
    expect(await call('favorite_current', { request_id: 'string' }, context({ fetchImpl: providerDouble(routes('true')).fetchImpl }))).toMatchObject({ error: 'OPERATION_UNCONFIRMED' });
});
test('playlist append uses current /items paths and verifies exact appended URIs', async () => {
    const provider = providerDouble([
        ['GET', '/v1/playlists/pl1', () => ({ ...playlist, items: { total: 7 } })],
        ['POST', '/v1/playlists/pl1/items', ({ init }) => { expect(JSON.parse(init.body).uris).toEqual(['spotify:track:trackA']); return { snapshot_id: 'snap' }; }],
        ['GET', '/v1/playlists/pl1/items', ({ url }) => { expect(url.searchParams.get('offset')).toBe('7'); return { items: [{ item: { uri: 'spotify:track:trackA' } }] }; }]
    ]);
    expect(await call('add_tracks', { playlist_id: 'pl1', track_ids: ['trackA'], request_id: 'append' }, context({ fetchImpl: provider.fetchImpl }))).toMatchObject({ ok: true, status: 'completed' });
});
test('ambiguous queries and absent devices never start Spotify playback', async () => {
    const provider = providerDouble([
        ['GET', '/v1/search', () => ({ tracks: { items: [{ type: 'track', id: 'a', name: 'Same' }, { type: 'track', id: 'b', name: 'Same' }], next: null } })],
        ['GET', '/v1/me/player', () => response(null, 204)]
    ]), ctx = context({ fetchImpl: provider.fetchImpl });
    expect(await call('play', { query: 'Same', kind: 'song' }, ctx)).toMatchObject({ error: 'AMBIGUOUS_SELECTION', candidates: [{ id: 'a' }, { id: 'b' }] });
    expect(await call('play', { id: 'a', kind: 'song' }, ctx)).toMatchObject({ error: 'NO_ACTIVE_DEVICE' });
    expect(provider.calls.every(entry => entry.method === 'GET')).toBe(true);
});
test('receipt reads reject foreign owners and wrong providers', async () => {
    const ctx = context();
    ctx.receiptApi.getStateCurrent.mockResolvedValue({ id: 'foreign', type: 'music_operation', owner_id: 'bob', properties: {} });
    expect(await call('operation_status', { request_id: 'private' }, ctx)).toMatchObject({ error: 'OPERATION_NOT_FOUND' });
});
test('Deezer public search uses only the fixed public endpoint and strips previews and provider payloads', async () => {
    const provider = providerDouble([['GET', '/search', ({ url, init }) => {
        expect(url.origin).toBe('https://api.deezer.com'); expect(url.searchParams.get('index')).toBe('10');
        expect(init.headers).toBeUndefined();
        return { data: [{ id: 67238732, title: 'Instant Crush', type: 'track', artist: { name: 'Daft Punk' }, preview: 'signed-preview',
            link: 'https://untrusted.example' }], next: 'https://untrusted.example/next' };
    }]]), ctx = context({ fetchImpl: provider.fetchImpl });
    expect(await handleMusicAction('music.search', { provider: 'deezer', query: 'Daft Punk', limit: 10, offset: 10 }, ctx)).toEqual({
        ok: true, items: [{ id: '67238732', name: 'Instant Crush', kind: 'song', artist: 'Daft Punk' }], has_more: true });
    expect(await handleMusicAction('music.open_item', { provider: 'deezer', id: '67238732', kind: 'song' }, ctx)).toEqual({
        ok: true, url: 'https://www.deezer.com/track/67238732', playback: 'opened_unconfirmed' });
    expect(provider.calls).toHaveLength(1);
});
test('Deezer private writes remain blocked and errors cannot masquerade as an empty catalog', async () => {
    const ctx = context({ fetchImpl: providerDouble([['GET', '/search', () => ({ error: { code: 4, message: 'private-provider-message' } })]]).fetchImpl });
    expect(await handleMusicAction('music.search', { provider: 'deezer', query: 'a' }, ctx)).toEqual({ ok: false, error: 'PROVIDER_REJECTED' });
    expect(await handleMusicAction('music.create_playlist', { provider: 'deezer', name: 'A' }, ctx)).toEqual({ ok: false, error: 'DEVELOPER_ACCESS_REQUIRED' });
    expect(ctx.receiptApi.commit).not.toHaveBeenCalled();
});
test('disconnect during a provider read prevents the later playback effect', async () => {
    const ctx = context();
    const provider = providerDouble([['GET', '/v1/me/player', () => {
        ctx.vault.removeRecord('music.spotify');
        return { is_playing: true, device: { id: 'deviceA' }, item: { type: 'track', id: 'trackA', name: 'A' } };
    }]]); ctx.fetchImpl = provider.fetchImpl;
    expect(await call('play', { id: 'trackA', kind: 'song' }, ctx)).toMatchObject({ error: 'CONTEXT_CHANGED' });
    expect(provider.calls).toHaveLength(1); expect(provider.calls[0].method).toBe('GET');
});
test('reconnecting another Spotify account cannot reuse a previous account’s write intent', async () => {
    const provider = providerDouble([['POST', '/v1/me/playlists', () => playlist], ['GET', '/v1/playlists/pl1', () => playlist]]);
    const ctx = context({ fetchImpl: provider.fetchImpl }), input = { name: 'Morning', request_id: 'account-bound' };
    expect(await call('create_playlist', input, ctx)).toMatchObject({ ok: true });
    await ctx.vault.storeRecord('music.spotify', session({ authorization_id: 'new-session', identity: { id: 'other-provider-account', name: 'Other' } }));
    expect(await call('create_playlist', input, ctx)).toMatchObject({ error: 'CONTEXT_CHANGED' });
    expect(provider.calls.filter(entry => entry.method === 'POST')).toHaveLength(1);
});
