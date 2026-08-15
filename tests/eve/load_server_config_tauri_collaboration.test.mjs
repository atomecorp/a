import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

const previousWindow = globalThis.window;
const previousLocalStorage = globalThis.localStorage;

afterEach(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
});

test('a real Tauri WebView keeps Axum primary while exposing the configured Fastify collaboration target', async () => {
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
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'http://127.0.0.1:3001');
    assert.equal(globalThis.window.__SQUIRREL_TAURI_FASTIFY_URL__, undefined);
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, 'ws://127.0.0.1:3001/ws/api');
    assert.equal(globalThis.window.__SQUIRREL_FASTIFY_WS_SYNC_URL__, 'ws://127.0.0.1:3001/ws/sync');
    assert.notEqual(globalThis.window.__SQUIRREL_AUTH_SOURCE__, 'fastify');
    assert.notEqual(globalThis.window.__SQUIRREL_DATA_SOURCE__, 'fastify');
});
