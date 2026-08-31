// Extracted from auth.js: shared backend primitives — adapter map, phone/user normalizers,
// result extractors, and primary/secondary backend resolution.
import { TauriAdapter, FastifyAdapter, resolveAuthSource } from '../adole.js';
import { isTauriRuntime } from './runtime.js';

const adapters = {
    tauri: TauriAdapter,
    fastify: FastifyAdapter
};

const normalizePhone = (phone) => {
    if (phone === null || phone === undefined) return '';
    const trimmed = String(phone).trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) {
        return `+${cleaned.slice(1).replace(/\+/g, '')}`;
    }
    return cleaned.replace(/\+/g, '');
};
const normalizeUsername = (name) => String(name || '').trim();
const createTechnicalUsername = (candidate, phone) => {
    const normalized = normalizeUsername(candidate);
    if (normalized && normalizePhone(normalized) !== normalizePhone(phone)) return normalized;
    const id = globalThis.crypto?.randomUUID?.();
    if (!id) throw new Error('secure_random_unavailable');
    return `user_${id}`;
};

const maskPhoneForLog = (phone) => {
    const normalized = normalizePhone(phone || '');
    if (!normalized) return '<empty>';
    if (normalized.length <= 4) return `${normalized}***`;
    return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
};

const summarizeBackendAttempt = (result) => ({
    ok: !!result?.ok,
    error: result?.error || null,
    hasUser: !!result?.user?.id,
    hasToken: !!result?.token
});

const normalizePhoneForCompare = (phone) => normalizePhone(phone || '').toLowerCase();

const isPhoneMatch = (user, expectedPhone) => {
    const expected = normalizePhoneForCompare(expectedPhone);
    if (!expected) return false;
    const actual = normalizePhoneForCompare(user?.phone || '');
    if (!actual) return false;
    return actual === expected;
};

// Why the session was refused, not merely that it was. A backend that states no
// phone at all is a backend defect; a backend that states a different one is the
// security signal this guard exists for. Reporting both as `phone_mismatch` is
// what kept an iOS-only omission hidden behind a plausible-looking rejection.
const PHONE_CLAIM_FAULTS = {
    requestMissing: 'phone_request_missing',
    backendMissing: 'backend_user_phone_missing',
    mismatch: 'phone_mismatch'
};

const classifyPhoneClaim = (user, expectedPhone) => {
    const expected = normalizePhoneForCompare(expectedPhone);
    if (!expected) return PHONE_CLAIM_FAULTS.requestMissing;
    const actual = normalizePhoneForCompare(user?.phone || '');
    if (!actual) return PHONE_CLAIM_FAULTS.backendMissing;
    return actual === expected ? null : PHONE_CLAIM_FAULTS.mismatch;
};

const extractUser = (result) => {
    return result?.user
        || result?.data?.user
        || result?.data?.data?.user
        || result?.result?.user
        || null;
};

const extractToken = (result) => {
    return result?.token
        || result?.data?.token
        || result?.data?.data?.token
        || result?.result?.token
        || null;
};

// The iOS backend spells this `already_exists`, like it spells `request_id`;
// reading only the camel form meant the client silently missed the fact.
const extractAlreadyExists = (result) => !!(
    result?.alreadyExists
    || result?.already_exists
    || result?.data?.alreadyExists
    || result?.data?.already_exists
    || result?.data?.data?.alreadyExists
    || result?.result?.alreadyExists
);

const normalizeUser = (user) => {
    if (!user) return null;
    const id = user.user_id || user.userId || user.id || user.atome_id || null;
    if (!id) return null;
    return {
        id: String(id),
        username: user.username || null,
        phone: user.phone || null
    };
};

const normalizeBackend = (value) => (value === 'tauri' || value === 'fastify' ? value : null);
// Native runtimes own an always-local session. Server preferences only select
// the remote replication target; they must never turn Fastify into Tauri's
// active identity owner.
const getPrimaryBackend = () => (
    isTauriRuntime()
        ? 'tauri'
        : (normalizeBackend(resolveAuthSource()) || 'fastify')
);
const getSecondaryBackend = () => (getPrimaryBackend() === 'tauri' ? 'fastify' : 'tauri');

const hasToken = (backend) => !!adapters[backend]?.getToken?.();
const hasAuthenticatedToken = (backend, result) => !!result?.token || hasToken(backend);

export {
  adapters, normalizePhone, normalizeUsername, createTechnicalUsername, maskPhoneForLog, summarizeBackendAttempt,
  normalizePhoneForCompare, isPhoneMatch, classifyPhoneClaim, PHONE_CLAIM_FAULTS,
  extractUser, extractToken, extractAlreadyExists,
  normalizeUser, normalizeBackend, getPrimaryBackend, getSecondaryBackend, hasToken, hasAuthenticatedToken
};
