// A local sync QA topology: one isolated server reachable on the LAN, two accounts each holding a project, and a
// manifest (temp/sync-qa/<run>/topology.json, mode 600) that device tests read. The server is atome-server with its
// Rust vault supervisor, from the binaries already built (tests/helpers/probe_server.mjs).
// SQUIRREL_SYNC_QA_PORT: the port (3011); SQUIRREL_SYNC_QA_HOLD=1 keeps the server until the probe is stopped.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commit, connectUser, startServer } from '../helpers/probe_server.mjs';

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const port = Number(process.env.SQUIRREL_SYNC_QA_PORT || 3011);
const runId = process.env.SQUIRREL_SYNC_QA_RUN_ID || String(Date.now());
const runRoot = path.join(projectRoot, 'temp', 'sync-qa', runId);
const manifestPath = path.join(runRoot, 'topology.json');

const isLanAddress = (address) => address
    && address.family === 'IPv4'
    && !address.internal
    && !address.address.startsWith('169.254.');
const lanAddress = Object.values(os.networkInterfaces()).flat().find(isLanAddress)?.address;
if (!lanAddress) throw new Error('sync_qa_lan_address_unavailable');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('sync_qa_port_invalid');

const createPrincipalAndProject = async (server, { suffix, username }) => {
    const user = await connectUser(server, { phone: `+33991${String(suffix).padStart(5, '0')}`, name: username });
    try {
        const projectId = crypto.randomUUID();
        const committed = await commit(user, {
            id: crypto.randomUUID(), kind: 'set', atome_id: projectId,
            payload: { props: { type: 'project', owner_id: user.id, creator_id: user.id, name: `${username} project` } }
        });
        assert.equal(committed.success, true, JSON.stringify(committed));
        return { principalId: user.id, projectId, token: user.token, username };
    } finally {
        user.close();
    }
};

const server = await startServer({ port });
const stop = () => server.stop();
process.once('SIGINT', async () => { await stop(); process.exit(130); });
process.once('SIGTERM', async () => { await stop(); process.exit(143); });
try {
    for (const host of ['127.0.0.1', lanAddress]) {
        const response = await fetch(`http://${host}:${port}/health`);
        assert.equal(response.ok, true, `health_failed:${host}`);
    }
    const suffix = process.pid % 40000;
    const first = await createPrincipalAndProject(server, { suffix, username: 'sync_qa_alice' });
    const second = await createPrincipalAndProject(server, { suffix: suffix + 1, username: 'sync_qa_bob' });
    const httpBase = `http://${lanAddress}:${port}`;
    const manifest = {
        runId, runtime: 'local-test', host: '0.0.0.0', lanAddress, port, httpBase,
        wsApi: `ws://${lanAddress}:${port}/ws/api`, wsSync: `ws://${lanAddress}:${port}/ws/sync`,
        databasePath: path.join(server.dir, 'adole.db'), dataRoot: server.dir, accounts: [first, second]
    };
    fs.mkdirSync(runRoot, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(`sync_qa_topology: PASS ${manifestPath}`);
    console.log(`sync_qa_endpoint: ${httpBase}`);
    if (process.env.SQUIRREL_SYNC_QA_HOLD === '1') await new Promise(() => {});
} finally {
    await stop();
}
