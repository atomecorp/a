/**
 * auth OTP, rate-limit & SMS — ADOLE v3.0.
 */

import crypto from 'node:crypto';
import { normalizePhone } from './auth_crypto.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const otpStore = new Map();
const authRateStore = new Map();
const verifiedPhonePurposesByConnection = new WeakMap();

const verificationKey = (phone, purpose) => `${String(purpose || '').trim()}:${normalizePhone(phone)}`;
const otpKey = (phone, purpose = 'legacy') => verificationKey(phone, purpose);

export function isAuthOtpBypassEnabled() {
    return process.env.NODE_ENV !== 'production' && process.env.SQUIRREL_AUTH_OTP_BYPASS === '1';
}

export function isEnrollmentOtpDisplayEnabled(purpose) {
    return purpose === 'enrollment' && process.env.SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY === '1';
}

export function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

export function storeOTP(phone, code, purpose = 'legacy') {
    otpStore.set(otpKey(phone, purpose), {
        code,
        expires: Date.now() + OTP_EXPIRY_MS
    });
}

export function verifyOTP(phone, code, purpose = 'legacy') {
    const key = otpKey(phone, purpose);
    const stored = otpStore.get(key);

    if (!stored) {
        return { valid: false, error: 'No pending OTP request for this phone number' };
    }

    if (Date.now() > stored.expires) {
        otpStore.delete(key);
        return { valid: false, error: 'OTP has expired' };
    }

    if (stored.code !== code) {
        return { valid: false, error: 'Invalid OTP code' };
    }

    // Consume the OTP (one-time use)
    otpStore.delete(key);
    return { valid: true };
}

export function markPhoneVerification(connection, phone, purpose) {
    if (!connection || (typeof connection !== 'object' && typeof connection !== 'function')) return false;
    const normalizedPhone = normalizePhone(phone);
    const normalizedPurpose = String(purpose || '').trim();
    if (!normalizedPhone || !normalizedPurpose) return false;
    const verifications = verifiedPhonePurposesByConnection.get(connection) || new Map();
    verifications.set(verificationKey(normalizedPhone, normalizedPurpose), Date.now() + OTP_EXPIRY_MS);
    verifiedPhonePurposesByConnection.set(connection, verifications);
    return true;
}

export function consumePhoneVerification(connection, phone, purpose) {
    const verifications = verifiedPhonePurposesByConnection.get(connection);
    if (!verifications) return false;
    const key = verificationKey(phone, purpose);
    const expiresAt = verifications.get(key);
    verifications.delete(key);
    if (verifications.size === 0) verifiedPhonePurposesByConnection.delete(connection);
    return Number.isFinite(expiresAt) && expiresAt >= Date.now();
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

export async function requestPhoneVerificationDelivery({ phone, purpose, exposeForTest = false }) {
    if (isAuthOtpBypassEnabled()) {
        return { ok: true, otpBypassed: true, delivery: 'bypass' };
    }

    const code = generateOTP();
    storeOTP(phone, code, purpose);
    if (isEnrollmentOtpDisplayEnabled(purpose)) {
        return { ok: true, code, delivery: 'display' };
    }
    if (exposeForTest === true && process.env.NODE_ENV !== 'production') {
        return { ok: true, code, delivery: 'test' };
    }

    try {
        await sendSMS(phone, `Your Atome verification code is: ${code}`);
        return { ok: true, delivery: 'sms' };
    } catch (_) {
        otpStore.delete(otpKey(phone, purpose));
        throw new Error('otp_delivery_unavailable');
    }
}
