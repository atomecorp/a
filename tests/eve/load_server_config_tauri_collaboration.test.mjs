import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { shouldAttemptFastify } from '../../atome/src/squirrel/apis/unified/adole_backend.js';

const previousWindow = globalThis.window;
const previousLocalStorage = globalThis.localStorage;
const previousFetch = globalThis.fetch;

afterEach(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
});

test('a real Tauri WebView keeps Axum primary while using production Fastify by default', async () => {
    const records = new Map();
    const localStorage = {
        getItem: (key) => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, String(value)),
        removeItem: (key) => records.delete(key)
    };
    globalThis.localStorage = localStorage;
    globalThis.window = {
        location: {
            protocol: 'http:',
            hostname: '127.0.0.1',
            port: '3000',
            origin: 'http://127.0.0.1:3000',
            href: 'http://127.0.0.1:3000/'
        },
        localStorage,
        __TAURI_INTERNALS__: { invoke: () => {} }
    };

    const moduleUrl = new URL('../../atome/src/squirrel/apis/loadServerConfig.js', import.meta.url);
    moduleUrl.searchParams.set('tauri-collaboration-test', String(Date.now()));
    const { loadServerConfigOnce } = await import(moduleUrl.href);
    const config = await loadServerConfigOnce();

    assert.equal(config.fastify.port, 3001);
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://atome.one');
    assert.equal(globalThis.window.__SQUIRREL_TAURI_FASTIFY_URL__, undefined);
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, 'wss://atome.one/ws/api');
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_SYNC_URL__, 'wss://atome.one/ws/sync');
    assert.notEqual(globalThis.window.__SQUIRREL_AUTH_SOURCE__, 'fastify');
    assert.notEqual(globalThis.window.__SQUIRREL_DATA_SOURCE__, 'fastify');
    assert.equal(shouldAttemptFastify(), true);
});

test('an ordinary browser on local Axum cannot activate Fastify as a parallel backend', () => {
    const localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
    globalThis.localStorage = localStorage;
    globalThis.window = {
        location: {
            protocol: 'http:', hostname: '127.0.0.1', port: '3000',
            origin: 'http://127.0.0.1:3000', href: 'http://127.0.0.1:3000/'
        },
        localStorage,
        __SQUIRREL_FASTIFY_URL__: 'http://127.0.0.1:3001'
    };

    assert.equal(shouldAttemptFastify(), false);
});

test('a packaged Tauri WebView uses the production Fastify authority', async () => {
    const records = new Map();
    const localStorage = {
        getItem: (key) => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, String(value)),
        removeItem: (key) => records.delete(key)
    };
    globalThis.localStorage = localStorage;
    globalThis.window = {
        location: {
            protocol: 'https:', hostname: 'tauri.localhost', port: '',
            origin: 'https://tauri.localhost', href: 'https://tauri.localhost/'
        },
        localStorage,
        __TAURI_INTERNALS__: { invoke: () => {} }
    };

    const moduleUrl = new URL('../../atome/src/squirrel/apis/loadServerConfig.js', import.meta.url);
    moduleUrl.searchParams.set('tauri-production-auth-test', String(Date.now()));
    const { loadServerConfigOnce } = await import(moduleUrl.href);
    await loadServerConfigOnce();

    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://atome.one');
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, 'wss://atome.one/ws/api');
});

test('a native production override wins when packaged Tauri is served by local Axum', async () => {
    const records = new Map();
    const localStorage = {
        getItem: (key) => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, String(value)),
        removeItem: (key) => records.delete(key)
    };
    globalThis.localStorage = localStorage;
    globalThis.window = {
        location: {
            protocol: 'http:', hostname: '127.0.0.1', port: '3000',
            origin: 'http://127.0.0.1:3000', href: 'http://127.0.0.1:3000/'
        },
        localStorage,
        __TAURI_INTERNALS__: { invoke: () => {} },
        __SQUIRREL_TAURI_FASTIFY_URL__: 'https://atome.one'
    };

    const moduleUrl = new URL('../../atome/src/squirrel/apis/loadServerConfig.js', import.meta.url);
    moduleUrl.searchParams.set('tauri-native-production-auth-test', String(Date.now()));
    const { loadServerConfigOnce } = await import(moduleUrl.href);
    await loadServerConfigOnce();

    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://atome.one');
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, 'wss://atome.one/ws/api');
});

test('the embedded iOS scheme keeps the fixed production Fastify authority', async () => {
    const records = new Map();
    const localStorage = {
        getItem: (key) => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, String(value)),
        removeItem: (key) => records.delete(key)
    };
    globalThis.localStorage = localStorage;
    globalThis.fetch = async () => { throw new Error('custom_scheme_fetch_unavailable'); };
    globalThis.window = {
        location: {
            protocol: 'atome:', hostname: 'localhost', port: '',
            origin: 'null', href: 'atome://localhost/'
        },
        localStorage,
        __HOST_ENV: 'app'
    };

    const moduleUrl = new URL('../../atome/src/squirrel/apis/loadServerConfig.js', import.meta.url);
    moduleUrl.searchParams.set('ios-production-auth-test', String(Date.now()));
    const { loadServerConfigOnce } = await import(moduleUrl.href);
    await loadServerConfigOnce();

    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://atome.one');
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, 'wss://atome.one/ws/api');
});
