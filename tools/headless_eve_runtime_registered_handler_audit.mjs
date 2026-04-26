import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../src/application/eVe/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_registered_handler_audit.json');

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: `registered_handler_audit_${Date.now()}`, spec })
    }
});

const chooseAction = (tool = {}) => {
    const actions = Array.isArray(tool?.behavior?.actions)
        ? tool.behavior.actions.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
        : [];
    if (actions.includes('pointer.click')) return 'pointer.click';
    if (actions.includes('open')) return 'open';
    if (actions.includes('state.on')) return 'state.on';
    if (actions.includes('commit')) return 'commit';
    return 'pointer.click';
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        total: 0,
        passed: 0,
        failed: 0,
        failures: [],
        entries: [],
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../src/application/eVe/intuition/runtime/index.js');
        const tools = (await toolRuntimeV2.listTools({ includeDisabled: true }))
            .filter((entry) => String(entry?.runtime?.execution_mode || '').trim().toLowerCase() === 'v2_registered_handler');

        report.total = tools.length;
        for (const tool of tools) {
            const tool_id = String(tool?.id || '').trim();
            const action = chooseAction(tool);
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input: {},
                source: { type: 'headless_probe', layer: 'runtime_registered_handler_audit' },
                presentation: 'ui'
            });
            const entry = {
                tool_id,
                tool_key: String(tool?.tool_key || '').trim() || null,
                action,
                ok: result?.ok === true,
                error: String(result?.error || result?.result?.error || '').trim() || null
            };
            report.entries.push(entry);
            if (entry.ok) report.passed += 1;
            else report.failures.push(entry);
        }
        report.failed = report.failures.length;
        report.ok = report.failed === 0;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        total: report.total,
        passed: report.passed,
        failed: report.failed,
        failures: report.failures,
        errors: report.errors
    }, null, 2));
};

await run();
