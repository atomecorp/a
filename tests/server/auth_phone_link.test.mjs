import { describe, expect, it } from 'vitest';
import { fixture } from './auth_phone_fixture.mjs';
import { createPhoneLinkAuth } from '../../server/auth_phone_link.js';
describe('persistent phone-link protocol', () => {
    it('creates one opaque identity with no plaintext link token stored', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        const signed = await f.input(key, attempt.attemptId);
        const row = f.db.prepare('SELECT * FROM auth_link_attempts').get();
        expect(JSON.stringify(row)).not.toContain(signed.token);
        expect(JSON.stringify(row)).not.toContain('+33612345678');
        const result = await f.complete(signed);
        expect(result.ok).toBe(true);
        expect(result.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(1);
        await expect(f.complete(signed)).rejects.toThrow();
    });
    it('allows exactly one concurrent token consumption', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        const a = await f.input(key, attempt.attemptId); const b = await f.input(key, attempt.attemptId);
        const results = await Promise.allSettled([f.complete(a), f.complete(b)]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('rejects copied links and incorrect signatures without consuming the valid proof', async () => {
        const f = fixture(); const key = f.device(); const other = f.device(); const attempt = await f.start(key);
        await expect(f.auth.getChallenge({ attemptId: attempt.attemptId, keyId: other.keyId, purpose: 'consume' }, 'test')).rejects.toThrow();
        const signed = await f.input(key, attempt.attemptId);
        await expect(f.complete({ ...signed, signature: 'a'.repeat(86) })).rejects.toThrow();
        expect((await f.complete(signed)).ok).toBe(true);
    });
    it('expires attempts', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        const signed = await f.input(key, attempt.attemptId); f.advance(300001);
        await expect(f.complete(signed)).rejects.toThrow();
    });
    it('binds a local identity proof to the session device and consumes it once', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        const login = await f.complete(await f.input(key, attempt.attemptId));
        const fields = { sessionId: login.session.id, generation: 0, purpose: 'local-bind' };
        const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
        const input = { ...fields, ...key.sign(challenge) };
        expect(await f.auth.sessions.localBind(input)).toMatchObject({ ok: true, keyId: key.keyId,
            user: { id: login.user.id } });
        await expect(f.auth.sessions.localBind(input)).rejects.toThrow();
    });
    it('binds device revocation to its exact target and rejects the revoked key', async () => {
        const f = fixture(); const first = f.device(); const a = await f.start(first);
        const login = await f.complete(await f.input(first, a.attemptId)); f.advance(60001);
        // A second device of the account (an SMS no longer enrolls one directly).
        const second = f.device();
        await f.auth.devices.enroll({ keyId: second.keyId, principalId: login.user.id, jwk: second.jwk, enrolledBy: 'test' });
        const fields = { sessionId: login.session.id, generation: 0, purpose: 'revoke-device', targetKeyId: second.keyId };
        const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
        const input = { ...fields, action: 'revoke-device', ...first.sign(challenge) };
        await expect(f.auth.sessions.revoke({ ...input, targetKeyId: first.keyId })).rejects.toThrow();
        expect(await f.auth.sessions.revoke(input)).toEqual({ ok: true });
        f.advance(60001);
        await expect(f.start(second)).rejects.toThrow();
    });
    it('rejects malformed links without sending an SMS or changing session state', async () => {
        const f = fixture(); const first = f.device(); const a = await f.start(first);
        const input = await f.input(first, a.attemptId);
        await expect(f.complete({ ...input, token: 'invalid' })).rejects.toThrow();
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
        expect((await f.complete(input)).ok).toBe(true);
    });
    it('turns the SMS link of an existing account into a 72 h recovery request, never a session', async () => {
        const f = fixture(); f.accounts.set('+33612345678', { user_id: 'existing-id', username: 'Existing', phone: '+33612345678' });
        const key = f.device(); const attempt = await f.start(key);
        const result = await f.complete(await f.input(key, attempt.attemptId));
        expect(result).toMatchObject({ ok: true, recoveryPending: true, notBefore: f.now() + 72 * 3600000 });
        expect(result.token).toBeUndefined();
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_keys').get().n).toBe(0);
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
        expect(f.db.prepare('SELECT principal_id, channel, state FROM auth_recovery_requests').get())
            .toEqual({ principal_id: 'existing-id', channel: 'phone_recovery', state: 'pending' });
        expect(f.notices).toMatchObject([{ principalId: 'existing-id', kind: 'auth-recovery-started' }]);
    });
    it('has no signed approval of an SMS attempt: enrolled devices approve through pairing', async () => {
        const f = fixture(); const phone = f.device(); const first = await f.start(phone);
        await f.complete(await f.input(phone, first.attemptId)); f.advance(60001);
        const computer = f.device(); const next = await f.start(computer);
        await expect(f.input(phone, next.attemptId, 'approve')).rejects.toThrow('auth_request_invalid');
        expect(f.auth.approve).toBeUndefined();
    });
    it('lets the SMS link approve another device without authenticating the opener', async () => {
        const f = fixture();
        f.accounts.set('+33612345678', { user_id: 'existing-id', username: 'Existing', phone: '+33612345678' });
        const computer = f.device();
        const attempt = await f.start(computer);
        expect(await f.complete(await f.input(computer, attempt.attemptId, 'resume'))).toMatchObject({ pending: true });
        const { token } = new URL(f.messages.at(-1).url).hash.match(/^#t=(?<token>.+)$/).groups;
        await expect(f.auth.confirm({ attemptId: attempt.attemptId, token })).rejects.toThrow('auth_pairing_invalid');
        expect(await f.auth.confirm({ attemptId: attempt.attemptId, token, pairingCode: attempt.pairingCode })).toEqual({ ok: true, approved: true });
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
        const result = await f.complete(await f.input(computer, attempt.attemptId, 'resume'));
        expect(result).toMatchObject({ ok: true, recoveryPending: true });
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
    });
    it('renews with a signed challenge, rotates generation and revokes on reuse', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        const login = await f.complete(await f.input(key, attempt.attemptId));
        const args = { sessionId: login.session.id, generation: 0, purpose: 'renew' };
        const a = await f.auth.sessions.getChallenge(args, 'test'); const b = await f.auth.sessions.getChallenge(args, 'test');
        const renewed = await f.auth.sessions.renew({ ...args, ...key.sign(a.challenge) });
        expect(renewed.session.generation).toBe(1);
        expect(await f.auth.sessions.renew({ ...args, ...key.sign(b.challenge) })).toMatchObject({ ok: false, error: 'auth_session_reused' });
        expect(f.disconnected).toEqual([login.session.id]);
    });
    it('blocks uncertain deliveries and counts them against the global budget', async () => {
        const f = fixture({ failDelivery: true, dailyLimit: 1 }); const key = f.device();
        await expect(f.start(key)).rejects.toThrow('sms_delivery_unavailable');
        expect(f.db.prepare('SELECT state FROM auth_link_attempts').get().state).toBe('blocked');
        await expect(f.start(f.device(), '+33612345679')).rejects.toThrow('auth_rate_limited');
        expect(f.messages).toHaveLength(1);
    });
    it('rejects stale phone bindings', async () => {
        const f = fixture(); const key = f.device(); const attempt = await f.start(key);
        f.accounts.set('+33612345678', { user_id: 'different-id' });
        await expect(f.complete(await f.input(key, attempt.attemptId))).rejects.toThrow();
    });
});

describe('SMS security boundaries', () => {
    it('rejects a fresh device proof at the exact SMS deadline', async () => {
        const f = fixture(), key = f.device(), a = await f.start(key);
        f.advance(299999); const input = await f.input(key, a.attemptId); f.advance(1);
        await expect(f.auth.complete(input)).rejects.toThrow('auth_attempt_expired');
        await expect(f.auth.confirm({ ...input, pairingCode: a.pairingCode })).rejects.toThrow('auth_attempt_expired');
    });
    it('rejects unsolicited token-only approval and limits guesses durably across service restart', async () => {
        const f = fixture(), key = f.device(), a = await f.start(key), input = await f.input(key, a.attemptId);
        const wrong = a.pairingCode === '00000000' ? '11111111' : '00000000';
        await expect(f.auth.confirm({ attemptId: a.attemptId, token: input.token })).rejects.toThrow('auth_pairing_invalid');
        for (let i = 0; i < 4; i++) await expect(f.auth.confirm({ ...input, pairingCode: wrong })).rejects.toThrow('auth_pairing_invalid');
        expect(f.db.prepare("SELECT count FROM auth_send_limits WHERE bucket=?").get(`pairing:${a.attemptId}`).count).toBe(5);
        const restarted = createPhoneLinkAuth({ query: async (mode, sql, args = []) => f.db.prepare(sql)[mode](...args),
            transaction: async work => { f.db.exec('BEGIN'); try { const result = await work(); f.db.exec('COMMIT'); return result; } catch (error) { f.db.exec('ROLLBACK'); throw error; } },
            masterSecret: 'test-only-secret-material'.repeat(3), now: f.now, notify: async () => {} });
        await expect(restarted.confirm({ ...input, pairingCode: a.pairingCode })).rejects.toThrow('auth_pairing_locked');
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
        expect(await f.auth.complete({ ...await f.input(key, a.attemptId, 'resume') })).toMatchObject({ pending: true });
    });
    it('keeps an approved attempt subject to its original deadline', async () => {
        const f = fixture(), key = f.device(), a = await f.start(key), input = await f.input(key, a.attemptId);
        await f.auth.confirm(input); f.advance(299999);
        const signed = await f.input(key, a.attemptId, 'resume'); f.advance(1);
        await expect(f.auth.complete(signed)).rejects.toThrow('auth_attempt_expired');
    });
    it('charges only provider attempts: invalid input and payment without SMS proof consume no delivery budget', async () => {
        const f = fixture({ dailyLimit: 2 }), key = f.device();
        await expect(f.auth.start({ phone: 'invalid' }, 'test')).rejects.toThrow();
        expect(f.db.prepare("SELECT count(*) AS n FROM auth_send_limits WHERE bucket='sms-daily'").get().n).toBe(0);
        const a = await f.start(key);
        for (let i = 0; i < 3; i++) await expect(f.auth.simulatePayment({ ...await f.input(key, a.attemptId, 'simulate-payment'), method: 'card' })).rejects.toThrow();
        expect(f.messages).toHaveLength(1);
        expect(f.db.prepare("SELECT count FROM auth_send_limits WHERE bucket='sms-daily'").get().count).toBe(1);
        await f.start(f.device(), '+33612345679');
        await expect(f.start(f.device(), '+33612345670')).rejects.toThrow('auth_rate_limited');
        expect(f.messages).toHaveLength(2);
    });
});

it('requires explicit confirmation and a fresh dedicated proof for account deletion', async () => {
    const f = fixture(); const key = f.device(); const attempt = await f.start(key);
    const login = await f.complete(await f.input(key, attempt.attemptId));
    const fields = { sessionId: login.session.id, generation: 0, purpose: 'delete-account' };
    const { challenge } = await f.auth.sessions.getChallenge(fields, '192.0.2.1');
    const input = { ...fields, ...key.sign(challenge) };
    await expect(f.auth.sessions.removeAccount(input)).rejects.toThrow('auth_confirmation_required');
    expect(f.accounts.size).toBe(1);
    expect(await f.auth.sessions.removeAccount({ ...input, confirmed: true })).toEqual({ ok: true });
    expect(f.accounts.size).toBe(0);
    expect(f.disconnected).toContain(login.session.id);
    await expect(f.auth.sessions.read(login.session.id)).rejects.toThrow('auth_session_invalid');
});

it('changes a phone only after a recognized device signs the target and the new SMS is consumed', async () => {
    const f = fixture(); const key = f.device(); const first = await f.start(key);
    const login = await f.complete(await f.input(key, first.attemptId));
    const fields = { sessionId: login.session.id, generation: 0, purpose: 'change-phone', newPhone: '+33687654321' };
    const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
    const input = { ...fields, ...key.sign(challenge), confirmed: true, publicKey: key.jwk, clientNonce: 'a'.repeat(43) };
    await expect(f.auth.startPhoneChange({ ...input, newPhone: '+33687654322' }, 'test')).rejects.toThrow();
    const attempt = await f.auth.startPhoneChange(input, 'test');
    expect(f.accounts.has('+33612345678')).toBe(true);
    expect(f.accounts.has('+33687654321')).toBe(false);
    const result = await f.complete(await f.input(key, attempt.attemptId));
    expect(result.user).toMatchObject({ id: login.user.id, phone: '+33687654321' });
    expect(f.accounts.has('+33612345678')).toBe(false);
    await expect(f.input(key, attempt.attemptId)).rejects.toThrow();
});

it('cleans expired number-change attempts without blocking subsequent authentication', async () => {
    const f = fixture(); const key = f.device(); const first = await f.start(key);
    const login = await f.complete(await f.input(key, first.attemptId));
    const fields = { sessionId: login.session.id, generation: 0, purpose: 'change-phone', newPhone: '+33687654321' };
    const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
    await f.auth.startPhoneChange({ ...fields, ...key.sign(challenge), confirmed: true, publicKey: key.jwk, clientNonce: 'a'.repeat(43) }, 'test');
    f.advance(300001);
    expect((await f.start(key)).ok).toBe(true);
    expect(f.db.prepare('SELECT count(*) AS n FROM auth_phone_changes').get().n).toBe(0);
    expect(f.accounts.has('+33612345678')).toBe(true);
});
