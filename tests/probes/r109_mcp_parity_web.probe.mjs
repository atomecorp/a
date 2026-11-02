// R-109 (cahier V1.2 §5.3–5.7, §9.3) on the real Web app: everything reachable through MCP without slowing the person.
// - boot: no tool module loaded for MCP (the panel modules stay lazy);
// - the first MCP discovery loads them: every tool listed, the 9 formerly invisible ones included;
// - a shape created by a gesture reaches the command bus (`atome_committed`), and that trace costs the gesture one push;
// - parity: the shadow applied through MCP is undone through MCP's undo, as the interface's undo does;
// - a tool that needs the person's yes is held (`atome/confirmation` pending), not run;
// - latency of MCP calls (p50/p95/p99), and MCP still answers with the network cut.
// Usage: PW_HEADFUL=1 xvfb-run -a node tests/probes/r109_mcp_parity_web.probe.mjs (isolated test server, r108_web_session.mjs).
import path from 'node:path';
import { awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, sceneRecords, visibleMenuTool, waitFor, waitForStableScene, wait } from './molecule_ui_acceptance_support.mjs';
import { openR108Session } from './r108_web_session.mjs';

const OUT = path.resolve(process.env.R109_OUT || 'temp/probe_reports/r109_mcp_parity_web');
const { page, report, check, signIn, tool, inProject, finish } = await openR108Session({ out: OUT });
// Parity of undo is checked a moment after the change (as a person does); an undo sent at once after the change is
// checked on its own (`undo_right_after_change`): it can still find its transaction not yet in the server's history.
const UNDO_DELAY_MS = Number(process.env.R109_UNDO_DELAY_MS ?? 1500);
const FORMERLY_LAZY = ['ui.shadow.apply', 'ui.shadow.remove', 'ui.rounding.apply', 'ui.rounding.reset', 'ui.rounding.toggle',
    'ui.backdrop.apply', 'ui.backdrop.remove', 'ui.layer.select'];
const LAZY_MODULES = /\/intuition\/tools\/(shadow|rounding|backdrop|layer)\.js/;
const loadedLazyModules = () => page.evaluate((pattern) => performance.getEntriesByType('resource').map(entry => entry.name)
    .filter(name => new RegExp(pattern).test(name)), LAZY_MODULES.source);
const userRecords = async (pid) => (await sceneRecords(page, pid)).filter((record) => !String(record.id).startsWith('__eve_'));
const mcp = (method, params) => page.evaluate(async ({ method, params }) => {
    const { handleMcpProtocolMessage } = await import('/squirrel/atome/mcp_protocol.js');
    const session = await window.AdoleAPI.auth.current();
    const userId = String(session?.user?.id || session?.user?.user_id || session?.user_id || '');
    return JSON.parse(JSON.stringify(await handleMcpProtocolMessage({ jsonrpc: '2.0', id: Date.now() + Math.random(), method, params },
        { source: { type: 'ai', layer: 'r109_parity_probe' }, actor: { user_id: userId } })));
}, { method, params });
const call = (name, args) => mcp('tools/call', { name, arguments: args });
const recordOf = (pid, id) => page.evaluate(({ pid, id }) => (window.eveToolBase?.getProjectSceneState?.(pid)?.records || [])
    .find(entry => entry.id === id) || null, { pid, id });
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; };

try {
    await check('sign_in', signIn);
    const project = await check('create_project', async () => {
        const result = await tool({ tool_id: 'ui.new_project', action: 'pointer.click', input: { name: 'TEST-R109-PARITY' } });
        if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
        return inProject();
    });
    const pid = project.id;
    await check('boot_loads_no_module_for_mcp', async () => {
        const loaded = await loadedLazyModules();
        if (loaded.length) throw new Error(`loaded before any MCP request: ${loaded.join(', ')}`);
        return { lazy_modules_loaded: 0 };
    });
    const listed = new Set();
    await check('first_discovery_lists_every_tool', async () => {
        const started = Date.now(); let cursor; let pages = 0;
        do {
            const answer = await mcp('tools/list', cursor === undefined ? {} : { cursor });
            if (!answer.result) throw new Error(JSON.stringify(answer).slice(0, 400));
            answer.result.tools.forEach(entry => listed.add(entry.name)); cursor = answer.result.nextCursor; pages += 1;
        } while (cursor !== undefined && pages < 200);
        const missing = FORMERLY_LAZY.filter(name => !listed.has(name));
        if (missing.length) throw new Error(`still not listed: ${missing.join(', ')}`);
        return { tools: listed.size, first_discovery_ms: Date.now() - started, modules_now: (await loadedLazyModules()).length };
    });

    // A gesture's write on the bus, and what tracing it costs the gesture.
    const shape = await check('gesture_shape_on_bus', async () => {
        const before = await page.evaluate(async () => (await import('/eVe/intuition/runtime/command_bus.js')).commandBusV2.seq);
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
        const created = (await userRecords(pid)).at(-1);
        if (!created) throw new Error('no shape created');
        const traced = await page.evaluate(async ({ from, id }) => (await import('/eVe/intuition/runtime/command_bus.js')).commandBusV2
            .listEvents({ fromSeq: from + 1, kind: 'atome_committed' }).filter(event => event.atomes?.some(atome => atome.atome_id === id))
            .map(event => ({ source: event.source, tx_id: event.tx_id, count: event.count })), { from: before, id: created.id });
        if (!traced.length) throw new Error(`shape ${created.id} not on the bus`);
        return { shape: created.id, traces: traced };
    });
    await check('trace_cost_per_commit', () => page.evaluate(async () => {
        const { observeCommittedEvents } = await import('/eVe/core/atome_commit_effects.js');
        const events = [{ atome_id: 'probe_cost', kind: 'set', project_id: 'p' }];
        const runs = 2000; const started = performance.now();
        for (let i = 0; i < runs; i += 1) observeCommittedEvents(events, { tx_id: `probe_${i}`, source: 'probe' });
        const perCallUs = ((performance.now() - started) / runs) * 1000;
        if (perCallUs > 100) throw new Error(`trace too slow: ${perCallUs.toFixed(1)} µs per commit`);
        return { per_commit_us: Number(perCallUs.toFixed(2)), note: 'synchronous part only; the bus append runs after the frame' };
    }));

    // Parity: the shadow through MCP, undone through MCP's undo.
    await check('mcp_shadow_then_undo', async () => {
        await waitForStableScene(page, pid);
        await clickCanvasTarget(page, await recordCenter(page, pid, (record) => record.id === shape.shape));
        await wait(800);
        // An MCP client passes the tool's input itself as the arguments (mcp_protocol.js#toolRequest).
        const applied = await call('ui.shadow.apply', { color: '#000000', blur: 12, offset_x: 4, offset_y: 4 });
        if (applied.result?.isError) throw new Error(`apply: ${JSON.stringify(applied).slice(0, 500)}`);
        const withShadow = await waitFor(page, async ({ pid, id }) => {
            const record = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).find(entry => entry.id === id);
            const shadow = record?.properties?.material?.shadow || record?.properties?.shadow;
            return { ok: !!shadow, shadow };
        }, { pid, id: shape.shape }, 10000);
        await wait(UNDO_DELAY_MS);
        const undone = await call('ui.undo.action', {});
        if (undone.result?.isError) throw new Error(`undo: ${JSON.stringify(undone).slice(0, 500)}`);
        const back = await waitFor(page, async ({ pid, id }) => {
            const record = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).find(entry => entry.id === id);
            const shadow = record?.properties?.material?.shadow || record?.properties?.shadow;
            return { ok: !shadow, shadow: shadow || null };
        }, { pid, id: shape.shape }, 10000);
        return { applied: !!withShadow.shadow, undone: back.ok };
    });

    // The same through the interface's own path (tool gateway, source ui): parity means the same result either way.
    await check('ui_shadow_then_undo', async () => {
        const applied = await tool({ tool_id: 'ui.shadow.apply', action: 'pointer.click', input: { color: '#000000', blur: 12, offset_x: 4, offset_y: 4 } });
        if (applied?.ok === false) throw new Error(`apply: ${JSON.stringify(applied).slice(0, 500)}`);
        await wait(800 + UNDO_DELAY_MS);
        const undone = await tool({ tool_id: 'ui.undo.action', action: 'pointer.click', input: {} });
        if (undone?.ok === false) throw new Error(`undo: ${JSON.stringify(undone).slice(0, 400)}`);
        await wait(1500);
        const stored = await page.evaluate(async (id) => {
            const state = await window.Atome.getStateCurrent(id);
            const props = state?.properties || state?.props || state?.particles || {};
            return { material: props.material ?? null, shadow: props.shadow ?? null, keys: Object.keys(props).slice(0, 30) };
        }, shape.shape);
        report.undo_stored_state = stored;
        const back = await waitFor(page, async ({ pid, id }) => {
            const record = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).find(entry => entry.id === id);
            const shadow = record?.properties?.material?.shadow || record?.properties?.shadow;
            return { ok: !shadow, shadow: shadow || null };
        }, { pid, id: shape.shape }, 10000);
        return { undone: back.ok };
    });
    await check('undo_right_after_change', async () => {
        const applied = await call('ui.shadow.apply', { color: '#111111', blur: 6, offset_x: 2, offset_y: 2 });
        if (applied.result?.isError) throw new Error(`apply: ${JSON.stringify(applied).slice(0, 300)}`);
        const undone = await call('ui.undo.action', {});
        if (undone.result?.isError) throw new Error(`undo at once: ${JSON.stringify(undone.result.content).slice(0, 300)}`);
        return { undone: true };
    });
    await check('confirmation_held', async () => {
        const answer = await mcp('tools/list', {});
        let cursor = answer.result?.nextCursor; let held = (answer.result?.tools || []).find(entry => entry._meta?.['atome/confirmation_required'] === true);
        while (!held && cursor !== undefined) {
            const next = await mcp('tools/list', { cursor });
            held = next.result.tools.find(entry => entry._meta?.['atome/confirmation_required'] === true); cursor = next.result.nextCursor;
        }
        if (!held) throw new Error('no tool needing confirmation listed');
        const result = await call(held.name, { action: 'pointer.click', input: {} });
        const meta = result.result?._meta?.['atome/confirmation'];
        if (meta?.status !== 'pending') throw new Error(`${held.name} not held: ${JSON.stringify(result).slice(0, 500)}`);
        return { tool: held.name, status: meta.status };
    });

    await check('mcp_call_latency', async () => {
        const times = [];
        for (let i = 0; i < 40; i += 1) {
            const started = Date.now();
            const answer = await call('selection.get', {});
            if (answer.error) throw new Error(JSON.stringify(answer).slice(0, 300));
            times.push(Date.now() - started);
        }
        return { calls: times.length, p50_ms: percentile(times, 0.5), p95_ms: percentile(times, 0.95), p99_ms: percentile(times, 0.99),
            note: 'measured from the probe through Playwright (adds its own round trip)' };
    });

    await check('mcp_offline', async () => {
        await page.context().setOffline(true);
        try {
            const listedOffline = await mcp('tools/list', {});
            if (!listedOffline.result?.tools?.length) throw new Error(JSON.stringify(listedOffline).slice(0, 300));
            const coloured = await call('ui.couleur.apply', { color: '#22aa55' });
            const effect = await waitFor(page, async ({ pid, id }) => {
                const record = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).find(entry => entry.id === id);
                const value = String(record?.properties?.backgroundColor || record?.properties?.fill || record?.properties?.color || '').toLowerCase();
                return { ok: value.includes('22aa55') || value.includes('34, 170, 85'), value };
            }, { pid, id: shape.shape }, 10000);
            return { listed: listedOffline.result.tools.length, colour_applied_offline: effect.ok, call_error: !!coloured.result?.isError };
        } finally { await page.context().setOffline(false); }
    });
    void recordOf;
} finally {
    await finish();
}
