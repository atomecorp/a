import { FastifyAdapter } from '../adole.js';
import { extractToken, extractUser, normalizePhone, normalizeUser } from './auth_core.js';

const PROVISIONING_TTL_MS = 5 * 60 * 1000;
const IDENTITY_MAX_AGE_MS = 60 * 1000;

const bytesToHex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

const base64Bytes = (value) => {
    const decoded = globalThis.atob(String(value || ''));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

const publicKeyBytes = (pem) => base64Bytes(String(pem || '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, ''));

const randomChallenge = () => {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
};

export const verifyFastifyIdentityResponse = async (response, challenge, { now = Date.now() } = {}) => {
    if (!response?.success || !response?.verified || response.challenge !== challenge) {
        return { ok: false, error: 'remote_identity_unverified' };
    }
    const timestamp = Number(response.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > now + 5000 || now - timestamp > IDENTITY_MAX_AGE_MS) {
        return { ok: false, error: 'remote_identity_stale' };
    }
    if (!response.serverId || !response.nonce || !response.signature || !response.publicKey || !response.fingerprint) {
        return { ok: false, error: 'remote_identity_incomplete' };
    }
    try {
        const keyBytes = publicKeyBytes(response.publicKey);
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', keyBytes));
        const fingerprint = `sha256:${bytesToHex(digest)}`;
        if (fingerprint !== response.fingerprint) {
            return { ok: false, error: 'remote_identity_fingerprint_mismatch' };
        }
        const key = await globalThis.crypto.subtle.importKey(
            'spki',
            keyBytes,
            { name: 'RSA-PSS', hash: 'SHA-256' },
            false,
            ['verify']
        );
        const signed = new TextEncoder().encode(
            `${response.serverId}:${challenge}:${timestamp}:${response.nonce}`
        );
        const valid = await globalThis.crypto.subtle.verify(
            { name: 'RSA-PSS', saltLength: 32 },
            key,
            base64Bytes(response.signature),
            signed
        );
        return valid
            ? { ok: true, fingerprint }
            : { ok: false, error: 'remote_identity_signature_invalid' };
    } catch (_) {
        return { ok: false, error: 'remote_identity_verification_failed' };
    }
};

const verifyFastifyServer = async () => {
    const baseUrl = String(FastifyAdapter?.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl || !globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues || typeof globalThis.fetch !== 'function') {
        return { ok: false, error: 'remote_identity_verification_unavailable' };
    }
    const challenge = randomChallenge();
    let response;
    try {
        response = await globalThis.fetch(`${baseUrl}/api/server/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ challenge })
        });
    } catch (_) {
        return { ok: false, error: 'remote_identity_unreachable' };
    }
    if (!response?.ok) return { ok: false, error: 'remote_identity_refused' };
    return verifyFastifyIdentityResponse(await response.json(), challenge);
};

export const provisionFastifyCounterpart = async ({ phone, password, username } = {}) => {
    const normalizedPhone = normalizePhone(phone || '');
    const plainPassword = String(password || '');
    if (!normalizedPhone || plainPassword.length < 8) {
        return { ok: false, error: 'invalid_credentials' };
    }
    const verified = await verifyFastifyServer();
    if (!verified.ok) return verified;
    const operationId = globalThis.crypto?.randomUUID?.();
    if (!operationId) return { ok: false, error: 'secure_random_unavailable' };
    const raw = await FastifyAdapter.auth.provisionAccount({
        operationId,
        expiresAt: new Date(Date.now() + PROVISIONING_TTL_MS).toISOString(),
        verifiedServerFingerprint: verified.fingerprint,
        username: String(username || '').trim() || normalizedPhone,
        phone: normalizedPhone,
        password: plainPassword
    });
    const ok = Boolean(raw?.ok || raw?.success);
    const user = normalizeUser(extractUser(raw));
    const token = extractToken(raw);
    if (!ok || !user?.id || !token) {
        return { ok: false, raw, error: raw?.error || 'remote_account_provision_failed' };
    }
    return { ok: true, raw, user, token };
};
