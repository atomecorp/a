// Livraison et garde des communications pair-a-pair (done/communication_news_broadcast_2026-09-30.md, L2).
//
// - The direct messages' guard (envelope, kinds, size, rate) is the Rust front's
//   (atome/servers/atome-server/src/social/direct_messages.rs).
// - `deliverNotification` : pousse une notification serveur (contact, News) dans la pile
//   du destinataire et la livre en direct (ou la met en file s'il est hors ligne), sous la
//   meme enveloppe `eve-comm-share` que les messages, pour que le client n'ait qu'un chemin.

export function createNotificationDelivery({ pushNotificationToUserStack, wsSendJsonToUser, enqueuePendingConsoleMessage, findUserById }) {
    return async function deliverNotification(targetUserId, senderUserId, { kind, message = '', subject = null, publication = null, id = null, extra = {} } = {}) {
        const target = String(targetUserId);
        const senderUser = senderUserId ? await findUserById(String(senderUserId)).catch(() => null) : null;
        const senderName = senderUser?.username || null;
        const senderPhone = senderUser?.phone ? String(senderUser.phone) : null;
        const timestamp = new Date().toISOString();
        const notificationId = id || `${kind}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        // The objects it names (a share's), under both spellings the stack and the live frame carry.
        const atomeIds = extra.atomeIds || extra.atome_ids || [];
        const params = {
            id: notificationId, date: timestamp, kind, subject, message,
            fromId: senderUserId ? String(senderUserId) : '', fromName: senderName || '', fromPhone: senderPhone,
            publication, ...extra, atomeIds
        };
        const stacked = await pushNotificationToUserStack({
            userId: target,
            deferPush: true,
            authorId: senderUserId ? String(senderUserId) : target,
            notification: {
                id: notificationId, message_id: notificationId, command: 'eve-comm-share', kind, subject, message,
                from_id: params.fromId, from_name: senderName, from_phone: senderPhone, to_user_id: target,
                timestamp, unread: true, box: 'inbox', publication, ...extra, atome_ids: atomeIds
            }
        });
        if (stacked?.ok !== true) throw new Error(stacked?.error || 'communication_notification_commit_failed');
        const payload = {
            type: 'console-message',
            message: JSON.stringify({ command: 'eve-comm-share', params }),
            from: { userId: params.fromId || null, username: senderName, phone: senderPhone },
            to: { userId: target },
            timestamp
        };
        const { delivered } = wsSendJsonToUser(target, payload, { scope: 'ws/api', op: kind, targetUserId: target });
        if (!delivered) enqueuePendingConsoleMessage(target, payload);
        const push = await stacked?.deliverPush?.();
        return { ok: true, delivered, id: notificationId, ...(push ? { push } : {}) };
    };
}
