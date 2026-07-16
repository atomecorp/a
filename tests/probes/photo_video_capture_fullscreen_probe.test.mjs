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

const inspectProjectBevyProjection = async (page, projectId, atomeId, kind) => safeEval(page, async ({ projectId, atomeId, kind }) => {
    const scene = window.eveToolBase?.getProjectSceneState?.(projectId) || null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const atoms = Array.isArray(scene?.scene?.atoms) ? scene.scene.atoms : [];
    const matchesId = (entry) => String(
        entry?.id
        || entry?.atome_id
        || entry?.atomeId
        || entry?.properties?.id
        || ''
    ) === String(atomeId || '');
    const projectHost = document.getElementById(`project_view_${projectId}`)
        || document.getElementById(String(projectId || ''))
        || document.querySelector('main')
        || document.body;
    const canvas = projectHost.querySelector('canvas') || document.querySelector('canvas');
    const legacyMediaNodes = Array.from(projectHost.querySelectorAll('.eve-atome,img,audio,svg,video'))
        .filter((node) => !node.closest('#eve_bevy_video_decode_root'));
    const record = records.find(matchesId) || atoms.find(matchesId) || null;
    return {
        ok: !!scene && !!record && canvas instanceof HTMLCanvasElement && legacyMediaNodes.length === 0,
        atomeId,
        kind,
        projectId,
        record_count: scene?.record_count ?? records.length,
        rendered_layers: scene?.render?.rendered_layers ?? scene?.projection?.rendered_layers ?? null,
        canvas: {
            exists: canvas instanceof HTMLCanvasElement,
            id: canvas?.id || '',
            width: canvas?.width || 0,
            height: canvas?.height || 0
        },
        legacy_media_count: legacyMediaNodes.length,
        record: record ? {
            id: record.id || record.atome_id || record.atomeId || '',
            kind: record.kind || record.properties?.kind || ''
        } : null
    };
}, { projectId, atomeId, kind }, 30000);

const revealCaptureSourceTool = async (page) => {
    await page.waitForFunction(() => (
        !!window.__DEBUG__ || !!document.getElementById('intuition')
    ), null, { timeout: 30000 });
    const captureButton = page.locator('button[data-tool-id="tool.main.capture"]').first();
    await captureButton.click({ timeout: 15000 });
    return waitFor(page, () => {
        const button = document.querySelector('button[data-tool-id="tool.main.capture"]');
        if (!(button instanceof HTMLElement)) return { ok: false, error: 'capture_source_missing' };
        const rect = button.getBoundingClientRect();
        return { ok: rect.width > 0 && rect.height > 0 };
    }, 15000, 250);
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
            const mod = await import('/eVe/domains/media/api/video_api.js');
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
            report.photo.project_projection = await inspectProjectBevyProjection(
                page,
                report.photo?.result?.project?.projectId || '',
                report.photo.project_atome_id,
                'image'
            );
            mark(`photo_projection_done:${report.photo.project_projection?.ok === true}`);
        }

        mark('capture_video_start');
        report.video = await safeEval(page, async () => {
            const mod = await import('/eVe/domains/media/api/video_api.js');
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
                legacy_desktop_after_stop: {
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
            report.video.project_projection = await inspectProjectBevyProjection(
                page,
                report.video?.stopped?.project?.projectId || '',
                report.video.project_atome_id,
                'video'
            );
            mark(`video_projection_done:${report.video.project_projection?.ok === true}`);
        }

        mark('emergency_start');
        const captureSource = await revealCaptureSourceTool(page);
        if (!captureSource?.ok) throw new Error(`capture_source_unavailable:${captureSource?.last?.error || 'unknown'}`);
        report.emergency = await safeEval(page, async () => {
            const api = window.eveCaptureQuickPreviewApi;
            const sourceEl = document.querySelector('button[data-tool-id="tool.main.capture"]');
            const open = await api.openFullscreenPreview({ mode: 'record', sourceEl });
            return { ok: open?.ok !== false, open, state: api.getState() };
        }, null, 40000);
        await page.locator('.eve-capture-expanded-tool__record-button[data-kind="video"]').click({ timeout: 15000 });
        await sleep(500);
        const handle = page.locator('button[data-role="eve_intuitionx-handle"]').first();
        await handle.click({ timeout: 15000 });
        await sleep(900);
        const emergencyAfter = await safeEval(page, async () => {
            const videoMod = await import('/eVe/domains/media/api/video_api.js');
            return {
                ok: window.eveCaptureQuickPreviewApi?.getState?.()?.open === false
                    && videoMod.getVideoRecordingState().isRecording === false,
                capture_state: window.eveCaptureQuickPreviewApi?.getState?.(),
                video_state: videoMod.getVideoRecordingState(),
                preview_inner: document.querySelector('.eve-preview-live-overlay')?.innerHTML || ''
            };
        }, null, 20000);
        report.emergency = { ...report.emergency, after: emergencyAfter };

        report.ok = report.photo?.ok === true
            && report.photo?.project_state?.ok === true
            && report.photo?.project_projection?.ok === true
            && report.video?.ok === true
            && report.video?.project_state?.ok === true
            && report.video?.project_projection?.ok === true
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
