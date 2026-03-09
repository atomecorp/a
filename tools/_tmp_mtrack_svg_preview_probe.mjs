import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_svg_preview_probe.json');
const shotFile = path.join(outDir, 'mtrack_svg_preview_probe.png');
const uploadPreviewFile = path.join(outDir, 'mtrack_svg_upload_preview.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const persistReport = (report) => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const safeEval = async (page, fn, arg = null, fallback = null) => {
  try { return await page.evaluate(fn, arg); } catch (_) { return fallback; }
};
const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 220) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (_) {}
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const openMtrack = async (page) => {
  const target = await safeEval(page, async () => {
    const toId = (value) => String(value || '').trim();
    const visibleAtomes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((el) => {
      const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
      if (!kind || kind === 'tool_shortcut' || kind === 'group' || kind === 'mtrack') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
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
        target_id: input.atome_id,
        selection_ids: [input.atome_id]
      },
      presentation: 'ui',
      source: { type: 'headless_probe', layer: 'mtrack_svg_preview_probe' }
    });
  }, target, { ok: false, error: 'mtrack_open_eval_failed' });
  return { ok: true, target, opened };
};

const run = async () => {
  const report = { created_at: new Date().toISOString(), url, ok: false, analysis: {} };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_PREVIEW_TRACE__ = false;
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(1200);
    await safeEval(page, async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.login) return;
      try { await api.auth.login(creds.phone, creds.password, creds.phone); } catch (_) {}
    }, { phone, password }, null);
    await sleep(900);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    const runtimeReady = await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
    if (!runtimeReady) throw new Error('runtime_not_ready');
    const openResult = await openMtrack(page);
    report.analysis.open = openResult;
    if (!openResult?.ok) throw new Error(openResult?.error || 'mtrack_open_failed');
    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      const visible = !!(panel && window.getComputedStyle(panel).display !== 'none' && window.getComputedStyle(panel).visibility !== 'hidden');
      return !!(visible && String(state?.activeGroupId || '').trim());
    }, 15000);
    if (!panelOpened) throw new Error('panel_open_failed');
    const result = await safeEval(page, async () => {
      const api = window.eveMtrackApi || null;
      const commit = window.Atome?.commit;
      if (!api?.appendCaptureAtomes || !api?.seek || !api?.getState || typeof commit !== 'function') {
        return { ok: false, error: 'mtrack_api_missing' };
      }
      const state = api.getState();
      const svgMarkup = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">',
        '<rect width="640" height="360" fill="#0b1020"/>',
        '<circle cx="180" cy="180" r="96" fill="#ff7a59"/>',
        '<rect x="280" y="92" width="220" height="176" rx="28" fill="#3dd6c6"/>',
        '<text x="320" y="318" fill="#f8fafc" font-size="42" font-family="Arial" text-anchor="middle">SVG PREVIEW</text>',
        '</svg>'
      ].join('');
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
      const atomeId = `svg_probe_${Date.now()}`;
      await commit({
        kind: 'set',
        atome_id: atomeId,
        props: {
          type: 'shape',
          kind: 'shape',
          name: 'SVG Probe',
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
      if (!appendResult?.ok) {
        return { ok: false, error: 'append_capture_failed', appendResult };
      }
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      window.__EVE_MTRACK_DEBUG_PERF__ = { metrics: {} };
      const samples = [];
      for (let index = 0; index < 4; index += 1) {
        const target = 0.1 + (index * 0.15);
        const startedAt = performance.now();
        await api.seek({ seconds: target });
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(performance.now() - startedAt);
      }
      const metrics = window.__EVE_MTRACK_DEBUG_PERF__?.metrics || {};
      const uploadStats = window.__EVE_MTRACK_DEBUG_PERF__?.last_webgpu_image_upload_stats || null;
      const drawDebug = window.__EVE_MTRACK_DEBUG_PERF__?.last_webgpu_draw_debug || null;
      const runtime = window.eveMtrackApi.getState?.() || {};
      const internal = window.eveMtrackApi?.getState?.() || {};
      return {
        ok: true,
        append_result: appendResult,
        runtime,
        internal,
        renderer_state: window.eveMtrackApi?.getState?.().renderer || null,
        upload_stats: uploadStats,
        draw_debug: drawDebug,
        perf_metrics: JSON.parse(JSON.stringify(metrics)),
        samples_ms: samples,
        panel_debug: (() => {
          const panel = document.getElementById('eve_mtrack_dialog');
          const section = document.getElementById('eve_mtrack_dialog__preview_section');
          const host = document.getElementById('eve_mtrack_dialog__preview_host');
          const canvas = host?.querySelector?.('canvas') || null;
          const panelStyle = panel ? window.getComputedStyle(panel) : null;
          const sectionStyle = section ? window.getComputedStyle(section) : null;
          const hostRect = host ? host.getBoundingClientRect() : null;
          let canvasInfo = null;
          if (canvas instanceof HTMLCanvasElement) {
            try {
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              const sampleWidth = Math.min(32, Math.max(1, canvas.width || 0));
              const sampleHeight = Math.min(32, Math.max(1, canvas.height || 0));
              let nonBlack = 0;
              let alphaVisible = 0;
              let sum = 0;
              if (ctx && sampleWidth > 0 && sampleHeight > 0) {
                const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
                const data = imageData?.data || [];
                for (let i = 0; i < data.length; i += 4) {
                  const r = Number(data[i] || 0);
                  const g = Number(data[i + 1] || 0);
                  const b = Number(data[i + 2] || 0);
                  const a = Number(data[i + 3] || 0);
                  const brightness = r + g + b;
                  sum += brightness;
                  if (a > 0) alphaVisible += 1;
                  if (brightness > 12) nonBlack += 1;
                }
                canvasInfo = {
                  width: canvas.width,
                  height: canvas.height,
                  sample_width: sampleWidth,
                  sample_height: sampleHeight,
                  non_black_pixels: nonBlack,
                  alpha_visible_pixels: alphaVisible,
                  avg_brightness: data.length ? (sum / (data.length / 4)) : 0
                };
              }
            } catch (_) { }
          }
          return {
            panel_display: String(panelStyle?.display || '').trim() || null,
            preview_section_display: String(sectionStyle?.display || '').trim() || null,
            preview_host_width: Number.isFinite(Number(hostRect?.width)) ? Number(hostRect.width) : null,
            preview_host_height: Number.isFinite(Number(hostRect?.height)) ? Number(hostRect.height) : null,
            canvas: canvasInfo
          };
        })()
      };
    }, null, { ok: false, error: 'svg_preview_eval_failed' });
    report.ok = !!result?.ok;
    report.analysis.result = result;
    try {
      const state = report.analysis.result?.runtime || report.analysis.result?.internal || {};
      const activeGroupId = String(state?.activeGroupId || '').trim();
      const target = activeGroupId
        ? page.locator(`[data-atome-id="${activeGroupId}"]`)
        : page.locator('#eve_mtrack_dialog__preview_host');
      await target.screenshot({ path: shotFile });
      report.analysis.screenshot = shotFile;
    } catch (_) { }
    try {
      const uploadPreviewDataUrl = String(report.analysis.result?.upload_stats?.preview_data_url || '').trim();
      if (uploadPreviewDataUrl.startsWith('data:image/png;base64,')) {
        const base64 = uploadPreviewDataUrl.slice('data:image/png;base64,'.length);
        fs.writeFileSync(uploadPreviewFile, Buffer.from(base64, 'base64'));
        report.analysis.upload_preview = uploadPreviewFile;
      }
    } catch (_) { }
    persistReport(report);
    process.stdout.write(`${JSON.stringify({ outFile, ok: report.ok, analysis: report.analysis }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  const report = { created_at: new Date().toISOString(), url, ok: false, analysis: { error: error?.message || String(error), stack: error?.stack || null } };
  persistReport(report);
  process.stdout.write(`${JSON.stringify({ outFile, ok: false, analysis: report.analysis }, null, 2)}\n`);
  process.exit(1);
});
