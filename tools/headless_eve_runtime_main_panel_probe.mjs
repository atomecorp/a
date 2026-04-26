import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../src/application/eVe/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_main_panel_probe.json');

const TOOL_IDS = {
    main_tools: [
        'tool.main.find',
        'tool.main.home',
        'tool.main.info',
        'tool.main.draw',
        'tool.main.vector',
        'tool.main.capture',
        'tool.main.communicate',
        'tool.main.mtrack',
        'tool.main.perform',
        'tool.main.matrix'
    ],
    panel_tools: [
        'ui.find.panel',
        'ui.home.panel',
        'ui.info.panel',
        'ui.ai.panel',
        'ui.comm.panel',
        'ui.mtrack.panel',
        'ui.timeline.panel',
        'ui.calendar.panel'
    ]
};

const probeTool = async (runtime, tool_id) => {
    try {
        const result = await runtime.invokeById({
            tool_id,
            action: 'pointer.click',
            input: {},
            source: { type: 'headless_probe', layer: 'runtime_main_panel_probe' },
            presentation: 'ui'
        });
        return {
            tool_id,
            ok: result?.ok === true,
            tool_key: String(result?.tool_key || '').trim() || null,
            error: String(result?.error || result?.result?.error || '').trim() || null
        };
    } catch (error) {
        return {
            tool_id,
            ok: false,
            tool_key: null,
            error: String(error?.message || error)
        };
    }
};

const summarize = (entries = []) => ({
    total: entries.length,
    ok: entries.filter((entry) => entry.ok === true).length,
    failed: entries.filter((entry) => entry.ok !== true).length,
    failures: entries.filter((entry) => entry.ok !== true)
});

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        groups: {
            main_tools: [],
            panel_tools: []
        },
        summary: {
            main_tools: null,
            panel_tools: null
        },
        errors: []
    };

    try {
        installMockBrowserEnv({
            runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
            eveToolBase: {
                createAtome: async (spec) => ({ ok: true, id: `atome_probe_${Date.now()}`, spec })
            }
        });

        const { toolRuntimeV2 } = await import('../src/application/eVe/intuition/runtime/index.js');

        for (const tool_id of TOOL_IDS.main_tools) {
            report.groups.main_tools.push(await probeTool(toolRuntimeV2, tool_id));
        }
        for (const tool_id of TOOL_IDS.panel_tools) {
            report.groups.panel_tools.push(await probeTool(toolRuntimeV2, tool_id));
        }

        report.summary.main_tools = summarize(report.groups.main_tools);
        report.summary.panel_tools = summarize(report.groups.panel_tools);
        report.ok = true;
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
