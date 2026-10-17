import crypto from 'node:crypto';
import { reject } from './auth_link_security.js';

// Public, non-secret routing names (`jean-4821`): a handle only says whose
// devices receive an approval request; it never proves anything.
const NEUTRAL_WORDS = ['atome', 'eve', 'lune', 'onde', 'nova', 'prisme', 'orbite', 'pixel', 'echo', 'delta', 'sigma', 'flux'];
export const HANDLE_PATTERN = /^[a-z][a-z0-9]{1,15}-\d{4}$/;

export const normalizeHandle = (value) => String(value || '').trim().toLowerCase().replace(/^@/, '');

const stem = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, '').slice(0, 16);

export function createHandles({ query, now }) {
    const of = async (principalId) => (await query('get', 'SELECT handle FROM auth_handles WHERE principal_id = ?', [principalId]))?.handle || null;
    async function assign(principalId, name = '') {
        const existing = await of(principalId);
        if (existing) return existing;
        // The generated `user_<id>` username names nobody.
        const source = /^user_[0-9a-f-]{8,}$/i.test(String(name)) ? '' : name;
        const base = stem(source).length >= 2 ? stem(source) : NEUTRAL_WORDS[crypto.randomInt(NEUTRAL_WORDS.length)];
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const handle = `${base}-${String(crypto.randomInt(10000)).padStart(4, '0')}`;
            const result = await query('run', 'INSERT OR IGNORE INTO auth_handles (handle, principal_id, created_ms) VALUES (?, ?, ?)',
                [handle, principalId, now()]);
            if (Number(result.changes) === 1) return handle;
        }
        return reject('auth_handle_unavailable');
    }
    async function resolve(handle) {
        const value = normalizeHandle(handle);
        if (!HANDLE_PATTERN.test(value)) return null;
        return (await query('get', 'SELECT principal_id FROM auth_handles WHERE handle = ?', [value]))?.principal_id || null;
    }
    return { of, assign, resolve };
}
