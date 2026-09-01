import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const workRoot = mkdtempSync(path.join(os.tmpdir(), 'eve-communication-two-user-'));
const password = 'Communication-QA-42';
let sequence = 0;

const availablePort = () => new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
        const address = listener.address();
        listener.close((error) => error ? reject(error) : resolve(address.port));
    });
});

const waitForServer = (child) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`communication_server_start_timeout:${output}`)), 20_000);
    const inspect = (chunk) => {
        output += chunk.toString();
        if (!output.includes('Fastify server')) return;
        clearTimeout(timer);
        resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`communication_server_exit_${code}:${output}`));
    });
});

const connect = (url, token = '') => new Promise((resolve, reject) => {
    const messages = [];
    const socket = new WebSocket(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    socket.once('open', () => resolve({ socket, messages }));
    socket.once('error', reject);
});

const request = (socket, payload) => new Promise((resolve, reject) => {
    const requestId = `communication_${++sequence}`;
    const timer = setTimeout(() => reject(new Error(`communication_request_timeout:${payload.type}:${payload.action || ''}`)), 10_000);
    const receive = (raw) => {
        const message = JSON.parse(raw.toString());
        if ((message.requestId || message.request_id) !== requestId) return;
        clearTimeout(timer);
        socket.off('message', receive);
        resolve(message);
    };
    socket.on('message', receive);
    socket.send(JSON.stringify({ ...payload, requestId }));
});

const bootstrap = async (url, suffix, username) => {
    const { socket } = await connect(url);
    const phone = `+33992${String(suffix).padStart(5, '0')}`;
    try {
        const verification = await request(socket, {
            type: 'auth', action: 'request-phone-verification', phone, purpose: 'enrollment'
        });
        assert.equal(verification.otpBypassed, true, JSON.stringify(verification));
        const account = await request(socket, {
            type: 'auth', action: 'bootstrap', phone, username, password, visibility: 'public'
        });
        assert.equal(account.success, true, JSON.stringify(account));
        return { id: account.user.id, phone, username, token: account.token };
    } finally {
        socket.close();
    }
};

const port = await availablePort();
const wsUrl = `ws://127.0.0.1:${port}/ws/api`;
const child = spawn(process.execPath, ['server/server.js'], {
    cwd: process.cwd(),
    env: {
        ...process.env,
        HOST: '127.0.0.1', PORT: String(port), SQLITE_PATH: path.join(workRoot, 'adole.db'),
        JWT_SECRET: 'communication-test-secret-long-enough', GITHUB_AUTO_SYNC: 'false',
        SYNC_REMOTE_ENABLED: 'false', SERVER_INFO_ENABLED: 'false',
        SQUIRREL_AUTH_TEST_MODE: '1', SQUIRREL_AUTH_OTP_BYPASS: '1',
        SQUIRREL_DISABLE_WATCHER: '1', SQUIRREL_VAULT_ROOT: path.join(workRoot, 'vaults')
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

try {
    await waitForServer(child);
    const alice = await bootstrap(wsUrl, 1, 'communication_alice');
    const bob = await bootstrap(wsUrl, 2, 'communication_bob');
    const { socket: sender } = await connect(wsUrl, alice.token);
    const messageId = `communication_hello_${Date.now()}`;
    const publication = {
        id: `news_${messageId}`, type: 'record', kind: 'record',
        properties: { source_domain: 'eve.dashboard', category_id: 'news', preview: 'Hello' }
    };
    const response = await request(sender, {
        type: 'direct-message',
        toUserId: bob.id,
        message: JSON.stringify({
            command: 'eve-comm-share',
            params: { id: messageId, subject: '', message: 'Hello', kind: 'publication', publication }
        })
    });
    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.queued, true, JSON.stringify(response));
    sender.close();

    const firstReconnect = await connect(wsUrl, bob.token);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const pushed = firstReconnect.messages.filter((entry) => entry.type === 'console-message');
    assert.equal(pushed.length, 1, JSON.stringify(firstReconnect.messages));
    const stackResponse = await request(firstReconnect.socket, {
        type: 'atome', action: 'get', atome_id: bob.id, token: bob.token
    });
    const user = stackResponse.atome || stackResponse.data?.atome || stackResponse.data;
    const stack = user?.properties?.message_stack || user?.data?.message_stack || [];
    const matching = stack.filter((entry) => entry.id === messageId || entry.message_id === messageId);
    assert.equal(matching.length, 1, JSON.stringify(stack));
    assert.equal(matching[0].message, 'Hello');
    assert.equal(matching[0].subject || '', '');
    assert.equal(matching[0].unread, true);
    assert.equal(matching[0].publication?.id, publication.id);
    const markedRead = await request(firstReconnect.socket, {
        type: 'notification-stack', action: 'update', notificationId: messageId,
        patch: { unread: false }
    });
    assert.equal(markedRead.success, true, JSON.stringify(markedRead));
    firstReconnect.socket.close();

    const secondReconnect = await connect(wsUrl, bob.token);
    const repeated = await request(secondReconnect.socket, {
        type: 'atome', action: 'get', atome_id: bob.id, token: bob.token
    });
    const repeatedUser = repeated.atome || repeated.data?.atome || repeated.data;
    const repeatedStack = repeatedUser?.properties?.message_stack || repeatedUser?.data?.message_stack || [];
    assert.equal(repeatedStack.filter((entry) => entry.id === messageId || entry.message_id === messageId).length, 1);
    assert.equal(
        repeatedStack.find((entry) => entry.id === messageId || entry.message_id === messageId)?.unread,
        false
    );
    secondReconnect.socket.close();
    console.log('communication_two_user_server: PASS');
} finally {
    child.kill('SIGTERM');
    rmSync(workRoot, { recursive: true, force: true });
}
