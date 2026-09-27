import { randomHandle, reject, requireHandle } from './auth_link_security.js';
import { AUTH_SESSION_IDLE_MS, AUTH_SESSION_MAX_MS } from '../atome/src/shared/auth_link_contract.js';

// Persistent device-bound sessions replace password-backed relogin. A session
// handle alone is not a credential: renewal always consumes a fresh signature.
export function createDeviceSessions({ query, transaction, proof, now, issueAccess, findById, disconnectSession, deleteAccount }) {
    const read = async (id) => {
        requireHandle(id);
        const row = await query('get', `SELECT s.*, k.public_key, k.revoked_ms AS key_revoked_ms,
            k.restricted_until_ms FROM auth_device_sessions s
            JOIN auth_device_keys k ON k.key_id = s.key_id WHERE session_id = ?`, [id]);
        if (!row || row.revoked_ms !== null || row.key_revoked_ms !== null
            || row.idle_expires_ms <= now() || row.expires_ms <= now()) reject('auth_session_invalid');
        return row;
    };
    const result = async (row, account) => ({
        ok: true, token: await issueAccess({ principalId: row.principal_id, keyId: row.key_id, sessionId: row.session_id }),
        session: { id: row.session_id, generation: row.generation, keyId: row.key_id,
            expiresAt: row.expires_ms, idleExpiresAt: row.idle_expires_ms },
        user: { id: account.user_id, user_id: account.user_id, username: account.username, phone: account.phone }
    });
    async function create(account, keyId) {
        const row = { session_id: randomHandle(), principal_id: account.user_id, key_id: keyId,
            generation: 0, created_ms: now(), idle_expires_ms: now() + AUTH_SESSION_IDLE_MS,
            expires_ms: now() + AUTH_SESSION_MAX_MS };
        await query('run', `INSERT INTO auth_device_sessions VALUES (?, ?, ?, 0, ?, ?, ?, NULL)`,
            [row.session_id, row.principal_id, keyId, row.created_ms, row.idle_expires_ms, row.expires_ms]);
        await proof.audit('session_created', account.user_id, row.session_id);
        return result(row, account);
    }
    const reference = ({ sessionId, generation, targetKeyId, newPhone }, purpose) => {
        if (purpose === 'change-phone') {
            if (typeof newPhone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(newPhone)) reject('auth_phone_e164_required');
            return `${sessionId}:${generation}:${newPhone}`;
        }
        if (purpose === 'revoke-device') {
            if (typeof targetKeyId !== 'string' || !/^[a-f0-9]{64}$/.test(targetKeyId)) reject('auth_request_invalid');
            return `${sessionId}:${generation}:${targetKeyId}`;
        }
        return `${sessionId}:${generation}`;
    };
    async function getChallenge({ sessionId, purpose, generation, targetKeyId, newPhone }, network) {
        if (!['renew', 'local-bind', 'logout', 'logout-all', 'revoke-device', 'delete-account', 'change-phone'].includes(purpose)) reject('auth_request_invalid');
        return transaction(async () => {
            await proof.limit(`session-challenge:${proof.keyedIndex(String(network))}`, 60, 60000);
            const row = await read(sessionId);
            if (row.generation !== generation) reject('auth_session_stale');
            return { ok: true, challenge: await proof.challenge(purpose,
                reference({ sessionId, generation, targetKeyId, newPhone }, purpose), row.key_id) };
        });
    }
    async function renew(input) {
        const outcome = await transaction(async () => {
            const row = await read(input.sessionId);
            await proof.consumeProof(input, 'renew', `${input.sessionId}:${input.generation}`, JSON.parse(row.public_key));
            if (row.generation !== input.generation) {
                await query('run', 'UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?', [now(), row.session_id]);
                await proof.audit('session_reuse_detected', row.principal_id, row.session_id);
                return { ok: false, error: 'auth_session_reused', revoked: [row.session_id] };
            }
            const account = await findById(row.principal_id);
            if (!account) reject('auth_session_invalid');
            row.generation += 1;
            row.idle_expires_ms = Math.min(now() + AUTH_SESSION_IDLE_MS, row.expires_ms);
            await query('run', 'UPDATE auth_device_sessions SET generation = ?, idle_expires_ms = ? WHERE session_id = ?',
                [row.generation, row.idle_expires_ms, row.session_id]);
            await proof.audit('session_refreshed', row.principal_id, row.session_id);
            return result(row, account);
        });
        for (const id of outcome.revoked || []) await disconnectSession(id);
        return outcome;
    }
    async function localBind(input) {
        return transaction(async () => {
            const row = await read(input.sessionId);
            if (input.generation !== row.generation) reject('auth_session_stale');
            await proof.consumeProof(input, 'local-bind', reference(input, 'local-bind'), JSON.parse(row.public_key));
            const account = await findById(row.principal_id);
            if (!account) reject('auth_session_invalid');
            await proof.audit('local_identity_verified', row.principal_id, row.session_id);
            return { ok: true, keyId: row.key_id,
                user: { id: account.user_id, username: account.username, phone: account.phone } };
        });
    }
    async function revoke(input) {
        const ids = await transaction(async () => {
            const row = await read(input.sessionId);
            const purpose = input.action;
            if (!['logout', 'logout-all', 'revoke-device'].includes(purpose)) reject('auth_request_invalid');
            await proof.consumeProof(input, purpose, reference(input, purpose), JSON.parse(row.public_key));
            if (input.generation !== row.generation) reject('auth_session_stale');
            if (purpose !== 'logout' && row.restricted_until_ms > now()) reject('auth_device_cooling_off');
            let selected;
            if (purpose === 'logout') selected = [row];
            else if (purpose === 'logout-all') selected = await query('all', 'SELECT session_id FROM auth_device_sessions WHERE principal_id = ?', [row.principal_id]);
            else {
                const key = await query('get', 'SELECT principal_id FROM auth_device_keys WHERE key_id = ?', [input.targetKeyId]);
                if (key?.principal_id !== row.principal_id) reject();
                await query('run', 'UPDATE auth_device_keys SET revoked_ms = ? WHERE key_id = ?', [now(), input.targetKeyId]);
                selected = await query('all', 'SELECT session_id FROM auth_device_sessions WHERE key_id = ?', [input.targetKeyId]);
            }
            for (const session of selected) await query('run', 'UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?', [now(), session.session_id]);
            await proof.audit(purpose, row.principal_id, row.session_id);
            return selected.map((session) => session.session_id);
        });
        for (const id of ids) await disconnectSession(id);
        return { ok: true };
    }
    async function authorizePhoneChange(input) {
        if (input.confirmed !== true) reject('auth_confirmation_required');
        return transaction(async () => {
            const row = await read(input.sessionId);
            if (input.generation !== row.generation) reject('auth_session_stale');
            if (row.restricted_until_ms > now()) reject('auth_device_cooling_off');
            await proof.consumeProof(input, 'change-phone', reference(input, 'change-phone'), JSON.parse(row.public_key));
            return row;
        });
    }
    async function removeAccount(input) {
        if (input.confirmed !== true || typeof deleteAccount !== 'function') reject('auth_confirmation_required');
        const revoked = await transaction(async () => {
            const row = await read(input.sessionId);
            if (input.generation !== row.generation) reject('auth_session_stale');
            if (row.restricted_until_ms > now()) reject('auth_device_cooling_off');
            await proof.consumeProof(input, 'delete-account', reference(input, 'delete-account'), JSON.parse(row.public_key));
            await deleteAccount(row.principal_id);
            const sessions = await query('all', 'SELECT session_id FROM auth_device_sessions WHERE principal_id = ?', [row.principal_id]);
            await query('run', 'UPDATE auth_device_sessions SET revoked_ms = ? WHERE principal_id = ?', [now(), row.principal_id]);
            await query('run', 'UPDATE auth_device_keys SET revoked_ms = ? WHERE principal_id = ?', [now(), row.principal_id]);
            await proof.audit('account_deleted', row.principal_id, row.session_id);
            return sessions.map(session => session.session_id);
        });
        for (const id of revoked) await disconnectSession(id);
        return { ok: true };
    }
    return { create, read, getChallenge, renew, revoke, localBind, removeAccount, authorizePhoneChange };
}
