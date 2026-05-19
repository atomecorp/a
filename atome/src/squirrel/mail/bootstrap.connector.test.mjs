import assert from 'node:assert/strict';

import { createGlobalMailApi } from './bootstrap.js';
import { createGlobalSecurityApi } from '../security/bootstrap.js';

const env = {};
const security = createGlobalSecurityApi({ env });
security.configureVaultSecret('mail-bootstrap-secret');
await security.storeToken('icloud_mail_bootstrap_auth', {
    email: 'user@icloud.test',
    app_password: 'app-password'
}, {
    provider: 'icloud_imap_smtp'
});
const api = createGlobalMailApi({ env });

const configured = await api.configureIcloudConnector({
    auth_ref: 'icloud_mail_bootstrap_auth',
    imapClientFactory: async () => ({
        async fetchInitialMailbox() {
            return {
                ok: true,
                cursor: 'bootstrap_mail_cursor_1',
                messages: [
                    {
                        message_id: 'mail_bootstrap_connector_1',
                        mailbox: 'inbox',
                        subject: 'Connector bootstrap',
                        body_text: 'Initial sync from bootstrap',
                        unread: true,
                        from: { address: 'alice@example.test' },
                        received_at: '2026-03-13T12:00:00Z'
                    }
                ]
            };
        }
    }),
    smtpClientFactory: async () => ({
        async sendDraft(request) {
            return {
                remote_id: `smtp:${request.draft.draft_id}`
            };
        }
    })
});

assert.equal(configured.configured, true, 'mail bootstrap should configure a shared iCloud connector');
assert.equal(api.connectorStatus().provider, 'icloud_imap_smtp', 'mail bootstrap should expose connector status');

const synced = await api.syncInitial({
    mailbox: 'inbox'
});
assert.equal(synced.ok, true, 'mail bootstrap should expose initial connector sync');
assert.equal(api.list().items[0].message_id, 'mail_bootstrap_connector_1', 'mail bootstrap should index connector-synced messages');

const draft = api.replyDraft('mail_bootstrap_connector_1', {
    reply_text: 'Je te reponds vite.'
});
const delivered = await api.send(draft.draft.draft_id, {
    confirmed: true
});
assert.equal(delivered.ok, true, 'mail bootstrap should expose connector-backed send');
assert.equal(delivered.draft.status, 'sent', 'mail bootstrap should surface sent status after connector-backed send');

console.log('mail_bootstrap_connector: ok');
