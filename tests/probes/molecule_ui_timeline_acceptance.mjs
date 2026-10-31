import path from 'node:path';
import fs from 'node:fs';
import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, findBevyUiNodeTarget, playwrightPointForClientTarget, readBevyUiHit, recordCenter, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
const clickMenuTarget = clickCanvasTarget;
import { exerciseMixerLassoBlock, exerciseTimelineEditingGestures } from "./molecule_ui_timeline_gestures.mjs";

export const runMoleculeTimelineAcceptance = async ({ page, project, fixture, report, check, OUT_DIR, ENDURANCE_MS, ENDURANCE_MIN_CYCLES, cdp, projectViewNode, readAcceptanceState }) => {
        await check('real Mixage, output destination and Volume gestures update the canonical mix', async () => {
            // The Molecule's own Mix: selected in the List, its rail's Activity >
            // Mix enters it and shows its strips (the views present the timeline
            // of the level the user is in).
            const row = await page.evaluate(async (id) => ((await import('/eVe/domains/rendering/project_view_surface_runtime.js'))
                .readProjectViewSurfaceState().content?.entries || []).findIndex((entry) => entry.id === id), fixture.ownerId);
            assert(row >= 0, 'molecule_row_missing');
            const label = await page.evaluate(async index => (await import('/eVe/domains/rendering/project_view_surface_runtime.js'))
                .readProjectViewSurfaceState().content.entries[index].label, row);
            const ownerRow = await awaitBevyUiNodeTarget(page, { nodeId: `project_view_list_entry_${row}_name`,
                treeId: 'eve_bevy_ui_project_view', label });
            assert(ownerRow, 'molecule_row_not_projected');
            await clickCanvasTarget(page, ownerRow);
            const RAIL = 'eve_bevy_panel_atome_contextual_edit';
            const activity = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_molecule_activity', treeId: RAIL });
            assert(activity, 'molecule_activity_not_actionable');
            await clickMenuTarget(page, activity);
            await wait(500);
            const mix = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_molecule_activity_molecule_activity_mix', treeId: RAIL });
            assert(mix, 'molecule_mix_not_actionable');
            const mixHit = await readBevyUiHit(page, mix);
            assert(String(mixHit.nodeId || '').endsWith('molecule_activity_mix'),
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
            // OUT chooses a destination; the column's Volume is the canonical tool slider.
            const out = await awaitBevyUiNodeTarget(page, { nodePrefix: 'molecule_mix_strip_', treeId: 'eve_bevy_ui_project_view' });
            assert(out, 'molecule_mix_strip_not_actionable');
            const readMix = () => page.evaluate(async (owner) => {
                const state = await window.Atome.getStateCurrent(owner);
                return (state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline)?.mix || null;
            }, fixture.ownerId);
            const strips = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_surface_runtime.js'))
                .readProjectViewSurfaceState().content?.strips || []);
            const audio = strips.find((strip) => strip.lane === 'audio');
            assert(audio, `molecule_mix_audio_strip_missing:${JSON.stringify(strips)}`);
            const nodeId = `molecule_mix_strip_${audio.strip_id.replace(/[^a-z0-9_]/gi, '_')}`;
            const outTile = await awaitBevyUiNodeTarget(page, { nodeId: `${nodeId}_out`, treeId: 'eve_bevy_ui_project_view' });
            assert(outTile, 'molecule_mix_out_not_actionable');
            await clickCanvasTarget(page, outTile);
            const none = await awaitBevyUiNodeTarget(page, { nodeId: 'molecule_mix_picker_0', treeId: 'eve_bevy_ui_project_view' });
            assert(none, 'molecule_mix_destination_not_actionable');
            await clickCanvasTarget(page, none);
            const committed = await waitFor(page, async ({ owner, id }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const mix = (state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline)?.mix;
                return { ok: mix?.strips?.[id]?.output?.destination === null, output: mix?.strips?.[id]?.output };
            }, { owner: fixture.ownerId, id: audio.strip_id });
            // Restore the audible main output through the same picker before playback acceptance.
            await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodeId: `${nodeId}_out`, treeId: 'eve_bevy_ui_project_view' }));
            const main = await awaitBevyUiNodeTarget(page, { nodeId: 'molecule_mix_picker_1', treeId: 'eve_bevy_ui_project_view' });
            assert(main, 'molecule_mix_main_output_not_actionable');
            await clickCanvasTarget(page, main);
            await waitFor(page, async ({ owner, id }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                return { ok: timeline?.mix?.strips?.[id]?.output?.destination?.kind === 'main' };
            }, { owner: fixture.ownerId, id: audio.strip_id });
            const volumeIndex = (await readMix()).strips[audio.strip_id].chain.findIndex(module => module.type === 'volume');
            assert(volumeIndex >= 0, 'molecule_mix_volume_missing');
            const thumb = await awaitBevyUiNodeTarget(page, { nodeId: `${nodeId}_module_${volumeIndex}`, treeId: 'eve_bevy_ui_project_view' });
            assert(thumb, 'molecule_mix_volume_not_actionable');
            const point = await playwrightPointForClientTarget(page, thumb);
            await page.mouse.move(point.x, point.y); await page.mouse.down();
            await page.mouse.move(point.x, point.y + 60, { steps: 8 }); await page.mouse.up();
            const gainCommitted = await waitFor(page, async ({ owner, id }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const mix = (state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline)?.mix;
                const gain = mix?.strips?.[id]?.chain?.find((module) => module.type === 'volume')?.params?.gain_db;
                return { ok: Number.isFinite(gain) && gain !== 0, gain };
            }, { owner: fixture.ownerId, id: audio.strip_id });
            const projected = { mix_before: Boolean(await readMix()) };
            const lassoBlock = await exerciseMixerLassoBlock(page); const mixShot = path.join(OUT_DIR, 'mix_controls.png'); await page.screenshot({ path: mixShot, animations: 'disabled' }); report.screenshots.push(mixShot);
            return { projected, committed, gainCommitted, lassoBlock };
        });

        await check('real Multitrack and Timeline clicks show the Timeline tree: headers, lanes, clips, ruler, playhead', async () => {
            // Timeline, Cells and Mix are the rail's Multitrack tool (not the Vue palette).
            const RAIL = 'eve_bevy_panel_atome_contextual_edit';
            const multitrack = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_container_multitrack', treeId: RAIL });
            assert(multitrack, 'multitrack_not_actionable');
            await clickMenuTarget(page, multitrack);
            await wait(650);
            const timelineChoice = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_container_multitrack_multitrack_timeline', treeId: RAIL });
            assert(timelineChoice, 'multitrack_timeline_not_actionable');
            await clickMenuTarget(page, timelineChoice);
            return waitFor(page, async () => {
                const root = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_project_view')?.tree?.root;
                const ids = [];
                const visit = (node) => { if (!node) return; ids.push(String(node.id)); (node.children || []).forEach(visit); };
                visit(root);
                const projectView = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                return {
                    ok: ids.includes('project_view_timeline_playhead') && ids.includes('project_view_timeline_ruler')
                        && ids.some((id) => id.startsWith('project_view_timeline_header_'))
                        && ids.some((id) => id.startsWith('project_view_timeline_lane_'))
                        && ids.some((id) => id.startsWith('project_view_timeline_clip_')),
                    timeline_nodes: ids.filter((id) => id.startsWith('project_view_timeline_')).length,
                    project_view_mode: projectView.readProjectViewSurfaceState()?.mode || ''
                };
            });
        });

        await check('a real clip drag commits through the canonical timeline operation', async () => {
            const clipNode = `project_view_timeline_clip_${String(fixture.clipId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const clip = await findBevyUiNodeTarget(page, { nodeId: clipNode, treeId: 'eve_bevy_ui_project_view', step: 3 });
            assert(clip, `timeline_clip_not_actionable:${clipNode}`);
            const hit = await readBevyUiHit(page, clip);
            assert(String(hit.nodeId || '').startsWith(clipNode), `clip_hit_mismatch:${JSON.stringify({ clip, hit })}`);
            const before = await readAcceptanceState(page, project.id, fixture.ownerId);
            const previousStart = before.timeline.clips.find((entry) => entry.clip_id === fixture.clipId).timeline.start_frame;
            const pointer = await playwrightPointForClientTarget(page, clip);
            await page.mouse.move(pointer.x, pointer.y);
            await page.mouse.down();
            await page.mouse.move(pointer.x + 12, pointer.y);
            await page.mouse.move(pointer.x + 96, pointer.y, { steps: 11 });
            await page.mouse.up();
            const after = await waitFor(page, async ({ owner, clipId, previous }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const current = timeline?.clips?.find((entry) => entry.clip_id === clipId)?.timeline?.start_frame;
                return { ok: Number.isSafeInteger(current) && current !== previous, previous, current };
            }, { owner: fixture.ownerId, clipId: fixture.clipId, previous: previousStart });
            return { hit, after };
        });
        await check('a real crop of the selected clip keeps its source (non-destructive)', () => exerciseTimelineEditingGestures({ page, ownerId: fixture.ownerId, clipId: fixture.clipId }));
        const timelineShot = path.join(OUT_DIR, 'timeline_after_drag.png');
        await page.screenshot({ path: timelineShot, animations: 'disabled' });
        report.screenshots.push(timelineShot);
        if (ENDURANCE_MS > 0) {
            await check('the real Molecule UI remains stable through the configured playback and Record endurance', async () => {
                const openView = async mode => {
                    const rail = 'eve_bevy_panel_atome_contextual_edit';
                    const current = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_mode_state.js')).getProjectViewMode());
                    if (current === 'timeline') {
                        // A selected clip has its own rail. Its track header restores the level's view tools.
                        const header = await awaitBevyUiNodeTarget(page, { nodePrefix: 'project_view_timeline_header_', treeId: 'eve_bevy_ui_project_view' });
                        assert(header, 'endurance_track_header_missing');
                        await clickCanvasTarget(page, header);
                    }
                    if (mode === 'list') {
                        await clickMenuTarget(page, await visibleMenuTool(page, project.id, 'view'));
                        await clickMenuTarget(page, await visibleMenuTool(page, project.id, 'view_list'));
                    } else {
                        const multitrack = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_container_multitrack', treeId: rail });
                        assert(multitrack, 'endurance_multitrack_missing');
                        await clickCanvasTarget(page, multitrack);
                        const choice = await awaitBevyUiNodeTarget(page, {
                            nodeId: `atome_contextual_tool_container_multitrack_multitrack_${mode}`, treeId: rail
                        });
                        assert(choice, `endurance_view_choice_missing:${mode}`);
                        await clickCanvasTarget(page, choice);
                    }
                    await waitFor(page, async expected => ({ ok: (await import('/eVe/domains/rendering/project_view_mode_state.js')).getProjectViewMode() === expected }), mode);
                };
                const togglePlayback = async playing => {
                    const play = await awaitBevyUiNodeTarget(page, {
                        nodeId: 'atome_contextual_tool_container_play',
                        treeId: 'eve_bevy_panel_atome_contextual_edit'
                    });
                    assert(play, 'molecule_play_not_actionable');
                    await clickCanvasTarget(page, play);
                    return waitFor(page, async ({ owner, playing }) => {
                        const view = (await import('/eVe/domains/rendering/project_view_surface_runtime.js')).readProjectViewSurfaceState();
                        // Timeline plays its clock; List/Mix play the current
                        // level through the shared recursive project transport.
                        const transport = view.mode === 'timeline'
                            ? window.eveMoleculeTimelineApi.readGroupTimelineTransport({ group_id: owner })
                            : (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
                        return { ok: transport?.ok !== false && transport.playing === playing, transport,
                            view: { mode: view.mode, ownerId: view.content?.ownerId, playing: view.content?.playing } };
                    }, { owner: fixture.ownerId, playing }, 30000);
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
                const container = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_navigation.js')).currentContainerId());
                assert(container === fixture.ownerId, `endurance_wrong_molecule:${container}`);
                const beforeRecord = await readRuntimeSample();
                await togglePlayback(true);
                // Native/browser capture finalization is asynchronous. A wall-clock
                // sleep cannot prove both armed regions completed on a loaded host.
                await waitFor(page, async owner => {
                    const state = await window.Atome.getStateCurrent(owner);
                    const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                    const armed = timeline?.record_regions?.filter(region => region.armed === true) || [];
                    return { ok: armed.length === 0, armed, transport: timeline?.transport };
                }, fixture.ownerId, 60000);
                const stillPlaying = await page.evaluate(owner => window.eveMoleculeTimelineApi
                    .readGroupTimelineTransport({ group_id: owner })?.playing === true, fixture.ownerId);
                if (stillPlaying) await togglePlayback(false);
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
                const activities = ['list', 'mix', 'timeline'];
                let cycles = 0;
                while (Date.now() < deadline || cycles < ENDURANCE_MIN_CYCLES) {
                    await togglePlayback(true);
                    await wait(1800);
                    await togglePlayback(false);
                    await openView(activities[cycles % activities.length]);
                    await wait(350);
                    cycles += 1;
                    if (cycles % 10 === 0 || Date.now() >= deadline) {
                        const sample = await readRuntimeSample();
                        assert(sample.canvas_count === 1, `endurance_canvas_count:${sample.canvas_count}`);
                        assert(sample.authoritative_dom_count === 0, `endurance_authoritative_dom:${sample.authoritative_dom_count}`);
                        assert(!sample.overlay_error, `endurance_overlay_error:${sample.overlay_error}`);
                        samples.push(sample);
                        fs.writeFileSync(path.join(OUT_DIR, 'endurance_progress.json'), JSON.stringify({
                            status: 'running', requested_ms: ENDURANCE_MS, elapsed_ms: Date.now() - startedAt,
                            completed_cycles: cycles, record: { before: beforeRecord, after: afterRecord }, samples
                        }, null, 2));
                        console.log(`  endurance ${cycles} cycles, ${Math.round((Date.now() - startedAt) / 1000)}s`);
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
