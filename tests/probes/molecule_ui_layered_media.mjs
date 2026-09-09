import path from 'node:path';

import { assert, diffPng, diffPngRegion, recordCenter, wait, waitFor } from "./molecule_ui_acceptance_support.mjs";
import { drag, screenshot, switchView } from "./molecule_ui_drop_core.mjs";
import { expandCanonicalListMolecule, selectListRow, startMoleculePlayback, waitForContextualTarget, waitForPlaybackEnd } from "./molecule_ui_drop_playback_support.mjs";


import { FIXTURES, writeToneWav, importThroughMenu, createTextThroughMenu, reloadBrowserProject } from "./molecule_ui_media_fixture.mjs";
import { readMolecule, assertMembership, absorbMember, absorbListMember, extractionSnapshot, enterListMolecule, enterMatrixMolecule, reorderListMemberToFront, verifyReorderedMemberAfterReload, extractListMember } from "./molecule_ui_hierarchy_gestures.mjs";
import { openMolecule, transportProof, stopMolecule, playStandaloneVideo, assertDepthTransportContinuity, summarizeTransportProof, applyDepth, windowState } from "./molecule_ui_media_playback_evidence.mjs";

export const expectedTimelineDuration = (timeline) => {
    const sampleRate = Math.max(1, Number(timeline?.timebase?.sample_rate || 48000));
    return Math.max(0, ...(timeline?.clips || []).map((clip) => (
        (Number(clip?.timeline?.start_frame || 0) + Number(clip?.timeline?.duration_frames || 0)) / sampleRate
    )));
};

export const assertNaturalClipTiming = (snapshot, memberIds) => {
    const timeline = snapshot.timeline || {};
    const sampleRate = Math.max(1, Number(timeline.timebase?.sample_rate || 48000));
    assert(Number(timeline.transport?.rate ?? 1) === 1, `molecule_transport_rate_changed:${timeline.transport?.rate}`);
    assert(timeline.transport?.loop?.enabled !== true, 'molecule_transport_loop_enabled_implicitly');
    const statesById = new Map(memberIds.map((id, index) => [id, snapshot.states[index]]));
    const mediaTiming = [];
    for (const clip of timeline.clips || []) {
        assert(clip.stretch == null || clip.stretch.enabled !== true,
            `molecule_clip_stretched_implicitly:${clip.clip_id}`);
        assert(clip.block_loop?.enabled !== true, `molecule_clip_looped_implicitly:${clip.clip_id}`);
        const sourceId = String(clip.source?.atome_id || '');
        const state = statesById.get(sourceId);
        const props = state?.properties || state?.props || state || {};
        const kind = String(props.kind || props.media_kind || state?.type || '').toLowerCase();
        const sourceDuration = Number(props.duration_seconds ?? props.duration_sec
            ?? props.media_duration ?? props.duration);
        const clipDuration = Number(clip.timeline?.duration_frames || 0) / sampleRate;
        const sourceIn = Number(clip.timeline?.source_in_frames ?? clip.timeline?.source_in_frame ?? 0) / sampleRate;
        const sourceOut = Number(clip.timeline?.source_out_frames ?? clip.timeline?.source_out_frame ?? 0) / sampleRate;
        if ((kind.includes('audio') || kind.includes('sound') || kind.includes('video'))
            && Number.isFinite(sourceDuration) && sourceDuration > 0) {
            assert(Math.abs(clipDuration - sourceDuration) <= (1 / sampleRate) + 0.00001,
                `molecule_media_duration_changed:${sourceId}:${sourceDuration}:${clipDuration}`);
            assert(Math.abs(sourceIn) <= 1 / sampleRate,
                `molecule_media_cropped_at_start:${sourceId}:${sourceIn}`);
            assert(Math.abs(sourceOut - sourceDuration) <= (1 / sampleRate) + 0.00001,
                `molecule_media_cropped_at_end:${sourceId}:${sourceDuration}:${sourceOut}`);
        }
        mediaTiming.push({ sourceId, kind, sourceDuration, clipDuration, sourceIn, sourceOut });
    }
    return mediaTiming;
};

export const runColdImageAudioAcceptance = async ({ page, report, ensureProject, outDir }) => {
    // This is deliberately the first playback in the focused acceptance run.
    // Each repeat launches a new Chromium context, so Kira has no prior unlock.
    const coldPage = page;
        const project = await ensureProject(coldPage, `Molecule Cold PNG Audio ${Date.now()}`);
        assert(project?.ok && project.id, `cold_project_create_failed:${JSON.stringify(project)}`);
        await coldPage.evaluate(async (projectId) => {
            await window.eveDashboardBevyUiRuntime?.destroy?.();
            const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
            workspace.markProjectWorkspaceMode?.(projectId);
        }, project.id);
        await waitFor(coldPage, (projectId) => {
            const surface = document.getElementById('eve_surface_project');
            const rect = surface?.getBoundingClientRect?.();
            return {
                ok: window.__currentProject?.id === projectId
                    && window.__eveWorkspaceMode?.mode === 'project'
                    && window.__eveWorkspaceMode?.projectId === projectId
                    && window.eveDashboardBevyUiRuntime?.state?.active !== true
                    && Number(rect?.width || 0) > 0 && Number(rect?.height || 0) > 0,
                currentProjectId: window.__currentProject?.id || '',
                workspaceMode: window.__eveWorkspaceMode || null,
                dashboardActive: window.eveDashboardBevyUiRuntime?.state?.active === true,
                rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
            };
        }, project.id, 45000);
        await switchView(coldPage, project.id, 'natural');
        const imageId = await importThroughMenu({
            page: coldPage, projectId: project.id, filePath: FIXTURES.image, expectedKind: 'image'
        });
        const audioId = await importThroughMenu({
            page: coldPage, projectId: project.id, filePath: FIXTURES.audio, expectedKind: 'audio'
        });
        await absorbListMember({
            page: coldPage, project, sourceId: audioId, targetId: imageId,
            report, outDir, shotName: 'cold_png_audio_armed'
        });
        const members = [imageId, audioId];
        let snapshot = await readMolecule(coldPage, members);
        assertMembership(snapshot, members);
        const moleculeId = snapshot.moleculeId;
        await reloadBrowserProject(coldPage, project);
        snapshot = await readMolecule(coldPage, members);
        assertMembership(snapshot, members, moleculeId);
        const naturalTiming = assertNaturalClipTiming(snapshot, members);
        await switchView(coldPage, project.id, 'list');
        const directRows = await expandCanonicalListMolecule(coldPage, members);
        assert(directRows.filter((row) => row.depth === 1 && members.includes(row.id)).length === 2,
            `cold_direct_member_count:${JSON.stringify(directRows)}`);
        await switchView(coldPage, project.id, 'natural');
        await openMolecule(coldPage, project.id, imageId, moleculeId);
        await startMoleculePlayback(coldPage, moleculeId, members);
        await wait(900);
        const started = await transportProof(coldPage, moleculeId, project.id);
        assert(started.voices.length === 1 && started.voices[0].active === true && Number(started.voices[0].gain) > 0,
            `cold_png_audio_voice_missing:${JSON.stringify(started)}`);
        assert(started.runtime.filter((clip) => clip.kind === 'audio').every((clip) => !clip.audioLoadError && clip.voiceId),
            `cold_png_audio_load_failed:${JSON.stringify(started.runtime)}`);
        const expectedDuration = expectedTimelineDuration(snapshot.timeline);
        assert(Math.abs(Number(started.transport?.duration || 0) - expectedDuration) <= 0.05,
            `cold_png_audio_duration:${JSON.stringify({ expectedDuration, transport: started.transport })}`);
        await screenshot({ page: coldPage, report, outDir, name: 'cold_png_audio_playing' });
        await stopMolecule(coldPage);
        const stopped = await transportProof(coldPage, moleculeId, project.id);
        assert(stopped.voices.length === 0 && stopped.transport?.playing !== true,
            `cold_png_audio_stop_leak:${JSON.stringify(stopped)}`);

        await startMoleculePlayback(coldPage, moleculeId, members);
        const naturalEnd = await waitForPlaybackEnd(coldPage, 35000);
        const ended = await transportProof(coldPage, moleculeId, project.id);
        assert(ended.voices.length === 0 && ended.transport?.playing !== true,
            `cold_png_audio_end_leak:${JSON.stringify({ naturalEnd, ended })}`);

        const firstExtraction = await extractListMember({
            page: coldPage, project, moleculeId, memberId: imageId,
            report, outDir, shotName: 'cold_extract_first_member'
        });
        let extraction = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: imageId });
        assert(extraction.ownerAlive && extraction.timeline?.clips?.length === 1
            && !extraction.timeline.clips.some((clip) => String(clip.source?.atome_id || '') === imageId)
            && extraction.projectedMemberCount === 1,
        `cold_first_extraction_invalid:${JSON.stringify(extraction)}`);
        await reloadBrowserProject(coldPage, project);
        extraction = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: imageId });
        assert(extraction.ownerAlive && extraction.timeline?.clips?.length === 1 && extraction.projectedMemberCount === 1,
            `cold_first_extraction_reload_invalid:${JSON.stringify(extraction)}`);

        const lastExtraction = await extractListMember({
            page: coldPage, project, moleculeId, memberId: audioId,
            report, outDir, shotName: ''
        });
        await reloadBrowserProject(coldPage, project);
        const empty = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: audioId });
        assert(!empty.ownerAlive && empty.projectedOwnerCount === 0 && empty.projectedMemberCount === 1
            && empty.timelineSessionOpen === false,
            `cold_last_extraction_owner_not_removed:${JSON.stringify(empty)}`);
        return {
            project, moleculeId, members,
            started: summarizeTransportProof(started), stopped: summarizeTransportProof(stopped),
            ended: summarizeTransportProof(ended), expectedDuration,
            directRows, naturalTiming, firstExtraction, lastExtraction, empty
        };
};

export const runLayeredMediaMoleculeAcceptance = async ({ page, report, ensureProject, outDir }) => {
    writeToneWav(FIXTURES.secondAudio);
    const coldImageAudio = process.env.MOLECULE_UI_SKIP_COLD === '1'
        ? null
        : await runColdImageAudioAcceptance({ page, report, ensureProject, outDir });
    if (process.env.MOLECULE_UI_COLD_ONLY === '1') return { coldImageAudio, coldOnly: true };
    const project = await ensureProject(page, `Molecule Layered Media ${Date.now()}`);
    assert(project?.ok && project.id, `layered_project_create_failed:${JSON.stringify(project)}`);
    await switchView(page, project.id, 'natural');

    const videoId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.video, expectedKind: 'video' });
    const standaloneVideo = process.env.MOLECULE_UI_LAYERED_SKIP_STANDALONE === '1'
        ? null
        : await playStandaloneVideo({ page, projectId: project.id, videoId, report, outDir });
    if (!standaloneVideo) {
        await switchView(page, project.id, 'list');
        await selectListRow(page, videoId);
        await switchView(page, project.id, 'natural');
        await waitForContextualTarget(page, videoId);
    }
    if (process.env.MOLECULE_UI_LAYERED_STANDALONE_ONLY === '1') {
        return { project, videoId, standaloneVideo, standaloneOnly: true };
    }
    const audioId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.audio, expectedKind: 'audio' });
    await absorbMember({ page, project, sourceId: audioId, targetId: videoId, report, outDir, shotName: 'layered_initial_armed' });
    let members = [videoId, audioId];
    let snapshot = await readMolecule(page, members);
    const moleculeId = snapshot.moleculeId;
    assertMembership(snapshot, members);
    await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    const videoReady = await waitFor(page, async (id) => {
        const decode = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = decode.getBevyVideoDecodeStatus(id);
        return {
            ok: status.exists === true && status.active === true && status.paused === false
                && status.readyState >= 2 && status.frameVersion > 0
                && Number(status.playbackRate) === 1,
            status
        };
    }, videoId, 15000);
    const initialMix = await transportProof(page, moleculeId, project.id);
    assert(initialMix.voices.length === 2, `layered_initial_voice_count:${JSON.stringify(initialMix)}`);
    assert(initialMix.voices.every((voice) => voice.active === true && Number(voice.gain) > 0),
        `layered_initial_voice_inactive:${JSON.stringify(initialMix.voices)}`);
    assert(initialMix.runtime.filter((clip) => clip.kind === 'video').every((clip) => clip.videoMuted === true),
        `layered_video_decoder_not_muted:${JSON.stringify(initialMix.runtime)}`);
    await screenshot({ page, report, outDir, name: 'layered_initial_mix_a' });
    await waitFor(page, async ({ id, version, time }) => {
        const decode = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = decode.getBevyVideoDecodeStatus(id);
        return {
            ok: status.exists === true && status.active === true
                && status.frameVersion > version && status.currentTime > time,
            status, version, time
        };
    }, {
        id: videoId,
        version: Number(videoReady.status.frameVersion || 0),
        time: Number(videoReady.status.currentTime || 0)
    }, 8000);
    await screenshot({ page, report, outDir, name: 'layered_initial_mix_b' });
    const videoDiff = diffPng(path.join(outDir, 'layered_initial_mix_a.png'), path.join(outDir, 'layered_initial_mix_b.png'));
    assert(videoDiff.differing_pixel_ratio > 0.001,
        `layered_video_frames_static:${JSON.stringify({ videoDiff, initialMix })}`);
    if (process.env.MOLECULE_UI_LAYERED_TRANSITION_ONLY === '1') {
        await enterListMolecule(page, project.id, moleculeId);
        await enterMatrixMolecule(page, project.id, moleculeId, members.length);
        await switchView(page, project.id, 'natural');
        const afterModes = await transportProof(page, moleculeId, project.id);
        assertDepthTransportContinuity(initialMix, [afterModes]);
        if (afterModes.transport?.playing === true) await stopMolecule(page);
        const stoppedAfterModes = await transportProof(page, moleculeId, project.id);
        assert(stoppedAfterModes.voices.length === 0 && stoppedAfterModes.transport?.playing !== true,
            `layered_transition_stop_leak:${JSON.stringify(stoppedAfterModes)}`);
        return {
            project, moleculeId, members, standaloneVideo,
            initialMix: summarizeTransportProof(initialMix),
            afterModes: summarizeTransportProof(afterModes),
            stoppedAfterModes: summarizeTransportProof(stoppedAfterModes), videoDiff,
            transitionOnly: true
        };
    }
    await stopMolecule(page);
    const stoppedInitial = await transportProof(page, moleculeId, project.id);
    assert(stoppedInitial.voices.length === 0 && stoppedInitial.transport?.playing !== true,
        `layered_initial_stop_leak:${JSON.stringify(stoppedInitial)}`);
    if (process.env.MOLECULE_UI_LAYERED_INITIAL_ONLY === '1') {
        return {
            project, moleculeId, members, standaloneVideo,
            initialMix: summarizeTransportProof(initialMix),
            stoppedInitial: summarizeTransportProof(stoppedInitial), videoDiff,
            videoPlaybackEvents: initialMix.videoPlaybackEvents
        };
    }

    const textId = await createTextThroughMenu({ page, projectId: project.id, value: 'TEXTE DEVANT', point: { x: 900, y: 180 } });
    await absorbMember({
        page, project, sourceId: textId, targetId: videoId, report, outDir,
        shotName: 'layered_text_armed', destinationOffset: { y: -55 }
    });
    members.push(textId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);
    const firstTextState = await windowState(page, project.id, videoId, textId);
    assert(firstTextState.stack.text.position > firstTextState.stack.video.position,
        `layered_first_text_not_above_video:${JSON.stringify(firstTextState)}`);
    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const firstTextMix = await transportProof(page, moleculeId, project.id);
    assert(firstTextMix.voices.length === 2 && firstTextMix.voices.every((voice) => voice.active === true),
        `layered_first_text_mix:${JSON.stringify(firstTextMix)}`);
    await screenshot({ page, report, outDir, name: 'layered_first_text_mix' });
    await stopMolecule(page);

    const textTwoId = await createTextThroughMenu({ page, projectId: project.id, value: 'CALQUE 2', point: { x: 900, y: 360 } });
    await absorbMember({
        page, project, sourceId: textTwoId, targetId: videoId, report, outDir,
        shotName: 'layered_text_two_armed', destinationOffset: { y: 55 }
    });
    members.push(textTwoId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    const imageId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.image, expectedKind: 'image' });
    await absorbMember({
        page, project, sourceId: imageId, targetId: videoId, report, outDir,
        shotName: 'layered_image_armed', destinationOffset: { y: 70 }
    });
    members.push(imageId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    const audioTwoId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.secondAudio, expectedKind: 'audio' });
    await absorbMember({ page, project, sourceId: audioTwoId, targetId: videoId, report, outDir, shotName: 'layered_audio_two_armed' });
    members.push(audioTwoId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const finalMix = await transportProof(page, moleculeId, project.id);
    assert(finalMix.voices.length === 3, `layered_final_voice_count:${JSON.stringify(finalMix)}`);
    assert(finalMix.voices.every((voice) => voice.active === true && Number(voice.gain) > 0),
        `layered_final_voice_inactive:${JSON.stringify(finalMix.voices)}`);
    await screenshot({ page, report, outDir, name: 'layered_final_mix' });

    const structuralTransportSamples = [];
    const extracted = await extractListMember({
        page, project, moleculeId, memberId: textTwoId,
        report, outDir, shotName: ''
    });
    const extractedState = await extractionSnapshot(page, {
        projectId: project.id, moleculeId, memberId: textTwoId
    });
    assert(extractedState.ownerAlive && extractedState.memberParent !== moleculeId
        && extractedState.timeline?.clips?.length === members.length - 1
        && !extractedState.timeline.clips.some((clip) => String(clip.source?.atome_id || '') === textTwoId),
    `layered_middle_extraction_invalid:${JSON.stringify(extractedState)}`);
    structuralTransportSamples.push(await transportProof(page, moleculeId, project.id));
    await absorbListMember({
        page, project, sourceId: textTwoId, targetId: moleculeId, report, outDir,
        shotName: 'layered_reabsorb_middle_member', expectedParentId: moleculeId
    });
    const reabsorbed = await readMolecule(page, members);
    assertMembership(reabsorbed, members, moleculeId);
    structuralTransportSamples.push(await transportProof(page, moleculeId, project.id));
    assertDepthTransportContinuity(finalMix, structuralTransportSamples);

    // Reading-order drag persists across List/Matrix while preserving the
    // Natural visual stack and the running transport. Depth has separate tools.
    const hierarchyReorder = await reorderListMemberToFront({
        page, project, moleculeId, memberId: videoId, memberIds: members, report, outDir
    });
    const hierarchyTransportSamples = [await transportProof(page, moleculeId, project.id)];
    assertDepthTransportContinuity(finalMix, hierarchyTransportSamples);
    if (hierarchyTransportSamples.at(-1)?.transport?.playing === true) await stopMolecule(page);
    await reloadBrowserProject(page, project);
    const hierarchyAfterReload = await verifyReorderedMemberAfterReload({
        page, project, moleculeId, memberId: videoId, memberIds: members,
        txId: hierarchyReorder.persisted.txId, beforeDepth: hierarchyReorder.beforeDepth
    });
    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const depthBaseline = await transportProof(page, moleculeId, project.id);
    assert(depthBaseline.voices.length === 3 && depthBaseline.voices.every((voice) => voice.active === true),
        `layered_depth_restart_mix_invalid:${JSON.stringify(depthBaseline)}`);

    // Later image/audio additions also have a visual projection. Put the text
    // explicitly at the top first so the following two commands isolate the
    // requested video-versus-text depth contract.
    await applyDepth({ page, projectId: project.id, memberId: textId, action: 'front' });
    const depthTransportSamples = [await transportProof(page, moleculeId, project.id)];
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'front' });
    depthTransportSamples.push(await transportProof(page, moleculeId, project.id));
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'back' });
    depthTransportSamples.push(await transportProof(page, moleculeId, project.id));
    assertDepthTransportContinuity(depthBaseline, depthTransportSamples);
    const activeAfterDepth = depthTransportSamples.at(-1)?.transport?.playing === true;
    if (activeAfterDepth) await stopMolecule(page);

    await screenshot({ page, report, outDir, name: 'layered_text_top' });
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'front' });
    await screenshot({ page, report, outDir, name: 'layered_video_front' });
    const frontState = await windowState(page, project.id, videoId, textId);
    const textTarget = await recordCenter(page, project.id, (record) => record.id === textId, { sceneCoordinates: true });
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'back' });
    await screenshot({ page, report, outDir, name: 'layered_video_back' });
    const backState = await windowState(page, project.id, videoId, textId);
    assert(frontState.stack.video.position > frontState.stack.text.position,
        `layered_video_front_order:${JSON.stringify(frontState)}`);
    assert(backState.stack.video.position < backState.stack.text.position,
        `layered_video_back_order:${JSON.stringify(backState)}`);
    const depthDiff = diffPng(path.join(outDir, 'layered_video_front.png'), path.join(outDir, 'layered_video_back.png'));
    assert(depthDiff.differing_pixel_ratio > 0.0005, `layered_depth_pixels_unchanged:${JSON.stringify(depthDiff)}`);
    const depthRegion = {
        x: textTarget.x - (textTarget.width / 2) - 6,
        y: textTarget.y - (textTarget.height / 2) - 6,
        width: textTarget.width + 12,
        height: textTarget.height + 12
    };
    const depthRegionDiff = diffPngRegion(
        path.join(outDir, 'layered_video_front.png'),
        path.join(outDir, 'layered_video_back.png'),
        depthRegion
    );
    assert(depthRegionDiff.differing_pixel_ratio > 0.01 && depthRegionDiff.max_channel_delta > 20,
        `layered_depth_text_region_unchanged:${JSON.stringify(depthRegionDiff)}`);
    await reloadBrowserProject(page, project);
    const persistedBack = await windowState(page, project.id, videoId, textId);
    assert(persistedBack.stack.video.position < persistedBack.stack.text.position,
        `layered_back_not_persisted:${JSON.stringify(persistedBack)}`);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    const naturalEnd = await waitForPlaybackEnd(page, 32000);
    const ended = await transportProof(page, moleculeId, project.id);
    assert(ended.voices.length === 0 && ended.transport?.playing !== true && naturalEnd.state?.playing !== true,
        `layered_natural_end_leak:${JSON.stringify({ ended, naturalEnd })}`);
    return {
        project, moleculeId, members, standaloneVideo, coldImageAudio,
        initialMix: summarizeTransportProof(initialMix),
        firstTextMix: summarizeTransportProof(firstTextMix),
        firstTextState: { stack: firstTextState.stack },
        finalMix: summarizeTransportProof(finalMix),
        stoppedInitial: summarizeTransportProof(stoppedInitial),
        ended: summarizeTransportProof(ended),
        videoDiff, depthDiff, depthRegionDiff,
        depthTransportSamples: depthTransportSamples.map(summarizeTransportProof),
        structuralTransportSamples: structuralTransportSamples.map(summarizeTransportProof),
        hierarchyTransportSamples: hierarchyTransportSamples.map(summarizeTransportProof),
        hierarchyReorder,
        hierarchyAfterReload,
        extracted, extractedState,
        frontState: { stack: frontState.stack },
        backState: { stack: backState.stack },
        persistedBack: { stack: persistedBack.stack }
    };
};


export { reloadBrowserProject } from './molecule_ui_media_fixture.mjs';
export { absorbListMember, enterListMolecule, reorderListMemberToFront, extractListMember } from './molecule_ui_hierarchy_gestures.mjs';
