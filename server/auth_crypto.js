/**
 * auth crypto & phone/id primitives — ADOLE v3.0 (stateless).
 */

import crypto from 'crypto';

export const REFRESH_SESSION_PARTICLE_KEY = 'auth_refresh_sessions';

const MIN_AUTH_SECRET_LENGTH = 32;

export function normalizePhone(phone) {
    if (phone === null || phone === undefined) return '';
    const trimmed = String(phone).trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) {
        return `+${cleaned.slice(1).replace(/\+/g, '')}`;
    }
    return cleaned.replace(/\+/g, '');
}

export function requireConfiguredAuthSecret(name, value) {
    const secret = String(value || '').trim();
    if (secret.length < MIN_AUTH_SECRET_LENGTH) {
        throw new Error(`${name} must be configured with at least ${MIN_AUTH_SECRET_LENGTH} characters`);
    }
    return secret;
}

export function generateOpaquePrincipalId() {
    return crypto.randomUUID();
}
