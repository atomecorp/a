import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const directory = mkdtempSync(path.join(os.tmpdir(), 'eve-unprovisioned-ws-'));
const secret = 'unprovisioned-ws-runtime-test-secret-long-enough';
const principalId = '550e8400-e29b-41d4-a716-446655440000';

function availablePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => error ? reject(error) : resolve(address.port));
        });
    });
}

function waitForServer(child) {
    return new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error(`server_start_timeout:${output}`)), 20_000);
        const inspect = (chunk) => {
            output += chunk.toString();
            if (output.includes('Fastify server')) {
                clearTimeout(timeout);
                resolve();
            }
        };
        child.stdout.on('data', inspect);
        child.stderr.on('data', inspect);
        child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`server_exit_${code}:${output}`));
        });
    });
}

function connect(url, token) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function request(socket, payload) {
    const requestId = `${payload.type}-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`response_timeout:${requestId}`)), 10_000);
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
}

const port = await availablePort();
const child = spawn(process.execPath, ['server/server.js'], {
    cwd: process.cwd(),
    env: {
        ...process.env,
        HOST: '127.0.0.1', PORT: String(port), SQLITE_PATH: path.join(directory, 'adole.db'),
        JWT_SECRET: secret, GITHUB_AUTO_SYNC: 'false', SYNC_REMOTE_ENABLED: 'false', SERVER_INFO_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

try {
    await waitForServer(child);
    const token = jwt.sign({ userId: principalId }, secret, { expiresIn: '1h' });
    const socket = await connect(`ws://127.0.0.1:${port}/ws/api`, token);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const responses = [];
    responses.push(await request(socket, { type: 'auth', action: 'me', token }));
    responses.push(await request(socket, { type: 'sync', action: 'pull', token }));
    responses.push(await request(socket, { type: 'share', action: 'create', atome_id: 'missing-atome', principal_id: principalId, token }));
    responses.push(await request(socket, { type: 'atome', action: 'list', atome_type: 'user', token }));
    responses.push(await request(socket, { type: 'direct-message', toUserId: crypto.randomUUID(), message: 'blocked', token }));
    responses.push(await request(socket, { type: 'file', action: 'download-info', file_id: 'missing-file', token }));
    socket.close();
    responses.forEach((response) => assert.equal(response.error, 'remote_account_not_provisioned', JSON.stringify(response)));
    const Database = (await import('better-sqlite3')).default;
    const database = new Database(path.join(directory, 'adole.db'));
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM atomes WHERE atome_id = ?').get(principalId).count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM principal_phone_credentials WHERE principal_id = ?').get(principalId).count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM permissions').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sync_queue').get().count, 0);
    database.close();
    console.log('remote_account_not_provisioned_ws_runtime_probe: PASS');
} finally {
    child.kill('SIGTERM');
    rmSync(directory, { recursive: true, force: true });
}
