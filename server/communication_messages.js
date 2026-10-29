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

// An accepted contact request: the note its recipient read becomes the first message of
// their conversation, in both vaults, dated when it was sent (communication_relations.js).
export async function persistAcceptedRequestNote(vaultRouter, { ownerId, peer, note, at }) {
    if (!peer?.user_id) throw new Error('contact_request_sender_unknown');
    const messageId = `contact_request_${identity(peer.user_id, `${ownerId}:${at}`)}`;
    const properties = { message_id: messageId, from_id: peer.user_id, from_name: peer.username || '', from_phone: peer.phone || null,
        to_user_id: ownerId, timestamp: new Date(at).toISOString(), subject: '', message: note, atome_ids: [], kind: 'message',
        request_atome_id: null, request_id: null, mode: null, share_type: null, priority: 'normal',
        action: { kind: 'conversation', contactId: peer.user_id, messageId } };
    await persistCommunicationMessage(vaultRouter, ownerId, { ...properties, unread: false, box: 'inbox' });
    await persistCommunicationMessage(vaultRouter, peer.user_id, { ...properties, unread: false, box: 'sent' });
}

export async function readPersistedCommunicationMessage(vaultRouter, owner, messageId) {
    const state = await vaultRouter.getState(owner, localId(owner, messageId));
    return state?.properties || null;
}

export async function readConversation(vaultRouter, userId, { contactId, cursor = null, messageId = null, limit = 30, listingId = null } = {}) {
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
    const page = await vaultRouter.provider.request(userId, 'communication:list', { contactId, cursor, messageId, limit, ...(listingId ? { listingId } : {}) });
    const items = await Promise.all((page?.items || []).map(async (item) => ({ ...item,
        media: await readableMedia(vaultRouter, userId, item.atome_ids) })));
    return { ...page, items };
}

// Deleted for its reader only: each message Atome of the reader's own vault is deleted (an
// appended `delete` event; the other participant keeps their copy). `all`: the whole
// conversation with `contactId`, page after page; otherwise the `messageIds` given.
export async function deleteConversationMessages(vaultRouter, userId, { contactId, messageIds = [], all = false } = {}) {
    if (!vaultRouter) throw new Error('conversation_vault_unavailable');
    if (typeof contactId !== 'string' || !contactId.trim() || contactId.length > 200) throw new Error('conversation_contact_invalid');
    let ids = [...new Set((Array.isArray(messageIds) ? messageIds : []).map(id => String(id || '').trim()).filter(Boolean))];
    if (all) {
        ids = [];
        let cursor = null;
        do {
            const page = await vaultRouter.provider.request(userId, 'communication:list', { contactId, cursor, limit: 100 });
            ids.push(...(page?.items || []).map(item => String(item.message_id || '')).filter(Boolean));
            cursor = page?.nextCursor || null;
        } while (cursor);
    }
    if (!ids.length || ids.some(id => id.length > 200)) throw new Error('conversation_delete_target_required');
    let deleted = 0;
    for (const messageId of ids) {
        const atomeId = localId(userId, messageId);
        const message = (await vaultRouter.getState(userId, atomeId))?.properties;
        // Only a message of this conversation: from one participant to the other. Its delete event
        // has a stable id, so deleting it again appends nothing.
        if (!message || ![message.from_id, message.to_user_id].includes(contactId)) continue;
        await vaultRouter.commit(userId, { id: `message_delete_${identity(userId, messageId)}`, atome_id: atomeId, kind: 'delete',
            payload: {}, actor: { type: 'user', id: userId }, source: 'communication.conversation.delete' });
        deleted += 1;
    }
    return { deleted };
}

// What a participant needs to play the Atomes a message carries, read through the vault
// (own state, or the share projection: nothing the reader may not read). The source is
// the file route without the owner's query, which carried the owner's media token; the
// reader's client signs it with its own session.
const MEDIA_FIELDS = ['media_kind', 'mime_type', 'duration', 'duration_sec', 'width', 'height', 'media_width', 'media_height', 'name'];
const tokenFreeSource = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw, 'http://relative.invalid');
        url.search = ''; url.hash = '';
        return raw.startsWith('/') ? url.pathname : url.toString();
    } catch (_) { return ''; }
};
async function readableMedia(vaultRouter, userId, atomeIds) {
    const media = [];
    for (const atomeId of (Array.isArray(atomeIds) ? atomeIds : []).slice(0, 10)) {
        const state = await vaultRouter.getState(userId, String(atomeId)).catch(() => null);
        const properties = state?.properties || {};
        const source = tokenFreeSource(properties.media_url);
        if (!state || !source) continue;
        media.push({ id: String(atomeId), type: String(state.atome_type || state.type || properties.type || ''),
            ...Object.fromEntries(MEDIA_FIELDS.filter((key) => properties[key] != null).map((key) => [key, properties[key]])),
            media_url: source });
    }
    return media;
}
