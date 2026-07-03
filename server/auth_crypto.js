/**
 * auth crypto & phone/id primitives — ADOLE v3.0 (stateless).
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { v5 as uuidv5 } from 'uuid';

export const REFRESH_SESSION_PARTICLE_KEY = 'auth_refresh_sessions';

const SALT_ROUNDS = 10;
const MIN_AUTH_SECRET_LENGTH = 32;
const SQUIRREL_USER_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

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

export function generateDeterministicUserId(phone) {
    const normalizedPhone = normalizePhone(phone).toLowerCase();

    // Generate UUID v5 from phone + namespace
    const userId = uuidv5(normalizedPhone, SQUIRREL_USER_NAMESPACE);

    console.log(`[Auth] Generated deterministic userId for phone ${phone.substring(0, 4)}***: ${userId}`);
    return userId;
}

export async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

export function hashRefreshSecret(secret) {
    return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

export function createRefreshSecret() {
    return crypto.randomBytes(32).toString('base64url');
}
