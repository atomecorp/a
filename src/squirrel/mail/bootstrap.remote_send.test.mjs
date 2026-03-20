import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';

const requests = [];
const env = {
    __SQUIRREL_FORCE_BROWSER_RUNTIME__: true,
    __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
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
                    sent: true,
                    draft_id: 'mail_remote_send_draft_1',
                    remote_id: 'smtp:mail_remote_send_draft_1',
                    message_id: 'smtp:mail_remote_send_draft_1',
                    accepted_at: 1700000000000
                };
            }
        };
    }
};

const api = createGlobalMailApi({ env });
api.ingest([
    {
        message_id: 'mail_remote_send_source_1',
        mailbox: 'inbox',
        thread_id: 'mail_remote_send_thread_1',
        subject: 'Bonjour',
        body_text: 'Salut',
        from: { name: 'Alice', address: 'alice@example.test' },
        received_at: '2026-03-20T10:00:00Z'
    }
]);
const draft = api.replyDraft('mail_remote_send_source_1', {
    reply_text: 'Bien recu.'
});
const sent = await api.send(draft.draft.draft_id, {
    confirmed: true
});

assert.equal(sent.ok, true, 'mail bootstrap should support remote SMTP sends in browser-style runtimes');
assert.equal(sent.draft.status, 'sent', 'mail bootstrap should mark the local draft as sent after a remote SMTP delivery');
assert.equal(requests.length, 1, 'mail bootstrap should issue a single remote send request');
assert.equal(requests[0].url, 'http://127.0.0.1:3000/api/eve/mail/send', 'mail bootstrap should target the local Axum mail send endpoint in Tauri mode');

console.log('mail_bootstrap_remote_send: ok');
