import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ensureProject } from './dashboard_workspace_stress/product_actions.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/photo_video_recording_bevy_capture_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null, timeout = 30000) => {
    try {
        return await Promise.race([
            page.evaluate(fn, arg),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`eval_timeout_${timeout}`)), timeout))
        ]);
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeout = 30000, interval = 100, arg = null) => {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeout) {
        last = await safeEval(page, predicate, arg, Math.min(timeout, interval + 4000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(interval);
    }
    return { ok: false, last };
};

const tryLogin = async (page) => {
    const login = await safeEval(page, async ({ phone, password }) => {
        const result = await window.AdoleAPI?.auth?.login?.(phone, password, phone);
        return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
    }, { phone: PHONE, password: PASSWORD });
    if (login?.ok) return login;
    return safeEval(page, async ({ phone, password }) => {
        const result = await window.AdoleAPI?.auth?.create?.(phone, password, phone, { autoLogin: true });
        return {
            ok: !!(result?.fastify?.success || result?.tauri?.success
                || result?.login?.fastify?.success || result?.login?.tauri?.success),
            result
        };
    }, { phone: PHONE, password: PASSWORD }, 30000);
};

const clickBevyMainMenuItem = async (page, nodeId) => {
    const target = await page.evaluate((targetId) => {
        const surface = document.getElementById('eve_surface_project');
        const runtime = window.eveBevyUiRuntime;
        const rect = surface?.getBoundingClientRect?.();
        if (!surface || !runtime?.hitTestAtClientPoint || !rect) {
            return { ok: false, error: 'bevy_surface_or_hit_test_missing' };
        }
        for (let y = Math.max(0, rect.height - 90); y < rect.height; y += 2) {
            for (let x = 0; x < rect.width; x += 2) {
                const hit = runtime.hitTestAtClientPoint({
                    surface,
                    clientX: rect.left + x,
                    clientY: rect.top + y
                });
                if (String(hit?.nodeId || '') === targetId) {
                    return { ok: true, clientX: rect.left + x, clientY: rect.top + y, box: hit.box };
                }
            }
        }
        return { ok: false, error: 'bevy_menu_item_not_found', nodeId: targetId };
    }, nodeId);
    if (!target?.ok) throw new Error(`bevy_menu_click_target_failed:${JSON.stringify(target)}`);
    await page.mouse.click(target.clientX, target.clientY);
    return target;
};

const readMenuVisual = (page, suffix) => page.evaluate((nodeSuffix) => {
    const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_main_menu')?.tree || null;
    let found = null;
    let absolutePosition = null;
    const visit = (node, parentX = 0, parentY = 0) => {
        if (!node || found) return;
        const localX = Number(node.style?.position?.[0] || 0);
        const localY = Number(node.style?.position?.[1] || 0);
        const x = parentX + localX;
        const y = parentY + localY;
        if (String(node.id || '').endsWith(nodeSuffix)) {
            found = node;
            absolutePosition = [x, y];
        }
        (node.children || []).forEach((child) => visit(child, x, y));
    };
    visit(tree?.root);
    const surface = document.getElementById('eve_surface_project');
    const surfaceRect = surface?.getBoundingClientRect?.();
    return {
        ok: !!found,
        id: found?.id || '',
        kind: found?.kind || '',
        position: absolutePosition,
        localPosition: found?.style?.position || null,
        size: found?.style?.size || null,
        overlayType: found?.overlayRecord?.type || '',
        source: found?.overlayRecord?.properties?.source || '',
        surfaceRect: surfaceRect ? {
            left: surfaceRect.left, top: surfaceRect.top,
            width: surfaceRect.width, height: surfaceRect.height
        } : null
    };
}, suffix);

const readSceneMediaIds = (page, projectId) => page.evaluate((id) => {
    const records = window.eveToolBase?.getProjectSceneState?.(id)?.records || [];
    return records.map((record) => ({
        id: String(record?.id || record?.atome_id || ''),
        kind: String(record?.kind || record?.properties?.kind || '')
    }));
}, projectId);

const readAtomeMedia = (page, { projectId, atomeId }) => safeEval(page, async ({ projectId, atomeId }) => {
    const state = await window.Atome?.getStateCurrent?.(atomeId).catch(() => null);
    const props = state?.properties || state?.props || {};
    const scene = window.eveToolBase?.getProjectSceneState?.(projectId) || {};
    const occurrences = (scene.records || []).filter((record) => (
        String(record?.id || record?.atome_id || '') === atomeId
    )).length;
    const source = String(props.media_url || props.src || '').trim();
    const response = source ? await fetch(source, { credentials: 'include' }) : null;
    const bytes = response?.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array();
    return {
        ok: occurrences === 1 && response?.ok === true && bytes.length > 0,
        atomeId,
        occurrences,
        props,
        source,
        byteLength: bytes.length,
        signature: Array.from(bytes.slice(0, 12))
    };
}, { projectId, atomeId }, 60000);

const run = async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const report = { ok: false, project: null, video: null, photo: null, menu: null, errors: [] };
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== '0',
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            ...(process.env.EVE_FAKE_VIDEO_FILE
                ? [`--use-file-for-fake-video-capture=${path.resolve(process.env.EVE_FAKE_VIDEO_FILE)}`]
                : [])
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ready = await waitFor(page, () => ({
            ok: !!window.AdoleAPI && window.__authCheckComplete === true
        }));
        if (!ready.ok) throw new Error('app_not_ready');
        const login = await tryLogin(page);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        const workspaceReady = await waitFor(page, () => ({
            ok: window.__authCheckComplete === true
                && typeof window.eveToolBase?.loadProjectAtomes === 'function'
                && typeof window.eveToolBase?.renderProjectScene === 'function'
        }), 30000);
        if (!workspaceReady.ok) throw new Error('workspace_runtime_not_ready');
        const project = await ensureProject(page, `Photo video Bevy probe ${Date.now()}`);
        if (!project?.ok) throw new Error(`project_create_failed:${JSON.stringify(project)}`);
        report.project = project;
        const activated = await safeEval(page, async (entry) => {
            const module = await import('/eVe/intuition/matrix/core/project_data.js');
            return module.activateProjectWorkspace(entry, { force: true, staleFirst: false });
        }, project, 60000);
        if (!activated?.ok) throw new Error(`project_activation_failed:${JSON.stringify(activated)}`);
        const menuReady = await waitFor(page, () => ({
            ok: window.eveBevyUiRuntime?.state?.trees?.has?.('eve_bevy_ui_main_menu') === true
                && !!document.getElementById('eve_surface_project')
        }), 30000);
        if (!menuReady.ok) throw new Error('bevy_main_menu_not_ready');

        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture');
        const paletteReady = await waitFor(page, async () => {
            const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            return { ok: module.getMainMenuRuntime()?.measure?.()?.activePaletteKey === 'capture' };
        }, 15000, 50);
        if (!paletteReady.ok) throw new Error('capture_palette_not_open');

        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture__video');
        const videoStarted = await waitFor(page, async () => {
            const module = await import('/eVe/domains/media/api/video_api.js');
            const state = module.getVideoRecordingState?.() || {};
            return { ok: state.isRecording === true && !!state.projectAtomeId, state };
        }, 20000, 50);
        if (!videoStarted.ok) throw new Error(`video_real_click_start_failed:${JSON.stringify(videoStarted.last)}`);
        const videoTrackMetadata = await safeEval(page, async () => {
            const module = await import('/eVe/domains/media/api/video_api.js');
            const track = module.getVideoRecordingState?.()?.stream?.getVideoTracks?.()?.[0];
            return {
                settings: track?.getSettings?.() || {},
                constraints: track?.getConstraints?.() || {},
                capabilities: track?.getCapabilities?.() || {}
            };
        });
        const previewReady = await waitFor(page, async () => {
            const menuModule = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const overlayModule = await import('/eVe/domains/rendering/bevy_ui_project_overlay_runtime.js');
            const sourceModule = await import('/eVe/domains/rendering/bevy_video_stream_source_runtime.js');
            const visual = menuModule.getMainMenuRuntime()?.getToolRecordingVisual?.({ toolId: 'ui.capture.video' });
            const recordId = overlayModule.bevyUiOverlayRecordId(
                'eve_bevy_ui_main_menu',
                'eve_bevy_ui_main_menu_tool_capture__video_recording_video'
            );
            const status = sourceModule.getBevyVideoStreamSourceStatus({ id: recordId });
            return {
                ok: visual?.kind === 'video_preview'
                    && visual?.phase === 'recording'
                    && !!visual?.sourceId
                    && status.exists === true
                    && status.active === true
                    && status.presentable === true
                    && status.frameVersion > 0,
                visual: visual ? {
                    kind: visual.kind, phase: visual.phase, sourceId: visual.sourceId
                } : null,
                status,
                recordId
            };
        }, 15000, 50);
        if (!previewReady.ok) {
            const diagnostic = await safeEval(page, async () => {
                const module = await import('/eVe/domains/media/api/video_api.js');
                const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_main_menu')?.tree;
                const recordingNodes = [];
                const visit = (node) => {
                    if (!node) return;
                    if (String(node.id || '').includes('capture__video_recording')) {
                        recordingNodes.push({
                            id: node.id,
                            kind: node.kind,
                            overlayType: node.overlayRecord?.type || '',
                            source: node.overlayRecord?.properties?.source || ''
                        });
                    }
                    (node.children || []).forEach(visit);
                };
                visit(tree?.root);
                const menuModule = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                return {
                    videoState: module.getVideoRecordingState?.(),
                    visual: menuModule.getMainMenuRuntime()?.getToolRecordingVisual?.({ toolId: 'ui.capture.video' }),
                    recordingNodes
                };
            });
            throw new Error(`video_preview_not_attached_inside_tool:${JSON.stringify(diagnostic)}`);
        }
        const preview = {
            ...(await readMenuVisual(page, 'capture__video_recording_video')),
            source: previewReady.last.visual.sourceId,
            sourceStatus: previewReady.last.status,
            recordId: previewReady.last.recordId
        };
        const clip = {
            x: Math.max(0, preview.surfaceRect.left + preview.position[0]),
            y: Math.max(0, preview.surfaceRect.top + preview.position[1]),
            width: Math.max(1, preview.size[0]),
            height: Math.max(1, preview.size[1])
        };
        const readPreviewMotion = () => page.evaluate(async (recordId) => {
            const sourceModule = await import('/eVe/domains/rendering/bevy_video_stream_source_runtime.js');
            const video = window.__EVE_BEVY_VIDEO_SOURCE_FOR_ID__?.(recordId) || null;
            return {
                status: sourceModule.getBevyVideoStreamSourceStatus({ id: recordId }),
                currentTime: Number(video?.currentTime || 0),
                width: Number(video?.videoWidth || 0),
                height: Number(video?.videoHeight || 0)
            };
        }, preview.recordId);
        const motionA = await readPreviewMotion();
        const frameA = await page.screenshot({ path: path.join(OUT_DIR, 'video_preview_a.png'), clip });
        await sleep(350);
        const frameB = await page.screenshot({ path: path.join(OUT_DIR, 'video_preview_b.png'), clip });
        const motionB = await readPreviewMotion();
        const previewAnimated = motionB.status.frameVersion > motionA.status.frameVersion
            && motionB.currentTime > motionA.currentTime
            && motionB.width > 0
            && motionB.height > 0;
        await sleep(1000);
        const videoAtomeId = videoStarted.last.state.projectAtomeId;
        await page.evaluate(() => {
            const handlers = window.eveBevyUiRuntime?.state?.handlers;
            const key = 'eve_bevy_ui_main_menu:eve_bevy_ui_main_menu_tool_capture__video:activate';
            const original = handlers?.get?.(key);
            if (typeof original !== 'function') throw new Error('video_stop_handler_not_found');
            window.__PROBE_VIDEO_STOP_RESULT__ = null;
            handlers.set(key, async (event) => {
                try {
                    const result = await original(event);
                    window.__PROBE_VIDEO_STOP_RESULT__ = result;
                    return result;
                } catch (error) {
                    window.__PROBE_VIDEO_STOP_RESULT__ = {
                        ok: false,
                        thrown: true,
                        error: error?.message || String(error || ''),
                        code: error?.code || null,
                        detail: error?.detail || null
                    };
                    throw error;
                }
            });
        });
        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture__video');
        const videoStopped = await waitFor(page, async (atomeId) => {
            const module = await import('/eVe/domains/media/api/video_api.js');
            const controllerModule = await import('/eVe/domains/media/api/video_recording_controller.js');
            const state = module.getVideoRecordingState?.() || {};
            const controller = controllerModule.getVideoRecordingControllerState?.() || {};
            const record = await window.Atome?.getStateCurrent?.(atomeId).catch(() => null);
            return {
                ok: state.isRecording !== true && (!!record || controller.status === 'error'),
                state: {
                    isRecording: state.isRecording === true,
                    pending: state.pending === true,
                    fileName: state.fileName || null,
                    projectAtomeId: state.projectAtomeId || null
                },
                recordPresent: !!record,
                controller: {
                    status: controller.status || null,
                    recording: controller.recording === true,
                    pending: controller.pending === true,
                    error: controller.error || null,
                    lastResult: controller.lastResult || null
                }
            };
        }, 60000, 100, videoAtomeId);
        if (!videoStopped.ok || videoStopped.last?.recordPresent !== true) {
            const stopResult = await safeEval(page, () => window.__PROBE_VIDEO_STOP_RESULT__);
            throw new Error(`video_real_click_stop_failed:${JSON.stringify({
                state: videoStopped.last,
                stopResult,
                videoTrackMetadata
            })}`);
        }
        const videoMedia = await readAtomeMedia(page, { projectId: project.id, atomeId: videoAtomeId });
        report.video = {
            ok: videoMedia.ok && previewAnimated,
            preview,
            previewAnimated,
            previewScreenshotChanged: !frameA.equals(frameB),
            motionA,
            motionB,
            media: videoMedia
        };

        const beforePhoto = await readSceneMediaIds(page, project.id);
        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture__photo');
        let flashObserved = false;
        const flashDeadline = Date.now() + 500;
        while (!flashObserved && Date.now() < flashDeadline) {
            const flash = await readMenuVisual(page, 'capture__photo_recording_flash');
            flashObserved = flash?.ok === true;
            if (!flashObserved) await sleep(10);
        }
        const beforeIds = new Set(beforePhoto.map((entry) => entry.id));
        const photoCreated = await waitFor(page, (input) => {
            const records = window.eveToolBase?.getProjectSceneState?.(input.projectId)?.records || [];
            const created = records.find((record) => {
                const id = String(record?.id || record?.atome_id || '');
                const kind = String(record?.kind || record?.properties?.kind || '').toLowerCase();
                return !input.beforeIds.includes(id) && (kind === 'image' || kind === 'photo');
            });
            return { ok: !!created, atomeId: String(created?.id || created?.atome_id || '') };
        }, 60000, 100, { projectId: project.id, beforeIds: Array.from(beforeIds) });
        if (!photoCreated.ok) throw new Error(`photo_real_click_failed:${JSON.stringify(photoCreated.last)}`);
        const photoMedia = await readAtomeMedia(page, {
            projectId: project.id,
            atomeId: photoCreated.last.atomeId
        });
        const jpeg = photoMedia.signature[0] === 0xff && photoMedia.signature[1] === 0xd8;
        report.photo = { ok: flashObserved && photoMedia.ok && jpeg, flashObserved, jpeg, media: photoMedia };

        report.menu = await safeEval(page, async () => {
            const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const measure = module.getMainMenuRuntime()?.measure?.() || {};
            const surface = document.getElementById('eve_surface_project');
            const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_main_menu')?.tree;
            let menuItem = null;
            const visit = (node) => {
                if (!node || menuItem) return;
                if (node.id === 'eve_bevy_ui_main_menu_tool_atome') menuItem = node;
                (node.children || []).forEach(visit);
            };
            visit(tree?.root);
            const y = Number(menuItem?.style?.position?.[1] || 0);
            const height = Number(menuItem?.style?.size?.[1] || 0);
            const surfaceHeight = Number(surface?.getBoundingClientRect?.()?.height || 0);
            return {
                ok: measure.active === true && measure.treeMounted === true && y + height === surfaceHeight,
                y, height, surfaceHeight
            };
        });
        report.ok = report.video?.ok === true
            && report.photo?.ok === true
            && report.menu?.ok === true
            && report.errors.length === 0;
    } finally {
        fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        await browser.close();
    }
    if (!report.ok) throw new Error(`photo_video_bevy_probe_failed:${JSON.stringify(report)}`);
    console.log(JSON.stringify({ ok: true, report: REPORT_FILE }, null, 2));
};

run().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
});
