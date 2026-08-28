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
    const dragTrace = await drag({
        page, source, destination: target, holdMs: 700,
        armedShot: async () => {
            const pointBeforeScreenshot = await page.evaluate(async () => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const session = getRenderSurfaceState(document.getElementById('eve_surface_project'))?.pointerSession;
                return session?.last || null;
            });
            await screenshot({
                page, report, outDir, name: 'drop_natural_armed_before_release', preservePointer: true
            });
            armed = await page.evaluate(async ({ expectedTargetId, pointBeforeScreenshot }) => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
                const { hitTestRenderScene } = await import('/eVe/domains/rendering/scene_graph.js');
                const surface = document.getElementById('eve_surface_project');
                const runtime = getRenderSurfaceState(surface);
                const session = runtime?.pointerSession || null;
                const point = session?.last || null;
                const beneath = point ? hitTestRenderScene(runtime?.scene || null, point, {
                    excludeId: session?.atome_id
                }) : null;
                const expectedTarget = runtime?.scene?.byId?.get?.(expectedTargetId) || null;
                return session ? {
                    atomeId: session.atome_id, moved: session.moved === true,
                    start: session.start || null,
                    pointBeforeScreenshot,
                    targetId: String(session.overlap_target_id || ''),
                    stationaryMs: session.overlap_target_id
                        ? Date.now() - Number(session.overlap_started_at || Date.now()) : 0,
                    targetCount: Array.isArray(session.targets) ? session.targets.length : 0,
                    point,
                    beneath: beneath ? {
                        id: String(beneath.id || ''), bounds: beneath.bounds || null,
                        selectable: beneath.capabilities?.selectable !== false,
                        occluder: beneath.capabilities?.hitTestOccluder === true
                    } : null,
                    expectedTarget: expectedTarget ? {
                        id: String(expectedTarget.id || ''), bounds: expectedTarget.bounds || null,
                        transform: expectedTarget.transform || null
                    } : null,
                    surfaceSize: readRenderSurfaceSize(surface),
                    surfaceRect: surface?.getBoundingClientRect?.().toJSON?.() || null
                } : null;
            }, { expectedTargetId: fixture.audioId, pointBeforeScreenshot });
        }
    });
    assert(armed?.moved === true && armed?.targetId === fixture.audioId
        && armed?.stationaryMs >= 500 && armed?.targetCount === 1,
    `natural_absorb_not_armed:${JSON.stringify({ armed, dragTrace, source, target, fixture })}`);
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
    const spareSelectionTarget = await recordCenter(page, project.id, (record) => record.id === fixture.spareId, { sceneCoordinates: true });
    await clickCanvasTarget(page, spareSelectionTarget);
    const ownerTarget = await recordCenter(page, project.id, (record) => record.id === fixture.audioId, { sceneCoordinates: true });
    await clickCanvasTarget(page, ownerTarget);
    const selectedOwner = await waitFor(page, async ({ pid, ownerId, memberIds }) => {
        const [{ getProjectSceneState }, selection] = await Promise.all([
            import('/eVe/domains/rendering/project_scene_runtime.js'),
            import('/eVe/intuition/runtime/selection.js')
        ]);
        const runtime = getProjectSceneState(pid);
        const selectedIds = selection.getCurrentSelectionIds().map(String);
        const owner = runtime?.scene?.byId?.get?.(ownerId) || null;
        return {
            ok: selectedIds.length === 1 && selectedIds[0] === ownerId
                && owner?.visual?.selected === true && owner?.visual?.opacity === 0,
            selectedIds,
            owner: owner ? { selected: owner.visual?.selected, opacity: owner.visual?.opacity, bounds: owner.bounds } : null,
            selectedMembers: memberIds.filter((id) => runtime?.scene?.byId?.get?.(id)?.visual?.selected === true)
        };
    }, { pid: project.id, ownerId: moleculeId, memberIds: [fixture.audioId, fixture.imageId] });
    assert(selectedOwner.selectedMembers.length === 0,
        `natural_molecule_member_selected:${JSON.stringify(selectedOwner)}`);
    await screenshot({ page, report, outDir, name: 'drop_natural_owner_selected' });
    await clickCanvasTarget(page, ownerTarget, { double: true });
    const contextual = await waitForContextualTarget(page, moleculeId);
    const contextualChrome = await waitFor(page, async (ownerId) => {
        const { getAtomeContextualEditApi } = await import(
            '/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'
        );
        const state = getAtomeContextualEditApi()?.readState?.() || {};
        const tree = window.eveBevyUiRuntime?.state?.trees
            ?.get?.('eve_bevy_panel_atome_contextual_edit')?.tree || null;
        const nodes = new Map();
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            nodes.set(String(node.id || ''), node);
            (node.children || []).forEach(visit);
        };
        visit(tree?.root);
        const safe = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const outline = nodes.get(`atome_contextual_edit_${safe}_outline`) || null;
        const footer = nodes.get(`atome_contextual_edit_${safe}_footer`) || null;
        const close = nodes.get(`atome_contextual_edit_${safe}_close`) || null;
        return {
            ok: state.activeAtomeId === ownerId && state.railOnly === false
                && outline?.kind === 'panel' && Array.isArray(outline?.style?.border)
                && footer?.kind === 'row' && close?.kind === 'button',
            state,
            chrome: {
                outline: outline ? { kind: outline.kind, style: outline.style } : null,
                footer: footer ? { kind: footer.kind, style: footer.style } : null,
                close: close ? { kind: close.kind, style: close.style } : null
            }
        };
    }, moleculeId);
    await screenshot({ page, report, outDir, name: 'drop_natural_owner_entered' });
    const memberBefore = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.Atome.getStateCurrent(id))), [
        fixture.audioId, fixture.imageId
    ]);
    const memberDragSource = await recordCenter(page, project.id, (record) => record.id === fixture.audioId, { sceneCoordinates: true });
    await drag({
        page,
        source: memberDragSource,
        destination: { ...memberDragSource, x: memberDragSource.x + 24, coordinate_source: 'scene' }
    });
    const internalMove = await waitFor(page, async ({ ownerId, movedId, siblingId, before }) => {
        const [owner, moved, sibling] = await Promise.all([
            window.Atome.getStateCurrent(ownerId), window.Atome.getStateCurrent(movedId), window.Atome.getStateCurrent(siblingId)
        ]);
        const props = (value) => value?.properties || value?.props || {};
        const movedProps = props(moved);
        const beforeMoved = props(before[0]);
        const siblingProps = props(sibling);
        const beforeSibling = props(before[1]);
        const ownerProps = props(owner);
        const number = (value) => Number.parseFloat(String(value));
        const bounds = [movedProps, siblingProps].map((entry) => ({
            left: number(entry.left ?? entry.x), top: number(entry.top ?? entry.y),
            width: number(entry.width), height: number(entry.height)
        }));
        const left = Math.min(...bounds.map((entry) => entry.left));
        const top = Math.min(...bounds.map((entry) => entry.top));
        const right = Math.max(...bounds.map((entry) => entry.left + entry.width));
        const bottom = Math.max(...bounds.map((entry) => entry.top + entry.height));
        return {
            ok: number(movedProps.left ?? movedProps.x) === number(beforeMoved.left ?? beforeMoved.x) + 24
                && number(siblingProps.left ?? siblingProps.x) === number(beforeSibling.left ?? beforeSibling.x)
                && String(moved?.parent_id || moved?.parentId || movedProps.parent_id
                    || moved?.meta?.parent_id || moved?.meta?.parentId || '') === ownerId
                && number(ownerProps.left ?? ownerProps.x) === left && number(ownerProps.top ?? ownerProps.y) === top
                && number(ownerProps.width) === right - left && number(ownerProps.height) === bottom - top,
            ownerProps, movedProps, siblingProps
        };
    }, { ownerId: moleculeId, movedId: fixture.audioId, siblingId: fixture.imageId, before: memberBefore });
    const close = await contextualTool(page, [`atome_contextual_edit_${moleculeId.replace(/[^a-zA-Z0-9_-]/g, '_')}_close`]);
    assert(close, `natural_molecule_close_missing:${JSON.stringify(contextualChrome)}`);
    await clickCanvasTarget(page, close);
    await waitFor(page, async () => {
        const { getAtomeContextualEditApi } = await import(
            '/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'
        );
        const state = getAtomeContextualEditApi()?.readState?.() || {};
        return { ok: !state.activeAtomeId, state };
    });
    const reopenedTarget = await recordCenter(page, project.id, (record) => record.id === fixture.audioId, { sceneCoordinates: true });
    await clickCanvasTarget(page, reopenedTarget, { double: true });
    await waitForContextualTarget(page, moleculeId);
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
        molecule, selectedOwner, contextual: contextual.state, contextualChrome,
        internalMove, progressed, ended: ended.state, entered: entered.state, children, clean,
        membership: await readMembership(page, {
            sourceId: fixture.imageId, targetId: fixture.audioId, spareId: fixture.spareId
        })
    };
};
