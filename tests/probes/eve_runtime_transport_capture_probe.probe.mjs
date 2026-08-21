import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_transport_capture_probe.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: `transport_probe_${Date.now()}`, spec })
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
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_active')) {
        ok = resolved?.active === extra.expected_active;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_playing')) {
        ok = resolved?.playing === extra.expected_playing;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_paused')) {
        ok = resolved?.paused === extra.expected_paused;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_stopped')) {
        ok = resolved?.stopped === extra.expected_stopped;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_operation')) {
        ok = resolved?.operation === extra.expected_operation;
    }
    if (ok && Object.prototype.hasOwnProperty.call(extra, 'expected_index')) {
        ok = resolved?.index === extra.expected_index;
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
            capture: []
        },
        summary: {
            transport: null,
            capture: null
        },
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../../eVe/intuition/runtime/index.js');
        const invoke = async ({ tool_id, action, input = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'runtime_transport_capture_probe' },
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
            'play_toggle_on',
            await invoke({ tool_id: 'ui.play', action: 'pointer.click', input: {} }),
            { expected_active: true, expected_playing: true, expected_paused: false, expected_stopped: false }
        ));
        report.groups.transport.push(toResult(
            'pause',
            await invoke({ tool_id: 'ui.pause', action: 'pointer.click', input: {} }),
            { expected_playing: false, expected_paused: true, expected_stopped: false }
        ));
        report.groups.transport.push(toResult(
            'stop',
            await invoke({ tool_id: 'ui.stop', action: 'pointer.click', input: {} }),
            { expected_playing: false, expected_paused: false, expected_stopped: true }
        ));

        report.groups.capture.push(toResult(
            'capture_audio_toggle',
            await invoke({ tool_id: 'ui.capture.audio', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_video_toggle',
            await invoke({ tool_id: 'ui.capture.video', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_preview_toggle',
            await invoke({ tool_id: 'ui.capture.preview', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_photo_toggle',
            await invoke({ tool_id: 'ui.capture.photo', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_import_toggle',
            await invoke({ tool_id: 'ui.capture.import', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_screen_toggle',
            await invoke({ tool_id: 'ui.capture.screen', action: 'pointer.click', input: {} }),
            { expected_active: true }
        ));
        report.groups.capture.push(toResult(
            'capture_validation',
            await invoke({ tool_id: 'ui.capture.validation', action: 'pointer.click', input: {} }),
            { expected_operation: 'validation' }
        ));

        report.summary.transport = summarize(report.groups.transport);
        report.summary.capture = summarize(report.groups.capture);
        report.ok = report.summary.transport.failed === 0
            && report.summary.capture.failed === 0;
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
