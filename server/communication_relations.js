// Relations pair-a-pair : premier contact et blocage (todo/communication_news_broadcast_2026-09-30.md, D3/D4).
//
// Deux faits, deux proprietaires, aucun doublon :
// - le BLOCAGE vit dans `sync_share_policies` (policy 'block'), deja applique par le partage ;
// - l'ACCEPTATION d'un contact vit dans `communication_contacts`. Elle ne peut pas vivre dans
//   la policy 'always' : celle-ci accepte automatiquement tous les partages du pair, ce qu'un
//   simple contact n'autorise pas.
//
// Une ligne (owner_id, peer_id, status) est la decision de `owner` a propos de `peer`.
// `sender` peut ecrire a `recipient` si et seulement si la ligne (recipient, sender) vaut
// 'accepted' et qu'aucun des deux n'a bloque l'autre.

import db from '../database/adole.js';

const CONTACT_STATUSES = new Set(['pending', 'accepted', 'refused']);

export function createCommunicationRelations({ query = (...args) => db.query(...args), notify = async () => {} } = {}) {
    const id = (value) => String(value || '').trim();

    const hasBlocked = async (ownerId, peerId) => {
        const row = await query('get',
            `SELECT policy FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND revoked_at IS NULL`,
            [id(ownerId), id(peerId)]);
        return row?.policy === 'block';
    };

    const contactStatus = async (ownerId, peerId) => {
        const row = await query('get',
            'SELECT status FROM communication_contacts WHERE owner_id = ? AND peer_id = ?',
            [id(ownerId), id(peerId)]);
        return row?.status || null;
    };

    const setContact = (ownerId, peerId, status, requestedBy = null) => {
        if (!CONTACT_STATUSES.has(status)) throw new Error('contact_status_invalid');
        return query('run',
            `INSERT INTO communication_contacts (owner_id, peer_id, status, requested_by)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(owner_id, peer_id) DO UPDATE SET status = excluded.status,
             requested_by = COALESCE(excluded.requested_by, communication_contacts.requested_by),
             updated_at = datetime('now')`,
            [id(ownerId), id(peerId), status, requestedBy ? id(requestedBy) : null]);
    };

    // Verdict unique pour toute communication pair-a-pair (message, partage, appel).
    // `silent` : le destinataire a bloque l'emetteur ; l'emetteur ne doit pas le savoir.
    const canCommunicate = async (senderId, recipientId) => {
        const sender = id(senderId);
        const recipient = id(recipientId);
        if (!sender || !recipient) return { ok: false, error: 'contact_required' };
        if (sender === recipient) return { ok: true };
        if (await hasBlocked(recipient, sender)) return { ok: false, silent: true, error: 'blocked' };
        if (await hasBlocked(sender, recipient)) return { ok: false, error: 'contact_blocked_by_you' };
        if (await contactStatus(recipient, sender) === 'accepted') return { ok: true };
        return { ok: false, error: 'contact_required' };
    };

    const blockedEitherWay = async (a, b) => (await hasBlocked(a, b)) || (await hasBlocked(b, a));

    const request = async (senderId, targetId, { note = '' } = {}) => {
        const sender = id(senderId);
        const target = id(targetId);
        if (!sender || !target || sender === target) throw new Error('contact_target_invalid');
        if (await hasBlocked(sender, target)) throw new Error('contact_blocked_by_you');
        // L'emetteur consent a recevoir du destinataire : c'est lui qui demande.
        await setContact(sender, target, 'accepted', sender);
        // Bloque ou deja refuse : succes apparent, rien n'est livre (D4, anti-harcelement).
        if (await hasBlocked(target, sender)) return { ok: true, status: 'pending' };
        const current = await contactStatus(target, sender);
        if (current === 'accepted') return { ok: true, status: 'accepted' };
        if (current === 'refused') return { ok: true, status: 'pending' };
        await setContact(target, sender, 'pending', sender);
        await notify(target, sender, { kind: 'connection-request', message: String(note || '').slice(0, 280) });
        return { ok: true, status: 'pending' };
    };

    const respond = async (ownerId, peerId, decision) => {
        const owner = id(ownerId);
        const peer = id(peerId);
        const value = String(decision || '').toLowerCase();
        if (value === 'block') return block(owner, peer);
        if (value !== 'accept' && value !== 'refuse') throw new Error('contact_decision_invalid');
        if (await contactStatus(owner, peer) === null) throw new Error('contact_request_not_found');
        await setContact(owner, peer, value === 'accept' ? 'accepted' : 'refused');
        if (value === 'accept') await notify(peer, owner, { kind: 'connection-accepted', message: '' });
        return { ok: true, status: value === 'accept' ? 'accepted' : 'refused' };
    };

    const block = async (ownerId, peerId) => {
        const owner = id(ownerId);
        const peer = id(peerId);
        if (!owner || !peer || owner === peer) throw new Error('contact_target_invalid');
        await query('run',
            `INSERT INTO sync_share_policies (owner_id, peer_id, policy, permissions_json, revoked_at)
             VALUES (?, ?, 'block', NULL, NULL)
             ON CONFLICT(owner_id, peer_id) DO UPDATE SET policy = 'block', revoked_at = NULL,
             updated_at = datetime('now')`,
            [owner, peer]);
        return { ok: true, status: 'blocked' };
    };

    // Le deblocage retire la policy : la relation de contact, stockee a part, est intacte.
    const unblock = async (ownerId, peerId) => {
        await query('run',
            `DELETE FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND policy = 'block'`,
            [id(ownerId), id(peerId)]);
        return { ok: true, status: (await contactStatus(ownerId, peerId)) || 'none' };
    };

    const list = async (ownerId) => {
        const owner = id(ownerId);
        const rows = await query('all',
            'SELECT peer_id, status, requested_by, updated_at FROM communication_contacts WHERE owner_id = ?',
            [owner]) || [];
        const blockedRows = await query('all',
            `SELECT peer_id FROM sync_share_policies WHERE owner_id = ? AND policy = 'block' AND revoked_at IS NULL`,
            [owner]) || [];
        const blocked = blockedRows.map((row) => String(row.peer_id));
        const incoming = rows.filter((row) => row.status === 'pending' && String(row.requested_by) !== owner);
        // Etat lisible par pair, du point de vue de `owner`. Un refus ou un blocage de
        // l'AUTRE cote n'est jamais revele : il reste « demande envoyee ».
        const statuses = {};
        for (const row of rows) {
            const peer = String(row.peer_id);
            if (row.status === 'pending') statuses[peer] = 'incoming';
            else if (row.status === 'refused') statuses[peer] = 'refused';
            else statuses[peer] = (await contactStatus(peer, owner)) === 'accepted' ? 'contact' : 'outgoing';
        }
        for (const peer of blocked) statuses[peer] = 'blocked';
        return {
            ok: true,
            statuses,
            contacts: rows.filter((row) => row.status === 'accepted').map((row) => String(row.peer_id)),
            pending: incoming.map((row) => String(row.peer_id)),
            refused: rows.filter((row) => row.status === 'refused').map((row) => String(row.peer_id)),
            blocked
        };
    };

    const handle = async (message, userId) => {
        const action = String(message?.action || '').toLowerCase();
        const peer = message.userId || message.toUserId || message.fromUserId || message.peerId;
        if (action === 'request') return request(userId, peer, { note: message.note });
        if (action === 'respond') return respond(userId, peer, message.decision);
        if (action === 'block') return block(userId, peer);
        if (action === 'unblock') return unblock(userId, peer);
        if (action === 'list') return list(userId);
        throw new Error(`contact_action_unsupported:${action || 'missing'}`);
    };

    return { canCommunicate, blockedEitherWay, hasBlocked, request, respond, block, unblock, list, handle };
}
