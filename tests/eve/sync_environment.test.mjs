import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import {
    applySyncEnvironment,
    environmentFingerprint,
    readSyncEnvironment,
    setSyncDebug
} from '../../eVe/intuition/runtime/bevy_panel/sync_environment.js';

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const previousWindow = globalThis.window;
afterEach(() => {
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
            sync: {
                getPending: async () => ({ changes: [] }),
                configureRemote: async (value) => calls.push(['configure', value]),
                clearRemote: async () => calls.push(['clear'])
            }
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

test('Home environment switches local to production to local without mixing scoped tokens', async () => {
    const { env, calls } = createNativeEnv();
    globalThis.window = env;
    env.localStorage.setItem('cloud_auth_token', 'local-token');

    const production = await applySyncEnvironment({ mode: 'production' }, env);
    assert.equal(production.ok, true);
    assert.equal(production.base, 'https://atome.one');
    assert.equal(env.localStorage.getItem('cloud_auth_token'), null);
    assert.deepEqual(calls.find((entry) => entry[0] === 'clear'), ['clear']);

    env.localStorage.setItem('cloud_auth_token', 'production-token');
    const local = await applySyncEnvironment({ mode: 'local' }, env);
    assert.equal(local.ok, true);
    assert.equal(local.base, 'http://localhost:3001');
    assert.equal(env.localStorage.getItem('cloud_auth_token'), 'local-token');
    assert.equal(calls.at(-5)[0], 'configure');
    assert.equal(calls.at(-5)[1].environment_fingerprint,
        environmentFingerprint({ base: 'http://localhost:3001', principal: 'user-a' }));

    const productionAgain = await applySyncEnvironment({ mode: 'production' }, env);
    assert.equal(productionAgain.ok, true);
    assert.equal(env.localStorage.getItem('cloud_auth_token'), 'production-token');
    assert.equal(readSyncEnvironment(env).mode, 'production');
});

test('Home blocks an environment change while the canonical offline queue is unresolved', async () => {
    const { env, calls } = createNativeEnv();
    globalThis.window = env;
    env.AdoleAPI.sync.getPending = async () => ({ changes: [{ event_id: 'offline-1' }] });
    const before = readSyncEnvironment(env);

    assert.deepEqual(await applySyncEnvironment({ mode: 'production' }, env), {
        ok: false, error: 'sync_environment_pending_queue', pending: 1
    });
    assert.equal(readSyncEnvironment(env).base, before.base);
    assert.equal(calls.length, 0);
});

test('Debug sync is device-local metadata and keeps the selected environment intact', () => {
    const { env } = createNativeEnv();
    globalThis.window = env;
    const result = setSyncDebug(true, env);
    assert.equal(result.debugSync, true);
    assert.equal(result.mode, 'local');
    assert.equal(env.__SQUIRREL_SYNC_DEBUG__, true);
});
