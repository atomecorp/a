import assert from 'node:assert/strict';

globalThis.localStorage = {
    store: new Map([['local_auth_token', 'local-token-1']]),
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
        this.store.set(key, String(value));
    },
    removeItem(key) {
        this.store.delete(key);
    }
};

globalThis.window = {
    AdoleAPI: {
        auth: {
            getCurrentInfo() {
                return { user_id: 'user_local_123' };
            }
        }
    }
};

const { __UNIFIED_SYNC_TEST_ONLY__ } = await import('./UnifiedSync.js');

const headers = __UNIFIED_SYNC_TEST_ONLY__.buildRequestAuthHeaders('tauri');

assert.equal(headers.Authorization, 'Bearer local-token-1', 'tauri requests should keep the local bearer token');
assert.equal(headers['X-User-Id'], 'user_local_123', 'tauri requests should include the local user id header');

console.log('unified_sync_local_auth_headers: ok');
