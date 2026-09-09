import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { drag, reloadProjection, screenshot, structuredDropTarget, switchView, waitForMolecule } from './molecule_ui_drop_core.mjs';
import { structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runProjectDropZonesAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    for (const view of ['list', 'table'].filter((mode) => !process.env.MOLECULE_UI_DROP_VIEW || process.env.MOLECULE_UI_DROP_VIEW === mode)) for (const zone of (process.env.MOLECULE_UI_NESTED_DROP_ONLY === '1' ? ['before'] : ['above', 'below', 'before', 'after', 'simultaneous'])) {
        await check(`${view} real drop zone ${zone} preserves canonical hierarchy`, async () => {
            const project = await ensureProject(page, `Drop ${view} ${zone} ${Date.now()}`);
            const ids = await page.evaluate(async (projectId) => {
                const ids = [];
                for (const [index, duration] of [2, 3, 5].entries()) {
                    const created = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', name: `Atom ${index + 1}`, text: `Atom ${index + 1}`,
                        duration, hierarchy_order: index, left: 150 + index * 260, top: 150, width: 240, height: 140,
                        color: ['#ff8888', '#88ff88', '#8888ff'][index], parentId: projectId, projectId }, { render: false });
                    if (!created.ok) throw new Error(JSON.stringify(created)); ids.push(created.id);
                }
                await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false }); return ids;
            }, project.id);
            await switchView(page, project.id, view);
            const insertion = ['above', 'below'].includes(zone);
            const sourceIndex = zone === 'above' ? 2 : 0;
            const targetIndex = zone === 'above' ? 0 : zone === 'below' ? 2 : 1;
            const sourceId = ids[sourceIndex], targetId = ids[targetIndex];
            const source = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                nodeId: view === 'list' ? `project_view_list_entry_${sourceIndex}_name` : `project_view_matrix_tile_${sourceIndex}` });
            assert(source, 'drop_zone_source_missing');
            const destination = await structuredDropTarget(page, { layout: view === 'table' ? 'matrix' : 'list', sourceId, targetIndex,
                kind: insertion ? 'insert' : 'combine', ...(insertion ? { edge: zone === 'above' ? 'before' : 'after' }
                    : { mode: zone === 'simultaneous' ? 'simultaneous' : 'sequential', placement: zone === 'before' ? 'start' : 'end' }) });
            assert(destination, `drop_zone_target_missing:${view}:${zone}`);
            await drag({ page, source, destination, holdMs: insertion ? 180 : 700,
                armedShot: () => screenshot({ page, report, outDir, name: `${view}_${zone}_armed`, preservePointer: true }) });
            if (insertion) {
                const expected = zone === 'above' ? [ids[2], ids[0], ids[1]] : [ids[1], ids[2], ids[0]];
                let rows;
                for (let attempt = 0; attempt < 30; attempt++) {
                    rows = await structuredRows(page);
                    if (rows.map((entry) => entry.id).join() === expected.join()) break;
                    await wait(100);
                }
                assert(rows.map((entry) => entry.id).join() === expected.join(), 'drop_zone_order:' + JSON.stringify(rows));
            } else {
                const membership = await waitForMolecule(page, { sourceId, targetId });
                const moleculeId = membership.sourceParent || membership.moleculeId;
                assert(moleculeId && moleculeId !== project.id, 'drop_zone_molecule_required');
                const expected = zone === 'before' ? [sourceId, targetId] : [targetId, sourceId];
                await waitFor(page, async ({ moleculeId, expected, mode }) => {
                    const molecule = await window.Atome.getStateCurrent(moleculeId);
                    const children = await Promise.all(expected.map((id) => window.Atome.getStateCurrent(id)));
                    const props = children.map((state) => state.properties);
                    return { ok: molecule.properties.playback_mode === mode && props[0].hierarchy_order < props[1].hierarchy_order,
                        mode: molecule.properties.playback_mode, props };
                }, { moleculeId, expected, mode: zone === 'simultaneous' ? 'simultaneous' : 'sequential' });
                const rows = await structuredRows(page);
                assert(rows.some((row) => row.id === moleculeId) && !rows.some((row) => expected.includes(row.id) && row.depth === 0), 'drop_zone_floating_members');
                if (process.env.MOLECULE_UI_DROP_HISTORY === '1') {
                    await page.keyboard.press('Meta+z');
                    await waitFor(page, async ({ ids, projectId }) => {
                        const states = await Promise.all(ids.map(id => window.Atome.getStateCurrent(id)));
                        const parents = states.map(record => record.parent_id || record.properties?.parent_id || record.meta?.parent_id);
                        return { ok: parents.every(parent => parent === projectId), parents };
                    }, { ids: expected, projectId: project.id });
                    await page.keyboard.press('Meta+Shift+z');
                    const restored = await waitForMolecule(page, { sourceId, targetId });
                    assert((restored.sourceParent || restored.moleculeId) === moleculeId, 'drop_history_changed_owner');
                    report.measurements[view + '_drop_history'] = { undoRestoredParents: true, redoRestoredOwner: true };
                }
                if (view === 'list') {
                    const index = rows.find((row) => row.id === moleculeId).index;
                    const chevron = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: `project_view_list_entry_${index}_hierarchy` });
                    await clickCanvasTarget(page, chevron); await wait(200);
                    assert((await structuredRows(page)).filter((row) => expected.includes(row.id)).length === 2, 'drop_zone_cannot_expand');
                }
            }
            await reloadProjection(page, project.id);
            await screenshot({ page, report, outDir, name: `${view}_${zone}_reloaded` });
            if (zone === 'before' && process.env.MOLECULE_UI_NESTED_DROP_ONLY === '1') {
                const membership = await waitForMolecule(page, { sourceId, targetId });
                const innerId = membership.sourceParent || membership.moleculeId;
                const rows = await structuredRows(page);
                const outside = rows.find(row => row.id === ids[2]);
                const inner = rows.find(row => row.id === innerId);
                assert(outside && inner, 'nested_drop_rows_missing');
                const source = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                    nodeId: view === 'list' ? `project_view_list_entry_${outside.index}_name` : `project_view_matrix_tile_${outside.index}` });
                const destination = await structuredDropTarget(page, { layout: view === 'list' ? 'list' : 'matrix',
                    sourceId: ids[2], targetIndex: inner.index, kind: 'combine', mode: 'simultaneous', placement: 'end' });
                await drag({ page, source, destination, holdMs: 700 });
                const wrapped = await waitForMolecule(page, { sourceId: ids[2], targetId: innerId });
                const outerId = wrapped.sourceParent || wrapped.moleculeId;
                assert(outerId !== innerId, 'nested_drop_overwrote_inner_mode');
                const evidence = await waitFor(page, async ({ innerId, outerId, ids }) => {
                    const [inner, outer, ...children] = await Promise.all([innerId, outerId, ...ids].map(id => window.Atome.getStateCurrent(id)));
                    const parent = record => record.parent_id || record.properties.parent_id || record.meta?.parent_id;
                    return { ok: inner.properties.playback_mode === 'sequential' && outer.properties.playback_mode === 'simultaneous'
                        && parent(inner) === outerId && parent(children[2]) === outerId
                        && children.slice(0, 2).every(record => parent(record) === innerId),
                        modes: [inner.properties.playback_mode, outer.properties.playback_mode], parents: [inner, ...children].map(parent) };
                }, { innerId, outerId, ids });
                report.measurements[`${view}_nested_drop`] = evidence;
                await reloadProjection(page, project.id);
                const outerRow = (await structuredRows(page)).find(row => row.id === outerId);
                await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view',
                    nodeId: view === 'list' ? `project_view_list_entry_${outerRow.index}_name` : `project_view_matrix_tile_${outerRow.index}` }));
                await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_panel_atome_contextual_edit', nodeId: 'atome_contextual_tool_play' }));
                await waitFor(page, async () => {
                    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
                    const state = projectViewTransport.read();
                    return { ok: state.playing && state.durationSeconds === 5 && state.activeLeafIds.length === 2, state };
                });
                await screenshot({ page, report, outDir, name: `${view}_nested_drop_reloaded_playing` });
            }
        });
    }
};
