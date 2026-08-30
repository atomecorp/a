import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atome-ws-sync-replay-'));
const secret = 'ws-sync-replay-runtime-secret-long-enough';

const availablePort = () => new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close((error) => error ? reject(error) : resolve(address.port));
    });
});

const waitForServer = (child) => new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server_start_timeout:${output}`)), 20_000);
    const inspect = (chunk) => {
        output += chunk.toString();
        if (!output.includes('Fastify server')) return;
        clearTimeout(timeout);
        resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`server_exit_${code}:${output}`));
    });
});

const connect = (url, token = null) => new Promise((resolve, reject) => {
    const options = token ? { headers: { authorization: `Bearer ${token}` } } : {};
    const socket = new WebSocket(url, options);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
});

const inbox = (socket) => {
    const messages = [];
    const waiters = [];
    socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        messages.push(message);
        for (const waiter of [...waiters]) {
            if (!waiter.predicate(message)) continue;
            clearTimeout(waiter.timer);
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(message);
        }
    });
    return {
        messages,
        wait(predicate, label, timeoutMs = 8000) {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                const waiter = { predicate, resolve, timer: null };
                waiter.timer = setTimeout(() => {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    reject(new Error(`message_timeout:${label}:${JSON.stringify(messages)}`));
                }, timeoutMs);
                waiters.push(waiter);
            });
        }
    };
};

let requestCount = 0;
const request = (socket, payload) => new Promise((resolve, reject) => {
    const requestId = `replay_${++requestCount}`;
    const timeout = setTimeout(() => reject(new Error(`request_timeout:${payload.type}:${payload.action}`)), 8000);
    const receive = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.requestId !== requestId && message.request_id !== requestId) return;
        clearTimeout(timeout);
        socket.off('message', receive);
        resolve(message);
    };
    socket.on('message', receive);
    socket.send(JSON.stringify({ ...payload, requestId }));
});

const port = await availablePort();
const child = spawn(process.execPath, ['server/server.js'], {
    cwd: projectRoot,
    env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        SQLITE_PATH: path.join(runRoot, 'orchestrator.db'),
        JWT_SECRET: secret,
        NODE_ENV: 'test',
        GITHUB_AUTO_SYNC: 'false',
        SQUIRREL_AUTH_TEST_MODE: '1',
        SQUIRREL_AUTH_OTP_BYPASS: '1',
        SQUIRREL_DISABLE_WATCHER: '1',
        SQUIRREL_SYNC_REMOTE: '0',
        SQUIRREL_VAULT_ROOT: path.join(runRoot, 'vaults'),
        SQUIRREL_UPLOADS_DIR: path.join(runRoot, 'uploads'),
        SQUIRREL_SHELL_USER_ROOT: path.join(runRoot, 'users')
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

try {
    await waitForServer(child);
    const api = await connect(`ws://127.0.0.1:${port}/ws/api`);
    const verification = await request(api, {
        type: 'auth', action: 'request-phone-verification', phone: '+33992000001', purpose: 'enrollment'
    });
    assert.equal(verification.otpBypassed, true, JSON.stringify(verification));
    const account = await request(api, {
        type: 'auth', action: 'bootstrap', phone: '+33992000001',
        username: 'ws_sync_replay', password: 'Atome-QA-Local-42', visibility: 'private'
    });
    assert.equal(account.success, true, JSON.stringify(account));
    const token = account.token;
    const principalId = account.user.id;
    const atomeId = crypto.randomUUID();
    const initial = await request(api, {
        type: 'events', action: 'commit', token, source: 'bootstrap',
        event: {
            id: crypto.randomUUID(), kind: 'set', atome_id: atomeId,
            actor: { type: 'user', id: principalId },
            payload: { props: { type: 'shape', left: 1 } }
        }
    });
    assert.equal(initial.success, true, JSON.stringify(initial));
    const stream = initial.event.stream_id;
    assert.equal(initial.event.sequence, 1);

    const source = await connect(`ws://127.0.0.1:${port}/ws/sync`, token);
    const peer = await connect(`ws://127.0.0.1:${port}/ws/sync`, token);
    const sourceInbox = inbox(source);
    const peerInbox = inbox(peer);
    await Promise.all([
        sourceInbox.wait((message) => message.type === 'welcome', 'source_welcome'),
        peerInbox.wait((message) => message.type === 'welcome', 'peer_welcome')
    ]);
    source.send(JSON.stringify({ type: 'register', source: 'device-a' }));
    peer.send(JSON.stringify({ type: 'register', source: 'device-b' }));
    await Promise.all([
        sourceInbox.wait((message) => message.type === 'registered', 'source_registered'),
        peerInbox.wait((message) => message.type === 'registered', 'peer_registered')
    ]);
    source.send(JSON.stringify({ type: 'subscribe', stream, cursor: 1 }));
    peer.send(JSON.stringify({ type: 'subscribe', stream, cursor: 1 }));
    await Promise.all([
        sourceInbox.wait((message) => message.type === 'replay-complete', 'source_replay_complete'),
        peerInbox.wait((message) => message.type === 'replay-complete', 'peer_replay_complete')
    ]);

    const updateId = crypto.randomUUID();
    const update = await request(api, {
        type: 'events', action: 'commit', token, source: 'device-a',
        event: {
            id: updateId, kind: 'set', atome_id: atomeId,
            actor: { type: 'user', id: principalId },
            payload: { props: { left: 44 }, expected_versions: { left: 1 } }
        }
    });
    assert.equal(update.success, true, JSON.stringify(update));
    const delivered = await peerInbox.wait((message) => message.event_id === updateId, 'peer_live_event');
    assert.equal(delivered.sequence, 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sourceInbox.messages.some((message) => message.event_id === updateId), false);
    peer.send(JSON.stringify({ type: 'ack', stream, sequence: 2 }));
    assert.equal((await peerInbox.wait((message) => message.type === 'acked', 'peer_ack')).sequence, 2);

    peer.close();
    const replay = await connect(`ws://127.0.0.1:${port}/ws/sync`, token);
    const replayInbox = inbox(replay);
    await replayInbox.wait((message) => message.type === 'welcome', 'replay_welcome');
    replay.send(JSON.stringify({ type: 'register', source: 'device-c' }));
    await replayInbox.wait((message) => message.type === 'registered', 'replay_registered');
    replay.send(JSON.stringify({ type: 'subscribe', stream, cursor: 1 }));
    assert.equal((await replayInbox.wait((message) => message.event_id === updateId, 'replayed_event')).replay, true);
    assert.equal((await replayInbox.wait((message) => message.type === 'replay-complete', 'replay_complete')).cursor, 2);

    replay.send(JSON.stringify({ type: 'subscribe', stream: crypto.randomUUID(), cursor: 0 }));
    assert.equal((await replayInbox.wait((message) => message.code === 'stream_access_denied', 'denied_stream')).type, 'error');

    const anonymous = await connect(`ws://127.0.0.1:${port}/ws/sync`);
    const anonymousInbox = inbox(anonymous);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(anonymousInbox.messages.some((message) => message.type === 'welcome'), false);
    anonymous.send(JSON.stringify({ type: 'subscribe', stream, cursor: 0 }));
    assert.equal((await anonymousInbox.wait((message) => message.code === 'authentication_required', 'anonymous_rejected')).type, 'error');

    source.close();
    replay.close();
    api.close();
    console.log('ws_sync_replay_runtime_probe: PASS');
} finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(runRoot, { recursive: true, force: true });
}
