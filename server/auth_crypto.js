/**
 * auth crypto & phone/id primitives — ADOLE v3.0 (stateless).
 */

import crypto from 'crypto';

export const REFRESH_SESSION_PARTICLE_KEY = 'auth_refresh_sessions';

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

export function generateOpaquePrincipalId() {
    return crypto.randomUUID();
}
