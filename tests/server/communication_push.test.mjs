import { test, expect, vi } from 'vitest';
import { fixture } from './auth_phone_fixture.mjs';
import { createCommunicationPush } from '../../server/communication_push.js';
import { createNotificationDelivery } from '../../server/communication_delivery.js';
import { createApnsTransport } from '../../server/apns_transport.js';
import { EventEmitter } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';

const installationId = 'c51ca76b-a259-4a26-8b15-d8791a97f2f7';
async function setup() {
    const f = fixture(), key = f.device(), attempt = await f.start(key);
    const login = await f.auth.complete(await f.input(key, attempt.attemptId));
    const send = vi.fn(async () => ({ ok: true, status: 200 }));
    const push = createCommunicationPush({ query: async (method, sql, args = []) => f.db.prepare(sql)[method](...args),
        now: f.now, transport: { send, configured: () => true } });
    const claims = { sub: login.user.id, sid: login.session.id, cnf: { kid: key.keyId } };
    for (const kind of ['alert', 'voip']) await push.register(claims, { installationId, kind, deviceToken: kind === 'alert' ? 'a'.repeat(64) : 'b'.repeat(64), environment: 'sandbox' });
    return { ...f, key, login, push, send, claims };
}
test('one canonical notification reaches only its principal, deduplicates and excludes content', async () => {
    const f = await setup(), item = { id: 'message', kind: 'message', message: 'private text', from_id: 'sender' };
    expect((await f.push.deliver('foreign', item)).installations).toBe(0);
    await f.push.deliver(f.login.user.id, item); await f.push.deliver(f.login.user.id, item);
    expect(f.send).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.send.mock.calls)).not.toContain('private text');
    expect(f.send.mock.calls[0][1].atome).toMatchObject({ principal_id: f.login.user.id, notification_id: 'message' });
});
test('only real unexpired calls use VoIP; scheduled invitations use ordinary APNs', async () => {
    const f = await setup(), room = '6a937aed-fca6-4dfb-83f4-f17d32149780';
    await f.push.deliver(f.login.user.id, { id: 'call', kind: 'call-invitation', room_id: room, expires_at: f.now() + 10000 });
    expect(f.send.mock.calls[0][2].voip).toBe(true);
    await f.push.deliver(f.login.user.id, { id: 'expired', kind: 'call-invitation', room_id: room, expires_at: f.now() - 1 });
    expect(f.send).toHaveBeenCalledOnce();
    await f.push.deliver(f.login.user.id, { id: 'schedule', kind: 'call-scheduled', room_id: room });
    expect(f.send.mock.calls[1][2].voip).toBe(false);
});
test('stale token rejection removes the registration; logout prevents subsequent delivery', async () => {
    const f = await setup(); f.send.mockResolvedValueOnce({ ok: false, invalidToken: true, status: 410 });
    await f.push.deliver(f.login.user.id, { id: 'stale', kind: 'message' });
    expect(f.db.prepare("SELECT count(*) AS total FROM auth_push_installations WHERE kind='alert'").get().total).toBe(0);
    const fields = { sessionId: f.login.session.id, generation: 0, purpose: 'logout' };
    const { challenge } = await f.auth.sessions.getChallenge(fields, 'test');
    await f.auth.sessions.revoke({ ...fields, action: 'logout', ...f.key.sign(challenge) });
    expect(f.db.prepare('SELECT count(*) AS total FROM auth_push_installations').get().total).toBe(0);
    expect((await f.push.deliver(f.login.user.id, { id: 'after', kind: 'message' })).installations).toBe(0);
});
test('known APNs rejection can retry, uncertain transport outcomes cannot duplicate', async () => {
    const f = await setup(), item = { id: 'retry', kind: 'message' };
    f.send.mockResolvedValueOnce({ ok: false, status: 503 });
    await f.push.deliver(f.login.user.id, item); await f.push.deliver(f.login.user.id, item);
    expect(f.send).toHaveBeenCalledTimes(2);
    f.send.mockResolvedValueOnce({ ok: false, error: 'apns_transport_uncertain' });
    await f.push.deliver(f.login.user.id, { ...item, id: 'uncertain' });
    await f.push.deliver(f.login.user.id, { ...item, id: 'uncertain' });
    expect(f.send).toHaveBeenCalledTimes(3);
});
test('durable commit and realtime delivery precede a slow OS transport', async () => {
    const order = []; let finishPush;
    const deliver = createNotificationDelivery({
        findUserById: async () => ({ username: 'sender' }),
        pushNotificationToUserStack: async input => {
            expect(input.deferPush).toBe(true); order.push('commit');
            return { ok: true, deliverPush: () => { order.push('push'); return new Promise(resolve => { finishPush = resolve; }); } };
        },
        wsSendJsonToUser: () => { order.push('ws'); return { delivered: true }; },
        enqueuePendingConsoleMessage: vi.fn()
    });
    const pending = deliver('recipient', 'sender', { kind: 'message', id: 'slow' });
    await vi.waitFor(() => expect(order).toEqual(['commit', 'ws', 'push']));
    finishPush({ ok: true }); expect((await pending).delivered).toBe(true);
});
test.each([
    { environment: 'sandbox', voip: true, host: 'api.sandbox.push.apple.com', topic: 'one.atome.app.voip', kind: 'voip' },
    { environment: 'production', voip: false, host: 'api.push.apple.com', topic: 'one.atome.app', kind: 'alert' }
])('APNs uses the exact OS topic/priority for $environment $kind', async row => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    let destination, headers, body;
    const session = new EventEmitter(); session.destroy = vi.fn();
    session.request = input => {
        headers = input;
        const request = new EventEmitter(); request.end = bytes => {
            body = JSON.parse(bytes.toString()); request.emit('response', { ':status': 200 }); request.emit('end');
        };
        return request;
    };
    const transport = createApnsTransport({ environment: { APNS_KEY_ID: 'FIXTUREKEY', APNS_TEAM_ID: 'FIXTURETEAM',
        APNS_KEY_PATH: 'fixture-only', APNS_TOPIC: 'one.atome.app' }, readKey: async () => privateKey,
        connect: url => { destination = url; return session; } });
    const result = await transport.send({ token: 'b'.repeat(64), environment: row.environment },
        { aps: row.voip ? {} : { sound: 'default' }, atome: { room_id: 'opaque-room' } },
        { voip: row.voip, expiresAt: 123000, collapseId: 'c'.repeat(64) });
    expect(result.ok).toBe(true); expect(destination).toBe('https://' + row.host);
    expect(headers).toMatchObject({ 'apns-topic': row.topic, 'apns-push-type': row.kind, 'apns-priority': '10', 'apns-expiration': '123' });
    expect(headers[':path']).toBe('/3/device/' + 'b'.repeat(64));
    expect(body.atome.room_id).toBe('opaque-room'); expect(session.destroy).toHaveBeenCalledOnce();
});
