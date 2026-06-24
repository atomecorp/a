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

const extractAlreadyExists = (result) => !!(
    result?.alreadyExists
    || result?.data?.alreadyExists
    || result?.data?.data?.alreadyExists
    || result?.result?.alreadyExists
);

const normalizeUser = (user) => {
    if (!user) return null;
    const id = user.user_id || user.userId || user.id || user.atome_id || null;
    if (!id) return null;
    return {
        id: String(id),
        name: user.username || user.name || null,
        phone: user.phone || null
    };
};

const normalizeBackend = (value) => (value === 'tauri' || value === 'fastify' ? value : null);
const getPrimaryBackend = () => normalizeBackend(resolveAuthSource()) || (isTauriRuntime() ? 'tauri' : 'fastify');
const getSecondaryBackend = () => (getPrimaryBackend() === 'tauri' ? 'fastify' : 'tauri');

const hasToken = (backend) => !!adapters[backend]?.getToken?.();
const hasAuthenticatedToken = (backend, result) => !!result?.token || hasToken(backend);

export {
  adapters, normalizePhone, normalizeUsername, maskPhoneForLog, summarizeBackendAttempt,
  normalizePhoneForCompare, isPhoneMatch, extractUser, extractToken, extractAlreadyExists,
  normalizeUser, normalizeBackend, getPrimaryBackend, getSecondaryBackend, hasToken, hasAuthenticatedToken
};
