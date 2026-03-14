import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../src/application/eVe/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_calendar_crud_probe.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, legacy: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: `calendar_crud_probe_${Date.now()}`, spec })
    }
});

const unwrapResult = (value = null) => {
    let current = value;
    while (current && typeof current === 'object' && current.result && typeof current.result === 'object') {
        current = current.result;
    }
    return current && typeof current === 'object' ? current : {};
};

const summarize = (entries = []) => ({
    total: entries.length,
    ok: entries.filter((entry) => entry.ok === true).length,
    failed: entries.filter((entry) => entry.ok !== true).length,
    failures: entries.filter((entry) => entry.ok !== true)
});

const toResult = (step, payload = {}, validator = null) => {
    const resolved = unwrapResult(payload?.result || payload || {});
    const ok = payload?.ok === true && (typeof validator === 'function' ? validator(resolved) : true);
    return {
        step,
        ok,
        tool_id: payload?.tool_id || null,
        action: payload?.action || null,
        result: payload?.result || payload || null,
        error: String(payload?.error || payload?.result?.error || '').trim() || null
    };
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        groups: {
            calendar_api: []
        },
        summary: {
            calendar_api: null
        },
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../src/application/eVe/intuition/runtime/index.js');
        const invoke = async ({ tool_id, action = 'pointer.click', input = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'runtime_calendar_crud_probe' },
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

        const ensured = await invoke({ tool_id: 'calendar.ensure_calendar', input: { calendarId: 'calendar_probe' } });
        report.groups.calendar_api.push(toResult(
            'ensure_calendar',
            ensured,
            (resolved) => resolved?.calendar?.id === 'calendar_probe'
        ));

        const created = await invoke({
            tool_id: 'calendar.create_event',
            input: {
                calendarId: 'calendar_probe',
                title: 'Calendar probe event',
                start: '2026-03-12T09:00:00.000Z',
                end: '2026-03-12T10:00:00.000Z'
            }
        });
        const createdEventId = unwrapResult(created?.result)?.event?.id || null;
        report.groups.calendar_api.push(toResult(
            'create_event',
            created,
            (resolved) => !!resolved?.event?.id
        ));

        report.groups.calendar_api.push(toResult(
            'list_events',
            await invoke({ tool_id: 'calendar.list_events' }),
            (resolved) => Array.isArray(resolved?.items) && resolved.items.length === 1
        ));

        report.groups.calendar_api.push(toResult(
            'get_event',
            await invoke({ tool_id: 'calendar.get_event', input: { eventId: createdEventId } }),
            (resolved) => resolved?.event?.id === createdEventId
        ));

        report.groups.calendar_api.push(toResult(
            'update_event',
            await invoke({ tool_id: 'calendar.update_event', input: { eventId: createdEventId, title: 'Calendar probe event updated' } }),
            (resolved) => resolved?.event?.title === 'Calendar probe event updated'
        ));

        report.groups.calendar_api.push(toResult(
            'delete_event',
            await invoke({ tool_id: 'calendar.delete_event', input: { eventId: createdEventId } }),
            () => true
        ));

        report.summary.calendar_api = summarize(report.groups.calendar_api);
        report.ok = report.summary.calendar_api.failed === 0;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        summary: report.summary,
        errors: report.errors
    }, null, 2));
};

await run();
