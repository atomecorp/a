import { describe, it, test, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import crypto from 'node:crypto';
import { createAuthDeviceStore } from '../../atome/src/squirrel/security/auth_device.js';
import { authSigningMessage } from '../../atome/src/shared/auth_link_contract.js';

describe('device authentication keys', () => {
    it('retains a non-exportable signing identity across restart', async () => {
        const indexedDB = new IDBFactory();
        const first = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto });
        const a = await first.forPhone('+33612345678'); await first.close();
        const next = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto });
        const b = await next.forPhone('+33612345678');
        expect(a.keyId).toBe(b.keyId);
        const challenge = { purpose: 'consume', reference: 'attempt', nonce: 'nonce', challenge: 'challenge', issuedAt: 1, keyId: b.keyId };
        const signed = await b.sign(challenge);
        expect(crypto.verify('sha256', Buffer.from(authSigningMessage(challenge)), {
            key: crypto.createPublicKey({ key: b.publicKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363'
        }, Buffer.from(signed.signature, 'base64url'))).toBe(true);
        const other = await next.forPhone('+33612345679');
        expect(other.keyId).not.toBe(b.keyId);
        await next.close();
    });
    it('converges concurrent first-use tabs onto one identity', async () => {
        const indexedDB = new IDBFactory();
        const a = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto });
        const b = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto });
        const keys = await Promise.all([a.forPhone('+33612345678'), b.forPhone('+33612345678')]);
        expect(keys[0].keyId).toBe(keys[1].keyId);
        await a.close(); await b.close();
    });
    it('does not persist a WebCrypto lookup key when a native keystore is available', async () => {
        const indexedDB = new IDBFactory();
        const calls = [];
        const nativeKey = async (request) => {
            calls.push(request);
            if (request.action === 'public') {
                return {
                    x: Buffer.alloc(32, 1).toString('base64url'),
                    y: Buffer.alloc(32, 2).toString('base64url')
                };
            }
            return 'native-signature';
        };
        const first = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto, nativeKey });
        const a = await first.forPhone('+33612345678');
        expect(await first.read('lookup-key')).toBeUndefined();
        await first.close();

        const next = createAuthDeviceStore({ indexedDB, crypto: crypto.webcrypto, nativeKey });
        const b = await next.forPhone('+33612345678');
        expect(a.scope).toMatch(/^[a-f0-9]{64}$/);
        expect(b.scope).toBe(a.scope);
        expect(b.keyId).toBe(a.keyId);
        expect(calls.filter(({ action }) => action === 'public')).toHaveLength(2);
        expect(await next.read('lookup-key')).toBeUndefined();
        await next.close();
    });
    it('fails explicitly when protected persistence is unavailable', async () => {
        const store = createAuthDeviceStore({ indexedDB: null, crypto: crypto.webcrypto });
        await expect(store.forPhone('+33612345678')).rejects.toThrow('auth_protected_storage_unavailable');
    });
    it('uses the native keystore by scope when Web storage is unavailable', async () => {
        const nativeKey = async ({ action }) => {
            if (action !== 'public') throw new Error('unexpected_action');
            return {
                x: Buffer.alloc(32, 3).toString('base64url'),
                y: Buffer.alloc(32, 4).toString('base64url')
            };
        };
        const store = createAuthDeviceStore({ indexedDB: null, crypto: crypto.webcrypto, nativeKey });
        const device = await store.forScope('a'.repeat(64));
        expect(device.scope).toBe('a'.repeat(64));
        expect(device.keyId).toMatch(/^[a-f0-9]{64}$/);
    });
});

for (const unavailable of [false, true]) test(`native descriptor survives missing WebKit session storage (${unavailable}) without caching a bearer`, async () => {
 const session={phone:'+33612345678',userId:'qa-remote',session:{id:'qa-session',generation:3,keyId:'qa-device'}};
 const grant={remoteSessionKnown:true,remoteSession:session,remotePrincipal:session.userId,keyId:'qa-device',locked:false};
 const store=createAuthDeviceStore({indexedDB:unavailable?null:new IDBFactory(),crypto:crypto.webcrypto,nativeSession:{read:async()=>grant,clear:async()=>{grant.remoteSession=null;}}});
 expect(await store.read('session')).toEqual(session);expect(JSON.stringify(await store.read('session'))).not.toContain('token');
 await store.remove('session');expect(await store.read('session')).toBeUndefined();await store.close();
});
test('a durable tombstone or local lock overrides an older cached session; another account cannot take its place',async()=>{
 const session={phone:'+33612345678',userId:'qa-A',session:{id:'qa-session-A',generation:7,keyId:'qa-device-A'}};
 const grant={remoteSessionKnown:true,remoteSession:session,remotePrincipal:'qa-A',keyId:'qa-device-A',locked:false};
 const store=createAuthDeviceStore({indexedDB:new IDBFactory(),crypto:crypto.webcrypto,nativeSession:{read:async()=>grant,clear:async()=>{grant.remoteSession=null;}}});
 await store.put('session',session);grant.remoteSession=null;expect(await store.read('session')).toBeUndefined();
 grant.remoteSessionKnown=false;grant.locked=true;expect(await store.read('session')).toBeUndefined();
 grant.locked=false;grant.remotePrincipal='qa-B';grant.keyId='qa-device-B';expect(await store.read('session')).toBeUndefined();await store.close();
});
test('only a newer generation of the same account, key and session can bridge an interrupted native bind',async()=>{
 const durable={phone:'+33612345678',userId:'qa-A',session:{id:'qa-session',generation:3,keyId:'qa-device'}};
 const grant={remoteSessionKnown:true,remoteSession:durable,remotePrincipal:'qa-A',keyId:'qa-device',locked:false};
 const store=createAuthDeviceStore({indexedDB:new IDBFactory(),crypto:crypto.webcrypto,nativeSession:{read:async()=>grant,clear:async()=>{}}});
 await store.put('session',{...durable,session:{...durable.session,generation:4}});expect((await store.read('session')).session.generation).toBe(4);
 await store.put('session',{...durable,userId:'qa-B'});expect(await store.read('session')).toEqual(durable);
 await store.put('session',{...durable,session:{...durable.session,id:'foreign-session'}});expect(await store.read('session')).toEqual(durable);await store.close();
});
test('native clear failure retains both descriptors rather than falsely reporting logout',async()=>{
 const record={phone:'+33612345678',userId:'qa-A',session:{id:'qa-session',generation:3,keyId:'qa-device'}};
 const store=createAuthDeviceStore({indexedDB:new IDBFactory(),crypto:crypto.webcrypto,nativeSession:{read:async()=>({remoteSessionKnown:true,remoteSession:record,remotePrincipal:'qa-A',keyId:'qa-device'}),clear:async()=>{throw new Error('auth_proof_invalid');}}});
 await store.put('session',record);await expect(store.remove('session')).rejects.toThrow('auth_proof_invalid');expect(await store.read('session')).toEqual(record);await store.close();
});

test('native enrolled scope remains usable when the optional WebView database never opens', async () => {
    const calls = [];
    const store = createAuthDeviceStore({ indexedDB: { open: () => ({}) }, crypto: crypto.webcrypto,
        nativeKey: async request => { calls.push(request); return request.action === 'public'
            ? { x: Buffer.alloc(32, 1).toString('base64url'), y: Buffer.alloc(32, 2).toString('base64url') } : 'native-proof'; } });
    const key = await store.forScope('persisted-enrollment');
    const proof = await key.sign({ keyId: key.keyId, purpose: 'local-resume', reference: 'grant:4', challenge: 'nonce', nonce: 'nonce', issuedAt: 1 });
    expect(proof.signature).toBe('native-proof');
    expect(calls.map(call => [call.action, call.scope])).toEqual([
        ['public', 'persisted-enrollment'], ['sign', 'persisted-enrollment']
    ]);
});
