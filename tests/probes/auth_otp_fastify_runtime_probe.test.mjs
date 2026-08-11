import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = String(process.env.ADOLE_TEST_WS_URL || '').trim();
if (!url) throw new Error('ADOLE_TEST_WS_URL is required');
const parsedUrl = new URL(url);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)) {
    throw new Error('auth_otp_runtime_probe_requires_loopback_server');
}

const connect = () => new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
});

let requestCounter = 0;
const request = (socket, payload) => new Promise((resolve, reject) => {
    const requestId = `auth_probe_${++requestCounter}`;
    const timeout = setTimeout(() => reject(new Error(`request_timeout:${payload.action}`)), 5000);
    const onMessage = (raw) => {
        const message = JSON.parse(String(raw));
        if ((message.requestId || message.request_id) !== requestId) return;
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(message);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ type: 'auth', ...payload, requestId }));
});

const close = (socket) => new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) return resolve();
    socket.once('close', resolve);
    socket.close();
});

const suffix = String(Date.now()).slice(-8);
const phone = `+99910${suffix}`;
const unverifiedPhone = `+99920${suffix}`;
const password = 'ServerAcceptance-42';
const firstSocket = await connect();

try {
    const lookup = await request(firstSocket, { action: 'lookup-phone', phone });
    assert.equal(lookup.success, false);
    assert.equal(lookup.error, 'User not found');

    const otp = await request(firstSocket, {
        action: 'request-phone-verification',
        phone,
        purpose: 'enrollment'
    });
    assert.equal(otp.success, true);
    assert.match(otp.code, /^\d{6}$/);
    assert.notEqual(otp.otpBypassed, true);

    const invalidOtp = await request(firstSocket, {
        action: 'verify-phone-verification',
        phone,
        code: '000000',
        purpose: 'enrollment'
    });
    assert.equal(invalidOtp.success, false);

    const verifiedOtp = await request(firstSocket, {
        action: 'verify-phone-verification',
        phone,
        code: otp.code,
        purpose: 'enrollment'
    });
    assert.equal(verifiedOtp.success, true);

    const created = await request(firstSocket, {
        action: 'bootstrap',
        phone,
        username: 'server_acceptance',
        password,
        visibility: 'private'
    });
    assert.equal(created.success, true);
    assert.equal(created.alreadyExists, false);
    assert.ok(created.user?.id);
    assert.ok(created.token);

    const me = await request(firstSocket, { action: 'me', token: created.token });
    assert.equal(me.success, true);
    assert.equal(me.user?.id, created.user.id);

    const directBootstrap = await request(firstSocket, {
        action: 'bootstrap',
        phone: unverifiedPhone,
        username: 'unverified_acceptance',
        password,
        visibility: 'private'
    });
    assert.equal(directBootstrap.success, false);
    assert.equal(directBootstrap.error, 'phone_verification_required');

    const secondSocket = await connect();
    try {
        const existing = await request(secondSocket, {
            action: 'bootstrap',
            phone,
            username: 'server_acceptance',
            password,
            visibility: 'private'
        });
        assert.equal(existing.success, true);
        assert.equal(existing.alreadyExists, true);
        assert.equal(existing.user?.id, created.user.id);
        assert.ok(existing.token);
    } finally {
        await close(secondSocket);
    }
} finally {
    await close(firstSocket);
}

console.log('auth_otp_fastify_runtime_probe.test: PASS');
