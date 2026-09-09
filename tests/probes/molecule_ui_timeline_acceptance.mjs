import path from 'node:path';
import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, findBevyUiNodeTarget, playwrightPointForClientTarget, readBevyUiHit, recordCenter, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
const clickMenuTarget = clickCanvasTarget;
import { exerciseMixerLassoBlock, exerciseTimelineEditingGestures } from "./molecule_ui_timeline_gestures.mjs";

export const runMoleculeTimelineAcceptance = async ({ page, project, fixture, report, check, OUT_DIR, ENDURANCE_MS, ENDURANCE_MIN_CYCLES, cdp, projectViewNode, readAcceptanceState }) => {
        await check('real Mixage and Mute clicks update the canonical grouped track', async () => {
            const activity = await visibleMenuTool(page, project.id, 'activity');
            await clickMenuTarget(page, activity);
            await wait(500);
            const mix = await visibleMenuTool(page, project.id, 'molecule_activity_mix');
            const mixHit = await readBevyUiHit(page, mix);
            assert(String(mixHit.nodeId || '').endsWith('activity__molecule_activity_mix'),
                `molecule_mix_hit_mismatch:${JSON.stringify({ mix, mixHit })}`);
            await clickMenuTarget(page, mix);
            await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const view = readProjectViewSurfaceState();
                return {
                    ok: view.mode === 'mix' && Boolean(view.content?.ownerId) && Boolean(view.content?.timelineId),
                    mode: view.mode,
                    content: view.content
                };
            });
            const mute = await awaitBevyUiNodeTarget(page, {
                nodePrefix: 'molecule_mix_mute_',
                treeId: 'eve_bevy_ui_project_view'
            });
            assert(mute, 'molecule_mix_mute_not_actionable');
            const projected = await page.evaluate(() => ({
                routing: (window.atome?.tools?.gatewayRoutingLog || [])
                    .filter((entry) => entry.tool_id === 'ui.timeline.activity.mix').slice(-6)
            }));
            const trackId = mute.id.match(/molecule_mix_mute_(.+)$/)?.[1] || '';
            assert(trackId, `molecule_mix_track_id_missing:${mute.id}`);
            const muteHit = await readBevyUiHit(page, mute);
            assert(String(muteHit.nodeId || '').includes(`molecule_mix_mute_${trackId}`),
                `molecule_mix_mute_hit_mismatch:${JSON.stringify({ mute, muteHit, trackId })}`);
            const before = await readAcceptanceState(page, project.id, fixture.ownerId);
            const previous = before.timeline.tracks.find((track) => track.track_id === trackId)?.mute === true;
            await clickCanvasTarget(page, mute);
            const committed = await waitFor(page, async ({ owner, id, prior }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const mute = timeline?.tracks?.find((track) => track.track_id === id)?.mute === true;
                return { ok: mute !== prior, mute, track_id: id };
            }, { owner: fixture.ownerId, id: trackId, prior: previous });
            const gainControl = await findBevyUiNodeTarget(page, { nodeId: `molecule_mix_gain_${trackId}`, treeId: 'eve_bevy_ui_project_view' });
            const panControl = await findBevyUiNodeTarget(page, { nodeId: `molecule_mix_pan_${trackId}`, treeId: 'eve_bevy_ui_project_view' });
            assert(gainControl && panControl, `molecule_mix_sliders_not_actionable:${JSON.stringify({ gainControl, panControl, trackId })}`); const gainBefore = Number(before.timeline.tracks.find((track) => track.track_id === trackId)?.gain ?? 1);
            const gainPoint = await playwrightPointForClientTarget(page, gainControl); await page.mouse.move(gainPoint.x, gainPoint.y); await page.mouse.down();
            await page.mouse.move(gainPoint.x, gainPoint.y - 48, { steps: 6 }); await page.mouse.up();
            const gainCommitted = await waitFor(page, async ({ owner, id, prior }) => {
                const state = await window.Atome.getStateCurrent(owner); const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const gain = Number(timeline?.tracks?.find((track) => track.track_id === id)?.gain ?? 1); return { ok: gain !== prior, gain, track_id: id };
            }, { owner: fixture.ownerId, id: trackId, prior: gainBefore });
            const lassoBlock = await exerciseMixerLassoBlock(page); const mixShot = path.join(OUT_DIR, 'mix_controls.png'); await page.screenshot({ path: mixShot, animations: 'disabled' }); report.screenshots.push(mixShot);
            return { projected, committed, gainCommitted, pan_control: panControl.id, lassoBlock };
        });

        await check('real Activity and Timeline clicks project sections, lanes, clips, crop and loop handles', async () => {
            const activePaletteKey = await page.evaluate(async () => {
                const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                return String(module.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '');
            });
            if (activePaletteKey !== 'activity') {
                const activity = await visibleMenuTool(page, project.id, 'activity');
                await clickMenuTarget(page, activity);
                await wait(650);
            }
            const timelineActivity = await visibleMenuTool(page, project.id, 'molecule_activity_timeline');
            await clickMenuTarget(page, timelineActivity);
            return waitFor(page, async (pid) => {
                const ids = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).map((record) => String(record.id || ''));
                const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const projectView = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                return {
                    ok: ids.some((id) => id === 'mol:playhead')
                        && ids.some((id) => id.startsWith('mol:lane:'))
                        && ids.some((id) => id.startsWith('mol:clip:'))
                        && ids.some((id) => id.startsWith('mol:crop:'))
                        && ids.some((id) => id.startsWith('mol:clip-loop-handle:')),
                    molecule_records: ids.filter((id) => id.startsWith('mol:')).length,
                    molecule_record_ids: ids.filter((id) => id.startsWith('mol:')),
                    active_palette: registry.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '',
                    project_view_mode: projectView.readProjectViewSurfaceState()?.mode || '',
                    project_view_content: projectView.readProjectViewSurfaceState()?.content || null,
                    activity_routing: (window.atome?.tools?.gatewayRoutingLog || [])
                        .filter((entry) => String(entry?.tool_id || '').includes('timeline.activity')).slice(-8)
                };
            }, project.id);
        });
        await waitForStableScene(page, project.id);

        await check('a real clip drag commits through the canonical timeline interceptor', async () => {
            const clip = await recordCenter(
                page,
                project.id,
                (record) => record.id === `mol:clip:${fixture.clipId}`,
                { sceneCoordinates: true }
            );
            const before = await readAcceptanceState(page, project.id, fixture.ownerId);
            const previousStart = before.timeline.clips.find((entry) => entry.clip_id === fixture.clipId).timeline.start_frame;
            const clientPoint = await playwrightPointForClientTarget(page, clip);
            const hit = await page.evaluate(async ({ point, clipId }) => {
                const surface = document.getElementById('eve_surface_project');
                const overlay = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
                    surface, clientX: point.x, clientY: point.y
                });
                const { getRenderSurfaceState, readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
                const { hitTestRenderScene } = await import('/eVe/domains/rendering/scene_graph.js');
                const rect = surface.getBoundingClientRect();
                const size = readRenderSurfaceSize(surface);
                const scenePoint = {
                    x: (point.x - rect.left) * (size.width / Math.max(1, rect.width)),
                    y: (point.y - rect.top) * (size.height / Math.max(1, rect.height))
                };
                const state = getRenderSurfaceState(surface);
                const project = hitTestRenderScene(state?.scene, scenePoint);
                return {
                    expected: `mol:clip:${clipId}`,
                    targetPoint: point,
                    overlay: { nodeId: overlay?.nodeId || null, treeId: overlay?.treeId || null },
                    project: { id: project?.id || null, type: project?.type || null },
                    scenePoint
                };
            }, { point: clientPoint, clipId: fixture.clipId });
            assert(hit.project.id === hit.expected, `clip_hit_mismatch:${JSON.stringify(hit)}`);
            assert(!hit.overlay.nodeId, `clip_obscured_by_ui:${JSON.stringify(hit)}`);
            const pointer = await playwrightPointForClientTarget(page, clip);
            await page.mouse.move(pointer.x, pointer.y);
            await page.mouse.down();
            const pointerTwelve = await playwrightPointForClientTarget(page, {
                x: clip.x + 12, y: clip.y, coordinate_source: clip.coordinate_source
            });
            const pointerNinetySix = await playwrightPointForClientTarget(page, {
                x: clip.x + 96, y: clip.y, coordinate_source: clip.coordinate_source
            });
            await page.mouse.move(pointerTwelve.x, pointerTwelve.y);
            await page.mouse.move(pointerNinetySix.x, pointerNinetySix.y, { steps: 11 });
            const during = await page.evaluate(async () => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const state = getRenderSurfaceState(document.getElementById('eve_surface_project')) || {};
                return { pointerSession: state.pointerSession || null, lastIntentError: state.last_intent_error || null };
            });
            await page.mouse.up();
            await wait(1200);
            const after = await page.evaluate(async ({ owner, clipId, previous }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const current = timeline?.clips?.find((entry) => entry.clip_id === clipId)?.timeline?.start_frame;
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const surfaceState = getRenderSurfaceState(document.getElementById('eve_surface_project')) || {};
                return {
                    ok: Number.isSafeInteger(current) && current !== previous,
                    previous, current,
                    lastIntentError: surfaceState.last_intent_error || null,
                    lastPointerCancelReason: surfaceState.last_pointer_cancel_reason || null
                };
            }, { owner: fixture.ownerId, clipId: fixture.clipId, previous: previousStart });
            assert(after.ok, `clip_drag_not_committed:${JSON.stringify({ hit, during, after })}`);
            return { hit, during, after };
        });
        await check('real lasso, crop, trackpad zoom and split gestures preserve timeline semantics', () => exerciseTimelineEditingGestures({ page, projectId: project.id, ownerId: fixture.ownerId, clipId: fixture.clipId }));
        const timelineShot = path.join(OUT_DIR, 'timeline_after_drag.png');
        await page.screenshot({ path: timelineShot, animations: 'disabled' });
        report.screenshots.push(timelineShot);
        if (ENDURANCE_MS > 0) {
            await check('the real Molecule UI remains stable through the configured playback and Record endurance', async () => {
                const openActivity = async () => {
                    const activePalette = await page.evaluate(async () => {
                        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                        return String(registry.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '');
                    });
                    if (activePalette === 'activity') return;
                    const activity = await findBevyUiNodeTarget(page, {
                        nodeId: 'atome_contextual_tool_activity',
                        treeId: 'eve_bevy_panel_atome_contextual_edit'
                    });
                    assert(activity, 'molecule_activity_not_actionable');
                    await clickCanvasTarget(page, activity);
                    await wait(500);
                };
                const selectMolecule = async () => {
                    await openActivity();
                    const list = await visibleMenuTool(page, project.id, 'molecule_activity_list');
                    await clickMenuTarget(page, list);
                    await waitFor(page, async (pid) => {
                        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                        return {
                            ok: records.some((record) => String(record.id || '').includes('project_view_list_entry_0')),
                            records: records.length
                        };
                    }, project.id);
                    const moleculeName = await projectViewNode(page, project.id, 'project_view_list_entry_0_name');
                    await clickCanvasTarget(page, moleculeName);
                    await wait(350);
                };
                const togglePlayback = async () => {
                    const play = await findBevyUiNodeTarget(page, {
                        nodeId: 'atome_contextual_tool_molecule_play',
                        treeId: 'eve_bevy_panel_atome_contextual_edit'
                    });
                    assert(play, 'molecule_play_not_actionable');
                    await clickCanvasTarget(page, play);
                };
                const readRuntimeSample = () => page.evaluate(async ({ pid, owner }) => {
                    const ownerState = await window.Atome.getStateCurrent(owner);
                    const timeline = ownerState?.molecule_timeline
                        || ownerState?.props?.molecule_timeline
                        || ownerState?.properties?.molecule_timeline;
                    const overlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || {};
                    return {
                        at: Date.now(),
                        heap_bytes: Number(performance.memory?.usedJSHeapSize || 0),
                        canvas_count: document.querySelectorAll('canvas#eve_surface_project').length,
                        authoritative_dom_count: document.querySelectorAll('[id^="eve-atome_"]').length,
                        scene_record_count: window.eveToolBase?.getProjectSceneState?.(pid)?.records?.length || 0,
                        mounted_tree_count: overlay.trees?.length || 0,
                        overlay_error: overlay.lastOverlayError || null,
                        clip_count: timeline?.clips?.length || 0,
                        armed_record_regions: timeline?.record_regions?.filter((region) => region.armed === true).length || 0,
                        armed_record_sources: timeline?.record_regions?.filter((region) => region.armed === true).map((region) => region.source_kind) || [],
                        playhead_frame: timeline?.transport?.playhead_frame || 0
                    };
                }, { pid: project.id, owner: fixture.ownerId });

                await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage');
                await selectMolecule();
                const beforeRecord = await readRuntimeSample();
                await togglePlayback();
                await wait(13000);
                await togglePlayback();
                await wait(700);
                const afterRecord = await readRuntimeSample();
                assert(
                    afterRecord.armed_record_regions < beforeRecord.armed_record_regions
                        || afterRecord.clip_count > beforeRecord.clip_count,
                    `armed_record_not_consumed:${JSON.stringify({ beforeRecord, afterRecord })}`
                );
                assert(!beforeRecord.armed_record_sources.includes('video') || !afterRecord.armed_record_sources.includes('video'), `armed_video_record_not_consumed:${JSON.stringify({ beforeRecord, afterRecord })}`);

                await cdp.send('HeapProfiler.collectGarbage'); const baseline = await readRuntimeSample();
                const startedAt = Date.now();
                const deadline = startedAt + ENDURANCE_MS;
                const samples = [baseline];
                const activities = ['molecule_activity_list', 'molecule_activity_mix', 'molecule_activity_timeline'];
                let cycles = 0;
                while (Date.now() < deadline || cycles < ENDURANCE_MIN_CYCLES) {
                    await togglePlayback();
                    await wait(1800);
                    await togglePlayback();
                    await openActivity();
                    const child = await visibleMenuTool(page, project.id, activities[cycles % activities.length]);
                    await clickMenuTarget(page, child);
                    await wait(350);
                    cycles += 1;
                    if (cycles % 10 === 0 || Date.now() >= deadline) {
                        const sample = await readRuntimeSample();
                        assert(sample.canvas_count === 1, `endurance_canvas_count:${sample.canvas_count}`);
                        assert(sample.authoritative_dom_count === 0, `endurance_authoritative_dom:${sample.authoritative_dom_count}`);
                        assert(!sample.overlay_error, `endurance_overlay_error:${sample.overlay_error}`);
                        samples.push(sample);
                    }
                    const remaining = deadline - Date.now();
                    if (remaining > 0) await wait(Math.min(5000, remaining));
                }
                await cdp.send('HeapProfiler.collectGarbage');
                const final = await readRuntimeSample();
                const growthRatio = baseline.heap_bytes > 0
                    ? Math.max(0, (final.heap_bytes - baseline.heap_bytes) / baseline.heap_bytes)
                    : 0;
                assert(growthRatio <= 0.05, `endurance_heap_growth:${growthRatio}`);
                assert(report.console_errors.length === 0, report.console_errors.slice(0, 3).join(' | '));
                assert(report.page_errors.length === 0, report.page_errors.slice(0, 3).join(' | '));
                report.endurance = {
                    requested_ms: ENDURANCE_MS,
                    elapsed_ms: Date.now() - startedAt,
                    minimum_cycles: ENDURANCE_MIN_CYCLES,
                    completed_cycles: cycles,
                    record: { before: beforeRecord, after: afterRecord },
                    memory: { baseline_bytes: baseline.heap_bytes, final_bytes: final.heap_bytes, growth_ratio: growthRatio },
                    samples
                };
                return report.endurance;
            });
        }

        await check('canonical v2 invariants and clean diagnostics remain true', async () => {
            const state = await readAcceptanceState(page, project.id, fixture.ownerId);
            assert(state.timeline?.schema_version === 2, `schema_version:${state.timeline?.schema_version}`);
            assert(!JSON.stringify(state.timeline).includes('schema_version":1'), 'v1_payload_present');
            assert(state.canvas_count === 1, `canvas_count:${state.canvas_count}`);
            assert(state.authoritative_dom_count === 0, `authoritative_dom_count:${state.authoritative_dom_count}`);
            assert(!state.overlay_error, `overlay_error:${state.overlay_error}`);
            const finalEmptyBySection = state.timeline.sections.map((section) => (
                state.timeline.tracks.filter((track) => track.section_id === section.section_id && track.empty_slot).length
            ));
            assert(finalEmptyBySection.every((count) => count === 1), `empty_track_invariant:${finalEmptyBySection.join(',')}`);
            return { finalEmptyBySection, mounted_trees: state.mounted_trees };
        });

};
