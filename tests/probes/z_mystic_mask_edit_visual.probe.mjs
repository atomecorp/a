import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT = path.resolve('temp/probe_reports/z_mystic_mask_edit_visual');
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch({ headless:false, args:[
    '--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-gpu-sandbox','--autoplay-policy=no-user-gesture-required'
] });
const page = await browser.newPage({ viewport:{ width:1280, height:900 }, deviceScaleFactor:1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { const file = path.join(OUT, `${name}.png`); await page.screenshot({ path:file }); return file; };

try {
    await page.goto(URL, { waitUntil:'commit', timeout:45_000 });
    await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout:45_000 });
    await page.evaluate(async () => {
        const current = await window.AdoleAPI.auth.current().catch(() => null);
        if (!current?.logged && !current?.anonymous && !window.AdoleAPI.security.isAnonymous()) {
            await window.AdoleAPI.security.startGuest({ force:true });
        }
    });
    await page.reload({ waitUntil:'commit', timeout:45_000 });
    await page.waitForFunction(() => !!window.eveToolBase && !!document.getElementById('eve_surface_project'), null, { timeout:45_000 });
    await page.waitForFunction(() => (
        window.eveDashboardBevyUiRuntime?.state?.active === true
        || window.__eveWorkspaceMode?.mode === 'dashboard'
    ), null, { timeout:45_000 });

    const fixture = await page.evaluate(async () => {
        const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        workspace.beginDashboardWorkspaceTransition('project');
        await window.eveDashboardBevyUiRuntime?.destroy?.();
        const name = `Z Mystic Mask ${Date.now()}`;
        const created = await window.AdoleAPI.projects.create(name);
        let projectId = String(created?.id || created?.project_id || created?.atome_id || created?.fastify?.project?.id || '');
        if (!projectId) {
            const listed = await window.AdoleAPI.projects.list();
            const all = [...(listed?.fastify?.projects || []), ...(listed?.projects || [])];
            projectId = String(all.find(record => String(record?.name || record?.properties?.name || '') === name)?.id || '');
        }
        if (!projectId) throw new Error('visual_project_missing');
        await window.AdoleAPI.projects.setCurrent(projectId, name, null, true);
        window.eveToolBase.ensureProjectLayer?.(projectId);
        await window.eveToolBase.loadProjectAtomes(projectId, { force:true, staleFirst:false, forceProjectSurface:true });
        workspace.markProjectWorkspaceMode(projectId);
        const create = async spec => {
            const result = await window.eveToolBase.createAtome({ projectId, parentId:projectId, ...spec }, { render:false });
            const id = String(result?.id || result?.atome_id || result?.ids?.[0] || '');
            if (!result?.ok || !id) throw new Error(`visual_create_failed:${JSON.stringify(result)}`);
            return id;
        };
        const videoId = await create({ type:'video', kind:'video', name:'Z VIDEO', left:220, top:180, width:430, height:242,
            media_url:'/assets/videos/JeezsFire.mp4', src:'/assets/videos/JeezsFire.mp4', media_kind:'video', has_audio:false, z_index:-100 });
        const shapeId = await create({ type:'shape', kind:'shape', name:'Z MASK STAR', left:315, top:190, width:240, height:220,
            color:'#ff2d55', background:'#ff2d55', shape_variant:'star', star_branches:5, star_inner_radius:0.46, z_index:-200 });
        await window.eveToolBase.loadProjectAtomes(projectId, { force:true, staleFirst:false });
        await window.eveToolBase.loadProjectAtomes(projectId, { force:true, staleFirst:false, forceProjectSurface:true });
        return { projectId, videoId, shapeId };
    });
    await page.waitForFunction(id => window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id)?.readyState >= 2, fixture.videoId, { timeout:45_000 });
    await wait(900);
    const createdFront = await shot('01-created-shape-is-front');

    const invoke = (toolId, input) => page.evaluate(async ({ toolId, input }) => {
        if (toolId.startsWith('ui.zorder.')) await import('/eVe/intuition/tools/z_order_actions.js');
        if (toolId === 'ui.mask.apply') await import('/eVe/intuition/tools/mask.js');
        if (toolId.startsWith('ui.shape.')) (await import('/eVe/intuition/tools/shape_edit.js')).registerShapeEditActions?.();
        const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        const response = await invokeToolGateway({ action:'pointer.click', tool_id:toolId, nameKey:toolId, input,
            source:{ type:'ui', layer:'z_mystic_mask_visual' }, presentation:'ui' });
        return { response, result:response?.result?.result || response?.result || response };
    }, { toolId, input });

    const backStartedAt = Date.now();
    const back = await invoke('ui.zorder.back', { project_id:fixture.projectId, target_atome_id:fixture.shapeId,
        selection_ids:[fixture.shapeId, fixture.videoId] });
    const firstZOrderMs = Date.now() - backStartedAt;
    await wait(700);
    const movedBack = await shot('02-shape-sent-behind-video');
    const front = await invoke('ui.zorder.front', { project_id:fixture.projectId, target_atome_id:fixture.shapeId,
        selection_ids:[fixture.shapeId, fixture.videoId] });
    await wait(700);
    const movedFront = await shot('03-shape-brought-in-front-of-video');

    const mask = await invoke('ui.mask.apply', { project_id:fixture.projectId, selection_ids:[fixture.shapeId] });
    const wrapperId = String(mask.result?.molecule_id || '');
    if (!mask.result?.ok || !wrapperId) throw new Error(`visual_mask_failed:${JSON.stringify(mask)}`);
    const controlVideoId = await page.evaluate(async projectId => {
        const result = await window.eveToolBase.createAtome({ projectId, parentId:projectId,
            type:'video', kind:'video', name:'CONTROL VIDEO MUST STAY PAUSED', left:720, top:500,
            width:260, height:146, media_url:'/assets/videos/JeezsFire.mp4',
            src:'/assets/videos/JeezsFire.mp4', media_kind:'video', has_audio:false }, { render:false });
        const id = String(result?.id || result?.atome_id || result?.ids?.[0] || '');
        await window.eveToolBase.loadProjectAtomes(projectId, { force:true, staleFirst:false });
        return id;
    }, fixture.projectId);
    await page.waitForFunction(id => window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id)?.readyState >= 2,
        controlVideoId, { timeout:45_000 });
    const playbackBefore = await page.evaluate(async ({ videoId, controlVideoId }) => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(videoId);
        const control = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(controlVideoId);
        const record = await window.Atome.getStateCurrent(videoId);
        if (!video) return { exists:false, time:0, paused:true, recordMute:record?.properties?.mute ?? null };
        video.dataset.zMysticMaskIdentity = 'same-decoder';
        // Browser-only autoplay accommodation: this does not persist `mute` on
        // the video atom. The report compares the canonical value before/after.
        video.muted = true;
        if (control) control.muted = true;
        return { exists:true, time:Number(video.currentTime || 0), paused:video.paused,
            recordMute:record?.properties?.mute ?? null, controlTime:Number(control?.currentTime || 0),
            controlPaused:control?.paused ?? true };
    }, { videoId:fixture.videoId, controlVideoId });
    // Reproduce the Flower target exactly: hit-testing returns the dedicated
    // mask wrapper, not the hidden video child.
    const play = await invoke('ui.play', { project_id:fixture.projectId, target_atome_id:wrapperId,
        selection_ids:[wrapperId] });
    if (play.response?.ok !== true) throw new Error(`visual_play_failed:${JSON.stringify(play)}`);
    await page.waitForFunction(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return !!video && !video.paused && video.currentTime > 0.2;
    }, fixture.videoId, { timeout:15_000 });
    await wait(900);
    const starMask = await shot('04-video-masked-by-editable-star');
    const edit = await invoke('ui.shape.variant.circle', { project_id:fixture.projectId,
        target_atome_id:fixture.shapeId, selection_ids:[fixture.shapeId] });
    await wait(900);
    const circleMask = await shot('05-same-video-after-mask-edit-to-circle');

    const state = await page.evaluate(async ({ fixture, wrapperId, controlVideoId }) => {
        const current = id => window.Atome.getStateCurrent(id);
        const [video, shape, wrapper] = await Promise.all([current(fixture.videoId), current(fixture.shapeId), current(wrapperId)]);
        const z = record => Number(record?.properties?.z_index ?? record?.properties?.zIndex);
        const menuModule = await import('/eVe/intuition/menu/context_menu_resolver.js');
        const contexts = [
            { type:'atome', kind:'shape', selected:true, mode:'edit' },
            { type:'atome', kind:'video', selected:true, mode:'edit', capabilities:['playback'] },
            { type:'atome', kind:'group', selected:true, mode:'edit' },
            { type:'atome', kind:'image', selected:true, mode:'edit' }
        ];
        const mystic = contexts.map(context => menuModule.resolveContextMenu({ context }).map(item => item.key));
        const railModule = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_rail_runtime.js');
        const maskEdit = railModule.resolveMaskedShapeEditContext({
            record:wrapper,
            getAtomeElement:id => document.getElementById(`eve-atome_${id}`),
            getAtomeRuntimeState:() => shape
        });
        const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const projected = getProjectSceneState(fixture.projectId)?.projection?.virtual_scene;
        const videoNode = projected?.byId?.get?.(fixture.videoId) || null;
        const sourceNode = projected?.byId?.get?.(fixture.shapeId) || null;
        const videoElement = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(fixture.videoId);
        const controlVideoElement = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(controlVideoId);
        return {
            z:{ video:z(video), shape:z(shape), shapeAboveVideo:z(shape) > z(video) },
            shapeVariant:String(shape?.properties?.shape_variant || ''),
            wrapperMask:wrapper?.properties?.mask || null,
            maskEditSourceId:maskEdit?.sourceId || '',
            projectedMaskVariant:String(videoNode?.mask?.silhouette?.geometry?.variant || ''),
            projectedSourceHidden:sourceNode?.maskSource === true,
            playback:{ exists:!!videoElement, sameElement:videoElement?.dataset?.zMysticMaskIdentity === 'same-decoder',
                paused:videoElement?.paused ?? true, time:Number(videoElement?.currentTime || 0),
                recordMute:video?.properties?.mute ?? null,
                controlPaused:controlVideoElement?.paused ?? true,
                controlTime:Number(controlVideoElement?.currentTime || 0) },
            mystic,
            mysticConstant:mystic.every(list => JSON.stringify(list) === JSON.stringify(mystic[0])),
            mysticPlayAlways:mystic.every(list => list.includes('play'))
        };
    }, { fixture, wrapperId, controlVideoId });

    const checks = {
        createdShapeAboveVideo:state.z.shapeAboveVideo,
        backToolWorked:back.result?.ok === true,
        frontToolWorked:front.result?.ok === true,
        firstZOrderIsImmediate:firstZOrderMs < 5_000,
        maskWorked:mask.result?.ok === true,
        maskEditWorked:edit.result?.ok === true && state.shapeVariant === 'circle',
        maskStillAppliedAfterEdit:state.projectedMaskVariant === 'circle' && state.projectedSourceHidden,
        maskedVideoPlayedThroughTool:play.response?.ok === true && state.playback.paused === false
            && state.playback.sameElement && state.playback.time > playbackBefore.time + 0.2,
        unrelatedVideoStayedPaused:state.playback.controlPaused === true
            && Math.abs(state.playback.controlTime - playbackBefore.controlTime) < 0.1,
        maskDidNotForceMute:state.playback.recordMute === playbackBefore.recordMute,
        contextualMaskEditTargetsSource:state.maskEditSourceId === fixture.shapeId,
        mysticConstantInEdit:state.mysticConstant,
        mysticKeepsPlay:state.mysticPlayAlways,
        noRuntimeErrors:errors.length === 0
    };
    const report = { ok:Object.values(checks).every(Boolean), checks, fixture:{ ...fixture, controlVideoId }, wrapperId, firstZOrderMs, edit, state, errors,
        screenshots:{ createdFront, movedBack, movedFront, starMask, circleMask } };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
} finally {
    await browser.close();
}
