import assert from 'node:assert/strict';

import { createMailGateway } from './mailRoutes.js';

const calls = [];
const gateway = createMailGateway({
    resolveCredentials: () => ({
        email: 'user@icloud.test',
        appPassword: 'app-password'
    }),
    connectorFactory: () => ({
        provider: 'icloud_imap_smtp',
        async fetchInitialMailbox() {
            calls.push('initial');
            return {
                ok: true,
                cursor: 'mail_gateway_cursor_1',
                messages: [
                    {
                        message_id: 'mail_gateway_1',
                        mailbox: 'inbox',
                        subject: 'Gateway sync',
                        preview: 'Mail depuis le backend',
                        body_text: 'Mail depuis le backend',
                        unread: true,
                        from: { address: 'alice@example.test' },
                        received_at: '2026-03-17T12:45:00Z'
                    }
                ]
            };
        },
        async fetchDelta() {
            calls.push('delta');
            return {
                ok: true,
                cursor: 'mail_gateway_cursor_2',
                messages: []
            };
        },
        async sendDraft(draft) {
            calls.push('send');
            return {
                ok: true,
                remote_id: `smtp:${draft.draft_id}`,
                message_id: `smtp:${draft.draft_id}`,
                accepted_at: 1700000000000
            };
        }
    }),
    resolveMailbox: () => 'INBOX'
});

const initial = await gateway.sync({ limit: 5 });
assert.equal(initial.ok, true, 'mail gateway should surface a successful initial sync');
assert.equal(initial.items[0]?.message_id, 'mail_gateway_1', 'mail gateway should return normalized mail items');
assert.equal(initial.cursor, 'mail_gateway_cursor_1', 'mail gateway should surface the connector cursor');

const delta = await gateway.sync({ limit: 5 });
assert.equal(delta.ok, true, 'mail gateway should support incremental sync after the initial snapshot');
assert.deepEqual(calls, ['initial', 'delta'], 'mail gateway should reuse the cached service and switch to delta sync after the first call');

const sent = await gateway.send({
    draft: {
        draft_id: 'mail_gateway_draft_1',
        subject: 'Re: Gateway sync',
        to: [{ address: 'alice@example.test' }],
        body_text: 'Bien recu.'
    },
    confirmed: true
});
assert.equal(sent.ok, true, 'mail gateway should surface SMTP sends');
assert.equal(sent.sent, true, 'mail gateway send should expose sent status');
assert.equal(sent.draft_id, 'mail_gateway_draft_1', 'mail gateway send should preserve the draft id');
assert.deepEqual(calls, ['initial', 'delta', 'send'], 'mail gateway should reuse the cached runtime for sync and send');

console.log('mail_routes: ok');
