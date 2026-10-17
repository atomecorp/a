import { test, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createFcmTransport } from '../../server/fcm_transport.js';

const token = 'c'.repeat(22); // Fixture FID; no real installation.
function setup(responses = []) {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let time = 100000;
    const request = vi.fn(async (url, options) => {
        if (url === 'https://oauth2.googleapis.com/token') {
            const assertion = new URLSearchParams(options.body).get('assertion');
            expect(jwt.verify(assertion, keys.publicKey, { clockTimestamp: time / 1000 })).toMatchObject({
                iss: 'fixture@atome-fixture.iam.gserviceaccount.com', aud: url,
                scope: 'https://www.googleapis.com/auth/firebase.messaging'
            });
            return { ok: true, json: async () => ({ access_token: 'fixture-access', expires_in: 3600 }) };
        }
        return responses.shift() || { ok: true, status: 200 };
    });
    const transport = createFcmTransport({ environment: { FCM_PROJECT_ID: 'atome-fixture', FCM_SERVICE_ACCOUNT_PATH: 'fixture-only' },
        now: () => time, request, readKey: async () => JSON.stringify({ project_id: 'atome-fixture',
            client_email: 'fixture@atome-fixture.iam.gserviceaccount.com',
            private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) }) });
    return { transport, request, advance: milliseconds => { time += milliseconds; } };
}
test('FCM shares OAuth authorization and sends data-only bounded high-priority calls to the fixed project', async () => {
    const f = setup();
    const payload = { atome: { principal_id: 'opaque', room_id: 'room', expires_at: 110000 } };
    await Promise.all([1, 2].map(() => f.transport.send({ token }, payload, { voip: true, expiresAt: 110000, collapseId: 'delivery' })));
    expect(f.request.mock.calls.filter(([url]) => url === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
    const [url, options] = f.request.mock.calls[1];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/atome-fixture/messages:send');
    expect(options.headers.authorization).toBe('Bearer fixture-access');
    const message = JSON.parse(options.body).message;
    expect(message.fid).toBe(token); expect(message.token).toBeUndefined();
    expect(message.notification).toBeUndefined();
    expect(message.android).toEqual({ priority: 'HIGH', ttl: '10s', collapse_key: 'delivery' });
    expect(message.data.notification_kind).toBe('call');
    expect(JSON.parse(message.data.atome)).toEqual(payload.atome);
});
test('an invitation expiring during OAuth authorization is never sent', async () => {
    const f = setup(), original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => { const result = await original(...args); f.advance(11000); return result; });
    expect(await f.transport.send({ token }, { atome: {} }, { voip: true, expiresAt: 110000 })).toMatchObject({ ok: false, error: 'push_call_expired' });
    expect(f.request).toHaveBeenCalledOnce();
});
test('only UNREGISTERED invalidates a token; a cancelled-call control cannot become an incoming call', async () => {
    const f = setup([{ ok: false, status: 404, json: async () => ({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }) },
        { ok: false, status: 400, json: async () => ({ error: { details: [{ errorCode: 'INVALID_ARGUMENT' }] } }) }]);
    const options = { control: true, expiresAt: 160000 };
    expect(await f.transport.send({ token }, { atome: { status: 'cancelled' } }, options)).toMatchObject({ invalidToken: true });
    expect(await f.transport.send({ token }, { atome: { status: 'cancelled' } }, options)).toMatchObject({ invalidToken: false });
    expect(JSON.parse(f.request.mock.calls[1][1].body).message.data.notification_kind).toBe('call-state');
});
