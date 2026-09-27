// Versioned, domain-separated signing input shared by clients and the verifier.
export const AUTH_LINK_ORIGIN = 'https://atome.one';
export const AUTH_LINK_PROTOCOL = 'atome.phone-link.v1';
export const AUTH_LINK_TTL_MS = 5 * 60 * 1000;
export const AUTH_ACCESS_TTL_SECONDS = 15 * 60;
export const AUTH_SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;

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
