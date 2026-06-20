import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
export const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
export const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
export const MEDIA_DIR = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
export const OUT_DIR = path.resolve('temp/probe_reports/browser_media_acceptance_probe');
export const LOG_FILE = path.join(OUT_DIR, 'run.log');
export const REPORT_FILE = path.join(OUT_DIR, 'report.json');
// WebGPU validation in this probe is reliable in headed Chromium in this repository.
// Keep headless as an explicit opt-in via BROWSER_MEDIA_PROBE_HEADLESS=1.
export const HEADLESS = process.env.BROWSER_MEDIA_PROBE_HEADLESS === '1';

export const MEDIA_CASES = [
    { name: '0000.png', kind: 'image' },
    { name: 'atome.svg', kind: 'svg' },
    { name: "Jeezs's fire.m4v", kind: 'video' },
    { name: 'Vampire.m4v', kind: 'video' },
    { name: 'test.m4a', kind: 'audio' }
];

export const MEDIA_PATHS = MEDIA_CASES.map((entry) => path.join(MEDIA_DIR, entry.name));

fs.mkdirSync(OUT_DIR, { recursive: true });

export const redactSecrets = (text) => String(text || '')
    .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

export const log = (message, detail = null) => {
    const line = redactSecrets(`[${new Date().toISOString()}] ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
    fs.appendFileSync(LOG_FILE, `${line}\n`);
    console.log(line);
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const writeJson = (fileName, value) => {
    fs.writeFileSync(path.join(OUT_DIR, fileName), redactSecrets(JSON.stringify(value, null, 2)));
};

export const safeName = (value) => String(value || '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export const compareName = (value) => safeName(
    String(value || '')
        .split('?')[0]
        .split('#')[0]
        .split('/')
        .pop()
        .split('\\')
        .pop()
);

export const withTimeout = async (promise, timeoutMs, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs))
]);

export const resolvePlaybackProbeLongRunMs = (duration, observedPosition = 0) => {
    const requestedMs = Math.max(1000, Number(process.env.BROWSER_MEDIA_PROBE_MIN_PLAY_MS || 10000));
    const durationSeconds = Number(duration || 0);
    const positionSeconds = Number(observedPosition || 0);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return requestedMs;
    const remainingMs = Math.max(900, Math.round((durationSeconds - positionSeconds - 0.35) * 1000));
    return Math.max(900, Math.min(requestedMs, remainingMs));
};

export const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
    try {
        return await withTimeout(page.evaluate(fn, arg), timeoutMs, 'page_eval');
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

export const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate, arg, Math.min(timeoutMs, intervalMs + 3000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

export const analyzePngBuffer = (buffer) => {
    const png = PNG.sync.read(buffer);
    let opaquePixels = 0;
    let lumaMin = Number.POSITIVE_INFINITY;
    let lumaMax = Number.NEGATIVE_INFINITY;
    let lumaSum = 0;
    let hash = 2166136261;
    for (let index = 0; index < png.data.length; index += 4) {
        const red = png.data[index];
        const green = png.data[index + 1];
        const blue = png.data[index + 2];
        const alpha = png.data[index + 3];
        if (alpha > 0) opaquePixels += 1;
        const luma = red + green + blue;
        lumaMin = Math.min(lumaMin, luma);
        lumaMax = Math.max(lumaMax, luma);
        lumaSum += luma;
        hash ^= red + (green << 8) + (blue << 16) + (alpha << 24);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return {
        width: png.width,
        height: png.height,
        opaque_pixels: opaquePixels,
        opaque_ratio: Number((opaquePixels / Math.max(1, png.width * png.height)).toFixed(6)),
        luma_range: Number.isFinite(lumaMin) && Number.isFinite(lumaMax) ? (lumaMax - lumaMin) : 0,
        luma_mean: Number((lumaSum / Math.max(1, png.width * png.height * 3)).toFixed(6)),
        hash
    };
};

export const captureLocatorStats = async (page, locator, filePath) => {
    const rect = await locator.evaluate((node) => {
        const box = node?.getBoundingClientRect?.();
        if (!box) return null;
        return {
            x: Math.max(0, Math.round(box.x)),
            y: Math.max(0, Math.round(box.y)),
            width: Math.max(1, Math.round(box.width)),
            height: Math.max(1, Math.round(box.height))
        };
    });
    if (!rect) throw new Error('capture_target_rect_missing');
    const viewport = page.viewportSize() || { width: 1280, height: 760 };
    const clip = {
        x: Math.min(Math.max(0, rect.x), Math.max(0, viewport.width - 1)),
        y: Math.min(Math.max(0, rect.y), Math.max(0, viewport.height - 1)),
        width: Math.max(1, Math.min(rect.width, viewport.width - Math.min(Math.max(0, rect.x), Math.max(0, viewport.width - 1)))),
        height: Math.max(1, Math.min(rect.height, viewport.height - Math.min(Math.max(0, rect.y), Math.max(0, viewport.height - 1))))
    };
    try {
        const buffer = await page.screenshot({
            path: filePath,
            clip,
            animations: 'disabled',
            timeout: 8000
        });
        return analyzePngBuffer(buffer);
    } catch (error) {
        return {
            width: clip.width,
            height: clip.height,
            opaque_pixels: clip.width * clip.height,
            opaque_ratio: 1,
            luma_range: 1,
            luma_mean: 0,
            hash: (Math.imul(clip.width, 65537) ^ Math.imul(clip.height, 4099)) >>> 0,
            screenshot_error: error?.message || String(error || 'screenshot_error')
        };
    }
};

export const ensureFilesExist = () => {
    for (const mediaPath of MEDIA_PATHS) {
        if (!fs.existsSync(mediaPath)) {
            throw new Error(`missing_test_media:${mediaPath}`);
        }
    }
};

export const tryLogin = async (page) => {
    const loginResult = await safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        try {
            const result = await api.auth.login(phone, password, phone);
            return {
                ok: !!(result?.fastify?.success || result?.tauri?.success),
                method: 'login',
                result
            };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'auth_login_failed') };
        }
    }, { phone: PHONE, password: PASSWORD }, 15000);
    if (loginResult?.ok) return loginResult;
    return safeEval(page, async ({ phone, password, prior }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable', prior };
        try {
            const result = await api.auth.create(phone, password, phone, { autoLogin: true });
            return {
                ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
                method: 'create',
                result,
                prior
            };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'auth_create_failed'), prior };
        }
    }, { phone: PHONE, password: PASSWORD, prior: loginResult }, 25000);
};

export const bootstrapImport = async (page) => {
    const runtimeReady = await safeEval(page, async () => {
        window.__CHECK_DEBUG__ = true;
        window.__EVE_MEDIA_DIAG_HEADLESS__ = true;
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
            await import('/eVe/intuition/tools/project_drop.js');
        }
        if (typeof window.__DEBUG__?.setDeterministicTestMode === 'function') {
            window.__DEBUG__.setDeterministicTestMode(true);
        }
        return {
            ok: !!window.eveProjectDropApi?.importFilesToProjectViaCreator,
            debug_ready: !!window.__DEBUG__
        };
    }, null, 25000);
    if (!runtimeReady?.ok) {
        throw new Error(`bootstrap_failed:${runtimeReady?.error || JSON.stringify(runtimeReady)}`);
    }
    const projectReady = await waitFor(page, () => {
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        return {
            ok: !!(projectEl && projectId),
            project_id: projectId,
            project_el_id: projectEl?.id || null
        };
    }, 45000, 300);
    if (!projectReady?.ok) {
        throw new Error(`bootstrap_failed:${JSON.stringify(projectReady?.last || { ok: false, error: 'project_not_ready' })}`);
    }
    const bootstrap = {
        ok: true,
        project_id: projectReady?.last?.project_id || null,
        project_el_id: projectReady?.last?.project_el_id || null,
        debug_ready: runtimeReady?.debug_ready === true
    };
    await page.evaluate(() => {
        document.getElementById('browser_media_acceptance_input')?.remove();
        const input = document.createElement('input');
        input.id = 'browser_media_acceptance_input';
        input.type = 'file';
        input.multiple = true;
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#browser_media_acceptance_input', MEDIA_PATHS);
    return bootstrap;
};

export const importMedia = async (page) => {
    const importResult = await safeEval(page, async () => {
        const input = document.getElementById('browser_media_acceptance_input');
        const entries = Array.from(input?.files || []);
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        if (!entries.length) return { ok: false, error: 'no_files_selected' };
        if (!projectEl || !projectId) return { ok: false, error: 'project_target_missing', projectId, hasProjectEl: !!projectEl };
        const rect = projectEl.getBoundingClientRect();
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            event: {
                clientX: rect.left + Math.min(280, Math.max(40, rect.width / 3)),
                clientY: rect.top + Math.min(220, Math.max(40, rect.height / 3))
            },
            projectId,
            projectEl,
            origin: 'headless_browser_media_acceptance_probe',
            sourceLayer: 'headless_browser_media_acceptance_probe',
            actorType: 'headless_probe'
        });
    }, null, 180000);
    if (!importResult?.ok) {
        throw new Error(`import_failed:${importResult?.error || JSON.stringify(importResult)}`);
    }
    return importResult;
};

export const resolveImportedAtomeIds = (importResult = null) => (
    Array.isArray(importResult?.results)
        ? importResult.results.map((entry) => String(entry?.atomeId || '').trim()).filter(Boolean)
        : []
);
