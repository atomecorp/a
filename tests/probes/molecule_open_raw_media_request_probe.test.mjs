import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const BROWSER_NAME = process.env.MOLECULE_OPEN_PROBE_BROWSER || 'chromium';
const PHONE = process.env.ADOLE_TEST_PHONE || `8888${BROWSER_NAME === 'webkit' ? '002' : '001'}`;
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || PHONE;
const MEDIA_NAME = process.env.MOLECULE_OPEN_PROBE_MEDIA || 'Vampire.m4v';
const MEDIA_PATH = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media', MEDIA_NAME);
const OUT_DIR = path.resolve('temp/probe_reports/molecule_open_raw_media_request_probe', BROWSER_NAME);
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (value) => String(value || '')
    .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');
const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const mediaBaseName = path.basename(MEDIA_NAME).toLowerCase();

const isRawMediaRequest = (url = '') => {
    const text = String(url || '');
    if (!text.toLowerCase().includes(mediaBaseName)) return false;
    if (/\/api\/(?:uploads|recordings|extract-audio)\//i.test(text)) return false;
    if (/^blob:|^data:/i.test(text)) return false;
    return true;
};

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await page.evaluate(predicate).catch((error) => ({ ok: false, error: error?.message || String(error) }));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

if (!fs.existsSync(MEDIA_PATH)) {
    throw new Error(`missing_probe_media:${MEDIA_PATH}`);
}

const browserType = BROWSER_NAME === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({
    headless: process.env.HEADLESS !== '0',
    args: BROWSER_NAME === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : []
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    permissions: BROWSER_NAME === 'chromium' ? ['camera', 'microphone'] : []
});
const page = await context.newPage();
const report = {
    ok: false,
    browser: BROWSER_NAME,
    app_url: APP_URL,
    media: MEDIA_NAME,
    raw_media_requests: [],
    raw_media_http_errors: [],
    http_errors: [],
    request_failures: [],
    console_errors: []
};

page.on('request', (request) => {
    const url = request.url();
    if (isRawMediaRequest(url)) {
        report.raw_media_requests.push({ url: redact(url), method: request.method(), resource_type: request.resourceType() });
    }
});
page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !/\/favicon\.ico$/i.test(url)) {
        report.http_errors.push({ url: redact(url), status: response.status() });
    }
    if (isRawMediaRequest(url) && response.status() >= 400) {
        report.raw_media_http_errors.push({ url: redact(url), status: response.status() });
    }
});
page.on('requestfailed', (request) => {
    const url = request.url();
    if (isRawMediaRequest(url)) {
        report.request_failures.push({ url: redact(url), error: request.failure()?.errorText || null });
    }
});
page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && text.includes('Failed to load resource')) {
        report.console_errors.push(redact(text));
    }
});
page.on('pageerror', (error) => {
    report.console_errors.push(redact(error?.message || String(error || 'pageerror')));
});

try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);

    report.auth = await page.evaluate(async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_api_missing' };
        let result = await api.auth.login(phone, password, phone);
        let current = await api.auth.current?.();
        if (!current?.logged && typeof api.auth.create === 'function') {
            result = await api.auth.create(phone, password, phone, { autoLogin: true });
            current = await api.auth.current?.();
        }
        return { ok: !!current?.logged, result, user_id: current?.user?.user_id || current?.user?.id || null };
    }, { phone: PHONE, password: PASSWORD });
    if (!report.auth?.ok) throw new Error('auth_failed');

    const projectReady = await waitFor(page, () => {
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        return {
            ok: !!(projectEl && projectId),
            project_id: projectId,
            project_el_id: projectEl?.id || null
        };
    }, 45000, 300);
    report.project_ready = projectReady.last;
    if (!projectReady.ok) throw new Error(`project_not_ready:${JSON.stringify(projectReady.last)}`);

    report.bootstrap = await page.evaluate(async () => {
        window.__EVE_MTRACK_DEBUG__ = true;
        window.__EVE_MTRACK_TRACE__ = true;
        window.__EVE_MTRACK_BRIDGE_LOGS__ = true;
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
            await import('/eVe/intuition/tools/project_drop.js');
        }
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        return {
            ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId),
            project_id: projectId,
            project_el_id: projectEl?.id || null
        };
    });
    if (!report.bootstrap?.ok) throw new Error(`bootstrap_failed:${JSON.stringify(report.bootstrap)}`);

    await page.evaluate(() => {
        document.getElementById('molecule_open_raw_media_input')?.remove();
        const input = document.createElement('input');
        input.id = 'molecule_open_raw_media_input';
        input.type = 'file';
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#molecule_open_raw_media_input', MEDIA_PATH);
    await page.evaluate((mediaName) => {
        window.__MOLECULE_OPEN_PROBE_MEDIA_NAME__ = String(mediaName || '');
    }, MEDIA_NAME);

    report.import = await page.evaluate(async () => {
        const input = document.getElementById('molecule_open_raw_media_input');
        const entries = Array.from(input?.files || []);
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        const rect = projectEl?.getBoundingClientRect?.();
        if (!entries.length || !projectEl || !projectId || !rect) return { ok: false, error: 'import_target_missing' };
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            event: {
                clientX: rect.left + Math.min(260, Math.max(60, rect.width / 3)),
                clientY: rect.top + Math.min(220, Math.max(60, rect.height / 3))
            },
            projectId,
            projectEl,
            origin: 'molecule_open_raw_media_request_probe',
            sourceLayer: 'molecule_open_raw_media_request_probe',
            actorType: 'headless_probe'
        });
    });
    if (!report.import?.ok) throw new Error(`import_failed:${report.import?.error || JSON.stringify(report.import)}`);

    const importedAtomeId = String(report.import?.results?.[0]?.atomeId || report.import?.atomeId || '').trim();
    await page.evaluate((atomeId) => {
        window.__MOLECULE_OPEN_PROBE_ATOME_ID__ = String(atomeId || '');
    }, importedAtomeId);
    const imported = await waitFor(page, () => {
        const base = String(window.__MOLECULE_OPEN_PROBE_MEDIA_NAME__ || '').toLowerCase();
        const expectedId = String(window.__MOLECULE_OPEN_PROBE_ATOME_ID__ || '').trim();
        const hosts = Array.from(document.querySelectorAll('[data-atome-id]'));
        for (const host of hosts) {
            const hostId = String(host.dataset?.atomeId || '');
            const source = String(host.dataset?.eveMediaSource || '').toLowerCase();
            const label = String(host.dataset?.atomeName || host.textContent || '').toLowerCase();
            if (expectedId && hostId !== expectedId) continue;
            if (!expectedId && !source.includes(base) && !label.includes(base)) continue;
            const rect = host.getBoundingClientRect();
            return {
                ok: rect.width > 0 && rect.height > 0,
                atome_id: hostId,
                source
            };
        }
        return { ok: false, error: 'media_host_missing' };
    }, 45000, 300);
    report.imported = imported.last;
    if (!imported.ok || !report.imported?.atome_id) throw new Error(`media_host_missing:${JSON.stringify(imported.last)}`);

    report.before_open = await page.evaluate(async (atomeId) => {
        const api = window.AdoleAPI || null;
        const host = document.querySelector(`[data-atome-id="${CSS.escape(String(atomeId || ''))}"]`);
        let current = null;
        let info = null;
        let state = null;
        try {
            info = api?.auth?.getCurrentInfo?.() || null;
        } catch (error) {
            info = { error: error?.message || String(error) };
        }
        try {
            current = await api?.auth?.current?.();
        } catch (error) {
            current = { error: error?.message || String(error) };
        }
        try {
            state = await window.Atome?.getStateCurrent?.(atomeId);
        } catch (error) {
            state = { error: error?.message || String(error) };
        }
        return {
            auth_check_result: window.__authCheckResult || null,
            current_user: window.__currentUser || null,
            auth_info: info,
            auth_current: current,
            host_dataset: host ? { ...host.dataset } : null,
            state
        };
    }, report.imported.atome_id);

    await page.locator(`[data-atome-id="${report.imported.atome_id}"]`).first().dblclick({ timeout: 20000, force: true });
    await sleep(5200);

    report.molecule = await page.evaluate(() => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const timeline = window.eveMtrackApi?.exportTimeline?.()?.timeline || null;
        const clips = Array.isArray(timeline?.clips) ? timeline.clips : [];
        const panel = document.getElementById('eve_mtrack_dialog');
        return {
            active_group_id: state?.activeGroupId || null,
            panel_visible: !!(panel && panel.getBoundingClientRect().width > 0 && panel.getBoundingClientRect().height > 0),
            clips: clips.map((clip) => ({
                kind: clip?.kind || null,
                src: clip?.src || null,
                playback_src: clip?.playback_src || clip?.playbackSource || null
            }))
        };
    });

    const hasUnsafeMoleculeClipSource = (Array.isArray(report.molecule?.clips) ? report.molecule.clips : [])
        .some((clip) => isRawMediaRequest(clip?.src) || isRawMediaRequest(clip?.playback_src));

    report.ok = report.http_errors.length === 0
        && report.raw_media_requests.length === 0
        && report.raw_media_http_errors.length === 0
        && report.request_failures.length === 0
        && report.console_errors.length === 0
        && report.molecule?.panel_visible === true
        && hasUnsafeMoleculeClipSource === false;
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
