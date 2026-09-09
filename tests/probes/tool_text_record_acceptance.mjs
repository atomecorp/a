import { runDrawVectorAcceptance } from './draw_vector_acceptance.mjs';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import {
    assert, awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, visibleMenuTool, waitFor, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { expandCanonicalListMolecule, selectListRow, structuredRows } from './molecule_ui_drop_playback_support.mjs';

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

const countPixels = (file, box, matches) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    let count = 0;
    for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(png.height, box.y + box.height); y++) {
        for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(png.width, box.x + box.width); x++) {
            const i = (y * png.width + x) * 4;
            if (matches(png.data[i], png.data[i + 1], png.data[i + 2])) count++;
        }
    }
    return count;
};
const redPixels = (file, target) => countPixels(file, { x: target.x - 24, y: target.y - 24, width: 48, height: 48 },
    (r, g, b) => r > 180 && g < 90 && b < 90);

export const runToolTextRecordAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Text tools ${Date.now()}`);
    assert(project.ok, 'text_tools_project_missing');
    const textId = await page.evaluate(async (pid) => {
        const created = await window.eveToolBase.createAtome({
            type: 'text', kind: 'text', name: 'Text tools source', text: 'Before editing',
            duration: 120, left: 240, top: 180, width: 320, height: 180, color: '#ffffff', projectId: pid, parentId: pid
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
    await check('Natural single selection opens tools without entering text edition', async () => {
        const target = await recordCenter(page, project.id, (record) => record.id === textId, { sceneCoordinates: true });
        await clickCanvasTarget(page, target);
        await waitFor(page, async (id) => {
            const { getAtomeContextualEditApi } = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
            const rail = getAtomeContextualEditApi()?.readState();
            return { ok: rail?.activeAtomeId === id && rail?.contextLevel === 'selection' && rail?.menuVisible === true, rail };
        }, textId);
        await waitForStableScene(page, project.id);
        await screenshot({ page, report, outDir, name: 'natural_selection_context' });
    });
    await check('Natural double click enters the shared text editor', editSource);
    await check('collapsing a visible text range clears its formatting target', async () => {
        await page.keyboard.press('Meta+A');
        await waitFor(page, async () => {
            const { readRecentProjectTextStyleSelection } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
            return { ok: !!readRecentProjectTextStyleSelection() };
        });
        await screenshot({ page, report, outDir, name: 'natural_text_selected' });
        await page.keyboard.press('ArrowRight');
        await waitFor(page, async () => {
            const { readRecentProjectTextStyleSelection } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
            return { ok: readRecentProjectTextStyleSelection() === null };
        });
        const geometry = await page.evaluate(async (id) => {
            const { findProjectSceneByAtomeId } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const record = findProjectSceneByAtomeId(id)?.records.find((entry) => entry.id === id);
            return { width: parseFloat(record?.properties?.width), height: parseFloat(record?.properties?.height) };
        }, textId);
        assert(geometry.width === 320 && geometry.height === 180, 'text_selection_resized_source');
        await screenshot({ page, report, outDir, name: 'natural_text_collapsed' });
    });
    if (process.env.MOLECULE_UI_STRUCTURED_SELECTION_ONLY === '1') {
        const secondId = await page.evaluate(async (pid) => {
            const created = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', name: 'Second selection',
                text: 'Second layer', duration: 120, left: 420, top: 350, width: 240, height: 100, color: '#ffffff', projectId: pid, parentId: pid });
            await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
            return created.id;
        }, project.id);
        for (const mode of ['table', 'list']) await check(`${mode} selection accumulates layers and text remains editable in Visual`, async () => {
            await switchView(page, project.id, mode);
            const target = async (childIndex) => {
                const id = [textId, secondId][childIndex];
                const index = (await structuredRows(page)).find(row => row.id === id)?.index;
                assert(Number.isInteger(index), `selection_row_missing:${id}`);
                return awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                    nodeId: mode === 'table' ? `project_view_matrix_tile_${index}` : `project_view_list_entry_${index}`, step: 2 });
            };
            await screenshot({ page, report, outDir, name: `${mode}_before_selection` });
            const firstTarget = await target(0);
            await clickCanvasTarget(page, firstTarget);
            await page.keyboard.down('Meta');
            await clickCanvasTarget(page, await target(1));
            await page.keyboard.up('Meta');
            await screenshot({ page, report, outDir, name: `${mode}_after_cumulative_click` });
            await waitFor(page, async (ids) => {
                const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                const selected = getCurrentSelectionIds();
                return { ok: ids.every((id) => selected.includes(id)), selected };
            }, [textId, secondId]);
            await screenshot({ page, report, outDir, name: `${mode}_multiple_selected` });
            if (process.env.MOLECULE_UI_MULTI_PLAY === '1') {
                await clickCanvasTarget(page, await railTool(page, 'play'));
                await waitFor(page, async ({ ids, pid }) => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                    const state = projectViewTransport.read();
                    return { ok: state.playing && state.rootId === pid && ids.every((id) => state.selectionIds?.includes(id))
                        && getCurrentSelectionIds().length === 2, state };
                }, { ids: [textId, secondId], pid: project.id });
                report.measurements[`${mode}_multi_play`] = await waitFor(page, async () => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    const current = projectViewTransport.read();
                    const expected = current.activeLeafRecords.map((record) => String(record.properties?.text || record.properties?.content || '')).sort();
                    const texts = [];
                    const visit = (node) => { if (!node) return; if (node.kind === 'text' && String(node.id).startsWith('project_view_visual_preview')) texts.push(node.text); (node.children || []).forEach(visit); };
                    visit(window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root);
                    return { ok: texts.length > 0 && JSON.stringify(texts.sort()) === JSON.stringify(expected), current, texts, expected };
                });
                await screenshot({ page, report, outDir, name: `${mode}_multiple_playing` });
                await page.keyboard.down('Meta');
                await clickCanvasTarget(page, await target(1));
                await page.keyboard.up('Meta');
                await waitFor(page, async (id) => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                    const current = projectViewTransport.read();
                    return { ok: current.playing && current.selectionIds?.length === 1 && current.selectionIds[0] === id
                        && getCurrentSelectionIds().length === 1 && getCurrentSelectionIds()[0] === id, current };
                }, textId);
                await clickCanvasTarget(page, await railTool(page, 'play'));
            }

            await clickCanvasTarget(page, await target(0));
            await waitFor(page, async () => {
                const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                return { ok: getCurrentSelectionIds().length === 1 };
            });
            const preview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview', step: 2 });
            await clickCanvasTarget(page, preview, { double: true });
            await waitFor(page, async () => {
                const { getActiveProjectTextEdit } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
                const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                const edit = getActiveProjectTextEdit();
                return { ok: document.activeElement?.tagName === 'TEXTAREA' && edit?.atomeId === getCurrentSelectionIds()[0], edit };
            });
            await page.keyboard.press('Meta+A');
            await waitFor(page, async () => {
                const { readRecentProjectTextStyleSelection } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
                const range = readRecentProjectTextStyleSelection();
                return { ok: Number(range?.selection?.end) > Number(range?.selection?.start), range };
            });
            report.measurements[`${mode}_text_projection`] = await page.evaluate(async () => {
                const { getActiveProjectTextEdit } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
                const edit = getActiveProjectTextEdit();
                const source = window.eveToolBase.getProjectSceneState(edit.projectId)?.records.find((record) => record.id === edit.atomeId);
                const texts = [];
                const walk = (node) => { if (node?.kind === 'text') texts.push({ id: node.id, text: node.text, richText: node.style?.rich_text }); (node?.children || []).forEach(walk); };
                walk(window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root);
                return { edit, richText: source?.properties?.rich_text, texts };
            });
            await waitFor(page, () => {
                const pending = [window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root];
                let range = null;
                while (pending.length) {
                    const node = pending.pop();
                    if (node?.id?.startsWith('project_view_visual_preview_member_') && node.id.endsWith('_visual_text')) range = node.style?.rich_text;
                    pending.push(...(node?.children || []));
                }
                return { ok: range?.editing === true && range.selection?.end > range.selection?.start, range };
            });
            const selectedCapture = await screenshot({ page, report, outDir, name: `${mode}_visual_text_selected` });
            const blue = countPixels(selectedCapture.file, preview.hit.box, (r, g, b) => b > r + 50 && g > r + 15);
            assert(blue > 100, `visual_text_selection_not_blue:${mode}:${blue}`);
            const stableGeometry = () => page.evaluate(({ ids, projectId }) => {
                const surface = document.getElementById('eve_surface_project');
                const nodes = {};
                const walk = (node) => {
                    if (!node) return;
                    if (['project_view_footer_band', 'project_view_separator', 'project_view_visual_preview'].includes(node.id)
                        || /^project_view_list_entry_\d+$/.test(node.id) || /^project_view_matrix_tile_\d+$/.test(node.id)) {
                        nodes[node.id] = { position: node.style?.position, size: node.style?.size };
                    }
                    (node.children || []).forEach(walk);
                };
                walk(window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root);
                const records = window.eveToolBase.getProjectSceneState(projectId)?.records || [];
                return { canvas: surface.getBoundingClientRect().toJSON(), backing: [surface.width, surface.height], nodes,
                    menu: window.eveBevyUiRuntime.state.trees.get('eve_bevy_ui_main_menu')?.tree?.motionLayout?.items,
                    records: records.filter((record) => ids.includes(record.id)).map((record) => ({ id: record.id,
                        left: record.properties.left, top: record.properties.top, width: record.properties.width, height: record.properties.height })) };
            }, { ids: [textId, secondId], projectId: project.id });
            const resourceSnapshot = () => page.evaluate(() => ({
                canvases: document.querySelectorAll('canvas').length,
                textRoots: document.querySelectorAll('#eve_hidden_text_service').length,
                editors: document.querySelectorAll('#eve_hidden_text_service textarea').length,
                domAtoms: document.querySelectorAll('[id^="eve-atome_"]').length,
                contextualTrees: [...window.eveBevyUiRuntime.state.sourceTrees.keys()]
                    .filter(id => id === 'eve_bevy_panel_atome_contextual_edit').length
            }));
            const resourcesBefore = await resourceSnapshot();
            const geometryBefore = await stableGeometry();
            for (let repetition = 0; repetition < 8; repetition++) {
                await page.keyboard.press('ArrowRight');
                await clickCanvasTarget(page, preview, { double: true });
                await page.keyboard.press('Meta+A');
                const geometryAfter = await stableGeometry();
                assert(JSON.stringify(geometryAfter) === JSON.stringify(geometryBefore), `text_edit_global_geometry_changed:${mode}:${repetition}`);
            }
            const resourcesAfter = await resourceSnapshot();
            assert(JSON.stringify(resourcesAfter) === JSON.stringify(resourcesBefore)
                && resourcesAfter.textRoots === 1 && resourcesAfter.editors <= 1 && resourcesAfter.domAtoms === 0,
                'text_edit_resource_growth:' + JSON.stringify({ mode, resourcesBefore, resourcesAfter }));
            report.measurements[mode + '_edit_resources'] = { before: resourcesBefore, after: resourcesAfter };
            report.measurements[mode + '_stable_edit_geometry'] = geometryBefore;
            await screenshot({ page, report, outDir, name: mode + '_repeated_edit_stable' });
            await page.keyboard.press('ArrowRight');
            if (process.env.MOLECULE_UI_RANGE_COLOR === '1') {
                await page.keyboard.down('Shift');
                for (let index = 0; index < 7; index++) await page.keyboard.press('ArrowLeft');
                await page.keyboard.up('Shift');
                const range = await waitFor(page, async () => {
                    const { readRecentProjectTextStyleSelection } = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
                    const target = readRecentProjectTextStyleSelection();
                    return { ok: target?.selection?.end - target?.selection?.start === 7, target };
                });
                await screenshot({ page, report, outDir, name: mode + '_partial_text_selected' });
                await clickCanvasTarget(page, await railTool(page, 'couleur'));
                await page.getByTitle(mode === 'table' ? '#f44336' : '#4caf50', { exact: true }).click();
                const styled = await waitFor(page, async ({ id, selected }) => {
                    const { findProjectSceneByAtomeId } = await import('/eVe/domains/rendering/project_scene_runtime.js');
                    const props = findProjectSceneByAtomeId(id).records.find((record) => record.id === id).properties;
                    const color = window.eveCouleurApi.getCurrentRgba();
                    const spans = props.rich_text?.spans || [];
                    return { ok: spans.some((span) => span.start === selected.start && span.end === selected.end && span.color === color), props, color };
                }, { id: textId, selected: range.target.selection });
                assert(styled.props.color === '#ffffff', 'partial_color_changed_whole_text');
                report.measurements[mode + '_partial_color'] = styled;
                await clickCanvasTarget(page, await railTool(page, 'couleur'));
                await clickCanvasTarget(page, preview, { double: true });
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('Meta+Enter');
                await waitFor(page, async ({ id, color, selected }) => {
                    const props = (await window.Atome.getStateCurrent(id)).properties;
                    return { ok: props.rich_text?.spans?.some((span) => span.start === selected.start && span.end === selected.end && span.color === color), props };
                }, { id: textId, color: styled.color, selected: range.target.selection });
                await screenshot({ page, report, outDir, name: mode + '_partial_text_color' });
            }
            if (process.env.MOLECULE_UI_TRANSPORT_SELECTION === '1') {
                const footer = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_footer', step: 2 });
                await clickCanvasTarget(page, footer);
                await clickCanvasTarget(page, await railTool(page, 'container_play'));
                await waitFor(page, async () => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    return { ok: projectViewTransport.read().playing === true };
                });
                await clickCanvasTarget(page, await target(1));
                await waitFor(page, async () => {
                    const [{ projectViewTransport }, { projectViewPlayback }, selection] = await Promise.all([
                        import('/eVe/domains/rendering/project_view_transport_runtime.js'),
                        import('/eVe/domains/rendering/project_view_playback_runtime.js'),
                        import('/eVe/intuition/runtime/selection.js')
                    ]);
                    const selected = selection.getCurrentSelectionIds();
                    const playback = projectViewTransport.read();
                    return { ok: !projectViewPlayback.readState().playing && playback.playing && selected.length === 1
                        && playback.activeLeafIds.length === 1 && playback.activeLeafIds[0] === selected[0], selected, playback };
                });
                await screenshot({ page, report, outDir, name: mode + '_container_retarget' });
                await clickCanvasTarget(page, await railTool(page, 'play'));
                await waitFor(page, async () => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    return { ok: !projectViewTransport.read().playing };
                });
            }
        });
        return;
    }
    await check('Create opens vertically while the main tool positions stay fixed', async () => {
        const positions = () => page.evaluate(() => window.eveBevyUiRuntime.state.trees
            .get('eve_bevy_ui_main_menu')?.tree?.motionLayout?.items || []);
        const before = await positions();
        await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'create'));
        await waitFor(page, async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const menu = getMainMenuRuntime()?.measure();
            return { ok: menu?.activePaletteKey === 'create' && menu?.paletteMotionActive === false };
        });
        const after = await positions();
        before.filter((item) => !item.parentKey).forEach((item) => {
            const current = after.find((entry) => entry.id === item.id);
            if (current) assert.deepEqual(current.position, item.position, `palette_shifted:${item.id}`);
        });
        await screenshot({ page, report, outDir, name: 'create_perpendicular_palette' });
    });
    if (process.env.MOLECULE_UI_DRAW_ONLY === '1') return runDrawVectorAcceptance({ page, project, report, outDir, check, railTool, textId });
    if (process.env.MOLECULE_UI_SELECTION_ONLY === '1') return;
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
