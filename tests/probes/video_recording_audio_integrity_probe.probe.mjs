import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/video_recording_audio_integrity_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const mark = (label) => {
    if (process.env.PROBE_VERBOSE === '1') console.log(`[video_audio_probe] ${label}`);
};

const resolveWorkspaceRecordingPath = ({ filePath = '', ownerId = '' } = {}) => {
    const raw = String(filePath || '').trim();
    if (!raw) return '';
    if (path.isAbsolute(raw)) return raw;
    if (/^data\/users\//i.test(raw)) return path.resolve(raw);
    if (/^recordings\//i.test(raw) && ownerId) return path.resolve('data', 'users', ownerId, raw);
    return path.resolve(raw);
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

const readFfprobe = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'file_missing', filePath };
    try {
        const raw = execFileSync('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration:stream=index,codec_type,codec_name,sample_rate,channels,duration',
            '-of', 'json',
            filePath
        ], { encoding: 'utf8', timeout: 20000 });
        const parsed = JSON.parse(raw);
        const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
        return {
            ok: true,
            filePath,
            format_duration: Number.parseFloat(parsed?.format?.duration || '0') || 0,
            streams,
            has_video: streams.some((stream) => stream.codec_type === 'video'),
            has_audio: streams.some((stream) => stream.codec_type === 'audio')
        };
    } catch (error) {
        return { ok: false, filePath, error: error?.message || String(error || 'ffprobe_failed') };
    }
};

const run = async () => {
    const report = { ok: false, record: null, file: null, state: null, scene: null, rawAudio: null, extractedAudio: null, ffprobe: null, errors: [] };
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== '0',
        args: [
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
        await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
        const login = await tryLogin(page);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitFor(page, () => window.__authCheckComplete === true, 30000);
        await waitFor(page, () => ({ ok: !!window.Atome && !!window.AdoleAPI }), 30000);

        mark('record_start');
        report.record = await safeEval(page, async () => {
            const mod = await import('/eVe/domains/media/api/video_api.js');
            const audioContext = new AudioContext({ sampleRate: 48000 });
            await audioContext.resume();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const destination = audioContext.createMediaStreamDestination();
            oscillator.frequency.value = 440;
            gain.gain.value = 0.28;
            oscillator.connect(gain);
            gain.connect(destination);
            oscillator.start();

            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;';
            document.body.appendChild(canvas);
            const context2d = canvas.getContext('2d');
            let frame = 0;
            const draw = () => {
                frame += 1;
                context2d.fillStyle = `rgb(${(frame * 7) % 255}, ${(frame * 11) % 255}, ${(frame * 17) % 255})`;
                context2d.fillRect(0, 0, canvas.width, canvas.height);
                context2d.fillStyle = '#ffffff';
                context2d.fillRect((frame * 5) % canvas.width, 36, 40, 40);
            };
            draw();
            const timer = setInterval(draw, 33);
            const videoStream = canvas.captureStream(30);
            const stream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...destination.stream.getAudioTracks()
            ]);
            const recordVideo = typeof window.record_video === 'function'
                ? window.record_video
                : null;
            if (!recordVideo) throw new Error('record_video_unavailable');
            const recordInput = {
                fileName: `video_audio_probe_${Date.now()}`,
                mode: 'video',
                stream,
                stopExternalStream: true,
                audio: true,
                videoBitsPerSecond: 1600000,
                audioBitsPerSecond: 128000
            };
            const controller = typeof mod.startVideoRecording === 'function'
                ? await mod.startVideoRecording(recordInput)
                : await recordVideo(recordInput.fileName, null, recordInput);
            if (controller?.ok === false) throw new Error(controller.error || 'video_record_start_failed');
            await new Promise((resolve) => setTimeout(resolve, 2600));
            const stopped = typeof mod.stopVideoRecording === 'function'
                ? await mod.stopVideoRecording()
                : await controller.stop();
            const result = stopped?.result || stopped;
            const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
            clearInterval(timer);
            try { oscillator.stop(); } catch (_) { }
            try { await audioContext.close(); } catch (_) { }
            try { canvas.remove(); } catch (_) { }
            const fileName = String(result?.fileName || '').trim();
            const filePath = String(result?.file_path || result?.path || '').trim();
            const ownerId = String(result?.media_user_id || result?.owner_id || current?.user?.user_id || current?.user?.id || '').trim();
            const buildExtractAudioUrl = (mediaUrl) => {
                const safeName = encodeURIComponent(fileName);
                if (!safeName) return '';
                try {
                    const parsed = new URL(String(mediaUrl || ''), location.href);
                    const params = new URLSearchParams();
                    params.set('source', parsed.pathname.includes('/api/recordings/') ? 'recording' : 'upload');
                    const mediaUserId = parsed.searchParams.get('media_user_id') || ownerId || '';
                    if (mediaUserId) params.set('media_user_id', mediaUserId);
                    return `/api/extract-audio/${safeName}?${params.toString()}`;
                } catch (_) {
                    const params = new URLSearchParams();
                    params.set('source', 'recording');
                    if (ownerId) params.set('media_user_id', ownerId);
                    return `/api/extract-audio/${safeName}?${params.toString()}`;
                }
            };
            let token = window.AdoleAPI?.auth?.getCurrentToken?.() || window.__authToken || '';
            if (!token) {
                try {
                    const shared = await import('/eVe/domains/media/api/media_api_shared.js');
                    token = shared.getAuthToken?.() || shared.getCloudAuthToken?.() || shared.getLocalAuthToken?.() || '';
                } catch (_) { }
            }
            const mediaUrl = String(result?.media_url || result?.src || '').trim()
                || `/api/recordings/${encodeURIComponent(fileName)}${ownerId ? `?media_user_id=${encodeURIComponent(ownerId)}` : (token ? `?access_token=${encodeURIComponent(token)}` : '')}`;
            const extractUrl = buildExtractAudioUrl(mediaUrl);
            return {
                ok: result?.ok === true,
                stopped,
                result,
                project: stopped?.project || null,
                user_id: ownerId || current?.user?.user_id || current?.user?.id || null,
                fileName,
                filePath,
                mediaUrl,
                extractUrl
            };
        }, null, 90000);
        mark(`record_done:${report.record?.ok === true}`);
        if (!report.record?.ok) throw new Error(`record_failed:${report.record?.error || 'unknown'}`);

        const localFilePath = resolveWorkspaceRecordingPath({
            filePath: report.record.filePath,
            ownerId: report.record.user_id
        });
        report.file = {
            ok: !!localFilePath && fs.existsSync(localFilePath),
            path: localFilePath || null,
            in_recordings: /\/data\/users\/[^/]+\/recordings\//.test(localFilePath),
            byte_length: localFilePath && fs.existsSync(localFilePath) ? fs.statSync(localFilePath).size : 0
        };
        report.ffprobe = readFfprobe(localFilePath);

        const projectAtomeId = report.record.project?.atomeId || report.record.result?.atomeId || report.record.result?.atome_id || null;
        report.state = await safeEval(page, async (input) => {
            const atomeId = String(input?.atomeId || '').trim();
            const projectId = String(input?.projectId || '').trim();
            if (!atomeId || !projectId) return { ok: false, error: 'recording_project_identity_missing', atomeId, projectId };
            const stateRecord = window.Atome?.getStateCurrent
                ? await window.Atome.getStateCurrent(atomeId).catch((error) => ({ error: error?.message || String(error) }))
                : null;
            const props = stateRecord?.properties || stateRecord?.props || {};
            const api = window.AdoleAPI?.atomes || null;
            const apiGet = api?.get
                ? await api.get(atomeId).catch((error) => ({ error: error?.message || String(error) }))
                : { skipped: true, reason: 'AdoleAPI.atomes.get_unavailable' };
            const apiList = api?.list
                ? await api.list({ projectId, limit: 2000, includeShared: true }).catch((error) => ({ error: error?.message || String(error) }))
                : { skipped: true, reason: 'AdoleAPI.atomes.list_unavailable' };
            const collectAtomeListEntries = (payload = null) => {
                if (Array.isArray(payload)) return payload;
                if (!payload || typeof payload !== 'object') return [];
                const lists = [
                    payload.atomes,
                    payload.records,
                    payload.items,
                    payload.data,
                    payload.fastify?.atomes,
                    payload.tauri?.atomes
                ];
                const merged = new Map();
                lists.filter(Array.isArray).flat().forEach((entry) => {
                    const id = String(entry?.id || entry?.atome_id || entry?.atomeId || '').trim();
                    if (id && !merged.has(id)) merged.set(id, entry);
                });
                return Array.from(merged.values());
            };
            const listed = collectAtomeListEntries(apiList);
            const listContains = listed.some((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId);
            return {
                ok: !!stateRecord && !stateRecord.error && String(stateRecord.id || stateRecord.atome_id || stateRecord.atomeId || atomeId) === atomeId,
                atome_id: atomeId,
                project_id: projectId,
                state_kind: props.kind || stateRecord?.kind || null,
                media_url: props.media_url || props.mediaUrl || null,
                storage_root: props.storage_root || null,
                api_get_ok: !!apiGet && !apiGet.error && apiGet.skipped !== true,
                api_get_skipped: apiGet?.skipped === true,
                api_list_contains: listContains,
                api_list_skipped: apiList?.skipped === true,
                api_error: apiGet?.error || apiList?.error || null
            };
        }, {
            atomeId: projectAtomeId,
            projectId: report.record.project?.projectId || null
        }, 60000);

        report.scene = await safeEval(page, async (input) => {
            const atomeId = String(input?.atomeId || '').trim();
            const projectId = String(input?.projectId || '').trim();
            if (!atomeId || !projectId) return { ok: false, error: 'recording_project_identity_missing', atomeId, projectId };
            const findVirtualNode = (root, targetId, seen = new Set()) => {
                if (!root || typeof root !== 'object' || seen.has(root)) return null;
                seen.add(root);
                if (String(root.id || root.atome_id || root.atomeId || '') === targetId) return root;
                const children = [
                    ...(Array.isArray(root.nodes) ? root.nodes : []),
                    ...(Array.isArray(root.children) ? root.children : []),
                    ...(Array.isArray(root.items) ? root.items : []),
                    ...(root.root && typeof root.root === 'object' ? [root.root] : [])
                ];
                for (const child of children) {
                    const found = findVirtualNode(child, targetId, seen);
                    if (found) return found;
                }
                return null;
            };
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const deadline = Date.now() + 15000;
            let scene = null;
            let record = null;
            let node = null;
            while (Date.now() < deadline) {
                scene = window.eveToolBase?.getProjectSceneState?.(projectId) || null;
                const records = Array.isArray(scene?.records) ? scene.records : [];
                record = records.find((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId) || null;
                node = findVirtualNode(scene?.projection?.virtual_scene || null, atomeId);
                if (record && node) break;
                await sleep(250);
            }
            const canvas = document.getElementById('eve_surface_project');
            const rect = canvas?.getBoundingClientRect?.();
            return {
                ok: !!record && !!canvas && Number(canvas.width || 0) > 0 && Number(canvas.height || 0) > 0 && !!node,
                atome_id: atomeId,
                project_id: projectId,
                record_present: !!record,
                canvas_present: !!canvas,
                canvas_id: canvas?.id || null,
                canvas_role: canvas?.getAttribute?.('data-role') || null,
                canvas_width: Number(canvas?.width || 0),
                canvas_height: Number(canvas?.height || 0),
                canvas_css_width: Number(rect?.width || 0),
                canvas_css_height: Number(rect?.height || 0),
                virtual_node_present: !!node,
                virtual_node_type: node?.type || null,
                render_ok: scene?.projection?.ok === true,
                render_error: scene?.projection?.render_result?.error || scene?.projection?.render_result?.reason || null
            };
        }, {
            atomeId: projectAtomeId,
            projectId: report.record.project?.projectId || null
        }, 60000);

        const analyzeAudio = async (url, label) => safeEval(page, async ({ url, label }) => {
            const response = await fetch(url, { credentials: 'include' });
            const arrayBuffer = response.ok ? await response.arrayBuffer() : null;
            if (!response.ok || !arrayBuffer) {
                return {
                    ok: false,
                    label,
                    status: response.status,
                    content_type: response.headers.get('content-type') || '',
                    byte_length: arrayBuffer ? arrayBuffer.byteLength : 0
                };
            }
            const audioContext = new AudioContext({ sampleRate: 48000 });
            let decoded = null;
            try {
                decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            } catch (error) {
                await audioContext.close();
                return {
                    ok: false,
                    label,
                    status: response.status,
                    content_type: response.headers.get('content-type') || '',
                    byte_length: arrayBuffer.byteLength,
                    error: error?.message || String(error || 'decode_failed')
                };
            }
            const channel = decoded.getChannelData(0);
            const windowSize = Math.max(1, Math.floor(decoded.sampleRate / 20));
            const windows = [];
            for (let offset = 0; offset < channel.length; offset += windowSize) {
                let sum = 0;
                const end = Math.min(channel.length, offset + windowSize);
                for (let i = offset; i < end; i += 1) sum += channel[i] * channel[i];
                windows.push(Math.sqrt(sum / Math.max(1, end - offset)));
            }
            const audible = windows.filter((value) => value > 0.01);
            const rmsAvg = windows.reduce((sum, value) => sum + value, 0) / Math.max(1, windows.length);
            const rmsMinAudible = audible.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
            const silenceRatio = 1 - (audible.length / Math.max(1, windows.length));
            await audioContext.close();
            return {
                ok: decoded.duration > 2 && rmsAvg > 0.01 && silenceRatio < 0.2,
                label,
                status: response.status,
                content_type: response.headers.get('content-type') || '',
                byte_length: arrayBuffer.byteLength,
                duration: decoded.duration,
                sample_rate: decoded.sampleRate,
                channels: decoded.numberOfChannels,
                window_count: windows.length,
                audible_windows: audible.length,
                silence_ratio: silenceRatio,
                rms_avg: rmsAvg,
                rms_max: Math.max(...windows),
                rms_min_audible: Number.isFinite(rmsMinAudible) ? rmsMinAudible : 0
            };
        }, { url, label }, 60000);

        report.rawAudio = await analyzeAudio(report.record.mediaUrl, 'raw_recording_webm');
        report.extractedAudio = await analyzeAudio(report.record.extractUrl, 'server_extracted_audio');

        report.ok = report.file?.ok === true && report.file?.in_recordings === true
            && report.state?.ok === true && report.scene?.ok === true
            && report.ffprobe?.has_video === true && report.ffprobe?.has_audio === true
            && report.rawAudio?.ok === true && report.extractedAudio?.ok === true;
    } catch (error) {
        report.errors.push(error?.message || String(error || 'probe_failed'));
    } finally {
        writeReport(report);
        await browser.close();
    }

    if (!report.ok) {
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
    } console.log(JSON.stringify(report, null, 2));
    process.exit(0);
};
run().catch((error) => {
    const report = { ok: false, errors: [error?.message || String(error || 'probe_crashed')] };
    writeReport(report);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
});
