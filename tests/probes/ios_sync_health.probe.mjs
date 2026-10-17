import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { buildAiSFixture } from './ios_runtime_probe_support.mjs';

test('native foreground coalesces ping probes and replaces an unresponsive OPEN socket', { skip: process.platform !== 'darwin' }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    let connections = 0, firstPings = 0, build;
    server.on('connection', (socket, request) => {
        if (request.url !== '/ws/sync') return;
        const connection = ++connections;
        socket.on('message', raw => {
            const message = JSON.parse(String(raw));
            if (message.type === 'auth') socket.send(JSON.stringify({ type: 'welcome', capabilities: ['subscribe-batch', 'subscribe-batch-settlement'] }));
            if (message.type === 'register') socket.send(JSON.stringify({ type: 'registered', principal_id: 'remote', streams: [] }));
            if (message.type === 'subscribe') socket.send(JSON.stringify({ type: 'replay-complete', subscription_id: message.subscription_id, streams: [], settled_streams: message.streams }));
            if (message.type === 'ping') {
                if (connection === 1) firstPings++;
                else socket.send(JSON.stringify({ type: 'pong' }));
            }
        });
    });
    try {
        build = buildAiSFixture('tests/probes/ios_sync_batch_subscribe_fixture.swift', { client: true });
        const child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`, 'health']);
        let errors = '';
        child.stderr.on('data', chunk => { errors += chunk; });
        const timer = setTimeout(() => child.kill(), 40000);
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        clearTimeout(timer);
        assert.equal(code, 0, errors);
        assert.equal(connections, 2);
        assert.equal(firstPings, 1);
    } finally {
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve));
        build?.dispose();
    }
});
