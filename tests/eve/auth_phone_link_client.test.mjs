import { describe, expect, it } from 'vitest';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';
import { messageHandlerMixin } from '../../atome/src/squirrel/apis/unified/adole_websocket_message.js';

describe('phone-link client serialization', () => {
    it('preserves first-launch fields through the canonical WebSocket response projection', () => {
        let result;
        const socket = { pendingRequests: new Map([['request', { timeout: null, resolve: value => { result = value; } }]]), ...messageHandlerMixin };
        socket.handleMessage(JSON.stringify({ type: 'auth-response', requestId: 'request', success: true,
            paymentRequired: true, payment: { mode: 'simulated' }, developmentLink: 'local-test-link', newAccount: true }));
        expect(result).toMatchObject({ ok: true, paymentRequired: true, payment: { mode: 'simulated' }, developmentLink: 'local-test-link', newAccount: true });
    });
    it('restores a payment-required attempt without SMS proof and signs simulation before subscribing', async () => {
        const records = new Map(), actions = [], now = 1800000000000;
        const device = { keyId: 'device', publicKey: {}, sign: async () => ({ challengeId: 'signed', signature: 'proof' }) };
        const devices = { forPhone: async () => device, randomHandle: () => 'nonce', put: async (key, value) => records.set(key, value),
            read: async key => records.get(key), remove: async key => records.delete(key) };
        const send = async message => {
            actions.push(message.action);
            if (message.action === 'phone-link-start') return { ok: true, attemptId: 'attempt', expiresAt: now + 60000, paymentRequired: true };
            if (message.action === 'phone-link-challenge') return { ok: true, challenge: { purpose: message.purpose, reference: 'attempt', issuedAt: now, nonce: 'server:nonce' } };
            return { ok: true, pending: true };
        };
        const client = createPhoneLinkClient({ devices, send, installSession: async () => {}, locks: null, now: () => now });
        expect(await client.start('+33612345678')).toMatchObject({ paymentRequired: true });
        const resumed = createPhoneLinkClient({ devices, send, installSession: async () => {}, locks: null, now: () => now });
        expect(await resumed.pendingAttempt()).toEqual({ phone: '+33612345678', expiresAt: now + 60000, paymentRequired: true });
        expect(await resumed.resume()).toMatchObject({ paymentRequired: true }); expect(actions).toEqual(['phone-link-start']);
        await resumed.simulatePayment('card');
        expect(actions).toEqual(['phone-link-start', 'phone-link-challenge', 'phone-link-simulate-payment', 'phone-link-challenge', 'phone-link-resume']);
        expect(records.get('attempt').paymentRequired).toBe(false);
        await resumed.resend();
        expect(actions.slice(-4)).toEqual(['phone-link-challenge', 'phone-link-resend', 'phone-link-challenge', 'phone-link-resume']);
    });
    it('consumes a local development link through the normal signed proof flow', async () => {
        const records = new Map();
        const actions = [];
        const now = 1_800_000_000_000;
        const attemptId = 'a'.repeat(43);
        const token = 'b'.repeat(43);
        const device = {
            keyId: 'device-key',
            publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
            sign: async ({ challenge }) => ({ challengeId: challenge, signature: 'signature' })
        };
        const devices = {
            forPhone: async () => device,
            randomHandle: () => 'client-nonce',
            put: async (key, value) => records.set(key, value),
            read: async (key) => records.get(key),
            remove: async (key) => records.delete(key)
        };
        let installed = null;
        const send = async (message) => {
            actions.push(message.action);
            if (message.action === 'phone-link-start') return { ok: true, attemptId, expiresAt: now + 60_000,
                developmentLink: `https://atome.one/auth/v/${attemptId}#t=${token}` };
            if (message.action === 'phone-link-challenge') return { ok: true, challenge: {
                purpose: 'consume', reference: attemptId, nonce: 'server:client-nonce',
                challenge: 'challenge', issuedAt: now, keyId: device.keyId
            } };
            return { ok: true, token: 'access', user: { id: 'user', phone: '+33612345678' },
                session: { keyId: device.keyId } };
        };
        const client = createPhoneLinkClient({ devices, send,
            installSession: async (result) => { installed = result; }, locks: null, now: () => now });

        await expect(client.start('+33612345678')).resolves.toMatchObject({ ok: true, token: 'access' });
        expect(actions).toEqual(['phone-link-start', 'phone-link-challenge', 'phone-link-consume']);
        expect(installed?.user?.id).toBe('user');
        expect(records.has('attempt')).toBe(false);
    });

    it('preserves the callback result when embedded WebKit Web Locks discards it', async () => {
        const records = new Map();
        const actions = [];
        const now = 1_800_000_000_000;
        const device = {
            keyId: 'device-key',
            publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
            sign: async ({ challenge }) => ({ challengeId: challenge, signature: 'signature' })
        };
        const devices = {
            forPhone: async () => device,
            randomHandle: () => 'client-nonce',
            put: async (key, value) => records.set(key, value),
            read: async (key) => records.get(key)
        };
        const send = async (message) => {
            actions.push(message.action);
            if (message.action === 'phone-link-start') {
                return { ok: true, attemptId: 'attempt', expiresAt: now + 60_000 };
            }
            if (message.action === 'phone-link-challenge') {
                return { ok: true, challenge: {
                    purpose: 'resume', reference: 'attempt', nonce: 'server:client-nonce',
                    challenge: 'challenge', issuedAt: now, keyId: device.keyId
                } };
            }
            return { ok: true, pending: true };
        };
        const locks = {
            request: async (_name, callback) => { await callback(); return undefined; }
        };
        const client = createPhoneLinkClient({ devices, send, installSession: async () => {}, locks, now: () => now });

        await expect(client.start('+33612345678')).resolves.toMatchObject({ ok: true, pending: true });
        expect(actions).toEqual(['phone-link-start', 'phone-link-challenge', 'phone-link-resume']);
    });

    it('confirms a foreign SMS link without requiring or installing a session on its opener', async () => {
        const actions = [];
        let installed = false;
        const devices = {
            read: async () => null,
            randomHandle: () => 'unused',
            keys: async () => []
        };
        const client = createPhoneLinkClient({
            devices,
            locks: null,
            send: async (message) => {
                actions.push(message);
                return { ok: true, approved: true };
            },
            installSession: async () => { installed = true; }
        });
        const attemptId = 'a'.repeat(43);
        const token = 'b'.repeat(43);
        await expect(client.consumeLink(`https://atome.one/auth/v/${attemptId}#t=${token}`))
            .resolves.toEqual({ ok: true, approved: true });
        expect(actions).toEqual([{ type: 'auth', action: 'phone-link-confirm', attemptId, token }]);
        expect(installed).toBe(false);
    });
});
