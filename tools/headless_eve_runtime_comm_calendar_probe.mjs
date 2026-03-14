import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../src/application/eVe/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_comm_calendar_probe.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, legacy: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: `comm_calendar_probe_${Date.now()}`, spec })
    }
});

const summarize = (entries = []) => ({
    total: entries.length,
    ok: entries.filter((entry) => entry.ok === true).length,
    failed: entries.filter((entry) => entry.ok !== true).length,
    failures: entries.filter((entry) => entry.ok !== true)
});

const unwrapResult = (value = null) => {
    let current = value;
    while (current && typeof current === 'object' && current.result && typeof current.result === 'object') {
        current = current.result;
    }
    return current && typeof current === 'object' ? current : {};
};

const toResult = (step, payload = {}, extra = {}) => {
    const resolved = unwrapResult(payload?.result || payload || {});
    let ok = payload?.ok === true;
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_surface_key')) {
        ok = resolved?.surface_key === extra.expected_surface_key;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_proxy_tool_id')) {
        ok = resolved?.proxy_tool_id === extra.expected_proxy_tool_id;
    }
    if (ok && Array.isArray(extra.expected_children)) {
        const actualChildren = Array.isArray(resolved?.children) ? resolved.children : [];
        ok = JSON.stringify(actualChildren) === JSON.stringify(extra.expected_children);
    }
    return {
        step,
        ok,
        tool_id: payload?.tool_id || extra.tool_id || null,
        action: payload?.action || extra.action || null,
        result: payload?.result || payload || null,
        error: String(payload?.error || payload?.result?.error || '').trim() || null
    };
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        groups: {
            communication: [],
            calendar: []
        },
        summary: {
            communication: null,
            calendar: null
        },
        notes: [
            'Current runtime communication/calendar surface is panel/palette level in headless mode.',
            'Business actions such as mail handling or calendar event CRUD remain separate chantier phases.'
        ],
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../src/application/eVe/intuition/runtime/index.js');
        const invoke = async ({ tool_id, action = 'pointer.click', input = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'runtime_comm_calendar_probe' },
                presentation: 'ui'
            });
            return {
                tool_id,
                action,
                ok: result?.ok === true,
                result,
                error: result?.error || result?.result?.error || null
            };
        };

        report.groups.communication.push(toResult(
            'communicate_main_tool',
            await invoke({ tool_id: 'tool.main.communicate' }),
            { expected_surface_key: 'communicate', expected_proxy_tool_id: 'ui.comm.panel' }
        ));
        report.groups.communication.push(toResult(
            'comm_panel',
            await invoke({ tool_id: 'ui.comm.panel' }),
            { expected_surface_key: 'communicate' }
        ));
        report.groups.communication.push(toResult(
            'contact_panel',
            await invoke({ tool_id: 'ui.contact.panel' }),
            { expected_surface_key: 'contact' }
        ));

        report.groups.calendar.push(toResult(
            'time_palette',
            await invoke({ tool_id: 'tool.main.time' }),
            { expected_children: ['ui.timeline.panel', 'ui.calendar.panel'] }
        ));
        report.groups.calendar.push(toResult(
            'calendar_panel',
            await invoke({ tool_id: 'ui.calendar.panel' }),
            { expected_surface_key: 'calendar' }
        ));

        report.summary.communication = summarize(report.groups.communication);
        report.summary.calendar = summarize(report.groups.calendar);
        report.ok = report.summary.communication.failed === 0
            && report.summary.calendar.failed === 0;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        summary: report.summary,
        notes: report.notes,
        errors: report.errors
    }, null, 2));
};

await run();
