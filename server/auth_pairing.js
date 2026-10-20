import crypto from 'node:crypto';
import { publicDeviceKey, randomHandle, reject, requireHandle } from './auth_link_security.js';
import { normalizeDeviceMeta, resolveDeviceClass, PROBATION_MS } from './auth_devices.js';

export const PAIR_TTL_MS = 10 * 60 * 1000;
const CLAIM_FAILURES = 5;

const matchChoices = (match) => {
    const values = new Set([match]);
    while (values.size < 3) values.add(10 + crypto.randomInt(90));
    const list = [...values];
    for (let index = list.length - 1; index > 0; index -= 1) {
        const other = crypto.randomInt(index + 1);
        [list[index], list[other]] = [list[other], list[index]];
    }
    return list;
};

// A new device asks an enrolled one to open the same space. The requester shows
// a 6-digit request code and a 2-digit match number; the approver picks that
// number among three and proves its user with its approve key.
export function createPairing({ query, transaction, proof, sessions, devices, handles, approvals, accounts, findById, notify, disconnectSession, now }) {
    const codeHash = (code) => proof.keyedIndex(`pair-code:${code}`);
    const read = async (pairId) => {
        requireHandle(pairId);
        const row = await query('get', 'SELECT * FROM auth_pair_requests WHERE request_id = ?', [pairId]);
        if (!row) reject('auth_pair_unknown');
        if (row.expires_ms <= now() && ['pending', 'approved'].includes(row.state)) reject('auth_attempt_expired');
        return row;
    };
    const describe = (row) => ({ pairId: row.request_id, kind: row.kind, ...JSON.parse(row.device_meta),
        deviceClass: row.device_class, createdAt: row.created_ms, expiresAt: row.expires_ms, choices: JSON.parse(row.choices) });
    async function startChallenge({ sessionKey }, network) {
        const { keyId } = publicDeviceKey(sessionKey);
        await proof.limit(`pair-challenge:${proof.keyedIndex(String(network))}`, 30, 600000);
        if (await devices.byId(keyId)) reject('auth_request_invalid');
        return { ok: true, register: await proof.challenge('approve-key-register', `pair:${keyId}`, keyId) };
    }
    async function start(input, network) {
        const { keyId, jwk } = publicDeviceKey(input.sessionKey);
        const meta = normalizeDeviceMeta(input.deviceMeta);
        const deviceClass = resolveDeviceClass(meta.platform, input.deviceClass);
        await proof.cleanup();
        const outcome = await transaction(async () => {
            await proof.limit(`pair-start:${proof.keyedIndex(String(network))}`, 10, 600000);
            await proof.limit(`pair-start-key:${keyId}`, 5, 600000);
            if (await devices.byId(keyId)) reject('auth_request_invalid');
            const approve = input.approve && deviceClass === 'personal'
                ? await approvals.register(input.approve, 'approve-key-register', `pair:${keyId}`, keyId) : null;
            // Uniform answer whether the handle or phone exists or not; one pending request per account.
            if (input.handle && input.phone) reject('auth_request_invalid');
            const target = input.handle ? await handles.resolve(input.handle) : input.phone ? await handles.resolvePhone(input.phone) : null;
            if (input.handle) await proof.limit(`pair-handle:${proof.keyedIndex(String(input.handle).toLowerCase())}`, 3, 600000);
            if (input.phone) await proof.limit(`pair-phone:${proof.keyedIndex(String(input.phone))}`, 3, 600000);
            if (target) await query('run', `UPDATE auth_pair_requests SET state = 'cancelled'
                WHERE target_principal = ? AND kind = 'enroll' AND state IN ('pending', 'approved')`, [target]);
            let code;
            for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
                const candidate = String(crypto.randomInt(1000000)).padStart(6, '0');
                const taken = await query('get', `SELECT 1 FROM auth_pair_requests WHERE code_hash = ? AND state IN ('pending', 'approved')`, [codeHash(candidate)]);
                if (!taken) code = candidate;
            }
            if (!code) reject('auth_rate_limited');
            const match = 10 + crypto.randomInt(90);
            const row = { request_id: randomHandle(), requester_device_id: devices.newDeviceId(), expires_ms: now() + PAIR_TTL_MS };
            await query('run', `INSERT INTO auth_pair_requests (request_id, kind, requester_device_id, requester_session_key,
                requester_approve_key, device_meta, device_class, code_hash, match_number, choices, target_principal, state,
                approved_by, created_ms, expires_ms, failed_attempts) VALUES (?, 'enroll', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, 0)`,
            [row.request_id, row.requester_device_id, JSON.stringify({ keyId, jwk, connectionProof: input.connectionProof === true }), approve ? JSON.stringify(approve) : null,
                JSON.stringify(meta), deviceClass, codeHash(code), match, JSON.stringify(matchChoices(match)), target, now(), row.expires_ms]);
            await proof.audit('pair_started', target, row.request_id);
            return { ...row, code, match, target };
        });
        if (outcome.target) await notify(outcome.target, { kind: 'auth-pair-request', pairId: outcome.request_id }, { personalOnly: true });
        return { ok: true, pairId: outcome.request_id, code: outcome.code, matchNumber: outcome.match, expiresAt: outcome.expires_ms };
    }
    // A shared device reopens an account it holds a key for: its owner approves each opening.
    const sharedKey = async (sessionKey) => {
        const { keyId } = publicDeviceKey(sessionKey);
        const key = await devices.byId(keyId);
        if (!key || key.revoked_ms !== null || key.key_role !== 'session' || key.device_class !== 'shared') reject('auth_request_invalid');
        return key;
    };
    async function sharedOpenChallenge({ sessionKey }, network) {
        await proof.limit(`shared-open-challenge:${proof.keyedIndex(String(network))}`, 30, 600000);
        const key = await sharedKey(sessionKey);
        return { ok: true, challenge: await proof.challenge('shared-open', `shared:${key.key_id}`, key.key_id) };
    }
    async function sharedOpenStart(input, network) {
        const outcome = await transaction(async () => {
            const key = await sharedKey(input.sessionKey);
            await proof.limit(`shared-open:${key.key_id}`, 5, 600000);
            await proof.consumeProof(input, 'shared-open', `shared:${key.key_id}`, JSON.parse(key.public_key));
            await query('run', `UPDATE auth_pair_requests SET state = 'cancelled' WHERE requester_device_id = ? AND kind = 'shared_open'
                AND state IN ('pending', 'approved')`, [devices.deviceOf(key)]);
            let code;
            for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
                const candidate = String(crypto.randomInt(1000000)).padStart(6, '0');
                if (!await query('get', `SELECT 1 FROM auth_pair_requests WHERE code_hash = ? AND state IN ('pending', 'approved')`, [codeHash(candidate)])) code = candidate;
            }
            if (!code) reject('auth_rate_limited');
            const match = 10 + crypto.randomInt(90);
            const row = { request_id: randomHandle(), expires_ms: now() + PAIR_TTL_MS };
            await query('run', `INSERT INTO auth_pair_requests (request_id, kind, requester_device_id, requester_session_key,
                requester_approve_key, device_meta, device_class, code_hash, match_number, choices, target_principal, state,
                approved_by, created_ms, expires_ms, failed_attempts) VALUES (?, 'shared_open', ?, ?, NULL, ?, 'shared', ?, ?, ?, ?, 'pending', NULL, ?, ?, 0)`,
            [row.request_id, devices.deviceOf(key), JSON.stringify({ keyId: key.key_id, jwk: JSON.parse(key.public_key) }),
                JSON.stringify({ platform: key.platform || 'web', label: key.label || '' }), codeHash(code), match,
                JSON.stringify(matchChoices(match)), key.principal_id, now(), row.expires_ms]);
            await proof.audit('shared_open_started', key.principal_id, row.request_id);
            return { ...row, code, match, principalId: key.principal_id };
        });
        await notify(outcome.principalId, { kind: 'auth-pair-request', pairId: outcome.request_id }, { personalOnly: true });
        return { ok: true, pairId: outcome.request_id, code: outcome.code, matchNumber: outcome.match, expiresAt: outcome.expires_ms };
    }
    // An enrolled device types or dictates the request code shown on the new one.
    async function claim({ code }, claims) {
        const value = String(code || '').replace(/\D/g, '');
        // A failed guess is committed on its own: a refusal must not roll it back.
        const outcome = await transaction(async () => {
            const bucket = `pair-claim:${claims.sid}`;
            const failures = await query('get', 'SELECT count FROM auth_send_limits WHERE bucket = ? AND reset_ms > ?', [bucket, now()]);
            if (failures?.count >= CLAIM_FAILURES) return { error: 'auth_pairing_locked' };
            const row = /^\d{6}$/.test(value) ? await query('get', `SELECT * FROM auth_pair_requests WHERE code_hash = ?
                AND state = 'pending' AND expires_ms > ?`, [codeHash(value), now()]) : null;
            if (!row || (row.target_principal && row.target_principal !== claims.sub)) {
                await query('run', `INSERT INTO auth_send_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET
                    count = CASE WHEN reset_ms <= ? THEN 1 ELSE count + 1 END,
                    reset_ms = CASE WHEN reset_ms <= ? THEN excluded.reset_ms ELSE reset_ms END`,
                [bucket, now() + PAIR_TTL_MS, now(), now()]);
                await proof.audit('pair_claim_failed', claims.sub, null);
                return { error: 'auth_pairing_invalid' };
            }
            if (!row.target_principal) await query('run', `UPDATE auth_pair_requests SET target_principal = ?
                WHERE request_id = ? AND target_principal IS NULL`, [claims.sub, row.request_id]);
            return { request: describe(row) };
        });
        if (outcome.error) reject(outcome.error);
        return { ok: true, request: outcome.request };
    }
    // Requests still waiting for this account: a device that was asleep when the
    // notice went out (live sockets only) finds them when it comes back.
    async function pending(_input, claims) {
        const rows = await query('all', `SELECT * FROM auth_pair_requests WHERE target_principal = ? AND state = 'pending'
            AND expires_ms > ? ORDER BY created_ms DESC LIMIT 5`, [claims.sub, now()]);
        return { ok: true, requests: rows.map(describe) };
    }
    async function view({ pairId }, claims) {
        const row = await read(pairId);
        if (row.target_principal !== claims.sub || row.state !== 'pending') reject('auth_pair_unknown');
        return { ok: true, request: describe(row) };
    }
    const subjectFor = (row, choice) => ({ pairId: row.request_id, requesterSessionKeyId: JSON.parse(row.requester_session_key).keyId,
        requesterApproveKeyId: row.requester_approve_key ? JSON.parse(row.requester_approve_key).keyId : null, choice });
    async function approveChallenge(input) {
        const row = await read(input.pairId);
        const session = await sessions.read(input.sessionId);
        if (row.state !== 'pending' || row.target_principal !== session.principal_id) reject('auth_pair_unknown');
        return accounts.approvalChallenge({ ...input, purpose: 'pair-approve', subject: subjectFor(row, Number(input.choice)) });
    }
    async function approve(input) {
        const choice = Number(input.choice);
        const outcome = await transaction(async () => {
            const row = await read(input.pairId);
            const { session, deviceId } = await accounts.authorize(input, 'pair-approve', subjectFor(row, choice));
            if (row.state !== 'pending' || row.target_principal !== session.principal_id) reject('auth_pair_unknown');
            if (choice !== row.match_number) {
                await query('run', "UPDATE auth_pair_requests SET state = 'rejected' WHERE request_id = ?", [row.request_id]);
                await proof.audit('pair_wrong_number', session.principal_id, row.request_id);
                return { principalId: session.principal_id, rejected: true, pairId: row.request_id };
            }
            await query('run', "UPDATE auth_pair_requests SET state = 'approved', approved_by = ? WHERE request_id = ? AND state = 'pending'",
                [deviceId, row.request_id]);
            await proof.audit('pair_approved', session.principal_id, row.request_id);
            return { principalId: session.principal_id, pairId: row.request_id };
        });
        if (outcome.rejected) {
            await notify(outcome.principalId, { kind: 'auth-pair-rejected', pairId: outcome.pairId });
            return { ok: true, rejected: true, approved: false, pairId: outcome.pairId };
        }
        return { ok: true, approved: true, pairId: outcome.pairId };
    }
    const requesterKey = (row) => JSON.parse(row.requester_session_key);
    async function requesterChallenge({ pairId, purpose }) {
        if (!['pair-complete', 'pair-cancel', 'pair-resume'].includes(purpose)) reject('auth_request_invalid');
        const row = await read(pairId);
        const { keyId } = requesterKey(row);
        return { ok: true, challenge: await proof.challenge(purpose, pairId, keyId) };
    }
    // The waiting device asks where its request stands (after a lost socket).
    async function status(input) {
        return transaction(async () => {
            const row = await read(input.pairId);
            await proof.consumeProof(input, 'pair-resume', row.request_id, requesterKey(row).jwk);
            return { ok: true, state: row.state, expiresAt: row.expires_ms };
        });
    }
    async function complete(input) {
        const outcome = await transaction(async () => {
            const row = await read(input.pairId);
            const { keyId, jwk, connectionProof } = requesterKey(row);
            await proof.consumeProof(input, 'pair-complete', row.request_id, jwk);
            if (row.state !== 'approved' || !row.target_principal) reject('auth_pair_not_approved');
            const account = await findById(row.target_principal);
            if (!account) reject('auth_session_invalid');
            if (row.kind === 'shared_open') {
                // An approved opening of a shared device: a short session, no new key.
                const key = await devices.byId(keyId);
                if (!key || key.revoked_ms !== null || key.principal_id !== account.user_id) reject('auth_session_invalid');
                await query('run', "UPDATE auth_pair_requests SET state = 'completed' WHERE request_id = ? AND state = 'approved'", [row.request_id]);
                await proof.audit('shared_open_completed', account.user_id, keyId);
                return { account, keyId, shared: true };
            }
            const meta = JSON.parse(row.device_meta);
            const restrictedUntil = now() + PROBATION_MS;
            const enrolledBy = row.approved_by;
            await devices.enroll({ keyId, principalId: account.user_id, jwk, deviceId: row.requester_device_id,
                deviceClass: row.device_class, ...meta, enrolledBy, restrictedUntil, connectionProof: connectionProof === true });
            const approve = row.requester_approve_key ? JSON.parse(row.requester_approve_key) : null;
            if (approve) await devices.enroll({ keyId: approve.keyId, principalId: account.user_id, jwk: approve.jwk, role: 'approve',
                deviceId: row.requester_device_id, assurance: approve.assurance, deviceClass: row.device_class, ...meta, enrolledBy,
                restrictedUntil, credentialId: approve.credentialId, signCount: approve.signCount });
            await query('run', "UPDATE auth_pair_requests SET state = 'completed' WHERE request_id = ? AND state = 'approved'", [row.request_id]);
            await proof.audit('device_enrolled', account.user_id, keyId);
            return { account, keyId, deviceId: row.requester_device_id, label: meta.label, platform: meta.platform,
                canApprove: approve?.assurance === 'hardware_uv' };
        });
        const session = await sessions.create(outcome.account, outcome.keyId);
        if (outcome.shared) return { ...session, canApprove: false };
        await notify(outcome.account.user_id, { kind: 'auth-device-added', deviceId: outcome.deviceId,
            label: outcome.label, platform: outcome.platform }, { exceptDeviceId: outcome.deviceId });
        return { ...session, canApprove: outcome.canApprove, probationUntil: now() + PROBATION_MS };
    }
    async function cancel(input, claims = null) {
        const principalId = await transaction(async () => {
            const row = await read(input.pairId);
            // The requester withdraws with its key; any device of the targeted account may refuse.
            if (!claims?.sub || row.target_principal !== claims.sub) await proof.consumeProof(input, 'pair-cancel', row.request_id, requesterKey(row).jwk);
            await query('run', `UPDATE auth_pair_requests SET state = 'cancelled' WHERE request_id = ?
                AND state IN ('pending', 'approved')`, [row.request_id]);
            await proof.audit('pair_cancelled', row.target_principal, row.request_id);
            return row.target_principal;
        });
        if (principalId) await notify(principalId, { kind: 'auth-pair-cancelled', pairId: input.pairId });
        return { ok: true };
    }
    // "Not my account": the new device withdraws its own keys at once, probation or not.
    async function notMine(input) {
        const outcome = await transaction(async () => {
            const row = await sessions.read(input.sessionId);
            if (row.generation !== input.generation) reject('auth_session_stale');
            await proof.consumeProof(input, 'not-my-account', `${input.sessionId}:${input.generation}`, JSON.parse(row.public_key));
            const key = await devices.byId(row.key_id);
            const deviceId = devices.deviceOf(key);
            const revoked = await devices.revokeDevice(row.principal_id, deviceId);
            await proof.audit('device_not_mine', row.principal_id, deviceId);
            return { principalId: row.principal_id, deviceId, revoked };
        });
        for (const id of outcome.revoked) await disconnectSession(id);
        await notify(outcome.principalId, { kind: 'auth-device-revoked', deviceId: outcome.deviceId, reason: 'not_my_account' });
        return { ok: true };
    }
    return { startChallenge, start, sharedOpenChallenge, sharedOpenStart, claim, pending, view, approveChallenge, approve, requesterChallenge, status, complete, cancel, notMine, read };
}
