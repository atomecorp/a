#!/usr/bin/env node
// Reference MCP client without AI (architecture §6.4): a scripted client that starts the stdio
// bridge (atome_mcp_stdio.mjs) and runs the standard sequence against a running eVe page —
// initialize, tools/list (every page), resources/list, the navigation tree, one tool call,
// list_changed followed, a long call cancelled. It is the parity probe of phase E; probes import
// `createMcpStdioClient` to drive their own sequence.
//
//   node scripts/mcp/atome_mcp_client.mjs --server ws://127.0.0.1:3001/ws/api --account <handle or phone> [--seat-file <path>]
//        [--target <surface id or label>] [--call <tool> --arguments '<json>'] [--cancel <tool> --cancel-arguments '<json>']
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const BRIDGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'atome_mcp_stdio.mjs');
export const CLIENT_PROTOCOL_VERSION = '2025-06-18';

/** Starts the bridge with `env` (ATOME_MCP_SERVER, ATOME_MCP_ACCOUNT or ATOME_MCP_SEAT_FILE, …) and speaks MCP to it. */
export function createMcpStdioClient({ env, timeoutMs = 60 * 1000 }) {
    const child = spawn(process.execPath, [BRIDGE], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(String(chunk)));
    let nextId = 0;
    const waiting = new Map();
    const notifications = [];
    const listeners = new Set();
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
        const message = JSON.parse(line);
        if (Object.hasOwn(message, 'id') && waiting.has(message.id)) {
            const settle = waiting.get(message.id);
            waiting.delete(message.id);
            settle(message);
            return;
        }
        notifications.push(message);
        listeners.forEach(listener => listener(message));
    });
    const write = message => child.stdin.write(`${JSON.stringify(message)}\n`);
    const request = (method, params) => {
        const id = ++nextId;
        const answer = new Promise((resolve, reject) => {
            const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`timeout:${method}`)); }, timeoutMs);
            waiting.set(id, (message) => { clearTimeout(timer); resolve(message); });
        });
        write({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
        return { id, answer };
    };
    const call = async (method, params) => {
        const message = await request(method, params).answer;
        if (message.error) throw Object.assign(new Error(message.error.message), { code: message.error.code });
        return message.result;
    };
    const notification = (predicate, waitMs = timeoutMs) => new Promise((resolve, reject) => {
        const hit = notifications.find(predicate);
        if (hit) { resolve(hit); return; }
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('notification_timeout')); }, waitMs);
        const listener = (message) => { if (predicate(message)) { clearTimeout(timer); listeners.delete(listener); resolve(message); } };
        listeners.add(listener);
    });
    return {
        request, call, notification, notifications, stderr,
        notify: (method, params) => write({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }),
        async initialize() {
            const result = await call('initialize', { protocolVersion: CLIENT_PROTOCOL_VERSION, capabilities: {},
                clientInfo: { name: 'atome-mcp-reference-client', version: '1.0.0' } });
            write({ jsonrpc: '2.0', method: 'notifications/initialized' });
            return result;
        },
        async listAllTools() {
            const tools = [];
            let cursor;
            do {
                const page = await call('tools/list', cursor === undefined ? {} : { cursor });
                tools.push(...page.tools);
                cursor = page.nextCursor;
            } while (cursor !== undefined);
            return tools;
        },
        close() { child.stdin.end(); child.kill('SIGTERM'); }
    };
}

async function main() {
    const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
    const client = createMcpStdioClient({ env: {
        ATOME_MCP_SERVER: option('server') || process.env.ATOME_MCP_SERVER,
        ...(option('account') ? { ATOME_MCP_ACCOUNT: option('account') } : {}),
        ...(option('seat-file') ? { ATOME_MCP_SEAT_FILE: option('seat-file') } : {}),
        ...(option('target') ? { ATOME_MCP_TARGET: option('target') } : {})
    } });
    const report = {};
    try {
        report.initialize = await client.initialize();
        const tools = await client.listAllTools();
        report.tools = { count: tools.length, read_only: tools.filter(tool => tool.annotations?.readOnlyHint).length };
        report.resources = (await client.call('resources/list', {})).resources.map(resource => resource.uri);
        const tree = await client.call('resources/read', { uri: 'eve://navigation/eve/advanced/web' });
        report.navigation = { children: JSON.parse(tree.contents[0].text).children.length };
        if (option('call')) report.call = await client.call('tools/call', { name: option('call'), arguments: JSON.parse(option('arguments') || '{}') });
        if (option('cancel')) {
            const held = client.request('tools/call', { name: option('cancel'), arguments: JSON.parse(option('cancel-arguments') || '{}'),
                _meta: { progressToken: 'cancel' } });
            await client.notification(message => message.method === 'notifications/progress' && message.params?.progressToken === 'cancel');
            client.notify('notifications/cancelled', { requestId: held.id, reason: 'reference client' });
            report.cancelled = held.id;
        }
        report.list_changed = await client.notification(message => message.method === 'notifications/tools/list_changed',
            Number(option('list-changed-wait-ms') || 0)).then(() => true, () => false);
    } finally {
        client.close();
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => { process.stderr.write(`atome_mcp_client: ${error.message}\n`); process.exit(1); });
}
