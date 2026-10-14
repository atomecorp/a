import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SyncEngine } from '../../atome/src/squirrel/apis/unified/sync_engine.js';
import { messageHandlerMixin } from '../../atome/src/squirrel/apis/unified/adole_websocket_message.js';

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
}

test('native projection completion only invalidates consumers and never carries business state', () => {
    const previousWindow = globalThis.window, previousEvent = globalThis.CustomEvent;
    const dispatched = [];
    globalThis.window = { dispatchEvent: event => dispatched.push(event) };
    globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
    try {
        messageHandlerMixin.handleMessage.call({}, JSON.stringify({ type: 'sync:projection-ready', streams: ['own-stream', 'other'], replay: true,
            properties: { name: 'must not be projected here' }, atome_id: 'private-object' }));
        messageHandlerMixin.handleMessage.call({}, JSON.stringify({ type: 'sync:projection-ready', stream: 'own-stream', replay: false }));
        assert.equal(dispatched.length, 2);
        assert.equal(dispatched[0].type, 'squirrel:sync:projection-ready');
        assert.deepEqual(dispatched[0].detail, { stream: null, streams: ['own-stream', 'other'], replay: true });
        assert.deepEqual(dispatched[1].detail, { stream: 'own-stream', streams: [], replay: false });
    } finally { globalThis.window = previousWindow; globalThis.CustomEvent = previousEvent; }
});

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
        type: 'event', event_id: 'event-delete-project', stream: 'stream-a', sequence: 2,
        atome_id: 'project-a', kind: 'delete', patch: {},
        projection: {
            atome_id: 'project-a', project_id: 'project-a',
            properties: { kind: 'project', name: 'Disposable', __deleted: true }
        }
    });
    assert.equal(env.dispatched.at(-1).type, 'squirrel:atome-deleted');
    assert.equal(env.dispatched.at(-1).detail.project_id, 'project-a');
    assert.equal(env.dispatched.at(-1).detail.atome_type, 'project');

    socket.receive({
        type: 'event', event_id: 'event-1', stream: 'stream-a', sequence: 1,
        atome_id: 'shape-a', kind: 'set', patch: { props: { top: 4 } }
    });
    assert.equal(env.dispatched.length, 2);

    // The scope is written once per burst of messages, not once per message.
    engine.flushPersist();
    const restored = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' });
    assert.equal(restored.getState().cursors['stream-a'], 2);
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

test('a winning restore recreates the full SVG projection and a losing restore cannot revive it', () => {
    const env = createEnv(); const engine = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' });
    const svg = '<svg><rect width="160" height="160" fill="green" /></svg>';
    const restored = { type: 'event', event_id: 'restore-svg', stream: 'stream-a', sequence: 1,
        atome_id: 'square', kind: 'restore', patch: { props: { kind: 'shape', __deleted: false } },
        lww_decisions: { __lifecycle__: { winner: true } },
        projection: { project_id: 'project', properties: { kind: 'shape', svg_markup: svg, left: '100px', __deleted: false } } };
    engine.applyEvent(restored);
    assert.equal(env.dispatched.at(-1).type, 'squirrel:atome-restored');
    assert.equal(env.dispatched.at(-1).detail.properties.svg_markup, svg);
    assert.equal(env.dispatched.at(-1).detail.properties.left, '100px');
    const count = env.dispatched.length;
    engine.applyEvent({ ...restored, event_id: 'stale-restore', sequence: 2, lww_decisions: { __lifecycle__: { winner: false } } });
    assert.equal(env.dispatched.length, count);
});

test('SyncEngine writes its scope once per burst and only when a cursor advances', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    let writes = 0;
    const setItem = env.localStorage.setItem.bind(env.localStorage);
    env.localStorage.setItem = (key, value) => { writes += 1; setItem(key, value); };
    const engine = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' }).install();
    const socket = FakeSocket.instances[0];
    socket.open();
    writes = 0; // the device id written at construction
    socket.receive({ type: 'welcome' });
    const streams = Array.from({ length: 200 }, (_, index) => `stream-${index}`);
    socket.receive({ type: 'registered', streams });
    streams.forEach(stream => socket.receive({ type: 'replay-complete', stream, cursor: 4 }));
    assert.equal(writes, 0);
    // Leaving the page writes what the burst collected.
    env.dispatchEvent(new env.CustomEvent('pagehide', {}));
    assert.equal(writes, 2);
    assert.equal(new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' }).getState().cursors['stream-7'], 4);
    // A reconnection that brings nothing new writes nothing.
    streams.forEach(stream => socket.receive({ type: 'replay-complete', stream, cursor: 4 }));
    engine.flushPersist();
    assert.equal(writes, 2);
});

test('SyncEngine subscribes in batches when the server accepts them and prunes denied streams', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    const engine = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' });
    engine.cursors['stream-7'] = 3;
    engine.persistScope();
    assert.equal(await engine.connect(), true);
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.receive({ type: 'welcome', capabilities: ['subscribe', 'subscribe-batch'] });
    const streams = Array.from({ length: 1200 }, (_, index) => `stream-${index}`);
    socket.receive({ type: 'registered', streams });
    const batches = socket.sent.filter((entry) => entry.type === 'subscribe');
    // 1 200 announced streams + directory.public: three messages instead of 1 201.
    assert.deepEqual(batches.map((entry) => entry.streams.length), [500, 500, 201]);
    assert.equal(batches.some((entry) => 'stream' in entry), false);
    assert.deepEqual(batches.flatMap((entry) => entry.streams).find((entry) => entry.stream === 'stream-7'), { stream: 'stream-7', cursor: 3 });

    socket.receive({ type: 'error', code: 'stream_access_denied', streams: ['stream-9'] });
    socket.receive({ type: 'replay-complete', streams: [{ stream: 'stream-1', cursor: 6 }] });
    assert.equal(engine.getState().cursors['stream-1'], 6);
    assert.equal(engine.getState().streams.includes('stream-9'), false);
    engine.disconnect();
});

test('SyncEngine keeps backing off until every subscription of a connection is answered', async () => {
    FakeSocket.instances.length = 0;
    const env = createEnv();
    const engine = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => 'signed-token' }).install();
    const open = () => {
        const socket = FakeSocket.instances.at(-1);
        socket.open();
        socket.receive({ type: 'welcome', capabilities: ['subscribe-batch'] });
        socket.receive({ type: 'registered', streams: ['stream-a'] });
        return socket;
    };
    // The server closes right after authentication: opening the socket no longer resets the delay.
    open().onclose();
    assert.equal(engine.reconnectAttempt, 1);
    await engine.connect();
    open().onclose();
    assert.equal(engine.reconnectAttempt, 2);
    await engine.connect();
    const socket = open();
    assert.equal(engine.reconnectAttempt, 2);
    socket.receive({ type: 'replay-complete', streams: [] });
    assert.equal(engine.reconnectAttempt, 0);
    engine.disconnect();
});

test('SyncEngine never writes a scope it did not load under another account key', async () => {
    const env = createEnv();
    const key = 'ws://127.0.0.1:3011/ws/sync|user-a';
    env.localStorage.setItem('squirrel_sync_streams_v1', JSON.stringify({ [key]: ['stream-a', 'stream-b', 'directory.public'] }));
    env.localStorage.setItem('squirrel_sync_cursors_v1', JSON.stringify({ [key]: { 'stream-a': 7 } }));
    // Built before the session is known, as at boot: it loads the anonymous scope.
    const signedIn = env.__currentUser;
    delete env.__currentUser;
    const engine = new SyncEngine({ env, WebSocketClass: FakeSocket, token: () => '' });
    env.__currentUser = signedIn;
    // A local commit observed before any connection.
    engine.observeEvents([{ stream_id: 'stream-c' }]);
    engine.flushPersist();
    const stored = JSON.parse(env.localStorage.getItem('squirrel_sync_streams_v1'))[key];
    assert.deepEqual(new Set(stored), new Set(['stream-a', 'stream-b', 'stream-c', 'directory.public']));
    assert.equal(JSON.parse(env.localStorage.getItem('squirrel_sync_cursors_v1'))[key]['stream-a'], 7);
});
