import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_comm_calendar_probe.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
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

const hasNestedFieldValue = (value = null, field = '', expected = null) => {
    if (!value || typeof value !== 'object') return false;
    if (value[field] === expected) return true;
    if (value.result && typeof value.result === 'object') {
        return hasNestedFieldValue(value.result, field, expected);
    }
    return false;
};

const toResult = (step, payload = {}, extra = {}) => {
    const resolved = unwrapResult(payload?.result || payload || {});
    let ok = payload?.ok === true;
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_surface_key')) {
        ok = hasNestedFieldValue(payload?.result || payload || {}, 'surface_key', extra.expected_surface_key);
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_proxy_tool_id')) {
        ok = hasNestedFieldValue(payload?.result || payload || {}, 'proxy_tool_id', extra.expected_proxy_tool_id);
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
            calendar: [],
            mode: []
        },
        summary: {
            communication: null,
            calendar: null,
            mode: null
        },
        notes: [
            'Current runtime communication/calendar surface is panel/palette level in headless mode.',
            'Business actions such as mail handling or calendar event CRUD remain separate chantier phases.'
        ],
        errors: []
    };

    try {
        const { registerPanelApi, toolRuntimeV2 } = await import('../../eVe/intuition/runtime/index.js');
        registerPanelApi({
            openPanelSurface: async (surfaceKey) => ({
                ok: true,
                active: true,
                opened: true,
                surface_key: String(surfaceKey || '').trim()
            }),
            closePanelSurface: async (surfaceKey) => ({
                ok: true,
                active: false,
                closed: true,
                surface_key: String(surfaceKey || '').trim()
            })
        });
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
            { expected_children: ['ui.calendar.panel'] }
        ));
        report.groups.calendar.push(toResult(
            'calendar_panel',
            await invoke({ tool_id: 'ui.calendar.panel' }),
            { expected_surface_key: 'calendar' }
        ));
        report.groups.mode.push(toResult(
            'mode_palette',
            await invoke({ tool_id: 'tool.main.mode' }),
            { expected_children: ['tool.main.perform', 'ui.mode.edit', 'ui.mode.consume'] }
        ));
        report.groups.mode.push(toResult(
            'mode_edit',
            await invoke({ tool_id: 'ui.mode.edit' })
        ));
        report.groups.mode.push(toResult(
            'mode_consume',
            await invoke({ tool_id: 'ui.mode.consume' })
        ));

        report.summary.communication = summarize(report.groups.communication);
        report.summary.calendar = summarize(report.groups.calendar);
        report.summary.mode = summarize(report.groups.mode);
        report.ok = report.summary.communication.failed === 0
            && report.summary.calendar.failed === 0
            && report.summary.mode.failed === 0;
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
    if (report.ok !== true) {
        throw new Error(`eve_runtime_comm_calendar_probe_failed:${outFile}`);
    }
};

await run();
