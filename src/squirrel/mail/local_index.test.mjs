import assert from 'node:assert/strict';

import { createMailIndex } from './local_index.js';

const index = createMailIndex();

index.upsert([
    {
        message_id: 'mail_1',
        mailbox: 'inbox',
        subject: 'Paiement Roméo',
        preview: 'Versement recu',
        body_text: 'Romeo a effectue le paiement ce matin.',
        unread: true,
        from: { name: 'Romeo', address: 'romeo@example.test' },
        received_at: '2026-03-13T09:00:00Z'
    },
    {
        message_id: 'mail_2',
        mailbox: 'inbox',
        subject: 'Rendez-vous Paul',
        preview: 'Demain a 15h',
        body_text: 'Peux-tu confirmer le rendez-vous de demain ?',
        unread: false,
        from: { name: 'Paul', address: 'paul@example.test' },
        received_at: '2026-03-13T08:00:00Z'
    },
    {
        message_id: 'mail_3',
        mailbox: 'archive',
        subject: 'Synthese hebdo',
        preview: 'Compte et depenses',
        body_text: 'Voici la synthese de tes depenses.',
        unread: true,
        from: { name: 'Bank', address: 'bank@example.test' },
        received_at: '2026-03-12T18:00:00Z'
    }
]);

const listed = index.list({ mailbox: 'inbox', limit: 10 });
assert.deepEqual(
    listed.map((entry) => entry.message_id),
    ['mail_1', 'mail_2'],
    'mail index should list inbox messages ordered by descending receive time'
);

const read = index.read('mail_1');
assert.equal(read.subject, 'Paiement Roméo', 'mail index should read one message by id');

const search = index.search('romeo');
assert.deepEqual(
    search.map((entry) => entry.message_id),
    ['mail_1'],
    'mail index search should match normalized sender/body text'
);

const nextUnread = index.nextUnread({ mailbox: 'inbox' });
assert.equal(nextUnread.message_id, 'mail_1', 'mail index should expose the next unread message');

const stats = index.stats();
assert.equal(stats.total, 3, 'mail index stats should count all records');
assert.equal(stats.unread, 2, 'mail index stats should count unread messages');

console.log('mail_local_index: ok');
