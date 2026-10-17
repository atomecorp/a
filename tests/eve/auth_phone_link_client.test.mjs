import { describe, expect, it, test, vi } from 'vitest';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';
import { messageHandlerMixin } from '../../atome/src/squirrel/apis/unified/adole_websocket_message.js';

describe('phone-link client serialization', () => {
    it('preserves first-launch fields through the canonical WebSocket response projection', () => {
        let result;
        const socket = { pendingRequests: new Map([['request', { timeout: null, resolve: value => { result = value; } }]]), ...messageHandlerMixin };
        socket.handleMessage(JSON.stringify({ type: 'auth-response', requestId: 'request', success: true,
            paymentRequired: true, payment: { mode: 'simulated' }, developmentLink: 'local-test-link', newAccount: true, serverNow: 123, pairingCode: '12345678' }));
        expect(result).toMatchObject({ ok: true, paymentRequired: true, payment: { mode: 'simulated' }, developmentLink: 'local-test-link', newAccount: true, serverNow: 123, pairingCode: '12345678' });
    });
    it('restores a verified payment and revalidates without another SMS or deadline reset', async () => {
        const records = new Map(), actions = [], initial = 1800000000000;
        let clock = initial, verified = false;
        const device = { keyId: 'device', publicKey: {}, sign: async () => ({ challengeId: 'signed', signature: 'proof' }) };
        const devices = { forPhone: async () => device, randomHandle: () => 'nonce', put: async (key, value) => records.set(key, value),
            read: async key => records.get(key), remove: async key => records.delete(key) };
        const send = async message => {
            actions.push(message.action);
            if (message.action === 'phone-link-start') return { ok: true, attemptId: 'attempt', expiresAt: initial + 300000, serverNow: clock, pairingCode: '12345678' };
            if (message.action === 'phone-link-challenge') return { ok: true, challenge: { purpose: message.purpose, reference: 'attempt', issuedAt: clock, nonce: 'server:nonce' } };
            if (message.action === 'phone-link-simulate-payment') return { ok: true, token: 'access', user: { id: 'user', phone: '+33612345678' }, session: { keyId: device.keyId } };
            return { ok: true, pending: true, expiresAt: initial + 300000, serverNow: clock, pairingCode: '12345678', ...(verified ? { paymentRequired: true } : {}) };
        };
        const make = () => createPhoneLinkClient({ devices, send, installSession: async () => {}, locks: null, now: () => clock });
        await make().start('+33612345678');
        clock += 120000;
        const resumed = make();
        expect(await resumed.pendingAttempt()).toMatchObject({ expiresAt: initial + 300000, pairingCode: '12345678', paymentRequired: false });
        await resumed.resume();
        expect((await resumed.pendingAttempt()).expiresAt - clock).toBe(180000);
        verified = true; await resumed.resume();
        expect(await make().pendingAttempt()).toMatchObject({ paymentRequired: true, expiresAt: initial + 300000 });
        expect(actions.filter(action => action === 'phone-link-start')).toHaveLength(1);
        expect(await resumed.simulatePayment('card')).toMatchObject({ token: 'access' });
        expect(records.has('attempt')).toBe(false);
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

    it('requires a transferred pairing code before confirming a foreign link', async () => {
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
            .resolves.toEqual({ ok: true, confirmationRequired: true });
        expect(actions).toEqual([]);
        expect(await client.pendingAttempt()).toEqual({ confirmationRequired: true });
        await expect(client.confirmLink('bad')).rejects.toThrow('auth_pairing_invalid');
        expect(actions).toEqual([]);
        await expect(client.confirmLink('1234 5678')).resolves.toEqual({ ok: true, approved: true });
        expect(actions).toEqual([{ type: 'auth', action: 'phone-link-confirm', attemptId, token, pairingCode: '12345678' }]);
        expect(installed).toBe(false);
    });
});

test('logout captures the durable descriptor before local locking erases it, then proves remote revocation',async()=>{
 let record={phone:'+33612345678',session:{id:'qa-session',generation:3}};
 const actions=[];const devices={read:async()=>record,forPhone:async()=>({keyId:'qa-key',sign:async()=>({challengeId:'qa-proof',signature:'qa-signature'})}),remove:async()=>{actions.push('clear');},put:async()=>{}};
 const client=createPhoneLinkClient({devices,locks:null,installSession:async()=>{},now:()=>1800000000000,send:async message=>{
 actions.push(message.action);expect(message.sessionId).toBe('qa-session');
 return message.action==='session-challenge'?{ok:true,challenge:{purpose:'logout',reference:'qa-session:3',issuedAt:1800000000000}}:{ok:true};
 }});
 await client.revoke('logout',undefined,async()=>{actions.push('local-lock');record=null;});
 expect(actions).toEqual(['local-lock','session-challenge','session-logout','clear']);
});
test('failed native lock prevents remote logout and leaves the descriptor usable',async()=>{
 const send=vi.fn();const client=createPhoneLinkClient({devices:{read:async()=>({phone:'+33612345678',session:{id:'qa-session'}})},send,locks:null,installSession:async()=>{}});
 await expect(client.revoke('logout',undefined,async()=>{throw new Error('auth_proof_invalid');})).rejects.toThrow('auth_proof_invalid');expect(send).not.toHaveBeenCalled();
});
