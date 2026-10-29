// Relations pair-a-pair : premier contact et blocage (done/communication_news_broadcast_2026-09-30.md, D3/D4).
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
import { MAX_CONTACT_BOOK_HASHES, contactBookHash, contactBookPhone } from '../atome/src/shared/contact_book_hash.js';
import { CONTACT_REQUEST_LIMITS, createContactRequestGuard } from './communication_request_guard.js';

const CONTACT_STATUSES = new Set(['pending', 'accepted', 'refused']);
// Un refus n'est pas un blocage (decision du 20 oct. 2026, remplace celle du 14 oct.) : il
// tait les messages du pair sans le lui dire, et une nouvelle demande de sa part n'est
// notifiee qu'apres ce delai. Bloquer reste definitif (jusqu'a « Debloquer »).
const REFUSAL_WAIT_DAYS = 30;

export function createCommunicationRelations({
    query = (...args) => db.query(...args),
    notify = async () => {},
    // Resolution par numero (L11) : `findUserByPhone(e164)` / `findUserById(id)` -> { user_id, phone } ou null.
    findUserByPhone = async () => null,
    findUserById = async () => null,
    // An accepted request's note becomes the conversation's first message: `({ ownerId, peerId, note, at })`.
    onAccepted = async () => {},
    // `readCard(peerId)` -> { display_name, user_face } as the peer shares them, or null.
    readCard = async () => null,
    now = () => Date.now(),
    requestLimits = CONTACT_REQUEST_LIMITS
} = {}) {
    const id = (value) => String(value || '').trim();
    const guard = createContactRequestGuard({ query, findUserById, now, limits: requestLimits });

    // Preference « accepter les demandes de personnes absentes de mon carnet » (defaut : oui)
    // et carnet sous forme d'empreintes salees par le proprietaire (jamais de numero en clair).
    const preferencesOf = async (userId) => {
        const row = await query('get', 'SELECT accept_unknown, address_book_json FROM communication_preferences WHERE user_id = ?', [id(userId)]);
        let book = [];
        try { book = JSON.parse(row?.address_book_json || '[]'); } catch (_) { book = []; }
        return { acceptUnknown: row ? Number(row.accept_unknown) !== 0 : true, book: Array.isArray(book) ? book : [] };
    };
    const upsertPreferences = (userId, { acceptUnknown = null, book = null } = {}) => query('run',
        `INSERT INTO communication_preferences (user_id, accept_unknown, address_book_json)
         VALUES (?, COALESCE(?, 1), COALESCE(?, '[]'))
         ON CONFLICT(user_id) DO UPDATE SET
           accept_unknown = COALESCE(?, communication_preferences.accept_unknown),
           address_book_json = COALESCE(?, communication_preferences.address_book_json),
           updated_at = datetime('now')`,
        [id(userId), acceptUnknown, book, acceptUnknown, book]);
    // La cible accepte-t-elle une demande de `senderId` ? Oui si elle accepte les inconnus,
    // sinon seulement si le numero de l'expediteur est dans son carnet.
    const acceptsRequestFrom = async (targetId, senderId) => {
        const prefs = await preferencesOf(targetId);
        if (prefs.acceptUnknown) return true;
        const sender = await findUserById(id(senderId)).catch(() => null);
        const hash = sender?.phone ? await contactBookHash(targetId, sender.phone) : '';
        return Boolean(hash) && prefs.book.includes(hash);
    };

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

    // Un refus de `owner` a propos de `peer` encore dans son delai.
    const refusalStands = async (ownerId, peerId) => {
        const row = await query('get',
            `SELECT julianday('now') - julianday(updated_at) AS age FROM communication_contacts WHERE owner_id = ? AND peer_id = ? AND status = 'refused'`,
            [id(ownerId), id(peerId)]);
        return Boolean(row) && Number(row.age) < REFUSAL_WAIT_DAYS;
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
    // `silent` : un contact accepte qui a ensuite bloque l'emetteur ; l'emetteur ne doit pas le
    // savoir. Pour qui n'a jamais ete accepte, un refus ou un blocage repond comme une demande
    // en attente (`contact_required`) : sinon un message « parti » trahirait le refus.
    const canCommunicate = async (senderId, recipientId) => {
        const sender = id(senderId);
        const recipient = id(recipientId);
        if (!sender || !recipient) return { ok: false, error: 'contact_required' };
        if (sender === recipient) return { ok: true };
        const status = await contactStatus(recipient, sender);
        if (await hasBlocked(recipient, sender)) {
            return status === 'accepted' ? { ok: false, silent: true, error: 'blocked' } : { ok: false, error: 'contact_required' };
        }
        if (await hasBlocked(sender, recipient)) return { ok: false, error: 'contact_blocked_by_you' };
        if (status === 'accepted') return { ok: true };
        return { ok: false, error: 'contact_required' };
    };

    const blockedEitherWay = async (a, b) => (await hasBlocked(a, b)) || (await hasBlocked(b, a));

    // Une demande = un destinataire, admise par la garde anti-spam (communication_request_guard.js)
    // sauf s'il a deja accepte l'emetteur. Tout ce qu'un inconnu peut atteindre repond `pending`
    // apres le meme plancher de temps : numero sans compte, blocage, refus, carnet ferme.
    const request = async (senderId, targetId, options = {}) => {
        const started = now();
        try { return await admitRequest(senderId, targetId, options); } finally { await guard.settle(started); }
    };
    const admitRequest = async (senderId, targetId, { note = '', phone = '' } = {}) => {
        const sender = id(senderId);
        let target = id(targetId);
        // Par numero : un id qui n'est pas un compte (celui d'une fiche du carnet de
        // l'appareil) se resout par le numero joint. Un numero sans compte compte dans les
        // limites comme un autre et repond comme un succes.
        if (phone && !(target && (await findUserById(target).catch(() => null))?.user_id)) {
            const e164 = contactBookPhone(phone);
            if (!e164) throw new Error('contact_phone_invalid');
            target = id((await findUserByPhone(e164))?.user_id);
            if (!target) {
                await guard.admit(sender);
                await guard.record(sender, null, null);
                return { ok: true, status: 'pending' };
            }
        }
        if (!sender || !target || sender === target) throw new Error('contact_target_invalid');
        if (await hasBlocked(sender, target)) throw new Error('contact_blocked_by_you');
        const current = await contactStatus(target, sender);
        const blocked = await hasBlocked(target, sender);
        // L'emetteur consent a recevoir du destinataire : c'est lui qui demande.
        if (current === 'accepted' && !blocked) {
            await setContact(sender, target, 'accepted', sender);
            return { ok: true, status: 'accepted' };
        }
        await guard.admit(sender);
        await setContact(sender, target, 'accepted', sender);
        // Bloque, deja en attente (une seule demande a la fois), refus recent, ou hors du carnet
        // d'une cible qui refuse les inconnus : rien n'est livre, sans le reveler (D4).
        const reaches = !blocked && current !== 'pending' && !(current === 'refused' && await refusalStands(target, sender))
            && await acceptsRequestFrom(target, sender);
        const text = String(note || '').slice(0, 280);
        await guard.record(sender, target, reaches ? text : null);
        if (!reaches) return { ok: true, status: 'pending' };
        await setContact(target, sender, 'pending', sender);
        await notify(target, sender, { kind: 'connection-request', message: text });
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
        // Refuser : silencieux pour l'expediteur, sans blocage (REFUSAL_WAIT_DAYS).
        if (value === 'refuse') return { ok: true, status: 'refused' };
        // Le mot lu dans la demande devient le premier message de la conversation.
        const first = await guard.resolve(peer, owner);
        if (first) await onAccepted({ ownerId: owner, peerId: peer, ...first });
        await notify(peer, owner, { kind: 'connection-accepted', message: '' });
        return { ok: true, status: 'accepted' };
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

    // Le deblocage retire la policy et oublie un refus : une nouvelle demande du pair
    // sera de nouveau notifiee. Une relation acceptee ou en attente reste intacte.
    const unblock = async (ownerId, peerId) => {
        await query('run',
            `DELETE FROM sync_share_policies WHERE owner_id = ? AND peer_id = ? AND policy = 'block'`,
            [id(ownerId), id(peerId)]);
        await query('run',
            `DELETE FROM communication_contacts WHERE owner_id = ? AND peer_id = ? AND status = 'refused'`,
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
        const blocked = [...new Set(blockedRows.map((row) => String(row.peer_id)))];
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
        const contacts = rows.filter((row) => row.status === 'accepted').map((row) => String(row.peer_id));
        // Each accepted contact by the name and photo they share on their card (none when they share none).
        const people = [];
        for (const peer of contacts) {
            const card = await readCard(peer).catch(() => null);
            if (card?.display_name) people.push({ principal_id: peer, display_name: card.display_name, user_face: card.user_face || '' });
        }
        return {
            ok: true,
            statuses,
            contacts,
            people,
            pending: incoming.map((row) => String(row.peer_id)),
            blocked
        };
    };

    const handle = async (message, userId) => {
        const action = String(message?.action || '').toLowerCase();
        const peer = message.userId || message.toUserId || message.fromUserId || message.peerId;
        if (action === 'request') return request(userId, peer, { note: message.note, phone: message.phone });
        if (action === 'preferences-get') return { ok: true, acceptUnknown: (await preferencesOf(userId)).acceptUnknown };
        if (action === 'preferences-set') {
            await upsertPreferences(userId, { acceptUnknown: message.acceptUnknown === false ? 0 : 1 });
            return { ok: true, acceptUnknown: message.acceptUnknown !== false };
        }
        if (action === 'address-book-set') {
            const hashes = [...new Set((Array.isArray(message.hashes) ? message.hashes : [])
                .map((hash) => String(hash || '').trim().toLowerCase())
                .filter((hash) => /^[0-9a-f]{64}$/.test(hash)))].slice(0, MAX_CONTACT_BOOK_HASHES);
            await upsertPreferences(userId, { book: JSON.stringify(hashes) });
            return { ok: true, count: hashes.length };
        }
        if (action === 'respond') return respond(userId, peer, message.decision);
        if (action === 'block') return block(userId, peer);
        if (action === 'unblock') return unblock(userId, peer);
        if (action === 'list') return list(userId);
        throw new Error(`contact_action_unsupported:${action || 'missing'}`);
    };

    return { canCommunicate, blockedEitherWay, hasBlocked, request, respond, block, unblock, list, handle };
}
