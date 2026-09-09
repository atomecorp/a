import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, playwrightPointForClientTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView, stateParentId } from './molecule_ui_drop_core.mjs';
import { structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runProjectCompositionChoiceAcceptance = async ({ page, report, check, ensureProject, outDir, modes = ['list', 'table', 'natural'], nested = false, choices = ['before', 'after', 'front', 'behind', 'overwrite', 'insert'] }) => {
    const project = await ensureProject(page, `Composition acceptance ${Date.now()}`);
    const ids = await page.evaluate(async projectId => {
        const ids = [];
        for (const [index, duration] of [2, 4, 5].entries()) {
            const made = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', name: ['Source 2s', 'Target 4s', 'Other 5s'][index],
                text: ['SOURCE', 'TARGET', 'OTHER'][index], color: ['#ff4050', '#40ff70', '#4070ff'][index],
                left: 150 + index * 380, top: 150, width: 260, height: 130, fontSize: 40,
                projectId, parentId: projectId, hierarchy_order: index, duration }, { render: false });
            ids.push(made.id);
        }
        await window.Atome.commit({ kind: 'set', atome_id: projectId, project_id: projectId, props: { playback_mode: 'simultaneous', loop: false } });
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
        return ids;
    }, project.id);
    if (nested) {
        ids[1] = await page.evaluate(async ({ ids, projectId }) => {
            await window.Atome.commit({ kind: 'set', atome_id: ids[1], project_id: projectId,
                props: { duration_seconds: 2, duration: 2 } });
            const extra = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', name: 'Second child', text: 'SECOND',
                projectId, parentId: projectId, left: 590, top: 190, width: 220, height: 80, color: '#40ffff', duration: 2 }, { render: false });
            const { combineCanonicalMolecule } = await import('/eVe/intuition/tools/core/tool_runtime_molecule_combine.js');
            const result = await combineCanonicalMolecule({ projectId, sourceId: extra.id, targetId: ids[1], choice: 'after' });
            if (!result.ok) throw new Error(result.error);
            await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
            return result.molecule_id;
        }, { ids, projectId: project.id });
    }
    const read = id => page.evaluate(id => window.Atome.getStateCurrent(id), id);
    const history = async (tx, redo = false) => {
        const result = await page.evaluate(async ({ tx, redo }) => {
            const api = await import('/eVe/core/atome_commit.js');
            return redo ? api.redoTransaction(tx) : api.undoTransaction(tx);
        }, { tx, redo });
        assert(result?.ok !== false, `composition_history:${JSON.stringify(result)}`);
        await reloadProjection(page, project.id);
    };
    const boxes = () => page.evaluate(() => {
        const tree = window.eveBevyUiRuntime?.state?.trees?.get('eve_bevy_panel_composition_choices')?.tree;
        return tree?.root.children.map(node => ({ key: node.id.replace('composition_choice_', ''),
            x: node.style.position[0], y: node.style.position[1], size: node.style.size[0] })) || [];
    });
    const begin = async mode => {
        let from, to;
        if (mode === 'natural') {
            from = await recordCenter(page, project.id, record => record.id === ids[0], { sceneCoordinates: true });
            to = await recordCenter(page, project.id, record => record.id === ids[1], { sceneCoordinates: true });
        } else {
            const rows = await structuredRows(page);
            const sourceIndex = rows.find(row => row.id === ids[0]).index;
            const targetIndex = rows.find(row => row.id === ids[1]).index;
            const source = await awaitBevyUiNodeTarget(page, { nodeId: mode === 'list' ? `project_view_list_entry_${sourceIndex}_name` : `project_view_matrix_tile_${sourceIndex}` });
            const target = await awaitBevyUiNodeTarget(page, { nodeId: mode === 'list' ? `project_view_list_entry_${targetIndex}_preview` : `project_view_matrix_tile_${targetIndex}` });
            from = source;
            to = { x: target.hit.box.x + target.hit.box.width * (mode === 'list' ? 0.2 : 0.5), y: target.hit.box.y + target.hit.box.height * 0.5 };
        }
        from = await playwrightPointForClientTarget(page, from);
        to = await playwrightPointForClientTarget(page, to);
        await page.mouse.move(from.x, from.y); await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 14 });
        await waitFor(page, () => ({ ok: Boolean(window.eveBevyUiRuntime?.state?.trees?.get('eve_bevy_panel_composition_choices')) }), null, 5000);
        return boxes();
    };
    for (const mode of modes) {
        await switchView(page, project.id, mode);
        for (const choice of choices) {
            await check(`${mode}${nested ? ' nested' : ''}: held ${choice}, canonical duration/order, undo/redo and reopen`, async () => {
                const before = await read(ids[0]);
                const options = await begin(mode);
                assert(options.length === 6, 'composition_six_choices_missing');
                const option = options.find(option => option.key === choice);
                // Enter the nearest option before traversing the contiguous row.
                const first = options[0];
                await page.mouse.move(first.x + first.size / 2, first.y + first.size / 2, { steps: 4 });
                await page.mouse.move(option.x + option.size / 2, option.y + option.size / 2, { steps: 12 });
                await wait(150);
                if (choice === 'insert') await screenshot({ page, report, outDir, name: `composition_${mode}_palette`, preservePointer: true });
                await page.mouse.up();
                const changed = await waitFor(page, async ({ id, projectId }) => {
                    const s = await window.Atome.getStateCurrent(id);
                    const parent = s?.meta?.parent_id || s?.parent_id;
                    return { ok: Boolean(parent && parent !== projectId), parent };
                }, { id: ids[0], projectId: project.id }, 10000);
                const owner = await read(changed.parent);
                const facts = await page.evaluate(async ({ ownerId, projectId }) => {
                    const { loadProjectViewRecordsForPlayback } = await import('/eVe/domains/rendering/project_view_records.js');
                    const { compileProjectViewTransportPlan } = await import('/eVe/domains/rendering/project_view_transport_plan.js');
                    const loaded = await loadProjectViewRecordsForPlayback({ projectId });
                    const records = loaded.records;
                    const root = records.find(record => String(record.id || record.atome_id) === ownerId);
                    const children = records.filter(record => String(record.parent_id || record.meta?.parent_id || record.properties?.parent_id) === ownerId);
                    const events = await window.Atome.listEvents({ project_id: projectId, atome_id: ownerId, limit: 200 });
                    const event = events.find(event => event.atome_id === ownerId && event.kind !== 'delete');
                    return { children: children.map(record => ({ id: record.id || record.atome_id, props: record.properties })), tx: event?.tx_id,
                        root, plan: compileProjectViewTransportPlan({ rootId: ownerId, records }) };
                }, { ownerId: changed.parent, projectId: project.id });
                assert(facts.tx, 'composition_history_transaction_missing');
                const duration = facts.plan.durationSeconds;
                assert(Math.abs(duration - (choice === 'overwrite' || ['front', 'behind'].includes(choice) ? 4 : 6)) < 0.01,
                    `composition_duration:${choice}:${duration}`);
                assert(stateParentId(await read(ids[2])) === project.id, 'unrelated_track_reparented');
                assert(owner.properties.playback_mode === (['front', 'behind'].includes(choice) ? 'simultaneous' : 'sequential'), 'composition_mode');
                await screenshot({ page, report, outDir, name: `composition_${mode}${nested ? '_nested' : ''}_${choice}_result` });
                await history(facts.tx);
                const undone = await read(ids[0]);
                assert(stateParentId(undone) === project.id, 'composition_undo_parent');
                if (mode === 'natural') assert(parseFloat(undone.properties.left) === parseFloat(before.properties.left), 'natural_drag_undo_position');
                await history(facts.tx, true);
                assert(stateParentId(await read(ids[0])) === changed.parent, 'composition_redo_parent');
                await history(facts.tx);
                return { ownerId: changed.parent, duration, tx: facts.tx, children: facts.children };
            });
        }
        await check(`${mode}${nested ? ' nested' : ''}: leaving the palette and Escape never combine`, async () => {
            const options = await begin(mode);
            await page.mouse.move(options[0].x + 20, options[0].y + 20, { steps: 4 });
            await page.mouse.move(options[0].x + 20, Math.max(0, options[0].y - 50), { steps: 6 });
            await page.keyboard.press('Escape'); await page.mouse.up(); await wait(500);
            assert(stateParentId(await read(ids[0])) === project.id, 'cancel_created_composition');
            assert((await boxes()).length === 0, 'cancel_retained_popup');
            return { cancelled: true };
        });
    }
    return { projectId: project.id, ids };
};
