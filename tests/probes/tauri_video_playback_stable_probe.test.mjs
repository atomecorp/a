import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3000';
const PHONE = process.env.ADOLE_TEST_PHONE || '7777000004';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || PHONE;
const OUT_DIR = path.resolve('temp/probe_reports/tauri_video_playback_stable_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const CANVAS_FILE = path.join(OUT_DIR, 'mtrack_canvas.png');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const redact = (value) => String(value || '')
    .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const isAllowedHttpDiagnostic = (url) => /\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(String(url || ''));
const isFailingConsole = (entry) => (
    entry?.type === 'error'
    || entry?.type === 'pageerror'
    || /Failed to load resource|Unhandled Promise Rejection|Cross origin requests|Fetch API cannot load/i.test(entry?.text || '')
);

const waitFor = async (page, predicate, timeout = 30000, interval = 250) => {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeout) {
        last = await page.evaluate(predicate).catch((error) => ({ ok: false, error: error?.message || String(error) }));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(interval);
    }
    return { ok: false, last };
};

const analyzePng = (filePath) => {
    const png = PNG.sync.read(fs.readFileSync(filePath));
    let visible = 0;
    let nonBlack = 0;
    let max = 0;
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const idx = ((y * png.width) + x) * 4;
            if (png.data[idx + 3] < 8) continue;
            visible += 1;
            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];
            max = Math.max(max, r, g, b);
            if (r > 18 || g > 18 || b > 18) nonBlack += 1;
        }
    }
    const ratio = visible > 0 ? nonBlack / visible : 0;
    return { ok: visible > 0 && ratio > 0.03 && max > 40, width: png.width, height: png.height, visible, nonBlack, ratio, max };
};

const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
    ]
});

const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    permissions: ['camera', 'microphone']
});
const page = await context.newPage();
const report = { ok: false, app_url: APP_URL, network_errors: [], request_failures: [], console: [] };

page.on('console', (msg) => report.console.push({ type: msg.type(), text: redact(msg.text()).slice(0, 800) }));
page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: redact(error?.message || String(error || 'pageerror')).slice(0, 800) }));
page.on('requestfailed', (request) => {
    report.request_failures.push({
        url: redact(request.url()),
        error: request.failure()?.errorText || null
    });
});
page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !isAllowedHttpDiagnostic(url)) report.network_errors.push({ status, url: redact(url) });
});

try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);

    report.auth = await page.evaluate(async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_api_missing' };
        let result = await api.auth.login(phone, password, phone);
        const success = !!(result?.tauri?.success || result?.fastify?.success || result?.login?.tauri?.success || result?.login?.fastify?.success);
        if (!success && typeof api.auth.create === 'function') {
            result = await api.auth.create(phone, password, phone, { autoLogin: true });
        }
        const current = await api.auth.current?.();
        return {
            ok: !!current?.logged,
            result,
            user_id: current?.user?.user_id || current?.user?.id || null
        };
    }, { phone: PHONE, password: PASSWORD });
    if (!report.auth.ok) throw new Error('auth_failed');

    report.record = await page.evaluate(async () => {
        const videoApi = await import('/eVe/domains/media/api/video_api.js');
        const fileName = `video_tauri_stable_probe_${Date.now()}.webm`;
        const started = await videoApi.startVideoRecording({ fileName, includeAudio: true, includeVideo: true });
        if (!started?.ok) return { ok: false, started };
        await new Promise((resolve) => setTimeout(resolve, 2400));
        const stopped = await videoApi.stopVideoRecording();
        const atomeId = String(stopped?.project?.atomeId || stopped?.atomeId || '').trim();
        return {
            ok: !!atomeId,
            started,
            stopped,
            atome_id: atomeId,
            file_name: String(stopped?.result?.fileName || fileName),
            duration: Number(stopped?.result?.duration_sec || 0)
        };
    });
    if (!report.record.ok) throw new Error('record_failed');

    report.stream = await page.evaluate(async ({ fileName, userId }) => {
        const query = `media_user_id=${encodeURIComponent(userId)}`;
        const recordingUrl = `/api/recordings/${encodeURIComponent(fileName)}?${query}`;
        const extractUrl = `/api/extract-audio/${encodeURIComponent(fileName)}?${query}`;
        const head = async (url) => {
            const response = await fetch(url, { method: 'HEAD', credentials: 'omit' });
            return { ok: response.ok, status: response.status, type: response.headers.get('content-type') || '' };
        };
        const video = await new Promise((resolve) => {
            const node = document.createElement('video');
            node.muted = true;
            node.playsInline = true;
            node.crossOrigin = 'anonymous';
            node.onloadedmetadata = async () => {
                await node.play().catch(() => {});
                await new Promise((r) => setTimeout(r, 450));
                resolve({
                    ok: Number(node.videoWidth || 0) > 0 && Number(node.currentTime || 0) > 0.05,
                    width: Number(node.videoWidth || 0),
                    height: Number(node.videoHeight || 0),
                    current_time: Number(node.currentTime || 0),
                    duration: Number(node.duration || 0)
                });
                node.remove();
            };
            node.onerror = () => resolve({ ok: false, error: `video_error_${node.error?.code || 0}` });
            document.body.appendChild(node);
            node.src = recordingUrl;
        });
        const audioResponse = await fetch(extractUrl, { credentials: 'omit' });
        const bytes = audioResponse.ok ? await audioResponse.arrayBuffer() : null;
        let audio = { ok: false, status: audioResponse.status };
        if (bytes) {
            const ctx = new AudioContext({ sampleRate: 48000 });
            const decoded = await ctx.decodeAudioData(bytes.slice(0));
            const data = decoded.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
            const rms = Math.sqrt(sum / Math.max(1, data.length));
            audio = { ok: decoded.duration > 1.5 && rms > 0.01, duration: decoded.duration, rms };
            await ctx.close();
        }
        return { ok: video.ok && audio.ok, recording: await head(recordingUrl), extract: await head(extractUrl), video, audio };
    }, { fileName: report.record.file_name, userId: report.auth.user_id });
    if (!report.stream.ok) throw new Error('stream_failed');

    const hostSelector = `[data-atome-id="${report.record.atome_id}"]`;
    await page.locator(hostSelector).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator(hostSelector).first().dblclick({ timeout: 20000, force: true });

    const ready = await waitFor(page, () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const timeline = window.eveMtrackApi?.exportTimeline?.()?.timeline || null;
        const clips = Array.isArray(timeline?.clips) ? timeline.clips : [];
        const canvas = document.querySelector('#eve_mtrack_dialog canvas');
        const rect = canvas?.getBoundingClientRect?.();
        return {
            ok: !!state?.activeGroupId
                && clips.some((clip) => String(clip?.kind || '') === 'video')
                && clips.some((clip) => String(clip?.kind || '') === 'audio')
                && rect?.width > 100
                && rect?.height > 80
        };
    }, 45000);
    report.mtrack_ready = ready;
    if (!ready.ok) throw new Error('mtrack_not_ready');

    await sleep(2200);
    const canvas = page.locator('#eve_mtrack_dialog canvas').first();
    await canvas.screenshot({ path: CANVAS_FILE });
    report.canvas = analyzePng(CANVAS_FILE);
    if (!report.canvas.ok) throw new Error('canvas_blank');

    report.playback = await page.evaluate(async () => {
        const button = Array.from(document.querySelectorAll('#eve_mtrack_dialog button[data-name-key="play"], #eve_mtrack_dialog button[data-tool-id*="play"]'))
            .find((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
        if (!(button instanceof HTMLElement)) return { ok: false, error: 'play_button_missing' };
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const state = window.eveMtrackApi?.getState?.() || {};
        const videos = Array.from(document.querySelectorAll('#eve_mtrack_dialog video')).map((node) => ({
            current_time: Number(node.currentTime || 0),
            paused: node.paused === true,
            ready_state: Number(node.readyState || 0)
        }));
        const audioEngine = state.audioEngine || null;
        const playhead = Number(state.playhead || 0);
        return {
            ok: playhead > 0.75
                && (state.playing === true || state.isPlaying === true)
                && videos.some((video) => video.current_time > 0.4 && video.paused === false)
                && audioEngine?.playing === true,
            playhead,
            playing: state.playing === true || state.isPlaying === true,
            videos,
            audioEngine
        };
    });
    if (!report.playback.ok) throw new Error('playback_failed');

    report.log_audit = {
        network_error_count: report.network_errors.length,
        request_failure_count: report.request_failures.length,
        console_error_count: report.console.filter(isFailingConsole).length
    };
    report.ok = report.network_errors.length === 0
        && report.request_failures.length === 0
        && report.console.filter(isFailingConsole).length === 0;
} catch (error) {
    report.fatal = error?.message || String(error);
} finally {
    writeReport(report);
    await browser.close();
}

if (!report.ok) {
    console.error(JSON.stringify({ ok: false, report: REPORT_FILE, fatal: report.fatal || null }, null, 2));
    process.exit(1);
}

console.log(JSON.stringify({ ok: true, report: REPORT_FILE }, null, 2));
