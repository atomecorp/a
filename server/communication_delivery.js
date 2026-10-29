// Livraison et garde des communications pair-a-pair (done/communication_news_broadcast_2026-09-30.md, L2).
//
// - `guardDirectMessage` : enveloppe, liste blanche de `kind`, taille, debit. Le serveur
//   reecrit l'identite de l'expediteur dans l'enveloppe : un client ne peut plus afficher un
//   nom forge, et le telephone n'est jamais relaye.
// - `deliverNotification` : pousse une notification serveur (contact, News) dans la pile
//   du destinataire et la livre en direct (ou la met en file s'il est hors ligne), sous la
//   meme enveloppe `eve-comm-share` que les messages, pour que le client n'ait qu'un chemin.

import { normalizeCommunicationPriority } from '../atome/src/shared/communication_contract.js';
import { lifeProfilesOf } from '../atome/src/shared/life_profile_contract.js';
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

// Retourne { ok, error?, text, params, profiles } : `text` est l'enveloppe reecrite a relayer.
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
    try { params.priority = normalizeCommunicationPriority(params.priority); }
    catch (error) { return { ok: false, error: error.message }; }
    for (const key of ['action', 'severity', 'priorityAuthorized', 'priority_authorized', 'system']) delete params[key];
    // The life profiles the sender files it under stay on the sender's side, never relayed.
    const profiles = lifeProfilesOf(params);
    delete params.profiles;
    params.fromId = String(sender.userId || '');
    params.fromName = sender.username || '';
    // Never the phone the sender typed: the one of the authenticated account, so the
    // recipient recognises the person in their own book (contacts are kept by phone).
    delete params.fromPhone;
    if (sender.phone) params.fromPhone = String(sender.phone);
    return { ok: true, kind, params, profiles, text: JSON.stringify({ ...command, params }) };
}

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
