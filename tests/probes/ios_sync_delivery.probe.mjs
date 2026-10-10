import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { buildAiSFixture } from './ios_runtime_probe_support.mjs';

test('native iOS retries a dropped send and incomplete receipt without changing event identity', { skip: process.platform !== 'darwin' }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    const requests = [];
    server.on('connection', (socket, request) => {
        socket.send(JSON.stringify({ type: 'welcome' }));
        socket.on('message', raw => {
            const message = JSON.parse(String(raw));
            if (request.url === '/ws/sync') {
                if (message.type === 'register') socket.send(JSON.stringify({ type: 'registered', principal_id: 'remote', streams: [] }));
                if (message.type === 'subscribe') socket.send(JSON.stringify({ type: 'replay-complete', stream: message.stream, cursor: 0 }));
                return;
            }
            if (message.action !== 'push') return;
            requests.push(message);
            if (requests.length === 1) { socket.terminate(); return; }
            const changes = requests.length === 2 ? [] : message.events.map(event => ({ id: event.id, stream_id: 'own-stream' }));
            socket.send(JSON.stringify({ type: 'sync-response', requestId: message.requestId, success: true, changes }));
        });
    });
    let build;
    try {
        build = buildAiSFixture('tests/probes/ios_sync_delivery_fixture.swift', { client: true });
        const child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`]);
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        const timer = setTimeout(() => child.kill(), 25000);
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        clearTimeout(timer);
        assert.equal(code, 0, errors);
        assert.match(output, /Native WebSocket delivery checks passed/);
        assert.equal(requests.length, 3);
        assert.ok(requests.every(request => request.events.length === 1 && request.events[0].id === 'durable-event'));
        assert.ok(requests.every(request => request.events[0].actor.id === 'remote'));
        assert.equal(new Set(requests.map(request => request.requestId)).size, 3);
    } finally {
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve));
        build?.dispose();
    }
});
