import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../../eve/application/tests/strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_selection_transform_probe.json');

const selectionState = new Set();
const commitBatchCalls = [];
const commitCalls = [];

const { window } = installMockBrowserEnv();

window.SelectionAPI = {
    select: (id, options = {}) => {
        const value = String(id || '').trim();
        if (!value) return null;
        const add = options.add === true;
        const toggle = options.toggle === true;
        if (!add && !toggle) selectionState.clear();
        if (toggle) {
            if (selectionState.has(value)) selectionState.delete(value);
            else selectionState.add(value);
        } else {
            selectionState.add(value);
        }
        window.__selectedAtomeIds = Array.from(selectionState);
        window.__selectedAtomeId = window.__selectedAtomeIds.at(-1) || null;
        return value;
    },
    clear: () => {
        selectionState.clear();
        window.__selectedAtomeIds = [];
        window.__selectedAtomeId = null;
        return true;
    },
    selected: () => Array.from(selectionState)
};

const originalCommit = window.Atome.commit;
window.Atome.commit = async (event = {}, options = {}) => {
    commitCalls.push({
        kind: String(event?.kind || '').trim() || null,
        atome_id: String(event?.atome_id || '').trim() || null,
        props: event?.props && typeof event.props === 'object' ? { ...event.props } : {},
        options: options && typeof options === 'object' ? { ...options } : {}
    });
    return originalCommit(event, options);
};

const originalCommitBatch = window.Atome.commitBatch;
window.Atome.commitBatch = async (events = [], options = {}) => {
    const list = Array.isArray(events) ? events : [];
    commitBatchCalls.push({
        events: list.map((entry) => ({
            kind: String(entry?.kind || '').trim() || null,
            atome_id: String(entry?.atome_id || '').trim() || null,
            props: entry?.props && typeof entry.props === 'object' ? { ...entry.props } : {}
        })),
        options: options && typeof options === 'object' ? { ...options } : {}
    });
    return originalCommitBatch(events, options);
};

const summarize = (entries = []) => ({
    total: entries.length,
    ok: entries.filter((entry) => entry.ok === true).length,
    failed: entries.filter((entry) => entry.ok !== true).length,
    failures: entries.filter((entry) => entry.ok !== true)
});

const toResult = (step, payload = {}, extra = {}) => {
    const expectedError = String(extra.expected_error || '').trim() || null;
    const actualError = String(payload?.error || payload?.result?.error || extra.error || '').trim() || null;
    const resolved = payload?.result?.result || payload?.result || payload || {};
    const expectedTargetId = String(extra.expected_target_id || '').trim() || null;
    const expectedSelectedCount = Number.isFinite(Number(extra.expected_selected_count))
        ? Number(extra.expected_selected_count)
        : null;
    const expectedSelectedIds = Array.isArray(extra.expected_selected_ids)
        ? extra.expected_selected_ids.map((entry) => String(entry))
        : null;
    let ok = expectedError
        ? actualError === expectedError
        : payload?.ok === true;
    if (ok && expectedTargetId) {
        ok = String(resolved?.target_id || '').trim() === expectedTargetId;
    }
    if (ok && expectedSelectedCount !== null) {
        ok = Number(resolved?.selected_count || 0) === expectedSelectedCount;
    }
    if (ok && expectedSelectedIds) {
        const actualSelectedIds = Array.isArray(resolved?.selected_ids)
            ? resolved.selected_ids.map((entry) => String(entry))
            : [];
        ok = JSON.stringify(actualSelectedIds) === JSON.stringify(expectedSelectedIds);
    }
    return {
        step,
        ok,
        tool_id: payload?.tool_id || extra.tool_id || null,
        action: payload?.action || extra.action || null,
        result: payload?.result || payload || null,
        error: actualError
    };
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        groups: {
            selection: [],
            transform: []
        },
        summary: {
            selection: null,
            transform: null
        },
        metrics: {
            commit_calls: 0,
            commit_batch_calls: 0,
            selected_ids: []
        },
        errors: []
    };

    try {
        const { toolRuntimeV2, commandBusV2 } = await import('../../eve/application/intuition/runtime/index.js');
        commandBusV2.clear();

        const invoke = async ({ tool_id, action, input = {}, meta = {} }) => {
            const result = await toolRuntimeV2.invokeById({
                tool_id,
                action,
                input,
                meta,
                source: { type: 'headless_probe', layer: 'runtime_selection_transform_probe' },
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

        report.groups.selection.push(toResult(
            'select_direct_target',
            await invoke({
                tool_id: 'ui.select',
                action: 'pointer.click',
                input: { atome_id: 'probe_sel_1' }
            }),
            {
                expected_target_id: 'probe_sel_1',
                expected_selected_ids: ['probe_sel_1'],
                expected_selected_count: 1
            }
        ));

        report.groups.selection.push(toResult(
            'select_id_secondary',
            await invoke({
                tool_id: 'ui.select',
                action: 'select',
                input: { id: 'probe_sel_2' }
            }),
            {
                expected_target_id: 'probe_sel_2',
                expected_selected_ids: ['probe_sel_2'],
                expected_selected_count: 1
            }
        ));

        report.groups.selection.push(toResult(
            'multi_select',
            await invoke({
                tool_id: 'ui.multi_select',
                action: 'multi_select',
                input: { selection_ids: ['probe_sel_2', 'probe_sel_3'] }
            }),
            {
                expected_selected_ids: ['probe_sel_2', 'probe_sel_3'],
                expected_selected_count: 2
            }
        ));

        report.groups.selection.push(toResult(
            'lasso_replace',
            await invoke({
                tool_id: 'ui.lasso_select',
                action: 'lasso.select',
                input: {
                    selection_ids: ['probe_lasso_1', 'probe_lasso_2'],
                    selection_intent: 'replace'
                }
            }),
            {
                expected_selected_ids: ['probe_lasso_1', 'probe_lasso_2'],
                expected_selected_count: 2
            }
        ));

        report.groups.selection.push(toResult(
            'clear_selection',
            await invoke({
                tool_id: 'ui.clear_selection',
                action: 'clear_selection',
                input: {}
            }),
            {
                expected_selected_ids: [],
                expected_selected_count: 0
            }
        ));

        report.groups.selection.push(toResult(
            'reject_tool_target',
            await invoke({
                tool_id: 'ui.select',
                action: 'pointer.click',
                input: { target_id: 'tool.main.home' }
            }),
            { expected_error: 'selection_target_disallowed' }
        ));

        await invoke({
            tool_id: 'ui.move',
            action: 'drag.start',
            input: { atome_id: 'move_probe_1', left: 10, top: 14 },
            meta: { tx_id: 'move_probe_tx' }
        });
        await invoke({
            tool_id: 'ui.move',
            action: 'drag.frame',
            input: { atome_id: 'move_probe_1', left: 32, top: 41 },
            meta: { tx_id: 'move_probe_tx' }
        });
        report.groups.transform.push(toResult(
            'move_commit',
            await invoke({
                tool_id: 'ui.move',
                action: 'drag.end',
                input: { atome_id: 'move_probe_1', left: 56, top: 72 },
                meta: { tx_id: 'move_probe_tx' }
            })
        ));

        const gestureProbe = async ({ step, tool_id, prefix, items }) => {
            const txId = `${prefix}_tx`;
            await invoke({
                tool_id,
                action: `${prefix}.start`,
                input: { items: [{ atome_id: items.atome_id, props: items.start }] },
                meta: { tx_id: txId, gesture_id: `${prefix}_gesture` }
            });
            await invoke({
                tool_id,
                action: `${prefix}.frame`,
                input: { items: [{ atome_id: items.atome_id, props: items.frame }] },
                meta: { tx_id: txId, gesture_id: `${prefix}_gesture` }
            });
            report.groups.transform.push(toResult(
                step,
                await invoke({
                    tool_id,
                    action: `${prefix}.end`,
                    input: { items: [{ atome_id: items.atome_id, props: items.end }] },
                    meta: { tx_id: txId, gesture_id: `${prefix}_gesture` }
                })
            ));
        };

        await gestureProbe({
            step: 'drag_commit',
            tool_id: 'ui.drag',
            prefix: 'drag',
            items: {
                atome_id: 'drag_probe_1',
                start: { left: '10px', top: '20px' },
                frame: { left: '44px', top: '58px' },
                end: { left: '71px', top: '83px' }
            }
        });

        await gestureProbe({
            step: 'resize_commit',
            tool_id: 'ui.resize',
            prefix: 'resize',
            items: {
                atome_id: 'resize_probe_1',
                start: { width: '120px', height: '80px' },
                frame: { width: '150px', height: '96px' },
                end: { width: '170px', height: '112px' }
            }
        });

        await gestureProbe({
            step: 'scale_commit',
            tool_id: 'ui.scale',
            prefix: 'scale',
            items: {
                atome_id: 'scale_probe_1',
                start: { scale: 1 },
                frame: { scale: 1.2 },
                end: { scale: 1.4 }
            }
        });

        await gestureProbe({
            step: 'rotate_commit',
            tool_id: 'ui.rotate',
            prefix: 'rotate',
            items: {
                atome_id: 'rotate_probe_1',
                start: { rotate: 0 },
                frame: { rotate: 22 },
                end: { rotate: 45 }
            }
        });

        report.summary.selection = summarize(report.groups.selection);
        report.summary.transform = summarize(report.groups.transform);
        report.metrics.commit_calls = commitCalls.length;
        report.metrics.commit_batch_calls = commitBatchCalls.length;
        report.metrics.selected_ids = Array.from(selectionState);
        report.ok = report.summary.selection.failed === 0 && report.summary.transform.failed === 0;
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
