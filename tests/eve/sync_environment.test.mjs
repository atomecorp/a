import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { ensureFastifyToken } from '../../atome/src/squirrel/apis/unified/adole_api/auth_fastify_token.js';
import { checkRemoteAuthResult, sendRemoteAuth } from '../../atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js';
import { clearToken, getToken, setToken } from '../../atome/src/squirrel/apis/unified/adole_connection.js';
import { TauriAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
import { setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

import {
    applySyncEnvironment,
    environmentFingerprint,
    readSyncEnvironment,
    setSyncDebug
} from '../../eVe/intuition/runtime/bevy_panel/sync_environment.js';

vi.mock('../../atome/src/squirrel/apis/unified/adole_api/auth_fastify_token.js', async (load) => ({
    ...await load(),
    ensureFastifyToken: vi.fn(async () => ({ ok: false, reason: 'auth_session_required' }))
}));

class MemoryStorage {
    constructor() { this.values = new Map(); this.writes = []; }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.writes.push(String(value)); this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const previousWindow = globalThis.window;
afterEach(() => {
    clearToken('cloud_auth_token', globalThis.window?.localStorage, globalThis.window?.sessionStorage);
    vi.mocked(ensureFastifyToken).mockClear();
    vi.restoreAllMocks();
    setSessionState({ mode: 'logged_out' }, { persist: false, silent: true });
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
});

const createNativeEnv = () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const calls = [];
    const env = {
        location: {
            protocol: 'https:', hostname: 'tauri.localhost', port: '',
            origin: 'https://tauri.localhost', href: 'https://tauri.localhost/'
        },
        __TAURI_INTERNALS__: { invoke: () => {} },
        __currentUser: { id: 'user-a' },
        localStorage,
        sessionStorage,
        AdoleAPI: {
            auth: { isAuthenticated: () => true },
            sync: { getStatus: async () => ({ pending_delivery_count: 0 }) }
        },
        Squirrel: {
            SyncEngine: {
                clearFastifyAvailabilityCache: () => calls.push(['reset']),
                disconnect: () => calls.push(['disconnect']),
                loadScope: () => calls.push(['scope']),
                retry: () => calls.push(['retry']),
                getState: () => ({ connected: false })
            }
        },
        RemoteCommands: { stop: () => {}, getCurrentUserId: () => '' },
        dispatchEvent: () => {},
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    };
    return { env, calls };
};

test('a server change purges every legacy key and renews through the canonical owner', async () => {
    const { env, calls } = createNativeEnv();
    globalThis.window = env;
    env.__SQUIRREL_TAURI_FASTIFY_URL__ = 'http://localhost:3001';
    setToken('cloud_auth_token', 'old-bearer', env.localStorage, env.sessionStorage);
    const oldReply = await sendRemoteAuth(async () => ({ token: 'late-bearer' }));
    for (const storage of [env.localStorage, env.sessionStorage]) {
        for (const key of ['squirrel_sync_environment_tokens_v1', 'fastify_login_cache_v1',
            'auth_token', 'cloud_auth_token', 'local_auth_token']) storage.values.set(key, 'stale-bearer');
    }
    vi.mocked(ensureFastifyToken).mockImplementationOnce(async () => {
        assert.equal(getToken('cloud_auth_token'), null);
        assert.equal(env.__SQUIRREL_TAURI_FASTIFY_URL__, 'https://atome.one');
        return { ok: false, reason: 'auth_session_required' };
    });
    assert.equal((await applySyncEnvironment({ mode: 'production' }, env)).base, 'https://atome.one');
    assert.equal(getToken('cloud_auth_token'), null);
    assert.throws(() => checkRemoteAuthResult(oldReply), /auth_server_changed/);
    assert.deepEqual(calls, [['disconnect'], ['reset'], ['scope']]);

    env.AdoleAPI.sync.getStatus = async () => ({ pending_delivery_count: 3 });
    vi.mocked(ensureFastifyToken).mockImplementationOnce(async () => {
        assert.equal(getToken('cloud_auth_token'), null);
        assert.equal(env.__SQUIRREL_TAURI_FASTIFY_URL__, 'http://localhost:3001');
        setToken('cloud_auth_token', 'renewed-bearer', env.localStorage, env.sessionStorage);
        return { ok: true };
    });
    const local = await applySyncEnvironment({ mode: 'local' }, env);
    assert.equal(local.ok, true, local.error);
    assert.equal(local.fingerprint, environmentFingerprint({ base: local.base, principal: 'user-a' }));
    assert.equal(getToken('cloud_auth_token'), 'renewed-bearer');
    assert.equal(calls.at(-1)[0], 'retry');
    for (const storage of [env.localStorage, env.sessionStorage]) {
        assert.ok([...storage.values.values(), ...storage.writes].every(value => !value.includes('bearer')));
    }
    assert.equal((await applySyncEnvironment({ mode: 'local' }, env)).ok, true);
    assert.equal(getToken('cloud_auth_token'), 'renewed-bearer');
    assert.equal(vi.mocked(ensureFastifyToken).mock.calls.length, 2);
});

test('Home blocks an environment change while the canonical offline queue is unresolved or unknown', async () => {
    const { env, calls } = createNativeEnv();
    globalThis.window = env;
    env.__SQUIRREL_TAURI_FASTIFY_URL__ = 'http://localhost:3001';
    setToken('cloud_auth_token', 'old-bearer', env.localStorage, env.sessionStorage);
    env.AdoleAPI.sync.getStatus = async () => ({ pending_delivery_count: 1 });
    assert.deepEqual(await applySyncEnvironment({ mode: 'production' }, env), {
        ok: false, error: 'sync_environment_pending_queue', pending: 1
    });
    env.AdoleAPI.sync.getStatus = async () => ({});
    assert.deepEqual(await applySyncEnvironment({ mode: 'production' }, env), {
        ok: false, error: 'sync_status_unavailable'
    });
    assert.equal(readSyncEnvironment(env).base, 'http://localhost:3001');
    assert.equal(getToken('cloud_auth_token'), 'old-bearer');
    assert.equal(calls.length, 0);
});

test.each(['tauri', 'ios'])('a %s server change detaches native sync and preserves the local grant', async (runtime) => {
    const { env } = createNativeEnv();
    if (runtime === 'ios') {
        delete env.__TAURI_INTERNALS__;
        env.location = new URL('atome://localhost/');
    }
    globalThis.window = env;
    env.__SQUIRREL_TAURI_FASTIFY_URL__ = 'https://previous.example';
    setSessionState({ mode: 'authenticated', user: { id: 'user-a' }, backend: 'tauri' },
        { persist: false, silent: true });
    setToken('cloud_auth_token', 'previous-bearer', env.localStorage, env.sessionStorage);
    const detach = vi.spyOn(TauriAdapter.sync, 'clearRemote').mockImplementation(async () => {
        assert.equal(env.__SQUIRREL_TAURI_FASTIFY_URL__, 'https://previous.example');
        return { ok: false, error: 'native_sync_unavailable' };
    });
    const next = { customBase: 'https://next.example' };
    assert.equal((await applySyncEnvironment(next, env)).error, 'native_sync_unavailable');
    assert.equal(getToken('cloud_auth_token'), 'previous-bearer');
    assert.equal(readSyncEnvironment(env).base, 'https://previous.example');
    detach.mockResolvedValueOnce({ ok: true });
    const result = await applySyncEnvironment(next, env);
    assert.equal(result.ok, true, result.error);
    assert.equal(detach.mock.calls.length, 2);
    assert.equal(getToken('cloud_auth_token'), null);
    assert.equal(env.__currentUser.id, 'user-a');
    assert.equal(readSyncEnvironment(env).base, 'https://next.example');
});

test('Debug sync is device-local metadata and keeps the selected environment intact', () => {
    const { env } = createNativeEnv();
    globalThis.window = env;
    const result = setSyncDebug(true, env);
    assert.equal(result.debugSync, true);
    assert.equal(result.mode, 'local');
    assert.equal(env.__SQUIRREL_SYNC_DEBUG__, true);
});
