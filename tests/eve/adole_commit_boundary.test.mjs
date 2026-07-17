import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { messageHandlerMixin } from '../../atome/src/squirrel/apis/unified/adole_websocket_message.js';
import { sendWsApiRequest } from '../../server/wsApiClient.js';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Adole framework Atome APIs route durable writes through event commit', async () => {
    const [atomesSource, authEntry, authLogin, authSession, sharingSource, adapterSource] = await Promise.all([
        readSource('atome/src/squirrel/apis/unified/adole_api/atomes.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js'),
        readSource('atome/src/squirrel/apis/unified/adole_api/sharing.js'),
        readSource('atome/src/squirrel/apis/unified/adole_adapter_atome.js')
    ]);
    // The auth API surface is split across the facade entry + its two method-group modules.
    const authSource = `${authEntry}\n${authLogin}\n${authSession}`;

    assert.match(adapterSource, /async commit\(event = \{\}\)/);
    assert.match(adapterSource, /action: 'commit'/);
    assert.match(adapterSource, /async commitBatch\(events = \[\]\)/);
    assert.match(adapterSource, /action: 'commit-batch'/);
    assert.match(adapterSource, /from '\.\.\/\.\.\/\.\.\/shared\/atome_contract\.js'/);
    assert.doesNotMatch(adapterSource, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(adapterSource, /const sanitizeAtomeProperties = \(/);

    assert.doesNotMatch(atomesSource, /\.atome\.create\(/);
    assert.doesNotMatch(atomesSource, /\.atome\.alter\(/);
    assert.doesNotMatch(authSource, /\.atome\.alter\(/);
    assert.doesNotMatch(sharingSource, /\.atome\.create\(/);

    assert.match(atomesSource, /\.atome\.commit\(/);
    assert.match(authSource, /\.atome\.commit\(/);
    assert.match(sharingSource, /\.atome\.commit\(/);
});

test('repository enforces the WebSocket-only Atome transport boundary', () => {
    const result = spawnSync(process.execPath, ['scripts/check_websocket_only_transport.mjs'], {
        cwd: new URL('../..', import.meta.url),
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /WebSocket-only transport guard passed/);
});

test('Tauri and iOS expose authenticated WebSocket-only contracts', async () => {
    const [tauriServer, tauriExtended, tauriControl, iosServer] = await Promise.all([
        readSource('platforms/desktop-tauri/src/server/mod.rs'),
        readSource('platforms/desktop-tauri/src/server/local_atome_extended.rs'),
        readSource('platforms/desktop-tauri/src/server/remote_control_ws.rs'),
        readSource('platforms/ios/atome-auv3/Common/LocalHTTPServer.swift')
    ]);
    assert.match(tauriServer, /\.route\("\/ws\/control", get\(remote_control_ws::handler\)\)/);
    assert.match(tauriControl, /"audio\.record\.start"/);
    assert.match(tauriControl, /"audio\.playback\.stop"/);
    assert.match(tauriServer, /ws_authenticated_user/);
    assert.doesNotMatch(tauriServer, /unwrap_or\("anonymous"\)/);
    for (const handler of [
        'handle_history_message',
        'handle_snapshot_message',
        'handle_user_data_message',
        'handle_sync_message'
    ]) {
        assert.match(tauriExtended, new RegExp(`pub async fn ${handler}`));
    }
    assert.match(iosServer, /connectionState\.route == "\/ws\/sync"/);
    assert.match(iosServer, /"code": "authentication_required"/);
    assert.match(iosServer, /"code": "authentication_expired"/);
    assert.match(iosServer, /"error": "capability_unsupported"/);
});

test('Unified client normalization accepts native typed response payloads', async () => {
    const pendingRequests = new Map();
    const result = new Promise((resolve) => {
        pendingRequests.set('native-nested', {
            resolve,
            timeout: setTimeout(() => {}, 1000)
        });
    });
    messageHandlerMixin.handleMessage.call(
        { pendingRequests },
        JSON.stringify({
            type: 'snapshot-response',
            requestId: 'native-nested',
            success: true,
            data: { snapshot_id: 9, events: [{ id: 'native-event' }] }
        })
    );
    const normalized = await result;
    assert.equal(normalized.snapshot_id, 9);
    assert.deepEqual(normalized.events, [{ id: 'native-event' }]);
});

async function withWsServer(onConnection, callback) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => server.once('listening', resolve));
    server.on('connection', onConnection);
    const { port } = server.address();
    try {
        return await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('ws/api client handles correlation, reconnect, close, and timeout deterministically', async () => {
    await withWsServer((socket) => {
        socket.once('message', (raw) => {
            const request = JSON.parse(raw.toString());
            socket.send(JSON.stringify({
                type: 'events-response',
                requestId: request.requestId,
                success: true,
                event: { id: request.event.id }
            }));
        });
    }, async (baseUrl) => {
        const first = await sendWsApiRequest(baseUrl, {
            type: 'events',
            action: 'commit',
            event: { id: 'first' }
        });
        const second = await sendWsApiRequest(baseUrl, {
            type: 'events',
            action: 'commit',
            event: { id: 'second' }
        });
        assert.equal(first.event.id, 'first');
        assert.equal(second.event.id, 'second');
    });
    await withWsServer((socket) => {
        socket.once('message', () => socket.close());
    }, async (baseUrl) => {
        await assert.rejects(
            sendWsApiRequest(baseUrl, { type: 'sync', action: 'pull' }),
            /closed before response/
        );
    });
    await withWsServer(() => {}, async (baseUrl) => {
        await assert.rejects(
            sendWsApiRequest(baseUrl, { type: 'sync', action: 'pull' }, { timeoutMs: 1000 }),
            /WebSocket request timeout/
        );
    });
});

test('Fastify WebSocket operations enforce identity, restoration idempotency, and sync scope', async () => {
    const dbPath = path.join(os.tmpdir(), `ws-transport-${process.pid}-${Date.now()}.db`);
    const secret = 'ws-transport-test-secret-at-least-32-characters';
    process.env.SQLITE_PATH = dbPath;
    process.env.JWT_SECRET = secret;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?ws_transport=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?ws_transport=${nonce}`);
    const security = await import(`../../server/wsSyncSecurity.js?ws_transport=${nonce}`);
    const ownerId = 'ws_owner';
    const readerId = 'ws_reader';
    const projectId = 'ws_project';
    const atomeId = 'ws_shape';
    try {
        await db.initDatabase();
        for (const id of [ownerId, readerId]) {
            await db.createAtome({
                id,
                type: 'user',
                owner: id,
                creator: id,
                properties: { username: id }
            });
        }
        await db.createAtome({
            id: projectId,
            type: 'project',
            owner: ownerId,
            creator: ownerId,
            properties: { name: 'WS project' }
        });
        await db.createAtome({
            id: atomeId,
            type: 'shape',
            parent: projectId,
            owner: ownerId,
            creator: ownerId,
            properties: { project_id: projectId }
        });
        await db.appendEvent({
            id: 'ws_initial',
            kind: 'set',
            atome_id: atomeId,
            project_id: projectId,
            actor: { id: ownerId },
            payload: { props: { left: '10px' } }
        });
        const denied = await operations.handleWsAtomeOperation({
            type: 'state-current',
            action: 'get',
            requestId: 'anonymous',
            atome_id: atomeId
        }, {});
        assert.equal(denied.success, false);
        const connection = { _wsApiUserId: ownerId };
        const history = await operations.handleWsAtomeOperation({
            type: 'atome',
            action: 'history',
            requestId: 'history',
            atome_id: atomeId
        }, connection);
        assert.equal(history.events[0].id, 'ws_initial');
        const snapshot = await operations.handleWsAtomeOperation({
            type: 'snapshot',
            action: 'create',
            requestId: 'snapshot',
            project_id: projectId
        }, connection);
        await db.appendEvent({
            id: 'ws_changed',
            kind: 'set',
            atome_id: atomeId,
            project_id: projectId,
            actor: { id: ownerId },
            payload: { props: { left: '99px' } }
        });
        const restoreRequest = {
            type: 'snapshot',
            action: 'restore',
            requestId: 'restore',
            snapshot_id: snapshot.snapshot_id,
            tx_id: 'ws_restore_tx'
        };
        const restored = await operations.handleWsAtomeOperation(restoreRequest, connection);
        assert.deepEqual(
            await operations.handleWsAtomeOperation(restoreRequest, connection),
            restored
        );
        assert.equal((await db.getStateCurrent(atomeId)).properties.left, '10px');

        await db.setPermission(
            atomeId,
            readerId,
            true,
            false,
            false,
            false,
            null,
            ownerId,
            { shareMode: 'real-time' }
        );
        const token = jwt.sign({ sub: readerId }, secret, { expiresIn: '5m' });
        const syncConnection = {};
        assert.equal(
            security.authenticateWsSyncMessage(syncConnection, { type: 'auth', token }),
            readerId
        );
        assert.equal(
            security.authenticateWsSyncMessage({}, { type: 'auth', token: 'malformed' }),
            null
        );
        assert.equal(
            security.authenticateWsSyncMessage({}, {
                type: 'auth',
                token: jwt.sign({ sub: readerId }, secret, { expiresIn: -1 })
            }),
            null
        );
        const event = await security.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: { atome_id: atomeId, properties: { left: '20px' } }
        }, readerId);
        assert.equal(event.eventType, 'atome:updated');
        assert.equal(await security.filterWsSyncEventForPrincipal({
            type: 'sync:account-created',
            payload: { phone: '+331234', passwordHash: 'forbidden' }
        }, readerId), null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch (_) {}
        delete process.env.SQLITE_PATH;
        delete process.env.JWT_SECRET;
    }
});
