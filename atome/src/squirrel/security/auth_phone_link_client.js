import { parseAuthLink } from '../../shared/auth_link_contract.js';

// Owns proof exchange and persistent, non-bearer descriptors. Application session
// projection and native local authorization remain the auth facade's owners.
export function createPhoneLinkClient({ devices, send, installSession, locks = globalThis.navigator?.locks,
    now = Date.now }) {
    let serial = Promise.resolve();
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
        if (!result?.ok) throw new Error(result?.error || 'auth_connection_unavailable');
        return result;
    }
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
        return result.pending ? result : accept(result, record.phone, record.attemptId);
    }
    return {
        retryRevocations: () => exclusive(async () => {
            const pending = await devices.keys('revoke:');
            for (const key of pending) {
                const record = await devices.read(key);
                const device = await devices.forPhone(record.phone);
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
            const record = { phone, clientNonce, attemptId: response.attemptId, expiresAt: response.expiresAt };
            await devices.put('attempt', record);
            // Signed resume also subscribes this socket to approval notifications.
            await resumeAttempt(record);
            return { ok: true, attemptId: record.attemptId, expiresAt: record.expiresAt, pending: true };
        }),
        resume: () => exclusive(async () => resumeAttempt(await devices.read('attempt'))),
        consumeLink: (url) => exclusive(async () => {
            const link = parseAuthLink(url);
            const record = await devices.read('attempt');
            if (record?.attemptId === link.attemptId) {
                const device = await devices.forPhone(record.phone);
                const signed = await attemptProof(record, 'consume', device);
                const result = await request('phone-link-consume', { ...link, ...signed });
                return accept(result, record.phone, record.attemptId);
            }
            // The device opening the SMS is an approval surface, not the session
            // recipient. The secret fragment proves possession of the SMS; the
            // originating device must still sign its own `resume` challenge before
            // the server can issue a session. Never install that session here.
            return request('phone-link-confirm', link);
        }),
        renew: () => exclusive(async () => {
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await devices.forPhone(record.phone);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'renew' });
            const signed = await sign(device, challenge, 'renew', `${fields.sessionId}:${fields.generation}`);
            const result = await request('session-renew', { ...fields, ...signed });
            return accept(result, record.phone);
        }),
        revoke: (purpose = 'logout', targetKeyId) => exclusive(async () => {
            if (!['logout', 'logout-all', 'revoke-device'].includes(purpose)) throw new Error('auth_request_invalid');
            const record = await devices.read('session');
            if (!record && purpose === 'logout') return { ok: true };
            if (!record) throw new Error('auth_session_required');
            const device = await devices.forPhone(record.phone);
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
                return { ok: true, revocationPending: true };
            }
            if (purpose !== 'revoke-device' || targetKeyId === device.keyId) await devices.remove('session');
            return { ok: true };
        }),
        changePhone: (newPhone, confirmed) => exclusive(async () => {
            if (confirmed !== true) throw new Error('auth_confirmation_required');
            if (!/^\+[1-9]\d{7,14}$/.test(newPhone)) throw new Error('auth_phone_e164_required');
            const record = await devices.read('session');
            if (!record) throw new Error('auth_session_required');
            const device = await devices.forPhone(record.phone);
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
            const device = await devices.forPhone(record.phone);
            const fields = { sessionId: record.session.id, generation: record.session.generation };
            const { challenge } = await request('session-challenge', { ...fields, purpose: 'delete-account' });
            const signed = await sign(device, challenge, 'delete-account', `${fields.sessionId}:${fields.generation}`);
            await request('session-delete-account', { ...fields, ...signed, confirmed: true });
            await devices.remove('session');
            return { ok: true };
        }),
        cancel: () => exclusive(async () => {
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
