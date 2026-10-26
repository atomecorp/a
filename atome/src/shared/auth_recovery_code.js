// Recovery code (authentication V1 §6.8): 128 random bits as 26 Crockford base32
// characters in groups of 4, then a 2-character check group that catches a
// mistyped character before anything is sent. Shared by client and server.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CORE_LENGTH = 26;

const check = (core) => {
    let sum = 0;
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
    const groups = core.match(/.{1,4}/g);
    return { code: [...groups, check(core)].join('-'), core };
}

// The core of a typed code, or an explicit error when its check group disagrees.
export function readRecoveryCode(value) {
    const normalized = normalizeRecoveryCode(value);
    if (normalized.length !== CORE_LENGTH + 2) throw new Error('auth_recovery_code_invalid');
    const core = normalized.slice(0, CORE_LENGTH);
    if (check(core) !== normalized.slice(CORE_LENGTH)) throw new Error('auth_recovery_code_invalid');
    return core;
}

export const recoveryVerifierInput = (principalId, core) => `atome.recovery.v1\0${principalId}${normalizeRecoveryCode(core)}`;
// Finds the account from the code alone: 128 random bits, so the hash reveals nothing.
export const recoveryLookupInput = (core) => `atome.recovery.lookup.v1\0${normalizeRecoveryCode(core)}`;
