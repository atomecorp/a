import assert from 'node:assert/strict';

import {
    createIcloudMailConnector,
    normalizeIcloudMailConnectorConfig
} from './icloud_connector.js';

const observed = {
    imap: [],
    smtp: []
};

const connector = createIcloudMailConnector({
    auth: {
        email: 'user@icloud.test',
        app_password: 'app-password'
    },
    imapClientFactory: async (config) => ({
        async fetchInitialMailbox(request) {
            observed.imap.push({ config, request, mode: 'initial' });
            return {
                cursor: 'imap_initial_cursor_1',
                messages: [
                    {
                        uid: '101',
                        envelope: {
                            subject: 'Bonjour iCloud',
                            from: [{ name: 'Alice', mailbox: 'alice', host: 'example.test' }],
                            to: [{ mailbox: 'user', host: 'icloud.test' }],
                            date: '2026-03-13T08:00:00Z',
                            messageId: '<mail-imap-101@example.test>'
                        },
                        textSnippet: 'Premier message IMAP',
                        flags: []
                    }
                ]
            };
        },
        async fetchDelta(request) {
            observed.imap.push({ config, request, mode: 'delta' });
            return {
                cursor: 'imap_delta_cursor_2',
                items: [
                    {
                        uid: '102',
                        mailbox: 'INBOX',
                        subject: 'Delta iCloud',
                        from: { address: 'bob@example.test' },
                        to: [{ address: 'user@icloud.test' }],
                        preview: 'Deuxieme message IMAP',
                        body_text: 'Delta complet',
                        unread: true,
                        received_at: '2026-03-13T09:00:00Z'
                    }
                ]
            };
        }
    }),
    smtpClientFactory: async (config) => ({
        async sendMessage(request) {
            observed.smtp.push({ config, request });
            return {
                message_id: '<smtp-delivered-1@example.test>',
                accepted_at: 1700000000123
            };
        }
    })
});

const normalizedConfig = normalizeIcloudMailConnectorConfig({
    auth: {
        email: 'user@icloud.test',
        app_password: 'app-password'
    }
});
assert.equal(normalizedConfig.imap.host, 'imap.mail.me.com', 'iCloud connector config should default to the IMAP host');
assert.equal(normalizedConfig.smtp.host, 'smtp.mail.me.com', 'iCloud connector config should default to the SMTP host');

const initial = await connector.fetchInitialMailbox({
    mailbox: 'inbox',
    limit: 10
});
assert.equal(initial.ok, true, 'iCloud connector should fetch the initial mailbox snapshot');
assert.equal(initial.cursor, 'imap_initial_cursor_1', 'iCloud connector should preserve the initial cursor');
assert.equal(initial.messages[0].mailbox, 'inbox', 'iCloud connector should normalize mailbox names for the local index');
assert.equal(initial.messages[0].message_id, '<mail-imap-101@example.test>', 'iCloud connector should normalize IMAP envelope message ids');
assert.equal(initial.messages[0].from.address, 'alice@example.test', 'iCloud connector should normalize IMAP sender addresses');

const delta = await connector.fetchDelta({
    mailbox: 'inbox',
    cursor: 'imap_initial_cursor_1'
});
assert.equal(delta.ok, true, 'iCloud connector should fetch incremental IMAP delta batches');
assert.equal(delta.cursor, 'imap_delta_cursor_2', 'iCloud connector should preserve the delta cursor');
assert.equal(delta.messages[0].preview, 'Deuxieme message IMAP', 'iCloud connector should preserve preview/snippet text');

const delivery = await connector.sendDraft({
    draft_id: 'mail_draft_icloud_1',
    to: [{ address: 'alice@example.test' }],
    subject: 'Re: Bonjour iCloud',
    body_text: 'Je reviens vers toi demain.'
}, {
    confirmed: true
});
assert.equal(delivery.ok, true, 'iCloud connector should expose SMTP delivery');
assert.equal(delivery.remote_id, '<smtp-delivered-1@example.test>', 'iCloud connector should normalize the remote SMTP message id');
assert.equal(observed.imap.length, 2, 'iCloud connector should use IMAP for initial and delta reads');
assert.equal(observed.smtp.length, 1, 'iCloud connector should use SMTP for confirmed send');
assert.equal(observed.smtp[0].request.smtp.host, 'smtp.mail.me.com', 'iCloud connector should forward SMTP transport config');

console.log('mail_icloud_connector: ok');
