import { assert, awaitBevyUiNodeTarget, findBevyUiNodeTarget, clickCanvasTarget, playwrightPointForClientTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';

export const runProjectViewLayoutAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Structured layout ${Date.now()}`);
    await page.evaluate(async (projectId) => {
        for (let index = 0; index < 20; index++) await window.eveToolBase.createAtome({
            type: 'text', kind: 'text', text: `Track ${index + 1}`, name: `Track ${index + 1}`,
            left: 200, top: 160, width: 300, height: 150, duration: [2, 3, 5][index % 3], hierarchy_order: index,
            color: '#ffffff', projectId, parentId: projectId
        }, { render: false });
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
    }, project.id);
    await switchView(page, project.id, 'list');
    const target = async (nodeId) => {
        const found = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId });
        assert(found, `layout_target_missing:${nodeId}`); return found;
    };
    const geometry = () => page.evaluate(async () => {
        const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
        const { readMainMenuReservedHeight } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const root = window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root;
        const nodes = {};
        const walk = (node) => { if (!node) return; nodes[node.id] = node.style; (node.children || []).forEach(walk); };
        walk(root);
        const rows = Object.keys(nodes).filter((id) => /^project_view_list_entry_\d+$/.test(id));
        return { nodes, rows, state: readProjectViewSurfaceState(), toolSize: readMainMenuReservedHeight(document.getElementById('eve_surface_project')),
            canvas: document.getElementById('eve_surface_project').getBoundingClientRect().toJSON() };
    });
    const dragSeparator = async (deltaY) => {
        const point = await playwrightPointForClientTarget(page, await target('project_view_separator'));
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x, point.y + deltaY, { steps: 12 }); await page.mouse.up(); await wait(500);
    };
    let split;
    await check('project and row timelines align and rows match tool height', async () => {
        const view = await geometry(); report.layoutInitial = view;
        assert(view.rows.length > 0, 'layout_rows_required');
        const rowId = view.rows[0];
        assert(view.nodes[rowId].size[1] === view.toolSize, 'row_tool_height_mismatch');
        assert(view.nodes.project_view_footer_band.size[1] === view.toolSize, 'footer_tool_height_mismatch');
        assert(view.nodes[`${rowId}_preview`].position[0] === view.nodes.project_view_footer_transport.position[0], 'timeline_start_misaligned');
        assert(view.nodes[`${rowId}_preview`].size[0] === view.nodes.project_view_footer_transport.size[0], 'timeline_end_misaligned');
        assert(view.nodes[`${rowId}_playhead`].size[1] === view.toolSize, 'row_playhead_not_full_height');
        assert(view.nodes.project_view_footer_playhead.size[1] === view.toolSize, 'footer_playhead_not_full_height');
        await screenshot({ page, report, outDir, name: 'structured_rows_aligned' });
    });
    await check('separator resizes viewer without resizing the canvas and persists List ratio', async () => {
        const before = await geometry();
        await dragSeparator(170);
        const stored = await waitFor(page, async (id) => {
            const record = await window.Atome.getStateCurrent(id);
            return { ok: record.properties.project_view_split?.list > 0.4, ratio: record.properties.project_view_split?.list };
        }, project.id);
        split = stored.ratio;
        const after = await geometry(); report.layoutResized = after;
        assert(after.nodes.project_view_separator.position[1] > before.nodes.project_view_separator.position[1] + 120, 'separator_did_not_resize');
        assert(JSON.stringify(after.canvas) === JSON.stringify(before.canvas), 'separator_resized_canvas');
        await screenshot({ page, report, outDir, name: 'structured_separator_resized' });
    });
    await check('project accordion hides every track and restores the chosen split', async () => {
        await clickCanvasTarget(page, await target('project_view_footer_accordion'));
        await waitFor(page, async () => ({ ok: (await import('/eVe/domains/rendering/project_view_surface_runtime.js')).readProjectViewSurfaceState().tracksCollapsed }));
        const folded = await geometry(); report.layoutFolded = folded;
        assert(folded.rows.length === 0 && !folded.nodes.project_view_separator, 'accordion_left_tracks_visible');
        await screenshot({ page, report, outDir, name: 'structured_project_folded' });
        await clickCanvasTarget(page, await target('project_view_footer_accordion')); await wait(300);
        const restored = await geometry();
        assert(restored.rows.length > 0 && Math.abs(restored.state.presentationRatio - split) < 0.001, 'accordion_lost_split');
    });
    await check('List and Matrix keep separate persisted splits across projection reload', async () => {
        await switchView(page, project.id, 'table');
        const matrix = await geometry();
        assert(Math.abs(matrix.state.presentationRatio - 1 / 3) < 0.001, 'matrix_inherited_list_split');
        await dragSeparator(90);
        await switchView(page, project.id, 'list');
        await reloadProjection(page, project.id);
        const restored = await geometry();
        assert(Math.abs(restored.state.presentationRatio - split) < 0.001, 'list_split_not_restored');
        await screenshot({ page, report, outDir, name: 'structured_split_reloaded' });
    });
    await check('local scrub isolates its row, shows empty ranges and restores context', async () => {
        const view = await geometry();
        let rowId; let cursor;
        for (const id of view.rows) {
            cursor = await findBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: id + '_playhead' });
            if (cursor) { rowId = id; break; }
        }
        assert(cursor, 'visible_track_cursor_required');
        const atomeId = view.state.content.entries[Number(rowId.match(/entry_(\d+)/)[1])].id;
        const canonicalIndex = view.state.content.entries.find(entry => entry.id === atomeId).visualRecord.properties.hierarchy_order;
        const durations = Array.from({ length: 20 }, (_, index) => [2, 3, 5][index % 3]);
        const timing = { start: durations.slice(0, canonicalIndex).reduce((sum, duration) => sum + duration, 0),
            duration: durations[canonicalIndex], total: durations.reduce((sum, duration) => sum + duration, 0) };
        const preview = await target(rowId + '_preview');
        const point = await playwrightPointForClientTarget(page, cursor);
        const read = () => page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read());
        const prior = await read();
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await waitFor(page, async () => ({ ok: (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read().status === 'scrubbing' }));
        const middleX = preview.hit.box.x + (timing.start + timing.duration / 2) / timing.total * preview.hit.box.width;
        await page.mouse.move(middleX, point.y, { steps: 12 });
        await waitFor(page, async (id) => {
            const transport = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
            return { ok: transport.rootId === id && transport.isolatedId === id && transport.progress > 0.45 && transport.progress < 0.55
                && transport.activeLeafIds.join() === id, transport };
        }, atomeId);
        await screenshot({ page, report, outDir, name: 'structured_local_scrub', preservePointer: true });
        await page.mouse.move(preview.hit.box.x + (timing.start > 0 ? 0 : 0.95) * preview.hit.box.width + 2, point.y, { steps: 12 });
        await waitFor(page, async () => ({ ok: (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read().activeLeafIds.length === 0 }));
        const emptyGeometry = await geometry();
        const emptyRatio = timing.start > 0 ? 0 : 0.95;
        const expectedCursor = Math.max(0, emptyRatio * emptyGeometry.nodes[rowId + '_preview'].size[0] - 6);
        assert(Math.abs(emptyGeometry.nodes[rowId + '_playhead'].position[0] - expectedCursor) < 5,
            'empty_range_cursor_clamped_to_clip');
        await screenshot({ page, report, outDir, name: 'structured_local_scrub_empty', preservePointer: true });
        await page.mouse.up();
        await waitFor(page, async (prior) => {
            const transport = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
            return { ok: !transport.isolatedId && transport.rootId === prior.rootId && transport.status === prior.status, transport };
        }, prior);
        assert(await findBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: rowId }), 'scrub_hid_visible_track');
        report.layoutLocalScrub = { prior, after: await read(), timing };
    });
    await check('project cursor scrubs the complete container rather than the selected track', async () => {
        const view = await geometry();
        const footerTarget = await target('project_view_footer_transport');
        const point = await playwrightPointForClientTarget(page, footerTarget);
        const width = view.nodes.project_view_footer_transport.size[0];
        report.layoutGlobalTarget = { footerTarget, point, width };
        await page.mouse.move(point.x - width * 0.25, point.y); await page.mouse.down();
        await waitFor(page, async (id) => {
            const state = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
            return { ok: state.rootId === id && state.status === 'scrubbing', state };
        }, project.id);
        await page.mouse.move(point.x + width * 0.25, point.y, { steps: 12 }); await page.mouse.up(); await wait(500);
        const transport = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read());
        report.layoutGlobalScrub = transport;
        assert(transport.rootId === project.id && transport.progress > 0.7 && transport.progress < 0.8 && transport.status === 'paused', `global_scrub_failed:${JSON.stringify(transport)}`);
        await screenshot({ page, report, outDir, name: 'structured_global_scrub' });
    });

    await check('column All and None include off-screen tracks without deleting content', async () => {
        const openChoices = async () => {
            const view = await geometry();
            let mute;
            for (const id of view.rows) {
                mute = await findBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: id + '_mute' });
                if (mute) break;
            }
            assert(mute, 'offscreen_mix_target_missing');
            const point = await playwrightPointForClientTarget(page, mute);
            await page.mouse.move(point.x, point.y); await page.mouse.down(); await wait(650); await page.mouse.up();
        };
        const ids = (await geometry()).state.content.entries.map(entry => entry.id);
        assert(ids.length === 20, 'offscreen_scope_incomplete');
        await openChoices(); await clickCanvasTarget(page, await target('project_view_mix_mute'));
        for (const [choice, active] of [['all', true], ['none', false]]) {
            await openChoices(); await clickCanvasTarget(page, await target('project_view_mix_' + choice));
            await waitFor(page, async ({ ids, active }) => {
                const records = await Promise.all(ids.map(id => window.Atome.getStateCurrent(id)));
                return { ok: records.every(record => record.properties.mute === active && record.properties.__deleted !== true) };
            }, { ids, active });
            await screenshot({ page, report, outDir, name: 'structured_offscreen_mix_' + choice });
        }
    });
};
