// Address-book fingerprint (done/communication_news_broadcast_2026-09-30.md, L11).
//
// A user may refuse contact requests from people absent from their address book. The
// address book lives on the device, so the app sends the server one fingerprint per
// number instead of the number: SHA-256 of a fixed tag, the OWNER's id and the E.164
// number. Salting by owner makes a fingerprint useless for any other account. Shared by
// the client (computing) and the server (checking the sender's own number).

import { normalizePhoneToE164 } from './phone_number.js';

const TAG = 'atome.contact-book.v1';
const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const contactBookPhone = (phone, options = {}) => {
    const normalized = normalizePhoneToE164(phone, options);
    return typeof normalized === 'string' && normalized.startsWith('+') ? normalized : '';
};

export async function contactBookHash(ownerId, phone, options = {}) {
    const owner = String(ownerId || '').trim();
    const e164 = contactBookPhone(phone, options);
    if (!owner || !e164) return '';
    const data = new TextEncoder().encode(`${TAG}\0${owner}\0${e164}`);
    return toHex(await globalThis.crypto.subtle.digest('SHA-256', data));
}

export const MAX_CONTACT_BOOK_HASHES = 5000;
