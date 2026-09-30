// Livraison et garde des communications pair-a-pair (done/communication_news_broadcast_2026-09-30.md, L2).
//
// - `guardDirectMessage` : enveloppe, liste blanche de `kind`, taille, debit. Le serveur
//   reecrit l'identite de l'expediteur dans l'enveloppe : un client ne peut plus afficher un
//   nom forge, et le telephone n'est jamais relaye.
// - `deliverNotification` : pousse une notification serveur (contact, News) dans la pile
//   du destinataire et la livre en direct (ou la met en file s'il est hors ligne), sous la
//   meme enveloppe `eve-comm-share` que les messages, pour que le client n'ait qu'un chemin.

export const DIRECT_MESSAGE_MAX_BYTES = 128 * 1024;
export const DIRECT_MESSAGE_TEXT_MAX = 8000;
export const DIRECT_MESSAGE_RATE = { max: 30, windowMs: 10_000 };
// `publication` n'est PAS un message : seule la diffusion serveur (news/publish) en cree.
const DIRECT_MESSAGE_KINDS = new Set(['message', 'share-request']);

export function createRateLimiter({ max, windowMs } = DIRECT_MESSAGE_RATE) {
    const hits = new Map();
    return (key, now = Date.now()) => {
        const list = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
        if (list.length >= max) { hits.set(key, list); return false; }
        list.push(now);
        hits.set(key, list);
        if (hits.size > 10_000) hits.delete(hits.keys().next().value);
        return true;
    };
}

// Retourne { ok, error?, text, params } : `text` est l'enveloppe reecrite a relayer.
export function guardDirectMessage(rawText, sender = {}) {
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text) return { ok: false, error: 'direct_message_empty' };
    if (Buffer.byteLength(text, 'utf8') > DIRECT_MESSAGE_MAX_BYTES) return { ok: false, error: 'direct_message_too_large' };
    let command;
    try { command = JSON.parse(text); } catch { return { ok: false, error: 'direct_message_envelope_invalid' }; }
    if (!command || command.command !== 'eve-comm-share' || (command.params && typeof command.params !== 'object')) {
        return { ok: false, error: 'direct_message_envelope_invalid' };
    }
    const params = { ...(command.params || {}) };
    const kind = String(params.kind || 'message');
    if (!DIRECT_MESSAGE_KINDS.has(kind)) return { ok: false, error: 'direct_message_kind_forbidden' };
    const body = params.message ?? params.text ?? '';
    if (typeof body === 'string' && body.length > DIRECT_MESSAGE_TEXT_MAX) return { ok: false, error: 'direct_message_too_large' };
    params.kind = kind;
    params.fromId = String(sender.userId || '');
    params.fromName = sender.username || '';
    delete params.fromPhone;
    return { ok: true, kind, params, text: JSON.stringify({ ...command, params }) };
}

export function createNotificationDelivery({ pushNotificationToUserStack, wsSendJsonToUser, enqueuePendingConsoleMessage, findUserById }) {
    return async function deliverNotification(targetUserId, senderUserId, { kind, message = '', subject = null, publication = null, id = null, extra = {} } = {}) {
        const target = String(targetUserId);
        const senderUser = senderUserId ? await findUserById(String(senderUserId)).catch(() => null) : null;
        const senderName = senderUser?.username || null;
        const timestamp = new Date().toISOString();
        const notificationId = id || `${kind}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        const params = {
            id: notificationId, date: timestamp, kind, subject, message,
            fromId: senderUserId ? String(senderUserId) : '', fromName: senderName || '',
            atomeIds: [], publication, ...extra
        };
        await pushNotificationToUserStack({
            userId: target,
            authorId: senderUserId ? String(senderUserId) : target,
            notification: {
                id: notificationId, message_id: notificationId, command: 'eve-comm-share', kind, subject, message,
                atome_ids: [], from_id: params.fromId, from_name: senderName, to_user_id: target,
                timestamp, unread: true, box: 'inbox', publication, ...extra
            }
        }).catch((error) => console.warn('[communication] notification stack push failed', error?.message || error));
        const payload = {
            type: 'console-message',
            message: JSON.stringify({ command: 'eve-comm-share', params }),
            from: { userId: params.fromId || null, username: senderName },
            to: { userId: target },
            timestamp
        };
        const { delivered } = wsSendJsonToUser(target, payload, { scope: 'ws/api', op: kind, targetUserId: target });
        if (!delivered) enqueuePendingConsoleMessage(target, payload);
        return { ok: true, delivered, id: notificationId };
    };
}
