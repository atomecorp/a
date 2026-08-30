import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const port = Number(process.env.SQUIRREL_SYNC_QA_PORT || 3011);
const runId = process.env.SQUIRREL_SYNC_QA_RUN_ID || String(Date.now());
const runRoot = path.join(projectRoot, 'temp', 'sync-qa', runId);
const dataRoot = path.join(runRoot, 'data');
const databasePath = path.join(runRoot, 'orchestrator.db');
const manifestPath = path.join(runRoot, 'topology.json');
const password = 'Atome-QA-Local-42';

const isLanAddress = (address) => address
    && address.family === 'IPv4'
    && !address.internal
    && !address.address.startsWith('169.254.');

const lanAddress = Object.values(os.networkInterfaces())
    .flat()
    .find(isLanAddress)?.address;

if (!lanAddress) throw new Error('sync_qa_lan_address_unavailable');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('sync_qa_port_invalid');
}

fs.mkdirSync(dataRoot, { recursive: true });

const child = spawn(process.execPath, ['server/server.js'], {
    cwd: projectRoot,
    env: {
        ...process.env,
        HOST: '0.0.0.0',
        PORT: String(port),
        SQLITE_PATH: databasePath,
        NODE_ENV: 'test',
        JWT_SECRET: 'sync-qa-local-secret-long-enough-for-test-only',
        GITHUB_AUTO_SYNC: 'false',
        SQUIRREL_AUTH_TEST_MODE: '1',
        SQUIRREL_AUTH_OTP_BYPASS: '1',
        SQUIRREL_DISABLE_WATCHER: '1',
        SQUIRREL_SYNC_REMOTE: '0',
        SQUIRREL_VAULT_ROOT: path.join(dataRoot, 'vaults'),
        SQUIRREL_UPLOADS_DIR: path.join(dataRoot, 'uploads'),
        SQUIRREL_SHELL_USER_ROOT: path.join(dataRoot, 'users')
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

const stop = () => {
    if (!child.killed) child.kill('SIGTERM');
};
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });

const waitForServer = () => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`sync_qa_start_timeout:${output}`)), 20_000);
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
        reject(new Error(`sync_qa_server_exit_${code}:${output}`));
    });
});

const connect = () => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/api`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
});

let requestCounter = 0;
const request = (socket, payload) => new Promise((resolve, reject) => {
    const requestId = `sync_qa_${++requestCounter}`;
    const timer = setTimeout(() => reject(new Error(`sync_qa_request_timeout:${payload.action}`)), 8_000);
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

const createPrincipalAndProject = async ({ suffix, username }) => {
    const socket = await connect();
    const phone = `+33991${String(suffix).padStart(5, '0')}`;
    try {
        const verification = await request(socket, {
            type: 'auth', action: 'request-phone-verification', phone, purpose: 'enrollment'
        });
        assert.equal(verification.otpBypassed, true, JSON.stringify(verification));
        const account = await request(socket, {
            type: 'auth', action: 'bootstrap', phone, username, password, visibility: 'public'
        });
        assert.equal(account.success, true, JSON.stringify(account));
        const principalId = account.user.id;
        const projectId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        const committed = await request(socket, {
            type: 'events', action: 'commit', token: account.token,
            event: {
                id: eventId,
                kind: 'set',
                atome_id: projectId,
                actor: { type: 'user', id: principalId },
                payload: {
                    props: {
                        type: 'project', owner_id: principalId, creator_id: principalId,
                        name: `${username} project`
                    }
                }
            }
        });
        assert.equal(committed.success, true, JSON.stringify(committed));
        return { principalId, projectId, token: account.token, username };
    } finally {
        socket.close();
    }
};

try {
    await waitForServer();
    for (const host of ['127.0.0.1', lanAddress]) {
        const response = await fetch(`http://${host}:${port}/health`);
        assert.equal(response.ok, true, `health_failed:${host}`);
    }
    const first = await createPrincipalAndProject({ suffix: 1, username: 'sync_qa_alice' });
    const second = await createPrincipalAndProject({ suffix: 2, username: 'sync_qa_bob' });
    const httpBase = `http://${lanAddress}:${port}`;
    const manifest = {
        runId,
        runtime: 'local-test',
        host: '0.0.0.0',
        lanAddress,
        port,
        httpBase,
        wsApi: `ws://${lanAddress}:${port}/ws/api`,
        wsSync: `ws://${lanAddress}:${port}/ws/sync`,
        databasePath,
        dataRoot,
        accounts: [first, second]
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(`sync_qa_topology: PASS ${manifestPath}`);
    console.log(`sync_qa_endpoint: ${httpBase}`);
    if (process.env.SQUIRREL_SYNC_QA_HOLD === '1') {
        await new Promise((resolve) => child.once('exit', resolve));
    }
} finally {
    stop();
}
