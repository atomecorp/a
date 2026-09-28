import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const values = new Map();
const guestId = '4e60391f-a090-4cf5-bf54-585b59541842';
values.set('squirrel_session_v2', JSON.stringify({
    mode: 'anonymous',
    user: { id: guestId, username: 'Guest', phone: null },
    backend: 'local_guest'
}));
values.set('squirrel_guest_v1', JSON.stringify({
    user: { id: guestId, username: 'Guest', phone: null }
}));

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.localStorage = {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key))
};
globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
globalThis.WebSocket = class UnreachableLocalWebSocket {
    static OPEN = 1;
    constructor() { throw new Error('local websocket unavailable'); }
};

const events = [];
globalThis.window = {
    location: {
        protocol: 'atome:', hostname: 'localhost', port: '',
        origin: 'null', href: 'atome:///src/index.html'
    },
    __HOST_ENV: 'app',
    __ATOME_LOCAL_HTTP_PORT__: 49152,
    ATOME_LOCAL_HTTP_PORT: 49152,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    addEventListener: () => {},
    dispatchEvent: (event) => { events.push(event); return true; }
};

const { auth } = await import('../../atome/src/squirrel/apis/unified/adole_api/auth.js');
const { getSessionState } = await import('../../atome/src/squirrel/apis/unified/adole_api/session.js');

const result = await auth.tryAutoLogin();

assert.equal(result.authenticated, false);
assert.equal(result.error, 'Server unreachable');
assert.equal(getSessionState().mode, 'logged_out');
assert.equal(window.__authCheckComplete, true);
assert.deepEqual(window.__authCheckResult, {
    authenticated: false,
    userId: null,
    anonymous: false
});
assert.equal(events.some((event) => event.type === 'squirrel:auth-checked'), true);
assert.equal(values.has('squirrel_guest_v1'), true, 'the guest workspace must remain retryable');

console.log('guest_auto_login_failure_settles_boot: PASS');
