import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../../eve/application/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_creative_probe.json');

const createdSpecs = [];
const textToolState = { active: false };
const vectorToolState = { active: false };
const drawToolState = { active: false, mode: 'brush' };

installMockBrowserEnv({
    eveToolBase: {
        createAtome: async (spec) => {
            createdSpecs.push(spec);
            return { ok: true, id: `creative_probe_${createdSpecs.length}`, spec };
        }
    }
});

window.__eveTextTool = {
    isActive: () => textToolState.active === true,
    activate: () => {
        textToolState.active = true;
        return true;
    },
    deactivate: () => {
        textToolState.active = false;
        return false;
    },
    setActive: (next) => {
        textToolState.active = next === true;
        return textToolState.active;
    }
};

window.__eveVectorTool = {
    isActive: () => vectorToolState.active === true,
    activate: () => {
        vectorToolState.active = true;
        return { active: true, latched: true };
    },
    deactivate: () => {
        vectorToolState.active = false;
        return { active: false, latched: false };
    },
    setActive: (next) => {
        vectorToolState.active = next === true;
        return { active: vectorToolState.active, latched: vectorToolState.active };
    }
};

window.__eveDrawTool = {
    isActive: () => drawToolState.active === true,
    activate: () => {
        drawToolState.active = true;
        return true;
    },
    deactivate: () => {
        drawToolState.active = false;
        return false;
    },
    setActive: (next) => {
        drawToolState.active = next === true;
        return drawToolState.active;
    },
    getMode: () => drawToolState.mode,
    setMode: (nextMode) => {
        const value = String(nextMode || '').trim() || drawToolState.mode;
        drawToolState.mode = value;
        return value;
    }
};

const summarize = (entries = []) => ({
    total: entries.length,
    ok: entries.filter((entry) => entry.ok === true).length,
    failed: entries.filter((entry) => entry.ok !== true).length,
    failures: entries.filter((entry) => entry.ok !== true)
});

const toResult = (step, payload = {}, extra = {}) => ({
    step,
    ok: payload?.ok === true,
    tool_id: payload?.tool_id || extra.tool_id || null,
    action: payload?.action || extra.action || null,
    result: payload?.result || payload || null,
    error: String(payload?.error || payload?.result?.error || extra.error || '').trim() || null
});

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        groups: {
            text: [],
            vector: [],
            draw: []
        },
        summary: {
            text: null,
            vector: null,
            draw: null
        },
        metrics: {
            created_specs: 0,
            last_draw_mode: null,
            draw_active: false,
            vector_active: false,
            text_active: false
        },
        errors: []
    };

    try {
        const { toolRuntimeV2 } = await import('../../eve/application/intuition/runtime/index.js');
        const invoke = async ({ tool_id, action, input = {}, meta = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                meta,
                source: { type: 'headless_probe', layer: 'runtime_creative_probe' },
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

        report.groups.text.push(toResult(
            'circle_create',
            await invoke({
                tool_id: 'ui.circle',
                action: 'pointer.click',
                input: { x: 120, y: 150, radius: 18 }
            })
        ));

        report.groups.text.push(toResult(
            'text_create_latch_on',
            await invoke({
                tool_id: 'ui.text.create',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.text.push(toResult(
            'text_create_click',
            await invoke({
                tool_id: 'ui.text.create',
                action: 'pointer.click',
                input: { x: 240, y: 180, project_id: 'creative_probe_project' }
            })
        ));

        report.groups.text.push(toResult(
            'text_input_latch_on',
            await invoke({
                tool_id: 'ui.text_input',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.text.push(toResult(
            'text_input_click',
            await invoke({
                tool_id: 'ui.text_input',
                action: 'pointer.click',
                input: { x: 320, y: 240, project_id: 'creative_probe_project' }
            })
        ));

        report.groups.text.push(toResult(
            'text_input_latch_off',
            await invoke({
                tool_id: 'ui.text_input',
                action: 'state.off',
                input: {}
            })
        ));

        report.groups.vector.push(toResult(
            'vector_latch_on',
            await invoke({
                tool_id: 'ui.vector.edit',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.vector.push(toResult(
            'vector_latch_off',
            await invoke({
                tool_id: 'ui.vector.edit',
                action: 'state.off',
                input: {}
            })
        ));

        report.groups.draw.push(toResult(
            'draw_edit_latch_on',
            await invoke({
                tool_id: 'ui.draw.edit',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.draw.push(toResult(
            'draw_mode_brush',
            await invoke({
                tool_id: 'ui.draw.mode.brush',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.draw.push(toResult(
            'draw_mode_rect',
            await invoke({
                tool_id: 'ui.draw.mode.rect',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.draw.push(toResult(
            'draw_mode_ellipse',
            await invoke({
                tool_id: 'ui.draw.mode.ellipse',
                action: 'state.on',
                input: {}
            })
        ));

        report.groups.draw.push(toResult(
            'draw_edit_latch_off',
            await invoke({
                tool_id: 'ui.draw.edit',
                action: 'state.off',
                input: {}
            })
        ));

        report.summary.text = summarize(report.groups.text);
        report.summary.vector = summarize(report.groups.vector);
        report.summary.draw = summarize(report.groups.draw);
        report.metrics.created_specs = createdSpecs.length;
        report.metrics.last_draw_mode = drawToolState.mode;
        report.metrics.draw_active = drawToolState.active === true;
        report.metrics.vector_active = vectorToolState.active === true;
        report.metrics.text_active = textToolState.active === true;
        report.ok = report.summary.text.failed === 0
            && report.summary.vector.failed === 0
            && report.summary.draw.failed === 0;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        summary: report.summary,
        metrics: report.metrics,
        errors: report.errors
    }, null, 2));
};

await run();
