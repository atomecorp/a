import { assert, clickCanvasTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import {
    drag, reloadProjection, screenshot, structuredDropTarget, switchView, waitForMolecule
} from './molecule_ui_drop_core.mjs';
import {
    assertNoParasites, chooseMoleculePlaybackMode, disarmMemberPlayback,
    expandCanonicalListMolecule, listIndex, listNode, memberPlayTool, playbackSnapshot,
    selectListRow, startMoleculePlayback, structuredRows, waitForPlaybackEnd
} from './molecule_ui_drop_playback_support.mjs';

const CORE_ONLY = process.env.MOLECULE_UI_DROP_CORE_ONLY === '1';

export const validateListMoleculeDrop = async ({ page, project, fixture, report, outDir }) => {
    await switchView(page, project.id, 'list');
    const initialRows = await structuredRows(page);
    const lastRoot = initialRows.filter((row) => row.depth === 0).at(-1);
    assert(lastRoot, `list_footer_fixture_empty:${JSON.stringify(initialRows)}`);
    await selectListRow(page, lastRoot.id);
    const footer = await listNode(page, 'project_view_footer');
    assert(footer, 'list_footer_not_actionable');
    await clickCanvasTarget(page, footer);
    const footerSelection = await waitFor(page, async () => {
        const [{ readProjectViewSurfaceState }, selection] = await Promise.all([
            import('/eVe/domains/rendering/project_view_surface_runtime.js'),
            import('/eVe/intuition/runtime/selection.js')
        ]);
        const state = readProjectViewSurfaceState();
        return {
            ok: !state.content?.primaryId && selection.getCurrentSelectionIds().length === 0,
            primaryId: state.content?.primaryId || '', selectedIds: selection.getCurrentSelectionIds()
        };
    });
    await screenshot({ page, report, outDir, name: 'drop_list_before' });
    const imageIndex = await listIndex(page, fixture.imageId);
    const audioIndex = await listIndex(page, fixture.audioId);
    const image = await listNode(page, `project_view_list_entry_${imageIndex}_name`);
    assert(image && await listNode(page, `project_view_list_entry_${audioIndex}_name`), 'list_absorb_targets_missing');
    const overlapDestination = await structuredDropTarget(page, {
        layout: 'list', sourceId: fixture.imageId, targetIndex: audioIndex, kind: 'combine'
    });
    assert(overlapDestination, 'list_overlap_geometry_missing');
    await drag({
        page, source: image, destination: overlapDestination, holdMs: 700,
        armedShot: () => screenshot({
            page, report, outDir,
            name: 'drop_list_armed_before_release',
            preservePointer: true
        })
    });
    const molecule = await waitForMolecule(page, { sourceId: fixture.imageId, targetId: fixture.audioId });
    await reloadProjection(page, project.id);
    let rows = await structuredRows(page);
    const spareRow = rows.find((row) => row.id === fixture.spareId && row.depth === 0);
    const moleculeRow = rows.find((row) => row.entity === 'molecule' && row.depth === 0);
    assert(spareRow && moleculeRow, `list_root_rows_missing:${JSON.stringify(rows)}`);
    const insertionSource = await listNode(page, `project_view_list_entry_${spareRow.index}_name`);
    const insertDestination = await structuredDropTarget(page, {
        layout: 'list', sourceId: spareRow.id, targetIndex: moleculeRow.index, kind: 'insert', edge: 'after'
    });
    assert(insertionSource && insertDestination, 'list_insert_geometry_missing');
    await drag({ page, source: insertionSource, destination: insertDestination, holdMs: 180 });
    await wait(650);
    await reloadProjection(page, project.id);
    rows = await structuredRows(page);
    assert(rows.findIndex((row) => row.id === fixture.spareId)
        === rows.findIndex((row) => row.entity === 'molecule') + 1,
    `list_insert_below_failed:${JSON.stringify(rows)}`);
    rows = await expandCanonicalListMolecule(page, [fixture.audioId, fixture.imageId]);
    await screenshot({ page, report, outDir, name: 'drop_list_expanded_after_reload' });
    if (CORE_ONLY) {
        const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
        assert(clean.ok, `list_parasitic_projection:${JSON.stringify(clean)}`);
        return { molecule, rows, playbackModes: [], children: [], clean, core_only: true };
    }
    const moleculeId = molecule.sourceParent;
    await selectListRow(page, moleculeId);
    const playbackModes = [];
    for (const mode of ['sequential', 'random', 'layer']) {
        await selectListRow(page, moleculeId);
        const rule = await chooseMoleculePlaybackMode(page, moleculeId, mode);
        const started = await startMoleculePlayback(page, moleculeId, [fixture.audioId, fixture.imageId]);
        await wait(500);
        const progressed = await playbackSnapshot(page, [fixture.audioId, fixture.imageId]);
        assert(progressed.playing && progressed.scope === `molecule:${moleculeId}`,
            `molecule_playback_not_progressing:${mode}:${JSON.stringify(progressed)}`);
        const followed = await page.evaluate(async ({ playbackMode, owner, members }) => {
            const [{ readProjectViewSurfaceState }, { projectViewPlayback }, selection] = await Promise.all([
                import('/eVe/domains/rendering/project_view_surface_runtime.js'),
                import('/eVe/domains/rendering/project_view_playback_runtime.js'),
                import('/eVe/intuition/runtime/selection.js')
            ]);
            const playback = projectViewPlayback.readState();
            const selectedIds = selection.getCurrentSelectionIds();
            const primaryId = String(readProjectViewSurfaceState().content?.primaryId || '');
            const currentMember = playback.playingIds.find((id) => members.includes(id)) || '';
            return {
                ok: playbackMode === 'layer'
                    ? selectedIds.length === 1 && selectedIds[0] === owner && primaryId === owner
                    : Boolean(currentMember) && selectedIds.length === 1
                        && selectedIds[0] === currentMember && primaryId === currentMember,
                playbackMode, currentMember, selectedIds, primaryId,
                playingIds: playback.playingIds
            };
        }, { playbackMode: mode, owner: moleculeId, members: [fixture.audioId, fixture.imageId] });
        assert(followed.ok, `molecule_playback_selection_not_following:${JSON.stringify(followed)}`);
        await screenshot({ page, report, outDir, name: `drop_list_molecule_${mode}_progress` });
        const ended = await waitForPlaybackEnd(page, mode === 'layer' ? 12000 : 35000);
        const endedSelection = await page.evaluate(async () => {
            const [{ readProjectViewSurfaceState }, selection] = await Promise.all([
                import('/eVe/domains/rendering/project_view_surface_runtime.js'),
                import('/eVe/intuition/runtime/selection.js')
            ]);
            return {
                primaryId: String(readProjectViewSurfaceState().content?.primaryId || ''),
                selectedIds: selection.getCurrentSelectionIds()
            };
        });
        assert(mode === 'layer' ? endedSelection.primaryId === moleculeId
            : [fixture.audioId, fixture.imageId].includes(endedSelection.primaryId),
        `molecule_playback_final_selection:${mode}:${JSON.stringify(endedSelection)}`);
        playbackModes.push({ mode, rule, started, progressed, followed, ended: ended.state, endedSelection });
    }
    const children = [];
    for (const memberId of [fixture.audioId, fixture.imageId]) {
        await selectListRow(page, memberId);
        const play = await memberPlayTool(page);
        assert(play, `member_play_tool_missing:${memberId}`);
        await clickCanvasTarget(page, play);
        const started = await waitFor(page, async (id) => {
            const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
            const state = projectViewPlayback.readState();
            return { ok: state.playing === true && state.playingIds.includes(id), state };
        }, memberId);
        await wait(400);
        await screenshot({ page, report, outDir, name: `drop_list_member_${memberId === fixture.audioId ? 'audio' : 'image'}_progress` });
        const ended = await waitForPlaybackEnd(page, memberId === fixture.audioId ? 30000 : 7000);
        const stopped = await disarmMemberPlayback(page);
        children.push({ memberId, started: started.state, ended: ended.state, stopped });
    }
    const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
    assert(clean.ok, `list_parasitic_projection:${JSON.stringify(clean)}`);
    return { molecule, rows, footerSelection, playbackModes, children, clean };
};
