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
        masterSecret: 'test-secret-for-isolated-database-only', issueAccess: async () => 'test-access', now: () => clock });
    const start = () => service.start({ phone: '+33612345678', publicKey: jwk, clientNonce: 'n'.repeat(43) }, 'test-network');
    const proof = async (attemptId, purpose) => {
        const { challenge } = await service.getChallenge({ attemptId, keyId, purpose }, 'test-network');
        return { attemptId, challengeId: challenge.challenge, signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)),
            { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
    };
    return { db, service, start, proof, links, created: () => created, advance: ms => { clock += ms; } };
};
describe('first-launch server payment and phone proof', () => {
    it('resends through the same paid attempt, invalidates the old link and enforces limits', async () => {
        const f = fixture(), prepared = await f.start();
        await f.service.simulatePayment({ ...await f.proof(prepared.attemptId, 'simulate-payment'), method: 'card' });
        await expect(f.service.resend(await f.proof(prepared.attemptId, 'resend'))).rejects.toThrow('auth_rate_limited');
        f.advance(60001); await f.service.resend(await f.proof(prepared.attemptId, 'resend'));
        expect(f.links).toHaveLength(2); expect(f.created()).toBe(0);
        expect(f.db.prepare("SELECT COUNT(*) AS total FROM auth_security_events WHERE event_type LIKE 'payment_simulated:%'").get().total).toBe(1);
        await expect(f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(prepared.attemptId, 'consume') })).rejects.toThrow();
        expect((await f.service.complete({ ...parseAuthLink(f.links[1]), ...await f.proof(prepared.attemptId, 'consume') })).newAccount).toBe(true);
    });
    it('prepares a new number without SMS or account; simulation sends once and still requires the SMS token', async () => {
        const f = fixture(), prepared = await f.start();
        expect(prepared.paymentRequired).toBe(true); expect(f.links).toHaveLength(0); expect(f.created()).toBe(0);
        await expect(f.service.complete(await f.proof(prepared.attemptId, 'resume'))).rejects.toThrow();
        const payment = await f.service.simulatePayment({ ...await f.proof(prepared.attemptId, 'simulate-payment'), method: 'card' });
        expect(payment.payment).toMatchObject({ mode: 'simulated', amountCents: 1200, period: 'month' });
        expect(f.links).toHaveLength(1); expect(f.created()).toBe(0);
        await f.service.simulatePayment({ ...await f.proof(prepared.attemptId, 'simulate-payment'), method: 'card' });
        expect(f.links).toHaveLength(1);
        const badProof = await f.proof(prepared.attemptId, 'consume');
        await expect(f.service.complete({ ...badProof, token: 'b'.repeat(43) })).rejects.toThrow(); expect(f.created()).toBe(0);
        const completed = await f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(prepared.attemptId, 'consume') });
        expect(completed.newAccount).toBe(true); expect(completed.user.first_launch_version).toBe(1); expect(f.created()).toBe(1);
        await expect(f.service.complete({ ...parseAuthLink(f.links[0]), ...badProof })).rejects.toThrow();
    });
    it('existing accounts receive SMS immediately and keep their original identity without payment', async () => {
        const f = fixture({ existing: true }), prepared = await f.start();
        expect(prepared.paymentRequired).toBeUndefined(); expect(f.links).toHaveLength(1);
        const result = await f.service.complete({ ...parseAuthLink(f.links[0]), ...await f.proof(prepared.attemptId, 'consume') });
        expect(result.user.id).toBe('existing'); expect(result.newAccount).toBe(false); expect(f.created()).toBe(0);
    });
    it('rejects an expired payment and preserves the absence of a new account', async () => {
        const f = fixture(), prepared = await f.start(), signed = await f.proof(prepared.attemptId, 'simulate-payment');
        f.advance(300001);
        await expect(f.service.simulatePayment({ ...signed, method: 'paypal' })).rejects.toThrow();
        expect(f.links).toHaveLength(0); expect(f.created()).toBe(0);
    });
    it('marks a delivery failure without issuing an account or allowing an SMS proof', async () => {
        const f = fixture({ failSms: true }), prepared = await f.start();
        await expect(f.service.simulatePayment({ ...await f.proof(prepared.attemptId, 'simulate-payment'), method: 'wero' })).rejects.toThrow('sms_delivery_unavailable');
        expect(f.created()).toBe(0); expect(f.db.prepare('SELECT state FROM auth_link_attempts').get().state).toBe('blocked');
        expect(await f.service.cancel(await f.proof(prepared.attemptId, 'cancel'))).toEqual({ ok: true });
        expect(f.db.prepare('SELECT state FROM auth_link_attempts').get().state).toBe('cancelled');
    });
});
