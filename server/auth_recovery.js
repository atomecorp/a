import crypto from 'node:crypto';
import { publicDeviceKey, randomHandle, reject, requireHandle } from './auth_link_security.js';
import { normalizeDeviceMeta, PROBATION_MS } from './auth_devices.js';
import { recoveryVerifierInput } from '../atome/src/shared/auth_recovery_code.js';

export const RECOVERY_CODE_DELAY_MS = 60 * 60 * 1000;
export const RECOVERY_PHONE_DELAY_MS = 72 * 60 * 60 * 1000;
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Same domain-separated verifier on the client (creation) and the server (use).
export const recoveryVerifier = (principalId, code) => crypto.createHash('sha256')
    .update(recoveryVerifierInput(principalId, code)).digest('hex');

// Opens a delayed request; used by the recovery code and by the SMS link of a
// phone account, which never enrolls a device directly any more.
export async function openRecoveryRequest({ query, proof, now }, principalId, { channel, sessionKey, approve = null, deviceMeta, delay }) {
    const request = { request_id: randomHandle(), not_before_ms: now() + delay };
    await query('run', `UPDATE auth_recovery_requests SET state = 'cancelled' WHERE principal_id = ? AND state = 'pending'
        AND requester_session_key = ?`, [principalId, JSON.stringify(sessionKey)]);
    await query('run', `INSERT INTO auth_recovery_requests (request_id, principal_id, channel, requester_device_id, requester_session_key,
        requester_approve_key, device_meta, state, not_before_ms, expires_ms, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [request.request_id, principalId, channel, randomHandle(), JSON.stringify(sessionKey), approve ? JSON.stringify(approve) : null,
        JSON.stringify(normalizeDeviceMeta(deviceMeta)), request.not_before_ms, request.not_before_ms + RECOVERY_WINDOW_MS, now()]);
    await proof.audit(`recovery_started:${channel}`, principalId, request.request_id);
    return request;
}

// Losing every device: a recovery code (or, for phone accounts, the SMS link)
// opens a delayed request that any still-enrolled device can cancel. Completing
// it enrolls this device alone and revokes every other key and session.
export function createRecovery({ query, transaction, proof, sessions, devices, handles, approvals, accounts, findById, notify, disconnectSession, now }) {
    async function setCode(input) {
        if (typeof input.verifier !== 'string' || !/^[a-f0-9]{64}$/.test(input.verifier)) reject('auth_request_invalid');
        const principalId = await transaction(async () => {
            const { session } = await accounts.authorize(input, 'recovery-code-set', { verifier: input.verifier });
            await query('run', `INSERT INTO auth_recovery_codes (principal_id, verifier, created_ms) VALUES (?, ?, ?)
                ON CONFLICT(principal_id) DO UPDATE SET verifier = excluded.verifier, created_ms = excluded.created_ms`,
            [session.principal_id, input.verifier, now()]);
            await proof.audit('recovery_code_set', session.principal_id, null);
            return session.principal_id;
        });
        await notify(principalId, { kind: 'auth-recovery-code-set' });
        return { ok: true };
    }
    const hasCode = async (principalId) => !!await query('get', 'SELECT 1 FROM auth_recovery_codes WHERE principal_id = ?', [principalId]);
    async function startChallenge({ sessionKey }, network) {
        const { keyId } = publicDeviceKey(sessionKey);
        await proof.limit(`recovery-challenge:${proof.keyedIndex(String(network))}`, 30, 3600000);
        return { ok: true, register: await proof.challenge('approve-key-register', `recovery:${keyId}`, keyId) };
    }
    const open = (principalId, options) => openRecoveryRequest({ query, proof, now }, principalId, options);
    async function start(input, network) {
        const { keyId, jwk } = publicDeviceKey(input.sessionKey);
        if (input.handle && input.phone) reject('auth_request_invalid');
        // The account is named by its handle or its verified phone number.
        const address = input.phone ? `phone:${String(input.phone)}` : String(input.handle || '').trim().toLowerCase();
        // Identical shape and work for an unknown handle or number and a wrong code.
        const outcome = await transaction(async () => {
            await proof.limit(`recovery-network:${proof.keyedIndex(String(network))}`, 20, 86400000);
            await proof.limit(`recovery-handle:${proof.keyedIndex(address)}`, 10, 86400000);
            const principalId = input.phone ? await handles.resolvePhone(input.phone) : await handles.resolve(address);
            const stored = principalId ? await query('get', 'SELECT verifier FROM auth_recovery_codes WHERE principal_id = ?', [principalId]) : null;
            const candidate = recoveryVerifier(principalId || randomHandle(), input.code);
            const valid = !!stored && crypto.timingSafeEqual(Buffer.from(stored.verifier, 'hex'), Buffer.from(candidate, 'hex'));
            if (!valid) {
                await proof.audit('recovery_code_failed', principalId, null);
                return { request: { request_id: randomHandle(), not_before_ms: now() + RECOVERY_CODE_DELAY_MS } };
            }
            const approve = input.approve ? await approvals.register(input.approve, 'approve-key-register', `recovery:${keyId}`, keyId) : null;
            const request = await open(principalId, { channel: 'recovery_code', sessionKey: { keyId, jwk, connectionProof: input.connectionProof === true }, approve,
                deviceMeta: input.deviceMeta, delay: RECOVERY_CODE_DELAY_MS });
            return { request, principalId };
        });
        if (outcome.principalId) await notify(outcome.principalId, { kind: 'auth-recovery-started', recoveryId: outcome.request.request_id,
            notBefore: outcome.request.not_before_ms });
        return { ok: true, recoveryId: outcome.request.request_id, notBefore: outcome.request.not_before_ms };
    }
    async function cancel(input) {
        const principalId = await transaction(async () => {
            const { session } = await accounts.authorize(input, 'recovery-cancel', { recoveryId: input.recoveryId });
            const changed = await query('run', `UPDATE auth_recovery_requests SET state = 'cancelled' WHERE request_id = ?
                AND principal_id = ? AND state = 'pending'`, [input.recoveryId, session.principal_id]);
            if (!Number(changed.changes)) reject('auth_request_invalid');
            await proof.audit('recovery_cancelled', session.principal_id, input.recoveryId);
            return session.principal_id;
        });
        await notify(principalId, { kind: 'auth-recovery-cancelled', recoveryId: input.recoveryId });
        return { ok: true };
    }
    // The waiting device signs every step with the session key it announced.
    async function requesterChallenge({ recoveryId, sessionKey, purpose }) {
        if (!['recovery-complete', 'recovery-status'].includes(purpose)) reject('auth_request_invalid');
        requireHandle(recoveryId);
        const { keyId } = publicDeviceKey(sessionKey);
        return { ok: true, challenge: await proof.challenge(purpose, recoveryId, keyId) };
    }
    const readOwn = async (input, purpose, jwkOf) => {
        const row = await query('get', 'SELECT * FROM auth_recovery_requests WHERE request_id = ?', [input.recoveryId]);
        const key = row ? JSON.parse(row.requester_session_key) : publicDeviceKey(input.sessionKey);
        await proof.consumeProof(input, purpose, input.recoveryId, jwkOf(key));
        if (!row) reject('auth_recovery_unavailable');
        return row;
    };
    async function status(input) {
        const row = await transaction(() => readOwn(input, 'recovery-status', (key) => key.jwk));
        return { ok: true, state: row.state, notBefore: row.not_before_ms };
    }
    async function complete(input) {
        const outcome = await transaction(async () => {
            const row = await readOwn(input, 'recovery-complete', (key) => key.jwk);
            if (row.state !== 'pending' || row.expires_ms <= now()) reject('auth_recovery_unavailable');
            if (row.not_before_ms > now()) reject('auth_recovery_not_ready');
            const account = await findById(row.principal_id);
            if (!account) reject('auth_recovery_unavailable');
            const revoked = [];
            for (const key of await query('all', 'SELECT DISTINCT coalesce(device_id, key_id) AS device FROM auth_device_keys WHERE principal_id = ? AND revoked_ms IS NULL', [row.principal_id])) {
                revoked.push(...await devices.revokeDevice(row.principal_id, key.device));
            }
            const { keyId, jwk, connectionProof } = JSON.parse(row.requester_session_key);
            const meta = JSON.parse(row.device_meta);
            const restrictedUntil = now() + PROBATION_MS;
            // The client says whether it proves its key on each connection (never the native shells yet).
            await devices.enroll({ keyId, principalId: row.principal_id, jwk, deviceId: row.requester_device_id, ...meta,
                enrolledBy: row.channel, restrictedUntil, connectionProof: connectionProof === true });
            const approve = row.requester_approve_key ? JSON.parse(row.requester_approve_key) : null;
            if (approve) await devices.enroll({ keyId: approve.keyId, principalId: row.principal_id, jwk: approve.jwk, role: 'approve',
                deviceId: row.requester_device_id, assurance: approve.assurance, ...meta, enrolledBy: row.channel, restrictedUntil,
                credentialId: approve.credentialId, signCount: approve.signCount });
            if (row.channel === 'recovery_code') await query('run', 'DELETE FROM auth_recovery_codes WHERE principal_id = ?', [row.principal_id]);
            await query('run', "UPDATE auth_recovery_requests SET state = 'completed' WHERE request_id = ?", [row.request_id]);
            await query('run', `UPDATE auth_recovery_requests SET state = 'cancelled' WHERE principal_id = ? AND state = 'pending'`, [row.principal_id]);
            await proof.audit('recovery_completed', row.principal_id, row.request_id);
            return { account, keyId, revoked, canApprove: approve?.assurance === 'hardware_uv' };
        });
        for (const id of outcome.revoked) await disconnectSession(id);
        const session = await sessions.create(outcome.account, outcome.keyId);
        // The code is consumed: the user is asked to create a new one right away.
        return { ...session, canApprove: outcome.canApprove, recoveryCodeRequired: true, probationUntil: now() + PROBATION_MS };
    }
    return { setCode, hasCode, startChallenge, open, start, cancel, requesterChallenge, status, complete };
}
