import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_current_video_preview_probe.json');

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
      source: { type: 'headless_probe', layer: 'mtrack_current_video_preview_probe' }
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
      if (!api?.debugBenchmarkCurrentVideoPreview) return { ok: false, error: 'debug_current_video_preview_missing' };
      return api.debugBenchmarkCurrentVideoPreview({ iterations: 10 });
    }, null, { ok: false, error: 'current_video_preview_eval_failed' });
    report.ok = !!result?.ok;
    report.analysis.result = result;
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
