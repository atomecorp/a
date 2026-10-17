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

export async function readConversation(vaultRouter, userId, { contactId, cursor = null, messageId = null, limit = 30 } = {}) {
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
    const page = await vaultRouter.provider.request(userId, 'communication:list', { contactId, cursor, messageId, limit });
    const items = await Promise.all((page?.items || []).map(async (item) => ({ ...item,
        media: await readableMedia(vaultRouter, userId, item.atome_ids) })));
    return { ...page, items };
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
