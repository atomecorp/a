import { describe, it, expect } from 'vitest';
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
        expect(calls.filter(({ action }) => action === 'public')).toHaveLength(1);
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
