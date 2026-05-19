import assert from 'node:assert/strict';

globalThis.atome = {
    mail: {
        list() {
            return {
                ok: true,
                items: [{
                    message_id: 'mail_comm_1',
                    subject: 'Mail item',
                    preview: 'Preview mail',
                    received_at: '2026-03-25T10:00:00Z'
                }]
            };
        },
        read(id) {
            return {
                ok: true,
                item: {
                    message_id: id,
                    subject: 'Mail item'
                }
            };
        },
        replyDraft(id, options = {}) {
            return {
                ok: true,
                draft: {
                    draft_id: `mail:${id}_draft`,
                    body_text: options.reply_text || ''
                }
            };
        },
        send(id) {
            return {
                ok: true,
                sent: true,
                draft_id: id
            };
        }
    },
    messages: {
        list() {
            return {
                ok: true,
                items: [{
                    id: 'msg_comm_1',
                    text: 'Salut depuis messages',
                    received_at: '2026-03-25T11:00:00Z'
                }]
            };
        },
        read(id) {
            return {
                ok: true,
                item: {
                    id,
                    text: 'Salut depuis messages'
                }
            };
        },
        replyDraft(id, options = {}) {
            return {
                ok: true,
                draft: {
                    draft_id: `messages:${id}_draft`,
                    body_text: options.reply_text || ''
                }
            };
        },
        send(id) {
            return {
                ok: true,
                sent: true,
                draft_id: id
            };
        }
    },
    tools: {
        v2Runtime: {
            async listTools() {
                return [];
            },
            async invokeById() {
                return { ok: true };
            }
        },
        v2CommandBus: {
            listEvents() {
                return [];
            }
        }
    }
};

await import('./mcp.js');

const listed = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 1,
    method: 'communication.list',
    params: {
        surfaces: ['mail', 'messages']
    }
});

assert.equal(listed.error, undefined, 'communication.list should succeed');
assert.equal(listed.result?.items?.[0]?.comm_surface, 'messages', 'communication.list should preserve the true source surface');

const read = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 2,
    method: 'communication.read',
    params: {
        message_id: 'messages:msg_comm_1'
    }
});

assert.equal(read.error, undefined, 'communication.read should succeed');
assert.equal(read.result?.item?.comm_surface, 'messages', 'communication.read should route to the messages connector');

const replyDraft = await globalThis.handleAtomeMCPRequestAsync({
    jsonrpc: '2.0',
    id: 3,
    method: 'communication.reply_draft',
    params: {
        message_id: 'messages:msg_comm_1',
        reply_text: 'Bonjour'
    }
});

assert.equal(replyDraft.error, undefined, 'communication.reply_draft should succeed');
assert.equal(replyDraft.result?.draft?.draft_id, 'messages:msg_comm_1_draft', 'communication.reply_draft should keep the originating communication surface');

console.log('mcp.communication_surface.test: PASS');
process.exit(0);
