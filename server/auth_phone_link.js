import { AUTH_LINK_ORIGIN, AUTH_LINK_TTL_MS } from '../atome/src/shared/auth_link_contract.js';
import { createAuthProofSecurity, publicDeviceKey, randomHandle, digest, reject, requireHandle } from './auth_link_security.js';
import { createDeviceSessions } from './auth_sessions.js';
import { createPasswordAuth } from './auth_password.js';
import { createDeviceRegistry } from './auth_devices.js';
import { createHandles } from './auth_handles.js';
import { openRecoveryRequest, RECOVERY_PHONE_DELAY_MS } from './auth_recovery.js';

// The injected persistence and account functions are the existing server owners.
// SMS I/O is outside transactions; proofs and identity changes are atomic.
export function createPhoneLinkAuth({ query, transaction, findByPhone, findById, createAccount,
    sendLink, masterSecret, issueAccess, disconnectSession, deleteAccount, replacePhone, screenPassword, notify, now = Date.now, dailyLimit = 20 }) {
    if (typeof notify !== 'function') reject('auth_notify_required');
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1) reject('auth_budget_invalid');
    const proof = createAuthProofSecurity({ query, transaction, masterSecret, now });
    const devices = createDeviceRegistry({ query, now });
    const handles = createHandles({ query, now });
    const sessions = createDeviceSessions({ query, transaction, proof, now, issueAccess, findById, disconnectSession, deleteAccount, handles });
    const passwords = createPasswordAuth({ query, transaction, proof, sessions, devices, now, findByPhone, findById, disconnectSession, screen: screenPassword });
    // Separate from the SMS secret: only the requesting device receives this code.
    const pairingCode = id => String(parseInt(proof.keyedIndex(`phone-link-pairing:${id}`).slice(0, 12), 16) % 100000000).padStart(8, '0');
    const pending = value => ({ ok: true, pending: true, attemptId: value.attempt_id,
        expiresAt: value.expires_ms, serverNow: now(), pairingCode: pairingCode(value.attempt_id),
        ...(value.state === 'verified_payment' ? { paymentRequired: true } : {}) });
    const attempt = async (id, { forCancellation = false } = {}) => {
        requireHandle(id);
        const value = await query('get', 'SELECT * FROM auth_link_attempts WHERE attempt_id = ?', [id]);
        if (value?.expires_ms <= now()) reject('auth_attempt_expired');
        if (!value || ['consumed', 'cancelled'].includes(value.state)
            || (value.state === 'blocked' && !forCancellation)) reject();
        return value;
    };
    const deliver = async (value, token) => {
        // Reserve only immediately before provider I/O; uncertain deliveries keep it.
        await transaction(async () => {
            const current = await attempt(value.attempt_id);
            if (current.state !== 'created') reject();
            await proof.limit('sms-daily', dailyLimit, 86400000);
        });
        let delivery;
        try {
            delivery = await sendLink(proof.openPhone(value.phone_sealed), `${AUTH_LINK_ORIGIN}/auth/v/${value.attempt_id}#t=${token}`);
            await transaction(async () => {
                await query('run', "UPDATE auth_link_attempts SET state = 'sent' WHERE attempt_id = ? AND state = 'created'", [value.attempt_id]);
                await proof.audit('sms_provider_accepted', null, value.attempt_id);
            });
        } catch {
            await transaction(async () => {
                await query('run', "UPDATE auth_link_attempts SET state = 'blocked' WHERE attempt_id = ?", [value.attempt_id]);
                await proof.audit('sms_delivery_failed', null, value.attempt_id);
            });
            reject('sms_delivery_unavailable');
        }
        return { ...pending(value), pending: false,
            ...(delivery?.developmentLink ? { developmentLink: delivery.developmentLink } : {}) };
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
            const account = await findByPhone(phone);
            if (phoneChange && (account || typeof replacePhone !== 'function')) reject();
            const registered = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
            if (registered && (registered.revoked_ms !== null || registered.principal_id !== (phoneChange?.principal_id || account?.user_id))) reject();
            // Only a new attempt from the same device supersedes its predecessor.
            await query('run', `UPDATE auth_link_attempts SET state = 'cancelled'
                WHERE phone_index = ? AND key_id = ? AND state IN ('verified_payment', 'created', 'sent', 'approved')`, [phoneIndex, keyId]);
            await query('run', `INSERT INTO auth_link_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, NULL)`,
                [id, proof.sealPhone(phone), phoneIndex, account?.user_id || null, keyId,
                    JSON.stringify(jwk), clientNonce, digest(token), now(), now() + AUTH_LINK_TTL_MS]);
            if (phoneChange) await query('run', 'INSERT INTO auth_phone_changes VALUES (?, ?, ?)', [id, phoneChange.principal_id, phoneChange.session_id]);
            await proof.audit('authentication_started', account?.user_id || null, id);
        });
        const value = await attempt(id);
        return deliver(value, token);
    }
    // A fictional receipt never grants a session: the SMS and device proofs remain mandatory.
    async function simulatePayment(input) {
        if (!['card', 'paypal', 'wero', 'apple_pay', 'google_pay', 'other'].includes(input.method)) reject('auth_payment_method_invalid');
        return transaction(async () => {
            const value = await attempt(input.attemptId);
            await proof.consumeProof(input, 'simulate-payment', input.attemptId, JSON.parse(value.public_key));
            if (value.state !== 'verified_payment' || value.candidate_id) reject();
            if (await findByPhone(proof.openPhone(value.phone_sealed))) reject();
            await proof.audit(`payment_simulated:${input.method}`, null, input.attemptId);
            return { ...await finishAttempt(value, true), payment: { mode: 'simulated', amountCents: 1200, currency: 'EUR', period: 'month' } };
        });
    }
    async function getChallenge({ attemptId, keyId, purpose }, network) {
        if (!['consume', 'approve', 'resume', 'resend', 'cancel', 'simulate-payment'].includes(purpose)) reject('auth_request_invalid');
        return transaction(async () => {
            await proof.limit(`challenge:${proof.keyedIndex(String(network))}`, 60, 60000);
            const value = await attempt(attemptId, { forCancellation: purpose === 'cancel' });
            if (purpose === 'approve') {
                const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
                if (!device || device.revoked_ms !== null || device.principal_id !== value.candidate_id
                    || device.restricted_until_ms > now()) reject('auth_trusted_phone_required');
            } else if (value.key_id !== keyId) reject();
            return { ok: true, challenge: await proof.challenge(purpose, attemptId, keyId, value.client_nonce) };
        });
    }
    async function resend(input) {
        const token = randomHandle();
        const outcome = await transaction(async () => {
            const value = await attempt(input.attemptId);
            if (!['sent', 'approved', 'verified_payment'].includes(value.state)) reject();
            await proof.consumeProof(input, 'resend', input.attemptId, JSON.parse(value.public_key));
            if (value.state !== 'sent') return { value, pending: true };
            if (((await findByPhone(proof.openPhone(value.phone_sealed)))?.user_id || null) !== value.candidate_id) reject();
            await proof.limit(`phone-minute:${value.phone_index}`, 1, 60000);
            await proof.limit(`phone-hour:${value.phone_index}`, 5, 3600000);
            await proof.limit(`device:${value.key_id}`, 10, 3600000);
            await query('run', "UPDATE auth_link_attempts SET state = 'created', token_hash = ? WHERE attempt_id = ? AND state = 'sent'", [digest(token), value.attempt_id]);
            await proof.audit('sms_resend_requested', value.candidate_id, value.attempt_id);
            return { value };
        });
        return outcome.pending ? pending(outcome.value) : deliver(outcome.value, token);
    }
    async function complete(input) {
        const outcome = await transaction(async () => {
            const value = await attempt(input.attemptId);
            if (!['sent', 'approved', 'verified_payment'].includes(value.state)) reject();
            const purpose = input.action === 'resume' ? 'resume' : 'consume';
            await proof.consumeProof(input, purpose, input.attemptId, JSON.parse(value.public_key));
            if (purpose === 'consume') {
                requireHandle(input.token);
                if (digest(input.token) !== value.token_hash) reject();
            } else if (!['approved', 'verified_payment'].includes(value.state)) return pending(value);
            return finishAttempt(value);
        });
        return outcome;
    }
    async function finishAttempt(value, paid = false) {
        const phone = proof.openPhone(value.phone_sealed);
        const existing = await findByPhone(phone);
        // A replaced binding or a concurrent account creation invalidates stale attempts.
        if ((existing?.user_id || null) !== value.candidate_id) reject();
        const changing = await query('get', 'SELECT * FROM auth_phone_changes WHERE attempt_id = ?', [value.attempt_id]);
        if (!existing && !changing && !paid) {
            await query('run', "UPDATE auth_link_attempts SET state = 'verified_payment' WHERE attempt_id = ?", [value.attempt_id]);
            return pending({ ...value, state: 'verified_payment' });
        }
        let account;
        if (changing) {
            const initiating = await sessions.read(changing.session_id);
            if (initiating.principal_id !== changing.principal_id || initiating.key_id !== value.key_id) reject();
            if (initiating.restricted_until_ms > now()) reject('auth_device_cooling_off');
            if (existing || typeof replacePhone !== 'function') reject();
            await replacePhone(changing.principal_id, phone);
            account = await findById(changing.principal_id);
            if (!account || account.phone !== phone) reject();
            await proof.audit('phone_changed', account.user_id, value.attempt_id);
        } else account = existing || await createAccount(phone);
        const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [value.key_id]);
        if (device && (device.revoked_ms !== null || device.principal_id !== account.user_id)) reject();
        if (!device && existing && !changing) {
            // A verified phone is a recovery channel only: a new device of an
            // existing account waits 72 h, cancellable from every enrolled device.
            const request = await openRecoveryRequest({ query, proof, now }, account.user_id, { channel: 'phone_recovery',
                sessionKey: { keyId: value.key_id, jwk: JSON.parse(value.public_key) }, deviceMeta: {}, delay: RECOVERY_PHONE_DELAY_MS });
            const consumed = await query('run', `UPDATE auth_link_attempts SET state = 'consumed'
                WHERE attempt_id = ? AND state IN ('sent', 'approved', 'verified_payment')`, [value.attempt_id]);
            if (Number(consumed.changes) !== 1) reject();
            await notify(account.user_id, { kind: 'auth-recovery-started', recoveryId: request.request_id, notBefore: request.not_before_ms });
            return { ok: true, recoveryPending: true, recoveryId: request.request_id, notBefore: request.not_before_ms };
        }
        if (!device) {
            await devices.enroll({ keyId: value.key_id, principalId: account.user_id, jwk: JSON.parse(value.public_key),
                enrolledBy: existing ? 'phone_link' : 'creation', restrictedUntil: existing ? now() + 86400000 : now() });
            await proof.audit('device_enrolled', account.user_id, value.key_id);
        }
        const changed = await query('run', `UPDATE auth_link_attempts SET state = 'consumed'
            WHERE attempt_id = ? AND state IN ('sent', 'approved', 'verified_payment')`, [value.attempt_id]);
        if (Number(changed.changes) !== 1) reject();
        return { ...await sessions.create(account, value.key_id), newAccount: !existing && !changing };
    }
    async function approve(input) {
        await requirePairing(await attempt(input.attemptId), input.pairingCode, input.token);
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
    async function confirm(input) {
        // Commit failed guesses independently of the approval transaction.
        await requirePairing(await attempt(input.attemptId), input.pairingCode, input.token);
        return transaction(async () => {
            const value = await attempt(input.attemptId);
            if (!['sent', 'approved'].includes(value.state)) reject();
            requireHandle(input.token);
            if (digest(input.token) !== value.token_hash) reject();
            if (value.state === 'approved') return { ok: true, approved: true };
            const changed = await query('run', `UPDATE auth_link_attempts SET state = 'approved', approved_by = NULL
                WHERE attempt_id = ? AND state = 'sent'`, [input.attemptId]);
            if (Number(changed.changes) !== 1) reject();
            await proof.audit('sms_link_confirmed', value.candidate_id, input.attemptId);
            return { ok: true, approved: true };
        });
    }
    async function requirePairing(value, code, token) {
        if (digest(requireHandle(token)) !== value.token_hash) reject();
        const outcome = await transaction(async () => {
            const bucket = `pairing:${value.attempt_id}`;
            const previous = await query('get', 'SELECT count FROM auth_send_limits WHERE bucket = ?', [bucket]);
            if (previous?.count >= 5) return 'auth_pairing_locked';
            if (typeof code === 'string' && code === pairingCode(value.attempt_id)) return null;
            await proof.limit(bucket, 5, AUTH_LINK_TTL_MS);
            await proof.audit('sms_pairing_failed', null, value.attempt_id);
            return 'auth_pairing_invalid';
        });
        if (outcome) reject(outcome);
    }
    async function cancel(input) {
        return transaction(async () => {
            const value = await attempt(input.attemptId, { forCancellation: true });
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
    return { start, simulatePayment, resend, startPhoneChange, getChallenge, complete, approve, confirm, cancel, sessions, passwords, proof, devices, handles };
}
