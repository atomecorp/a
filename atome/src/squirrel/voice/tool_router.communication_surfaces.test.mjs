import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createMailRequest } from './semantic_contract.js';
import { createWorkingMemory } from './working_memory.js';

const workingMemory = createWorkingMemory();
const calls = [];

const mailApi = {
    async list() {
        calls.push('mail.list');
        return {
            ok: true,
            items: [{
                message_id: 'mail_1',
                subject: 'Re: Test mail',
                preview: 'Ceci est le mail',
                body_text: 'Ceci est le mail',
                unread: true,
                from: { name: 'Jean-Eric Godard', address: 'je@example.test' },
                received_at: '2026-03-24T10:00:00.000Z'
            }]
        };
    },
    read(id) {
        calls.push(`mail.read:${id}`);
        return {
            ok: true,
            item: {
                message_id: id,
                subject: 'Re: Test mail',
                preview: 'Lecture mail',
                body_text: 'Lecture mail',
                unread: false,
                from: { name: 'Jean-Eric Godard', address: 'je@example.test' },
                received_at: '2026-03-24T10:00:00.000Z'
            }
        };
    },
    replyDraft(id, options = {}) {
        calls.push(`mail.replyDraft:${id}:${options.reply_text}`);
        return {
            ok: true,
            draft: {
                draft_id: 'mail_draft_1',
                to: [{ address: 'je@example.test', name: 'Jean-Eric Godard' }]
            }
        };
    },
    async send(id) {
        calls.push(`mail.send:${id}`);
        return { ok: true };
    }
};

const messagesApi = {
    async list() {
        calls.push('messages.list');
        return {
            ok: true,
            items: [{
                id: 'msg_1',
                text: 'Salut depuis les messages',
                unread: true,
                from_phone: '0611223344',
                sender_name: 'Regis',
                sent_at: '2026-03-24T11:00:00.000Z'
            }]
        };
    },
    async read(id) {
        calls.push(`messages.read:${id}`);
        return {
            ok: true,
            item: {
                id,
                text: 'Salut depuis les messages',
                unread: false,
                from_phone: '0611223344',
                sender_name: 'Regis',
                sent_at: '2026-03-24T11:00:00.000Z'
            }
        };
    },
    async replyDraft(id, options = {}) {
        calls.push(`messages.replyDraft:${id}:${options.reply_text}`);
        return {
            ok: true,
            draft: {
                draft_id: 'msg_draft_1'
            }
        };
    },
    async send(id) {
        calls.push(`messages.send:${id}`);
        return { ok: true };
    }
};

const router = createToolRouter({
    connectors: { mail: mailApi, messages: messagesApi },
    workingMemory
});

const listResult = await router.execute(createMailRequest({
    operation: 'list',
    surfaces: ['mail', 'messages'],
    filters: {
        read_state: 'unread',
        limit: 10
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: "Dis moi si j'ai de nouveaux messages",
        utterance_normalized: "dis moi si j ai de nouveaux messages"
    },
    status_only: true
}));

assert.equal(listResult.ok, true);
assert.equal(Array.isArray(listResult.items), true);
assert.equal(listResult.items.length, 2);
assert.match(listResult.reply_text || '', /1 mail\(s\).*1 message\(s\)|1 message\(s\).*1 mail\(s\)/i);
assert.equal(workingMemory.getCurrentItemId('mail'), 'messages:msg_1', 'the newest communication item should become the current context');

const readResult = await router.execute(createMailRequest({
    operation: 'read',
    surfaces: ['mail', 'messages'],
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Lis le dernier message',
        utterance_normalized: 'lis le dernier message'
    }
}));

assert.equal(readResult.ok, true);
assert.match(readResult.reply_text || '', /Message de Regis/i, 'reading after a multi-surface query should target the current messages item');

const draftResult = await router.execute(createMailRequest({
    operation: 'reply',
    surfaces: ['mail', 'messages'],
    draft: {
        reply_text: 'comment vas tu'
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Reponds lui: comment vas tu',
        utterance_normalized: 'reponds lui comment vas tu'
    }
}));

assert.equal(draftResult.ok, true);
assert.equal(workingMemory.getCurrentItemId('mail_draft'), 'messages:msg_draft_1', 'reply drafts should preserve the originating communication surface');

const sendResult = await router.execute(createMailRequest({
    operation: 'send',
    surfaces: ['mail', 'messages'],
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Envoie le mail',
        utterance_normalized: 'envoie le mail'
    }
}));

assert.equal(sendResult.ok, true);
assert.ok(calls.includes('messages.send:msg_draft_1'), 'sending after a messages reply should use the messages connector');

console.log('tool_router.communication_surfaces.test: PASS');
