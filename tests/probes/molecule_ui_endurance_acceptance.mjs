import fs from 'node:fs';
import path from 'node:path';
import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, visibleMenuTool, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
const clickMenuTarget = clickCanvasTarget;

export const runMoleculeEnduranceAcceptance = async ({ page, project, fixture, report, check, OUT_DIR, ENDURANCE_MS, ENDURANCE_MIN_CYCLES, cdp }) => {
    if (ENDURANCE_MS > 0) {
        await page.evaluate(() => {
            const trace = [];
            window.__moleculeEnduranceTrace = trace;
            const remember = event => {
                const hit = event.type.startsWith('pointer') ? window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
                    surface: document.getElementById('eve_surface_project'), clientX: event.clientX, clientY: event.clientY
                }) : null;
                trace.push({ at: performance.now(), event: event.type,
                    node: hit?.nodeId, tree: hit?.treeId,
                    projectId: window.__currentProject?.id, detail: event.type.startsWith('pointer') ? undefined : event.detail });
                if (trace.length > 128) trace.shift();
            };
            for (const type of ['pointerdown', 'pointerup', 'eve:project-view-mode-changed']) window.addEventListener(type, remember, true);
        });
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
                await waitFor(page, async expected => {
                    const actual = (await import('/eVe/domains/rendering/project_view_mode_state.js')).getProjectViewMode();
                    const surface = (await import('/eVe/domains/rendering/project_view_surface_runtime.js')).readProjectViewSurfaceState();
                    return { ok: actual === expected, actual, expected, surfaceMode: surface.mode, projectId: surface.projectId };
                }, mode);
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
            const readRuntimeSample = async () => {
                const sample = await page.evaluate(async ({ pid, owner }) => {
                const ownerState = await window.Atome.getStateCurrent(owner);
                const timeline = ownerState?.molecule_timeline
                    || ownerState?.props?.molecule_timeline
                    || ownerState?.properties?.molecule_timeline;
                const overlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || {};
                const renderer = await (await import('/eVe/domains/rendering/bevy_web_renderer_module_loader.js')).ensureBevyModule();
                const wasm = await renderer.default();
                // Playback above already initialized this canonical audio module.
                const audio = await import('/wasm/squirrel_audio_wasm.js');
                const audioWasm = audio.initSync();
                return {
                    at: Date.now(),
                    mode: (await import('/eVe/domains/rendering/project_view_mode_state.js')).getProjectViewMode(),
                    heap_bytes: Number(performance.memory?.usedJSHeapSize || 0),
                    wasm_capacity_bytes: wasm.memory.buffer.byteLength,
                    audio_wasm_capacity_bytes: audioWasm.memory.buffer.byteLength,
                    audio_sessions: [...(window.Molecule?.engine?.sessions || [])].map(([id, session]) => ({
                        id, clips: session.runtimeClips.size,
                        loaded: [...session.runtimeClips.values()].filter(clip => clip.audioAvailable).length,
                        owned: [...session.runtimeClips.values()].filter(clip => clip.audioAvailable && clip.ownsAudioAsset).length
                    })),
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
                return { ...sample, cdp_heap: await cdp.send('Runtime.getHeapUsage') };
            };

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

            // Compare the same stopped, unselected view at both memory boundaries.
            await openView('timeline');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await cdp.send('HeapProfiler.collectGarbage'); const cold = await readRuntimeSample();
            // Timeline and the project-level List/Mix transport load different
            // audio assets lazily. Exercise every measured path once before
            // measuring retention, and keep that first-use cost as evidence.
            const activities = ['list', 'mix', 'timeline'];
            const warmup = [];
            for (const mode of activities) {
                await togglePlayback(true);
                await wait(1800);
                await togglePlayback(false);
                await openView(mode);
                await wait(350);
                warmup.push(await readRuntimeSample());
            }
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await cdp.send('HeapProfiler.collectGarbage'); const baseline = await readRuntimeSample();
            fs.writeFileSync(path.join(OUT_DIR, 'endurance_first_use.json'), JSON.stringify({ cold, warmup, baseline }, null, 2));
            const sampleAllocations = process.env.MOLECULE_UI_SAMPLE_ALLOCATIONS === '1';
            if (sampleAllocations) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
            const startedAt = Date.now();
            const deadline = startedAt + ENDURANCE_MS;
            const samples = [baseline];
            let cycles = 0;
            while (Date.now() < deadline || cycles < ENDURANCE_MIN_CYCLES) {
                await togglePlayback(true);
                await wait(1800);
                await togglePlayback(false);
                await openView(activities[cycles % activities.length]);
                await wait(350);
                cycles += 1;
                if (process.env.MOLECULE_UI_SAMPLE_EVERY_CYCLE === '1' || cycles % 10 === 0 || Date.now() >= deadline) {
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
            await openView('timeline');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await cdp.send('HeapProfiler.collectGarbage');
            const final = await readRuntimeSample();
            const growthRatio = baseline.heap_bytes > 0
                ? Math.max(0, (final.heap_bytes - baseline.heap_bytes) / baseline.heap_bytes)
                : 0;
            if (sampleAllocations) fs.writeFileSync(path.join(OUT_DIR, 'retained_allocations.json'),
                JSON.stringify(await cdp.send('HeapProfiler.stopSampling')));
            report.endurance = {
                requested_ms: ENDURANCE_MS,
                elapsed_ms: Date.now() - startedAt,
                minimum_cycles: ENDURANCE_MIN_CYCLES,
                completed_cycles: cycles,
                record: { before: beforeRecord, after: afterRecord },
                first_use: { cold, warmup, baseline },
                memory: { baseline_bytes: baseline.heap_bytes, final_bytes: final.heap_bytes, growth_ratio: growthRatio },
                final_sample: final,
                samples
            };
            fs.writeFileSync(path.join(OUT_DIR, 'endurance_memory.json'), JSON.stringify(report.endurance, null, 2));
            assert(growthRatio <= 0.05, `endurance_heap_growth:${growthRatio}`);
            assert(report.console_errors.length === 0, report.console_errors.slice(0, 3).join(' | '));
            assert(report.page_errors.length === 0, report.page_errors.slice(0, 3).join(' | '));
            return report.endurance;
        });
    }

};
