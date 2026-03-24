import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';
import { persistRuntimeMailPreferences } from './runtime_preferences.js';

const requests = [];
const env = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'jeezs@atome.one',
            username: 'jeezs@atome.one',
            password: 'secret-pass',
            mailbox: 'INBOX',
            imap: { host: 'imap.example.test', port: 993, security: 'tls' },
            smtp: { host: 'smtp.example.test', port: 587, security: 'starttls' }
        }
    },
    fetch: async (url, options = {}) => {
        requests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'icloud_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_1',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
const ready = await api.ensureReady({ limit: 5 });

assert.equal(ready.ok, true, 'mail bootstrap should allow a successful mirrored sync in Tauri mode');
assert.equal(requests[0].url, 'http://127.0.0.1:3000/api/eve/mail/sync', 'mail bootstrap should target the local Axum server in Tauri mode');
assert.equal(JSON.parse(requests[0].options.body).credentials.email, 'jeezs@atome.one', 'mail bootstrap should forward profile mail credentials to the local Axum sync endpoint');

console.log('mail_bootstrap_tauri_sync_target: ok');

const domRequests = [];
const domLocalStorageState = new Map();
const domEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __eveProfilePreferences: {},
    localStorage: {
        getItem(key) {
            return domLocalStorageState.has(key) ? domLocalStorageState.get(key) : null;
        },
        setItem(key, value) {
            domLocalStorageState.set(key, String(value));
        },
        removeItem(key) {
            domLocalStorageState.delete(key);
        }
    },
    fetch: async (url, options = {}) => {
        domRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_dom',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};
persistRuntimeMailPreferences(domEnv, {
    provider: 'custom_imap_smtp',
    email: 'dom@atome.one',
    username: 'dom@atome.one',
    password: 'dom-secret',
    mailbox: 'INBOX',
    imap: { host: 'imap.dom.test', port: 993, security: 'tls' },
    smtp: { host: 'smtp.dom.test', port: 587, security: 'starttls' }
});

const domApi = createGlobalMailApi({ env: domEnv });
const domReady = await domApi.ensureReady({ limit: 5 });

assert.equal(domReady.ok, true, 'mail bootstrap should still mirror sync when credentials only exist in the persisted runtime mail store');
assert.equal(JSON.parse(domRequests[0].options.body).credentials.email, 'dom@atome.one', 'mail bootstrap should read mail credentials from the persisted runtime mail store');
assert.equal(JSON.parse(domRequests[0].options.body).credentials.imap.host, 'imap.dom.test', 'mail bootstrap should forward runtime-store IMAP settings to Axum in Tauri mode');

console.log('mail_bootstrap_tauri_sync_target_runtime: ok');

const mergedRequests = [];
const mergedEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'stale@atome.one',
            username: 'stale@atome.one',
            password: 'stale-pass',
            mailbox: 'INBOX',
            imap: { host: '', port: 993, security: 'tls' },
            smtp: { host: '', port: 587, security: 'starttls' }
        }
    },
    localStorage: {
        getItem(key) {
            return domLocalStorageState.has(key) ? domLocalStorageState.get(key) : null;
        },
        setItem(key, value) {
            domLocalStorageState.set(key, String(value));
        },
        removeItem(key) {
            domLocalStorageState.delete(key);
        }
    },
    fetch: async (url, options = {}) => {
        mergedRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_merged',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};
persistRuntimeMailPreferences(mergedEnv, {
    provider: 'custom_imap_smtp',
    email: 'dom@atome.one',
    username: 'dom@atome.one',
    password: 'dom-secret',
    mailbox: 'INBOX',
    imap: { host: 'imap.dom.test', port: 993, security: 'tls' },
    smtp: { host: 'smtp.dom.test', port: 587, security: 'starttls' }
});

const mergedApi = createGlobalMailApi({ env: mergedEnv });
const mergedReady = await mergedApi.ensureReady({ limit: 5 });
const mergedBody = JSON.parse(mergedRequests[0].options.body);

assert.equal(mergedReady.ok, true, 'mail bootstrap should sync when stale cached preferences are completed by current user panel values');
assert.equal(mergedBody.credentials.email, 'dom@atome.one', 'mail bootstrap should prefer the current panel email over stale cached preferences');
assert.equal(mergedBody.credentials.imap.host, 'imap.dom.test', 'mail bootstrap should merge a missing cached IMAP host from the current panel');
assert.equal(mergedBody.credentials.smtp.host, 'smtp.dom.test', 'mail bootstrap should merge a missing cached SMTP host from the current panel');

console.log('mail_bootstrap_tauri_sync_target_merge: ok');

const persistedRequests = [];
const persistedEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __eveProfilePreferences: {},
    __eveLoadUserProfile: async () => ({
        ok: true,
        profile: {
            email: 'persisted@atome.one',
            preferences: {
                mail: {
                    provider: 'custom_imap_smtp',
                    username: 'persisted@atome.one',
                    password: 'persisted-pass',
                    mailbox: 'INBOX',
                    imap: { host: 'imap.persisted.test', port: 993, security: 'tls' },
                    smtp: { host: 'smtp.persisted.test', port: 587, security: 'starttls' }
                }
            }
        }
    }),
    fetch: async (url, options = {}) => {
        persistedRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_persisted',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const persistedApi = createGlobalMailApi({ env: persistedEnv });
const persistedReady = await persistedApi.ensureReady({ limit: 5 });
const persistedBody = JSON.parse(persistedRequests[0].options.body);

assert.equal(persistedReady.ok, true, 'mail bootstrap should sync from persisted profile mail settings even when the user panel is not loaded yet');
assert.equal(persistedBody.credentials.email, 'persisted@atome.one', 'mail bootstrap should read persisted profile email when no DOM mail settings are available');
assert.equal(persistedBody.credentials.imap.host, 'imap.persisted.test', 'mail bootstrap should read persisted profile IMAP settings before the user panel module loads');
assert.equal(persistedBody.credentials.smtp.host, 'smtp.persisted.test', 'mail bootstrap should read persisted profile SMTP settings before the user panel module loads');

console.log('mail_bootstrap_tauri_sync_target_persisted: ok');

const localStorageState = new Map();
const runtimeStoreRequests = [];
const runtimeStoreEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
    __eveProfilePreferences: {},
    localStorage: {
        getItem(key) {
            return localStorageState.has(key) ? localStorageState.get(key) : null;
        },
        setItem(key, value) {
            localStorageState.set(key, String(value));
        },
        removeItem(key) {
            localStorageState.delete(key);
        }
    },
    fetch: async (url, options = {}) => {
        runtimeStoreRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_tauri_cursor_runtime_store',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};
persistRuntimeMailPreferences(runtimeStoreEnv, {
    provider: 'custom_imap_smtp',
    email: 'runtime@atome.one',
    username: 'runtime@atome.one',
    password: 'runtime-pass',
    mailbox: 'INBOX',
    imap: { host: 'imap.runtime.test', port: 993, security: 'tls' },
    smtp: { host: 'smtp.runtime.test', port: 587, security: 'starttls' }
});

const runtimeStoreApi = createGlobalMailApi({ env: runtimeStoreEnv });
const runtimeStoreReady = await runtimeStoreApi.ensureReady({ limit: 5 });
const runtimeStoreBody = JSON.parse(runtimeStoreRequests[0].options.body);

assert.equal(runtimeStoreReady.ok, true, 'mail bootstrap should use the dedicated persisted runtime mail settings store');
assert.equal(runtimeStoreBody.credentials.email, 'runtime@atome.one', 'mail bootstrap should read runtime mail settings from the dedicated store');
assert.equal(runtimeStoreBody.credentials.imap.host, 'imap.runtime.test', 'mail bootstrap should keep IMAP host in the dedicated runtime store');
assert.equal(runtimeStoreBody.credentials.smtp.host, 'smtp.runtime.test', 'mail bootstrap should keep SMTP host in the dedicated runtime store');

console.log('mail_bootstrap_tauri_sync_target_runtime_store: ok');
