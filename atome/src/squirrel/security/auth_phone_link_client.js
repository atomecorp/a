import { parseAuthLink, authPasswordRequestDigest } from '../../shared/auth_link_contract.js';

// `auth_session_invalid` is deliberately absent: a session sent to another
// server than the one that issued it is "invalid" there yet alive at home.
const DEAD_SESSION_ERRORS = new Set(['auth_session_stale', 'auth_session_reused']);

// Owns proof exchange and persistent, non-bearer descriptors. Application session
// projection and native local authorization remain the auth facade's owners.
export function createPhoneLinkClient({ devices, send, installSession, locks = globalThis.navigator?.locks,
    now = Date.now, onPending = () => {}, connectionProof = false }) {
    let serial = Promise.resolve();
    let confirmation = null;
    const exclusive = (work) => {
        const run = async () => {
            if (!locks) return work();
            // Some embedded WebKit builds execute the Web Locks callback but
            // discard its return value. Capture it explicitly so the caller
            // still receives the authentication result.
            let completed = false;
            let callbackResult;
            await locks.request('atome-phone-auth', async () => {
                callbackResult = await work();
                completed = true;
                return callbackResult;
            });
            if (!completed) throw new Error('auth_lock_unavailable');
            return callbackResult;
        };
        const result = serial.then(run);
        serial = result.catch(() => {});
        return result;
    };
    async function request(action, fields) {
        const result = await send({ type: 'auth', action, ...fields });
        // No answer at all is not a refusal: say the server is out of reach.
        if (!result?.ok && result?.offline === true) throw new Error('auth_server_unreachable');
        if (!result?.ok) throw new Error(result?.error || 'auth_connection_unavailable');
        return result;
    }
    // This device remembers that the account of a phone has a password (after a
    // password sign-in or after setting one): only then is password sign-in offered.
    // The server is never asked, so no one learns whether a number has a password.
    const passwordMark = (phone) => `password:${phone}`;
    // A session record names its key: an account scope (V1) or, before, a phone.
    const deviceOf = (record) => (record.scope ? devices.forScope(record.scope) : devices.forPhone(record.phone));
    async function sign(device, challenge, purpose, reference, clientNonce) {
        if (challenge?.purpose !== purpose || challenge.reference !== reference
            || !Number.isSafeInteger(challenge.issuedAt) || Math.abs(now() - challenge.issuedAt) > 60000
            || (clientNonce && !challenge.nonce.endsWith(`:${clientNonce}`))) {
            throw new Error('auth_challenge_invalid');
        }
        return device.sign(challenge);
    }
    async function attemptProof(record, purpose, device) {
        const response = await request('phone-link-challenge', {
            attemptId: record.attemptId, keyId: device.keyId, purpose
        });
        return sign(device, response.challenge, purpose, record.attemptId, record.clientNonce);
    }
    async function accept(result, phone, attemptId) {
        const device = await devices.forPhone(phone);
        if (!result.token || !result.user?.id || result.session?.keyId !== device.keyId) {
            throw new Error('auth_session_invalid');
        }
        if (result.user.phone !== phone) {
            const attempt = await devices.read('attempt');
            const existing = await devices.read('session');
            const changedByThisAttempt = attemptId && attempt?.attemptId === attemptId && attempt.nextPhone === result.user.phone;
            const renewedSameIdentity = !attemptId && existing?.userId === result.user.id;
            if (!changedByThisAttempt && !renewedSameIdentity) throw new Error('auth_phone_mismatch');
            await devices.aliasPhone(phone, result.user.phone);
            phone = result.user.phone;
        }
        // Save no access token. A crash after this write can renew using the key.
        await devices.put('session', { phone, session: result.session, userId: result.user.id });
        if (attemptId) await devices.remove('attempt');
        await installSession(result, { attemptId });
        return result;
    }
    async function resumeAttempt(record) {
        if (!record || record.expiresAt <= now()) throw new Error('auth_attempt_expired');
        const device = await devices.forPhone(record.phone);
        const signed = await attemptProof(record, 'resume', device);
        const result = await request('phone-link-resume', { attemptId: record.attemptId, ...signed });
        return settleAttempt(result, record);
    }
    async function settleAttempt(result, record) {
        if (result.token) return accept(result, record.phone, record.attemptId);
        // A verified phone only opens a delayed recovery of its account (V1 §7.4):
        // this device completes it later with the same key.
        if (result.recoveryPending) {
            const device = await devices.forPhone(record.phone);
            await devices.put('recovery-attempt', { scope: device.scope, recoveryId: result.recoveryId, notBefore: result.notBefore,
                approve: null, channel: 'phone' });
            await devices.remove('attempt');
            onPending({ recoveryPending: true, notBefore: result.notBefore });
            return { ok: true, recoveryPending: true, notBefore: result.notBefore };
        }
        const next = { ...record, paymentRequired: result.paymentRequired === true,
            pairingCode: result.pairingCode ?? record.pairingCode,
            expiresAt: Number.isFinite(result.expiresAt) ? result.expiresAt : record.expiresAt };
        // Convert the server deadline once, never restart a five-minute timer.
        if (Number.isFinite(result.serverNow)) next.expiresAt -= result.serverNow - now();
        await devices.put('attempt', next);
        if (next.paymentRequired && !record.paymentRequired) onPending({ paymentRequired: true });
        return { ...result, expiresAt: next.expiresAt };
    }
    async function followDelivery(response, record) {
        if (response.developmentLink) {
            const link = parseAuthLink(response.developmentLink);
            if (link.attemptId !== record.attemptId) throw new Error('auth_link_invalid');
            const device = await devices.forPhone(record.phone);
            const signed = await attemptProof(record, 'consume', device);
            return settleAttempt(await request('phone-link-consume', { ...link, ...signed }), record);
        }
        const result = await resumeAttempt(record);
        return result.pending ? { ...result, ok: true, attemptId: record.attemptId } : result;
    }
    return {
        passwordLogin: (phone, password) => exclusive(async () => {
            const device = await devices.forPhone(phone);
            const fields = { phone, publicKey: device.publicKey, clientNonce: devices.randomHandle() };
            const { challenge } = await request('password-login-challenge', fields);
            if (!challenge.reference?.endsWith(`:${fields.clientNonce}`)) throw new Error('auth_challenge_invalid');
            const signed = await sign(device, challenge, 'password-login', challenge.reference, fields.clientNonce);
            const result = await request('password-login', { ...fields, ...signed, password });
            const accepted = await accept(result, phone);
            await devices.put(passwordMark(accepted.user.phone), true);
            return accepted;
        }),
        setPassword: (password, currentPassword = '') => exclusive(async () => {
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation, requestDigest: await authPasswordRequestDigest(password, currentPassword) };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'set-password' });
            const signed = await sign(device, challenge, 'set-password', `${fields.sessionId}:${fields.generation}:${fields.requestDigest}`);
            const result = await request('session-set-password', { ...fields, ...signed, password, currentPassword });
            await devices.put(passwordMark(record.phone), true);
            return result;
        }),
        hasPassword: async (phone) => (await devices.read(passwordMark(phone))) === true,
        retryRevocations: () => exclusive(async () => {
            const pending = await devices.keys('revoke:');
            for (const key of pending) {
                const record = await devices.read(key);
                const device = await deviceOf(record);
                const fields = { sessionId: record.session.id, generation: record.session.generation };
                try {
                    const { challenge } = await request('session-challenge', { ...fields, purpose: 'logout' });
                    const signed = await sign(device, challenge, 'logout', `${fields.sessionId}:${fields.generation}`);
                    await request('session-logout', { ...fields, ...signed });
                    await devices.remove(key);
                } catch (error) {
                    if (error.message === 'auth_session_invalid') await devices.remove(key);
                    else return { ok: false, revocationPending: true };
                }
            }
            return { ok: true };
        }),
        start: (phone) => exclusive(async () => {
            if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('auth_phone_e164_required');
            const device = await devices.forPhone(phone);
            const clientNonce = devices.randomHandle();
            const response = await request('phone-link-start', { phone, publicKey: device.publicKey, clientNonce });
            await settleAttempt(response, { phone, clientNonce, attemptId: response.attemptId, expiresAt: response.expiresAt });
            const record = await devices.read('attempt');
            // Development delivery still consumes the ordinary SMS token and device proof.
            return followDelivery(response, record);
        }),
        resume: () => exclusive(async () => resumeAttempt(await devices.read('attempt'))),
        simulatePayment: method => exclusive(async () => {
            const record = await devices.read('attempt');
            if (!record || record.expiresAt <= now()) throw new Error('auth_attempt_expired');
            const device = await devices.forPhone(record.phone);
            const signed = await attemptProof(record, 'simulate-payment', device);
            const response = await request('phone-link-simulate-payment', { attemptId: record.attemptId, method, ...signed });
            return settleAttempt(response, record);
        }),
        pendingAttempt: async () => {
            if (confirmation) return { confirmationRequired: true };
            const record = await devices.read('attempt');
            return record ? {
                phone: record.phone, expiresAt: record.expiresAt, expired: record.expiresAt <= now(),
                pairingCode: record.pairingCode, paymentRequired: record.paymentRequired === true
            } : null;
        },
        resend: () => exclusive(async () => {
            const record = await devices.read('attempt');
            if (!record || record.expiresAt <= now()) throw new Error('auth_attempt_expired');
            if (record.paymentRequired) throw new Error('auth_payment_required');
            const device = await devices.forPhone(record.phone);
            const signed = await attemptProof(record, 'resend', device);
            return followDelivery(await request('phone-link-resend', { attemptId: record.attemptId, ...signed }), record);
        }),
        consumeLink: (url) => exclusive(async () => {
            const link = parseAuthLink(url);
            const record = await devices.read('attempt');
            if (record?.attemptId === link.attemptId) {
                const device = await devices.forPhone(record.phone);
                const signed = await attemptProof(record, 'consume', device);
                const result = await request('phone-link-consume', { ...link, ...signed });
                return settleAttempt(result, record);
            }
            // Opening a foreign SMS never approves it. Keep its bearer in memory
            // until the user transfers the code from the requesting device.
            confirmation = link;
            onPending({ confirmationRequired: true });
            return { ok: true, confirmationRequired: true };
        }),
        confirmLink: code => exclusive(async () => {
            if (!confirmation) throw new Error('auth_confirmation_required');
            const pairingCode = String(code).replace(/\s/g, '');
            if (!/^\d{8}$/.test(pairingCode)) throw new Error('auth_pairing_invalid');
            const result = await request('phone-link-confirm', { ...confirmation, pairingCode });
            confirmation = null;
            return result;
        }),
        renew: () => exclusive(async () => {
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            try {
                const { challenge } = await request('session-challenge', { ...fields, purpose: 'renew' });
                const signed = await sign(device, challenge, 'renew', `${fields.sessionId}:${fields.generation}`);
                // A client that proves its key on every connection says so (`pop`): its tokens become bound to it.
                const result = await request('session-renew', { ...fields, ...signed, ...(connectionProof ? { pop: true } : {}) });
                if (!record.scope) return accept(result, record.phone);
                if (!result.token || result.user?.id !== record.userId || result.session?.keyId !== device.keyId) throw new Error('auth_session_invalid');
                await devices.put('session', { ...record, session: result.session });
                await installSession(result, { scope: record.scope, renewal: true });
                return result;
            } catch (error) {
                // The server's own verdict that this session can never renew again
                // (a generation it already moved past, or a reuse it revoked).
                // Keeping the record would replay the same refusal forever while
                // the app looks signed in; only a new sign-in can relink it.
                if (!DEAD_SESSION_ERRORS.has(error?.message)) throw error;
                await devices.remove('session');
                throw new Error('auth_remote_relogin_required');
            }
        }),
        revoke: (purpose = 'logout', targetKeyId, beforeRevoke) => exclusive(async () => {
            if (!['logout', 'logout-all', 'revoke-device'].includes(purpose)) throw new Error('auth_request_invalid');
            const record = await devices.read('session');
            // Capture the descriptor before the local lock clears its durable
            // native copy. A failed local lock must not silently revoke remotely.
            if (purpose === 'logout') await beforeRevoke?.();
            if (!record && purpose === 'logout') return { ok: true };
            if (!record) throw new Error('auth_session_required');
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation, targetKeyId };
            const reference = `${fields.sessionId}:${fields.generation}${purpose === 'revoke-device' ? `:${targetKeyId}` : ''}`;
            try {
                const { challenge } = await request('session-challenge', { ...fields, purpose });
                const signed = await sign(device, challenge, purpose, reference);
                await request(`session-${purpose}`, { ...fields, ...signed });
            } catch (error) {
                if (purpose !== 'logout') throw error;
                await devices.put(`revoke:${record.session.id}`, record);
                await devices.remove('session');
                if (record.userId) await devices.remove(`account:${record.userId}`);
                return { ok: true, revocationPending: true };
            }
            if (purpose !== 'revoke-device' || targetKeyId === device.keyId) {
                await devices.remove('session');
                // A shared device keeps the account's key to ask for the next opening.
                if (record.userId && record.deviceClass !== 'shared') await devices.remove(`account:${record.userId}`);
            }
            return { ok: true };
        }),
        changePhone: (newPhone, confirmed) => exclusive(async () => {
            if (confirmed !== true) throw new Error('auth_confirmation_required');
            if (!/^\+[1-9]\d{7,14}$/.test(newPhone)) throw new Error('auth_phone_e164_required');
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation, newPhone };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'change-phone' });
            const signed = await sign(device, challenge, 'change-phone', `${fields.sessionId}:${fields.generation}:${newPhone}`);
            const clientNonce = devices.randomHandle();
            const response = await request('phone-change-start', { ...fields, ...signed, confirmed: true, publicKey: device.publicKey, clientNonce });
            const attempt = { phone: record.phone, nextPhone: newPhone, clientNonce, attemptId: response.attemptId, expiresAt: response.expiresAt };
            await devices.put('attempt', attempt);
            return resumeAttempt(attempt);
        }),
        deleteAccount: (confirmed) => exclusive(async () => {
            if (confirmed !== true) throw new Error('auth_confirmation_required');
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await deviceOf(record);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'delete-account' });
            const signed = await sign(device, challenge, 'delete-account', `${fields.sessionId}:${fields.generation}`);
            await request('session-delete-account', { ...fields, ...signed, confirmed: true });
            await devices.remove('session');
            if (record.userId) await devices.remove(`account:${record.userId}`);
            return { ok: true };
        }),
        cancel: () => exclusive(async () => {
            if (confirmation) { confirmation = null; return { ok: true }; }
            const record = await devices.read('attempt');
            if (!record) return { ok: true };
            if (record.expiresAt <= now()) { await devices.remove('attempt'); return { ok: true }; }
            const device = await devices.forPhone(record.phone);
            const signed = await attemptProof(record, 'cancel', device);
            await request('phone-link-cancel', { attemptId: record.attemptId, ...signed });
            await devices.remove('attempt');
            return { ok: true };
        })
    };
}
