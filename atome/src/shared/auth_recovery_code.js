// Recovery code (authentication V1 §6.8): 128 random bits as 26 Crockford base32
// characters in groups of 4, then a 2-character check group that catches a
// mistyped character before anything is sent. Shared by client and server.
// The check group also tells the code's version. A version 1 code is sent as it
// is; a version 2 code (every code made since 2026-10-28) never leaves the device:
// it is sent as a proof derived from it (#recoveryProof), the code itself also
// unwrapping the account's backup keys (#squirrel/security/backup_keyring.js),
// which the server therefore can never open.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CORE_LENGTH = 26;

// Version 2 seeds the sum differently; a code whose two check groups agree is never made.
const check = (core, version = 1) => {
    let sum = version === 2 ? 617 : 0;
    for (let index = 0; index < core.length; index += 1) sum = (sum * 33 + ALPHABET.indexOf(core[index]) + 1) % 1021;
    return ALPHABET[sum % 32] + ALPHABET[Math.floor(sum / 32) % 32];
};

// Crockford reading: lower case accepted, I/L read as 1, O as 0, separators ignored.
export function normalizeRecoveryCode(value) {
    return String(value || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '');
}

export function generateRecoveryCode(crypto = globalThis.crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(17));
    let bits = '';
    for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
    let core = '';
    for (let index = 0; index < CORE_LENGTH; index += 1) core += ALPHABET[parseInt(bits.slice(index * 5, index * 5 + 5), 2)];
    if (check(core, 1) === check(core, 2)) return generateRecoveryCode(crypto);
    const groups = core.match(/.{1,4}/g);
    return { code: [...groups, check(core, 2)].join('-'), core, version: 2 };
}

const versionOf = (normalized) => {
    if (normalized.length !== CORE_LENGTH + 2) return 0;
    const core = normalized.slice(0, CORE_LENGTH), group = normalized.slice(CORE_LENGTH);
    return check(core, 1) === group ? 1 : check(core, 2) === group ? 2 : 0;
};

// Whether a typed or pasted value is a whole code whose check group agrees.
export const isCompleteRecoveryCode = (value) => versionOf(normalizeRecoveryCode(value)) !== 0;

// The core and version of a typed code, or an explicit error when its check group disagrees.
export function readRecoveryCode(value) {
    const normalized = normalizeRecoveryCode(value), version = versionOf(normalized);
    if (!version) throw new Error('auth_recovery_code_invalid');
    return { core: normalized.slice(0, CORE_LENGTH), version };
}

const hkdf = async (crypto, core, info, usage) => {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(core), 'HKDF', false, ['deriveBits', 'deriveKey']);
    const params = { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) };
    return usage ? crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, usage) : crypto.subtle.deriveBits(params, base, 256);
};
// What a version 2 code is sent as (verifier, lookup, recovery start): 64 hex digits the server hashes as it would a code.
export async function recoveryProof({ core, version }, crypto = globalThis.crypto) {
    if (version !== 2) return core;
    return Array.from(new Uint8Array(await hkdf(crypto, core, 'atome.recovery.proof.v2')), (value) => value.toString(16).padStart(2, '0')).join('');
}
// The key a version 2 code wraps the account's backup keys with; the server never holds what derives it.
export const recoveryWrapKey = (core, crypto = globalThis.crypto) => hkdf(crypto, core, 'atome.recovery.wrap.v2', ['encrypt', 'decrypt']);

export const recoveryVerifierInput = (principalId, core) => `atome.recovery.v1\0${principalId}${normalizeRecoveryCode(core)}`;
// Finds the account from the code alone: 128 random bits, so the hash reveals nothing.
export const recoveryLookupInput = (core) => `atome.recovery.lookup.v1\0${normalizeRecoveryCode(core)}`;
