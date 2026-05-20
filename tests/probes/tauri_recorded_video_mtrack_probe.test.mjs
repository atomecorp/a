import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const PHONE = process.env.ADOLE_TEST_PHONE || '77777777';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '77777777';
const OUT_DIR = path.resolve('temp/probe_reports/tauri_recorded_video_mtrack_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const CANVAS_SCREENSHOT_FILE = path.join(OUT_DIR, 'mtrack_canvas.png');
const FORCE_TAURI_RUNTIME = process.env.PROBE_TAURI_RUNTIME === '1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const mark = (label) => {
    if (process.env.PROBE_VERBOSE === '1') console.log(`[tauri_recorded_video_mtrack_probe] ${label}`);
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
        last = await safeEval(page, predicate, arg, Math.min(timeout, interval + 5000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(interval);
    }
    return { ok: false, last };
};

const clickMtrackPlayTool = async (page) => {
    const selector = '#eve_mtrack_dialog button[data-name-key="play"], #eve_mtrack_dialog button[data-tool-id*="play"], #eve_mtrack_dialog button[data-label="play"]';
    const buttonInfo = await safeEval(page, (sel) => {
        const buttons = Array.from(document.querySelectorAll(sel));
        return buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
                text: String(button.textContent || ''),
                name_key: String(button.dataset?.nameKey || ''),
                tool_id: String(button.dataset?.toolId || button.dataset?.tool_id || ''),
                label: String(button.dataset?.label || ''),
                latched: button.dataset?.latched === 'true' || button.dataset?.active === 'true',
                visible: rect.width > 0 && rect.height > 0
            };
        });
    }, selector, 8000);
    const visibleCount = Array.isArray(buttonInfo) ? buttonInfo.filter((entry) => entry.visible).length : 0;
    if (visibleCount !== 1) return { ok: false, error: 'play_button_not_unique', buttonInfo };
    const clickPoint = await safeEval(page, (sel) => {
        const button = Array.from(document.querySelectorAll(sel)).find((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        if (!(button instanceof HTMLElement)) return { ok: false, error: 'play_button_missing' };
        const rect = button.getBoundingClientRect();
        const points = [
            [0.5, 0.5],
            [0.25, 0.5],
            [0.75, 0.5],
            [0.5, 0.25],
            [0.5, 0.75]
        ].map(([xRatio, yRatio]) => ({
            x: Math.round(rect.left + (rect.width * xRatio)),
            y: Math.round(rect.top + (rect.height * yRatio))
        }));
        for (const point of points) {
            const target = document.elementFromPoint(point.x, point.y);
            const targetButton = target instanceof Element ? target.closest('button') : null;
            if (targetButton === button) {
                return {
                    ok: true,
                    x: point.x,
                    y: point.y,
                    target_tag: target?.tagName || '',
                    target_role: target instanceof HTMLElement ? String(target.dataset?.role || target.getAttribute('role') || '') : '',
                    target_name_key: target instanceof HTMLElement ? String(target.dataset?.nameKey || '') : ''
                };
            }
        }
        const centerTarget = document.elementFromPoint(Math.round(rect.left + (rect.width / 2)), Math.round(rect.top + (rect.height / 2)));
        return {
            ok: false,
            error: 'play_button_covered',
            center_target_tag: centerTarget?.tagName || '',
            center_target_role: centerTarget instanceof HTMLElement ? String(centerTarget.dataset?.role || centerTarget.getAttribute('role') || '') : '',
            center_target_name_key: centerTarget instanceof HTMLElement ? String(centerTarget.dataset?.nameKey || '') : '',
            rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            }
        };
    }, selector, 8000);
    if (clickPoint?.ok !== true) return { ok: false, error: clickPoint?.error || 'play_click_point_missing', buttonInfo, clickPoint };
    await safeEval(page, () => {
        window.__MTRACK_UI_PLAY_TRACE__ = [];
        const api = window.eveMtrackApi || null;
        if (!api || api.__tauriRecordedPlayProbeWrapped === true) return;
        ['play', 'pause', 'stop', 'togglePlay', 'loadGroupTimeline'].forEach((method) => {
            const original = api[method];
            if (typeof original !== 'function') return;
            api[method] = async function wrappedMtrackProbeMethod(...args) {
                const startedAt = Date.now();
                let result = null;
                let error = null;
                try {
                    result = await original.apply(this, args);
                    return result;
                } catch (err) {
                    error = String(err?.message || err || 'error');
                    throw err;
                } finally {
                    window.__MTRACK_UI_PLAY_TRACE__.push({
                        method,
                        args: args.map((arg) => {
                            try { return JSON.parse(JSON.stringify(arg)); } catch (_) { return String(arg); }
                        }),
                        result: result && typeof result === 'object' ? result : { value: result },
                        error,
                        elapsed_ms: Date.now() - startedAt,
                        state_after: typeof api.getState === 'function' ? api.getState() : null
                    });
                }
            };
        });
        Object.defineProperty(api, '__tauriRecordedPlayProbeWrapped', { value: true, configurable: true });
    }, null, 8000);
    await page.mouse.click(clickPoint.x, clickPoint.y);
    return { ok: true, buttonInfo, clickPoint, clickResult: { ok: true, method: 'mouse_click_exposed_point' } };
};

const readFfprobe = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'file_missing', filePath };
    try {
        const raw = execFileSync('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,sample_rate,channels,width,height,duration',
            '-of', 'json',
            filePath
        ], { encoding: 'utf8', timeout: 20000 });
        const parsed = JSON.parse(raw);
        const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
        return {
            ok: true,
            filePath,
            size: Number(parsed?.format?.size || 0),
            duration: Number.parseFloat(parsed?.format?.duration || '0') || 0,
            streams,
            has_video: streams.some((stream) => stream.codec_type === 'video'),
            has_audio: streams.some((stream) => stream.codec_type === 'audio')
        };
    } catch (error) {
        return { ok: false, filePath, error: error?.message || String(error || 'ffprobe_failed') };
    }
};

const analyzePngPixels = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'png_missing', filePath };
    const png = PNG.sync.read(fs.readFileSync(filePath));
    let visible = 0;
    let nonBlack = 0;
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const idx = ((y * png.width) + x) * 4;
            const alpha = png.data[idx + 3];
            if (alpha < 8) continue;
            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];
            const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
            visible += 1;
            sum += luminance;
            min = Math.min(min, luminance);
            max = Math.max(max, luminance);
            if (r > 18 || g > 18 || b > 18) nonBlack += 1;
        }
    }
    const nonBlackRatio = visible > 0 ? nonBlack / visible : 0;
    const meanLuminance = visible > 0 ? sum / visible : 0;
    return {
        ok: visible > 0 && nonBlackRatio > 0.03 && max > 40,
        filePath,
        width: png.width,
        height: png.height,
        visible_pixels: visible,
        non_black_pixels: nonBlack,
        non_black_ratio: nonBlackRatio,
        mean_luminance: meanLuminance,
        min_luminance: Number.isFinite(min) ? min : 0,
        max_luminance: Number.isFinite(max) ? max : 0
    };
};

const resolveRecordedFilePath = (record, auth) => {
    const filePath = String(record?.file_path || record?.path || '').trim();
    if (filePath && path.isAbsolute(filePath)) return filePath;
    const fileName = String(record?.file_name || '').trim();
    const userId = String(auth?.user_id || '').trim();
    if (userId && fileName) {
        return path.resolve('data', 'users', userId, 'recordings', fileName);
    }
    return path.resolve(filePath || fileName || '');
};

const run = async () => {
    const report = {
        ok: false,
        app_url: APP_URL,
        auth: null,
        project: null,
        record: null,
        stream: null,
        ffprobe: null,
        mtrack: null,
        playback: null,
        canvas: null,
        network_errors: [],
        media_source_trace: [],
        media_fetch_trace: [],
        console: [],
        errors: []
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
    await page.addInitScript(() => {
        window.__MEDIA_FETCH_TRACE__ = [];
        const originalFetch = window.fetch;
        window.fetch = function tracedFetch(input, init) {
            const url = String(typeof input === 'string' ? input : (input?.url || ''));
            if (/\/api\/uploads\/(?:audio|video)_/i.test(url)) {
                window.__MEDIA_FETCH_TRACE__.push({
                    url,
                    stack: String(new Error().stack || '').split('\n').slice(0, 8)
                });
                if (window.__MEDIA_FETCH_TRACE__.length > 80) window.__MEDIA_FETCH_TRACE__.shift();
            }
            return originalFetch.apply(this, arguments);
        };
        window.__MEDIA_SOURCE_TRACE__ = [];
        const descriptors = [
            [HTMLMediaElement.prototype, 'src'],
            [HTMLImageElement.prototype, 'src']
        ];
        descriptors.forEach(([prototype, key]) => {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
            if (!descriptor?.set || !descriptor?.get) return;
            Object.defineProperty(prototype, key, {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) {
                    const url = String(value || '');
                    if (/\/api\/uploads\/(?:audio|video)_/i.test(url) || /(?:^|\/)(?:audio|video)_\d{6,}\.[a-z0-9]+(?:[?#]|$)/i.test(url)) {
                        window.__MEDIA_SOURCE_TRACE__.push({
                            tag: this?.tagName || '',
                            url,
                            stack: String(new Error().stack || '').split('\n').slice(0, 8)
                        });
                        if (window.__MEDIA_SOURCE_TRACE__.length > 80) window.__MEDIA_SOURCE_TRACE__.shift();
                    }
                    return descriptor.set.call(this, value);
                }
            });
        });
    });
    if (FORCE_TAURI_RUNTIME) {
        await page.addInitScript(() => {
            window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
            window.__ATOME_LOCAL_HTTP_PORT__ = 3000;
            window.__TAURI_HTTP_BASE_URL__ = 'http://127.0.0.1:3000';
        });
    }
    page.on('console', (entry) => {
        const text = entry.text();
        if (/MTRACK|mtrax|tool_genesis|record_video_api|REC_PREVIEW|media_source|auth_fetch|apiLoadGroupTimeline|group host open/i.test(text)) {
            report.console.push({ type: entry.type(), text: text.slice(0, 1600) });
            if (report.console.length > 240) report.console.shift();
        }
    });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('response', (response) => {
        const status = Number(response.status() || 0);
        if (status < 400) return;
        const url = response.url();
        report.network_errors.push({ status, url });
        if (report.network_errors.length > 120) report.network_errors.shift();
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
        await safeEval(page, () => {
            window.__EVE_MTRACK_DEBUG__ = true;
            window.__EVE_MTRACK_DIAG__ = true;
            window.__EVE_MTRACK_DEBUG_LOGS__ = true;
            window.__REC_PREVIEW_TRACE__ = true;
            window.__DEBUG__?.setDeterministicTestMode?.(true);
            return { ok: true };
        });

        report.auth = await safeEval(page, async ({ phone, password }) => {
            const api = window.AdoleAPI || null;
            if (!api?.auth) return { ok: false, error: 'auth_api_missing' };
            let result = null;
            try {
                result = await api.auth.login(phone, password, phone);
            } catch (_) {
                if (typeof api.auth.create !== 'function') throw _;
                result = await api.auth.create(phone, password, phone, { autoLogin: true });
            }
            const loginOk = !!(result?.tauri?.success || result?.fastify?.success || result?.login?.tauri?.success || result?.login?.fastify?.success);
            if (!loginOk && typeof api.auth.create === 'function') {
                result = await api.auth.create(phone, password, phone, { autoLogin: true });
            }
            const current = await api.auth.current?.();
            return {
                ok: !!current?.logged,
                result,
                user_id: current?.user?.user_id || current?.user?.id || null,
                has_local_token: !!localStorage.getItem('local_auth_token'),
                has_cloud_token: !!localStorage.getItem('cloud_auth_token')
            };
        }, { phone: PHONE, password: PASSWORD }, 45000);
        if (report.auth?.ok !== true) throw new Error(`auth_failed:${report.auth?.error || 'unknown'}`);

        report.project = await safeEval(page, async () => {
            const api = window.AdoleAPI || null;
            const projects = api?.projects || null;
            if (!projects?.list || !projects?.setCurrent) return { ok: false, error: 'projects_api_missing' };
            const preferredName = `tauri_recorded_video_probe_${Date.now()}`;
            const readList = (result) => [
                ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
                ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
            ];
            if (typeof projects.create !== 'function') return { ok: false, error: 'projects_create_missing' };
            const created = await projects.create(preferredName);
            const createdRecord = created?.tauri?.data || created?.fastify?.data || created?.data || null;
            const createdProps = createdRecord?.properties || createdRecord?.particles || createdRecord?.data || {};
            let createdId = String(createdRecord?.id || createdRecord?.atome_id || createdProps?.atome_id || '').trim();
            let directCommit = null;
            if (!createdId && typeof window.Atome?.commit === 'function') {
                createdId = crypto.randomUUID();
                directCommit = await window.Atome.commit({
                    kind: 'set',
                    atome_id: createdId,
                    props: {
                        kind: 'project',
                        type: 'project',
                        name: preferredName,
                        owner_id: window.AdoleAPI?.auth?.current ? (await window.AdoleAPI.auth.current())?.user?.user_id : null,
                        created_at: new Date().toISOString()
                    }
                });
                if (directCommit?.ok !== true) createdId = '';
            }
            const list = readList(await projects.list());
            const project = list.find((entry) => {
                const props = entry?.properties || entry?.particles || entry?.data || {};
                return String(props?.name || '').trim() === preferredName;
            }) || list[0] || null;
            const props = project?.properties || project?.particles || project?.data || {};
            const projectId = String(project?.id || project?.atome_id || props?.atome_id || createdId || '').trim();
            if (!projectId) return { ok: false, error: 'project_id_missing', list_count: list.length, created, directCommit };
            await projects.setCurrent(projectId, preferredName, project?.owner_id || props?.owner_id || null, true);
            await window.eveToolBase?.loadProjectAtomes?.(projectId).catch(() => null);
            return { ok: true, project_id: projectId, name: preferredName, list_count: list.length, created_id: createdId || null, direct_commit_ok: directCommit?.ok === true };
        }, null, 45000);
        if (report.project?.ok !== true) throw new Error(`project_failed:${report.project?.error || 'unknown'}`);

        mark('record_start');
        report.record = await safeEval(page, async () => {
            const videoApi = await import('/eVe/domains/media/api/video_api.js');
            const audioContext = new AudioContext({ sampleRate: 48000 });
            await audioContext.resume();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const destination = audioContext.createMediaStreamDestination();
            oscillator.frequency.value = 660;
            gain.gain.value = 0.24;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();

            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:360px;';
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            let frame = 0;
            const draw = () => {
                frame += 1;
                ctx.fillStyle = `rgb(${(frame * 5) % 255}, ${(frame * 9) % 255}, ${(frame * 13) % 255})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#fff';
                ctx.fillRect((frame * 8) % canvas.width, 86, 90, 72);
                ctx.fillStyle = '#111';
                ctx.font = '32px sans-serif';
                ctx.fillText(`f${frame}`, 24, 48);
            };
            draw();
            const timer = setInterval(draw, 33);
            const videoStream = canvas.captureStream(30);
            const stream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...destination.stream.getAudioTracks()
            ]);
            const fileBase = `video_tauri_mtrack_probe_${Date.now()}`;
            const started = await videoApi.startVideoRecording({
                fileName: fileBase,
                mode: 'video',
                stream,
                stopExternalStream: true,
                audio: true,
                videoBitsPerSecond: 1600000,
                audioBitsPerSecond: 128000
            });
            if (started?.ok !== true) return { ok: false, step: 'start', started };
            await new Promise((resolve) => setTimeout(resolve, 3100));
            const stopped = await videoApi.stopVideoRecording();
            clearInterval(timer);
            try { oscillator.stop(); } catch (_) { }
            try { await audioContext.close(); } catch (_) { }
            try { canvas.remove(); } catch (_) { }
            return {
                ok: stopped?.ok === true && stopped?.status === 'stopped' && stopped?.project?.ok === true,
                started,
                stopped,
                project_atome_id: stopped?.project?.atomeId || null,
                file_name: stopped?.result?.fileName || '',
                file_path: stopped?.result?.file_path || stopped?.result?.path || '',
                duration_sec: Number(stopped?.result?.duration_sec || 0),
                mime_type: stopped?.result?.mime_type || '',
                project: stopped?.project || null
            };
        }, null, 120000);
        mark(`record_done:${report.record?.ok === true}`);
        if (report.record?.ok !== true) throw new Error(`record_failed:${report.record?.step || report.record?.error || 'unknown'}`);

        report.stream = await safeEval(page, async ({ fileName }) => {
            const shared = await import('/eVe/domains/media/api/media_api_shared.js');
            const locationPort = String(window.location?.port || '').trim();
            const tauriMode = locationPort !== '3001';
            const recordingUrl = shared.appendStreamingMediaAuthQuery(`/api/recordings/${encodeURIComponent(fileName)}`, { tauri: tauriMode });
            const extractUrl = shared.appendStreamingMediaAuthQuery(`/api/extract-audio/${encodeURIComponent(fileName)}`, { tauri: tauriMode });
            const head = async (url) => {
                const response = await fetch(url, { method: 'HEAD', credentials: 'omit' });
                return {
                    ok: response.ok,
                    status: response.status,
                    content_type: response.headers.get('content-type') || '',
                    content_length: Number(response.headers.get('content-length') || 0),
                    accept_ranges: response.headers.get('accept-ranges') || '',
                    has_token: /[?&](?:token|access_token|auth_token)=/.test(url),
                    has_media_user_id: /[?&]media_user_id=/.test(url)
                };
            };
            const loadVideo = (url) => new Promise((resolve) => {
                const video = document.createElement('video');
                video.muted = true;
                video.playsInline = true;
                video.crossOrigin = 'anonymous';
                video.preload = 'auto';
                const done = (ok, extra = {}) => {
                    try { video.remove(); } catch (_) { }
                    resolve({
                        ok,
                        duration: Number(video.duration || 0),
                        width: Number(video.videoWidth || 0),
                        height: Number(video.videoHeight || 0),
                        ready_state: Number(video.readyState || 0),
                        current_time: Number(video.currentTime || 0),
                        ...extra
                    });
                };
                video.onloadedmetadata = async () => {
                    try {
                        await video.play();
                        await new Promise((r) => setTimeout(r, 450));
                        video.pause();
                        done(Number(video.videoWidth || 0) > 0 && Number(video.currentTime || 0) > 0.05);
                    } catch (error) {
                        done(false, { error: error?.message || String(error || 'video_play_failed') });
                    }
                };
                video.onerror = () => done(false, { error: video.error?.message || `video_error_${video.error?.code || 0}` });
                document.body.appendChild(video);
                video.src = url;
            });
            const decodeExtractedAudio = async (url) => {
                const response = await fetch(url, { credentials: 'omit' });
                const bytes = response.ok ? await response.arrayBuffer() : null;
                if (!response.ok || !bytes) {
                    return { ok: false, status: response.status, content_type: response.headers.get('content-type') || '', byte_length: bytes?.byteLength || 0 };
                }
                const audioContext = new AudioContext({ sampleRate: 48000 });
                let decoded = null;
                try {
                    decoded = await audioContext.decodeAudioData(bytes.slice(0));
                } catch (error) {
                    await audioContext.close();
                    return { ok: false, status: response.status, content_type: response.headers.get('content-type') || '', byte_length: bytes.byteLength, error: error?.message || String(error || 'decode_failed') };
                }
                const data = decoded.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
                const rms = Math.sqrt(sum / Math.max(1, data.length));
                await audioContext.close();
                return {
                    ok: decoded.duration > 2 && rms > 0.01,
                    status: response.status,
                    content_type: response.headers.get('content-type') || '',
                    byte_length: bytes.byteLength,
                    duration: decoded.duration,
                    sample_rate: decoded.sampleRate,
                    channels: decoded.numberOfChannels,
                    rms
                };
            };
            return {
                ok: true,
                recording_url: recordingUrl,
                extract_url: extractUrl,
                recording_head: await head(recordingUrl),
                extract_head: await head(extractUrl),
                video: await loadVideo(recordingUrl),
                audio: await decodeExtractedAudio(extractUrl)
            };
        }, { fileName: report.record.file_name }, 90000);

        report.ffprobe = readFfprobe(resolveRecordedFilePath(report.record, report.auth));

        const hostSelector = `[data-atome-id="${report.record.project_atome_id}"]`;
        await page.locator(hostSelector).first().waitFor({ state: 'visible', timeout: 30000 });
        await page.locator(hostSelector).first().dblclick({ timeout: 20000, force: true });

        report.mtrack = await safeEval(page, async ({ groupId, expectedDuration }) => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const deadline = Date.now() + 45000;
            let last = null;
            while (Date.now() < deadline) {
                const state = window.eveMtrackApi?.getState?.() || null;
                const exported = window.eveMtrackApi?.exportTimeline?.() || null;
                const timeline = exported?.timeline || exported?.mtrax_timeline || null;
                const clips = Array.isArray(timeline?.clips) ? timeline.clips : [];
                const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
                const videoClip = clips.find((clip) => String(clip?.kind || '').toLowerCase() === 'video') || null;
                const audioClip = clips.find((clip) => String(clip?.kind || '').toLowerCase() === 'audio') || null;
                const videoDuration = Number(videoClip?.duration ?? videoClip?.timeline_duration ?? videoClip?.source_duration ?? 0);
                const audioDuration = Number(audioClip?.duration ?? audioClip?.timeline_duration ?? audioClip?.source_duration ?? 0);
                last = {
                    active_group_id: state?.activeGroupId || null,
                    track_count: tracks.length || Number(state?.trackCount || 0),
                    clip_count: clips.length || Number(state?.clipCount || 0),
                    track_names: tracks.map((track) => String(track?.name || track?.record_source || '')).filter(Boolean),
                    clip_kinds: clips.map((clip) => String(clip?.kind || '')).filter(Boolean),
                    video_duration: videoDuration,
                    audio_duration: audioDuration,
                    expected_duration: Number(expectedDuration || 0),
                    transport: state?.transport || null
                };
                const durationOk = videoDuration > 2
                    && audioDuration > 2
                    && Math.abs(videoDuration - Number(expectedDuration || videoDuration)) < 1.2
                    && Math.abs(audioDuration - Number(expectedDuration || audioDuration)) < 1.2;
                if (
                    tracks.length >= 2
                    && !!videoClip
                    && !!audioClip
                    && durationOk
                ) {
                    return {
                        ok: true,
                        ...last,
                        timeline,
                        trace_tail: Array.isArray(window.__EVE_MTRAX_TRACE__) ? window.__EVE_MTRAX_TRACE__.slice(-100) : []
                    };
                }
                await sleep(250);
            }
            return {
                ok: false,
                error: 'mtrack_timeline_missing_video_audio',
                last,
                trace_tail: Array.isArray(window.__EVE_MTRAX_TRACE__) ? window.__EVE_MTRAX_TRACE__.slice(-160) : []
            };
        }, { groupId: report.record.project_atome_id, expectedDuration: report.record.duration_sec }, 60000);

        const playClick = await clickMtrackPlayTool(page);
        const playObservation = await safeEval(page, async (clickResult) => {
            const before = window.eveMtrackApi?.getState?.() || null;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const after = window.eveMtrackApi?.getState?.() || null;
            const exported = window.eveMtrackApi?.exportTimeline?.() || null;
            const mediaElements = Array.from(document.querySelectorAll('#eve_mtrack_dialog video, #eve_mtrack_dialog audio')).map((node) => ({
                tag: node.tagName.toLowerCase(),
                current_time: Number(node.currentTime || 0),
                duration: Number(node.duration || 0),
                paused: node.paused === true,
                ready_state: Number(node.readyState || 0),
                error: node.error ? { code: node.error.code, message: node.error.message || '' } : null,
                src: String(node.currentSrc || node.src || '').replace(/([?&](?:token|access_token|auth_token)=)[^&]+/g, '$1<redacted>')
            }));
            const playheadDelta = Number(after?.playhead || 0) - Number(before?.playhead || 0);
            return {
                ok: clickResult?.ok === true
                    && playheadDelta > 0.2
                    && !String(after?.transport?.last_start_error || '').trim(),
                play_click: clickResult,
                before_playhead: Number(before?.playhead || 0),
                after_playhead: Number(after?.playhead || 0),
                playhead_delta: playheadDelta,
                playing_after_delay: after?.playing === true,
                transport: after?.transport || null,
                audio_engine: after?.audioEngine || null,
                renderer: after?.renderer || null,
                ui_play_trace: Array.isArray(window.__MTRACK_UI_PLAY_TRACE__) ? window.__MTRACK_UI_PLAY_TRACE__.slice(-20) : [],
                exported_clip_count: Array.isArray(exported?.timeline?.clips) ? exported.timeline.clips.length : null,
                media_elements: mediaElements,
                trace_tail: Array.isArray(window.__EVE_MTRAX_TRACE__) ? window.__EVE_MTRAX_TRACE__.slice(-120) : []
            };
        }, playClick, 40000);
        const pauseClick = await clickMtrackPlayTool(page);
        report.playback = await safeEval(page, async (detail) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const afterPause = window.eveMtrackApi?.getState?.() || null;
            const pauseActionTrace = Array.isArray(window.__MTRACK_UI_PLAY_TRACE__)
                ? window.__MTRACK_UI_PLAY_TRACE__.slice(-20)
                : [];
            const lastToggle = pauseActionTrace.filter((entry) => entry.method === 'togglePlay').slice(-1)[0] || null;
            return {
                ...(detail.playObservation || {}),
                ok: detail.playObservation?.ok === true
                    && detail.pauseClick?.ok === true
                    && afterPause?.playing !== true
                    && afterPause?.transport?.playback_start_pending !== true
                    && String(lastToggle?.result?.action || '') === 'pause',
                pause_click: detail.pauseClick,
                paused_after_second_click: afterPause?.playing !== true,
                pause_toggle_action: String(lastToggle?.result?.action || '') || null,
                pause_state: afterPause,
                pause_ui_play_trace: pauseActionTrace
            };
        }, { playObservation, pauseClick }, 40000);

        const canvasBox = await safeEval(page, () => {
            const canvases = Array.from(document.querySelectorAll('#eve_mtrack_dialog canvas, .eve-mtrack-docked-host canvas, canvas'));
            const visible = canvases.map((canvas, index) => {
                const rect = canvas.getBoundingClientRect();
                const style = getComputedStyle(canvas);
                return {
                    index,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    area: rect.width * rect.height,
                    display: style.display,
                    visibility: style.visibility,
                    opacity: Number(style.opacity || 1)
                };
            }).filter((entry) => (
                entry.width >= 40
                && entry.height >= 40
                && entry.display !== 'none'
                && entry.visibility !== 'hidden'
                && entry.opacity > 0.05
            )).sort((a, b) => b.area - a.area);
            return visible[0] ? { ok: true, ...visible[0] } : { ok: false, error: 'visible_canvas_missing' };
        }, null, 10000);
        if (canvasBox?.ok === true) {
            const clip = {
                x: Math.max(0, Math.floor(canvasBox.x)),
                y: Math.max(0, Math.floor(canvasBox.y)),
                width: Math.max(1, Math.floor(canvasBox.width)),
                height: Math.max(1, Math.floor(canvasBox.height))
            };
            await page.screenshot({ path: CANVAS_SCREENSHOT_FILE, clip });
            report.canvas = {
                box: canvasBox,
                analysis: analyzePngPixels(CANVAS_SCREENSHOT_FILE)
            };
        } else {
            report.canvas = { box: canvasBox, analysis: { ok: false, error: canvasBox?.error || 'canvas_missing' } };
        }

        report.media_fetch_trace = await safeEval(page, () => window.__MEDIA_FETCH_TRACE__ || [], null, 5000);
        report.media_source_trace = await safeEval(page, () => window.__MEDIA_SOURCE_TRACE__ || [], null, 5000);

        const mediaNetworkErrors = report.network_errors.filter((entry) => (
            /(?:^|[/])(?:audio|video)_\d{6,}\.[a-z0-9]+(?:[?#]|$)/i.test(String(entry.url || ''))
            || /\/api\/uploads\/(?:audio|video)_[^/?#]+\.[a-z0-9]+/i.test(String(entry.url || ''))
        ));

        report.ok = report.auth?.ok === true
            && report.project?.ok === true
            && report.record?.ok === true
            && report.ffprobe?.has_video === true
            && report.ffprobe?.has_audio === true
            && report.stream?.recording_head?.ok === true
            && report.stream?.extract_head?.ok === true
            && report.stream?.video?.ok === true
            && report.stream?.audio?.ok === true
            && report.mtrack?.ok === true
            && report.playback?.ok === true
            && report.canvas?.analysis?.ok === true
            && mediaNetworkErrors.length === 0;
    } catch (error) {
        report.errors.push(error?.message || String(error || 'probe_failed'));
    } finally {
        writeReport(report);
        await browser.close();
    }

    if (!report.ok) {
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
};

run().catch((error) => {
    const report = { ok: false, errors: [error?.message || String(error || 'probe_crashed')] };
    writeReport(report);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
});
