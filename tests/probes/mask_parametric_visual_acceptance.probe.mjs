import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT = path.resolve('temp/probe_reports/mask_parametric_visual_acceptance');
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pixelDiff = (first, second, rect = null) => {
    const a = PNG.sync.read(fs.readFileSync(first));
    const b = PNG.sync.read(fs.readFileSync(second));
    const area = rect || { x: 0, y: 0, width: Math.min(a.width, b.width), height: Math.min(a.height, b.height) };
    const left = Math.max(0, Math.floor(area.x));
    const top = Math.max(0, Math.floor(area.y));
    const right = Math.min(a.width, b.width, Math.ceil(area.x + area.width));
    const bottom = Math.min(a.height, b.height, Math.ceil(area.y + area.height));
    let changed = 0;
    let total = 0;
    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
            const offset = (y * a.width + x) * 4;
            total += 1;
            if (a.data[offset] !== b.data[offset]
                || a.data[offset + 1] !== b.data[offset + 1]
                || a.data[offset + 2] !== b.data[offset + 2]
                || a.data[offset + 3] !== b.data[offset + 3]) changed += 1;
        }
    }
    return { changed, total, ratio: total ? changed / total : 0 };
};

const browser = await chromium.launch({
    headless: false,
    args: [
        '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox',
        '--autoplay-policy=no-user-gesture-required'
    ]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const failures = [];
page.on('console', message => {
    if (message.type() === 'error') failures.push(`console:${message.text()}`);
});
page.on('pageerror', error => failures.push(`page:${error.message}`));

const screenshot = async name => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    return file;
};

const createIsolatedProject = prefix => page.evaluate(async projectPrefix => {
    const name = `${projectPrefix} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
    const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    const created = await window.AdoleAPI.projects.create(name);
    let id = String(created?.id || created?.project_id || created?.atome_id
        || created?.fastify?.project?.id || created?.tauri?.project?.id || '');
    if (!id) {
        const listed = await window.AdoleAPI.projects.list();
        const records = [...(listed?.fastify?.projects || []), ...(listed?.tauri?.projects || []), ...(listed?.projects || [])];
        const found = records.find(record => String(record?.name || record?.properties?.name || '') === name);
        id = String(found?.id || found?.atome_id || found?.project_id || '');
    }
    if (!id) throw new Error(`mask_visual_project_missing:${JSON.stringify(created)}`);
    await window.AdoleAPI.projects.setCurrent(id, name, null, true);
    window.eveToolBase.ensureProjectLayer?.(id);
    const loaded = await window.eveToolBase.loadProjectAtomes(id, {
        force: true, staleFirst: false, forceProjectSurface: true
    });
    if (loaded?.ok === false) throw new Error(`mask_visual_project_load_failed:${JSON.stringify(loaded)}`);
    workspace.markProjectWorkspaceMode(id);
    return { id, name };
}, prefix);

const createMaskPair = (projectId, target, source) => page.evaluate(async ({ projectId: owner, targetProps, sourceProps }) => {
    const create = async props => {
        const result = await window.eveToolBase.createAtome({ projectId: owner, parentId: owner, ...props }, { render: false });
        const id = String(result?.id || result?.atome_id || result?.ids?.[0] || '');
        if (!result?.ok || !id) throw new Error(`mask_visual_pair_create_failed:${JSON.stringify(result)}`);
        return id;
    };
    const targetId = await create({ ...targetProps, hierarchy_order: 0, z_index: 10 });
    const sourceId = await create({ ...sourceProps, hierarchy_order: 1, z_index: 11 });
    await window.eveToolBase.loadProjectAtomes(owner, { force: true, staleFirst: false });
    return { targetId, sourceId };
}, { projectId, targetProps: target, sourceProps: source });

const projectedMaskState = (projectId, fixture) => page.evaluate(({ projectId: owner, fixture: ids }) => {
    const scene = window.eveToolBase.getProjectSceneState(owner)?.projection?.virtual_scene;
    const nodes = new Map((scene?.nodes || []).map(node => [String(node.id), node]));
    return {
        targetMasked: !!nodes.get(ids.targetId)?.mask,
        sourceHidden: nodes.get(ids.sourceId)?.maskSource === true,
        targetBounds: nodes.get(ids.targetId)?.bounds || null
    };
}, { projectId, fixture });

const runStaticMaskScenario = async ({ name, target, source, rect }) => {
    const project = await createIsolatedProject(`Mask ${name}`);
    const fixture = await createMaskPair(project.id, target, source);
    await sleep(1200);
    const before = await screenshot(`${name}-before-mask`);
    const gateway = await applyThroughRealGateway(fixture.sourceId);
    if (gateway.result?.ok !== true) throw new Error(`${name}_mask_gateway_failed:${JSON.stringify(gateway)}`);
    await sleep(1200);
    const after = await screenshot(`${name}-after-mask`);
    return {
        project, fixture, gateway, state: await projectedMaskState(project.id, fixture),
        pixels: pixelDiff(before, after, rect), screenshots: { before, after }
    };
};

const applyThroughRealGateway = sourceId => page.evaluate(async id => {
    await import('/eVe/intuition/tools/mask.js');
    const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
    const response = await invokeToolGateway({
        action: 'pointer.click',
        tool_id: 'ui.mask.apply',
        nameKey: 'mask',
        input: {
            // Exact effective gateway payload after a Bevy rail press: target_id
            // is the button DOM anchor; the captured contextual owner is the
            // selected FRONT object.
            target_id: 'eve_tool_target_mask',
            selection_ids: [id],
            name_key: 'mask'
        },
        source: { type: 'ui', layer: 'visual_mask_acceptance' },
        presentation: 'ui'
    });
    const result = response?.result?.result || response?.result || response;
    return { response, result };
}, sourceId);

const ungroupThroughRealGateway = moleculeId => page.evaluate(async id => {
    await import('/eVe/intuition/tools/ungroup.js');
    const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
    const response = await invokeToolGateway({
        action: 'pointer.click',
        tool_id: 'ui.molecule.ungroup',
        nameKey: 'ungroup',
        input: { target_id: 'eve_tool_target_ungroup', selection_ids: [id], name_key: 'ungroup' },
        source: { type: 'ui', layer: 'visual_mask_acceptance' },
        presentation: 'ui'
    });
    const result = response?.result?.result || response?.result || response;
    return { response, result };
}, moleculeId);

const playThroughRealGateway = atomeId => page.evaluate(async id => {
    const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
    const response = await invokeToolGateway({
        action: 'pointer.click',
        tool_id: 'ui.play',
        nameKey: 'play',
        input: { target_id: 'eve_tool_target_play', target_atome_id: id, selection_ids: [id] },
        source: { type: 'ui', layer: 'visual_mask_acceptance' },
        presentation: 'ui'
    });
    const result = response?.result?.result || response?.result || response;
    return { response, result };
}, atomeId);

try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 45_000 });
    await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 45_000 });
    const session = await page.evaluate(async () => {
        const current = await window.AdoleAPI.auth.current().catch(() => null);
        if (current?.logged || current?.anonymous || window.AdoleAPI.security.isAnonymous()) return { ok: true };
        return window.AdoleAPI.security.startGuest({ force: true });
    });
    if (session?.ok !== true) throw new Error(`mask_visual_guest_failed:${JSON.stringify(session)}`);
    await page.reload({ waitUntil: 'commit', timeout: 45_000 });
    await page.waitForFunction(() => !!window.eveToolBase && !!document.getElementById('eve_surface_project'), null, { timeout: 45_000 });
    await page.waitForFunction(() => (
        window.eveDashboardBevyUiRuntime?.state?.active === true
        || window.__eveWorkspaceMode?.mode === 'dashboard'
    ), null, { timeout: 45_000 });

    const project = await page.evaluate(async () => {
        const name = `Mask pixels ${Date.now()}`;
        const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        workspace.beginDashboardWorkspaceTransition('project');
        await window.eveDashboardBevyUiRuntime?.destroy?.();
        const created = await window.AdoleAPI.projects.create(name);
        let id = String(created?.id || created?.project_id || created?.atome_id
            || created?.fastify?.project?.id || created?.tauri?.project?.id || '');
        if (!id) {
            const listed = await window.AdoleAPI.projects.list();
            const records = [...(listed?.fastify?.projects || []), ...(listed?.tauri?.projects || []), ...(listed?.projects || [])];
            const found = records.find(record => String(record?.name || record?.properties?.name || '') === name);
            id = String(found?.id || found?.atome_id || found?.project_id || '');
        }
        if (!id) throw new Error(`mask_visual_project_missing:${JSON.stringify(created)}`);
        await window.AdoleAPI.projects.setCurrent(id, name, null, true);
        window.eveToolBase.ensureProjectLayer?.(id);
        const loaded = await window.eveToolBase.loadProjectAtomes(id, { force: true, staleFirst: false, forceProjectSurface: true });
        if (loaded?.ok === false) throw new Error(`mask_visual_project_load_failed:${JSON.stringify(loaded)}`);
        workspace.markProjectWorkspaceMode(id);
        return { id, name };
    });

    const videoFixture = await page.evaluate(async projectId => {
        const create = async props => {
            const result = await window.eveToolBase.createAtome({ projectId, parentId: projectId, ...props }, { render: false });
            const id = String(result?.id || result?.atome_id || result?.ids?.[0] || '');
            if (!result?.ok || !id) throw new Error(`mask_visual_create_failed:${JSON.stringify(result)}`);
            return id;
        };
        const videoId = await create({
            type: 'video', kind: 'video', name: 'MASK VIDEO',
            left: 120, top: 180, width: 430, height: 242,
            media_url: '/assets/videos/JeezsFire.mp4', src: '/assets/videos/JeezsFire.mp4',
            media_kind: 'video', has_audio: false, hierarchy_order: 0, z_index: 10
        });
        const sourceId = await create({
            type: 'shape', kind: 'shape', name: 'VIDEO MASK STAR',
            left: 220, top: 190, width: 220, height: 220,
            color: '#ffffff', background: '#ffffff', backgroundColor: '#ffffff', bg: '#ffffff',
            shape_variant: 'star', star_branches: 5, star_inner_radius: 0.45,
            hierarchy_order: 1, z_index: 11
        });
        await window.eveToolBase.loadProjectAtomes(projectId, { force: true, staleFirst: false });
        return { videoId, sourceId };
    }, project.id);

    await page.waitForFunction(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return !!video && video.readyState >= 2 && video.videoWidth > 0;
    }, videoFixture.videoId, { timeout: 30_000 });
    await sleep(800);
    const videoBefore = await screenshot('video-before-mask');
    const playbackBefore = await page.evaluate(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__(id);
        video.dataset.maskAcceptanceIdentity = 'same-video-element';
        video.muted = true;
        return { time: Number(video.currentTime || 0), paused: video.paused };
    }, videoFixture.videoId);
    const videoMask = await applyThroughRealGateway(videoFixture.sourceId);
    if (videoMask.result?.ok !== true) throw new Error(`video_mask_gateway_failed:${JSON.stringify(videoMask)}`);
    const videoPlay = await playThroughRealGateway(videoFixture.videoId);
    if (videoPlay.response?.ok !== true) throw new Error(`video_play_gateway_failed:${JSON.stringify(videoPlay)}`);
    try {
        await page.waitForFunction(id => {
            const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
            return !!video && !video.paused && video.currentTime > 0.2;
        }, videoFixture.videoId, { timeout: 15_000 });
    } catch (error) {
        const status = await page.evaluate(id => {
            const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
            return { exists: !!video, paused: video?.paused, currentTime: video?.currentTime,
                readyState: video?.readyState, error: video?.error?.message || null };
        }, videoFixture.videoId);
        throw new Error(`mask_visual_video_did_not_start:${JSON.stringify({ playbackBefore, status })}`);
    }
    await sleep(900);
    const videoMaskedA = await screenshot('video-masked-playing-a');
    await sleep(900);
    const videoMaskedB = await screenshot('video-masked-playing-b');
    const videoAfter = await page.evaluate(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return {
            exists: !!video,
            sameElement: video?.dataset?.maskAcceptanceIdentity === 'same-video-element',
            time: Number(video?.currentTime || 0),
            paused: video?.paused ?? true,
            readyState: Number(video?.readyState || 0),
            source: String(video?.currentSrc || video?.src || '')
        };
    }, videoFixture.videoId);

    const groupProject = await page.evaluate(async () => {
        const name = `Mask group pixels ${Date.now()}`;
        const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        const created = await window.AdoleAPI.projects.create(name);
        let id = String(created?.id || created?.project_id || created?.atome_id
            || created?.fastify?.project?.id || created?.tauri?.project?.id || '');
        if (!id) {
            const listed = await window.AdoleAPI.projects.list();
            const records = [...(listed?.fastify?.projects || []), ...(listed?.tauri?.projects || []), ...(listed?.projects || [])];
            const found = records.find(record => String(record?.name || record?.properties?.name || '') === name);
            id = String(found?.id || found?.atome_id || found?.project_id || '');
        }
        if (!id) throw new Error(`mask_visual_group_project_missing:${JSON.stringify(created)}`);
        await window.AdoleAPI.projects.setCurrent(id, name, null, true);
        window.eveToolBase.ensureProjectLayer?.(id);
        const loaded = await window.eveToolBase.loadProjectAtomes(id, { force: true, staleFirst: false, forceProjectSurface: true });
        if (loaded?.ok === false) throw new Error(`mask_visual_group_project_load_failed:${JSON.stringify(loaded)}`);
        workspace.markProjectWorkspaceMode(id);
        return { id, name };
    });

    const groupFixture = await page.evaluate(async projectId => {
        const create = async props => {
            const result = await window.eveToolBase.createAtome({ projectId, parentId: projectId, ...props }, { render: false });
            const id = String(result?.id || result?.atome_id || result?.ids?.[0] || '');
            if (!result?.ok || !id) throw new Error(`mask_visual_group_create_failed:${JSON.stringify(result)}`);
            return id;
        };
        const first = await create({ type: 'shape', kind: 'shape', name: 'GROUP RED', left: 700, top: 190,
            width: 270, height: 190, color: '#ff304f', background: '#ff304f', shape_variant: 'square', hierarchy_order: 2 });
        const second = await create({ type: 'shape', kind: 'shape', name: 'GROUP GREEN', left: 850, top: 270,
            width: 210, height: 210, color: '#00c853', background: '#00c853', shape_variant: 'circle', hierarchy_order: 3 });
        const third = await create({ type: 'text', kind: 'text', name: 'GROUP TEXT', text: 'GROUPE', left: 860, top: 325,
            width: 190, height: 80, color: '#ffffff', font_size: 42, hierarchy_order: 4 });
        const combineModule = await import('/eVe/intuition/tools/core/tool_runtime_molecule_combine.js');
        const firstGroup = await combineModule.combineCanonicalMolecule({
            projectId, targetId: first, sourceId: second, mode: 'simultaneous'
        });
        if (!firstGroup?.ok) throw new Error(`mask_visual_group_first_combine_failed:${JSON.stringify(firstGroup)}`);
        const completed = await combineModule.combineCanonicalMolecule({
            projectId, targetId: firstGroup.molecule_id, sourceId: third, mode: 'simultaneous'
        });
        if (!completed?.ok) throw new Error(`mask_visual_group_second_combine_failed:${JSON.stringify(completed)}`);
        const sourceId = await create({ type: 'shape', kind: 'shape', name: 'GROUP MASK', left: 770, top: 220,
            width: 250, height: 250, color: '#3540a5', background: '#3540a5', shape_variant: 'star',
            star_branches: 7, star_inner_radius: 0.52, hierarchy_order: 5, z_index: 30 });
        await window.eveToolBase.loadProjectAtomes(projectId, { force: true, staleFirst: false });
        return { targetGroupId: completed.molecule_id, childIds: [first, second, third], sourceId };
    }, groupProject.id);
    await sleep(1200);
    const groupBefore = await screenshot('group-before-mask');
    const groupMask = await applyThroughRealGateway(groupFixture.sourceId);
    if (groupMask.result?.ok !== true) throw new Error(`group_mask_gateway_failed:${JSON.stringify(groupMask)}`);
    await sleep(1200);
    const groupAfter = await screenshot('group-after-mask');
    const groupState = await page.evaluate(async ({ projectId, fixture }) => {
        const scene = window.eveToolBase.getProjectSceneState(projectId)?.projection?.virtual_scene;
        const nodes = new Map((scene?.nodes || []).map(node => [String(node.id), node]));
        const current = async id => window.Atome.getStateCurrent(id);
        return {
            target: await current(fixture.targetGroupId),
            source: await current(fixture.sourceId),
            children: await Promise.all(fixture.childIds.map(current)),
            projected: fixture.childIds.map(id => ({
                id,
                hasMask: !!nodes.get(id)?.mask,
                maskSource: nodes.get(id)?.maskSource === true,
                bounds: nodes.get(id)?.bounds || null
            })),
            sourceProjected: {
                maskSource: nodes.get(fixture.sourceId)?.maskSource === true,
                visible: nodes.get(fixture.sourceId)?.visible
            }
        };
    }, { projectId: groupProject.id, fixture: groupFixture });

    const maskWrapperId = String(groupMask.result?.molecule_id || '');
    if (!maskWrapperId) throw new Error(`group_mask_wrapper_missing:${JSON.stringify(groupMask)}`);
    const groupUngroup = await ungroupThroughRealGateway(maskWrapperId);
    if (groupUngroup.result?.ok !== true) throw new Error(`group_ungroup_gateway_failed:${JSON.stringify(groupUngroup)}`);
    await sleep(1200);
    const groupUngrouped = await screenshot('group-after-ungroup');
    const groupUngroupedState = await page.evaluate(async ({ projectId, fixture, wrapperId }) => {
        const scene = window.eveToolBase.getProjectSceneState(projectId)?.projection?.virtual_scene;
        const nodes = new Map((scene?.nodes || []).map(node => [String(node.id), node]));
        const current = async id => window.Atome.getStateCurrent(id).catch(() => null);
        return {
            wrapper: await current(wrapperId),
            target: await current(fixture.targetGroupId),
            source: await current(fixture.sourceId),
            targetProjected: nodes.has(fixture.targetGroupId),
            sourceProjected: nodes.has(fixture.sourceId),
            wrapperProjected: nodes.has(wrapperId)
        };
    }, { projectId: groupProject.id, fixture: groupFixture, wrapperId: maskWrapperId });

    const textVideoProject = await createIsolatedProject('Mask video by text');
    const textVideoFixture = await createMaskPair(textVideoProject.id, {
        type: 'video', kind: 'video', name: 'TEXT MASK VIDEO',
        left: 120, top: 180, width: 430, height: 242,
        media_url: '/assets/videos/JeezsFire.mp4', src: '/assets/videos/JeezsFire.mp4',
        media_kind: 'video', has_audio: false
    }, {
        type: 'text', kind: 'text', name: 'VIDEO TEXT MASK', text: 'VIDEO',
        left: 155, top: 245, width: 370, height: 120,
        color: '#ffffff', font_size: 92, font_weight: 900
    });
    await page.waitForFunction(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return !!video && video.readyState >= 2 && video.videoWidth > 0;
    }, textVideoFixture.targetId, { timeout: 30_000 });
    await page.evaluate(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__(id);
        video.dataset.textMaskAcceptanceIdentity = 'same-text-mask-video';
        video.muted = true;
    }, textVideoFixture.targetId);
    await sleep(800);
    const textVideoBefore = await screenshot('video-text-before-mask');
    const textVideoMask = await applyThroughRealGateway(textVideoFixture.sourceId);
    if (textVideoMask.result?.ok !== true) throw new Error(`video_text_mask_gateway_failed:${JSON.stringify(textVideoMask)}`);
    const textVideoPlay = await playThroughRealGateway(textVideoFixture.targetId);
    if (textVideoPlay.response?.ok !== true) throw new Error(`video_text_play_gateway_failed:${JSON.stringify(textVideoPlay)}`);
    await page.waitForFunction(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return !!video && !video.paused && video.currentTime > 0.2;
    }, textVideoFixture.targetId, { timeout: 15_000 });
    await sleep(900);
    const textVideoMaskedA = await screenshot('video-text-masked-playing-a');
    await sleep(900);
    const textVideoMaskedB = await screenshot('video-text-masked-playing-b');
    const textVideoAfter = await page.evaluate(id => {
        const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(id);
        return {
            sameElement: video?.dataset?.textMaskAcceptanceIdentity === 'same-text-mask-video',
            paused: video?.paused ?? true,
            time: Number(video?.currentTime || 0),
            readyState: Number(video?.readyState || 0)
        };
    }, textVideoFixture.targetId);
    const textVideo = {
        project: textVideoProject,
        fixture: textVideoFixture,
        gateway: textVideoMask,
        playGateway: textVideoPlay,
        after: textVideoAfter,
        state: await projectedMaskState(textVideoProject.id, textVideoFixture),
        motion: pixelDiff(textVideoMaskedA, textVideoMaskedB, { x: 120, y: 180, width: 430, height: 242 }),
        pixels: pixelDiff(textVideoBefore, textVideoMaskedA, { x: 120, y: 180, width: 430, height: 242 }),
        screenshots: { before: textVideoBefore, maskedA: textVideoMaskedA, maskedB: textVideoMaskedB }
    };

    const imageMask = await runStaticMaskScenario({
        name: 'image-shape',
        target: {
            type: 'image', kind: 'image', name: 'MASK IMAGE', left: 120, top: 180, width: 430, height: 260,
            media_url: '/assets/images/puydesancy.jpg', src: '/assets/images/puydesancy.jpg'
        },
        source: {
            type: 'shape', kind: 'shape', name: 'IMAGE MASK STAR', left: 220, top: 185, width: 240, height: 240,
            color: '#ffffff', background: '#ffffff', shape_variant: 'star', star_branches: 6, star_inner_radius: 0.48
        },
        rect: { x: 100, y: 160, width: 470, height: 300 }
    });
    const vectorMask = await runStaticMaskScenario({
        name: 'vector-shape',
        target: {
            type: 'svg', kind: 'svg', name: 'MASK VECTOR', left: 120, top: 180, width: 430, height: 260,
            svg_markup: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 260"><rect width="430" height="260" fill="#642ca9"/><circle cx="135" cy="130" r="105" fill="#ffcc00"/><path d="M220 20 L410 130 L220 240 Z" fill="#00b8d4"/></svg>'
        },
        source: {
            type: 'shape', kind: 'shape', name: 'VECTOR MASK CIRCLE', left: 205, top: 185, width: 250, height: 250,
            color: '#ffffff', background: '#ffffff', shape_variant: 'circle'
        },
        rect: { x: 100, y: 160, width: 470, height: 300 }
    });
    const peaks = [0.12, 0.55, 0.92, 0.3, 0.76, 0.42, 1, 0.64, 0.22, 0.82, 0.48, 0.96, 0.31, 0.7, 0.18];
    const waveformMask = await runStaticMaskScenario({
        name: 'waveform-shape',
        target: {
            type: 'sound', kind: 'sound', name: 'MASK WAVEFORM', left: 120, top: 220, width: 520, height: 180,
            media_url: '/assets/audios/riff.m4a', src: '/assets/audios/riff.m4a',
            peaks, waveform_peaks: peaks, color: '#00c853', background: '#00c853'
        },
        source: {
            type: 'shape', kind: 'shape', name: 'WAVEFORM MASK STAR', left: 260, top: 185, width: 250, height: 250,
            color: '#ffffff', background: '#ffffff', shape_variant: 'star', star_branches: 5, star_inner_radius: 0.5
        },
        rect: { x: 100, y: 170, width: 560, height: 260 }
    });

    const videoMotion = pixelDiff(videoMaskedA, videoMaskedB, { x: 120, y: 180, width: 430, height: 242 });
    const groupMaskPixels = pixelDiff(groupBefore, groupAfter, { x: 680, y: 170, width: 400, height: 340 });
    const groupRestorationPixels = pixelDiff(groupBefore, groupUngrouped, { x: 680, y: 170, width: 400, height: 340 });
    const maskToolFailures = await page.evaluate(() => (window.__eveToolFailures || [])
        .filter(entry => entry?.tool_id === 'ui.mask.apply')
        .map(({ tool_id, error }) => ({ tool_id, error })));
    const ungroupToolFailures = await page.evaluate(() => (window.__eveToolFailures || [])
        .filter(entry => entry?.tool_id === 'ui.molecule.ungroup')
        .map(({ tool_id, error }) => ({ tool_id, error })));
    const report = {
        ok: true,
        project,
        video: {
            fixture: videoFixture,
            gateway: videoMask,
            playGateway: videoPlay,
            playbackBefore,
            after: videoAfter,
            motion: videoMotion,
            screenshots: { before: videoBefore, maskedA: videoMaskedA, maskedB: videoMaskedB }
        },
        textVideo,
        mediaTargets: { image: imageMask, vector: vectorMask, waveform: waveformMask },
        group: {
            project: groupProject,
            fixture: groupFixture,
            gateway: groupMask,
            ungroupGateway: groupUngroup,
            state: groupState,
            ungroupedState: groupUngroupedState,
            maskPixels: groupMaskPixels,
            restorationPixels: groupRestorationPixels,
            screenshots: { before: groupBefore, after: groupAfter, ungrouped: groupUngrouped }
        },
        failures,
        maskToolFailures,
        ungroupToolFailures
    };
    const checks = {
        videoGateway: videoMask.result?.ok === true,
        videoPlayTool: videoPlay.response?.ok === true,
        videoElementPreserved: videoAfter.sameElement === true,
        videoStillPlaying: videoAfter.paused === false && videoAfter.time > playbackBefore.time + 0.5,
        videoPixelsMoveInsideMask: videoMotion.ratio > 0.001,
        textMasksVideo: textVideo.gateway.result?.ok === true
            && textVideo.state.targetMasked === true && textVideo.state.sourceHidden === true
            && textVideo.pixels.ratio > 0.01,
        textMaskedVideoPlayTool: textVideo.playGateway.response?.ok === true
            && textVideo.after.sameElement === true && textVideo.after.paused === false
            && textVideo.after.time > 0.5 && textVideo.motion.ratio > 0.001,
        imageMasked: imageMask.gateway.result?.ok === true && imageMask.state.targetMasked === true
            && imageMask.state.sourceHidden === true && imageMask.pixels.ratio > 0.01,
        vectorMasked: vectorMask.gateway.result?.ok === true && vectorMask.state.targetMasked === true
            && vectorMask.state.sourceHidden === true && vectorMask.pixels.ratio > 0.01,
        waveformMasked: waveformMask.gateway.result?.ok === true && waveformMask.state.targetMasked === true
            && waveformMask.state.sourceHidden === true && waveformMask.pixels.ratio > 0.01,
        groupGateway: groupMask.result?.ok === true,
        groupIdentityPreserved: groupState.target?.parent_id !== groupProject.id
            && groupState.children.every(child => child?.parent_id === groupFixture.targetGroupId),
        everyGroupChildMasked: groupState.projected.every(child => child.hasMask),
        groupMaskSourceHidden: groupState.sourceProjected.maskSource === true,
        groupPixelsChanged: groupMaskPixels.ratio > 0.01,
        groupUngroupGateway: groupUngroup.result?.ok === true,
        groupUngroupRestoresBoth: groupUngroupedState.target?.parent_id === groupProject.id
            && groupUngroupedState.source?.parent_id === groupProject.id
            && groupUngroupedState.targetProjected === true
            && groupUngroupedState.sourceProjected === true
            && groupUngroupedState.wrapperProjected === false,
        groupUngroupRestoresPixels: groupRestorationPixels.ratio < 0.001,
        noRuntimeErrors: failures.length === 0,
        noMaskToolFailures: maskToolFailures.length === 0,
        noUngroupToolFailures: ungroupToolFailures.length === 0
    };
    report.checks = checks;
    report.ok = Object.values(checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, checks, video: report.video.after,
        videoMotion, groupMaskPixels, groupRestorationPixels,
        screenshots: { video: report.video.screenshots, group: report.group.screenshots },
        failures, maskToolFailures, ungroupToolFailures }, null, 2));
    if (!report.ok) process.exitCode = 2;
} finally {
    await browser.close();
}
