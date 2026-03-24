import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

const fetchedUrls = [];
const env = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FASTIFY_URL__: 'http://127.0.0.1:3001',
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
        fetchedUrls.push({
            url,
            options
        });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'icloud_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_remote_cursor_1',
                    items: [
                        {
                            message_id: 'mail_remote_1',
                            mailbox: 'inbox',
                            subject: 'Nouveau mail distant',
                            preview: 'Bonjour depuis Fastify',
                            body_text: 'Bonjour depuis Fastify',
                            unread: true,
                            from: { address: 'alice@example.test' },
                            received_at: '2026-03-17T12:30:00Z'
                        }
                    ],
                    stats: {
                        total: 1,
                        unread: 1,
                        mailboxes: ['inbox']
                    }
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
const ready = await api.ensureReady({ limit: 10 });

assert.equal(ready.ok, true, 'mail bootstrap should mirror the Fastify mail sync when running outside Node transport support');
assert.equal(fetchedUrls.length, 1, 'mail bootstrap should issue exactly one Fastify sync request');
assert.equal(fetchedUrls[0].url, 'http://127.0.0.1:3001/api/eve/mail/sync', 'mail bootstrap should target the dedicated Fastify mail sync endpoint');
assert.equal(JSON.parse(fetchedUrls[0].options.body).credentials.email, 'jeezs@atome.one', 'mail bootstrap should forward profile mail credentials to the remote sync endpoint');
assert.equal(api.list().items[0]?.message_id, 'mail_remote_1', 'mail bootstrap should hydrate the local mail index from the Fastify sync payload');
assert.equal(api.summarize().stats?.unread, 1, 'mail bootstrap should keep local summary methods working after remote sync');

console.log('mail_bootstrap_remote_sync: ok');

const inferredRequests = [];
const inferredEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FASTIFY_URL__: 'http://127.0.0.1:3001',
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'jeezs@atome.one',
            username: 'jeezs@atome.one',
            password: 'secret-pass',
            mailbox: 'INBOX',
            imap: { host: '', port: 993, security: 'tls' },
            smtp: { host: '', port: 587, security: 'starttls' }
        }
    },
    fetch: async (url, options = {}) => {
        inferredRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_remote_cursor_2',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const inferredApi = createGlobalMailApi({ env: inferredEnv });
const inferredReady = await inferredApi.ensureReady({ limit: 5 });
const inferredBody = JSON.parse(inferredRequests[0].options.body);

assert.equal(inferredReady.ok, true, 'mail bootstrap should infer shared mail hosts for known provider domains');
assert.equal(inferredBody.credentials.imap.host, 'rousse.o2switch.net', 'mail bootstrap should infer the shared IMAP host for atome.one addresses');
assert.equal(inferredBody.credentials.smtp.host, 'rousse.o2switch.net', 'mail bootstrap should infer the shared SMTP host for atome.one addresses');

console.log('mail_bootstrap_remote_sync_atome_domain_defaults: ok');

const loopbackRequests = [];
const loopbackEnv = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    location: {
        origin: 'http://127.0.0.1:3000'
    },
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'jeezs@atome.one',
            username: 'jeezs@atome.one',
            password: 'secret-pass',
            mailbox: 'INBOX',
            imap: { host: 'rousse.o2switch.net', port: 993, security: 'tls' },
            smtp: { host: 'rousse.o2switch.net', port: 587, security: 'starttls' }
        }
    },
    fetch: async (url, options = {}) => {
        loopbackRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_remote_cursor_loopback',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const loopbackApi = createGlobalMailApi({ env: loopbackEnv });
const loopbackReady = await loopbackApi.ensureReady({ limit: 5 });

assert.equal(loopbackReady.ok, true, 'mail bootstrap should use the current loopback origin when no explicit server URL is configured');
assert.equal(loopbackRequests[0].url, 'http://127.0.0.1:3000/api/eve/mail/sync', 'mail bootstrap should fall back to the current loopback origin for sync requests');

console.log('mail_bootstrap_remote_sync_loopback_origin: ok');

const tauriLikeRequests = [];
const tauriLikeEnv = {
    __TAURI__: {},
    location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:3000'
    },
    navigator: {
        userAgent: 'Mozilla/5.0 Tauri'
    },
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'jeezs@atome.one',
            username: 'jeezs@atome.one',
            password: 'secret-pass',
            mailbox: 'INBOX',
            imap: { host: 'rousse.o2switch.net', port: 993, security: 'tls' },
            smtp: { host: 'rousse.o2switch.net', port: 587, security: 'starttls' }
        }
    },
    fetch: async (url, options = {}) => {
        tauriLikeRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    mode: 'initial',
                    cursor: 'mail_remote_cursor_tauri_like',
                    items: [],
                    stats: { total: 0, unread: 0, mailboxes: [] }
                };
            }
        };
    }
};

const tauriLikeApi = createGlobalMailApi({ env: tauriLikeEnv });
const tauriLikeReady = await tauriLikeApi.ensureReady({ limit: 5 });

assert.equal(tauriLikeReady.ok, true, 'mail bootstrap should not misclassify a Tauri/browser env as Node');
assert.equal(tauriLikeRequests[0].url, 'http://127.0.0.1:3000/api/eve/mail/sync', 'mail bootstrap should still use the remote sync path in a browser-like Tauri env');

console.log('mail_bootstrap_remote_sync_tauri_like_browser: ok');

const partialEnvRequests = [];
const previousFetch = globalThis.fetch;
const previousLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
        origin: 'http://127.0.0.1:3000',
        protocol: 'http:',
        hostname: '127.0.0.1'
    }
});
globalThis.fetch = async (url, options = {}) => {
    partialEnvRequests.push({ url, options });
    return {
        ok: true,
        async json() {
            return {
                ok: true,
                provider: 'custom_imap_smtp',
                mailbox: 'inbox',
                mode: 'initial',
                cursor: 'mail_remote_cursor_partial_env',
                items: [],
                stats: { total: 0, unread: 0, mailboxes: [] }
            };
        }
    };
};

try {
    const partialEnv = {
        __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
        __eveProfilePreferences: {
            mail: {
                provider: 'custom_imap_smtp',
                email: 'jeezs@atome.one',
                username: 'jeezs@atome.one',
                password: 'secret-pass',
                mailbox: 'INBOX',
                imap: { host: 'rousse.o2switch.net', port: 993, security: 'tls' },
                smtp: { host: 'rousse.o2switch.net', port: 587, security: 'starttls' }
            }
        }
    };
    const partialApi = createGlobalMailApi({ env: partialEnv });
    const partialReady = await partialApi.ensureReady({ limit: 5 });
    assert.equal(partialReady.ok, true, 'mail bootstrap should inherit browser transport capabilities from the host runtime when the injected env is partial');
    assert.equal(partialEnvRequests[0].url, 'http://127.0.0.1:3000/api/eve/mail/sync', 'mail bootstrap should still discover the loopback sync endpoint from the host runtime when env lacks location/fetch');
    console.log('mail_bootstrap_remote_sync_partial_env_host_fallback: ok');
} finally {
    if (previousFetch) {
        globalThis.fetch = previousFetch;
    } else {
        delete globalThis.fetch;
    }
    if (previousLocationDescriptor) {
        Object.defineProperty(globalThis, 'location', previousLocationDescriptor);
    } else {
        delete globalThis.location;
    }
}
