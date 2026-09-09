import path from 'node:path';

import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, diffPng, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
import { screenshot, switchView } from "./molecule_ui_drop_core.mjs";
import { chooseMoleculePlaybackMode, contextualTool, disarmMemberPlayback, expandCanonicalListMolecule, memberPlayTool, moleculePlayTool, playbackSnapshot, selectListRow, waitForContextualTarget, waitForPlaybackEnd } from "./molecule_ui_drop_playback_support.mjs";


import { dismissMainPalette } from "./molecule_ui_media_fixture.mjs";

export const openMolecule = async (page, projectId, memberId, moleculeId) => {
    void memberId;
    await switchView(page, projectId, 'list');
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity === 'molecule') {
        const back = await awaitBevyUiNodeTarget(page, {
            nodeId: 'project_view_footer_back', treeId: 'eve_bevy_ui_project_view', step: 2
        }, { timeoutMs: 15000, intervalMs: 150 });
        assert(back, `layered_open_molecule_back_missing:${JSON.stringify(navigation)}`);
        await clickCanvasTarget(page, back);
        await waitFor(page, async () => {
            const current = (await import('/eVe/domains/rendering/project_view_navigation.js')).readState().current;
            return { ok: current?.entity === 'project', current };
        });
    }
    await selectListRow(page, moleculeId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, moleculeId);
    await chooseMoleculePlaybackMode(page, moleculeId, 'layer');
};

export const transportProof = (page, moleculeId, projectId = '') => page.evaluate(async ({ id, pid }) => {
    const [{ ensureMoleculeEngine }, { projectViewPlayback }, decode] = await Promise.all([
        import('/eVe/core/media_engine/molecule.js'),
        import('/eVe/domains/rendering/project_view_playback_runtime.js'),
        import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js')
    ]);
    const session = ensureMoleculeEngine().getSession(`molecule_transport_${id}`);
    const runtime = session ? [...session.runtimeClips.entries()].map(([clipId, clip]) => ({
        clipId, kind: clip.kind, playing: clip.playing === true,
        audioAvailable: clip.audioAvailable === true,
        audioSource: clip.audioSource && typeof clip.audioSource === 'object' ? { ...clip.audioSource } : clip.audioSource,
        audioLoadError: String(clip.audioLoadError || ''),
        voiceId: String(clip.voiceId || ''), gain: Number(clip.lastGain || 0),
        videoMuted: clip.video ? clip.video.muted === true : null
    })) : [];
    const playback = projectViewPlayback.readState();
    const videoAtomeIds = (playback.playingRecords || []).filter((record) => {
        const properties = record?.properties || record?.props || {};
        return String(properties.kind || properties.media_kind || record?.type || '').toLowerCase().includes('video');
    }).map((record) => String(record.id || record.atome_id || ''));
    const scene = window.eveToolBase?.getProjectSceneState?.(pid) || {};
    const sceneAtoms = Array.isArray(scene?.scene?.atoms) ? scene.scene.atoms : [];
    const sceneNodes = Array.isArray(scene?.scene?.nodes) ? scene.scene.nodes : [];
    const sceneRecords = Array.isArray(scene?.records) ? scene.records : [];
    const projectionNodes = Array.isArray(scene?.projection?.virtual_scene?.nodes)
        ? scene.projection.virtual_scene.nodes : [];
    const videoSceneEntries = [...sceneAtoms, ...sceneNodes].filter((entry) => {
        const sourceId = String(entry?.content?.playbackSourceAtomeId || entry?.content?.playback_source_atome_id || '');
        return videoAtomeIds.includes(String(entry?.id || '')) || videoAtomeIds.includes(sourceId);
    });
    const decodeIds = [...new Set(videoSceneEntries.flatMap((entry) => [
        String(entry?.id || ''), String(entry?.content?.playbackSourceAtomeId || entry?.content?.playback_source_atome_id || '')
    ]).filter(Boolean))];
    return {
        transport: session?.getTransportState?.() || null,
        activeClips: session?.getState?.().active_clips || [],
        voices: session ? [...session.voiceState.entries()].map(([clipId, voice]) => ({ clipId, ...voice })) : [],
        runtime,
        playback,
        visual: {
            sceneKeys: Object.keys(scene?.scene || {}),
            projectionKeys: Object.keys(scene?.projection || {}),
            recordIds: sceneRecords.map((record) => String(record?.id || record?.atome_id || '')),
            sceneAtomIds: sceneAtoms.map((entry) => String(entry?.id || '')),
            projectionNodeIds: projectionNodes.map((entry) => String(entry?.id || '')),
            videoAtomeIds,
            videoSceneEntries,
            decode: Object.fromEntries(decodeIds.map((decodeId) => [decodeId, decode.getBevyVideoDecodeStatus(decodeId)])),
            domVideos: [...document.querySelectorAll('video')].map((video) => ({
                src: String(video.currentSrc || video.src || ''), currentTime: Number(video.currentTime || 0),
                paused: video.paused === true, ended: video.ended === true, readyState: Number(video.readyState || 0),
                width: Number(video.videoWidth || 0), height: Number(video.videoHeight || 0), muted: video.muted === true
            }))
        },
        videoVersions: Object.fromEntries(runtime.filter((clip) => clip.kind === 'video').map((clip) => [
            clip.clipId, Number(window.__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__?.(
                String(session?.timeline?.tracks?.flatMap((track) => track.clips)
                    .find((entry) => entry.id === clip.clipId)?.source?.atome_id || '')
            ) || 0)
        ])),
        videoPlaybackEvents: (window.__EVE_BEVY_PERF__?.events || [])
            .filter((entry) => entry?.name === 'project_view.video.playback').slice(-12),
        naturalReconcileEvents: (window.__EVE_BEVY_PERF__?.events || [])
            .filter((entry) => entry?.name === 'project_view.natural.reconcile').slice(-12)
    };
}, { id: moleculeId, pid: projectId });

export const stopMolecule = async (page) => {
    const stop = await moleculePlayTool(page);
    if (!stop) {
        const evidence = await page.evaluate(async () => {
            const [{ projectViewPlayback }, navigation, { getAtomeContextualEditApi }] = await Promise.all([
                import('/eVe/domains/rendering/project_view_playback_runtime.js'),
                import('/eVe/domains/rendering/project_view_navigation.js'),
                import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js')
            ]);
            const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
            return {
                playback: projectViewPlayback.readState(),
                navigation: navigation.readState(),
                rail: getAtomeContextualEditApi()?.readState?.() || null,
                interactiveNodeIds: (tree?.interactiveNodes || []).map((entry) => String(entry?.id || entry))
            };
        });
        throw new Error(`layered_stop_tool_missing:${JSON.stringify(evidence)}`);
    }
    await clickCanvasTarget(page, stop);
    await waitForPlaybackEnd(page, 8000);
};

export const waitForStandaloneVideoStart = (page, videoId, timeoutMs = 7000) => waitFor(page, async (id) => {
    const selected = await import('/eVe/domains/media/selected_project_media_playback_runtime.js');
    const selectedState = selected.readSelectedProjectMediaPlaybackState([id]);
    const audio = window.Squirrel?.av?.audio;
    const videos = [...document.querySelectorAll('video')].map((video) => ({
        currentTime: Number(video.currentTime || 0), paused: video.paused === true,
        ended: video.ended === true, muted: video.muted === true,
        width: Number(video.videoWidth || 0), height: Number(video.videoHeight || 0)
    }));
    return {
        ok: selectedState.activeIds.includes(id)
            && audio?.get_runtime?.()?.playback === 'web_wasm_kira'
            && audio?.get_backend?.() === 'kira'
            && videos.some((video) => !video.paused && video.muted && video.width > 0 && video.height > 0),
        selectedState, audioRuntime: audio?.get_runtime?.() || null,
        audioBackend: audio?.get_backend?.() || null, videos
    };
}, videoId, timeoutMs);

export const playStandaloneVideo = async ({ page, projectId, videoId, report, outDir }) => {
    await page.evaluate(() => {
        if (window.__EVE_BEVY_PERF__) {
            window.__EVE_BEVY_PERF__.reset({ enabled: true, externalRenderEvents: true });
        }
    });
    await switchView(page, projectId, 'list');
    await selectListRow(page, videoId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, videoId);
    let started = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 2 && !started; attempt += 1) {
        attempts = attempt + 1;
        const play = await memberPlayTool(page);
        assert(play, 'layered_standalone_video_play_missing');
        await clickCanvasTarget(page, play);
        started = await waitForStandaloneVideoStart(page, videoId).catch(() => null);
    }
    if (!started) {
        const diagnostics = await page.evaluate(async (id) => {
            const [context, selection, selected, decode] = await Promise.all([
                import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'),
                import('/eVe/intuition/runtime/selection.js'),
                import('/eVe/domains/media/selected_project_media_playback_runtime.js'),
                import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js')
            ]);
            return {
                context: context.getAtomeContextualEditApi()?.readState?.() || null,
                selection: selection.getCurrentSelectionIds?.() || [],
                selectedPlayback: selected.readSelectedProjectMediaPlaybackState([id]),
                decode: decode.getBevyVideoDecodeStatus(id),
                performance: window.__EVE_BEVY_PERF__?.compact?.() || null,
                videoDecodeEvents: (window.__EVE_BEVY_PERF__?.events || [])
                    .filter((entry) => {
                        const name = String(entry?.name || '');
                        return name.startsWith('video.decode.source.') || name === 'project_view.natural.reconcile';
                    }),
                projectedVideoNodes: Array.from(
                    (window.eveToolBase?.getProjectSceneState?.(window.__currentProject?.id)?.projection?.virtual_scene?.nodes || [])
                ).filter((node) => String(node?.kind || '').toLowerCase() === 'video').map((node) => ({
                    id: String(node.id || ''), source: String(node?.content?.source || node?.source || '')
                })),
                videoRecords: (window.eveToolBase?.getProjectSceneState?.(window.__currentProject?.id)?.records || [])
                    .filter((record) => {
                        const props = record?.properties || {};
                        return [record?.kind, record?.type, props.kind, props.media_kind]
                            .some((value) => String(value || '').toLowerCase().includes('video'));
                    }).map((record) => ({
                        id: String(record.id || record.atome_id || ''),
                        playbackSourceAtomeId: String(record?.properties?.playback_source_atome_id || ''),
                        source: String(record?.properties?.media_url || record?.properties?.src || '')
                    })),
                routing: (window.atome?.tools?.gatewayRoutingLog || [])
                    .filter((entry) => entry.tool_id === 'ui.play').slice(-8),
                failures: (window.__eveToolFailures || []).filter((entry) => entry.tool_id === 'ui.play').slice(-4),
                videos: [...document.querySelectorAll('video')].map((video) => ({
                    currentTime: Number(video.currentTime || 0), duration: Number(video.duration || 0),
                    paused: video.paused === true, ended: video.ended === true, readyState: Number(video.readyState || 0)
                }))
            };
        }, videoId);
        throw new Error(`layered_standalone_video_did_not_start_after_two_real_clicks:${JSON.stringify(diagnostics)}`);
    }
    started.attempts = attempts;
    await screenshot({ page, report, outDir, name: 'layered_video_alone_a' });
    await wait(700);
    await screenshot({ page, report, outDir, name: 'layered_video_alone_b' });
    const frameDiff = diffPng(
        path.join(outDir, 'layered_video_alone_a.png'),
        path.join(outDir, 'layered_video_alone_b.png')
    );
    assert(frameDiff.differing_pixel_ratio > 0.001,
        `layered_standalone_video_static:${JSON.stringify({ frameDiff, started })}`);
    let naturalEnd = null;
    let replay = null;
    if (process.env.MOLECULE_UI_LAYERED_NATURAL_REPLAY === '1') {
        naturalEnd = await waitFor(page, async (id) => {
            const selected = await import('/eVe/domains/media/selected_project_media_playback_runtime.js');
            const selectedState = selected.readSelectedProjectMediaPlaybackState([id]);
            const videos = [...document.querySelectorAll('video')].map((video) => ({
                currentTime: Number(video.currentTime || 0), duration: Number(video.duration || 0),
                paused: video.paused === true, ended: video.ended === true, muted: video.muted === true
            }));
            return {
                ok: !selectedState.activeIds.includes(id)
                    && videos.some((video) => video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.05)),
                selectedState, videos
            };
        }, videoId, 40000);
        const replayTool = await memberPlayTool(page);
        assert(replayTool, 'layered_standalone_video_replay_missing');
        await clickCanvasTarget(page, replayTool);
        replay = await waitForStandaloneVideoStart(page, videoId, 10000);
        await wait(5000);
        replay.afterFiveSeconds = await page.evaluate(async (id) => {
            const selected = await import('/eVe/domains/media/selected_project_media_playback_runtime.js');
            return {
                selectedState: selected.readSelectedProjectMediaPlaybackState([id]),
                videos: [...document.querySelectorAll('video')].map((video) => ({
                    currentTime: Number(video.currentTime || 0), paused: video.paused === true,
                    ended: video.ended === true, muted: video.muted === true
                }))
            };
        }, videoId);
    }
    const stopped = await disarmMemberPlayback(page);
    const afterStop = await playbackSnapshot(page, [videoId]);
    assert(afterStop.playing !== true && afterStop.playingIds.length === 0,
        `layered_standalone_video_stop_leak:${JSON.stringify({ stopped, afterStop })}`);
    const naturalReconcile = await page.evaluate(() => (window.__EVE_BEVY_PERF__?.events || [])
        .filter((entry) => entry?.name === 'project_view.natural.reconcile'));
    return { started, frameDiff, naturalEnd, replay, stopped, afterStop, naturalReconcile };
};

export const assertDepthTransportContinuity = (before, samples) => {
    const sessionId = String(before?.transport?.session_id || '');
    assert(sessionId, `layered_depth_session_missing:${JSON.stringify(before)}`);
    let position = Number(before.transport.position || 0);
    let ended = before.transport.playing !== true;
    samples.forEach((sample, index) => {
        const transport = sample?.transport || {};
        const nextPosition = Number(transport.position || 0);
        const duration = Number(transport.duration || 0);
        assert(String(transport.session_id || '') === sessionId,
            `layered_depth_restarted_transport:${index}:${JSON.stringify({ before: before.transport, transport })}`);
        assert(nextPosition + 0.05 >= position,
            `layered_depth_transport_rewound:${index}:${position}:${nextPosition}`);
        if (transport.playing === true) {
            assert(!ended && sample.voices.length === 3,
                `layered_depth_voice_change:${index}:${JSON.stringify(sample)}`);
        } else {
            assert(duration > 0 && Math.abs(duration - nextPosition) <= 0.25 && sample.voices.length === 0,
                `layered_depth_early_stop:${index}:${JSON.stringify(sample)}`);
            ended = true;
        }
        position = nextPosition;
    });
};

export const summarizeTransportProof = (proof = {}) => ({
    transport: proof.transport || null,
    activeClips: (proof.activeClips || []).map((clip) => ({
        id: clip.id, kind: clip.kind, source_seconds: clip.source_seconds, envelope: clip.envelope
    })),
    voices: (proof.voices || []).map((voice) => ({
        clipId: voice.clipId, voiceId: voice.voiceId, gain: voice.gain, active: voice.active
    })),
    runtime: (proof.runtime || []).map((clip) => ({
        clipId: clip.clipId, kind: clip.kind, playing: clip.playing,
        audioAvailable: clip.audioAvailable, audioSource: clip.audioSource,
        audioLoadError: clip.audioLoadError, videoMuted: clip.videoMuted
    })),
    playback: {
        playing: proof.playback?.playing === true,
        scope: String(proof.playback?.scope || ''),
        playingIds: (proof.playback?.playingIds || []).map(String),
        armed: proof.playback?.armed === true
    },
    visual: {
        videoAtomeIds: proof.visual?.videoAtomeIds || [],
        decode: proof.visual?.decode || {},
        domVideos: proof.visual?.domVideos || []
    }
});

export const applyDepth = async ({ page, projectId, memberId, action }) => {
    await switchView(page, projectId, 'list');
    await dismissMainPalette(page, projectId);
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity !== 'molecule') {
        await expandCanonicalListMolecule(page, [memberId]);
    }
    await selectListRow(page, memberId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, memberId);
    const zOrder = await contextualTool(page, ['atome_contextual_tool_z_order']);
    assert(zOrder, 'layered_z_order_tool_missing');
    await clickCanvasTarget(page, zOrder);
    const actionNodeIds = [
        `atome_contextual_tool_z_order_z_order_${action}`,
        `atome_contextual_tool_z_order_${action}`
    ];
    await waitFor(page, (expectedIds) => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const ids = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry));
        return { ok: expectedIds.some((id) => ids.includes(id)), ids };
    }, actionNodeIds);
    const actionTool = await contextualTool(page, actionNodeIds);
    assert(actionTool, `layered_z_order_action_missing:${action}`);
    const beforeStack = await page.evaluate(async (id) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || state || {};
        const value = Number(props.zIndex ?? props.z_index);
        return Number.isFinite(value) ? value : null;
    }, memberId);
    await clickCanvasTarget(page, actionTool);
    await waitFor(page, async ({ project, member, before }) => {
        const state = await window.Atome.getStateCurrent(member);
        const props = state?.properties || state?.props || state || {};
        const canonical = Number(props.zIndex ?? props.z_index);
        const record = (window.eveToolBase?.getProjectSceneState?.(project)?.records || [])
            .find((entry) => String(entry.id || entry.atome_id || '') === member);
        const projectedProps = record?.properties || record?.props || {};
        const projected = Number(projectedProps.zIndex ?? projectedProps.z_index);
        return {
            ok: Number.isFinite(canonical) && canonical !== before
                && Number.isFinite(projected) && projected === canonical,
            canonical: Number.isFinite(canonical) ? canonical : null,
            projected: Number.isFinite(projected) ? projected : null,
            before
        };
    }, { project: projectId, member: memberId, before: beforeStack });
    await waitForStableScene(page, projectId);
};

export const windowState = (page, projectId, videoId, textId) => page.evaluate(async ({ project, video, text }) => {
    const [videoState, textState, order] = await Promise.all([
        window.Atome.getStateCurrent(video), window.Atome.getStateCurrent(text),
        import('/eVe/domains/rendering/project_view_order_runtime.js')
    ]);
    const scene = window.eveToolBase.getProjectSceneState(project);
    const neighbours = [...scene.records].sort(order.compareDepthRecords).reverse();
    const stackEntry = (id) => {
        const position = neighbours.findIndex((entry) => entry.id === id);
        const entry = position >= 0 ? neighbours[position] : null;
        return { position, zIndex: Number(entry?.properties?.zIndex ?? entry?.properties?.z_index ?? 0), order: Number(entry?.properties?.order || 0) };
    };
    return {
        video: videoState?.properties || videoState?.props || videoState || {},
        text: textState?.properties || textState?.props || textState || {},
        stack: { video: stackEntry(video), text: stackEntry(text) }
    };
}, { project: projectId, video: videoId, text: textId });
