import { afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPhoneLinkAuth } from '../../server/auth_phone_link.js';
import { createBillingLedger } from '../../server/billing/billing_ledger.js';
import { createStorePurchases } from '../../server/billing/store_purchases.js';
import { publicDeviceKey, randomHandle } from '../../server/auth_link_security.js';
import { authSigningMessage, parseAuthLink } from '../../atome/src/shared/auth_link_contract.js';

const databases = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
export function fixture({ failDelivery = false, dailyLimit = 20, screenPassword, apple = null, google = null } = {}) {
    const db = new Database(':memory:');
    databases.push(db);
    db.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../../database/auth_security_schema.sql', import.meta.url), 'utf8'));
    let clock = 1800000000000;
    let tail = Promise.resolve();
    const accounts = new Map();
    const messages = [];
    const disconnected = [];
    const attempts = new Map();
    const notices = [];
    const query = async (method, sql, params = []) => db.prepare(sql)[method](...params);
    const transaction = (work) => {
        const result = tail.then(async () => {
            db.exec('BEGIN IMMEDIATE');
            try { const value = await work(); db.exec('COMMIT'); return value; }
            catch (error) { db.exec('ROLLBACK'); throw error; }
        });
        tail = result.catch(() => {});
        return result;
    };
    const ledger = createBillingLedger({ query, transaction, now: () => clock });
    const billing = createStorePurchases({ ledger, query, apple, google });
    const auth = createPhoneLinkAuth({ query, transaction, billing, screenPassword, now: () => clock, masterSecret: 'test-only-secret-material'.repeat(3), dailyLimit,
        findByPhone: async (phone) => accounts.get(phone), findById: async (id) => [...accounts.values()].find((a) => a.user_id === id),
        replacePhone: async (id, phone) => { const entry = [...accounts.entries()].find(([, value]) => value.user_id === id); if (!entry || accounts.has(phone)) throw new Error('phone_change_invalid'); accounts.delete(entry[0]); accounts.set(phone, { ...entry[1], phone }); },
        deleteAccount: async id => { for (const [phone, value] of accounts) if (value.user_id === id) accounts.delete(phone); },
        createAccount: async (phone) => { const account = { user_id: crypto.randomUUID(), username: 'User', phone }; accounts.set(phone, account); return account; },
        sendLink: async (phone, url) => { messages.push({ phone, url }); if (failDelivery) throw new Error('provider_failed'); },
        issueAccess: async ({ sessionId }) => `test-access:${sessionId}`, disconnectSession: async (id) => disconnected.push(id),
        notify: async (principalId, notice, options = {}) => notices.push({ principalId, ...notice, options }) });
    const device = () => {
        const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const { jwk, keyId } = publicDeviceKey(keys.publicKey.export({ format: 'jwk' }));
        return { jwk, keyId, sign: (challenge) => ({ challengeId: challenge.challenge,
            signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)),
                { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') }) };
    };
    async function start(key, phone = '+33612345678') {
        const attempt = await auth.start({ phone, publicKey: key.jwk, clientNonce: randomHandle() }, '192.0.2.1');
        attempts.set(attempt.attemptId, { key, pairingCode: attempt.pairingCode });
        return attempt;
    }
    async function complete(input) {
        const result = await auth.complete(input);
        if (!result.paymentRequired) return result;
        const { key } = attempts.get(input.attemptId);
        const { challenge } = await auth.getChallenge({ attemptId: input.attemptId, keyId: key.keyId, purpose: 'payment' }, '192.0.2.1');
        return auth.pay({ attemptId: input.attemptId, payment: { method: 'card' }, ...key.sign(challenge) });
    }
    async function input(key, attemptId, purpose = 'consume') {
        const { challenge } = await auth.getChallenge({ attemptId, keyId: key.keyId, purpose }, '192.0.2.1');
        return { attemptId, action: purpose, ...key.sign(challenge), pairingCode: attempts.get(attemptId)?.pairingCode, token: parseAuthLink(messages.at(-1).url).token };
    }
    return { now: () => clock, auth, billing, ledger, complete, db, query, transaction, accounts, messages, disconnected, notices, device, start, input,
        advance: (ms) => { clock += ms; } };
}
