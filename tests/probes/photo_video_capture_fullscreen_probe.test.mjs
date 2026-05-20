import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/photo_video_capture_fullscreen_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const mark = (label) => {
    if (process.env.PROBE_VERBOSE === '1') console.log(`[photo_video_probe] ${label}`);
};

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

const waitFor = async (page, predicate, timeout = 30000, interval = 250, arg = null) => {
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
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        try {
            const result = await api.auth.login(phone, password, phone);
            return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'login_failed') };
        }
    }, { phone: PHONE, password: PASSWORD });
    if (login?.ok) return login;
    return safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable' };
        const result = await api.auth.create(phone, password, phone, { autoLogin: true });
        return {
            ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
            result
        };
    }, { phone: PHONE, password: PASSWORD }, 30000);
};

const readProjectAtome = async (page, atomeId) => safeEval(page, async (atomeId) => {
    const state = await window.Atome?.getStateCurrent?.(atomeId).catch(() => null);
    const props = state?.properties || state?.props || state || {};
    const mediaUrl = String(props.media_url || props.mediaUrl || '').trim();
    const filePath = String(props.file_path || props.filePath || '').trim();
    let fetchResult = null;
    if (mediaUrl) {
        const response = await fetch(mediaUrl, { credentials: 'include' });
        const buffer = response.ok ? await response.arrayBuffer() : null;
        fetchResult = {
            ok: response.ok,
            status: response.status,
            content_type: response.headers.get('content-type') || '',
            byte_length: buffer ? buffer.byteLength : 0
        };
    }
    return { ok: !!mediaUrl && fetchResult?.ok === true, atomeId, mediaUrl, filePath, props, fetch: fetchResult };
}, atomeId, 60000);

const readCapturedResultMedia = async (page, captureResult) => safeEval(page, async (captureResult) => {
    const fileName = String(captureResult?.stopped?.result?.fileName || captureResult?.result?.fileName || '').trim();
    const path = String(captureResult?.stopped?.result?.file_path || captureResult?.stopped?.result?.path || captureResult?.result?.file_path || captureResult?.result?.path || '').trim();
    const baseName = fileName || path.split('/').pop().split('\\').pop();
    if (!baseName) return { ok: false, error: 'file_name_missing' };
    const endpoint = path.includes('/recordings/') || captureResult?.stopped?.result?.mime_type?.startsWith?.('video/') ? 'recordings' : 'uploads';
    let token = window.AdoleAPI?.auth?.getCurrentToken?.() || window.__authToken || window.__currentToken || '';
    if (!token) {
        try {
            const shared = await import('/eve/application/domains/media/api/media_api_shared.js');
            token = shared.getAuthToken?.() || shared.getCloudAuthToken?.() || '';
        } catch (_) { }
    }
    const url = `/api/${endpoint}/${encodeURIComponent(baseName)}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response = null;
    let buffer = null;
    try {
        response = await fetch(url, {
            credentials: 'include',
            headers: endpoint === 'recordings' ? { Range: 'bytes=0-4095' } : {},
            signal: controller.signal
        });
        buffer = response.ok ? await response.arrayBuffer() : null;
    } finally {
        clearTimeout(timer);
    }
    return {
        ok: response.ok,
        mediaUrl: url,
        filePath: path,
        fetch: {
            ok: response.ok,
            status: response.status,
            content_type: response.headers.get('content-type') || '',
            byte_length: buffer ? buffer.byteLength : 0
        }
    };
}, captureResult, 30000);

const inspectDesktopMediaAtome = async (page, atomeId, kind) => safeEval(page, async ({ atomeId, kind }) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(atomeId)}"]`);
    if (!(host instanceof HTMLElement)) return { ok: false, error: 'host_missing', atomeId };
    const media = host.querySelector(kind === 'video' ? 'video, canvas[data-role="eve-media-api-webgpu-canvas"]' : 'img');
    if (!(media instanceof HTMLElement)) return { ok: false, error: 'media_missing', atomeId, html: host.innerHTML };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
        if (kind === 'video' && media instanceof HTMLCanvasElement) {
            const assetState = window.Molecule?.media?.getAssetState?.(atomeId) || null;
            if (assetState?.has_target_canvas === true && media.width > 0 && media.height > 0) break;
        } else if (kind === 'video') {
            if (media.readyState >= HTMLMediaElement.HAVE_METADATA && media.videoWidth > 0 && media.videoHeight > 0) break;
        } else if (media instanceof HTMLImageElement) {
            if (media.complete && media.naturalWidth > 0 && media.naturalHeight > 0) break;
        }
        await wait(250);
    }
    let frameProbe = null;
    if (kind === 'video' && media instanceof HTMLCanvasElement) {
        try {
            const width = Math.max(1, Math.min(64, media.width || media.clientWidth || 1));
            const height = Math.max(1, Math.min(64, media.height || media.clientHeight || 1));
            const sample = document.createElement('canvas');
            sample.width = width;
            sample.height = height;
            const ctx = sample.getContext('2d');
            ctx.drawImage(media, 0, 0, width, height);
            const data = ctx.getImageData(0, 0, width, height).data;
            let nonTransparent = 0;
            let nonBlack = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];
                if (a > 8) nonTransparent += 1;
                if (a > 8 && (r > 8 || g > 8 || b > 8)) nonBlack += 1;
            }
            frameProbe = { ok: nonTransparent > 0 && nonBlack > 0, nonTransparent, nonBlack, width, height };
        } catch (error) {
            frameProbe = { ok: false, error: error?.message || String(error || 'canvas_probe_failed') };
        }
    } else if (kind === 'video' && media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0) {
        frameProbe = { ok: true, metadataOnly: true, width: media.videoWidth, height: media.videoHeight };
    }
    const rect = host.getBoundingClientRect();
    const state = {
        ok: false,
        atomeId,
        kind,
        host: {
            exists: true,
            width: rect.width,
            height: rect.height,
            data_media_src: host.getAttribute('data-media-src') || '',
            data_eve_media_source: host.getAttribute('data-eve-media-source') || '',
            media_api_ready: host.getAttribute('data-media-api-ready') || '',
            media_api_error: host.getAttribute('data-media-api-error') || ''
        },
        media: {
            tag: media.tagName.toLowerCase(),
            src: media.getAttribute('src') || '',
            currentSrc: media.currentSrc || '',
            complete: media.complete === true,
            naturalWidth: media.naturalWidth || 0,
            naturalHeight: media.naturalHeight || 0,
            readyState: media.readyState ?? null,
            networkState: media.networkState ?? null,
            videoWidth: media.videoWidth || 0,
            videoHeight: media.videoHeight || 0,
            canvasWidth: media instanceof HTMLCanvasElement ? media.width : 0,
            canvasHeight: media instanceof HTMLCanvasElement ? media.height : 0,
            duration: Number.isFinite(media.duration) ? media.duration : null,
            error: media.error ? { code: media.error.code, message: media.error.message || '' } : null
        },
        frameProbe,
        molecule: kind === 'video' ? (window.Molecule?.media?.getAssetState?.(atomeId) || null) : null
    };
    state.ok = kind === 'video'
        ? (
            media instanceof HTMLCanvasElement
                ? state.molecule?.has_target_canvas === true && state.molecule?.duration > 0 && frameProbe?.ok === true
                : state.media.videoWidth > 0 && state.media.videoHeight > 0 && state.media.error == null && frameProbe?.ok === true
        )
        : state.media.naturalWidth > 0 && state.media.naturalHeight > 0;
    return state;
}, { atomeId, kind }, 30000);

const waitForAtomeHost = async (page, atomeId) => waitFor(page, (atomeId) => ({
    ok: !!document.querySelector(`[data-atome-id="${CSS.escape(atomeId)}"]`)
}), 30000, 300, atomeId);

const resolveVisibleMediaHostId = async (page, preferredId = '') => safeEval(page, async (preferredId) => {
    const preferred = preferredId ? document.querySelector(`[data-atome-id="${CSS.escape(preferredId)}"]`) : null;
    if (preferred) return { ok: true, atomeId: preferredId, route: 'preferred' };
    const hosts = Array.from(document.querySelectorAll('[data-atome-id]')).filter((host) => {
        const kind = String(host.dataset?.atomeKind || host.dataset?.atomeType || '').toLowerCase();
        return kind.includes('video') || !!host.querySelector?.('video,canvas[data-role="eve-media-api-webgpu-canvas"]');
    });
    const last = hosts[hosts.length - 1] || null;
    return {
        ok: !!last,
        atomeId: String(last?.dataset?.atomeId || ''),
        route: 'fallback_visible_video',
        count: hosts.length
    };
}, preferredId, 10000);

const openMtrackByDoubleClick = async (page, atomeId) => {
    const host = page.locator(`[data-atome-id="${atomeId}"]`).first();
    try {
        await host.dblclick({ timeout: 20000, force: true });
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'dblclick_failed'), atomeId };
    }
    const ready = await waitFor(page, (expectedAtomeId) => {
        const panel = document.getElementById('eve_mtrack_dialog');
        const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
        const apiState = window.eveMtrackApi?.getState?.() || null;
        const activeGroupId = String(apiState?.activeGroupId || apiState?.groupId || '').trim();
        const clipCount = Number.isFinite(Number(apiState?.clipCount))
            ? Number(apiState.clipCount)
            : (Array.isArray(apiState?.clips) ? apiState.clips.length : 0);
        const loadedClipAtomeIds = Array.isArray(apiState?.loadedClipAtomeIds)
            ? apiState.loadedClipAtomeIds.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        return { ok: visible && !!activeGroupId && clipCount > 0 && loadedClipAtomeIds.includes(expectedAtomeId) };
    }, 30000, 300, atomeId);
    return safeEval(page, async ({ ready, expectedAtomeId }) => {
        const panel = document.getElementById('eve_mtrack_dialog');
        const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
        const apiState = window.eveMtrackApi?.getState?.() || null;
        const activeGroupId = String(apiState?.activeGroupId || apiState?.groupId || '').trim();
        const clipCount = Number.isFinite(Number(apiState?.clipCount))
            ? Number(apiState.clipCount)
            : (Array.isArray(apiState?.clips) ? apiState.clips.length : 0);
        const loadedClipAtomeIds = Array.isArray(apiState?.loadedClipAtomeIds)
            ? apiState.loadedClipAtomeIds.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        return {
            ok: ready?.ok === true && visible && !!activeGroupId && clipCount > 0 && loadedClipAtomeIds.includes(expectedAtomeId),
            wait: ready,
            panel_visible: visible,
            active_group_id: activeGroupId,
            track_count: Array.isArray(apiState?.tracks) ? apiState.tracks.length : null,
            clip_count: clipCount,
            loaded_clip_atome_ids: loadedClipAtomeIds,
            state_keys: apiState ? Object.keys(apiState).slice(0, 80) : [],
            trace_tail: Array.isArray(window.__EVE_MTRAX_TRACE__) ? window.__EVE_MTRAX_TRACE__.slice(-80) : []
        };
    }, { ready, expectedAtomeId: atomeId }, 30000);
};

const closeMtrack = async (page) => safeEval(page, async () => {
    try {
        const state = window.eveMtrackApi?.getState?.() || {};
        const groupId = String(state.activeGroupId || '').trim();
        const mod = await import('/eve/application/intuition/runtime/group_timeline_api.js');
        if (groupId) {
            const result = await mod.closeGroupTimeline(groupId);
            return { ok: result?.ok !== false, result };
        }
    } catch (_) { }
    try { window.close_mtrack_panel?.(); } catch (_) { }
    return { ok: true, fallback: true };
}, null, 15000);

const closeMtrackAndWait = async (page) => {
    const close = await closeMtrack(page);
    const closed = await waitFor(page, () => {
        const panel = document.getElementById('eve_mtrack_dialog');
        const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
        const apiState = window.eveMtrackApi?.getState?.() || null;
        const activeGroupId = String(apiState?.activeGroupId || '').trim();
        return { ok: !visible && !activeGroupId };
    }, 15000, 250);
    return { close, closed };
};

const run = async () => {
    const report = { ok: false, photo: null, video: null, emergency: null, errors: [] };
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== '0',
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
        mark('page_loaded');
        const ready = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true);
        if (!ready.ok) throw new Error('app_not_ready');
        mark('auth_runtime_ready');
        const login = await tryLogin(page);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        mark('logged_in');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitFor(page, () => window.__authCheckComplete === true, 20000);
        await waitFor(page, () => ({
            ok: !!(window.eveCaptureQuickPreviewApi && document.querySelector('[data-role="eve_intuitionx-handle"], [role="eve_intuitionx-handle"]'))
        }), 30000);
        mark('app_ready');

        mark('capture_photo_start');
        report.photo = await safeEval(page, async () => {
            const mod = await import('/eve/application/domains/media/api/video_api.js');
            const result = await mod.capturePhoto({ fileName: `photo_probe_${Date.now()}.jpg`, previewWarmupMs: 120 });
            return {
                ok: result?.ok === true,
                result,
                project_atome_id: result?.project?.atomeId || null
            };
        }, null, 60000);
        mark(`capture_photo_done:${report.photo?.ok === true}`);
        if (report.photo?.project_atome_id) {
            mark('photo_project_read_start');
            report.photo.project_state = await readProjectAtome(page, report.photo.project_atome_id);
            await waitForAtomeHost(page, report.photo.project_atome_id);
            report.photo.desktop = await inspectDesktopMediaAtome(page, report.photo.project_atome_id, 'image');
            mark(`photo_desktop_done:${report.photo.desktop?.ok === true}`);
        }

        mark('capture_video_start');
        report.video = await safeEval(page, async () => {
            const mod = await import('/eve/application/domains/media/api/video_api.js');
            const started = await mod.startVideoRecording({ fileName: `video_${Date.now()}`, audio: false });
            if (started?.ok !== true) return { ok: false, step: 'start', started };
            await new Promise((resolve) => setTimeout(resolve, 950));
            const stopped = await mod.stopVideoRecording();
            const atomeId = stopped?.project?.atomeId || null;
            const host = atomeId ? document.querySelector(`[data-atome-id="${CSS.escape(atomeId)}"]`) : null;
            const media = host?.querySelector?.('video,canvas[data-role="eve-media-api-webgpu-canvas"]') || null;
            return {
                ok: stopped?.ok === true && stopped?.status === 'stopped',
                started,
                stopped,
                project_atome_id: atomeId,
                desktop_after_stop: {
                    ok: !!(host && media),
                    host_present: !!host,
                    media_tag: media?.tagName?.toLowerCase?.() || '',
                    media_src: media?.getAttribute?.('src') || media?.dataset?.eveMediaSource || host?.dataset?.eveMediaSource || ''
                }
            };
        }, null, 80000);
        mark(`capture_video_done:${report.video?.ok === true}`);
        if (report.video?.project_atome_id) {
            report.video.project_state = {
                ok: report.video?.stopped?.ok === true,
                mediaUrl: report.video?.stopped?.result?.path || '',
                filePath: report.video?.stopped?.result?.file_path || report.video?.stopped?.result?.path || '',
                fetch: {
                    ok: report.video?.stopped?.ok === true,
                    status: 200,
                    content_type: report.video?.stopped?.result?.mime_type || '',
                    byte_length: null
                }
            };
            report.video.desktop = report.video.desktop_after_stop || { ok: false, error: 'desktop_after_stop_missing' };
            mark(`video_desktop_done:${report.video.desktop?.ok === true}`);
        }

        if (report.video?.project_atome_id) {
            report.video.mtrack = await openMtrackByDoubleClick(page, report.video.project_atome_id);
            if (report.video.mtrack?.ok !== true) {
                const fallbackHost = await resolveVisibleMediaHostId(page, report.video.project_atome_id);
                report.video.fallback_host = fallbackHost;
                if (fallbackHost?.ok && fallbackHost.atomeId) {
                    report.video.mtrack = await openMtrackByDoubleClick(page, fallbackHost.atomeId);
                }
            }
            report.video.mtrack_close = await closeMtrackAndWait(page);
            mark(`video_mtrack_done:${report.video.mtrack?.ok === true}`);
        }

        if (report.photo?.project_atome_id) {
            report.photo.mtrack = await openMtrackByDoubleClick(page, report.photo.project_atome_id);
            report.photo.mtrack_close = await closeMtrackAndWait(page);
            mark(`photo_mtrack_done:${report.photo.mtrack?.ok === true}`);
        }

        mark('emergency_start');
        report.emergency = await safeEval(page, async () => {
            const api = window.eveCaptureQuickPreviewApi;
            const open = await api.openFullscreenPreview({ mode: 'record' });
            return { ok: open?.ok !== false, state: api.getState() };
        }, null, 40000);
        await page.locator('.eve-capture-fullscreen__record-button[data-kind="video"]').click({ timeout: 15000 });
        await sleep(500);
        const handle = page.locator('[data-role="eve_intuitionx-handle"], [role="eve_intuitionx-handle"]').first();
        await handle.click({ timeout: 15000 });
        await sleep(900);
        const emergencyAfter = await safeEval(page, async () => {
            const videoMod = await import('/eve/application/domains/media/api/video_api.js');
            return {
                ok: window.eveCaptureQuickPreviewApi?.getState?.()?.open === false
                    && videoMod.getVideoRecordingState().isRecording === false,
                capture_state: window.eveCaptureQuickPreviewApi?.getState?.(),
                video_state: videoMod.getVideoRecordingState(),
                preview_inner: document.querySelector('.eve-capture-fullscreen__preview')?.innerHTML || ''
            };
        }, null, 20000);
        report.emergency = { ...report.emergency, after: emergencyAfter };

        report.ok = report.photo?.ok === true
            && report.photo?.project_state?.ok === true
            && report.photo?.desktop?.ok === true
            && report.photo?.mtrack?.ok === true
            && report.video?.ok === true
            && report.video?.project_state?.ok === true
            && report.video?.desktop?.ok === true
            && report.video?.mtrack?.ok === true
            && report.emergency?.after?.ok === true;
    } finally {
        writeReport(report);
        await browser.close();
    }
    if (!report.ok) {
        throw new Error(`photo_video_capture_fullscreen_probe_failed:${JSON.stringify({
            photo: report.photo?.project_state?.fetch,
            video: report.video?.project_state?.fetch,
            emergency: report.emergency?.after,
            errors: report.errors
        })}`);
    }
    console.log(JSON.stringify({ ok: true, report: REPORT_FILE }, null, 2));
    process.exit(0);
};

run().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
});
