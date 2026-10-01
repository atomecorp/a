import test from 'node:test';
import assert from 'node:assert/strict';
import { TV_CHANNELS, findTvChannels, resolveTvChannel } from '../../atome/src/squirrel/tv/registry.js';
import { TV_COMMANDS, validateTvInput, validateTvOutput, tvPeriod } from '../../atome/src/squirrel/tv/contracts.js';
import { createTvService } from '../../atome/src/squirrel/tv/service.js';
import { createTvProviderAdapters } from '../../atome/src/squirrel/tv/providers.js';
const context = () => ({ client_id: 'test', user_id: 'u', project_id: 'p', platform: 'web', country: 'FR' });
const channel = { ...TV_CHANNELS[1], routes: [{ id: 'official', provider: 'francetv', verification: 'verified',
    platforms: ['web'], mode: 'native', domains: ['media.example.test'] }] };
const access = { ok: true, mode: 'native', source: 'https://media.example.test/live?private=secret', format: 'hls' };
const setup = (overrides = {}) => {
    let disposed = 0, starts = 0, fullscreen = false;
    const service = createTvService({ channels: [channel], context,
        adapters: createTvProviderAdapters({ request: async action => action === 'resolve' ? access : { ok: false } }),
        player: { prepare: async (_, { onState }) => ({ ok: true,
            play: async () => { starts++; onState({ playback: 'playing' }); return { ok: true }; },
            dispose: async () => { disposed++; } }) },
        viewer: { open: async () => ({ ok: true }), close: async () => {},
            setFullscreen: async value => ({ ok: true, fullscreen: fullscreen = value }) }, ...overrides });
    return { service, disposed: () => disposed, starts: () => starts, fullscreen: () => fullscreen };
};
test('canonical aliases, formulations and ambiguity share one registry', () => {
    for (const query of ['France 2', 'fr2', 'la deux', 'affiche-moi France 2', 'passe sur France 2'])
        assert.equal(resolveTvChannel(TV_CHANNELS, query).channel.id, 'france2');
    assert.equal(resolveTvChannel(TV_CHANNELS, 'France').error, 'AMBIGUOUS_CHANNEL');
    assert.ok(findTvChannels(TV_CHANNELS, 'découverte').length);
});
test('all ten contracts reject unknown fields, URL arguments and malformed intervals', () => {
    assert.equal(TV_COMMANDS.length, 10);
    assert.equal(validateTvOutput({ ok: true, source: access.source }), 'PLAYBACK_FAILED');
    assert.equal(validateTvInput('find_channel', { query: '   ' }), 'INVALID_ARGUMENT');
    assert.equal(validateTvInput('open_channel', { channel: 'x', source: access.source }), 'INVALID_ARGUMENT');
    assert.equal(tvPeriod({ from: '2026-10-01', to: '2026-10-02' }), null);
    assert.equal(tvPeriod({ from: '2026-10-01T00:00:00Z', to: '2026-10-09T00:00:00Z' }), null);
});
test('unverified sources and missing clients never claim playback', async () => {
    const service = createTvService({ context });
    assert.equal((await service.execute('open_channel', { channel: 'fr2' })).error, 'RIGHTS_NOT_VERIFIED');
    assert.equal(service.snapshot().playback, 'closed');
    assert.equal((await createTvService().execute('get_state')).error, 'NO_ACTIVE_CLIENT');
});
test('presentation changes preserve player and close releases it once', async () => {
    const s = setup();
    assert.equal((await s.service.execute('open_channel', { channel: 'fr2', fullscreen: true })).playback, 'playing');
    await s.service.execute('set_fullscreen', { enabled: false });
    assert.equal(s.starts(), 1); assert.equal(s.disposed(), 0);
    assert.equal(s.service.snapshot().fullscreen, false);
    assert.ok(!JSON.stringify(s.service.snapshot()).includes('secret'));
    await s.service.execute('close'); await s.service.execute('close');
    assert.equal(s.disposed(), 1); assert.equal(s.service.snapshot().playback, 'closed');
});
test('late access resolution cannot resurrect a closed viewer', async () => {
    let finish, prepared = 0;
    const s = setup({ adapters: createTvProviderAdapters({ request: () => new Promise(resolve => { finish = resolve; }) }),
        player: { prepare: async () => { prepared++; } } });
    const opening = s.service.execute('open_channel', { channel: 'fr2' });
    await new Promise(resolve => setImmediate(resolve));
    await s.service.execute('close'); finish(access);
    assert.equal((await opening).error, 'CANCELLED'); assert.equal(prepared, 0);
    assert.equal(s.service.snapshot().playback, 'closed');
});
test('program lookup never starts playback and rejects expired EPG', async () => {
    const s = setup();
    assert.equal((await s.service.execute('now', { channel: 'France 2' })).error, 'EPG_UNAVAILABLE');
    assert.equal(s.starts(), 0);
});
test('one canonical channel supports several routes without duplicate Finder results', async () => {
    let used;
    const second = { ...channel.routes[0], id: 'second', priority: 10 };
    const s = setup({ channels: [{ ...channel, routes: [...channel.routes, second] }],
        adapters: createTvProviderAdapters({ request: async (_, args) => { used = args.route_id; return access; } }) });
    assert.equal((await s.service.execute('list_channels')).channels.length, 1);
    await s.service.execute('open_channel', { channel: 'fr2' });
    assert.equal(used, 'second');
});
test('pagination defaults to 50, caps at 200 and rejects invalid cursors', async () => {
    const channels = Array.from({ length: 220 }, (_, i) => ({ ...channel, id: 'c' + i, name: 'C' + i }));
    const service = setup({ channels }).service;
    const first = await service.execute('list_channels');
    assert.equal(first.channels.length, 50); assert.equal(first.cursor, '50');
    assert.equal((await service.execute('list_channels', { cursor: '200' })).channels.length, 20);
    for (const input of [{ cursor: '001' }, { cursor: '221' }, { limit: 201 }])
        assert.equal((await service.execute('list_channels', input)).error, 'INVALID_ARGUMENT');
});
test('category choice requires an explicit configured preference', async () => {
    const info = TV_CHANNELS.filter(c => c.categories.includes('information'));
    assert.equal((await setup({ channels: info }).service.execute('open_channel', { channel: 'information' })).error, 'AMBIGUOUS_CHANNEL');
    const result = await setup({ channels: info, categoryPreferences: { information: 'franceinfo' } }).service.execute('open_channel', { channel: 'information' });
    assert.equal(result.channel_id, 'franceinfo'); assert.equal(result.error, 'RIGHTS_NOT_VERIFIED');
});
test('last valid zap wins and late playback callbacks cannot overwrite it', async () => {
    const requests = [], callbacks = [];
    const channels = [channel, { ...channel, id: 'other', name: 'Other', aliases: [] }];
    const s = setup({ channels,
        adapters: createTvProviderAdapters({ request: () => new Promise(resolve => requests.push(resolve)) }),
        player: { prepare: async (_, { onState }) => { callbacks.push(onState); return { ok: true, play: async () => ({ ok: true }), dispose() {} }; } } });
    const first = s.service.execute('open_channel', { channel: 'france2' });
    await new Promise(resolve => setImmediate(resolve)); requests[0](access); await first;
    const second = s.service.execute('open_channel', { channel: 'other' });
    await new Promise(resolve => setImmediate(resolve)); requests[1](access); await second;
    callbacks[0]({ playback: 'playing' });
    assert.equal(s.service.snapshot().channel_id, 'other'); assert.equal(s.service.snapshot().playback, 'opened_unconfirmed');
    callbacks[1]({ playback: 'playing' }); assert.equal(s.service.snapshot().playback, 'playing');
    await s.service.close(); callbacks[1]({ playback: 'playing' }); assert.equal(s.service.snapshot().playback, 'closed');
});
test('account/project change and revoked route stop the active player', async () => {
    let current = context(); const s = setup({ context: () => current });
    await s.service.execute('open_channel', { channel: 'fr2' });
    current = { ...current, project_id: 'another' };
    assert.equal((await s.service.execute('get_state')).playback, 'closed'); assert.equal(s.disposed(), 1);
    await s.service.execute('open_channel', { channel: 'fr2' });
    await s.service.configureRoutes([]); assert.equal(s.service.snapshot().playback, 'closed'); assert.equal(s.disposed(), 2);
    assert.equal((await setup({ context: () => ({ ambiguous: true }) }).service.execute('get_state')).error, 'AMBIGUOUS_CLIENT');
});
test('EPG normalizes UTC, exposes next programme and rejects expired/future freshness', async () => {
    const time = Date.parse('2026-10-01T12:00:00Z');
    const programs = [{ id: 'current', channel_id: 'france2', title: 'News', start: '2026-10-01T13:30:00+02:00', end: '2026-10-01T14:30:00+02:00',
        provenance: 'authorized-fixture', fetched_at: '2026-10-01T11:00:00Z', expires_at: '2026-10-01T13:00:00Z' },
        { id: 'next', channel_id: 'france2', title: 'Next News', start: '2026-10-01T12:30:00Z', end: '2026-10-01T13:00:00Z',
            provenance: 'authorized-fixture', fetched_at: '2026-10-01T11:00:00Z', expires_at: '2026-10-01T13:00:00Z' }];
    const s = setup({ now: () => time, adapters: createTvProviderAdapters({ request: async () => ({ ok: true, programs }) }) });
    assert.equal((await s.service.execute('now', { channel: 'fr2' })).program.start, '2026-10-01T11:30:00.000Z');
    assert.equal((await s.service.execute('next', { channel: 'fr2' })).program.id, 'next');
    assert.equal((await s.service.execute('search_program', { query: 'news' })).programs.length, 2);
    assert.equal(s.starts(), 0);
    programs.forEach(p => p.expires_at = '2026-10-01T11:59:00Z');
    assert.equal((await s.service.execute('now', { channel: 'fr2' })).error, 'EPG_UNAVAILABLE');
    assert.equal(tvPeriod({ from: '2026-02-30T12:00:00Z', to: '2026-03-02T12:00:00Z' }), null);
});
test('unknown provider errors are sanitized and external shell closing clears playback', async () => {
    const s = setup({ adapters: createTvProviderAdapters({ request: async () => ({ ok: false, error: access.source }) }) });
    const result = await s.service.execute('open_channel', { channel: 'fr2' });
    assert.equal(result.error, 'PLAYBACK_FAILED'); assert.ok(!JSON.stringify(result).includes('secret'));
    const playing = setup(); await playing.service.execute('open_channel', { channel: 'fr2' });
    await playing.service.viewerClosed(); assert.equal(playing.service.snapshot().playback, 'closed'); assert.equal(playing.disposed(), 1);
});
test('closing during a pending presentation transition keeps state closed', async () => {
    let finish;
    const s = setup({ viewer: { open: async () => ({ ok: true }), close: async () => {},
        setFullscreen: () => new Promise(resolve => { finish = resolve; }) } });
    await s.service.execute('open_channel', { channel: 'fr2' });
    const transition = s.service.execute('set_fullscreen', { enabled: true });
    await new Promise(resolve => setImmediate(resolve));
    await s.service.execute('close'); finish({ ok: true, fullscreen: true });
    assert.equal((await transition).error, 'CANCELLED');
    assert.equal(s.service.snapshot().fullscreen, false); assert.equal(s.service.snapshot().playback, 'closed');
});
