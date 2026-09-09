import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, diffPngRegion, recordCenter, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runProjectPerformanceHoldAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const view = process.env.MOLECULE_UI_PERFORMANCE_VIEW || 'list';
    const project = await ensureProject(page, `Performance hold ${view} ${Date.now()}`);
    assert(project?.id, 'performance_project_required');
    const media = process.env.MOLECULE_UI_PERFORMANCE_MEDIA === '1';
    const audio = process.env.MOLECULE_UI_PERFORMANCE_AUDIO === '1';
    const ids = await page.evaluate(async ({ projectId, media, audio }) => {
        const ids = [];
        for (const [index, text] of ['Hold first', 'Hold second'].entries()) {
            const kind = index === 0 && (media || audio) ? audio ? 'audio' : 'video' : 'text';
            const result = await window.eveToolBase.createAtome({ type: kind, kind, text,
                name: text, duration: index + 2, hierarchy_order: index,
                left: 180 + index * 350, top: 180, width: 300, height: 180, color: '#ffffff', projectId, parentId: projectId
            }, { render: false });
            if (kind === 'video') await window.Atome.commit({ kind: 'set', atome_id: result.id, project_id: projectId,
                props: { media_url: '/atome/src/assets/videos/video_missing.mp4', media_kind: 'video', has_audio: false,
                    duration: 4.891833, duration_seconds: 4.891833, duration_sec: 4.891833, media_duration: 4.891833, loop: false } });
            if (kind === 'audio') await window.Atome.commit({ kind: 'set', atome_id: result.id, project_id: projectId,
                props: { media_url: '/atome/src/assets/audios/riff.m4a', media_kind: 'audio', playback_rate: 1,
                    duration: 24.636372, duration_seconds: 24.636372, duration_sec: 24.636372, media_duration: 24.636372 } });
            ids.push(result.id);
        }
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
        return ids;
    }, { projectId: project.id, media, audio });
    await switchView(page, project.id, view);
    const node = async (nodeId, treeId = 'eve_bevy_ui_project_view') => {
        const target = await awaitBevyUiNodeTarget(page, { nodeId, treeId });
        assert(target, `performance_target_missing:${nodeId}`);
        return target;
    };
    const tool = (key) => node(`atome_contextual_tool_${key}`, 'eve_bevy_panel_atome_contextual_edit');
    const row = async (id) => {
        if (view === 'natural') return recordCenter(page, project.id, (record) => record.id === id, { sceneCoordinates: true });
        const index = (await structuredRows(page)).find((entry) => entry.id === id)?.index;
        assert(Number.isInteger(index), `performance_row_missing:${id}`);
        return node(view === 'list' ? `project_view_list_entry_${index}_name` : `project_view_matrix_tile_${index}`);
    };
    const snapshot = () => page.evaluate(async () => {
        const [{ projectViewInteractionRecorder }, { projectViewPlayback }, { projectViewTransport }] = await Promise.all([
            import('/eVe/domains/rendering/project_view_interaction_recorder.js'),
            import('/eVe/domains/rendering/project_view_playback_runtime.js'),
            import('/eVe/domains/rendering/project_view_transport_runtime.js')
        ]);
        return { recorder: projectViewInteractionRecorder.readState(), playback: projectViewPlayback.readState(), transport: projectViewTransport.read() };
    });
    await check(`${view} Performance records initial wait and holds beyond nominal duration`, async () => {
        await clickCanvasTarget(page, view === 'natural' ? await row(ids[1]) : await node('project_view_footer'));
        await clickCanvasTarget(page, await tool('container_record'));
        await wait(1000);
        const armed = await snapshot();
        assert(armed.recorder.recording && armed.recorder.event_count === 0
            && !armed.playback.playing && !armed.transport.playing, `performance_arm_started_content:${JSON.stringify(armed)}`);
        await screenshot({ page, report, outDir, name: `performance_${view}_armed` });
        await clickCanvasTarget(page, await row(ids[0]));
        let endpointShot;
        if (media) {
            await wait(6000);
            endpointShot = await screenshot({ page, report, outDir, name: `performance_${view}_video_endpoint` });
            await wait(4000);
        } else await wait(audio ? 27000 : 10000);
        const held = await snapshot();
        report.performanceDuringHold = held;
        assert(held.recorder.recording && held.playback.playingIds.includes(ids[0]), `performance_early_release:${JSON.stringify(held)}`);
        if (audio) {
            const ended = await page.evaluate(async (id) => {
                const { readSelectedProjectMediaPlaybackState } = await import('/eVe/domains/media/selected_project_media_playback_runtime.js');
                return readSelectedProjectMediaPlaybackState([id]);
            }, ids[0]);
            report.performanceAudioEnd = ended;
            assert(ended.anyPlaying === false, 'performance_audio_restarted_while_held:' + JSON.stringify(ended));
        }
        const heldShot = await screenshot({ page, report, outDir, name: `performance_${view}_held_ten_seconds` });
        if (media) {
            const status = await page.evaluate(() => [...document.querySelectorAll('video')]
                .filter(video => String(video.currentSrc || video.src).includes('video_missing.mp4'))
                .map(video => ({ time: video.currentTime, duration: video.duration, paused: video.paused, ended: video.ended })));
            assert(status.some(video => video.time >= 4.8 && video.paused), 'performance_video_endpoint_not_held:' + JSON.stringify(status));
            const preview = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: 'project_view_visual_preview' });
            const scale = heldShot.signal.width / page.viewportSize().width;
            const region = Object.fromEntries(Object.entries(preview.hit.box).map(([key, value]) => [key, value * scale]));
            const difference = diffPngRegion(endpointShot.file, heldShot.file, region);
            report.performanceMediaEnd = { status, difference };
            assert(difference.differing_pixel_ratio < 0.01, 'performance_video_held_frame_changed:' + JSON.stringify(difference));
        }
        await clickCanvasTarget(page, await row(ids[1]));
        await wait(2000);
        report.performanceStopTarget = await tool('container_record');
        report.performanceBeforeStop = await snapshot();
        await clickCanvasTarget(page, report.performanceStopTarget);
        await screenshot({ page, report, outDir, name: `performance_${view}_stop_clicked` });
        await wait(500);
        report.performanceAfterStop = await page.evaluate(async (id) => {
            const { projectViewInteractionRecorder } = await import('/eVe/domains/rendering/project_view_interaction_recorder.js');
            const api = window.eveMoleculeTimelineApi;
            const { getAtomeContextualEditApi } = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
            let timeline;
            try { timeline = api?.readGroupTimeline?.({ group_id: id }); } catch (error) { timeline = { error: error.message }; }
            return { contextual: getAtomeContextualEditApi()?.readState?.(), recorder: projectViewInteractionRecorder.readState(), api: !!api,
                open: typeof api?.openGroupTimeline, batch: typeof api?.applyGroupTimelineBatch,
                timeline,
                record: await window.Atome.getStateCurrent(id) };
        }, project.id);
        const persisted = await waitFor(page, async (id) => {
            const record = await window.Atome.getStateCurrent(id);
            const props = record?.properties || record?.props || record || {};
            return { ok: props.playback_mode === 'performance' && props.molecule_timeline?.clips?.length > 0, props };
        }, project.id);
        const clips = persisted.props.molecule_timeline.clips;
        assert(clips.length === 2, `performance_duplicate_gesture:${JSON.stringify(clips)}`);
        const first = clips.find((clip) => clip.source?.atome_id === ids[0]);
        const second = clips.find((clip) => clip.source?.atome_id === ids[1]);
        assert(first && second, `performance_clips_missing:${JSON.stringify(clips)}`);
        assert(first.timeline.start_seconds >= 0.9 && first.timeline.duration_seconds >= (audio ? 27 : 10)
            && first.timeline.duration_seconds < (audio ? 30 : 13) && second.timeline.duration_seconds >= 2
            && second.timeline.duration_seconds < 5, `performance_hold_durations:${JSON.stringify(clips)}`);
        report.performanceHold = { view, projectId: project.id, ids, armed, held, clips };
        await screenshot({ page, report, outDir, name: `performance_${view}_stopped` });
        await reloadProjection(page, project.id);
        if (view === 'natural') {
            await switchView(page, project.id, 'list');
            report.performanceReplayView = 'list';
        }
        await clickCanvasTarget(page, await node('project_view_footer'));
        await clickCanvasTarget(page, await tool('container_play'));
        await waitFor(page, async (firstId) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const state = projectViewTransport.read();
            return { ok: state.playing && state.activeLeafIds?.includes(firstId), state };
        }, ids[0]);
        await wait(media ? 6000 : 3500);
        const replay = await snapshot();
        assert(replay.transport.playing && replay.transport.activeLeafIds?.includes(ids[0]), `performance_replay_clamped:${JSON.stringify(replay)}`);
        await screenshot({ page, report, outDir, name: `performance_${view}_replay_held` });
        if (media) {
            const decoders = await page.evaluate(() => [...document.querySelectorAll('video')]
                .filter(video => String(video.currentSrc || video.src).includes('video_missing.mp4'))
                .map(video => ({ time: video.currentTime, duration: video.duration, paused: video.paused })));
            assert(decoders.some(video => video.time >= 4.8 && video.paused), 'performance_replay_endpoint_not_held:' + JSON.stringify(decoders));
            report.performanceReplayMediaEnd = decoders;
        }
        await waitFor(page, async (secondId) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const state = projectViewTransport.read();
            return { ok: state.activeLeafIds?.includes(secondId), state };
        }, ids[1]);
        await waitFor(page, async () => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const state = projectViewTransport.read();
            return { ok: !state.playing, state };
        });
    });
};
