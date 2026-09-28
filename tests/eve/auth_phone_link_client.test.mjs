import { describe, expect, it } from 'vitest';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';

describe('phone-link client serialization', () => {
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
