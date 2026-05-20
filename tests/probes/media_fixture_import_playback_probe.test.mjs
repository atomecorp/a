import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const MODE = process.env.ADOLE_TEST_MODE || 'browser';
const PHONE = process.env.ADOLE_TEST_PHONE || '7777000081';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || PHONE;
const MEDIA_DIR = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
const OUT_DIR = path.resolve('temp/probe_reports/media_fixture_import_playback_probe', MODE);
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const PROJECT_NAME = `Fixture Probe ${MODE} ${PHONE}`;

const MEDIA_CASES = Object.freeze([
    { name: '0000.png', kind: 'image' },
    { name: 'atome.svg', kind: 'svg' },
    { name: "Jeezs's fire.m4v", kind: 'video' },
    { name: 'Vampire.m4v', kind: 'video' },
    { name: 'WhatsApp_Video.mp4', kind: 'video' },
    { name: 'recorded.webm', kind: 'video' },
    { name: 'test.m4a', kind: 'audio' }
]);

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mediaPaths = () => MEDIA_CASES.map((entry) => path.join(MEDIA_DIR, entry.name));
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const redact = (value) => String(value || '')
    .replace(/([?&](?:access_token|auth_token|token|media_user_id)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');
const allowedHttpDiagnostic = (url) => /\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(String(url || ''));
const failingConsole = (entry) => entry?.type === 'error' || entry?.type === 'pageerror'
    || /Failed to load resource|Unhandled Promise Rejection|Fetch API cannot load|Cross origin requests/i.test(entry?.text || '');
const allowedRequestFailure = (url, error) => /^blob:/i.test(String(url || ''))
    || (/\/api\/uploads\//i.test(String(url || '')) && String(error || '') === 'net::ERR_ABORTED');

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
    const created = await safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable' };
        const result = await api.auth.create(phone, password, phone, { autoLogin: true });
        return { ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success), result };
    }, { phone: PHONE, password: PASSWORD }, 30000);
    if (created?.ok) return created;
    return safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        const result = await api.auth.login(phone, password, phone);
        return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
    }, { phone: PHONE, password: PASSWORD }, 20000);
};

const createReport = () => ({
    ok: false,
    mode: MODE,
    app_url: APP_URL,
    media_dir: MEDIA_DIR,
    fixtures: MEDIA_CASES,
    console: [],
    network_errors: [],
    request_failures: [],
    import: null,
    visual: null,
    playback: null
});

const run = async () => {
    for (const file of mediaPaths()) {
        if (!fs.existsSync(file)) throw new Error(`missing_fixture:${file}`);
    }
    const report = createReport();
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== '0',
        args: ['--autoplay-policy=no-user-gesture-required']
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    page.on('console', (msg) => report.console.push({ type: msg.type(), text: redact(msg.text()).slice(0, 800) }));
    page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: redact(error?.message || String(error || 'pageerror')).slice(0, 800) }));
    page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText || null;
        if (!allowedRequestFailure(request.url(), error)) report.request_failures.push({ url: redact(request.url()), error });
    });
    page.on('response', (response) => {
        const status = response.status();
        const url = response.url();
        if (status >= 400 && !allowedHttpDiagnostic(url)) report.network_errors.push({ status, url: redact(url) });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ready = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
        if (!ready.ok) throw new Error('app_not_ready');
        const auth = await tryLogin(page);
        if (!auth?.ok) throw new Error(`auth_failed:${auth?.error || 'unknown'}`);
        await waitFor(page, () => window.__authCheckComplete === true, 30000);

        const bootstrap = await safeEval(page, async ({ projectName }) => {
            if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) await import('/eVe/intuition/tools/project_drop.js');
            const api = window.AdoleAPI || null;
            const readId = (entry) => String(entry?.id || entry?.atome_id || entry?.project_id || '').trim();
            const readName = (entry) => {
                const props = entry?.properties || entry?.particles || entry?.data || {};
                return String(entry?.name || props.name || '').trim();
            };
            const projectsFrom = (result) => [
                ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
                ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
            ];
            let projects = projectsFrom(await api?.projects?.list?.());
            let project = projects.find((entry) => readName(entry) === projectName) || projects[0] || null;
            if (!project && typeof api?.projects?.create === 'function') {
                await api.projects.create(projectName);
                projects = projectsFrom(await api.projects.list());
                project = projects.find((entry) => readName(entry) === projectName) || projects[0] || null;
            }
            const resolvedId = readId(project);
            if (resolvedId && typeof api?.projects?.setCurrent === 'function') {
                await api.projects.setCurrent(resolvedId, readName(project) || projectName, null, true);
            }
            await window.eveToolBase?.loadProjectAtomes?.(resolvedId, { force: true }).catch(() => {});
            let projectEl = document.querySelector(`[id="project_view_${CSS.escape(resolvedId)}"]`) || document.querySelector('[id^="project_view_"]');
            if (!projectEl) {
                await new Promise((resolve) => setTimeout(resolve, 800));
                projectEl = document.querySelector(`[id="project_view_${CSS.escape(resolvedId)}"]`) || document.querySelector('[id^="project_view_"]');
            }
            const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
            return { ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId), projectId, resolvedId };
        }, { projectName: PROJECT_NAME }, 30000);
        if (!bootstrap?.ok) throw new Error(`bootstrap_failed:${bootstrap?.error || JSON.stringify(bootstrap)}`);

        await page.evaluate(() => {
            document.getElementById('fixture_media_import_input')?.remove();
            const input = document.createElement('input');
            input.id = 'fixture_media_import_input';
            input.type = 'file';
            input.multiple = true;
            input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(input);
        });
        await page.setInputFiles('#fixture_media_import_input', mediaPaths());
        report.import = await safeEval(page, async () => {
            const entries = Array.from(document.getElementById('fixture_media_import_input')?.files || []);
            const projectEl = document.querySelector('[id^="project_view_"]');
            const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
            const rect = projectEl?.getBoundingClientRect?.();
            if (!entries.length || !projectEl || !projectId || !rect) return { ok: false, error: 'import_target_missing' };
            return window.eveProjectDropApi.importFilesToProjectViaCreator({
                entries,
                projectId,
                projectEl,
                event: { clientX: rect.left + 160, clientY: rect.top + 140 },
                origin: 'media_fixture_import_playback_probe',
                sourceLayer: 'media_fixture_import_playback_probe',
                actorType: 'headless_probe'
            });
        }, null, 180000);
        if (!report.import?.ok) throw new Error(`import_failed:${report.import?.error || 'unknown'}`);

        await sleep(1800);
        await page.screenshot({ path: path.join(OUT_DIR, 'after_import.png'), fullPage: true });
        const imported = Array.isArray(report.import?.results) ? report.import.results : [];
        const expected = MEDIA_CASES.map((entry, index) => ({ ...entry, atomeId: imported[index]?.atomeId || null }));
        report.visual = await safeEval(page, ({ expected }) => {
            const result = expected.map((entry) => {
                const host = document.querySelector(`[data-atome-id="${CSS.escape(entry.atomeId || '')}"]`);
                const rect = host?.getBoundingClientRect?.();
                const media = host?.querySelector?.('img,svg,video,audio,canvas,[data-role*="media"]') || null;
                const mediaRect = media?.getBoundingClientRect?.();
                return {
                    name: entry.name,
                    kind: entry.kind,
                    atome_id: entry.atomeId,
                    ok: !!host && rect.width > 12 && rect.height > 12 && (entry.kind === 'audio' || (!!media && mediaRect.width >= 0 && mediaRect.height >= 0)),
                    host_rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
                    media_tag: media?.tagName?.toLowerCase?.() || null
                };
            });
            return { ok: result.every((entry) => entry.ok), result };
        }, { expected }, 30000);
        if (!report.visual?.ok) throw new Error('visual_fixture_verification_failed');

        report.playback = await safeEval(page, async ({ expected }) => {
            const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
            const userId = String(current?.user?.user_id || current?.user?.id || '').trim();
            const stateFor = async (id) => {
                const state = await window.Atome?.getStateCurrent?.(id).catch(() => null);
                const props = state?.properties || state?.props || state || {};
                return props.media_url || props.mediaUrl || props.src || props.file_path || props.filePath || '';
            };
            const playableUrl = (raw) => {
                const source = String(raw || '').trim();
                const url = /^https?:\/\//i.test(source) || source.startsWith('/') ? source : (source ? `/${source.replace(/^\/+/, '')}` : '');
                if (!userId || !/\/api\/(?:uploads|recordings)\//.test(url) || /[?&]media_user_id=/.test(url)) return url;
                return `${url}${url.includes('?') ? '&' : '?'}media_user_id=${encodeURIComponent(userId)}`;
            };
            const checks = [];
            for (const entry of expected) {
                const source = playableUrl(await stateFor(entry.atomeId));
                if (!source) {
                    checks.push({ name: entry.name, kind: entry.kind, ok: false, error: 'source_missing' });
                    continue;
                }
                if (entry.kind === 'image' || entry.kind === 'svg') {
                    const img = new Image();
                    const loaded = await new Promise((resolve) => {
                        img.onload = () => resolve({ ok: img.naturalWidth > 0 && img.naturalHeight > 0, width: img.naturalWidth, height: img.naturalHeight });
                        img.onerror = () => resolve({ ok: false, error: 'image_load_failed' });
                        img.src = source;
                    });
                    checks.push({ name: entry.name, kind: entry.kind, source, ...loaded });
                } else if (entry.kind === 'video') {
                    const node = document.createElement('video');
                    node.muted = true;
                    node.playsInline = true;
                    node.src = source;
                    document.body.appendChild(node);
                    const loaded = await new Promise((resolve) => {
                        node.onloadedmetadata = async () => {
                            await node.play().catch(() => {});
                            await new Promise((done) => setTimeout(done, 700));
                            resolve({ ok: node.videoWidth > 0 && node.currentTime > 0.05, width: node.videoWidth, height: node.videoHeight, current_time: node.currentTime });
                        };
                        node.onerror = () => resolve({ ok: false, error: `video_error_${node.error?.code || 0}` });
                    });
                    node.remove();
                    checks.push({ name: entry.name, kind: entry.kind, source, ...loaded });
                } else if (entry.kind === 'audio') {
                    const response = await fetch(source, { credentials: 'include' });
                    const bytes = response.ok ? await response.arrayBuffer() : null;
                    let audio = { ok: false, status: response.status };
                    if (bytes) {
                        const ctx = new AudioContext();
                        const decoded = await ctx.decodeAudioData(bytes.slice(0));
                        const data = decoded.getChannelData(0);
                        let sum = 0;
                        for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
                        const rms = Math.sqrt(sum / Math.max(1, data.length));
                        audio = { ok: decoded.duration > 0.5 && rms > 0.001, duration: decoded.duration, rms };
                        await ctx.close();
                    }
                    checks.push({ name: entry.name, kind: entry.kind, source, ...audio });
                }
            }
            return { ok: checks.every((entry) => entry.ok) && checks.length === expected.length, checks };
        }, { expected }, 180000);

        report.log_audit = {
            network_error_count: report.network_errors.length,
            request_failure_count: report.request_failures.length,
            console_error_count: report.console.filter(failingConsole).length
        };
        report.ok = report.playback?.ok === true
            && report.network_errors.length === 0
            && report.request_failures.length === 0
            && report.console.filter(failingConsole).length === 0;
    } catch (error) {
        report.fatal = error?.message || String(error || 'probe_failed');
    } finally {
        writeReport(report);
        await browser.close();
    }
    if (!report.ok) {
        console.error(JSON.stringify({ ok: false, report: REPORT_FILE, fatal: report.fatal || null }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, report: REPORT_FILE }, null, 2));
    process.exit(0);
};

run();
