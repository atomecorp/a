import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SyncEngine } from '../../atome/src/squirrel/apis/unified/sync_engine.js';

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
}

class FakeSocket {
    static OPEN = 1;
    static instances = [];
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.sent = [];
        FakeSocket.instances.push(this);
    }
    open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    close() { this.readyState = 3; }
}

const createEnv = () => {
    const listeners = new Map();
    return {
        __SQUIRREL_FASTIFY_WS_SYNC_URL__: 'ws://127.0.0.1:3011/ws/sync',
        __currentUser: { id: 'user-a' },
        localStorage: new MemoryStorage(),
        crypto: { randomUUID: () => 'device-a' },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        },
        dispatchEvent(event) {
            for (const handler of listeners.get(event.type) || []) handler(event);
            this.dispatched.push(event);
        },
        dispatched: []
    };
};

test('SyncEngine authenticates, subscribes, projects winners and persists its cursor', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    const engine = new SyncEngine({
        env,
        WebSocketClass: FakeSocket,
        token: () => 'signed-token',
        pull: async () => ({ ok: true, changes: [] })
    });
    assert.equal(await engine.connect(), true);
    const socket = FakeSocket.instances[0];
    socket.open();
    assert.deepEqual(socket.sent[0], { type: 'auth', token: 'signed-token' });
    socket.receive({ type: 'welcome' });
    assert.equal(socket.sent.at(-1).type, 'register');
    assert.equal(socket.sent.at(-1).source, 'device-a');
    socket.receive({ type: 'registered', streams: ['stream-a'] });
    assert.deepEqual(socket.sent.at(-1), { type: 'subscribe', stream: 'stream-a', cursor: 0 });
    socket.receive({
        type: 'event', event_id: 'event-1', stream: 'stream-a', sequence: 1,
        atome_id: 'shape-a', kind: 'set', patch: { props: { left: 9, top: 4 } },
        lww_decisions: { left: { winner: false }, top: { winner: true } },
        projection: { atome_id: 'shape-a', properties: { left: 2, top: 4 } }
    });
    assert.equal(env.dispatched.length, 1);
    assert.equal(env.dispatched[0].type, 'squirrel:atome-updated');
    assert.deepEqual(env.dispatched[0].detail.properties, { top: 4 });
    assert.deepEqual(socket.sent.at(-1), { type: 'ack', stream: 'stream-a', sequence: 1 });
    assert.equal(engine.getState().cursors['stream-a'], 1);

    socket.receive({
        type: 'event', event_id: 'event-1', stream: 'stream-a', sequence: 1,
        atome_id: 'shape-a', kind: 'set', patch: { props: { top: 4 } }
    });
    assert.equal(env.dispatched.length, 1);

    const restored = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' });
    assert.equal(restored.getState().cursors['stream-a'], 1);
    assert.deepEqual(new Set(restored.getState().streams), new Set(['stream-a', 'directory.public']));
});

test('SyncEngine learns authorized streams from ws/sync registration before replay', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    const engine = new SyncEngine({
        env,
        WebSocketClass: FakeSocket,
        token: () => 'signed-token'
    });
    await engine.requestSync();
    assert.equal(FakeSocket.instances.length, 1);
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.receive({ type: 'welcome' });
    socket.receive({ type: 'registered', streams: ['stream-a'] });
    assert.deepEqual(new Set(engine.getState().streams), new Set(['stream-a', 'directory.public']));
});

test('SyncEngine keeps the Fastify directory stream active when Tauri owns local data', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    env.__SQUIRREL_DATA_SOURCE__ = 'tauri';
    const engine = new SyncEngine({
        env,
        WebSocketClass: FakeSocket,
        token: () => 'remote-signed-token'
    });
    assert.equal(await engine.connect(), true);
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.receive({ type: 'welcome' });
    socket.receive({ type: 'registered', streams: [] });
    assert.deepEqual(socket.sent.at(-1), { type: 'subscribe', stream: 'directory.public', cursor: 0 });
    socket.receive({
        type: 'event', event_id: 'directory-event-1', stream: 'directory.public', sequence: 1,
        kind: 'directory.invalidate', patch: { principal_id: 'remote-b', action: 'upsert', revision: 1 }
    });
    assert.equal(env.dispatched.at(-1).type, 'squirrel:directory-invalidated');
    assert.deepEqual(env.dispatched.at(-1).detail, {
        principal_id: 'remote-b', action: 'upsert', revision: 1, source: 'realtime', origin: 'ws/sync'
    });
});
