import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createWsSyncRuntime } from '../../server/wsSyncRuntime.js';

class FakeConnection extends EventEmitter {
    constructor() {
        super();
        this.sent = [];
        this.closed = null;
    }

    send(raw) {
        this.sent.push(JSON.parse(raw));
    }

    close(code, reason) {
        this.closed = { code, reason };
        this.emit('close');
    }
}

const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
};

const emitJson = async (connection, message) => {
    connection.emit('message', Buffer.from(JSON.stringify(message)));
    await flush();
};

const createFixture = (options = {}) => {
    const events = options.events || [];
    const access = options.access || (() => true);
    const authorizedStreams = options.authorizedStreams || ['stream-a'];
    const listStreamEvents = options.listStreamEvents || (async (_principal, stream, query) => events.filter((event) => (
        event.stream_id === stream && event.sequence > query.cursor
    )));
    const runtime = createWsSyncRuntime({
        authenticateRequest: (connection, request) => {
            const principal = request?.principal || null;
            if (principal) connection._wsApiUserId = principal;
            return principal;
        },
        authenticateMessage: (connection, message) => {
            if (!String(message.token || '').startsWith('token:')) return null;
            const principal = message.token.slice(6);
            connection._wsApiUserId = principal;
            return principal;
        },
        validatePrincipal: (connection) => connection._wsApiUserId || null,
        isProvisioned: async (principal) => principal === 'user-a',
        getVersion: async () => ({ version: 'test' }),
        vaultRouter: {
            listAuthorizedStreams: async () => authorizedStreams,
            streamAccess: async (principal, stream) => access(principal, stream),
            projectEventForPrincipal: async (principal, event) => access(principal, event.stream_id) ? event : null,
            listStreamEvents
        },
        authTimeoutMs: 1000,
        idleTimeoutMs: 60_000
    });
    return runtime;
};

test('ws/sync serializes a subscription burst per connection before opening vault requests', async (t) => {
    let activeReplays = 0;
    let maximumActiveReplays = 0;
    const releases = [];
    const runtime = createFixture({
        authorizedStreams: ['stream-a', 'stream-b'],
        listStreamEvents: async () => {
            activeReplays += 1;
            maximumActiveReplays = Math.max(maximumActiveReplays, activeReplays);
            await new Promise((resolve) => releases.push(resolve));
            activeReplays -= 1;
            return [];
        }
    });
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, { principal: 'user-a' });
    await emitJson(connection, { type: 'register', source: 'browser-a' });

    connection.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', stream: 'stream-a', cursor: 0 })));
    connection.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', stream: 'stream-b', cursor: 0 })));
    await flush();

    assert.equal(maximumActiveReplays, 1, 'one sync connection must not fan out concurrent vault replay requests');
    releases.shift()();
    await flush();
    assert.equal(maximumActiveReplays, 1);
    releases.shift()();
    await flush();
    assert.deepEqual(
        connection.sent.filter((entry) => entry.type === 'replay-complete').map((entry) => entry.stream),
        ['stream-a', 'stream-b']
    );
});

test('ws/sync contains a vault processing failure to the affected connection', async (t) => {
    const runtime = createFixture({
        listStreamEvents: async () => {
            throw new Error('vault_unavailable');
        }
    });
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, { principal: 'user-a' });
    await emitJson(connection, { type: 'register', source: 'browser-a' });
    await emitJson(connection, { type: 'subscribe', stream: 'stream-a', cursor: 0 });

    assert.deepEqual(connection.sent.at(-1), { type: 'error', code: 'sync_processing_failed' });
    assert.deepEqual(connection.closed, { code: 4401, reason: 'sync_processing_failed' });
});

test('ws/sync authenticates before welcome and accepts control messages only', async (t) => {
    const runtime = createFixture();
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, {});
    assert.deepEqual(connection.sent, []);

    await emitJson(connection, { type: 'auth', token: 'token:user-a' });
    assert.equal(connection.sent[0].type, 'welcome');
    assert.equal(connection.sent[0].capabilities.includes('subscribe'), true);

    await emitJson(connection, { type: 'events', action: 'commit' });
    assert.deepEqual(connection.sent.at(-1), { type: 'error', code: 'operation_not_allowed' });
    assert.equal(connection.closed, null);

    await emitJson(connection, { type: 'register', source: 'browser-a' });
    assert.equal(connection.sent.at(-1).type, 'registered');
    assert.deepEqual(connection.sent.at(-1).streams, ['stream-a']);
    await emitJson(connection, { type: 'ping' });
    assert.equal(connection.sent.at(-1).type, 'pong');
});

test('ws/sync announces newly granted streams and revokes active subscriptions immediately', async (t) => {
    const runtime = createFixture();
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, { principal: 'user-a' });
    await emitJson(connection, { type: 'register', source: 'browser-a' });
    await emitJson(connection, { type: 'subscribe', stream: 'stream-a', cursor: 0 });

    assert.equal(await runtime.grantStream('user-a', 'stream-b'), 1);
    assert.deepEqual(connection.sent.at(-1), { type: 'stream-available', stream: 'stream-b' });
    assert.equal(runtime.revokeStream('user-a', 'stream-a'), 1);
    assert.deepEqual(connection.sent.at(-1), { type: 'revoked', stream: 'stream-a' });
    assert.equal(runtime.snapshot()[0].streams.includes('stream-a'), false);
});

test('ws/sync discovers future descendant streams and revokes a stream moved outside the shared root', async (t) => {
    let descendantVisible = true;
    const runtime = createFixture({
        access: (_principal, stream) => stream === 'stream-a' || (stream === 'stream-child' && descendantVisible)
    });
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, { principal: 'user-a' });
    await emitJson(connection, { type: 'register', source: 'browser-a' });

    await runtime.publish({
        id: 'child-created', stream_id: 'stream-child', sequence: 1, source: 'owner-device',
        atome_id: 'child', kind: 'set', payload: { props: { parent_id: 'shared-root' } }
    });
    assert.deepEqual(connection.sent.at(-1), { type: 'stream-available', stream: 'stream-child' });
    await emitJson(connection, { type: 'subscribe', stream: 'stream-child', cursor: 0 });

    descendantVisible = false;
    await runtime.publish({
        id: 'child-moved', stream_id: 'stream-child', sequence: 2, source: 'owner-device',
        atome_id: 'child', kind: 'set', payload: { props: { parent_id: 'private-root' } }
    });
    assert.deepEqual(connection.sent.at(-1), { type: 'revoked', stream: 'stream-child' });
    assert.equal(runtime.snapshot()[0].streams.includes('stream-child'), false);
});

test('ws/sync rejects anonymous controls and unprovisioned principals', async (t) => {
    const runtime = createFixture();
    t.after(() => runtime.stop());
    const anonymous = new FakeConnection();
    await runtime.attach(anonymous, {});
    await emitJson(anonymous, { type: 'subscribe', stream: 'stream-a' });
    assert.equal(anonymous.sent.some((entry) => entry.type === 'welcome'), false);
    assert.equal(anonymous.sent.at(-1).code, 'authentication_required');
    assert.equal(anonymous.closed.code, 4401);

    const unknown = new FakeConnection();
    await runtime.attach(unknown, {});
    await emitJson(unknown, { type: 'auth', token: 'token:user-b' });
    assert.equal(unknown.sent.some((entry) => entry.type === 'welcome'), false);
    assert.equal(unknown.sent.at(-1).code, 'remote_account_not_provisioned');
});

test('ws/sync replays in sequence, acknowledges and excludes only the source session', async (t) => {
    const events = [
        { id: 'e1', stream_id: 'stream-a', sequence: 1, source: 'seed', atome_id: 'a1', kind: 'update', payload: { props: { left: 1 } } },
        { id: 'e2', stream_id: 'stream-a', sequence: 2, source: 'seed', atome_id: 'a1', vault_principal_id: 'user-a', kind: 'update', payload: { props: { left: 2 } } }
    ];
    const runtime = createFixture({ events });
    t.after(() => runtime.stop());
    const source = new FakeConnection();
    const peer = new FakeConnection();
    await runtime.attach(source, { principal: 'user-a' });
    await runtime.attach(peer, { principal: 'user-a' });
    await emitJson(source, { type: 'register', source: 'browser-a' });
    await emitJson(peer, { type: 'register', source: 'browser-b' });
    await emitJson(source, { type: 'subscribe', stream: 'stream-a', cursor: 0 });
    await emitJson(peer, { type: 'subscribe', stream: 'stream-a', cursor: 1 });

    assert.deepEqual(
        source.sent.filter((entry) => entry.type === 'event').map((entry) => entry.sequence),
        [1, 2]
    );
    assert.deepEqual(
        peer.sent.filter((entry) => entry.type === 'event').map((entry) => entry.sequence),
        [2]
    );
    assert.equal(source.sent.find((entry) => entry.type === 'replay-complete').cursor, 2);
    assert.equal(peer.sent.find((entry) => entry.event_id === 'e2').vault_principal_id, 'user-a');

    await emitJson(peer, { type: 'ack', stream: 'stream-a', sequence: 2 });
    assert.equal(peer.sent.at(-1).sequence, 2);
    await runtime.publish({
        id: 'e3', stream_id: 'stream-a', sequence: 3, source: 'browser-a',
        atome_id: 'a1', kind: 'update', payload: { props: { left: 3 } }
    });
    assert.equal(source.sent.some((entry) => entry.event_id === 'e3'), false);
    assert.equal(peer.sent.some((entry) => entry.event_id === 'e3'), true);
});

test('ws/sync revokes replay as soon as stream authorization disappears', async (t) => {
    let accessChecks = 0;
    const runtime = createFixture({
        events: [
            { id: 'e1', stream_id: 'stream-a', sequence: 1, kind: 'update', payload: {} },
            { id: 'e2', stream_id: 'stream-a', sequence: 2, kind: 'update', payload: {} }
        ],
        access: () => ++accessChecks < 4
    });
    t.after(() => runtime.stop());
    const connection = new FakeConnection();
    await runtime.attach(connection, { principal: 'user-a' });
    await emitJson(connection, { type: 'register', source: 'browser-a' });
    await emitJson(connection, { type: 'subscribe', stream: 'stream-a', cursor: 0 });
    assert.deepEqual(
        connection.sent.filter((entry) => entry.type === 'event').map((entry) => entry.event_id),
        ['e1']
    );
    assert.equal(connection.sent.at(-1).type, 'revoked');
});
