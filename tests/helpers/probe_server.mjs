// Multi-account probe harness. Starts an ISOLATED server instance (its own port, SQLite base and temporary vaults)
// with the SMS mock, then creates real accounts through the phone-link flow, each on its own authenticated /ws/api
// socket. Never the user's dev server (3001).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createPhoneLinkClient } from '../../atome/src/squirrel/security/auth_phone_link_client.js';
import { createStorePurchase } from '../../atome/src/squirrel/billing/store_purchase.js';
import { authDeviceKey, authSigningMessage } from '../../atome/src/shared/auth_link_contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The server is atome-server (Axum + one Rust vault process per person), alone: the Node
// Fastify reference is gone (R-118 L3.10). A probe of another tree (the state BEFORE a fix)
// runs that tree's own binaries, built in a target directory of its own: PROBE_SERVER_BIN.
if (process.env.COMM_SERVER_ROOT) {
    throw new Error('comm_server_root_retired: build the other tree\'s atome-server and atome-vault (CARGO_TARGET_DIR=…) '
        + 'and set PROBE_SERVER_BIN to its atome-server.');
}
// The binaries already built, never a build of their own: many sessions share target/, and a build from a probe takes
// its lock and replaces the binary others run (two did so by mistake on 17 Nov. 2026). A missing binary stops the probe
// with what to do. PROBE_SERVER_BIN: binaries built in another target directory (a probe of a server change).
const serverBinaries = () => {
    const server = process.env.PROBE_SERVER_BIN || path.join(ROOT, 'target/release/atome-server');
    const missing = [server, path.join(path.dirname(server), 'atome-vault')].filter(file => !fs.existsSync(file));
    if (missing.length) {
        throw new Error(`probe_server_binary_missing: ${missing.join(', ')} — no probe builds them. Build them once the orchestrator `
            + 'has given a slot (target/ is shared): `cargo build --release -p atome-server -p atome-vault`; or build them in a target '
            + 'directory of your own (CARGO_TARGET_DIR=…) and set PROBE_SERVER_BIN to its atome-server.');
    }
    return server;
};
const serverCommand = () => {
    // PROBE_FROZEN_ROOT: the front serves a frozen copy of the tree (a media upload waits on the offline app, whose install
    // fails while other sessions edit files; reference_probe_frozen_tree_for_offline_app).
    return { command: serverBinaries(), args: [], cwd: process.env.PROBE_FROZEN_ROOT || ROOT, env: {} };
};

// A `/ws/api` that opens on `port`, else the process's logs once it exits or the deadline passes.
async function opened(port, child, logs) {
    const url = `ws://127.0.0.1:${port}/ws/api`;
    const deadline = Date.now() + (Number(process.env.PROBE_SERVER_START_MS) || 60_000);
    for (;;) {
        if (child.exitCode !== null) throw new Error(`server_exited:\n${logs.join('').slice(-3000)}`);
        const ok = await new Promise((resolve) => {
            const s = new WebSocket(url);
            s.once('open', () => { s.close(); resolve(true); });
            s.once('error', () => resolve(false));
        });
        if (ok) return url;
        if (Date.now() > deadline) throw new Error(`server_start_timeout:\n${logs.join('').slice(-3000)}`);
        await new Promise((r) => setTimeout(r, 300));
    }
}

// A port whose server and page preview (port + 200, atome-server's ATOME_PAGE_PREVIEW_PORT default) are both
// free: a server left on a port by a probe that died never makes the next one fail.
const bindable = (candidate, host) => new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen({ port: candidate, host, exclusive: true }, () => probe.close(() => resolve(true)));
});
// IPv4 and IPv6 apart: on macOS a `::` bind succeeds beside an IPv4 `*:port` listener (atome-server's).
const portFree = async (candidate) => await bindable(candidate, '0.0.0.0') && await bindable(candidate, '::');
const freePort = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const candidate = 3100 + Math.floor(Math.random() * 800);
        if (await portFree(candidate) && await portFree(candidate + 200)) return candidate;
    }
    throw new Error('probe_server_no_free_port');
};

export async function startServer({ port: given = null, env = {}, dir: reuseDir = null, socketDir = null, jwtSecret = crypto.randomBytes(32).toString('hex'), owned = { dir: !reuseDir, sockets: !socketDir } } = {}) {
    const port = given ?? await freePort();
    // `dir` + `jwtSecret` reused = a restart of the SAME server (same base, same sessions).
    const dir = reuseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'comm-harness-'));
    const sockets = socketDir || fs.mkdtempSync('/tmp/chv-');
    const launch = serverCommand();
    const serverEnv = {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'development',
        SQLITE_PATH: path.join(dir, 'adole.db'),
        SQUIRREL_VAULT_ROOT: path.join(dir, 'vaults'),
        SQUIRREL_VAULT_SOCKET_ROOT: sockets,
        // The people's files (uploads, recordings, extracted audio) stay in the server's own folder, removed with it,
        // never in the project's data/users of the developer's server.
        SQUIRREL_SHELL_USER_ROOT: path.join(dir, 'users'),
        JWT_SECRET: jwtSecret,
        SQUIRREL_AUTH_SMS_MOCK: '1',
        AUTH_SMS_DAILY_LIMIT: '100000',
        // Video calls: ICE candidates reachable locally.
        MEDIASOUP_ANNOUNCED_IP: '127.0.0.1',
        ...launch.env,
        ...env
    };
    const logs = [];
    const onData = (chunk) => { logs.push(String(chunk)); if (logs.length > 4000) logs.shift(); };
    // Each in its own process group: a kill reaches the server and its vaults together.
    const launched = (command, args, cwd, childEnv) => {
        const child = spawn(command, args, { cwd, detached: true, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        return child;
    };
    const child = launched(launch.command, launch.args, launch.cwd, serverEnv);
    const children = [child];
    // A server that never answers (a start timeout, an exit) is stopped here: detached in its own
    // group, it would otherwise stay on its port after the probe's process has gone.
    let url = '';
    try {
        url = await opened(port, child, logs);
    } catch (error) {
        if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }
        throw error;
    }
    // The server's base, vaults and sockets go with it: left behind, every probe run kept ~5-20 MB in
    // the system temp folder (2 386 folders, 10 GB by 26 Oct. 2026). A restart keeps them (same base);
    // folders a probe passed in stay its own.
    const removeFiles = () => {
        if (owned.dir) fs.rmSync(dir, { recursive: true, force: true });
        if (owned.sockets) fs.rmSync(sockets, { recursive: true, force: true });
    };
    // A probe that dies (uncaught timeout) never calls `stop`: the server goes
    // with the probe's process instead of staying behind on its port, its files with it.
    const running = () => children.filter((one) => one.exitCode === null);
    const signalGroup = (signal) => {
        for (const one of running()) { try { process.kill(-one.pid, signal); } catch { /* already gone */ } }
    };
    const killOnExit = () => { signalGroup('SIGKILL'); removeFiles(); };
    process.once('exit', killOnExit);
    const halt = async () => {
        process.removeListener('exit', killOnExit);
        signalGroup('SIGTERM');
        await new Promise((r) => setTimeout(r, 300));
        if (running().length) signalGroup('SIGKILL');
        await new Promise((r) => setTimeout(r, 300));
    };
    const stop = async () => { await halt(); removeFiles(); };
    return {
        // `pids`: the process group the harness started (atome-server and its vaults).
        port, url, dir, logs, stop, pids: children.map((one) => one.pid),
        // Stop, then start again on the same port, base and JWT secret.
        restart: async () => { await halt(); return startServer({ port, env, dir, socketDir: sockets, jwtSecret, owned }); }
    };
}

async function makeDevice() {
    const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const { publicKey, keyId } = await authDeviceKey(keys.publicKey.export({ format: 'jwk' }));
    const records = new Map();
    const device = {
        keyId, publicKey,
        sign: async (challenge) => ({
            challengeId: challenge.challenge,
            signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)), {
                key: keys.privateKey, dsaEncoding: 'ieee-p1363'
            }).toString('base64url')
        })
    };
    return {
        forPhone: async () => device, randomHandle: () => crypto.randomBytes(32).toString('base64url'),
        put: async (n, v) => records.set(n, v), read: async (n) => records.get(n),
        remove: async (n) => records.delete(n),
        keys: async (p) => [...records.keys()].filter((n) => n.startsWith(p)),
        aliasPhone: async () => {}
    };
}

// One account = one authenticated socket + a log of every frame received.
export async function connectUser(server, { phone, name, session = null } = {}) {
    const socket = new WebSocket(server.url);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const inbox = [];
    const waiters = new Map();
    const listeners = new Set();
    socket.on('message', (raw) => {
        let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
        const rid = msg.requestId || msg.request_id;
        if (rid && waiters.has(rid)) { const w = waiters.get(rid); waiters.delete(rid); w(msg); return; }
        inbox.push(msg);
        for (const l of listeners) l(msg);
    });
    const call = (message, timeoutMs = 10_000) => new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => { waiters.delete(requestId); reject(new Error(`timeout:${message.type}/${message.action || ''}`)); }, timeoutMs);
        waiters.set(requestId, (m) => { clearTimeout(timer); resolve(m); });
        socket.send(JSON.stringify({ ...message, requestId }));
    });
    let user;
    if (session) {
        // Reconnect with the existing session (as the app does), with no new SMS.
        const me = await call({ type: 'auth', action: 'me', token: session.token });
        if (!me.success) throw new Error(`reconnect_failed:${JSON.stringify(me)}`);
        user = { id: session.id, phone: session.phone, name: session.name, token: session.token };
    } else {
        let installed = null;
        const client = createPhoneLinkClient({
            devices: await makeDevice(), send: (m) => call(m), locks: null, storePurchase: createStorePurchase({ host: null }),
            installSession: async (r) => { installed = r; }
        });
        let result = await client.start(phone);
        // A new account first goes through the (simulated) payment step.
        if (result?.paymentRequired) result = await client.pay({ method: 'paypal' });
        if (!result?.ok) throw new Error(`login_failed:${phone}:${JSON.stringify(result)}`);
        user = { id: String(result.user.id), phone, name, token: installed?.token || result.token };
    }
    if (name && !session) await call({ type: 'auth', action: 'update-user', userId: user.id, key: 'username', value: name });
    const waitFor = (predicate, timeoutMs = 5000) => new Promise((resolve, reject) => {
        const hit = inbox.find(predicate);
        if (hit) { resolve(hit); return; }
        const timer = setTimeout(() => { listeners.delete(l); reject(new Error('waitFor_timeout')); }, timeoutMs);
        const l = (m) => { if (predicate(m)) { clearTimeout(timer); listeners.delete(l); resolve(m); } };
        listeners.add(l);
    });
    return { ...user, socket, inbox, call, waitFor, close: () => socket.close() };
}

// A small reporter: each check is logged, the final verdict sums them up.
export function createReport(title) {
    const rows = [];
    return {
        check(id, ok, detail = '') { rows.push({ id, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ' — ' + detail : ''}`); },
        done() {
            const failed = rows.filter((r) => !r.ok);
            console.log(`\n${title}: ${rows.length - failed.length}/${rows.length} PASS`);
            return failed.length;
        }
    };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// An account's /ws/sync channel (realtime events of the streams it may read).
export async function openSync(server, user, source = `probe_${user.name || user.id}`) {
    const socket = new WebSocket(server.url.replace('/ws/api', '/ws/sync'));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const inbox = [];
    const listeners = new Set();
    socket.on('message', (raw) => {
        let m; try { m = JSON.parse(String(raw)); } catch { return; }
        inbox.push(m);
        for (const l of listeners) l(m);
    });
    const waitFor = (predicate, timeoutMs = 5000) => new Promise((resolve, reject) => {
        const hit = inbox.find(predicate);
        if (hit) { resolve(hit); return; }
        const timer = setTimeout(() => { listeners.delete(l); reject(new Error('sync_waitFor_timeout')); }, timeoutMs);
        const l = (m) => { if (predicate(m)) { clearTimeout(timer); listeners.delete(l); resolve(m); } };
        listeners.add(l);
    });
    socket.send(JSON.stringify({ type: 'auth', token: user.token }));
    await waitFor((m) => m.type === 'welcome');
    socket.send(JSON.stringify({ type: 'register', source, capabilities: ['events', 'replay'] }));
    await waitFor((m) => m.type === 'registered');
    const subscribe = async (stream) => {
        socket.send(JSON.stringify({ type: 'subscribe', stream, cursor: 0 }));
        await waitFor((m) => m.type === 'replay-complete' && m.stream === stream);
    };
    return { socket, inbox, waitFor, subscribe, close: () => socket.close() };
}

export const dm = (from, to, params = {}) => from.call({
    type: 'direct-message',
    toUserId: to.id,
    message: JSON.stringify({ command: 'eve-comm-share', params: { kind: 'message', message: 'Hello', ...params } })
});

export const commit = (user, event) => user.call({ type: 'events', action: 'commit', token: user.token, event: { actor: { type: 'user', id: user.id }, ...event } });

export const contact = (user, action, peer, extra = {}) => user.call({ type: 'contact', action, userId: peer?.id, ...extra });
export const parseEnvelope = (m) => { try { return JSON.parse(m.message); } catch { return null; } };
export const commsOf = (user, kind) => user.inbox.filter((m) => m.type === 'console-message' && parseEnvelope(m)?.params?.kind === kind);
// Makes two accounts mutual contacts through the real flow (request + acceptance).
export async function makeContacts(a, b) {
    const req = await contact(a, 'request', b);
    const acc = await contact(b, 'respond', a, { decision: 'accept' });
    if (!req.success || !acc.success) throw new Error(`makeContacts_failed:${JSON.stringify({ req, acc })}`);
}

export const news = (user, action, extra = {}) => user.call({ type: 'news', action, ...extra });
// A publication in the `publicationSpec` format (eVe/intuition/tools/communication_news_publication.js).
export const publicationOf = (author, { id = `news_${Math.random().toString(16).slice(2)}`, title = 'Titre', preview = 'Corps', members = [], forgedAuthor = null } = {}) => ({
    id, type: 'news_publication',
    properties: {
        source_domain: 'eve.dashboard', category_id: 'news', publication_id: id, news_id: id, news_post_id: id,
        author_id: forgedAuthor || author.id, author_name: forgedAuthor ? 'Mallory' : author.name,
        title, preview, created_iso: new Date().toISOString(),
        news_payload: { schema_version: 1, molecule: { id: `mol_${id}`, name: title, properties: {} }, members, tags: [] }
    }
});
export const publicationsOf = (user) => user.inbox
    .filter((m) => m.type === 'console-message')
    .map((m) => parseEnvelope(m)?.params)
    .filter((p) => p?.kind === 'publication');
