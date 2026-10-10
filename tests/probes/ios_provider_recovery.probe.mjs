import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';
import { buildAiSFixture } from './ios_runtime_probe_support.mjs';

for (const mode of ['', 'refresh', 'identity']) {
    const refresh = mode === 'refresh';
    test(`iOS sync recovery retains voice${refresh ? ' across token refresh' : ''} and ${mode === 'identity' ? 'scope change' : 'logout'} closes it`, { skip: process.platform !== 'darwin' }, async () => {
        const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        await new Promise(resolve => server.once('listening', resolve));
        let sync, pending, restarted = false, voiceSocket, providerConnections = 0;
        const respondAfterSyncDrop = () => {
            if (!sync || !pending || restarted) return;
            restarted = true; sync.terminate();
            setTimeout(() => voiceSocket.send(JSON.stringify({ type: 'ai-realtime-event', session_id: 'voice',
                event: { type: 'fixture-config-refresh' } })), 100);
            // Re-publish the same configuration during recovery, as the app does.
            setTimeout(() => voiceSocket.send(JSON.stringify({ type: 'ai-provider-response', requestId: pending.requestId,
                ok: true, data: { session_id: 'voice', sdp: 'fixture-answer' } })), 1500);
        };
        server.on('connection', (socket, request) => {
            if (request.url === '/ws/api') providerConnections++;
            socket.on('message', raw => {
                const message = JSON.parse(String(raw));
                if (request.url === '/ws/sync') {
                    if (message.type === 'register') {
                        sync = socket;
                        socket.send(JSON.stringify({ type: 'registered', principal_id: 'remote', streams: [] }));
                        respondAfterSyncDrop();
                    }
                    if (message.type === 'subscribe') socket.send(JSON.stringify({ type: 'replay-complete', stream: message.stream, cursor: 0 }));
                    return;
                }
                if (message.action === 'realtime-connect') { pending = message; voiceSocket = socket; respondAfterSyncDrop(); }
                if (message.action === 'credential.status') {
                    assert.equal(message.token, refresh ? 'fixture-token-renewed' : 'fixture-token');
                    socket.send(JSON.stringify({ type: 'ai-provider-response', requestId: message.requestId, ok: true, configured: true }));
                }
            });
            socket.send(JSON.stringify({ type: 'welcome' }));
        });
        let build, child, timer;
        try {
            build = buildAiSFixture('tests/probes/ios_provider_recovery_fixture.swift', { client: true });
            child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`, ...(mode ? [mode] : [])]);
            let output = '', errors = '';
            child.stdout.on('data', chunk => { output += chunk; });
            child.stderr.on('data', chunk => { errors += chunk; });
            timer = setTimeout(() => child.kill(), 20000);
            const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
            assert.equal(code, 0, errors);
            assert.match(output, /Native provider recovery checks passed/);
            assert.equal(restarted, true);
            assert.equal(providerConnections, 1, 'sync recovery must not reconnect or replay the provider operation');
        } finally {
            clearTimeout(timer); child?.kill();
            for (const client of server.clients) client.terminate();
            await new Promise(resolve => server.close(resolve));
            build?.dispose();
        }
    });
}


test('iOS provider keeps an idle voice control socket alive', { skip: process.platform !== 'darwin' }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    let pings = 0, idleTimer, timer, child, build;
    server.on('connection', (socket, request) => {
        socket.on('message', raw => {
            const message = JSON.parse(String(raw));
            if (request.url !== '/ws/api' || message.action !== 'realtime-connect') return;
            socket.send(JSON.stringify({ type: 'ai-provider-response', requestId: message.requestId,
                ok: true, data: { session_id: 'voice', sdp: 'fixture-answer' } }));
            idleTimer = setTimeout(() => socket.terminate(), 25000);
        });
        socket.on('ping', () => {
            pings++; clearTimeout(idleTimer);
            socket.send(JSON.stringify({ type: 'ai-provider-response', requestId: 'heartbeat-proof', ok: true }));
        });
        socket.send(JSON.stringify({ type: 'welcome' }));
    });
    try {
        build = buildAiSFixture('tests/probes/ios_provider_recovery_fixture.swift', { client: true });
        child = spawn(build.binary, [build.directory, `http://127.0.0.1:${server.address().port}`, 'idle']);
        let output = '', errors = '';
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
        timer = setTimeout(() => child.kill(), 45000);
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        assert.equal(code, 0, errors); assert.match(output, /Native provider recovery checks passed/);
        assert.ok(pings > 0, 'a real WebSocket ping must keep the control channel alive');
    } finally {
        clearTimeout(timer); clearTimeout(idleTimer); child?.kill();
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(resolve)); build?.dispose();
    }
});
