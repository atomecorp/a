import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

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
        requests.push({
            url,
            options
        });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    read: true,
                    message_id: 'mail_remote_mark_read_source_1',
                    uid: '101'
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
api.ingest([
    {
        message_id: 'mail_remote_mark_read_source_1',
        mailbox: 'inbox',
        thread_id: 'mail_remote_mark_read_thread_1',
        subject: 'Bonjour',
        body_text: 'Salut',
        from: { name: 'Alice', address: 'alice@example.test' },
        unread: true,
        received_at: '2026-03-20T10:00:00Z',
        source: { remote_mailbox: 'INBOX' },
        meta: { uid: '101' }
    }
]);

const marked = await api.markRead('mail_remote_mark_read_source_1', {
    read: true
});

assert.equal(marked.ok, true, 'mail bootstrap should support remote IMAP read-state updates in browser-style runtimes');
assert.equal(marked.item.unread, false, 'mail bootstrap should mark the local message as read');
assert.equal(requests.length, 1, 'mail bootstrap should issue a single remote mark-read request');
assert.equal(requests[0].url, 'http://127.0.0.1:3000/api/eve/mail/mark-read', 'mail bootstrap should target the local Axum mail mark-read endpoint in Tauri mode');
assert.equal(JSON.parse(requests[0].options.body).credentials.imap.host, 'imap.example.test', 'mail bootstrap should forward profile IMAP settings to remote mark-read');

console.log('mail_bootstrap_remote_mark_read: ok');
