import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const headless = String(process.env.ADOLE_TEST_HEADLESS || 'true').trim().toLowerCase() !== 'false';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_svg_visual_probe.json');
const shotFile = path.join(outDir, 'mtrack_svg_visual_probe.png');
const canvasShotFile = path.join(outDir, 'mtrack_svg_visual_canvas_probe.png');
const uploadPreviewFile = path.join(outDir, 'mtrack_svg_upload_visual_probe.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const persist = (payload) => fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));

const safeEval = async (page, fn, arg = null, fallback = null) => {
    try { return await page.evaluate(fn, arg); } catch (_) { return fallback; }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 200) => {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            if (await page.evaluate(predicate)) return true;
        } catch (_) { }
        await page.waitForTimeout(intervalMs);
    }
    return false;
};

const sampleImageStatsInPage = async (page, src) => safeEval(page, async (imageSrc) => {
    const text = String(imageSrc || '').trim();
    if (!text) return null;
    const image = new Image();
    const loaded = await new Promise((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = text;
    });
    if (!loaded) return { ok: false, error: 'image_load_failed' };
    const width = Math.max(1, Number(image.naturalWidth || image.width || 0));
    const height = Math.max(1, Number(image.naturalHeight || image.height || 0));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, error: 'canvas_context_missing' };
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const stats = {
        ok: true,
        width,
        height,
        orange_pixels: 0,
        cyan_pixels: 0,
        white_pixels: 0,
        non_black_pixels: 0
    };
    for (let i = 0; i < data.length; i += 4) {
        const r = Number(data[i] || 0);
        const g = Number(data[i + 1] || 0);
        const b = Number(data[i + 2] || 0);
        const a = Number(data[i + 3] || 0);
        const brightness = r + g + b;
        if (a > 0 && brightness > 24) stats.non_black_pixels += 1;
        if (r > 200 && g > 80 && g < 180 && b < 120) stats.orange_pixels += 1;
        if (g > 160 && b > 140 && r < 120) stats.cyan_pixels += 1;
        if (r > 220 && g > 220 && b > 220) stats.white_pixels += 1;
    }
    return stats;
}, src, null);

const openMtrack = async (page) => {
    const target = await safeEval(page, async () => {
        const toId = (value) => String(value || '').trim();
        const visibleAtomes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((el) => {
            const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
            if (!kind || kind === 'tool_shortcut' || kind === 'group' || kind === 'mtrack') return false;
            const rect = el.getBoundingClientRect?.();
            return !!(rect && rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0);
        });
        const existing = visibleAtomes[0] || null;
        return existing ? { atome_id: toId(existing.dataset?.atomeId), source: 'existing' } : null;
    }, null, null);
    if (!target?.atome_id) return { ok: false, error: 'target_missing' };
    const opened = await safeEval(page, async (input) => {
        const runtime = window.atome?.tools?.v2Runtime;
        if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
        return runtime.invokeById({
            tool_id: 'ui.mtrax.open',
            event: 'touch',
            action: 'pointer.click',
            input: {
                action: 'open',
                toggle: false,
                atome_id: input.atome_id,
                group_id: input.atome_id,
                target_id: input.atome_id,
                selection_ids: [input.atome_id]
            },
            presentation: 'ui',
            source: { type: 'headless_probe', layer: 'mtrack_svg_visual_probe' }
        });
    }, target, { ok: false, error: 'open_eval_failed' });
    return { ok: true, target, opened };
};

const run = async () => {
    const report = { created_at: new Date().toISOString(), url, headless, ok: false, analysis: {} };
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({ viewport: { width: 1720, height: 1100 } });
    await context.addInitScript(() => {
        window.__EVE_MTRACK_DEBUG__ = true;
        try { window.__DEBUG__?.setDeterministicTestMode?.(true); } catch (_) { }
    });
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await sleep(1200);
        await safeEval(page, async (creds) => {
            const api = window.AdoleAPI || null;
            if (!api?.auth?.login) return;
            try { await api.auth.login(creds.phone, creds.password, creds.phone); } catch (_) { }
        }, { phone, password }, null);
        await sleep(900);
        await page.reload({ waitUntil: 'networkidle' });
        await sleep(1400);
        const runtimeReady = await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
        if (!runtimeReady) throw new Error('runtime_not_ready');
        const opened = await openMtrack(page);
        report.analysis.open = opened;
        if (!opened?.ok) throw new Error(opened?.error || 'mtrack_open_failed');
        const panelOpened = await waitFor(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            const state = window.eveMtrackApi?.getState?.() || null;
            return !!(panel && getComputedStyle(panel).display !== 'none' && state?.activeGroupId);
        }, 20000);
        if (!panelOpened) throw new Error('panel_open_failed');

        const setup = await safeEval(page, async () => {
            const api = window.eveMtrackApi || null;
            const commit = window.Atome?.commit;
            if (!api?.appendCaptureAtomes || typeof commit !== 'function') {
                return { ok: false, error: 'mtrack_api_missing' };
            }
            const svgMarkup = [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">',
                '<rect width="640" height="360" fill="#0b1020"/>',
                '<circle cx="180" cy="180" r="96" fill="#ff7a59"/>',
                '<rect x="280" y="92" width="220" height="176" rx="28" fill="#3dd6c6"/>',
                '<text x="320" y="318" fill="#f8fafc" font-size="42" font-family="Arial" text-anchor="middle">SVG PREVIEW</text>',
                '</svg>'
            ].join('');
            const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
            const atomeId = `svg_visual_probe_${Date.now()}`;
            await commit({
                kind: 'set',
                atome_id: atomeId,
                props: {
                    type: 'shape',
                    kind: 'shape',
                    name: 'SVG Visual Probe',
                    media_type: 'svg',
                    media_url: svgDataUrl,
                    src: svgDataUrl,
                    width: 320,
                    height: 180
                }
            });
            const appendResult = await api.appendCaptureAtomes({
                atome_ids: [atomeId],
                kind: 'svg',
                start_seconds: 0
            });
            if (!appendResult?.ok) return { ok: false, error: 'append_capture_failed', appendResult };
            for (let index = 0; index < 8; index += 1) {
                const target = 0.12 + (index * 0.11);
                await api.seek({ seconds: target });
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            }
            const previewSection = document.getElementById('eve_mtrack_dialog__preview_section');
            const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
            const sectionRect = previewSection?.getBoundingClientRect?.() || null;
            const hostRect = previewHost?.getBoundingClientRect?.() || null;
            return {
                ok: true,
                appendResult,
                preview_section: previewSection ? {
                    display: getComputedStyle(previewSection).display,
                    visibility: getComputedStyle(previewSection).visibility,
                    width: Number(sectionRect?.width || 0),
                    height: Number(sectionRect?.height || 0)
                } : null,
                preview_host: previewHost ? {
                    width: Number(hostRect?.width || 0),
                    height: Number(hostRect?.height || 0)
                } : null,
                renderer_state: api.getRendererState?.() || api.getState?.()?.renderer || null
            };
        }, null, { ok: false, error: 'setup_eval_failed' });
        report.analysis.setup = setup;
        if (!setup?.ok) throw new Error(setup?.error || 'setup_failed');

        const standaloneSvgStats = await sampleImageStatsInPage(
            page,
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent([
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">',
                '<rect width="640" height="360" fill="#0b1020"/>',
                '<circle cx="180" cy="180" r="96" fill="#ff7a59"/>',
                '<rect x="280" y="92" width="220" height="176" rx="28" fill="#3dd6c6"/>',
                '<text x="320" y="318" fill="#f8fafc" font-size="42" font-family="Arial" text-anchor="middle">SVG PREVIEW</text>',
                '</svg>'
            ].join(''))
        );
        report.analysis.standalone_svg_stats = standaloneSvgStats;

        const visibilityPrep = await safeEval(page, async () => {
            const api = window.eveMtrackApi || null;
            const previewSection = document.getElementById('eve_mtrack_dialog__preview_section');
            const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
            const body = document.getElementById('eve_mtrack_dialog__body');
            const summary = {
                before: {
                    section_display: previewSection ? getComputedStyle(previewSection).display : null,
                    section_visibility: previewSection ? getComputedStyle(previewSection).visibility : null,
                    host_display: previewHost ? getComputedStyle(previewHost).display : null,
                    host_visibility: previewHost ? getComputedStyle(previewHost).visibility : null,
                    section_width: Number(previewSection?.getBoundingClientRect?.().width || 0),
                    section_height: Number(previewSection?.getBoundingClientRect?.().height || 0),
                    host_width: Number(previewHost?.getBoundingClientRect?.().width || 0),
                    host_height: Number(previewHost?.getBoundingClientRect?.().height || 0)
                },
                forced: false
            };
            if (previewSection && previewHost) {
                const bodyWidth = Math.max(360, Number(body?.getBoundingClientRect?.().width || 0));
                const needForce = summary.before.section_display === 'none'
                    || summary.before.section_height < 80
                    || summary.before.host_height < 80;
                if (needForce) {
                    previewSection.style.display = 'block';
                    previewSection.style.visibility = 'visible';
                    previewSection.style.flex = '0 0 220px';
                    previewSection.style.height = '220px';
                    previewSection.style.minHeight = '220px';
                    previewSection.style.width = `${Math.max(320, Math.round(bodyWidth))}px`;
                    previewHost.style.display = 'block';
                    previewHost.style.visibility = 'visible';
                    previewHost.style.position = 'absolute';
                    previewHost.style.inset = '0';
                    summary.forced = true;
                }
            }
            if (api?.seek) {
                for (let index = 0; index < 6; index += 1) {
                    const target = 0.18 + (index * 0.09);
                    await api.seek({ seconds: target });
                    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                }
            }
            summary.after = {
                section_display: previewSection ? getComputedStyle(previewSection).display : null,
                section_visibility: previewSection ? getComputedStyle(previewSection).visibility : null,
                host_display: previewHost ? getComputedStyle(previewHost).display : null,
                host_visibility: previewHost ? getComputedStyle(previewHost).visibility : null,
                section_width: Number(previewSection?.getBoundingClientRect?.().width || 0),
                section_height: Number(previewSection?.getBoundingClientRect?.().height || 0),
                host_width: Number(previewHost?.getBoundingClientRect?.().width || 0),
                host_height: Number(previewHost?.getBoundingClientRect?.().height || 0)
            };
            return summary;
        }, null, null);
        report.analysis.visibility_prep = visibilityPrep;
        const surface = await safeEval(page, async () => {
            const api = window.eveMtrackApi || null;
            const state = api?.getState?.() || null;
            const groupId = String(state?.activeGroupId || '').trim();
            const groupEl = groupId ? document.querySelector(`[data-atome-id="${groupId}"]`) : null;
            const overlay = groupEl?.querySelector?.('[data-role="mtrax-gpu-overlay"], [data-role="mtrax-c2d-overlay"]') || null;
            const canvas = overlay?.querySelector?.('canvas') || null;
            const rect = groupEl?.getBoundingClientRect?.() || null;
            return {
                group_id: groupId || null,
                group_present: !!groupEl,
                overlay_role: String(overlay?.getAttribute?.('data-role') || '').trim() || null,
                canvas_present: !!canvas,
                canvas_size: canvas ? {
                    width: Number(canvas.width || 0),
                    height: Number(canvas.height || 0)
                } : null,
                rect: rect ? {
                    width: Number(rect.width || 0),
                    height: Number(rect.height || 0)
                } : null
            };
        }, null, null);
        report.analysis.surface = surface;
        if (!surface?.group_id || !surface?.group_present) {
            throw new Error('group_surface_missing');
        }
        const host = page.locator(`[data-atome-id="${surface.group_id}"]`);
        await host.waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(1200);
        const screenshotBase64 = await host.screenshot({ path: shotFile, type: 'png', encoding: 'base64' });
        const pixelStats = await safeEval(page, async (base64) => {
            const src = `data:image/png;base64,${String(base64 || '')}`;
            const image = new Image();
            const loaded = await new Promise((resolve) => {
                image.onload = () => resolve(true);
                image.onerror = () => resolve(false);
                image.src = src;
            });
            if (!loaded) return null;
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 0;
            canvas.height = image.naturalHeight || image.height || 0;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx || !canvas.width || !canvas.height) return null;
            ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const stats = {
                width: canvas.width,
                height: canvas.height,
                non_black_pixels: 0,
                bright_pixels: 0,
                orange_pixels: 0,
                cyan_pixels: 0,
                white_pixels: 0,
                avg_brightness: 0
            };
            let brightnessSum = 0;
            const total = canvas.width * canvas.height;
            for (let i = 0; i < data.length; i += 4) {
                const r = Number(data[i] || 0);
                const g = Number(data[i + 1] || 0);
                const b = Number(data[i + 2] || 0);
                const a = Number(data[i + 3] || 0);
                const brightness = r + g + b;
                brightnessSum += brightness;
                if (a > 0 && brightness > 24) stats.non_black_pixels += 1;
                if (brightness > 420) stats.bright_pixels += 1;
                if (r > 200 && g > 80 && g < 180 && b < 120) stats.orange_pixels += 1;
                if (g > 160 && b > 140 && r < 120) stats.cyan_pixels += 1;
                if (r > 220 && g > 220 && b > 220) stats.white_pixels += 1;
            }
            stats.avg_brightness = total > 0 ? brightnessSum / total : 0;
            return stats;
        }, screenshotBase64, null);

        const canvasDataUrl = await safeEval(page, async () => {
            const api = window.eveMtrackApi || null;
            const state = api?.getState?.() || null;
            const groupId = String(state?.activeGroupId || '').trim();
            const groupEl = groupId ? document.querySelector(`[data-atome-id="${groupId}"]`) : null;
            const canvas = groupEl?.querySelector?.('[data-role="mtrax-gpu-overlay"] canvas') || null;
            if (!(canvas instanceof HTMLCanvasElement)) return null;
            try { return canvas.toDataURL('image/png'); } catch (_) { return null; }
        }, null, null);
        if (typeof canvasDataUrl === 'string' && canvasDataUrl.startsWith('data:image/png;base64,')) {
            try {
                const base64 = canvasDataUrl.slice('data:image/png;base64,'.length);
                fs.writeFileSync(canvasShotFile, Buffer.from(base64, 'base64'));
                report.analysis.canvas_screenshot = canvasShotFile;
            } catch (_) { }
        }

        const snapshot = await safeEval(page, async () => ({
            renderer_state: window.eveMtrackApi?.getRendererState?.() || window.eveMtrackApi?.getState?.()?.renderer || null,
            debug: window.__DEBUG__?.getAppState?.() || null,
            last_probe: window.__EVE_MTRAX_LAST_ENABLE_WEBGPU__ || null,
            last_webgpu_image_upload_stats: window.__EVE_MTRACK_DEBUG_PERF__?.last_webgpu_image_upload_stats || null,
            last_webgpu_draw_debug: window.__EVE_MTRACK_DEBUG_PERF__?.last_webgpu_draw_debug || null,
            media_pool_images: Array.from(document.querySelectorAll('[data-role="mtrax-gpu-media-pool"] img')).map((img) => ({
                src_prefix: String(img.currentSrc || img.src || '').slice(0, 120),
                natural_width: Number(img.naturalWidth || 0),
                natural_height: Number(img.naturalHeight || 0)
            }))
        }), null, null);
        report.analysis.snapshot = snapshot;
        const firstPoolImageSrc = Array.isArray(snapshot?.media_pool_images) && snapshot.media_pool_images.length
            ? String(await safeEval(page, () => {
                const img = document.querySelector('[data-role="mtrax-gpu-media-pool"] img');
                return String(img?.currentSrc || img?.src || '');
            }, null, ''))
            : '';
        report.analysis.media_pool_image_stats = firstPoolImageSrc
            ? await sampleImageStatsInPage(page, firstPoolImageSrc)
            : null;
        try {
            const uploadPreviewDataUrl = String(snapshot?.last_webgpu_image_upload_stats?.preview_data_url || '').trim();
            if (uploadPreviewDataUrl.startsWith('data:image/png;base64,')) {
                const base64 = uploadPreviewDataUrl.slice('data:image/png;base64,'.length);
                fs.writeFileSync(uploadPreviewFile, Buffer.from(base64, 'base64'));
                report.analysis.upload_preview = uploadPreviewFile;
            }
        } catch (_) { }
        report.analysis.screenshot = shotFile;
        report.analysis.pixel_stats = pixelStats;
        report.ok = true;
        persist(report);
        process.stdout.write(`${JSON.stringify({ outFile, ok: true, analysis: report.analysis }, null, 2)}\n`);
    } finally {
        await browser.close();
    }
};

run().catch((error) => {
    const report = {
        created_at: new Date().toISOString(),
        url,
        headless,
        ok: false,
        analysis: { error: error?.message || String(error), stack: error?.stack || null }
    };
    persist(report);
    process.stdout.write(`${JSON.stringify({ outFile, ok: false, analysis: report.analysis }, null, 2)}\n`);
    process.exit(1);
});
