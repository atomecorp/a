import db from '../database/adole.js';
import { findUserById, findUserByPhone } from './auth_users.js';
import { resolveWsApiPrincipal, isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { guardDirectMessage } from './communication_delivery.js';
import { persistCommunicationMessage, readConversation, readPersistedCommunicationMessage } from './communication_messages.js';
import { pushNotificationToUserStack } from './notificationStack.js';
import { contactBookPhone } from '../atome/src/shared/contact_book_hash.js';

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
    let releaseDelivery;
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
            const result = peer ? await readConversation(connection._wsApiVaultRouter, userId, { ...data, contactId: peer.user_id }) : { items: [], nextCursor: null };
            reply({ success: true, ...result });
            return;
        }
        const source = db.getDataSourceAdapter();
        const sender = await findUserById(source, userId);
        const target = (data.toUserId || data.to_user_id ? await findUserById(source, String(data.toUserId || data.to_user_id)) : null)
            || (data.toPhone ? await findUserByPhone(source, contactBookPhone(data.toPhone)) : null);
        if (!sender || !target) throw new Error('contact_required');
        const targetId = String(target.user_id);
        if (!rateAllowed(userId)) throw new Error('direct_message_rate_limited');
        const guarded = guardDirectMessage(data.message, { userId, username: sender.username });
        if (!guarded.ok) throw new Error(guarded.error);
        const verdict = await relations.canCommunicate(userId, targetId);
        if (!verdict.ok && verdict.silent) { reply({ success: true, delivered: false, queued: true }); return; }
        if (!verdict.ok) throw new Error(verdict.error);
        const params = guarded.params;
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
        releaseDelivery = await acquireDelivery(userId, params.id);
        const prior = await readPersistedCommunicationMessage(connection._wsApiVaultRouter, userId, params.id);
        if (prior) {
            if (prior.to_user_id !== targetId || prior.message !== (params.message || params.text || '') || JSON.stringify(prior.atome_ids) !== JSON.stringify(params.atomeIds || [])) throw new Error('direct_message_id_conflict');
            reply({ success: true, duplicate: true, message_id: params.id, receiver_id: targetId });
            return;
        }
        const timestamp = new Date().toISOString();
        let properties = { message_id: params.id, from_id: userId, from_name: sender.username,
            to_user_id: targetId, timestamp, subject: params.subject || '', message: params.message || params.text || '',
            atome_ids: Array.isArray(params.atomeIds) ? params.atomeIds : [], kind: guarded.kind,
            request_atome_id: params.requestAtomeId || null, request_id: params.requestId || null,
            mode: params.shareMode || null, share_type: params.shareType || null, unread: true, box: 'inbox' };
        // Received correspondence is committed first. Stable event identities
        // make a retry after a partial delivery harmless.
        const received = await readPersistedCommunicationMessage(connection._wsApiVaultRouter, targetId, params.id);
        if (received) {
            if (received.from_id !== userId || received.message !== properties.message || JSON.stringify(received.atome_ids) !== JSON.stringify(properties.atome_ids)) throw new Error('direct_message_id_conflict');
            properties = received;
        } else await persistCommunicationMessage(connection._wsApiVaultRouter, targetId, properties);
        const stacked = await pushNotificationToUserStack({ userId: targetId, authorId: userId, deferPush: true,
            notification: { ...properties, id: params.id } });
        if (!stacked.ok) throw new Error(stacked.error);
        await persistCommunicationMessage(connection._wsApiVaultRouter, userId, { ...properties, unread: false, box: 'sent' });
        const payload = { type: 'console-message', message: guarded.text,
            from: { userId, username: sender.username }, to: { userId: targetId }, timestamp };
        const delivery = deliver(targetId, payload, { scope: 'ws/api', op: 'direct-message', targetUserId: targetId });
        const queueSize = delivery.delivered ? 0 : enqueue(targetId, payload);
        reply({ success: true, ...delivery, queued: !delivery.delivered, queueSize, message_id: params.id,
            sender_id: userId, receiver_id: targetId });
        await stacked.deliverPush();
    } catch (error) { reply({ success: false, error: error.message || 'communication_failed' }); }
    finally { releaseDelivery?.(); }
}
