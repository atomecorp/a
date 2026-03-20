import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

const fetchedUrls = [];
const env = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FASTIFY_URL__: 'http://127.0.0.1:3001',
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
assert.equal(api.list().items[0]?.message_id, 'mail_remote_1', 'mail bootstrap should hydrate the local mail index from the Fastify sync payload');
assert.equal(api.summarize().stats?.unread, 1, 'mail bootstrap should keep local summary methods working after remote sync');

console.log('mail_bootstrap_remote_sync: ok');
