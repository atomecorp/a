import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('../../atome/src/squirrel/apis/unified/adole.js', () => ({ TauriAdapter: { getToken: () => 'token' } }));
vi.mock('../../atome/src/squirrel/runtime_errors.js', () => ({ reportRuntimeError: vi.fn() }));
import { createAppleMusicRuntime } from '../../eVe/domains/apple_music/apple_music_runtime.js';
import { validateParams, stableStringify } from '../../atome/src/squirrel/ai/agent_gateway_normalize.js';
import { APPLE_MUSIC_OPERATION_TYPE } from '../../atome/src/shared/apple_music_operation_contract.js';
import { createMusicOperationStore } from '../../atome/src/squirrel/apple_music/operation_store.js';

// A minimal implementation of the canonical event-ID and particle-CAS contract.
// It makes duplicate native effects and missing durable claims observable to these tests.
function backend() {
    const states = new Map(), events = new Map(), commits = [];
    return { states, commits,
        getStateCurrent: async id => structuredClone(states.get(id) || null),
        async commit(event) {
            commits.push(structuredClone(event));
            expect(event.scope).toBe('global'); expect(event.type).toBe('apple_music_operation');
            expect(validateParams({ type: 'object', properties: APPLE_MUSIC_OPERATION_TYPE.schema, additionalProperties: false }, event.payload.props).ok).toBe(true);
            if (events.has(event.id)) return { ok: events.get(event.id) === stableStringify(event) };
            const record = states.get(event.atome_id), expected = event.payload.expected_versions?.revision;
            if (expected !== undefined && expected !== record?.property_versions.revision) return { ok: false, error: 'property_version_conflict' };
            states.set(event.atome_id, { id: event.atome_id, type: event.type, owner_id: 'alice', project_id: null,
                properties: { ...record?.properties, ...event.payload.props }, property_versions: { revision: (record?.property_versions.revision || 0) + 1 } });
            events.set(event.id, stableStringify(event)); return { ok: true };
        }
    };
}
let api, owner, invoke;
const runtime = (overrides = {}) => createAppleMusicRuntime({ api: () => api, readActor: () => owner,
    token: () => 'token', supported: () => true, invoke, ...overrides });
beforeEach(() => { api = backend(); owner = 'alice'; invoke = vi.fn(async () => ({ ok: true, playlist_id: 'p.1' })); });

test('host availability requires the standalone native Apple bridge, independent of browser device branding', () => {
    for (const userAgent of ['iPhone', 'iPad', 'Macintosh', 'Windows', 'Android']) {
        const music = createAppleMusicRuntime({ win: { navigator: { userAgent } } });
        expect(music.isSupportedHost()).toBe(false);
    }
    expect(createAppleMusicRuntime({ win: { __ATOME_IOS_NATIVE_INVOKE: invoke, __HOST_ENV: 'app' } }).isSupportedHost()).toBe(true);
    expect(createAppleMusicRuntime({ win: { __ATOME_IOS_NATIVE_INVOKE: invoke, __HOST_ENV: 'auv3' } }).isSupportedHost()).toBe(false);
});

test('playback and reads use native MusicKit without mirroring library data or writing Atome state', async () => {
    invoke = vi.fn(async () => ({ ok: true, playback: 'opened_unconfirmed' }));
    const music = runtime();
    expect(await music.execute('play', { query: 'Pink Floyd', kind: 'artist' })).toMatchObject({ playback: 'opened_unconfirmed' });
    expect(invoke).toHaveBeenCalledWith('play', { query: 'Pink Floyd', kind: 'artist' }, 'token');
    expect(api.commits).toHaveLength(0);
    expect(music.isActive()).toBe(true); music.release(); expect(music.isActive()).toBe(false);
});
test('invalid, unsupported, unauthenticated and changed-account requests never expose results or invoke writes', async () => {
    expect((await runtime().execute('play', {})).error).toBe('INVALID_ARGUMENT');
    expect((await runtime({ supported: () => false }).execute('create_playlist', { name: 'A' })).error).toBe('HOST_UNSUPPORTED');
    expect(await runtime({ supported: () => false }).execute('get_state')).toEqual({ ok: true, supported: false, capabilities: [] });
    owner = ''; expect((await runtime().execute('list_playlists')).error).toBe('AUTH_REQUIRED');
    expect(invoke).not.toHaveBeenCalled();
    owner = 'alice'; invoke = vi.fn(async () => { owner = 'bob'; return { ok: true, items: [{ name: 'private' }] }; });
    expect(await runtime().execute('list_playlists')).toEqual({ ok: false, error: 'CONTEXT_CHANGED' });
});
test('a playlist write records a private claim before the native effect and a receipt after it', async () => {
    invoke = vi.fn(async () => {
        expect(api.states.get('apple_music_operation_once').properties.status).toBe('submitting');
        return { ok: true, playlist_id: 'p.1' };
    });
    const music = runtime(), input = { name: 'Morning', request_id: 'once' };
    expect(await music.execute('create_playlist', input)).toMatchObject({ ok: true, status: 'completed', request_id: 'once' });
    expect(await music.execute('create_playlist', input)).toMatchObject({ ok: true, playlist_id: 'p.1' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(api.commits[0].payload.props).toMatchObject({ access: 'private', visibility: 'private', request: { action: 'create_playlist', input: { name: 'Morning' } } });
    expect(await music.execute('operation_status', { request_id: 'once' })).toMatchObject({ status: 'completed' });
    expect(await runtime({ supported: () => false }).execute('operation_status', { request_id: 'once' })).toMatchObject({ status: 'completed' });
    expect((await music.execute('create_playlist', { name: 'Other', request_id: 'once' })).error).toBe('OPERATION_CONFLICT');
});
test('a lost acknowledgement remains unconfirmed across runtime reconstruction and never appends twice', async () => {
    invoke = vi.fn(async () => { throw new Error('native response lost after acceptance'); });
    const input = { playlist_id: 'p.1', track_ids: ['123'], request_id: 'lost' };
    expect(await runtime().execute('add_tracks', input)).toMatchObject({ error: 'OPERATION_UNCONFIRMED', status: 'unconfirmed' });
    expect(await runtime().execute('add_tracks', input)).toMatchObject({ error: 'OPERATION_UNCONFIRMED' });
    expect(invoke).toHaveBeenCalledTimes(1);
});
test('a native refusal before any external write retains its precise error and never claims completion', async () => {
    invoke = vi.fn(async () => ({ ok: false, error: 'AUTHORIZATION_REQUIRED', effect_started: false }));
    expect(await runtime().execute('create_playlist', { name: 'A', request_id: 'denied' }))
        .toMatchObject({ ok: false, error: 'AUTHORIZATION_REQUIRED', status: 'failed', request_id: 'denied' });
});
test('a persisted submitting claim is never retried after reload, including when receipt persistence failed', async () => {
    const commit = api.commit;
    api.commit = async event => event.payload.props.status === 'completed' ? { ok: false, error: 'offline' } : commit(event);
    const input = { name: 'A', request_id: 'receipt_lost' };
    expect(await runtime().execute('create_playlist', input)).toMatchObject({ error: 'OPERATION_UNCONFIRMED', status: 'submitting' });
    expect(await runtime().execute('create_playlist', input)).toMatchObject({ error: 'OPERATION_UNCONFIRMED' });
    expect(invoke).toHaveBeenCalledTimes(1);
});
test('two independent runtimes claim one operation through canonical particle CAS', async () => {
    const input = { name: 'A', request_id: 'race' };
    const results = await Promise.all([runtime().execute('create_playlist', input), runtime().execute('create_playlist', input)]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok).error).toBe('VERSION_CONFLICT');
});
test('the MCP idempotency key identifies the same durable request without model-generated request IDs', async () => {
    const context = { idempotencyKey: 'conversation:call' };
    const first = await runtime().execute('create_playlist', { name: 'A' }, context);
    const again = await runtime().execute('create_playlist', { name: 'A' }, context);
    expect(first.request_id).toBe(again.request_id); expect(first.request_id).toMatch(/^[a-f0-9]{64}$/);
    expect(invoke).toHaveBeenCalledTimes(1);
});
test('account-private receipts cannot be read or reused by another Atome account', async () => {
    await runtime().execute('create_playlist', { name: 'A', request_id: 'private' });
    owner = 'bob';
    expect((await runtime().execute('operation_status', { request_id: 'private' })).error).toBe('OPERATION_NOT_FOUND');
    expect((await runtime().execute('create_playlist', { name: 'A', request_id: 'private' })).error).toBe('OPERATION_NOT_FOUND');
    expect(invoke).toHaveBeenCalledTimes(1);
});

test('favorite captures the exact current song before its durable claim and reuses the receipt after the song changes', async () => {
    let song = '123';
    invoke = vi.fn(async (action, input) => {
        if (action === 'get_state') return { ok: true, current_song_id: song, current_entry_id: 'entry-' + song };
        expect(input).toEqual({ song_id: '123', entry_id: 'entry-123' });
        expect(api.states.get('apple_music_operation_fav').properties).toMatchObject({ status: 'submitting',
            request: { action: 'favorite_current', input } });
        return { ok: true, song_id: '123', favorited: true };
    });
    expect(await runtime().execute('favorite_current', { request_id: 'fav' }))
        .toMatchObject({ ok: true, song_id: '123', favorited: true, status: 'completed' });
    song = '456';
    expect(await runtime().execute('favorite_current', { request_id: 'fav' })).toMatchObject({ song_id: '123', favorited: true });
    expect(invoke).toHaveBeenCalledTimes(2);
});
test('favorite without an identified song does not write a claim or call the provider mutation', async () => {
    invoke = vi.fn(async () => ({ ok: true, playback: 'stopped' }));
    expect(await runtime().execute('favorite_current', {})).toEqual({ ok: false, error: 'NO_ACTIVE_MUSIC' });
    expect(api.commits).toHaveLength(0); expect(invoke).toHaveBeenCalledTimes(1);
});
test('a changed current entry is refused before effect; an unverified favorite is never completed', async () => {
    invoke = vi.fn(async action => action === 'get_state' ? { ok: true, current_song_id: '123', current_entry_id: 'entry' }
        : { ok: false, error: 'CURRENT_SONG_CHANGED', effect_started: false });
    expect(await runtime().execute('favorite_current', { request_id: 'changed' }))
        .toMatchObject({ ok: false, error: 'CURRENT_SONG_CHANGED', status: 'failed' });
    invoke = vi.fn(async action => action === 'get_state' ? { ok: true, current_song_id: '123', current_entry_id: 'entry' } : { ok: true });
    expect(await runtime().execute('favorite_current', { request_id: 'unverified' }))
        .toMatchObject({ ok: false, error: 'OPERATION_UNCONFIRMED', status: 'unconfirmed' });
});
test('a favorite with lost acknowledgement never retargets or resends after runtime restart', async () => {
    invoke = vi.fn(async action => {
        if (action === 'get_state') return { ok: true, current_song_id: '123', current_entry_id: 'entry' };
        throw new Error('provider acknowledgement lost');
    });
    expect(await runtime().execute('favorite_current', { request_id: 'lost-favorite' })).toMatchObject({ status: 'unconfirmed' });
    expect(await runtime().execute('favorite_current', { request_id: 'lost-favorite' })).toMatchObject({ status: 'unconfirmed' });
    expect(invoke).toHaveBeenCalledTimes(2);
    owner = 'bob';
    expect(await runtime().execute('favorite_current', { request_id: 'lost-favorite' })).toMatchObject({ error: 'OPERATION_NOT_FOUND' });
});
test('a prepared favorite resumes its saved song without resolving a new current song', async () => {
    const input = { song_id: '123', entry_id: 'original-entry' };
    await createMusicOperationStore({ api, readActor: () => owner }).prepare('prepared-favorite', { action: 'favorite_current', input });
    invoke = vi.fn(async (action, payload) => {
        expect(action).toBe('favorite_current'); expect(payload).toEqual(input);
        return { ok: false, error: 'CURRENT_SONG_CHANGED', effect_started: false };
    });
    expect(await runtime().execute('favorite_current', { request_id: 'prepared-favorite' }))
        .toMatchObject({ error: 'CURRENT_SONG_CHANGED', status: 'failed' });
    expect(invoke).toHaveBeenCalledTimes(1);
});
