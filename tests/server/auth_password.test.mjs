import { test, expect } from 'vitest';
import { fixture } from './auth_phone_fixture.mjs';
import { hashPassword, verifyPassword, screenPassword } from '../../server/auth_password_crypto.js';
import { randomHandle } from '../../server/auth_link_security.js';
import { authPasswordRequestDigest } from '../../atome/src/shared/auth_link_contract.js';

const passphrase = '  Une phrase Unicode 🙂 très longue '.repeat(3);
async function enrolled() {
    const f = fixture({ screenPassword: async value => { if (value.includes('compromised')) throw new Error('auth_password_compromised'); } });
    const device = f.device(), attempt = await f.start(device);
    const result = await f.auth.complete(await f.input(device, attempt.attemptId));
    return { ...f, key: device, result };
}
async function set(f, password, currentPassword = '') {
    const fields = { sessionId: f.result.session.id, generation: f.result.session.generation, purpose: 'set-password', requestDigest: await authPasswordRequestDigest(password, currentPassword) };
    const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
    return f.auth.passwords.set({ ...fields, ...f.key.sign(challenge), password, currentPassword });
}
async function login(f, password, device = f.key, phone = '+33612345678') {
    const fields = { phone, publicKey: device.jwk, clientNonce: randomHandle() };
    const { challenge } = await f.auth.passwords.challenge(fields, 'test-network');
    return f.auth.passwords.login({ ...fields, ...device.sign(challenge), password }, 'test-network');
}
test('SMS enrollment precedes optional password; Unicode/space input signs in on a second device with the same principal', async () => {
    const f = await enrolled();
    expect(await set(f, passphrase)).toEqual({ ok: true });
    expect(f.db.prepare('SELECT verifier FROM auth_password_credentials').get().verifier).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    const sent = f.messages.length, other = f.device();
    const result = await login(f, passphrase, other);
    expect(result.user.id).toBe(f.result.user.id); expect(result.session.keyId).toBe(other.keyId);
    expect(f.messages).toHaveLength(sent);
    expect(f.db.prepare('SELECT restricted_until_ms-enrolled_ms AS cooling FROM auth_device_keys WHERE key_id=?').get(other.keyId).cooling).toBe(86400000);
    const fields = { sessionId: result.session.id, generation: 0, purpose: 'renew' };
    const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
    expect((await f.auth.sessions.renew({ ...fields, ...other.sign(challenge) })).session.generation).toBe(1);
});
test('wrong, unknown and SMS-only accounts fail without enrollment; SMS remains available', async () => {
    const f = await enrolled();
    await expect(login(f, passphrase)).rejects.toThrow('auth_password_rejected');
    f.advance(60100); await set(f, passphrase);
    await expect(login(f, passphrase + 'wrong')).rejects.toThrow('auth_password_rejected');
    f.advance(60100); await expect(login(f, passphrase, f.device(), '+33699999999')).rejects.toThrow('auth_password_rejected');
    expect(f.db.prepare('SELECT count(*) AS total FROM auth_device_keys').get().total).toBe(1);
    f.advance(60100); expect((await f.start(f.device())).ok).toBe(true);
});
test('password replacement requires current credential plus fresh device proof and revokes other sessions', async () => {
    const f = await enrolled(); await set(f, passphrase);
    const other = await login(f, passphrase, f.device());
    await expect(set(f, passphrase + ' next', 'incorrect')).rejects.toThrow('auth_password_rejected');
    expect(await set(f, passphrase + ' next', passphrase)).toEqual({ ok: true });
    await expect(f.auth.sessions.read(other.session.id)).rejects.toThrow('auth_session_invalid');
    expect(f.disconnected).toContain(other.session.id);
});
test('new passwords enforce code points, retain all input and fail closed on screening outage', async () => {
    await expect(hashPassword('🙂'.repeat(14))).rejects.toThrow('auth_password_too_short');
    const value = '🙂'.repeat(64) + ' with spaces ';
    const encoded = await hashPassword(value);
    expect((await verifyPassword(value, encoded)).ok).toBe(true);
    expect((await verifyPassword(value.trim(), encoded)).ok).toBe(false);
    expect((await verifyPassword(value, encoded.replace('m=19456', 'm=8192'))).ok).toBe(false);
    await expect(screenPassword(value, '')).rejects.toThrow('auth_password_screening_unavailable');
    const f = await enrolled(); await expect(set(f, 'compromised passphrase')).rejects.toThrow('auth_password_compromised');
    expect(f.db.prepare('SELECT count(*) AS total FROM auth_password_credentials').get().total).toBe(0);
});
test('legacy bcrypt is migrated only on success before issuing a session', async () => {
    const f = await enrolled();
    // Existing upstream bcrypt compatibility fixture, no bcrypt hash is generated.
    const legacy = '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGhM1A8W9iqaG3vv1BD7WC';
    f.db.prepare('INSERT INTO auth_password_credentials VALUES (?, ?, ?)').run(f.result.user.id, legacy, f.now());
    await expect(login(f, 'wrong')).rejects.toThrow('auth_password_rejected');
    expect(f.db.prepare('SELECT verifier FROM auth_password_credentials').get().verifier).toBe(legacy);
    f.advance(60100);
    expect((await login(f, 'envy1362987212538')).user.id).toBe(f.result.user.id);
    expect(f.db.prepare('SELECT verifier FROM auth_password_credentials').get().verifier).toMatch(/^\$argon2id\$/);
    expect(f.db.prepare("SELECT count(*) AS total FROM auth_security_events WHERE event_type='password_algorithm_upgraded'").get().total).toBe(1);
});
