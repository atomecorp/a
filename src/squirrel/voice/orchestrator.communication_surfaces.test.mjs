import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const calls = [];

const env = {
    Squirrel: {
        mail: {
            async ensureReady() {
                return { ok: true, items: [] };
            },
            list() {
                calls.push('mail.list');
                return {
                    ok: true,
                    items: [{
                        message_id: 'mail_1',
                        subject: 'Mail alpha',
                        preview: 'Mail alpha preview',
                        body_text: 'Mail alpha preview',
                        unread: true,
                        from: { name: 'Alice', address: 'alice@example.test' },
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
                        subject: 'Mail alpha',
                        preview: 'Mail alpha preview',
                        body_text: 'Mail alpha preview',
                        unread: false,
                        from: { name: 'Alice', address: 'alice@example.test' },
                        received_at: '2026-03-24T10:00:00.000Z'
                    }
                };
            }
        },
        messages: {
            async syncPull() {
                return { ok: true, items: [] };
            },
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
        }
    }
};

const sessionRuntime = createVoiceSessionRuntime();
const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime
});
await orchestrator.initToolRouter();

const session = sessionRuntime.createSession({
    session_id: 'voice_messages_multi_surface'
});

const status = await orchestrator.executeUtterance("Dis moi si j'ai de nouveaux messages", {
    session_id: session.session_id
});
assert.equal(status.ok, true);
assert.equal(status.transport, 'mail_api');
assert.match(status.reply_text || '', /message: .*mail:|mail: .*message:|1 mail\(s\).*1 message\(s\)|1 message\(s\).*1 mail\(s\)/i);

const read = await orchestrator.executeUtterance('Lis le dernier message', {
    session_id: session.session_id
});
assert.equal(read.ok, true);
assert.match(read.reply_text || '', /Message de Regis/i);

const reply = await orchestrator.executeUtterance('Reponds lui: comment vas tu ?', {
    session_id: session.session_id
});
assert.equal(reply.ok, true);
assert.match(reply.reply_text || '', /Brouillon de reponse prepare/i);

const send = await orchestrator.executeUtterance('Envoie le mail', {
    session_id: session.session_id
});
assert.equal(send.ok, true);
assert.match(send.reply_text || '', /mail a ete envoye|mail has been sent/i);
assert.ok(calls.includes('messages.send:msg_draft_1'));

console.log('orchestrator.communication_surfaces.test: PASS');
