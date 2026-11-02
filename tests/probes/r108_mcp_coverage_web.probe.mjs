// R-104 MCP « universal access » on the real Web app (cahier V1.2 §5.2–5.3, §9.3): the actions done by real gestures
// in a project are dispatched on the one command bus (commandBusV2) by tool id; each of those tools must be listed by the
// in-page MCP server (`tools/list`, all pages) and callable through it (`tools/call`) with the same effect as the gesture.
// Usage: PW_HEADFUL=1 xvfb-run -a node tests/probes/r108_mcp_coverage_web.probe.mjs (isolated test server, r108_web_session.mjs).
import path from 'node:path';
import { awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, sceneRecords, visibleMenuTool, waitFor, waitForStableScene, wait } from './molecule_ui_acceptance_support.mjs';
import { openR108Session } from './r108_web_session.mjs';

const OUT = path.resolve(process.env.R108_OUT || 'temp/probe_reports/r108_mcp_coverage_web');
const { page, report, check, signIn, tool, inProject, finish } = await openR108Session({ out: OUT });
const userRecords = async (pid) => (await sceneRecords(page, pid)).filter((record) => !String(record.id).startsWith('__eve_'));
const busSeq = () => page.evaluate(async () => (await import('/eVe/intuition/runtime/command_bus.js')).commandBusV2.seq);
const busTools = (fromSeq) => page.evaluate(async (from) => (await import('/eVe/intuition/runtime/command_bus.js')).commandBusV2
    .listEvents({ fromSeq: from }).map((event) => ({ tool: event.tool_id || event.envelope?.tool_id || event.envelope?.tool?.id || '',
        kind: event.kind || '', source: event.envelope?.source?.type || event.source || '', layer: event.envelope?.source_layer || event.source_layer || '' }))
    .filter((event) => event.tool), fromSeq);
// The in-page MCP server, as an MCP client sees it (JSON-RPC 2.0), for the transport `type`.
const mcp = (method, params, type) => page.evaluate(async ({ method, params, type }) => {
    const { handleMcpProtocolMessage } = await import('/squirrel/atome/mcp_protocol.js');
    const session = await window.AdoleAPI.auth.current();
    const userId = String(session?.user?.id || session?.user?.user_id || session?.user_id || '');
    return JSON.parse(JSON.stringify(await handleMcpProtocolMessage({ jsonrpc: '2.0', id: Date.now(), method, params },
        { source: { type, layer: 'r108_mcp_probe' }, actor: { user_id: userId } })));
}, { method, params, type });

try {
    await check('sign_in', signIn);
    const project = await check('create_project', async () => {
        const result = await tool({ tool_id: 'ui.new_project', action: 'pointer.click', input: { name: 'TEST-R108-MCP' } });
        if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
        return inProject();
    });
    const pid = project.id;
    await check('mcp_initialize', async () => {
        const answer = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'probe', version: '1' } }, 'ai');
        if (!answer.result?.protocolVersion) throw new Error(JSON.stringify(answer).slice(0, 400));
        return { protocolVersion: answer.result.protocolVersion, server: answer.result.serverInfo };
    });
    const listed = new Set();
    await check('mcp_tools_list', async () => {
        let cursor; let pages = 0;
        do {
            const answer = await mcp('tools/list', cursor === undefined ? {} : { cursor }, 'ai');
            if (!answer.result) throw new Error(JSON.stringify(answer).slice(0, 400));
            answer.result.tools.forEach((entry) => listed.add(entry.name));
            cursor = answer.result.nextCursor; pages += 1;
        } while (cursor !== undefined && pages < 200);
        report.mcp_tools = [...listed].sort();
        return { tools: listed.size, pages, sample: [...listed].slice(0, 12) };
    });

    // Real gestures: Créer › Forme › Cercle, a touch on the canvas, the tool disarmed by its palette slot, a touch selecting it.
    const before = await busSeq();
    await check('gestures', async () => {
        const tap = async (key) => clickCanvasTarget(page, await visibleMenuTool(page, pid, key));
        await tap('create'); await wait(600); await tap('shape_create'); await wait(600);
        const circle = await waitFor(page, () => {
            const ids = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || []).flatMap((tree) => (tree.interactiveNodes || []).map((node) => String(node?.id || node)));
            const found = ids.find((id) => /circle/i.test(id) && !/_background$/.test(id)) || '';
            return { ok: !!found, found };
        }, null, 10000);
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodePrefix: circle.found, step: 2 }));
        await page.mouse.click(200, 300); await wait(1200);
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodePrefix: 'atome_contextual_tool_shape_create', step: 2 }));
        await wait(800);
        const shape = (await userRecords(pid)).at(-1);
        await waitForStableScene(page, pid);
        await clickCanvasTarget(page, await recordCenter(page, pid, (record) => record.id === shape.id));
        await wait(1000);
        return { shape: shape.id };
    });
    const dispatched = await check('gestures_on_command_bus', async () => {
        const events = await busTools(before + 1);
        const tools = [...new Set(events.map((event) => event.tool))];
        if (!tools.length) throw new Error('no tool dispatched on the command bus by the gestures');
        return { events: events.length, tools, sources: [...new Set(events.map((event) => `${event.source}/${event.layer}`))] };
    });
    await check('gesture_tools_listed_by_mcp', async () => {
        const tools = dispatched?.tools || [];
        const missing = tools.filter((name) => !listed.has(name));
        report.gesture_tools_missing_in_mcp = missing;
        if (missing.length) throw new Error(`not listed by MCP: ${missing.join(', ')} (listed: ${tools.filter((name) => listed.has(name)).join(', ')})`);
        return { all_listed: tools.length };
    });

    // The same capability driven through MCP (no gesture): the selection's colour, then the effect read back.
    await check('mcp_tools_call_colour', async () => {
        const name = listed.has('ui.couleur.apply') ? 'ui.couleur.apply' : [...listed].find((entry) => /couleur/.test(entry));
        if (!name) throw new Error('no colour tool listed by MCP');
        const seq = await busSeq();
        const answer = await mcp('tools/call', { name, arguments: { action: 'pointer.click', input: { color: '#22aa55' }, color: '#22aa55' } }, 'ai');
        const effect = await waitFor(page, async (id) => {
            const ids = await (await import('/eVe/intuition/tools/selection_style_context.js')).resolveSelectionIds();
            const record = (window.eveToolBase?.getProjectSceneState?.(id)?.records || []).find((entry) => ids.includes(entry.id));
            const value = String(record?.properties?.backgroundColor || record?.properties?.fill || record?.properties?.color || '').toLowerCase();
            return { ok: value.includes('22aa55') || value.includes('34, 170, 85'), value };
        }, pid, 10000).catch((error) => ({ ok: false, error: error.message.slice(0, 300) }));
        const bus = await busTools(seq + 1);
        if (!effect.ok) throw new Error(`effect missing: ${JSON.stringify({ name, answer: JSON.stringify(answer).slice(0, 500), effect, bus })}`);
        return { name, bus: bus.map((event) => `${event.tool} ${event.source}/${event.layer}`) };
    });
    await page.screenshot({ path: path.join(OUT, 'after_mcp_colour.png') });
} finally {
    await finish();
}
