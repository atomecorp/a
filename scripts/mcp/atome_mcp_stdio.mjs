#!/usr/bin/env node
// Standard MCP over stdio for eVe (architecture §6.3). A local process an MCP client starts: it
// speaks MCP (newline-delimited JSON-RPC) on stdin/stdout, opens its own seat on the eVe server's
// `/ws/api` (a key paired to the person's account, accepted by the number it prints: atome_mcp_seat.mjs),
// announces itself as that program, and forwards every request through the existing `remote-control`
// relay (server/remoteCommandRelay.js) to a running eVe page, which answers through its own MCP layer
// and single entry, within the families the person granted it in Réglages › Mon matériel. No HTTP route.
//
//   ATOME_MCP_SERVER     ws(s)://host:port/ws/api            (or --server)
//   ATOME_MCP_ACCOUNT    the account to pair with: its handle or its phone number (or --account)
//   ATOME_MCP_SEAT_FILE  where the seat is kept between runs, mode 0600 (or --seat-file); in memory otherwise
//   ATOME_MCP_TARGET     the eVe page: its surface id or label (or --target); optional with one page online
//   ATOME_MCP_SURFACE_ID this program's surface id (or --surface-id); a new one per process otherwise
//   ATOME_MCP_LABEL      this program's name on the person's devices (or --label)
//   ATOME_MCP_HOST       the machine it runs on, shown beside its name (or --host); this computer's name otherwise
//
// Offline: on Tauri and iOS point --server at the local server's /ws/api (same relay contract).
import crypto from 'node:crypto';
import os from 'node:os';
import readline from 'node:readline';
import { openProgramSeat } from './atome_mcp_seat.mjs';

const option = (name, env) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? process.argv[index + 1] : process.env[env];
};
const config = {
    server: option('server', 'ATOME_MCP_SERVER'),
    account: option('account', 'ATOME_MCP_ACCOUNT') || null,
    seatFile: option('seat-file', 'ATOME_MCP_SEAT_FILE') || null,
    host: option('host', 'ATOME_MCP_HOST') || os.hostname(),
    target: option('target', 'ATOME_MCP_TARGET') || null,
    surfaceId: option('surface-id', 'ATOME_MCP_SURFACE_ID') || `mcp_program_${crypto.randomUUID()}`,
    label: option('label', 'ATOME_MCP_LABEL') || 'MCP'
};
if (!config.server || !(config.account || config.seatFile)) {
    process.stderr.write('atome_mcp_stdio: --server and --account or --seat-file (or ATOME_MCP_SERVER, ATOME_MCP_ACCOUNT, ATOME_MCP_SEAT_FILE) are required\n');
    process.exit(2);
}

const RELAY_TIMEOUT_MS = 35 * 1000;
const RENDERING_PLATFORMS = new Set(['browser', 'tauri', 'ios', 'android']);
const log = message => process.stderr.write(`atome_mcp_stdio: ${message}\n`);
const write = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const rpcError = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

// ---------------------------------------------------------------------------
// /ws/api
// ---------------------------------------------------------------------------
const socket = new WebSocket(config.server);
const waiting = new Map();
socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    const settle = waiting.get(message.requestId);
    if (settle) { waiting.delete(message.requestId); settle(message); }
});
socket.addEventListener('close', () => { log('server connection closed'); process.exit(1); });
const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('server_unreachable')), { once: true });
});

const request = (message, timeoutMs = RELAY_TIMEOUT_MS) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { waiting.delete(requestId); reject(new Error('relay_timeout')); }, timeoutMs);
    waiting.set(requestId, (answer) => { clearTimeout(timer); resolve(answer); });
    socket.send(JSON.stringify({ ...message, requestId }));
});
let seat = null;
// Every message after the seat opened carries its own token (never one copied from a browser).
const send = message => request({ ...message, token: seat.token() });

let targetSurfaceId = null;
const ready = (async () => {
    await opened;
    seat = await openProgramSeat({ request, account: config.account, label: config.label, host: config.host, seatFile: config.seatFile, log });
    const announced = await send({ type: 'surface', action: 'announce', surface_id: config.surfaceId, label: config.label,
        platform: 'mcp_program', capabilities: {} });
    if (announced.success !== true) throw new Error(`announce_failed:${announced.error || 'unknown'}`);
    const pages = (announced.surfaces || []).filter(surface => RENDERING_PLATFORMS.has(surface.platform));
    const chosen = config.target
        ? pages.filter(surface => surface.surface_id === config.target || surface.label === config.target)
        : pages;
    if (chosen.length !== 1) throw new Error(chosen.length ? 'mcp_target_ambiguous' : 'mcp_target_offline');
    targetSurfaceId = chosen[0].surface_id;
    log(`relaying to ${chosen[0].label || targetSurfaceId}`);
})();

/** One MCP message to the eVe page; resolves its JSON-RPC answer. */
async function relay(method, params, id = crypto.randomUUID()) {
    await ready;
    const answer = await send({ type: 'remote-control', action: 'command', target_surface_id: targetSurfaceId,
        mcp: { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) } });
    if (answer.success !== true) throw new Error(answer.error || 'relay_failed');
    return answer.result?.mcp;
}

// ---------------------------------------------------------------------------
// Held calls: « pending » to the program, then the result once the person decided on the device.
// ---------------------------------------------------------------------------
const cancelled = new Set();

async function followHeldCall(request, held) {
    const token = request.params?._meta?.progressToken;
    if (token !== undefined) {
        write({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: 0,
            message: `pending: confirm on the device (${held.confirmation_id}, until ${held.expires_at})` } });
    }
    for (;;) {
        if (cancelled.has(request.id)) return null;
        const answer = await relay('atome/confirmation/await', { confirmation_id: held.confirmation_id });
        if (cancelled.has(request.id)) return null;
        if (answer.error || answer.result?.status !== 'pending') return answer;
    }
}

async function handle(request) {
    const isNotification = !Object.hasOwn(request, 'id');
    if (request.method === 'notifications/initialized') return;
    if (request.method === 'notifications/cancelled') {
        cancelled.add(request.params?.requestId);
        await relay('notifications/cancelled', request.params);
        return;
    }
    if (isNotification) return;
    const answer = await relay(request.method, request.params, request.id);
    const held = answer?.result?._meta?.['atome/confirmation'];
    const final = held?.status === 'pending' ? await followHeldCall(request, held) : answer;
    // A cancelled request gets no answer (MCP cancellation).
    if (final && !cancelled.has(request.id)) write({ ...final, id: request.id });
    if (request.method === 'initialize' && final?.result) watchListChanges();
}

let watching = false;
function watchListChanges() {
    if (watching) return;
    watching = true;
    (async () => {
        for (;;) {
            const answer = await relay('atome/notifications/await', {});
            (answer?.result?.notifications || []).forEach(write);
        }
    })().catch(error => { log(`list watch stopped: ${error.message}`); process.exit(1); });
}

ready.catch((error) => { log(error.message); process.exit(1); });
readline.createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return;
    let request;
    try { request = JSON.parse(line); } catch { rpcError(null, -32700, 'parse_error'); return; }
    handle(request).catch((error) => {
        if (Object.hasOwn(request, 'id')) rpcError(request.id, -32603, error.message);
        else log(`${request.method}: ${error.message}`);
    });
}).on('close', () => process.exit(0));
