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
                    ok: true
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
api.ingest([
    {
        message_id: 'mail_remote_archive_source_1',
        mailbox: 'inbox',
        thread_id: 'mail_remote_archive_thread_1',
        subject: 'Bonjour',
        body_text: 'Salut',
        from: { name: 'Alice', address: 'alice@example.test' },
        unread: true,
        received_at: '2026-03-20T10:00:00Z',
        source: { remote_mailbox: 'INBOX' },
        meta: { uid: '101' }
    }
]);

const archived = await api.archive('mail_remote_archive_source_1');
assert.equal(archived.ok, true, 'mail bootstrap should support remote archive in browser-style runtimes');
assert.equal(api.read('mail_remote_archive_source_1').item.mailbox, 'archive', 'mail bootstrap should update the local mailbox after remote archive');
assert.equal(requests[0].url, 'http://127.0.0.1:3000/api/eve/mail/archive', 'mail bootstrap should target the local Axum archive endpoint in Tauri mode');

const deleted = await api.delete('mail_remote_archive_source_1');
assert.equal(deleted.ok, true, 'mail bootstrap should support remote delete in browser-style runtimes');
assert.equal(api.read('mail_remote_archive_source_1').item.mailbox, 'trash', 'mail bootstrap should update the local mailbox after remote delete');
assert.equal(requests[1].url, 'http://127.0.0.1:3000/api/eve/mail/delete', 'mail bootstrap should target the local Axum delete endpoint in Tauri mode');

console.log('mail_bootstrap_remote_archive_delete: ok');
