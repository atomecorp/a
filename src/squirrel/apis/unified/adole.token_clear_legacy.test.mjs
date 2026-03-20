import assert from 'node:assert/strict';

const createStorage = (entries = []) => ({
    store: new Map(entries),
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
        this.store.set(key, String(value));
    },
    removeItem(key) {
        this.store.delete(key);
    }
});

globalThis.window = {};
globalThis.localStorage = createStorage([
    ['cloud_auth_token', 'expired-cloud-token'],
    ['auth_token', 'expired-legacy-token']
]);
globalThis.sessionStorage = createStorage([
    ['cloud_auth_token', 'expired-cloud-token-session'],
    ['auth_token', 'expired-legacy-token-session']
]);

const { clearToken, getToken, CONFIG } = await import('./adole.js');

assert.equal(getToken(CONFIG.FASTIFY_TOKEN_KEY), 'expired-cloud-token', 'precondition: fastify token should resolve from cloud_auth_token');

clearToken(CONFIG.FASTIFY_TOKEN_KEY);

assert.equal(localStorage.getItem('cloud_auth_token'), null, 'cloud token should be removed from localStorage');
assert.equal(localStorage.getItem('auth_token'), null, 'legacy auth token should be removed from localStorage');
assert.equal(sessionStorage.getItem('cloud_auth_token'), null, 'cloud token should be removed from sessionStorage');
assert.equal(sessionStorage.getItem('auth_token'), null, 'legacy auth token should be removed from sessionStorage');
assert.equal(getToken(CONFIG.FASTIFY_TOKEN_KEY), null, 'fastify token must not be rehydrated from legacy storage after clear');

console.log('adole_token_clear_legacy: ok');
