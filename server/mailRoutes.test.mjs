import assert from 'node:assert/strict';

import { createMailGateway } from './mailRoutes.js';

const calls = [];
let lastResolvedCredentials = null;
const gateway = createMailGateway({
    resolveCredentials: (runtimeCredentials = null) => {
        lastResolvedCredentials = runtimeCredentials;
        return {
            provider: runtimeCredentials?.provider || 'icloud_imap_smtp',
            email: runtimeCredentials?.email || 'user@icloud.test',
            username: runtimeCredentials?.username || runtimeCredentials?.email || 'user@icloud.test',
            password: runtimeCredentials?.password || 'app-password',
            appPassword: runtimeCredentials?.password || 'app-password',
            mailbox: runtimeCredentials?.mailbox || 'INBOX',
            imap: runtimeCredentials?.imap || { host: 'imap.default.test', port: 993, security: 'tls' },
            smtp: runtimeCredentials?.smtp || { host: 'smtp.default.test', port: 587, security: 'starttls' }
        };
    },
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
        },
        async markRead(message) {
            calls.push(`mark:${message?.message_id || 'unknown'}`);
            return {
                ok: true
            };
        },
        async archiveMessage(message) {
            calls.push(`archive:${message?.message_id || 'unknown'}`);
            return {
                ok: true
            };
        },
        async deleteMessage(message) {
            calls.push(`delete:${message?.message_id || 'unknown'}`);
            return {
                ok: true
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

const profiledSync = await gateway.sync({
    limit: 5,
    credentials: {
        provider: 'custom_imap_smtp',
        email: 'profile@atome.one',
        username: 'profile@atome.one',
        password: 'profile-secret',
        mailbox: 'Archive',
        imap: { host: 'imap.profile.test', port: 993, security: 'tls' },
        smtp: { host: 'smtp.profile.test', port: 587, security: 'starttls' }
    }
});
assert.equal(profiledSync.ok, true, 'mail gateway should accept runtime mail credentials from the profile');
assert.equal(lastResolvedCredentials?.email, 'profile@atome.one', 'mail gateway should pass profile mail credentials to the resolver');
assert.deepEqual(calls, ['initial', 'delta', 'initial'], 'mail gateway should create a distinct runtime when profile credentials change');

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
assert.deepEqual(calls, ['initial', 'delta', 'initial', 'send'], 'mail gateway should reuse the latest cached runtime for send');

const marked = await gateway.markRead({
    message: {
        message_id: 'mail_gateway_1',
        mailbox: 'inbox',
        source: { remote_mailbox: 'INBOX' },
        meta: { uid: '101' }
    },
    read: true
});
assert.equal(marked.ok, true, 'mail gateway should surface IMAP read-state updates');
assert.equal(marked.message_id, 'mail_gateway_1', 'mail gateway markRead should preserve the message id');
assert.deepEqual(calls, ['initial', 'delta', 'initial', 'send', 'mark:mail_gateway_1'], 'mail gateway should reuse the cached runtime for sync, send, and mark-read');

const archived = await gateway.archive({
    message: {
        message_id: 'mail_gateway_1',
        mailbox: 'inbox',
        source: { remote_mailbox: 'INBOX' },
        meta: { uid: '101' }
    }
});
assert.equal(archived.ok, true, 'mail gateway should surface archive operations');
assert.deepEqual(calls, ['initial', 'delta', 'initial', 'send', 'mark:mail_gateway_1', 'archive:mail_gateway_1'], 'mail gateway should reuse the cached runtime for archive');

const deleted = await gateway.delete({
    message: {
        message_id: 'mail_gateway_1',
        mailbox: 'inbox',
        source: { remote_mailbox: 'INBOX' },
        meta: { uid: '101' }
    }
});
assert.equal(deleted.ok, true, 'mail gateway should surface delete operations');
assert.deepEqual(calls, ['initial', 'delta', 'initial', 'send', 'mark:mail_gateway_1', 'archive:mail_gateway_1', 'delete:mail_gateway_1'], 'mail gateway should reuse the cached runtime for delete');

console.log('mail_routes: ok');
