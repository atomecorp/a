import {
    assert, clickCanvasTarget, findBevyUiNodeTarget, wait, waitFor
} from './molecule_ui_acceptance_support.mjs';
import {
    drag, reloadProjection, screenshot, structuredDropTarget, switchView, waitForMolecule
} from './molecule_ui_drop_core.mjs';
import {
    assertNoParasites, chooseMoleculePlaybackMode, disarmMemberPlayback,
    memberPlayTool, playbackSnapshot, startMoleculePlayback,
    waitForContextualTarget, waitForPlaybackEnd
} from './molecule_ui_drop_playback_support.mjs';

const CORE_ONLY = process.env.MOLECULE_UI_DROP_CORE_ONLY === '1';

export const validateMatrixMoleculeDrop = async ({ page, project, fixture, report, outDir }) => {
    await switchView(page, project.id, 'table');
    await screenshot({ page, report, outDir, name: 'drop_matrix_before' });
    const tile = (index) => findBevyUiNodeTarget(page, {
        nodeId: `project_view_matrix_tile_${index}`, treeId: 'eve_bevy_ui_project_view', step: 2
    });
    const tileForRecord = async (recordId) => {
        const nodeId = await page.evaluate((expectedId) => {
            const surface = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .find((entry) => entry.id === 'eve_bevy_ui_project_view');
            const projectId = window.__currentProject?.id || window.__currentProject?.atome_id || '';
            const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
            const record = records.find((entry) => String(entry?.id || entry?.atome_id || '') === expectedId);
            const label = String(record?.properties?.name || record?.name || expectedId);
            return String((surface?.interactiveNodes || []).find((entry) => (
                /^project_view_matrix_tile_\d+$/.test(String(entry?.id || ''))
                && String(entry?.accessibility?.label || '') === label
            ))?.id || '');
        }, String(recordId));
        return nodeId ? findBevyUiNodeTarget(page, {
            nodeId, treeId: 'eve_bevy_ui_project_view', step: 2
        }) : null;
    };
    let source = await tile(0); let target = await tile(1);
    assert(source && target, 'matrix_insert_targets_missing');
    const insertion = await structuredDropTarget(page, {
        layout: 'matrix', sourceId: fixture.spareId, targetIndex: 1, kind: 'insert', edge: 'after'
    });
    assert(insertion, 'matrix_insert_geometry_missing');
    let insertPreview = false;
    await drag({
        page, source, destination: insertion, holdMs: 180,
        armedShot: async () => {
            insertPreview = await page.evaluate(() => {
                const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                    .find((entry) => entry.id === 'eve_bevy_ui_project_view');
                return tree?.overlayRecordIds?.some((id) => String(id).includes('project_view_matrix_drag_preview')) || false;
            });
        }
    });
    assert(insertPreview, 'matrix_drag_preview_not_projected');
    await wait(650);
    await reloadProjection(page, project.id);
    const order = await page.evaluate(async (ids) => {
        const states = await Promise.all(ids.map((id) => window.Atome.getStateCurrent(id)));
        const value = (state) => Number(state?.hierarchy_order ?? state?.props?.hierarchy_order
            ?? state?.properties?.hierarchy_order ?? Number.POSITIVE_INFINITY);
        return states.map((state, index) => ({ id: ids[index], order: value(state) })).sort((a, b) => a.order - b.order);
    }, [fixture.audioId, fixture.imageId, fixture.spareId]);
    assert(order.findIndex((row) => row.id === fixture.spareId)
        === order.findIndex((row) => row.id === fixture.imageId) + 1,
    `matrix_insert_after_failed:${JSON.stringify(order)}`);
    const imageIndex = order.findIndex((row) => row.id === fixture.imageId);
    const audioIndex = order.findIndex((row) => row.id === fixture.audioId);
    source = await tile(imageIndex); target = await tile(audioIndex);
    assert(source && target, 'matrix_absorb_targets_missing');
    const overlap = await structuredDropTarget(page, {
        layout: 'matrix', sourceId: fixture.imageId, targetIndex: audioIndex, kind: 'overlap'
    });
    assert(overlap, 'matrix_overlap_geometry_missing');
    await drag({
        page, source, destination: overlap, holdMs: 700,
        armedShot: () => screenshot({
            page, report, outDir,
            name: 'drop_matrix_armed_before_release',
            preservePointer: true
        })
    });
    const molecule = await waitForMolecule(page, { sourceId: fixture.imageId, targetId: fixture.audioId });
    await reloadProjection(page, project.id);
    await screenshot({ page, report, outDir, name: 'drop_matrix_after_reload' });
    if (CORE_ONLY) {
        const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
        assert(clean.ok, `matrix_parasitic_projection:${JSON.stringify(clean)}`);
        return { molecule, order, playbackModes: [], members: [], clean, core_only: true };
    }
    const moleculeId = molecule.sourceParent;
    const rootMoleculeTile = await tileForRecord(moleculeId);
    assert(rootMoleculeTile, 'matrix_molecule_tile_missing');
    const active = await page.evaluate(async (id) => {
        const { getAtomeContextualEditApi } = await import(
            '/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'
        );
        return getAtomeContextualEditApi()?.readState?.()?.activeAtomeId === id;
    }, moleculeId);
    if (!active) await clickCanvasTarget(page, rootMoleculeTile);
    await waitForContextualTarget(page, moleculeId);
    await chooseMoleculePlaybackMode(page, moleculeId, 'layer');
    await startMoleculePlayback(page, moleculeId, [fixture.audioId, fixture.imageId]);
    await wait(500);
    const progressed = await playbackSnapshot(page, [fixture.audioId, fixture.imageId]);
    assert(progressed.playing, `matrix_molecule_not_progressing:${JSON.stringify(progressed)}`);
    await screenshot({ page, report, outDir, name: 'drop_matrix_molecule_progress' });
    const ended = await waitForPlaybackEnd(page, 8000);

    const moleculeEntryTile = await tileForRecord(moleculeId);
    assert(moleculeEntryTile, 'matrix_molecule_entry_tile_missing');
    await clickCanvasTarget(page, moleculeEntryTile, { double: true });
    await waitForNavigation(page, 'molecule');
    await screenshot({ page, report, outDir, name: 'drop_matrix_inside_molecule' });
    const directMembers = await page.evaluate(async (expectedIds) => {
        const [{ readProjectViewSurfaceState }, navigation] = await Promise.all([
            import('/eVe/domains/rendering/project_view_surface_runtime.js'),
            import('/eVe/domains/rendering/project_view_navigation.js')
        ]);
        const projectId = readProjectViewSurfaceState().projectId;
        const allRecords = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
        const records = navigation.containerChildren(allRecords);
        return {
            ids: records.map((record) => String(record.id || '')),
            entities: records.map((record) => String(record.properties?.molecule_entity || '')),
            expectedIds,
            recordCount: readProjectViewSurfaceState().content?.recordCount || 0
        };
    }, [fixture.audioId, fixture.imageId]);
    assert(directMembers.expectedIds.every((id) => directMembers.ids.includes(id))
        && directMembers.ids.length === 2,
    `matrix_direct_members_missing:${JSON.stringify(directMembers)}`);
    assert(!directMembers.entities.some((entity) => entity === 'section' || entity === 'track'),
        `matrix_internal_timeline_leaked:${JSON.stringify(directMembers)}`);
    const members = [];
    for (const memberId of [fixture.audioId, fixture.imageId]) {
        const memberIndex = directMembers.ids.indexOf(memberId);
        assert(memberIndex >= 0, `matrix_member_index_missing:${memberId}`);
        const memberTile = await tileForRecord(memberId);
        assert(memberTile, `matrix_member_tile_missing:${memberId}`);
        await clickCanvasTarget(page, memberTile);
        await waitForContextualTarget(page, memberId);
        const play = await memberPlayTool(page);
        assert(play, `matrix_member_play_missing:${memberId}`);
        await clickCanvasTarget(page, play);
        const started = await waitFor(page, async (id) => {
            const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
            const state = projectViewPlayback.readState();
            return { ok: state.playing === true && state.playingIds.includes(id), state };
        }, memberId);
        await wait(400);
        await screenshot({ page, report, outDir, name: `drop_matrix_member_${memberId === fixture.audioId ? 'audio' : 'image'}_progress` });
        const memberEnded = await waitForPlaybackEnd(page, memberId === fixture.audioId ? 30000 : 7000);
        const stopped = await disarmMemberPlayback(page);
        members.push({ memberId, started: started.state, ended: memberEnded.state, stopped });
    }
    const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
    assert(clean.ok, `matrix_parasitic_projection:${JSON.stringify(clean)}`);
    return { molecule, order, progressed, ended: ended.state, members, clean };
};

const waitForNavigation = (page, entity) => waitFor(page, async (expected) => {
    const navigation = await import('/eVe/domains/rendering/project_view_navigation.js');
    const state = navigation.readState();
    return { ok: state.current?.entity === expected, state };
}, entity);
