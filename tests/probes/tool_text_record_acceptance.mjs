import fs from 'node:fs';
import { PNG } from 'pngjs';
import {
    assert, awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, visibleMenuTool, waitFor, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { expandCanonicalListMolecule, selectListRow } from './molecule_ui_drop_playback_support.mjs';

const railTool = async (page, key) => {
    for (let attempt = 0; attempt < 12; attempt++) {
        const target = await awaitBevyUiNodeTarget(page, {
            treeId: 'eve_bevy_panel_atome_contextual_edit', nodeId: `atome_contextual_tool_${key}`, step: 2
        }, { timeoutMs: 700, intervalMs: 100 }).catch(() => null);
        if (target) return target;
        const rect = await page.evaluate(async () => {
            const { getAtomeContextualEditApi } = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
            return getAtomeContextualEditApi()?.readState?.()?.railLayout;
        });
        assert(rect, 'contextual_rail_missing');
        await page.mouse.move(rect.x + rect.itemSize / 2, rect.y + rect.railHeight / 2);
        await page.mouse.wheel(0, attempt < 6 ? 180 : -180);
    }
    throw new Error(`contextual_tool_missing:${key}`);
};

const recordState = (page, active) => waitFor(page, async (expected) => {
    const { readRecordActionState } = await import('/eVe/intuition/tools/core/record_action_state.js');
    const state = readRecordActionState();
    return { ok: state.active === expected, state };
}, active);

const redPixels = (file, target) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    let count = 0;
    for (let y = Math.max(0, Math.floor(target.y - 24)); y < Math.min(png.height, target.y + 24); y++) {
        for (let x = Math.max(0, Math.floor(target.x - 24)); x < Math.min(png.width, target.x + 24); x++) {
            const i = (y * png.width + x) * 4;
            if (png.data[i] > 180 && png.data[i + 1] < 90 && png.data[i + 2] < 90) count++;
        }
    }
    return count;
};

export const runToolTextRecordAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Text tools ${Date.now()}`);
    assert(project.ok, 'text_tools_project_missing');
    const textId = await page.evaluate(async (pid) => {
        const created = await window.eveToolBase.createAtome({
            type: 'text', kind: 'text', name: 'Text tools source', text: 'Before editing',
            left: 240, top: 180, width: 320, height: 180, color: '#ffffff', projectId: pid, parentId: pid
        }, { render: false });
        await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
        return created.id;
    }, project.id);
    await waitForStableScene(page, project.id);
    const editSource = async () => {
        const target = await recordCenter(page, project.id, (record) => record.id === textId, { sceneCoordinates: true });
        await clickCanvasTarget(page, target, { double: true });
        await waitFor(page, () => ({ ok: document.activeElement?.tagName === 'TEXTAREA' }));
    };
    await check('Natural double click enters the shared text editor', editSource);
    await check('MIDI Binding opens for the contextual target through the real tool', async () => {
        await clickCanvasTarget(page, await railTool(page, 'midi_binding'));
        await waitFor(page, async (id) => {
            const { isBevyPanelSurfaceOpen } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
            const { midiBindingSurface } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_midi_binding_runtime.js');
            return { ok: isBevyPanelSurfaceOpen('midi_binding') && midiBindingSurface.readState().targetId === id };
        }, textId);
        await screenshot({ page, report, outDir, name: 'midi_binding_open' });
        const closeId = await page.evaluate(() => {
            const trees = window.eveBevyUiRuntime.readOverlayDiagnostics().trees;
            return trees.flatMap((tree) => (tree.interactiveNodes || []).map((node) => ({ tree: tree.id, node: node.id || node })))
                .find(({ tree, node }) => tree.includes('midi_binding') && String(node).includes('close'));
        });
        assert(closeId, 'midi_close_missing');
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: closeId.tree, nodeId: closeId.node }));
        await clickCanvasTarget(page, await railTool(page, 'midi_binding'));
        await waitFor(page, async (id) => {
            const { isBevyPanelSurfaceOpen } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
            const { midiBindingSurface } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_midi_binding_runtime.js');
            return { ok: isBevyPanelSurfaceOpen('midi_binding') && midiBindingSurface.readState().targetId === id };
        }, textId);
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: closeId.tree, nodeId: closeId.node }));
    });
    let split;
    await check('Line Splitter commits the latest edit and creates one ordered cell per line', async () => {
        await editSource();
        await page.keyboard.press('Meta+A');
        await page.keyboard.insertText('Alpha\n\nBeta');
        await clickCanvasTarget(page, await railTool(page, 'line_splitter'));
        split = await waitFor(page, async ({ pid, source }) => {
            const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const current = await window.Atome.getStateCurrent(source);
            const parent = current?.parent_id || current?.meta?.parent_id || current?.properties?.parent_id;
            const records = getProjectSceneState(pid)?.records || [];
            const children = records.filter((r) => (r.parent_id || r.meta?.parent_id || r.properties?.parent_id) === parent && parent !== pid)
                .sort((a, b) => Number(a.properties.hierarchy_order) - Number(b.properties.hierarchy_order));
            return { ok: children.length === 3 && children.map((r) => r.properties.text).join('|') === 'Alpha||Beta',
                moleculeId: parent, childIds: children.map((r) => r.id || r.atome_id),
                records: records.map((r) => ({ id: r.id, parent: r.parent_id || r.meta?.parent_id, text: r.properties?.text })),
                failures: (window.__eveToolFailures || []).slice(-3).map(({ tool_id, error }) => ({ tool_id, error })) };
        }, { pid: project.id, source: textId });
        await screenshot({ page, report, outDir, name: 'line_splitter_result' });
    });
    if (split?.childIds) {
        await check('Line Splitter canonical transaction can be undone, redone and reloaded', async () => {
            const result = await page.evaluate(async ({ pid, moleculeId, source }) => {
                const { undoTransaction, redoTransaction } = await import('/eVe/core/atome_commit.js');
                const tx = `line_splitter_${moleculeId}`;
                const undone = await undoTransaction(tx, { project_id: pid });
                const original = await window.Atome.getStateCurrent(source);
                const redone = await redoTransaction(tx, { project_id: pid });
                const restored = await window.Atome.getStateCurrent(source);
                return { undone: undone.ok, redone: redone.ok, original: original?.properties?.text,
                    restored: restored?.properties?.text, parent: restored?.meta?.parent_id || restored?.parent_id };
            }, { pid: project.id, moleculeId: split.moleculeId, source: textId });
            assert(result.undone && result.original === 'Alpha\n\nBeta' && result.redone
                && result.restored === 'Alpha' && result.parent === split.moleculeId, `split_history:${JSON.stringify(result)}`);
            await reloadProjection(page, project.id);
        });
        await switchView(page, project.id, 'list');
        await expandCanonicalListMolecule(page, split.childIds);
        await selectListRow(page, split.childIds[0]);
        await check('Record Action icon changes white red white and survives cell selection', async () => {
            const tool = await railTool(page, 'record_action');
            const white = await screenshot({ page, report, outDir, name: 'record_action_white' });
            await clickCanvasTarget(page, tool);
            await recordState(page, true);
            const red = await screenshot({ page, report, outDir, name: 'record_action_red' });
            assert(redPixels(red.file, tool) > redPixels(white.file, tool) + 10, 'record_icon_not_red');
            await selectListRow(page, split.childIds[1]);
            await recordState(page, true);
            await selectListRow(page, split.childIds[2]);
            const stop = await railTool(page, 'record_action');
            await clickCanvasTarget(page, stop);
            await recordState(page, false);
            const stopped = await screenshot({ page, report, outDir, name: 'record_action_stopped' });
            assert(redPixels(stopped.file, stop) < 10, 'record_icon_stays_red');
        });
    }
    await check('Create Text in List focuses immediately and Visual reopens the same text editor', async () => {
        await switchView(page, project.id, 'list');
        await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'create'));
        await waitFor(page, async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            return { ok: getMainMenuRuntime().measure().activePaletteKey === 'create' };
        });
        await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'text_create'));
        await waitFor(page, () => ({ ok: document.activeElement?.tagName === 'TEXTAREA' }));
        await page.keyboard.insertText('Created from List');
        await page.keyboard.press('Tab');
        await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'text_create'));
        const preview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview' });
        await clickCanvasTarget(page, preview, { double: true });
        await waitFor(page, () => ({ ok: document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'Created from List' }));
        await page.keyboard.insertText(' edited');
        await screenshot({ page, report, outDir, name: 'visual_text_editing' });
        await page.keyboard.press('Tab');
    });
    report.tool_text_record = { projectId: project.id, sourceId: textId, split };
};
