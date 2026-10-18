import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { buildAiSFixture } from './ios_runtime_probe_support.mjs';

// The native client subscribes in batches when /ws/sync advertises `subscribe-batch`, and
// announces one projection per batch replay that applied events instead of one per stream.
test('native iOS subscribes in batches and announces one projection per applying batch', { skip: process.platform !== 'darwin' }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    const streams = Array.from({ length: 1200 }, (_, index) => `stream-${index}`);
    const batches = [];
    server.on('connection', (socket, request) => {
        if (request.url !== '/ws/sync') return;
        socket.send(JSON.stringify({ type: 'welcome', capabilities: ['subscribe', 'subscribe-batch', 'subscribe-batch-settlement'] }));
        socket.on('message', raw => {
            const message = JSON.parse(String(raw));
            if (message.type === 'register') socket.send(JSON.stringify({ type: 'registered', principal_id: 'remote', streams }));
            if (message.type !== 'subscribe') return;
            batches.push(message);
            if (batches.length === 1) {
                socket.send(JSON.stringify({
                    type: 'event', event_id: 'batch-event', stream: 'stream-1', sequence: 1, replay: true,
                    vault_principal_id: 'remote', atome_id: 'batch-shape', kind: 'set',
                    patch: { props: { type: 'shape', left: 1 } }, timestamp: new Date().toISOString()
                }));
                socket.send(JSON.stringify({ type: 'replay-complete', subscription_id: message.subscription_id, settled_streams: message.streams.map(entry => ({...entry, cursor: entry.stream === 'stream-1' ? 1 : entry.cursor})), streams: [{ stream: 'stream-1', cursor: 1 }] }));
            } else socket.send(JSON.stringify({ type: 'replay-complete', subscription_id: message.subscription_id, settled_streams: message.streams, streams: [] }));
        });
    });
    let build;
    try {
        build = buildAiSFixture('tests/probes/ios_sync_batch_subscribe_fixture.swift', { client: true });
        const child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`]);
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        const timer = setTimeout(() => child.kill(), 25000);
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        clearTimeout(timer);
        assert.equal(code, 0, errors);
        // 1 200 announced streams + directory.public: three messages instead of 1 201.
        assert.deepEqual(batches.map(batch => batch.streams?.length), [500, 500, 201]);
        assert.equal(batches.some(batch => 'stream' in batch), false);
        assert.equal(new Set(batches.map(batch => batch.subscription_id)).size, 3);
        const projections = JSON.parse(output.trim().split('\n').at(-1));
        assert.deepEqual(projections, [{ type: 'sync:projection-ready', streams: ['stream-1'], replay: true, local_user_id: 'local' }]);
    } finally {
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve));
        build?.dispose();
    }
});

// A replay is persisted in runs: Fastify's `acked` and `pong` answers, interleaved with the
// events, do not cut them, a poisoned envelope is rejected inside its run, and every ack
// reaches Fastify once its run is committed.
test('native iOS persists a replay in grouped transactions and acks only committed runs', { skip: process.platform !== 'darwin' }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    const acks = [];
    let build;
    server.on('connection', (socket, request) => {
        if (request.url !== '/ws/sync') return;
        socket.send(JSON.stringify({ type: 'welcome', capabilities: ['subscribe', 'subscribe-batch', 'subscribe-batch-settlement'] }));
        socket.on('message', raw => {
            const message = JSON.parse(String(raw));
            if (message.type === 'register') socket.send(JSON.stringify({ type: 'registered', principal_id: 'remote', streams: ['stream-1'] }));
            if (message.type === 'ack') {
                const durable = Number(execFileSync('sqlite3', ['-cmd', '.timeout 5000', `${build.directory}/adole.db`,
                    "SELECT last_sequence FROM remote_sync_stream_cursors WHERE stream_id = 'stream-1'"], { encoding: 'utf8' }).trim());
                acks.push({ sequence: message.sequence, durable });
                socket.send(JSON.stringify({ type: 'acked', stream: message.stream, sequence: message.sequence }));
            }
            if (message.type !== 'subscribe') return;
            for (let sequence = 1; sequence <= 150; sequence += 1) {
                const event = {
                    type: 'event', event_id: `run-${sequence}`, stream: 'stream-1', sequence, replay: true,
                    vault_principal_id: 'remote', atome_id: `run-shape-${sequence % 10}`, kind: 'set',
                    patch: { props: { type: 'shape', left: sequence } }, timestamp: new Date().toISOString()
                };
                if (sequence === 70) delete event.vault_principal_id;
                socket.send(JSON.stringify(event));
                if (sequence % 10 === 0) {
                    socket.send(JSON.stringify({ type: 'acked', stream: 'stream-1', sequence: 0 }));
                    socket.send(JSON.stringify({ type: 'pong' }));
                }
            }
            socket.send(JSON.stringify({ type: 'replay-complete', subscription_id: message.subscription_id,
                settled_streams: message.streams.map(entry => ({ ...entry, cursor: entry.stream === 'stream-1' ? 150 : entry.cursor })) }));
        });
    });
    try {
        build = buildAiSFixture('tests/probes/ios_sync_batch_subscribe_fixture.swift', { client: true });
        const child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`, 'run']);
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        const timer = setTimeout(() => child.kill(), 25000);
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        clearTimeout(timer);
        assert.equal(code, 0, errors);
        const [stats, projections] = output.trim().split('\n').slice(-2).map(line => JSON.parse(line));
        assert.deepEqual(projections, [{ type: 'sync:projection-ready', streams: ['stream-1'], replay: true, local_user_id: 'local' }]);
        assert.deepEqual({ events: stats.events, rejected: stats.rejected, cursor: stats.cursor }, { events: 149, rejected: 1, cursor: 150 });
        // Runs of 64: three transactions; one per interleaved answer would be fifteen or more.
        assert.ok(stats.transactions >= 3 && stats.transactions <= 5, `transactions: ${stats.transactions}`);
        assert.ok(acks.length > 0 && acks.length <= stats.transactions, `acks: ${acks.length}`);
        assert.equal(acks.at(-1).sequence, 150);
        for (const ack of acks) assert.ok(ack.durable >= ack.sequence, `ack ${ack.sequence} sent before its commit (${ack.durable})`);
    } finally {
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve));
        build?.dispose();
    }
});
