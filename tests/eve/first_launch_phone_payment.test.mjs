import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPhoneLinkAuth } from '../../server/auth_phone_link.js';
import { authSigningMessage, parseAuthLink } from '../../atome/src/shared/auth_link_contract.js';
import { digest } from '../../server/auth_link_security.js';

const databases = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });
const fixture = ({ existing = false, failSms = false } = {}) => {
    const db = new Database(':memory:'); databases.push(db);
    db.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
    let clock = 1800000000000, links = [], created = 0;
    const accounts = new Map(existing ? [['+33612345678', { user_id: 'existing', phone: '+33612345678' }]] : []);
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk0 = publicKey.export({ format: 'jwk' }), jwk = { kty: 'EC', crv: 'P-256', x: jwk0.x, y: jwk0.y };
    const keyId = digest(JSON.stringify(jwk));
    const service = createPhoneLinkAuth({ query: async (mode, sql, args = []) => db.prepare(sql)[mode](...args),
        transaction: async callback => { db.exec('BEGIN'); try { const result = await callback(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
        findByPhone: async phone => accounts.get(phone), findById: async id => [...accounts.values()].find(a => a.user_id === id),
        createAccount: async phone => { created++; const account = { user_id: 'new', phone, first_launch_version: 1 }; accounts.set(phone, account); return account; },
        sendLink: async (_phone, link) => { if (failSms) throw new Error('provider'); links.push(link); return { accepted: true }; },
        masterSecret: 'test-secret-for-isolated-database-only', issueAccess: async () => 'test-access', now: () => clock, notify: async () => {} });
    const start = () => service.start({ phone: '+33612345678', publicKey: jwk, clientNonce: 'n'.repeat(43) }, 'test-network');
    const proof = async (attemptId, purpose) => {
        const { challenge } = await service.getChallenge({ attemptId, keyId, purpose }, 'test-network');
        return { attemptId, challengeId: challenge.challenge, signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)),
            { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
    };
    return { db, service, start, proof, links, created: () => created, advance: ms => { clock += ms; } };
};
describe('first-launch server payment and phone proof', () => {
    it('sends the same initial response for new and existing numbers', async () => {
        const fresh = fixture(), known = fixture({ existing: true });
        const a = await fresh.start(), b = await known.start();
        expect(Object.keys(a)).toEqual(Object.keys(b));
        expect(a.paymentRequired).toBeUndefined(); expect(b.paymentRequired).toBeUndefined();
        expect(fresh.links).toHaveLength(1); expect(known.links).toHaveLength(1);
        expect(fresh.created()).toBe(0);
    });
    it('requires SMS before payment and issues one session only after both proofs', async () => {
        const f = fixture(), a = await f.start();
        const pay = async () => f.service.simulatePayment({ ...await f.proof(a.attemptId, 'simulate-payment'), method: 'card' });
        await expect(pay()).rejects.toThrow();
        expect(await f.service.complete({ ...await f.proof(a.attemptId, 'resume'), action: 'resume' })).toMatchObject({ pending: true });
        const bad = await f.proof(a.attemptId, 'consume');
        await expect(f.service.complete({ ...bad, token: 'b'.repeat(43) })).rejects.toThrow();
        expect(await f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(a.attemptId, 'consume') })).toMatchObject({ paymentRequired: true });
        expect(f.created()).toBe(0);
        expect(f.db.prepare('SELECT count(*) AS n FROM auth_device_sessions').get().n).toBe(0);
        const result = await pay();
        expect(result).toMatchObject({ newAccount: true, user: { first_launch_version: 1 }, payment: { mode: 'simulated', amountCents: 1200 } });
        expect(f.created()).toBe(1); expect(f.links).toHaveLength(1);
        await expect(pay()).rejects.toThrow();
    });
    it('resends before proof, invalidates the old link, preserves expiry and counts actual sends', async () => {
        const f = fixture(), a = await f.start();
        await expect(f.service.resend(await f.proof(a.attemptId, 'resend'))).rejects.toThrow('auth_rate_limited');
        f.advance(60001);
        const resent = await f.service.resend(await f.proof(a.attemptId, 'resend'));
        expect(resent.expiresAt).toBe(a.expiresAt); expect(f.links).toHaveLength(2);
        expect(f.db.prepare("SELECT count FROM auth_send_limits WHERE bucket='sms-daily'").get().count).toBe(2);
        await expect(f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(a.attemptId, 'consume') })).rejects.toThrow();
        expect(await f.service.complete({ ...parseAuthLink(f.links[1]), ...await f.proof(a.attemptId, 'consume') })).toMatchObject({ paymentRequired: true });
        const count = f.links.length;
        expect(await f.service.resend(await f.proof(a.attemptId, 'resend'))).toMatchObject({ paymentRequired: true });
        expect(f.links).toHaveLength(count);
    });
    it('existing accounts keep their identity without payment, through a delayed recovery request', async () => {
        const f = fixture({ existing: true }), a = await f.start();
        const result = await f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(a.attemptId, 'consume') });
        expect(result).toMatchObject({ ok: true, recoveryPending: true }); expect(result.paymentRequired).toBeUndefined(); expect(f.created()).toBe(0);
        expect(f.db.prepare('SELECT principal_id FROM auth_recovery_requests').get().principal_id).toBe('existing');
    });
    it('rejects expired verified payments and legacy unpaid attempts', async () => {
        const f = fixture(), a = await f.start();
        await f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(a.attemptId, 'consume') });
        const input = { ...await f.proof(a.attemptId, 'simulate-payment'), method: 'paypal' };
        f.advance(300000); await expect(f.service.simulatePayment(input)).rejects.toThrow('auth_attempt_expired');
        const legacy = fixture(), b = await legacy.start();
        legacy.db.prepare("UPDATE auth_link_attempts SET state='awaiting_payment'").run();
        await expect(legacy.service.simulatePayment({ ...await legacy.proof(b.attemptId, 'simulate-payment'), method: 'card' })).rejects.toThrow();
        expect(f.created()).toBe(0); expect(legacy.created()).toBe(0);
    });
    it('blocks uncertain delivery, charges once and permits signed cancellation', async () => {
        const f = fixture({ failSms: true });
        await expect(f.start()).rejects.toThrow('sms_delivery_unavailable');
        const row = f.db.prepare('SELECT * FROM auth_link_attempts').get();
        expect(row.state).toBe('blocked'); expect(f.created()).toBe(0);
        expect(f.db.prepare("SELECT count FROM auth_send_limits WHERE bucket='sms-daily'").get().count).toBe(1);
        expect(await f.service.cancel(await f.proof(row.attempt_id, 'cancel'))).toEqual({ ok: true });
    });
});
