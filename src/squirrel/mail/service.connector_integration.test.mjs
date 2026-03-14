import assert from 'node:assert/strict';

import { createMailService } from './service.js';

const connectorCalls = {
    initial: 0,
    delta: 0,
    send: 0
};

const service = createMailService({
    connector: {
        provider: 'icloud_imap_smtp',
        contract: {
            read_capabilities: ['mail_list', 'mail_read', 'mail_search', 'mail_next_unread'],
            write_capabilities: ['mail_reply_draft', 'mail_send']
        },
        async fetchInitialMailbox() {
            connectorCalls.initial += 1;
            return {
                ok: true,
                provider: 'icloud_imap_smtp',
                mailbox: 'inbox',
                cursor: 'connector_cursor_1',
                messages: [
                    {
                        message_id: 'mail_connector_1',
                        mailbox: 'inbox',
                        subject: 'Initial connector sync',
                        body_text: 'Premier lot',
                        unread: true,
                        from: { address: 'alice@example.test' },
                        received_at: '2026-03-13T08:30:00Z'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            connectorCalls.delta += 1;
            assert.equal(cursor, 'connector_cursor_1', 'delta sync should reuse the stored connector cursor');
            return {
                ok: true,
                provider: 'icloud_imap_smtp',
                mailbox: 'inbox',
                cursor: 'connector_cursor_2',
                messages: [
                    {
                        message_id: 'mail_connector_2',
                        mailbox: 'inbox',
                        subject: 'Incremental connector sync',
                        body_text: 'Second lot',
                        unread: true,
                        from: { address: 'bob@example.test' },
                        received_at: '2026-03-13T09:00:00Z'
                    }
                ]
            };
        },
        async sendDraft(draft) {
            connectorCalls.send += 1;
            return {
                ok: true,
                remote_id: `smtp:${draft.draft_id}`
            };
        }
    },
    draftIdFactory: () => 'mail_draft_connector_1',
    now: () => 1700000000999
});

assert.equal(service.connectorStatus().configured, true, 'mail service should expose an active connector when configured');

const initial = await service.syncInitial({
    mailbox: 'inbox'
});
assert.equal(initial.ok, true, 'mail service should pull the initial connector snapshot');
assert.equal(initial.ingested, 1, 'mail service should ingest initial connector messages');
assert.equal(service.mailList().items[0].message_id, 'mail_connector_1', 'mail service should index the initial connector payload');

const delta = await service.syncIncremental({
    mailbox: 'inbox'
});
assert.equal(delta.ok, true, 'mail service should pull incremental connector changes');
assert.equal(delta.sync.cursor, 'connector_cursor_2', 'mail service should update the stored connector cursor');
assert.equal(service.mailList().items[0].message_id, 'mail_connector_2', 'mail service should expose the newest connector message first');

const draft = service.mailReplyDraft('mail_connector_2', {
    reply_text: 'Je reviens demain.'
});
assert.equal(draft.ok, true, 'mail service should still build reply drafts from synced connector mail');

const sent = await service.mailSend(draft.draft.draft_id, {
    confirmed: true
});
assert.equal(sent.ok, true, 'mail service should deliver a confirmed draft through the connector');
assert.equal(sent.delivered, true, 'mail service should mark connector delivery explicitly');
assert.equal(sent.draft.status, 'sent', 'mail service should persist sent status once SMTP delivery succeeds');
assert.equal(sent.draft.remote_id, 'smtp:mail_draft_connector_1', 'mail service should persist the remote SMTP id');

assert.deepEqual(connectorCalls, {
    initial: 1,
    delta: 1,
    send: 1
}, 'mail service should delegate initial sync, delta sync, and send to the configured connector');

console.log('mail_service_connector_integration: ok');
