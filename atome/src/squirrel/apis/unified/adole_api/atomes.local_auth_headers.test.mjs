import assert from 'node:assert/strict';

globalThis.window = {};

const localStorageStore = new Map();

globalThis.localStorage = {
    getItem(key) {
        return localStorageStore.has(key) ? localStorageStore.get(key) : null;
    },
    setItem(key, value) {
        localStorageStore.set(key, String(value));
    },
    removeItem(key) {
        localStorageStore.delete(key);
    }
};

const { setSessionState } = await import('./session.js');
setSessionState({
    mode: 'anonymous',
    user: { id: 'anon_user_local_42', name: 'anonymous', phone: '999000000000' },
    backend: 'tauri'
}, { silent: true });

const { __ATOMES_TEST_ONLY__ } = await import('./atomes.js');

const headers = __ATOMES_TEST_ONLY__.buildBackendAuthHeaders('tauri', 'token-xyz');

assert.equal(headers.Authorization, 'Bearer token-xyz', 'state_current requests should keep the bearer token');
assert.equal(headers['X-User-Id'], 'anon_user_local_42', 'state_current requests should include session user id for local Axum');

console.log('atomes_local_auth_headers: ok');
