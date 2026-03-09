import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_webgpu_state_probe.json');

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
    } catch (_) {}
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const openMtrack = async (page) => {
  const target = await safeEval(page, async () => {
    const all = Array.from(document.querySelectorAll('[data-atome-id][data-project-timeline="true"]'));
    const visible = all.find((el) => {
      const rect = el.getBoundingClientRect?.();
      return !!(rect && rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0);
    }) || null;
    return visible ? { atome_id: String(visible.dataset?.atomeId || '').trim() } : null;
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
      source: { type: 'headless_probe', layer: 'mtrack_webgpu_state_probe' }
    });
  }, target, { ok: false, error: 'open_eval_failed' });
  return { ok: true, target, opened };
};

const run = async () => {
  const report = { created_at: new Date().toISOString(), url, ok: false, analysis: {} };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
  await context.addInitScript(() => {
    try { localStorage.setItem('eve:mtrax:renderer:mode:v3', 'webgpu'); } catch (_) {}
    window.__eveMtraxRendererMode = 'webgpu';
    window.__EVE_MTRACK_DEBUG__ = true;
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
    const opened = await openMtrack(page);
    report.analysis.open = opened;
    if (!opened?.ok) throw new Error(opened?.error || 'mtrack_open_failed');
    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      return !!(panel && getComputedStyle(panel).display !== 'none' && window.eveMtrackApi?.getState?.()?.activeGroupId);
    }, 15000);
    if (!panelOpened) throw new Error('panel_open_failed');
    await page.waitForTimeout(1200);
    const snapshot = await safeEval(page, async () => {
      const rendererState = window.eveMtrackRendererApi?.getState?.() || null;
      const mtrackState = window.eveMtrackApi?.getState?.() || null;
      const host = document.getElementById('eve_mtrack_dialog__preview_host');
      const overlay = host?.querySelector?.('[data-role="mtrax-gpu-overlay"], [data-role="mtrax-c2d-overlay"]') || null;
      const canvas = overlay?.querySelector?.('canvas') || host?.querySelector?.('canvas') || null;
      const canvasInfo = canvas ? {
        width: Number(canvas.width || 0),
        height: Number(canvas.height || 0),
        role: String(canvas.parentElement?.getAttribute?.('data-role') || ''),
      } : null;
      return {
        rendererState,
        mtrackRenderer: mtrackState?.renderer || null,
        previewHost: host ? {
          width: Number(host.getBoundingClientRect?.().width || 0),
          height: Number(host.getBoundingClientRect?.().height || 0)
        } : null,
        overlayRole: String(overlay?.getAttribute?.('data-role') || ''),
        canvasInfo,
        trace: Array.isArray(window.__EVE_MTRAX_INTERACTION_TRACE__) ? window.__EVE_MTRAX_INTERACTION_TRACE__.slice(-80) : []
      };
    }, null, null);
    report.ok = !!snapshot;
    report.analysis.snapshot = snapshot;
    persist(report);
    process.stdout.write(`${JSON.stringify({ outFile, ok: report.ok, analysis: report.analysis }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    analysis: { error: error?.message || String(error), stack: error?.stack || null }
  };
  persist(report);
  process.stdout.write(`${JSON.stringify({ outFile, ok: false, analysis: report.analysis }, null, 2)}\n`);
  process.exit(1);
});
