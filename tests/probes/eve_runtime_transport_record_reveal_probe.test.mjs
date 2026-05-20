import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../../eve/application/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_transport_record_reveal_probe.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: `transport_record_reveal_probe_${Date.now()}`, spec })
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

const toResult = (step, payload = {}, extra = {}) => {
    const resolved = unwrapResult(payload?.result || payload || {});
    let ok = payload?.ok === true;
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_operation')) {
        ok = resolved?.operation === extra.expected_operation;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_reader')) {
        ok = resolved?.reader === extra.expected_reader;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_active')) {
        ok = resolved?.active === extra.expected_active;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_mode')) {
        ok = resolved?.mode === extra.expected_mode;
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
            transport: [],
            mtrack: [],
            perform: []
        },
        summary: {
            transport: null,
            mtrack: null,
            perform: null
        },
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../../eve/application/intuition/runtime/index.js');
        const invoke = async ({ tool_id, action = 'pointer.click', input = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'runtime_transport_record_reveal_probe' },
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

        report.groups.transport.push(toResult(
            'media_reader_toggle',
            await invoke({ tool_id: 'ui.media.reader' }),
            { expected_reader: 'media', expected_active: true }
        ));
        report.groups.transport.push(toResult(
            'animation_reader_on',
            await invoke({ tool_id: 'ui.animation.reader', action: 'state.on', input: { atome_id: 'group_probe_1' } }),
            { expected_reader: 'animation', expected_active: true }
        ));

        report.groups.mtrack.push(toResult(
            'join',
            await invoke({ tool_id: 'ui.join', input: { clip_ids: ['clip_1', 'clip_2'] } }),
            { expected_operation: 'join' }
        ));
        report.groups.mtrack.push(toResult(
            'automation',
            await invoke({ tool_id: 'ui.automation', input: { clip_id: 'clip_1', open_lanes: true } }),
            { expected_operation: 'automation' }
        ));
        report.groups.mtrack.push(toResult(
            'detail_record_toggle',
            await invoke({ tool_id: 'ui.detail.record.toggle', input: { mode: 'audio', record_source: 'audio' } }),
            { expected_active: true, expected_mode: 'audio' }
        ));

        report.groups.perform.push(toResult(
            'palette_reveal',
            await invoke({ tool_id: 'ui.palette.reveal' }),
            { expected_operation: 'reveal' }
        ));

        report.summary.transport = summarize(report.groups.transport);
        report.summary.mtrack = summarize(report.groups.mtrack);
        report.summary.perform = summarize(report.groups.perform);
        report.ok = report.summary.transport.failed === 0
            && report.summary.mtrack.failed === 0
            && report.summary.perform.failed === 0;
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
