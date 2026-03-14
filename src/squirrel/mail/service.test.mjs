import assert from 'node:assert/strict';

import { MAIL_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createMailService } from './service.js';

let draftSeq = 0;
const service = createMailService({
    draftIdFactory: () => {
        draftSeq += 1;
        return `mail_draft_test_${draftSeq}`;
    },
    now: () => 1700000000000 + draftSeq
});

const ingest = service.ingest([
    {
        message_id: 'mail_service_1',
        mailbox: 'inbox',
        subject: 'Bonjour',
        body_text: 'Premier message unread',
        unread: true,
        from: { address: 'alice@example.test' },
        received_at: '2026-03-13T10:00:00Z'
    },
    {
        message_id: 'mail_service_2',
        mailbox: 'inbox',
        subject: 'Reponse',
        body_text: 'Deuxieme message',
        unread: false,
        from: { address: 'bob@example.test' },
        received_at: '2026-03-13T09:00:00Z'
    }
]);

assert.equal(ingest.ok, true, 'mail service should ingest normalized messages into the local index');
assert.equal(MAIL_V1_ARCHITECTURE_DECISION.read_path.protocol, 'imap', 'mail architecture decision should keep IMAP as the read path');
assert.equal(MAIL_V1_ARCHITECTURE_DECISION.send_path.protocol, 'smtp', 'mail architecture decision should keep SMTP as the send path');

const listed = service.mailList({ mailbox: 'inbox' });
assert.deepEqual(
    listed.items.map((entry) => entry.message_id),
    ['mail_service_1', 'mail_service_2'],
    'mail service should list ingested inbox messages'
);

const read = service.mailRead('mail_service_1');
assert.equal(read.ok, true, 'mail service should read a message by id');
assert.equal(read.item.subject, 'Bonjour', 'mail service should return the full normalized message');

const search = service.mailSearch('premier');
assert.deepEqual(
    search.items.map((entry) => entry.message_id),
    ['mail_service_1'],
    'mail service should search through the local mail index'
);

const nextUnread = service.mailNextUnread({ mailbox: 'inbox' });
assert.equal(nextUnread.ok, true, 'mail service should expose next unread');
assert.equal(nextUnread.item.message_id, 'mail_service_1', 'mail service should return the next unread message');

const summary = service.mailSummarize({ mailbox: 'inbox' });
assert.equal(summary.ok, true, 'mail service should summarize indexed mail locally');
assert.match(summary.summary, /unread message/, 'mail summary should describe unread counts');
assert.equal(summary.items[0].message_id, 'mail_service_1', 'mail summary should return the top indexed messages');

const draft = service.mailReplyDraft('mail_service_1', {
    reply_text: 'Je te reponds demain.'
});
assert.equal(draft.ok, true, 'mail service should build a reply draft from a source message');
assert.equal(draft.draft.subject, 'Re: Bonjour', 'mail reply draft should prefix the source subject');
assert.equal(draft.draft.to[0].address, 'alice@example.test', 'mail reply draft should address the original sender by default');

const sendGate = await service.mailSend(draft.draft.draft_id);
assert.equal(sendGate.ok, false, 'mail service should require explicit confirmation before send');
assert.equal(sendGate.confirmation_required, true, 'mail service should expose a confirmation gate');

const sendConfirmed = await service.mailSend(draft.draft.draft_id, {
    confirmed: true
});
assert.equal(sendConfirmed.ok, true, 'mail service should queue the draft once confirmation is explicit');
assert.equal(sendConfirmed.draft.status, 'queued_local_only', 'mail send should remain local-only until SMTP is implemented');

const sync = service.syncApply([
    {
        message_id: 'mail_service_3',
        mailbox: 'inbox',
        subject: 'Delta message',
        body_text: 'Message synchronise incrementiellement.',
        unread: true,
        from: { address: 'carol@example.test' },
        received_at: '2026-03-13T11:00:00Z'
    }
], {
    cursor: 'imap_cursor_1'
});
assert.equal(sync.ok, true, 'mail service should apply incremental sync batches');
assert.equal(sync.sync.cursor, 'imap_cursor_1', 'mail sync should preserve the last connector cursor');
assert.equal(service.syncStatus().sync.ingested, 1, 'mail sync status should expose ingested delta counts');

const readout = service.mailBuildReadout('mail_service_3');
assert.equal(readout.ok, true, 'mail service should build a mail voice readout string');
assert.match(readout.text, /Delta message/, 'mail readout should include the mail subject');
assert.equal(service.connectorStatus().configured, false, 'mail service should expose connector status even without a real connector');

console.log('mail_service: ok');
