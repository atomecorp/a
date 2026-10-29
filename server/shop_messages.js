// A sale's conversations (user decisions of 28 Oct. 2026): never a public thread, one private conversation between
// the seller and each person who writes about the sale. Each message is an ordinary message Atome of both
// participants' vaults (server/communication_messages.js) carrying `listing_id`, so it also reads in Communication;
// its recipient gets the « new message » notification whose action (the `shop.open` command) opens the sale's page on that conversation.
// Writing needs an account; a buyer writes to the seller of a live sale, the seller answers whoever wrote first.
import crypto from 'node:crypto';
import { persistCommunicationMessage, readConversation } from './communication_messages.js';

const TEXT_MAX = 2000;
const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);

export function createShopMessages({ listings, vaultRouter, relations = null, findUserName = async () => '', notify, now = () => Date.now() }) {
    // The two ends of a conversation about `listingId`, or why there is none.
    const ends = async (userId, listingId, peerId) => {
        const row = await listings.read(listingId);
        if (!row) return { error: 'shop_not_found' };
        const sellerId = String(row.seller_id);
        if (String(userId) === sellerId) {
            if (!peerId || peerId === sellerId) return { error: 'shop_peer_required' };
            // The seller answers someone who wrote about this sale; never a stranger first.
            const threads = await vaultRouter.provider.request(sellerId, 'communication:threads', { listingId });
            if (!(threads?.items || []).some(thread => thread.peerId === peerId)) return { error: 'shop_peer_unknown' };
            return { row, sellerId, buyerId: peerId };
        }
        if (row.hidden_at) return { error: 'shop_not_found' };
        return { row, sellerId, buyerId: String(userId) };
    };

    const send = async (userId, { listingId, peerId = '', message }) => {
        const body = text(message, TEXT_MAX);
        if (!body) return { ok: false, error: 'shop_message_empty' };
        const found = await ends(String(userId), text(listingId), text(peerId));
        if (found.error) return { ok: false, error: found.error };
        const { row, sellerId, buyerId } = found;
        const targetId = String(userId) === sellerId ? buyerId : sellerId;
        if (relations && await relations.blockedEitherWay(userId, targetId)) return { ok: false, error: 'shop_blocked' };
        const messageId = `shop_${crypto.randomUUID()}`, timestamp = new Date(now()).toISOString();
        // The page the recipient opens: the sale, on the conversation with the one who wrote (the `shop.open` command).
        const opening = peer => ({ kind: 'command', toolId: 'shop.open', input: { listing_id: row.listing_id, peer_id: peer } });
        const action = opening(String(userId));
        const properties = { message_id: messageId, from_id: String(userId), from_name: text(await findUserName(userId), 80), to_user_id: targetId,
            timestamp, subject: text(row.title, 80), message: body, atome_ids: [], kind: 'message', listing_id: row.listing_id,
            priority: 'normal', action };
        await persistCommunicationMessage(vaultRouter, targetId, { ...properties, unread: true, box: 'inbox' });
        await persistCommunicationMessage(vaultRouter, String(userId), { ...properties, unread: false, box: 'sent',
            action: opening(targetId) });
        await notify(targetId, String(userId), { kind: 'shop-message', subject: text(row.title, 80), message: body, id: messageId,
            extra: { action, listing_id: row.listing_id } });
        return { ok: true, messageId };
    };

    // One conversation about a sale (the buyer's with the seller, or the seller's with `peerId`), newest first.
    const thread = async (userId, { listingId, peerId = '', cursor = null }) => {
        const found = await ends(String(userId), text(listingId), text(peerId));
        if (found.error) return { ok: false, error: found.error };
        const other = String(userId) === found.sellerId ? found.buyerId : found.sellerId;
        return { ok: true, ...await readConversation(vaultRouter, String(userId), { contactId: other, cursor, listingId: found.row.listing_id }) };
    };

    // The seller's rows under the sale: one per person who wrote, their last message.
    const threads = async (userId, { listingId }) => {
        const row = await listings.read(text(listingId));
        if (!row || String(row.seller_id) !== String(userId)) return { ok: false, error: 'shop_not_seller' };
        const page = await vaultRouter.provider.request(String(userId), 'communication:threads', { listingId: row.listing_id });
        const items = [];
        for (const item of page?.items || []) {
            items.push({ peerId: item.peerId, name: text(await findUserName(item.peerId), 80), message: text(item.last?.message, 200),
                timestamp: item.timestamp, unread: item.unread });
        }
        return { ok: true, items };
    };

    return { send, thread, threads };
}
