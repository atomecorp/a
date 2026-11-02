// R-109 (cahier V1.2 §5.5, §9.3): an independent MCP client without AI, the official SDK (@modelcontextprotocol/sdk,
// not a dependency of this repository: MCP_SDK_DIR names the folder where it is installed), starts the stdio bridge
// (scripts/mcp/atome_mcp_stdio.mjs). The bridge pairs as a program of the person's account, the person approves it
// on the real eVe page with the number it shows, grants it « Modifier » in Réglages › Mon matériel, and the client
// discovers the catalog, reads the navigation, is refused before the grant, then changes the page through a tool and
// sees its effect there.
// Usage: MCP_SDK_DIR=<folder with node_modules/@modelcontextprotocol/sdk> PW_HEADFUL=1 xvfb-run -a node tests/probes/r109_mcp_external_client_web.probe.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { waitFor } from './molecule_ui_acceptance_support.mjs';
import { APP_URL, openR108Session } from './r108_web_session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SDK = path.join(process.env.MCP_SDK_DIR || '', 'node_modules/@modelcontextprotocol/sdk/dist/esm/client');
const { Client } = await import(pathToFileURL(path.join(SDK, 'index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(path.join(SDK, 'stdio.js')).href);
const { ToolListChangedNotificationSchema } = await import(pathToFileURL(path.join(SDK, '../types.js')).href);
const OUT = path.resolve(process.env.R109_OUT || 'temp/probe_reports/r109_mcp_external_client_web');
const { page, report, check, signIn, finish } = await openR108Session({ out: OUT });
const SERVER = `${APP_URL.replace(/^http/, 'ws')}/ws/api`;
let client = null;

// The person's device approves new devices with its approve key (WebAuthn on the Web): this Chromium gets a virtual
// platform authenticator through its own DevTools protocol, as a phone's would answer (the app is not changed).
const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

try {
    await check('sign_in', signIn);
    // Signed in by SMS, the device has no approve key yet: it adds one, as Home › Security offers it.
    await check('approve_key_added', () => page.evaluate(async () => {
        if (!await window.AdoleAPI.auth.approveKeyAvailable()) throw new Error('approve_key_unavailable_here');
        return JSON.parse(JSON.stringify(await window.AdoleAPI.auth.addApproveKey()));
    }));
    const account = await check('account', () => page.evaluate(async () => {
        const user = (await window.AdoleAPI.auth.current())?.user || {};
        return { handle: user.handle || '', phone: user.phone || user.phone_number || '' };
    }));
    const who = account?.handle || account?.phone;
    let matchNumber = '';
    const transport = new StdioClientTransport({ command: process.execPath, cwd: ROOT, stderr: 'pipe',
        args: [path.join(ROOT, 'scripts/mcp/atome_mcp_stdio.mjs'), '--server', SERVER, '--account', who, '--label', 'Probe R-109'] });
    const bridgeLog = [];
    transport.stderr?.on('data', (chunk) => {
        const text = String(chunk); bridgeLog.push(text);
        const found = text.match(/type (\d{2}) in eVe/); if (found) matchNumber = found[1];
    });
    client = new Client({ name: 'r109-independent-probe', version: '1.0.0' });
    let listChanged = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => { listChanged += 1; });
    const connecting = client.connect(transport);
    // The person, on the eVe page: the pairing request of the program, approved with the number it shows.
    const approved = await check('pairing_approved_on_page', async () => {
        const started = Date.now();
        while (!matchNumber && Date.now() - started < 60000) await new Promise(resolve => setTimeout(resolve, 250));
        if (!matchNumber) throw new Error(`no match number from the bridge: ${bridgeLog.join('').slice(-600)}`);
        return page.evaluate(async (number) => {
            const auth = window.AdoleAPI.auth;
            let pending = [];
            for (let i = 0; i < 60 && !pending.length; i += 1) { pending = (await auth.listPendingPairRequests?.()) || []; if (!pending.length) await new Promise(r => setTimeout(r, 500)); }
            if (!pending.length) throw new Error('no pending pair request on the page');
            const { request } = await auth.viewPairing(pending[0].pairId);
            const { approvePairRequest } = await import('/eVe/domains/user/pair_request_prompt.js');
            const result = await approvePairRequest(request, number);
            return { platform: request.platform, programId: request.deviceId, rejected: !!result?.rejected };
        }, matchNumber);
    });
    await check('mcp_initialize', async () => {
        await connecting;
        return { server: client.getServerVersion(), capabilities: client.getServerCapabilities() };
    });
    const allTools = async () => {
        const names = []; let cursor;
        do { const pageOf = await client.listTools(cursor ? { cursor } : {}); names.push(...pageOf.tools.map(tool => tool.name)); cursor = pageOf.nextCursor; } while (cursor);
        return names;
    };
    const listed = await check('mcp_tools_list_all_pages', async () => {
        const names = await allTools();
        report.external_mcp_tools_read = names;
        return { tools: names.length, has_new_project: names.includes('ui.new_project') };
    });
    await check('mcp_resources_list', async () => ({ resources: (await client.listResources()).resources.length }));
    // « Lire » alone at pairing: a change is refused before the person grants « Modifier ».
    await check('write_refused_before_grant', async () => {
        const result = await client.callTool({ name: 'ui.new_project', arguments: { action: 'pointer.click', name: 'TEST-R109-REFUSED' } });
        if (!result.isError) throw new Error(`accepted without the grant: ${JSON.stringify(result).slice(0, 400)}`);
        return { refused: true, text: JSON.stringify(result.content).slice(0, 200) };
    });
    await check('grant_modify_on_page', () => page.evaluate(async (programId) => {
        const grants = await import('/squirrel/atome/mcp_surface_grants.js');
        await grants.setMcpSurfaceGrant(programId, ['modify'], { source: { type: 'ui', layer: 'r109_probe' } });
        return grants.listMcpPrograms().find(entry => entry.program_id === programId || entry.programId === programId) || grants.listMcpPrograms();
    }, approved?.programId));
    await check('list_changed_after_grant', async () => {
        const started = Date.now();
        while (!listChanged && Date.now() - started < 45000) await new Promise(resolve => setTimeout(resolve, 250));
        const names = await allTools();
        report.external_mcp_tools_modify = names;
        if (!listChanged) throw new Error(`no notifications/tools/list_changed; tools now ${names.length}`);
        return { notifications: listChanged, tools_before: listed?.tools, tools_after: names.length, has_new_project: names.includes('ui.new_project') };
    });
    await check('tool_call_changes_the_page', async () => {
        const result = await client.callTool({ name: 'ui.new_project', arguments: { action: 'pointer.click', name: 'TEST-R109-MCP' } });
        if (result.isError) throw new Error(JSON.stringify(result).slice(0, 600));
        const opened = await waitFor(page, () => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && !!window.__currentProject?.id,
            id: window.__currentProject?.id || '', name: window.__currentProject?.name || '' }), null, 30000);
        return { opened, result: JSON.stringify(result.structuredContent || result.content).slice(0, 300) };
    });
} finally {
    report.bridge_log = undefined;
    await client?.close().catch(() => {});
    await finish();
}
