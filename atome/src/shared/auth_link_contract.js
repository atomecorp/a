// Versioned, domain-separated signing input shared by clients and the verifier.
export const AUTH_LINK_ORIGIN = 'https://atome.one';
export const AUTH_LINK_PROTOCOL = 'atome.phone-link.v1';

async function sha256Hex(text, subtle = globalThis.crypto.subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function authPasswordRequestDigest(password, currentPassword = '') {
    if (typeof password !== 'string' || typeof currentPassword !== 'string') throw new Error('auth_password_invalid');
    return sha256Hex(JSON.stringify(['atome.password.set.v1', password, currentPassword]));
}

// A device's public key as the server enrolls it, and its id: the SHA-256 (hex) of that JWK,
// its members in this order (atome-server auth/proof.rs#public_device_key).
export async function authDeviceKey({ x, y }, subtle = globalThis.crypto.subtle) {
    const publicKey = { kty: 'EC', crv: 'P-256', x, y };
    return { publicKey, keyId: await sha256Hex(JSON.stringify(publicKey), subtle) };
}

export function authSigningMessage({ purpose, reference, challenge, nonce, keyId, issuedAt }) {
    if (![purpose, reference, challenge, nonce, keyId].every((value) => typeof value === 'string' && value.length > 0)
        || !Number.isSafeInteger(issuedAt)) throw new Error('auth_challenge_invalid');
    return JSON.stringify([AUTH_LINK_PROTOCOL, AUTH_LINK_ORIGIN, purpose, reference, challenge, nonce, keyId, issuedAt]);
}

export function parseAuthLink(value) {
    const url = new URL(value);
    if (url.origin !== AUTH_LINK_ORIGIN || url.username || url.password || url.search) throw new Error('auth_link_invalid');
    const path = /^\/auth\/v\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
    const fragment = /^#t=([A-Za-z0-9_-]{43})$/.exec(url.hash);
    if (!path || !fragment) throw new Error('auth_link_invalid');
    return { attemptId: path[1], token: fragment[1] };
}
