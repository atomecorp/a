import {
    assert, clickCanvasTarget, recordCenter, wait, waitFor, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import {
    drag, readMembership, reloadProjection, screenshot, stateParentId, switchView, waitForMolecule
} from './molecule_ui_drop_core.mjs';
import {
    assertNoParasites, chooseMoleculePlaybackMode, contextualTool, disarmMemberPlayback,
    expandCanonicalListMolecule, memberPlayTool, playbackSnapshot, selectListRow,
    startMoleculePlayback, waitForContextualTarget, waitForPlaybackEnd
} from './molecule_ui_drop_playback_support.mjs';

const CORE_ONLY = process.env.MOLECULE_UI_DROP_CORE_ONLY === '1';

export const validateNaturalMoleculeDrop = async ({ page, project, fixture, report, outDir }) => {
    await switchView(page, project.id, 'natural');
    await screenshot({ page, report, outDir, name: 'drop_natural_before' });
    const spare = await recordCenter(page, project.id, (record) => record.id === fixture.spareId, { sceneCoordinates: true });
    await drag({
        page, source: spare,
        destination: { ...spare, x: spare.x, y: spare.y + 250, coordinate_source: 'scene' }
    });
    await waitForStableScene(page, project.id);
    const spareState = await page.evaluate(async (id) => window.Atome.getStateCurrent(id), fixture.spareId);
    assert(['', project.id].includes(stateParentId(spareState)),
        `natural_non_overlap_reparented:${stateParentId(spareState)}`);
    const source = await recordCenter(page, project.id, (record) => record.id === fixture.imageId, { sceneCoordinates: true });
    const target = await recordCenter(page, project.id, (record) => record.id === fixture.audioId, { sceneCoordinates: true });
    let armed = null;
    await drag({
        page, source, destination: target, holdMs: 700,
        armedShot: async () => {
            await screenshot({ page, report, outDir, name: 'drop_natural_armed_before_release' });
            armed = await page.evaluate(async () => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const session = getRenderSurfaceState(document.getElementById('eve_surface_project'))?.pointerSession || null;
                return session ? {
                    atomeId: session.atome_id, moved: session.moved === true,
                    targetId: String(session.overlap_target_id || ''),
                    stationaryMs: session.overlap_target_id
                        ? Date.now() - Number(session.overlap_started_at || Date.now()) : 0,
                    targetCount: Array.isArray(session.targets) ? session.targets.length : 0
                } : null;
            });
        }
    });
    assert(armed?.moved === true && armed?.targetId === fixture.audioId
        && armed?.stationaryMs >= 500 && armed?.targetCount === 1,
    `natural_absorb_not_armed:${JSON.stringify({ armed, fixture })}`);
    const molecule = await waitForMolecule(page, { sourceId: fixture.imageId, targetId: fixture.audioId });
    await reloadProjection(page, project.id);
    await screenshot({ page, report, outDir, name: 'drop_natural_after_reload' });
    if (CORE_ONLY) {
        const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
        assert(clean.ok, `natural_parasitic_projection:${JSON.stringify(clean)}`);
        return {
            molecule, playbackModes: [], children: [], clean, core_only: true,
            membership: await readMembership(page, {
                sourceId: fixture.imageId, targetId: fixture.audioId, spareId: fixture.spareId
            })
        };
    }
    const moleculeId = molecule.sourceParent;
    const ownerTarget = await recordCenter(page, project.id, (record) => record.id === fixture.audioId, { sceneCoordinates: true });
    await clickCanvasTarget(page, ownerTarget, { double: true });
    await waitForContextualTarget(page, moleculeId);
    await screenshot({ page, report, outDir, name: 'drop_natural_owner_entered' });
    await chooseMoleculePlaybackMode(page, moleculeId, 'layer');
    await startMoleculePlayback(page, moleculeId, [fixture.audioId, fixture.imageId]);
    await wait(500);
    const progressed = await playbackSnapshot(page, [fixture.audioId, fixture.imageId]);
    assert(progressed.playing, `natural_molecule_not_progressing:${JSON.stringify(progressed)}`);
    await screenshot({ page, report, outDir, name: 'drop_natural_molecule_progress' });
    const ended = await waitForPlaybackEnd(page, 8000);
    const activity = await contextualTool(page, ['atome_contextual_tool_activity']);
    assert(activity, 'natural_molecule_activity_missing');
    await clickCanvasTarget(page, activity);
    const activityNode = await waitFor(page, async () => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const id = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry))
            .find((candidate) => candidate.includes('molecule_activity_list') && !candidate.endsWith('_background'));
        return { ok: Boolean(id), id };
    });
    const activityList = await contextualTool(page, [activityNode.id]);
    assert(activityList, 'natural_molecule_activity_list_missing');
    await clickCanvasTarget(page, activityList);
    const entered = await waitFor(page, async () => {
        const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
        const state = readProjectViewSurfaceState();
        return { ok: state.mode === 'list', state };
    });
    await waitForStableScene(page, project.id);
    await expandCanonicalListMolecule(page, [fixture.audioId, fixture.imageId]);
    await screenshot({ page, report, outDir, name: 'drop_natural_entered' });
    const children = [];
    for (const memberId of [fixture.audioId, fixture.imageId]) {
        await selectListRow(page, memberId);
        const play = await memberPlayTool(page);
        assert(play, `natural_member_play_missing:${memberId}`);
        await clickCanvasTarget(page, play);
        const started = await waitFor(page, async (id) => {
            const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
            const state = projectViewPlayback.readState();
            return { ok: state.playing === true && state.playingIds.includes(id), state };
        }, memberId);
        await wait(400);
        await screenshot({ page, report, outDir, name: `drop_natural_member_${memberId === fixture.audioId ? 'audio' : 'image'}_progress` });
        const memberEnded = await waitForPlaybackEnd(page, memberId === fixture.audioId ? 30000 : 7000);
        const stopped = await disarmMemberPlayback(page);
        children.push({ memberId, started: started.state, ended: memberEnded.state, stopped });
    }
    const clean = await assertNoParasites(page, project.id, [fixture.audioId, fixture.imageId]);
    assert(clean.ok, `natural_parasitic_projection:${JSON.stringify(clean)}`);
    return {
        molecule, progressed, ended: ended.state, entered: entered.state, children, clean,
        membership: await readMembership(page, {
            sourceId: fixture.imageId, targetId: fixture.audioId, spareId: fixture.spareId
        })
    };
};
