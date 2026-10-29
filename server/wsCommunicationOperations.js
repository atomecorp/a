import db from '../database/adole.js';
import { findUserById, findUserByPhone } from './auth_users.js';
import { resolveWsApiPrincipal, isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { guardDirectMessage } from './communication_delivery.js';
import { deleteConversationMessages, persistCommunicationMessage, readConversation, readPersistedCommunicationMessage } from './communication_messages.js';
import { pushNotificationToUserStack } from './notificationStack.js';
import { contactBookPhone } from '../atome/src/shared/contact_book_hash.js';
import { authorizeCommunicationPriority } from './communication_priority.js';

const deliveriesInFlight = new Map();
const acquireDelivery = async (owner, messageId) => {
    const key = JSON.stringify([owner, messageId]);
    const previous = deliveriesInFlight.get(key);
    let unlock;
    const current = new Promise(resolve => { unlock = resolve; });
    deliveriesInFlight.set(key, current);
    if (previous) await previous;
    return () => { unlock(); if (deliveriesInFlight.get(key) === current) deliveriesInFlight.delete(key); };
};

export async function handleWsCommunication({ data, connection, safeSend, relations, rateAllowed,
    deliver, enqueue, visio }) {
    const requestId = data.requestId || data.request_id;
    const type = `${data.type}-response`;
    const reply = payload => safeSend({ type, requestId, ...payload });
    try {
        const userId = resolveWsApiPrincipal(connection);
        if (!userId || !await isWsApiPrincipalProvisioned(userId)) throw new Error('communication_auth_unavailable');
        if (data.type === 'visio') {
            const result = await visio.handleCommand(userId, data.action, data.input || {}, connection);
            reply({ success: true, ...result });
            return;
        }
        if (data.type === 'conversation') {
            const source = db.getDataSourceAdapter();
            const peer = await findUserById(source, String(data.contactId || ''))
                || (data.targetPhone ? await findUserByPhone(source, contactBookPhone(data.targetPhone)) : null);
            if (data.action === 'delete') {
                if (!peer) throw new Error('conversation_contact_invalid');
                reply({ success: true, ...await deleteConversationMessages(connection._wsApiVaultRouter, userId,
                    { contactId: String(peer.user_id), messageIds: data.messageIds, all: data.all === true }) });
                return;
            }
            const result = peer ? await readConversation(connection._wsApiVaultRouter, userId, { ...data, contactId: peer.user_id }) : { items: [], nextCursor: null };
            reply({ success: true, ...result });
            return;
        }
        const sent = await sendDirectMessage({ userId, data, vaultRouter: connection._wsApiVaultRouter, relations, rateAllowed, deliver, enqueue });
        reply({ success: true, ...sent.result });
        await sent.deliverPush();
    } catch (error) { reply({ success: false, error: error.message || 'communication_failed' }); }
}

// One direct message from `userId` (its envelope in `data.message`, its recipient in `data.toUserId` /
// `data.toPhone`): what the /ws/api frame does, also run by the server itself for a scheduled send
// (server/scheduled_sends.js). Returns the reply's fields and the recipient's push, sent after the reply.
export async function sendDirectMessage({ userId, data, vaultRouter, relations, rateAllowed, deliver, enqueue }) {
    const source = db.getDataSourceAdapter();
    const sender = await findUserById(source, userId);
    if (!sender) throw new Error('contact_required');
    // Rate and envelope are judged before the recipient is resolved: a number
    // without an account answers exactly like an account not yet accepted.
    if (!rateAllowed(userId)) throw new Error('direct_message_rate_limited');
    const guarded = guardDirectMessage(data.message, { userId, username: sender.username, phone: sender.phone });
    if (!guarded.ok) throw new Error(guarded.error);
    const target = (data.toUserId || data.to_user_id ? await findUserById(source, String(data.toUserId || data.to_user_id)) : null)
        || (data.toPhone ? await findUserByPhone(source, contactBookPhone(data.toPhone)) : null);
    if (!target) throw new Error('contact_required');
    const targetId = String(target.user_id);
    const verdict = await relations.canCommunicate(userId, targetId);
    if (!verdict.ok && verdict.silent) return { result: { delivered: false, queued: true }, deliverPush: async () => {} };
    if (!verdict.ok) throw new Error(verdict.error);
    const params = guarded.params;
    params.priority = await authorizeCommunicationPriority({ vaultRouter,
        recipientId: targetId, sender: { userId, phone: sender.phone }, priority: params.priority });
    params.action = { kind: 'conversation', contactId: userId, messageId: params.id };
    const deliveryText = JSON.stringify({ command: 'eve-comm-share', params });
    if (guarded.kind === 'share-request') {
        const shared = await db.query('all', `SELECT share_id, atome_id FROM sync_share_requests
            WHERE owner_id = ? AND principal_id = ? AND status IN ('pending', 'accepted', 'active')
            AND (expires_at IS NULL OR expires_at > datetime('now'))`, [userId, targetId]);
        const ids = Array.isArray(params.atomeIds) ? params.atomeIds : [];
        if (!ids.length || !ids.every(id => shared.some(row => row.atome_id === id))
            || !shared.some(row => row.share_id === params.requestId || row.atome_id === params.requestAtomeId)) {
            throw new Error('direct_message_share_reference_missing');
        }
    }
    if (typeof params.id !== 'string' || !params.id || params.id.length > 200) throw new Error('direct_message_id_required');
    const releaseDelivery = await acquireDelivery(userId, params.id);
    try {
        const prior = await readPersistedCommunicationMessage(vaultRouter, userId, params.id);
        if (prior) {
            if (prior.to_user_id !== targetId || prior.message !== (params.message || params.text || '') || (prior.priority || 'normal') !== params.priority
                || JSON.stringify(prior.atome_ids) !== JSON.stringify(params.atomeIds || [])) throw new Error('direct_message_id_conflict');
            return { result: { duplicate: true, message_id: params.id, receiver_id: targetId }, deliverPush: async () => {} };
        }
        const timestamp = new Date().toISOString();
        let properties = { message_id: params.id, from_id: userId, from_name: sender.username, from_phone: sender.phone || null,
            to_user_id: targetId, timestamp, subject: params.subject || '', message: params.message || params.text || '',
            atome_ids: Array.isArray(params.atomeIds) ? params.atomeIds : [], kind: guarded.kind,
            request_atome_id: params.requestAtomeId || null, request_id: params.requestId || null,
            mode: params.shareMode || null, share_type: params.shareType || null, unread: true, box: 'inbox',
            priority: params.priority, action: params.action };
        // Received correspondence is committed first. Stable event identities
        // make a retry after a partial delivery harmless.
        const received = await readPersistedCommunicationMessage(vaultRouter, targetId, params.id);
        if (received) {
            if (received.from_id !== userId || received.message !== properties.message || (received.priority || 'normal') !== params.priority
                || JSON.stringify(received.atome_ids) !== JSON.stringify(properties.atome_ids)) throw new Error('direct_message_id_conflict');
            properties = received;
        } else await persistCommunicationMessage(vaultRouter, targetId, properties);
        const stacked = await pushNotificationToUserStack({ userId: targetId, authorId: userId, deferPush: true,
            notification: { ...properties, id: params.id } });
        if (!stacked.ok) throw new Error(stacked.error);
        await persistCommunicationMessage(vaultRouter, userId, { ...properties, unread: false, box: 'sent',
            ...(guarded.profiles.length ? { profiles: guarded.profiles } : {}) });
        const payload = { type: 'console-message', message: deliveryText,
            from: { userId, username: sender.username, phone: sender.phone || null }, to: { userId: targetId }, timestamp };
        const delivery = deliver(targetId, payload, { scope: 'ws/api', op: 'direct-message', targetUserId: targetId });
        const queueSize = delivery.delivered ? 0 : enqueue(targetId, payload);
        return { result: { ...delivery, queued: !delivery.delivered, queueSize, message_id: params.id, sender_id: userId, receiver_id: targetId },
            deliverPush: () => stacked.deliverPush() };
    } finally { releaseDelivery(); }
}
