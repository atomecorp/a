import { publicDeviceKey, reject, requireHandle } from './auth_link_security.js';
import { normalizeDeviceMeta, resolveDeviceClass } from './auth_devices.js';

// Approve-class purposes and the subject each one is bound to.
const APPROVE_SUBJECTS = {
    // `backup`: the digest of the backup keys carried along, or '-' (#auth_link_security.js backupKeysDigest).
    'pair-approve': (s) => `${s.pairId}:${s.requesterSessionKeyId}:${s.requesterApproveKeyId || '-'}:${s.choice}:${s.backup}`,
    'recovery-code-set': (s) => `${s.verifier}:${s.lookup}:${s.backup}`,
    'recovery-cancel': (s) => s.recoveryId,
    'device-revoke': (s) => s.deviceId,
    'device-class': (s) => `${s.deviceId}:${s.deviceClass}`
};
const subjectOf = (purpose, subject = {}) => {
    const build = APPROVE_SUBJECTS[purpose];
    if (!build) reject('auth_request_invalid');
    const reference = build(subject);
    if (typeof reference !== 'string' || !reference || reference.length > 400 || /undefined/.test(reference)) reject('auth_request_invalid');
    return reference;
};

// Accounts without phone, email or password: an opaque principal, a public
// handle, and per-device keys. Approve-class operations of an existing account
// are authorized here for every owner (pairing, recovery, devices).
export function createAccountAuth({ query, transaction, proof, sessions, devices, handles, approvals, createAccount, notify, disconnectSession, now, billing }) {
    if (typeof billing?.prepareCreation !== 'function') throw new Error('auth_billing_required');
    async function createChallenge({ sessionKey, clientNonce }, network) {
        requireHandle(clientNonce);
        const { keyId } = publicDeviceKey(sessionKey);
        return transaction(async () => {
            await proof.limit(`create-challenge:${proof.keyedIndex(String(network))}`, 30, 3600000);
            if (await devices.byId(keyId)) reject('auth_request_invalid');
            return { ok: true, challenge: await proof.challenge('create-account', `create:${keyId}`, keyId, clientNonce),
                register: await proof.challenge('approve-key-register', `register:${keyId}`, keyId) };
        });
    }
    async function create(input, network) {
        const { keyId, jwk } = publicDeviceKey(input.sessionKey);
        const meta = normalizeDeviceMeta(input.deviceMeta);
        const deviceClass = resolveDeviceClass(meta.platform, input.deviceClass);
        // Store verification is network I/O: it runs before the transaction.
        const purchase = await billing.prepareCreation(input.payment, keyId);
        const created = await transaction(async () => {
            await proof.limit(`account-create:${proof.keyedIndex(String(network))}`, 5, 3600000);
            // A day's bound too: accounts created in series would each get their own contact-request quotas.
            await proof.limit(`account-create-day:${proof.keyedIndex(String(network))}`, 10, 86400000);
            await proof.limit(`account-create-key:${keyId}`, 3, 3600000);
            if (await devices.byId(keyId)) reject('auth_request_invalid');
            await proof.consumeProof(input, 'create-account', `create:${keyId}`, jwk);
            // A shared machine never approves: it creates no approve key.
            const approve = input.approve && deviceClass === 'personal'
                ? await approvals.register(input.approve, 'approve-key-register', `register:${keyId}`, keyId) : null;
            const account = await createAccount();
            const deviceId = devices.newDeviceId();
            await devices.enroll({ keyId, principalId: account.user_id, jwk, deviceId, deviceClass, ...meta, enrolledBy: 'creation',
                connectionProof: input.connectionProof === true });
            if (approve) await devices.enroll({ keyId: approve.keyId, principalId: account.user_id, jwk: approve.jwk, role: 'approve',
                deviceId, assurance: approve.assurance, deviceClass, ...meta, enrolledBy: 'creation',
                credentialId: approve.credentialId, signCount: approve.signCount });
            await proof.audit('account_created', account.user_id, keyId);
            await proof.audit(`payment:${purchase.method}`, account.user_id, keyId);
            const payment = await purchase.record(account.user_id);
            return { ...await sessions.create(account, keyId), newAccount: true, canApprove: approve?.assurance === 'hardware_uv', payment };
        });
        if (created.payment) await purchase.settle();
        return created;
    }
    // A device enrolled before approve keys existed (or whose approve key was
    // lost) adds one, signed by its session key. The other devices are told.
    async function approveKeyAddChallenge({ sessionId, generation }) {
        const row = await sessions.read(sessionId);
        if (row.generation !== generation) reject('auth_session_stale');
        return { ok: true, challenge: await proof.challenge('approve-key-add', `${sessionId}:${generation}`, row.key_id),
            register: await proof.challenge('approve-key-register', `add:${sessionId}:${generation}`, row.key_id) };
    }
    async function approveKeyAdd(input) {
        const result = await transaction(async () => {
            const row = await sessions.read(input.sessionId);
            if (row.generation !== input.generation) reject('auth_session_stale');
            await proof.consumeProof(input, 'approve-key-add', `${input.sessionId}:${input.generation}`, JSON.parse(row.public_key));
            const sessionKey = await devices.byId(row.key_id);
            if (sessionKey.device_class !== 'personal') reject('auth_approve_key_required');
            const approve = await approvals.register(input.approve, 'approve-key-register', `add:${input.sessionId}:${input.generation}`, row.key_id);
            const deviceId = devices.deviceOf(sessionKey);
            if (!sessionKey.device_id) await query('run', 'UPDATE auth_device_keys SET device_id = ? WHERE key_id = ?', [deviceId, sessionKey.key_id]);
            await query('run', `UPDATE auth_device_keys SET revoked_ms = ? WHERE principal_id = ? AND device_id = ?
                AND key_role = 'approve' AND revoked_ms IS NULL`, [now(), row.principal_id, deviceId]);
            await devices.enroll({ keyId: approve.keyId, principalId: row.principal_id, jwk: approve.jwk, role: 'approve', deviceId,
                assurance: approve.assurance, deviceClass: sessionKey.device_class, platform: sessionKey.platform || 'web',
                label: sessionKey.label || '', enrolledBy: 'approve_key_add', restrictedUntil: sessionKey.restricted_until_ms,
                credentialId: approve.credentialId, signCount: approve.signCount });
            await proof.audit('approve_key_added', row.principal_id, approve.keyId);
            return { principalId: row.principal_id, deviceId, canApprove: approve.assurance === 'hardware_uv' };
        });
        await notify(result.principalId, { kind: 'auth-device-updated', deviceId: result.deviceId }, { exceptDeviceId: result.deviceId });
        return { ok: true, canApprove: result.canApprove };
    }
    // Approve-class operations: the session names the device, its approve key
    // proves the user, the purpose and subject bind the proof to one effect.
    async function approvalChallenge({ sessionId, generation, purpose, subject }) {
        const reference = `${sessionId}:${generation}:${subjectOf(purpose, subject)}`;
        return transaction(async () => {
            const row = await sessions.read(sessionId);
            if (row.generation !== generation) reject('auth_session_stale');
            const approve = await devices.requireApprover(await devices.byId(row.key_id), purpose);
            return { ok: true, challenge: await approvals.challenge(approve, purpose, reference), credentialId: approve.credential_id || null };
        });
    }
    // Runs inside the caller's transaction.
    async function authorize({ sessionId, generation, approval }, purpose, subject) {
        const row = await sessions.read(sessionId);
        if (row.generation !== generation) reject('auth_session_stale');
        const sessionKey = await devices.byId(row.key_id);
        const approve = await devices.requireApprover(sessionKey, purpose);
        await approvals.consume(approval, purpose, `${sessionId}:${generation}:${subjectOf(purpose, subject)}`, approve);
        return { session: row, sessionKey, approve, deviceId: devices.deviceOf(sessionKey) };
    }
    async function listDevices({ principalId, keyId }) {
        const current = await devices.byId(keyId);
        const list = await devices.list(principalId);
        return { ok: true, devices: list.map((device) => ({ ...device, current: device.deviceId === devices.deviceOf(current) })) };
    }
    async function renameDevice({ principalId, deviceId, label }) {
        const value = normalizeDeviceMeta({ label }).label;
        const changed = await query('run', 'UPDATE auth_device_keys SET label = ? WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL',
            [value, principalId, deviceId, deviceId]);
        if (!Number(changed.changes)) reject('auth_request_invalid');
        return { ok: true };
    }
    async function revokeDevice(input) {
        const outcome = await transaction(async () => {
            const { session, deviceId } = await authorize(input, 'device-revoke', { deviceId: input.deviceId });
            if (input.deviceId === deviceId) reject('auth_request_invalid');
            const revoked = await devices.revokeDevice(session.principal_id, input.deviceId);
            await proof.audit('device_revoked', session.principal_id, input.deviceId);
            return { principalId: session.principal_id, revoked };
        });
        for (const id of outcome.revoked) await disconnectSession(id);
        await notify(outcome.principalId, { kind: 'auth-device-revoked', deviceId: input.deviceId });
        return { ok: true };
    }
    async function setDeviceClass(input) {
        if (!['personal', 'shared'].includes(input.deviceClass)) reject('auth_request_invalid');
        const principalId = await transaction(async () => {
            const { session } = await authorize(input, 'device-class', { deviceId: input.deviceId, deviceClass: input.deviceClass });
            const target = await query('get', `SELECT platform FROM auth_device_keys WHERE principal_id = ? AND (device_id = ? OR key_id = ?)
                AND revoked_ms IS NULL LIMIT 1`, [session.principal_id, input.deviceId, input.deviceId]);
            if (!target) reject('auth_request_invalid');
            resolveDeviceClass(target.platform || 'web', input.deviceClass);
            await query('run', 'UPDATE auth_device_keys SET device_class = ? WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL',
                [input.deviceClass, session.principal_id, input.deviceId, input.deviceId]);
            await proof.audit(`device_class:${input.deviceClass}`, session.principal_id, input.deviceId);
            return session.principal_id;
        });
        await notify(principalId, { kind: 'auth-device-updated', deviceId: input.deviceId });
        return { ok: true };
    }
    return { createChallenge, create, approveKeyAddChallenge, approveKeyAdd, approvalChallenge, authorize,
        listDevices, renameDevice, revokeDevice, setDeviceClass, handleOf: handles.of };
}
