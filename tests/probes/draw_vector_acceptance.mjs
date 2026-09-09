import { assert, awaitBevyUiNodeTarget, findBevyUiNodeTarget, clickCanvasTarget, recordCenter, visibleMenuTool, waitFor } from './molecule_ui_acceptance_support.mjs';
import { screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runDrawVectorAcceptance = async ({ page, project, report, outDir, check, railTool, textId }) => {
        await check('Draw captures a canonical SVG stroke through the real pointer', async () => {
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'draw_create'));
            await waitFor(page, async () => {
                const { getAtomeContextualEditApi } = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
                return { ok: window.__eveDrawTool?.isActive?.() === true,
                    drawInstalled: Boolean(window.__eveDrawTool), vectorActive: window.__eveVectorTool?.isActive?.(),
                    context: getAtomeContextualEditApi()?.readState() };
            });
            if (await page.evaluate(() => window.__eveDrawTool.getBrushType() !== 'round')) {
                await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'draw_type'));
            }
            await page.mouse.move(650, 350);
            await page.mouse.down();
            await page.mouse.move(720, 400, { steps: 10 });
            await page.mouse.move(800, 350, { steps: 10 });
            await page.mouse.move(900, 450, { steps: 10 });
            await screenshot({ page, report, outDir, name: 'draw_during_gesture', preservePointer: true });
            await page.mouse.up();
            const state = await waitFor(page, async (pid) => {
                const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
                const scene = getProjectSceneState(pid);
                const records = (scene?.records || []).filter((record) => record.properties?.svg_markup?.includes('<path'));
                return { ok: records.some((record) => (record.properties.svg_markup.match(/ Q /g) || []).length >= 8), records,
                    atoms: records.map((record) => scene?.scene?.byId?.get(record.id)) };
            }, project.id);
            await screenshot({ page, report, outDir, name: 'draw_completed' });
            return state;
        });
        await check('brush settings keep drawing active and the palette close stops it', async () => {
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'draw_type'));
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.getBrushType?.() === 'flat' && window.__eveDrawTool?.isActive?.() === true }));
            const size = await visibleMenuTool(page, project.id, 'draw_size');
            await page.mouse.move(size.x, size.y);
            await page.mouse.down();
            await page.mouse.move(size.x, size.y - 12, { steps: 8 });
            await page.mouse.up();
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.getBrushSize?.() > 14 && window.__eveDrawTool?.isActive?.() === true }));
            const opacity = await railTool(page, 'draw_opacity');
            await page.mouse.move(opacity.x, opacity.y);
            await page.mouse.down();
            await page.mouse.move(opacity.x, opacity.y + 18, { steps: 8 });
            await page.mouse.up();
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.getOpacity?.() < 1 && window.__eveDrawTool?.isActive?.() === true }));
            await page.mouse.move(350, 520); await page.mouse.down();
            await page.mouse.move(480, 610, { steps: 18 }); await page.mouse.up();
            await waitFor(page, async (pid) => {
                const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
                const rows = getProjectSceneState(pid)?.records || [];
                return { ok: rows.some((row) => row.properties?.svg_markup?.includes('stroke-linecap="butt"')
                    && /stroke-opacity="0\./.test(row.properties.svg_markup)) };
            }, project.id);
            await screenshot({ page, report, outDir, name: 'draw_flat_translucent' });
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'create'));
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.isActive?.() === false }));
        });
        if (process.env.MOLECULE_UI_VECTOR_EDIT === '1') await check('double clicking a drawn path exposes shared vector handles', async () => {
            const target = await recordCenter(page, project.id, (record) => record.properties?.svg_markup?.includes('stroke-linecap="butt"'), { sceneCoordinates: true });
            await clickCanvasTarget(page, target, { double: true });
            await screenshot({ page, report, outDir, name: 'vector_edition' });
            await waitFor(page, () => {
                const pending = [window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_panel_atome_contextual_edit')?.tree.root];
                const handles = [];
                while (pending.length) {
                    const node = pending.pop();
                    if (node?.id?.startsWith('atome_vector_point_')) handles.push(node.id);
                    pending.push(...(node?.children || []));
                }
                return { ok: handles.length > 2, handles };
            });
            const before = await page.evaluate(async () => {
                const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
                const id = getCurrentSelectionIds().at(-1);
                const record = await window.Atome.getStateCurrent(id);
                return { id, markup: record?.properties?.svg_markup };
            });
            const handle = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_panel_atome_contextual_edit', nodePrefix: 'atome_vector_point_', step: 2 });
            await page.mouse.move(handle.x, handle.y); await page.mouse.down();
            await page.mouse.move(handle.x + 22, handle.y - 20, { steps: 8 }); await page.mouse.up();
            await waitFor(page, async ({ id, markup }) => {
                const record = await window.Atome.getStateCurrent(id);
                return { ok: Boolean(record?.properties?.svg_markup) && record.properties.svg_markup !== markup };
            }, before);
            await screenshot({ page, report, outDir, name: 'vector_point_moved' });
            const controlIds = await page.evaluate(() => {
                const pending = [window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_panel_atome_contextual_edit')?.tree.root];
                const ids = [];
                while (pending.length) {
                    const node = pending.pop();
                    if (node?.id?.startsWith('atome_vector_point_') && node.accessibility?.label?.startsWith('control ')) ids.push(node.id);
                    pending.push(...(node?.children || []));
                }
                return ids;
            });
            let control;
            for (const nodeId of controlIds) {
                control = await findBevyUiNodeTarget(page, { treeId: 'eve_bevy_panel_atome_contextual_edit', nodeId });
                if (control) break;
            }
            assert(control, 'visible_vector_curve_control_required');
            const priorCurve = await page.evaluate(async (id) => (await window.Atome.getStateCurrent(id)).properties.svg_markup, before.id);
            await page.mouse.move(control.x, control.y); await page.mouse.down();
            await page.mouse.move(control.x + 30, control.y - 24, { steps: 8 }); await page.mouse.up();
            await waitFor(page, async ({ id, previous }) => ({ ok: (await window.Atome.getStateCurrent(id)).properties.svg_markup !== previous }), { id: before.id, previous: priorCurve });
            await screenshot({ page, report, outDir, name: 'vector_curve_control_moved' });
            if (process.env.MOLECULE_UI_VECTOR_HISTORY === '1') {
                const editedCurve = await page.evaluate(async (id) => (await window.Atome.getStateCurrent(id)).properties.svg_markup, before.id);
                await page.keyboard.press('Meta+z');
                await waitFor(page, async ({ id, expected }) => {
                    const actual = (await window.Atome.getStateCurrent(id)).properties.svg_markup;
                    return { ok: actual === expected, operation: 'undo' };
                }, { id: before.id, expected: priorCurve });
                await page.keyboard.press('Meta+Shift+z');
                await waitFor(page, async ({ id, expected }) => {
                    const actual = (await window.Atome.getStateCurrent(id)).properties.svg_markup;
                    return { ok: actual === expected, operation: 'redo' };
                }, { id: before.id, expected: editedCurve });
                report.vectorHistory = { undoExact: true, redoExact: true };
            }
            if (process.env.MOLECULE_UI_VECTOR_STRUCTURED === '1') for (const mode of ['table', 'list']) {
                await switchView(page, project.id, mode);
                const row = (await structuredRows(page)).find((entry) => entry.id === before.id);
                assert(row, 'structured_vector_row_missing:' + mode);
                await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                    nodeId: mode === 'table' ? 'project_view_matrix_tile_' + row.index : 'project_view_list_entry_' + row.index }));
                const preview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview' });
                await clickCanvasTarget(page, preview, { double: true });
                const point = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_panel_atome_contextual_edit', nodePrefix: 'atome_vector_point_' + before.id + '_' });
                assert(point.y < preview.hit.box.y + preview.hit.box.height, 'vector_handle_outside_visual:' + mode);
                const previous = await page.evaluate(async (id) => (await window.Atome.getStateCurrent(id)).properties.svg_markup, before.id);
                await page.mouse.move(point.x, point.y); await page.mouse.down();
                await page.mouse.move(point.x + 12, point.y + 12, { steps: 6 }); await page.mouse.up();
                await waitFor(page, async ({ id, previous }) => ({ ok: (await window.Atome.getStateCurrent(id)).properties.svg_markup !== previous }), { id: before.id, previous });
                const leakedFrames = await page.evaluate(() => {
                    const pending = [window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_panel_atome_contextual_edit')?.tree.root];
                    const frames = [];
                    while (pending.length) { const node = pending.pop(); if (node?.id?.startsWith('atome_contextual_edit_') && node.id.endsWith('_outline')) frames.push(node.id); pending.push(...(node?.children || [])); }
                    return frames;
                });
                assert(leakedFrames.length === 0, 'natural_frames_leaked:' + leakedFrames.join(','));
                await screenshot({ page, report, outDir, name: mode + '_vector_point_moved' });
            }
            if (process.env.MOLECULE_UI_STYLE_COLOR === '1') {
                const opacity = await railTool(page, 'draw_opacity');
                await page.mouse.move(opacity.x, opacity.y); await page.mouse.down();
                await page.mouse.move(opacity.x, opacity.y + 18, { steps: 8 }); await page.mouse.up();
                report.measurements.selected_vector_opacity = await waitFor(page, async (id) => {
                    const value = (await window.Atome.getStateCurrent(id)).properties.opacity;
                    return { ok: value > 0 && value < 1, value };
                }, before.id);
                await clickCanvasTarget(page, await railTool(page, 'couleur'));
                await page.getByTitle('#f44336', { exact: true }).click();
                await waitFor(page, async (id) => {
                    const record = await window.Atome.getStateCurrent(id);
                    const color = window.eveCouleurApi.getCurrentRgba();
                    const svg = new DOMParser().parseFromString(record.properties.svg_markup, 'image/svg+xml');
                    return { ok: [...svg.querySelectorAll('path')].every((path) => path.getAttribute('stroke') === color && path.getAttribute('fill') === 'none'), color };
                }, before.id);
                await clickCanvasTarget(page, await railTool(page, 'couleur'));
                await screenshot({ page, report, outDir, name: 'selected_vector_color' });
            }
        });

    if (process.env.MOLECULE_UI_DRAW_STRUCTURED === '1') for (const mode of ['list', 'table']) {
        await check(mode + ' viewer captures a real new brush stroke', async () => {
            await switchView(page, project.id, mode);
            const row = (await structuredRows(page)).find((entry) => entry.id === textId);
            await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                nodeId: mode === 'table' ? 'project_view_matrix_tile_' + row.index : 'project_view_list_entry_' + row.index + '_name' }));
            const preview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview' });
            assert(preview, 'draw_visual_required:' + mode);
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'create'));
            const before = await page.evaluate((id) => window.eveToolBase.getProjectSceneState(id).records.map((record) => record.id), project.id);
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'draw_create'));
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.isActive?.() === true }));
            const draft = await page.evaluate(() => window.eveProjectViewCreationApi.getStructuredDraft());
            const empty = await page.evaluate(async (id) => (await window.Atome.getStateCurrent(id)).properties, draft.atomeId);
            assert(empty.color === '#ffffff00' && !empty.svg_markup, 'empty_draw_draft_is_visible_shape');
            const drawingPreview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview' });
            const box = drawingPreview.hit.box;
            const x = box.x + box.width / 2 - 60; const y = box.y + box.height / 2;
            await page.mouse.move(x, y); await page.mouse.down();
            await page.mouse.move(x + 60, y - 30, { steps: 10 });
            await page.mouse.move(x + 140, y + 25, { steps: 10 });
            await waitFor(page, async (id) => {
                const { projectViewVisualPanel } = await import('/eVe/domains/rendering/project_view_visual_panel.js');
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const props = projectViewVisualPanel.subjectRecord()?.properties || {};
                const content = readProjectViewSurfaceState().content;
                return { ok: projectViewVisualPanel.subjectId() === id && (props.svg_markup?.match(/ Q /g) || []).length >= 8 && props.color === '#ffffff',
                    subjectId: projectViewVisualPanel.subjectId(), svg: props.svg_markup, count: content.recordCount };
            }, draft.atomeId);
            await screenshot({ page, report, outDir, name: mode + '_draw_live', preservePointer: true });
            await page.mouse.up();
            const result = await waitFor(page, ({ id, before }) => {
                const records = window.eveToolBase.getProjectSceneState(id).records;
                const created = records.find((record) => !before.includes(record.id) && record.properties?.svg_markup?.includes('<path'));
                return { ok: !!created && (created.properties.svg_markup.match(/ Q /g) || []).length >= 8, created };
            }, { id: project.id, before });
            report.measurements[mode + '_new_draw'] = result.created;
            await screenshot({ page, report, outDir, name: mode + '_draw_complete' });
            await clickCanvasTarget(page, await visibleMenuTool(page, project.id, 'create'));
            await waitFor(page, () => ({ ok: window.__eveDrawTool?.isActive?.() === false }));
        });
    }
};
