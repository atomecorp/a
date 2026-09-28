import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';
import { authSigningMessage } from '../../atome/src/shared/auth_link_contract.js';
import { publicDeviceKey, randomHandle } from '../../server/auth_link_security.js';

const endpoint = process.env.AUTH_E2E_WS_URL || 'ws://127.0.0.1:3101/ws/api';
const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const { jwk: publicKey, keyId } = publicDeviceKey(keys.publicKey.export({ format: 'jwk' }));
const records = new Map();
const actions = [];

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
    randomHandle,
    put: async (name, value) => records.set(name, value),
    read: async (name) => records.get(name),
    remove: async (name) => records.delete(name),
    keys: async (prefix) => [...records.keys()].filter((name) => name.startsWith(prefix)),
    aliasPhone: async () => {}
};

async function send(message) {
    const requestId = crypto.randomUUID();
    actions.push(message.action);
    return new Promise((resolve, reject) => {
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
}

let installed;
const client = createPhoneLinkClient({
    devices,
    send,
    locks: null,
    installSession: async (result) => { installed = result; }
});

const result = await client.start('+33600000001');
assert.equal(result.ok, true);
assert.equal(result.session.keyId, keyId);
assert.equal(installed.user.id, result.user.id);
assert.equal(records.has('attempt'), false);
assert.deepEqual(actions, ['phone-link-start', 'phone-link-challenge', 'phone-link-consume']);

console.log(JSON.stringify({
    ok: true,
    automatic: true,
    smsSent: false,
    actions
}));
