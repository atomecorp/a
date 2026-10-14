import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
        socket.send(JSON.stringify({ type: 'welcome', capabilities: ['subscribe', 'subscribe-batch'] }));
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
                socket.send(JSON.stringify({ type: 'replay-complete', streams: [{ stream: 'stream-1', cursor: 1 }] }));
            } else socket.send(JSON.stringify({ type: 'replay-complete', streams: [] }));
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
        const projections = JSON.parse(output.trim().split('\n').at(-1));
        assert.deepEqual(projections, [{ type: 'sync:projection-ready', streams: ['stream-1'], replay: true }]);
    } finally {
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve));
        build?.dispose();
    }
});
