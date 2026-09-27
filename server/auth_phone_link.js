import { AUTH_LINK_ORIGIN, AUTH_LINK_TTL_MS } from '../atome/src/shared/auth_link_contract.js';
import { createAuthProofSecurity, publicDeviceKey, randomHandle, digest, reject, requireHandle } from './auth_link_security.js';
import { createDeviceSessions } from './auth_sessions.js';

// The injected persistence and account functions are the existing server owners.
// SMS I/O is outside transactions; proofs and identity changes are atomic.
export function createPhoneLinkAuth({ query, transaction, findByPhone, findById, createAccount,
    sendLink, masterSecret, issueAccess, disconnectSession, deleteAccount, replacePhone, now = Date.now, dailyLimit = 20 }) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1) reject('auth_budget_invalid');
    const proof = createAuthProofSecurity({ query, transaction, masterSecret, now });
    const sessions = createDeviceSessions({ query, transaction, proof, now, issueAccess, findById, disconnectSession, deleteAccount });
    const attempt = async (id) => {
        requireHandle(id);
        const value = await query('get', 'SELECT * FROM auth_link_attempts WHERE attempt_id = ?', [id]);
        if (!value || value.expires_ms <= now() || ['blocked', 'consumed', 'cancelled'].includes(value.state)) reject();
        return value;
    };
    async function start({ phone, publicKey, clientNonce }, network, phoneChange = null) {
        if (typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone)) reject('auth_phone_e164_required');
        requireHandle(clientNonce);
        const { keyId, jwk } = publicDeviceKey(publicKey);
        if (typeof network !== 'string' || !network) reject('auth_network_identity_required');
        const phoneIndex = proof.keyedIndex(phone);
        await proof.cleanup();
        const id = randomHandle();
        const token = randomHandle();
        // Commit counters even when delivery fails. An ambiguous timeout consumes budget.
        await transaction(async () => {
            await proof.limit(`phone-minute:${phoneIndex}`, 1, 60000);
            await proof.limit(`phone-hour:${phoneIndex}`, 5, 3600000);
            await proof.limit(`device:${keyId}`, 10, 3600000);
            await proof.limit(`network:${proof.keyedIndex(network)}`, 20, 3600000);
            await proof.limit('sms-daily', dailyLimit, 86400000);
            const account = await findByPhone(phone);
            if (phoneChange && (account || typeof replacePhone !== 'function')) reject();
            const registered = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
            if (registered && (registered.revoked_ms !== null || registered.principal_id !== (phoneChange?.principal_id || account?.user_id))) reject();
            // Only a new attempt from the same device supersedes its predecessor.
            await query('run', `UPDATE auth_link_attempts SET state = 'cancelled'
                WHERE phone_index = ? AND key_id = ? AND state IN ('created', 'sent')`, [phoneIndex, keyId]);
            await query('run', `INSERT INTO auth_link_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, NULL)`,
                [id, proof.sealPhone(phone), phoneIndex, account?.user_id || null, keyId,
                    JSON.stringify(jwk), clientNonce, digest(token), now(), now() + AUTH_LINK_TTL_MS]);
            if (phoneChange) await query('run', 'INSERT INTO auth_phone_changes VALUES (?, ?, ?)', [id, phoneChange.principal_id, phoneChange.session_id]);
            await proof.audit('authentication_started', account?.user_id || null, id);
        });
        try {
            await sendLink(phone, `${AUTH_LINK_ORIGIN}/auth/v/${id}#t=${token}`);
            await transaction(async () => {
                await query('run', "UPDATE auth_link_attempts SET state = 'sent' WHERE attempt_id = ? AND state = 'created'", [id]);
                await proof.audit('sms_provider_accepted', null, id);
            });
        } catch {
            await transaction(async () => {
                await query('run', "UPDATE auth_link_attempts SET state = 'blocked' WHERE attempt_id = ?", [id]);
                await proof.audit('sms_delivery_failed', null, id);
            });
            reject('sms_delivery_unavailable');
        }
        return { ok: true, attemptId: id, expiresAt: now() + AUTH_LINK_TTL_MS };
    }
    async function getChallenge({ attemptId, keyId, purpose }, network) {
        if (!['consume', 'approve', 'resume', 'cancel'].includes(purpose)) reject('auth_request_invalid');
        return transaction(async () => {
            await proof.limit(`challenge:${proof.keyedIndex(String(network))}`, 60, 60000);
            const value = await attempt(attemptId);
            if (purpose === 'approve') {
                const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
                if (!device || device.revoked_ms !== null || device.principal_id !== value.candidate_id
                    || device.restricted_until_ms > now()) reject('auth_trusted_phone_required');
            } else if (value.key_id !== keyId) reject();
            return { ok: true, challenge: await proof.challenge(purpose, attemptId, keyId, value.client_nonce) };
        });
    }
    async function complete(input) {
        const outcome = await transaction(async () => {
            const value = await attempt(input.attemptId);
            if (!['sent', 'approved'].includes(value.state)) reject();
            const purpose = input.action === 'resume' ? 'resume' : 'consume';
            await proof.consumeProof(input, purpose, input.attemptId, JSON.parse(value.public_key));
            if (purpose === 'consume') {
                requireHandle(input.token);
                if (digest(input.token) !== value.token_hash) reject();
            } else if (value.state !== 'approved') return { ok: true, pending: true };
            const phone = proof.openPhone(value.phone_sealed);
            const existing = await findByPhone(phone);
            // A replaced binding or a concurrent account creation invalidates stale attempts.
            if ((existing?.user_id || null) !== value.candidate_id) reject();
            const changing = await query('get', 'SELECT * FROM auth_phone_changes WHERE attempt_id = ?', [input.attemptId]);
            let account;
            if (changing) {
                const initiating = await sessions.read(changing.session_id);
                if (initiating.principal_id !== changing.principal_id || initiating.key_id !== value.key_id) reject();
                if (initiating.restricted_until_ms > now()) reject('auth_device_cooling_off');
                if (existing || typeof replacePhone !== 'function') reject();
                await replacePhone(changing.principal_id, phone);
                account = await findById(changing.principal_id);
                if (!account || account.phone !== phone) reject();
                await proof.audit('phone_changed', account.user_id, input.attemptId);
            } else account = existing || await createAccount(phone);
            const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [value.key_id]);
            if (device && (device.revoked_ms !== null || device.principal_id !== account.user_id)) reject();
            if (!device) {
                await query('run', 'INSERT INTO auth_device_keys VALUES (?, ?, ?, ?, ?, NULL)',
                    [value.key_id, account.user_id, value.public_key, now(), existing ? now() + 86400000 : now()]);
                await proof.audit('device_enrolled', account.user_id, value.key_id);
            }
            const changed = await query('run', `UPDATE auth_link_attempts SET state = 'consumed'
                WHERE attempt_id = ? AND state IN ('sent', 'approved')`, [input.attemptId]);
            if (Number(changed.changes) !== 1) reject();
            return sessions.create(account, value.key_id);
        });
        return outcome;
    }
    async function approve(input) {
        return transaction(async () => {
            const value = await attempt(input.attemptId);
            if (value.state !== 'sent') reject();
            requireHandle(input.token);
            if (digest(input.token) !== value.token_hash) reject();
            const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [input.keyId]);
            if (!device || device.principal_id !== value.candidate_id || device.revoked_ms !== null
                || device.restricted_until_ms > now()) reject('auth_trusted_phone_required');
            if ((await findByPhone(proof.openPhone(value.phone_sealed)))?.user_id !== value.candidate_id) reject();
            await proof.consumeProof(input, 'approve', input.attemptId, JSON.parse(device.public_key));
            await query('run', "UPDATE auth_link_attempts SET state = 'approved', approved_by = ? WHERE attempt_id = ?",
                [device.key_id, input.attemptId]);
            await proof.audit('phone_proof_received', device.principal_id, input.attemptId);
            return { ok: true, approved: true };
        });
    }
    async function cancel(input) {
        return transaction(async () => {
            const value = await attempt(input.attemptId);
            await proof.consumeProof(input, 'cancel', input.attemptId, JSON.parse(value.public_key));
            await query('run', "UPDATE auth_link_attempts SET state = 'cancelled' WHERE attempt_id = ?", [input.attemptId]);
            return { ok: true };
        });
    }
    async function startPhoneChange(input, network) {
        const authorization = await sessions.authorizePhoneChange(input);
        const { keyId } = publicDeviceKey(input.publicKey);
        if (keyId !== authorization.key_id) reject();
        return start({ ...input, phone: input.newPhone }, network, authorization);
    }
    return { start, startPhoneChange, getChallenge, complete, approve, cancel, sessions };
}
