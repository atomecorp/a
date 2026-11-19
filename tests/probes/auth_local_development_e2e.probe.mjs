// The browser's phone-link client signs in end to end against a real, isolated atome-server (its SMS mock:
// tests/helpers/probe_server.mjs): start, challenge, consume, the simulated payment of a new account, then the
// existing account signing in again with no payment, the attempt gone from the device's records each time.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';
import { createStorePurchase } from '../../atome/src/squirrel/billing/store_purchase.js';
import { authDeviceKey, authSigningMessage } from '../../atome/src/shared/auth_link_contract.js';
import { startServer } from '../helpers/probe_server.mjs';

const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const { publicKey, keyId } = await authDeviceKey(keys.publicKey.export({ format: 'jwk' }));
const records = new Map();

const device = {
    keyId,
    publicKey,
    sign: async (challenge) => ({
        challengeId: challenge.challenge,
        signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)), {
            key: keys.privateKey,
            dsaEncoding: 'ieee-p1363'
        }).toString('base64url')
    })
};

const devices = {
    forPhone: async () => device,
    randomHandle: () => crypto.randomBytes(32).toString('base64url'),
    put: async (name, value) => records.set(name, value),
    read: async (name) => records.get(name),
    remove: async (name) => records.delete(name),
    keys: async (prefix) => [...records.keys()].filter((name) => name.startsWith(prefix)),
    aliasPhone: async () => {}
};

const signIn = async (endpoint, phone) => {
    const actions = [];
    const send = (message) => new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        actions.push(message.action);
        const socket = new WebSocket(endpoint);
        const timer = setTimeout(() => {
            socket.terminate();
            reject(new Error('auth_e2e_timeout'));
        }, 10_000);
        socket.once('open', () => socket.send(JSON.stringify({ ...message, requestId })));
        socket.once('error', reject);
        socket.on('message', (raw) => {
            const response = JSON.parse(String(raw));
            if (response.requestId !== requestId) return;
            clearTimeout(timer);
            socket.close();
            resolve(response);
        });
    });
    let installed = null;
    const client = createPhoneLinkClient({
        devices, send, locks: null, storePurchase: createStorePurchase({ host: null }),
        installSession: async (result) => { installed = result; }
    });
    let result = await client.start(phone);
    if (result?.paymentRequired) result = await client.pay({ method: 'paypal' });
    return { result, installed, actions };
};

const server = await startServer();
try {
    const phone = `+33994${String(process.pid % 50000).padStart(5, '0')}`;
    const first = await signIn(server.url, phone);
    assert.equal(first.result.ok, true, JSON.stringify(first.result));
    assert.equal(first.result.session.keyId, keyId);
    assert.equal(first.installed.user.id, first.result.user.id);
    assert.equal(records.has('attempt'), false);
    // A new account: the consume answers that a payment is required; the payment, signed on a challenge of its own
    // (auth_phone_link_client.js#attemptProof), settles the attempt.
    assert.deepEqual(first.actions, [
        'phone-link-start', 'phone-link-challenge', 'phone-link-consume', 'phone-link-challenge', 'phone-link-payment'
    ]);

    // One SMS a minute for a number (auth/phone_link/mod.rs, `phone-minute`): a new start inside it is refused, and
    // leaves no attempt behind; past the minute the existing account signs in.
    await assert.rejects(signIn(server.url, phone), /auth_rate_limited/);
    assert.equal(records.has('attempt'), false);
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const again = await signIn(server.url, phone);
    assert.equal(again.result.ok, true, JSON.stringify(again.result));
    assert.equal(again.result.user.id, first.result.user.id);
    assert.deepEqual(again.actions, ['phone-link-start', 'phone-link-challenge', 'phone-link-consume']);
    assert.equal(records.has('attempt'), false);
    console.log(JSON.stringify({ ok: true, first: first.actions, again: again.actions }));
} finally {
    await server.stop();
}
