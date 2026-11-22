import { chooseMoleculePlaybackMode } from './molecule_ui_drop_playback_support.mjs';
import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';

export const runProjectRecursivePlaybackAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Recursive 2 3 5 ${Date.now()}`);
    const ids = await page.evaluate(async (projectId) => {
        const ids = [];
        for (const [index, duration] of [2, 3, 5].entries()) {
            const result = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', text: `${duration} seconds`,
                name: `${duration} seconds`, duration, hierarchy_order: index, left: 150 + index * 300, top: 150,
                width: 250, height: 150, color: ['#ff5555', '#55ff55', '#5555ff'][index], parentId: projectId, projectId
            }, { render: false });
            if (!result.ok) throw new Error(JSON.stringify(result)); ids.push(result.id);
        }
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
        return ids;
    }, project.id);
    const target = async (nodeId, treeId = 'eve_bevy_panel_atome_contextual_edit') => {
        const result = await awaitBevyUiNodeTarget(page, { nodeId, treeId });
        assert(result, `recursive_target_missing:${nodeId}`); return result;
    };
    // A touch on the level's row plays the level, a second one stops it (R-273, user 22 Nov. 2026).
    const container = async () => clickCanvasTarget(page, await target('project_view_footer', 'eve_bevy_ui_project_view'));
    const read = () => page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read());
    // A play mode is chosen in the List view alone (R-250, user 21 Nov. 2026), on the level's rail, nothing selected.
    const mode = async (view, value) => {
        await switchView(page, project.id, 'list');
        await chooseMoleculePlaybackMode(page, project.id, value);
        await waitFor(page, async ({ id, value }) => ({ ok: (await window.Atome.getStateCurrent(id)).properties.playback_mode === value }), { id: project.id, value });
        const icon = await page.evaluate(() => {
            const root = window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_panel_atome_contextual_edit')?.tree.root;
            const pending = [root];
            while (pending.length) { const node = pending.pop(); if (node?.id === 'atome_contextual_tool_container_play_mode_icon') return node; pending.push(...(node?.children || [])); }
            return null;
        });
        report.measurements['mode_' + value] = icon;
        await switchView(page, project.id, view);
    };
    for (const view of ['list', 'table']) {
        await check(`${view}: 2/3/5 seconds sum to 10 in sequential playback`, async () => {
            await mode(view, 'sequential'); await container();
            await waitFor(page, async ({ pid, ids }) => {
                const state = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
                return { ok: state.playing && state.rootId === pid && state.durationSeconds === 10 && state.activeLeafIds.join() === ids[0], state };
            }, { pid: project.id, ids });
            await wait(2150);
            assert((await read()).activeLeafIds.join() === ids[1], 'sequential_second_leaf_required');
            await screenshot({ page, report, outDir, name: view + '_sequential_second' });
            await container();
        });
        await check(`${view}: simultaneous duration is 5 and every child starts together`, async () => {
            await mode(view, 'simultaneous'); await container();
            const state = await waitFor(page, async (ids) => {
                const state = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
                return { ok: state.playing && state.durationSeconds === 5 && ids.every((id) => state.activeLeafIds.includes(id)), state };
            }, ids);
            const positions = ids.map((id) => state.state.localPositionsById[id]);
            assert(Math.max(...positions) - Math.min(...positions) < 0.01, 'simultaneous_child_start_drift');
            await screenshot({ page, report, outDir, name: view + '_simultaneous_all' });
            await container();
        });
    }
    await check('nested Molecules preserve internal modes and durations after canonical reload', async () => {
        const nested = await page.evaluate(async ({ projectId, ids }) => {
            const { combineInto } = await import('/eVe/domains/rendering/project_view_reorder_runtime.js');
            const inner = await combineInto({ projectId, sourceId: ids[1], targetId: ids[0], mode: 'sequential' });
            if (!inner.ok) throw new Error(JSON.stringify(inner));
            const outer = await combineInto({ projectId, sourceId: ids[2], targetId: inner.molecule_id, mode: 'simultaneous' });
            if (!outer.ok) throw new Error(JSON.stringify(outer));
            return { inner: inner.molecule_id, outer: outer.molecule_id };
        }, { projectId: project.id, ids });
        await reloadProjection(page, project.id); await switchView(page, project.id, 'list');
        await container();
        const initial = await waitFor(page, async ({ nested, ids }) => {
            const state = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
            return { ok: state.playing && state.durationSeconds === 5 && state.localDurationsById[nested.inner] === 5
                && state.localDurationsById[nested.outer] === 5 && state.activeLeafIds.includes(ids[0]) && state.activeLeafIds.includes(ids[2])
                && !state.activeLeafIds.includes(ids[1]), state };
        }, { nested, ids });
        await wait(2150);
        const after = await read();
        assert(after.activeLeafIds.includes(ids[1]) && after.activeLeafIds.includes(ids[2]) && !after.activeLeafIds.includes(ids[0]), 'nested_internal_sequence_lost');
        report.measurements.nested = { nested, initial, after };
        await screenshot({ page, report, outDir, name: 'nested_sequential_inside_simultaneous' });
        await container();
    });
};
