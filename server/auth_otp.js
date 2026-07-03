/**
 * auth OTP, rate-limit & SMS — ADOLE v3.0.
 */

import { normalizePhone } from './auth_crypto.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const otpStore = new Map();
const authRateStore = new Map();

export function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeOTP(phone, code) {
    otpStore.set(phone, {
        code,
        expires: Date.now() + OTP_EXPIRY_MS
    });
}

export function verifyOTP(phone, code) {
    const stored = otpStore.get(phone);

    if (!stored) {
        return { valid: false, error: 'No pending OTP request for this phone number' };
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(phone);
        return { valid: false, error: 'OTP has expired' };
    }

    if (stored.code !== code) {
        return { valid: false, error: 'Invalid OTP code' };
    }

    // Consume the OTP (one-time use)
    otpStore.delete(phone);
    return { valid: true };
}

export function readClientRateKey(request, identity = '') {
    const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || request.ip || request.socket?.remoteAddress || 'unknown';
    return `${ip}:${String(identity || '').trim()}`;
}

export function enforceAuthIdentityRateLimit(bucket, identity, limit = 8, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const key = `${bucket}:${String(identity || '').trim()}`;
    const current = authRateStore.get(key);
    if (!current || now >= current.resetAt) {
        authRateStore.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true };
    }
    current.count += 1;
    if (current.count > limit) {
        return {
            ok: false,
            retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
        };
    }
    return { ok: true };
}

export function enforceAuthRateLimit(request, bucket, identity, limit = 8, windowMs = 15 * 60 * 1000) {
    return enforceAuthIdentityRateLimit(bucket, readClientRateKey(request, identity), limit, windowMs);
}

export async function sendSMS(phone, message) {
    // Development transport: production deployments must inject a provider before enabling OTP.
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SMS provider is required in production');
    }
    return true;
}
