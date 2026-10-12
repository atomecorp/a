import crypto from 'node:crypto';
import db from '../database/adole.js';
import { queryCommunicationMessages } from '../database/communication_messages.js';

const identity = (owner, id) => crypto.createHash('sha256').update(JSON.stringify([owner, id])).digest('hex');
const localId = (owner, id) => `message_${identity(owner, id)}`;

// Inbox and sent correspondence are participant-owned message Atomes, not a
// panel history store. Media remains a reference to its permission-owned Atome.
export async function persistCommunicationMessage(vaultRouter, owner, properties) {
    if (!vaultRouter) throw new Error('conversation_vault_unavailable');
    const id = localId(owner, properties.message_id);
    const result = await vaultRouter.commit(owner, {
        id: `message_event_${identity(owner, properties.message_id)}`, atome_id: id, kind: 'set',
        payload: { scope: 'global', props: { ...properties, type: 'message', kind: 'message' } },
        actor: { type: 'user', id: owner }, source: 'communication.delivery'
    });
    return result;
}

export async function readPersistedCommunicationMessage(vaultRouter, owner, messageId) {
    const state = await vaultRouter.getState(owner, localId(owner, messageId));
    return state?.properties || null;
}

export async function readConversation(vaultRouter, userId, { contactId, cursor = null, limit = 30 } = {}) {
    if (!vaultRouter) throw new Error('conversation_vault_unavailable');
    if (typeof contactId !== 'string' || !contactId.trim() || contactId.length > 200) throw new Error('conversation_contact_invalid');
    limit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 30)));
    // Import old canonical messages once per item, with stable append-only
    // identities. Subsequent reads use the same message owner in the vault.
    let oldCursor = null;
    do {
        const old = await queryCommunicationMessages({ query: db.query, userId, contactId, cursor: oldCursor, limit: 100, legacy: true });
        for (const item of old.items) {
            const messageId = String(item.message_id || item.id);
            if (await vaultRouter.getState(userId, localId(userId, messageId))) continue;
            const { id, ...properties } = item;
            await persistCommunicationMessage(vaultRouter, userId, { ...properties, message_id: messageId });
        }
        oldCursor = old.nextCursor;
    } while (oldCursor);
    return vaultRouter.provider.request(userId, 'communication:list', { contactId, cursor, limit });
}
