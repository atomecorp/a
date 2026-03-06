import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_perf_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 220) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch (_) {}
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (_) {
    return fallback;
  }
};

const persistReport = (report) => {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
};

const withTimeout = async (label, promise, timeoutMs = 45000) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const openMtrackOnAnyVisibleAtome = async (page) => {
  const target = await safeEval(page, async () => {
    const toId = (value) => String(value || '').trim();
    const visibleAtomes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((el) => {
      const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
      if (!kind || kind === 'tool_shortcut' || kind === 'group' || kind === 'mtrack') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
    });
    const existing = visibleAtomes[0] || null;
    if (existing) {
      return { atome_id: toId(existing.dataset?.atomeId), source: 'existing' };
    }

    const runtime = window.atome?.tools?.v2Runtime;
    if (!runtime?.invokeById) return null;
    const created = await runtime.invokeById({
      tool_id: 'ui.circle',
      event: 'touch',
      action: 'pointer.click',
      input: { x: 360, y: 280, radius: 44, fill: '#00AEEF' },
      presentation: 'ui',
      source: { type: 'headless_probe', layer: 'mtrack_perf_probe' }
    });
    const atomeId = toId(
      created?.result?.result?.atome_id
      || created?.result?.atome_id
      || created?.atome_id
    );
    if (!atomeId) return null;
    return { atome_id: atomeId, source: 'created' };
  }, null, null);

  if (!target?.atome_id) return { ok: false, error: 'target_missing' };

  const mtrackOpen = await safeEval(page, async (input) => {
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
      source: { type: 'headless_probe', layer: 'mtrack_perf_probe' }
    });
  }, { atome_id: target.atome_id }, { ok: false, error: 'mtrack_open_eval_failed' });

  return { ok: true, target, mtrackOpen };
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    analysis: {},
    progress: []
  };

  const pushProgress = (step, detail = {}) => {
    report.progress.push({
      step,
      at: new Date().toISOString(),
      ...detail
    });
    persistReport(report);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_PREVIEW_TRACE__ = false;
  });
  const page = await context.newPage();

  try {
    pushProgress('goto:start');
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(1200);
    pushProgress('goto:done');

    await safeEval(page, async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.login) return;
      try { await api.auth.login(creds.phone, creds.password, creds.phone); } catch (_) {}
    }, { phone, password }, null);
    await sleep(900);
    pushProgress('auth:done');
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    pushProgress('reload:done');

    const runtimeReady = await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
    if (!runtimeReady) {
      report.analysis.error = 'runtime_not_ready';
      persistReport(report);
      process.exit(1);
      return;
    }
    pushProgress('runtime:ready');

    const openResult = await openMtrackOnAnyVisibleAtome(page);
    report.analysis.open = openResult;
    if (!openResult?.ok) {
      persistReport(report);
      process.exit(1);
      return;
    }
    pushProgress('mtrack:opened');

    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      const visible = !!(panel && window.getComputedStyle(panel).display !== 'none' && window.getComputedStyle(panel).visibility !== 'hidden');
      return !!(visible && String(state?.activeGroupId || '').trim());
    }, 15000);

    if (!panelOpened) {
      report.analysis.error = 'panel_open_failed';
      persistReport(report);
      process.exit(1);
      return;
    }
    pushProgress('panel:visible');

    pushProgress('benchmark:launch');
    const benchStarted = await withTimeout('benchmark_launch', safeEval(page, () => {
      const api = window.eveMtrackApi || null;
      if (!api?.debugBenchmarkSyntheticTimeline) {
        window.__MTRACK_PERF_PROBE_STATE__ = {
          status: 'error',
          result: { ok: false, error: 'debug_benchmark_missing' }
        };
        return { ok: false, error: 'debug_benchmark_missing' };
      }
      const baseline = api.getState?.() || null;
      window.__MTRACK_PERF_PROBE_STATE__ = {
        status: 'running',
        started_at: Date.now(),
        baseline
      };
      window.setTimeout(() => {
        void (async () => {
          try {
            const benchmark = await api.debugBenchmarkSyntheticTimeline({
              track_count: 48,
              clips_per_track: 24,
              iterations: 8
            });
            const after = api.getState?.() || null;
            window.__MTRACK_PERF_PROBE_STATE__ = {
              status: 'done',
              result: { ok: true, baseline, benchmark, after }
            };
          } catch (error) {
            window.__MTRACK_PERF_PROBE_STATE__ = {
              status: 'error',
              result: {
                ok: false,
                error: error?.message || String(error),
                stack: error?.stack || null
              }
            };
          }
        })();
      }, 0);
      return { ok: true };
    }, null, { ok: false, error: 'perf_probe_start_failed' }), 6000);

    if (!benchStarted?.ok) {
      report.analysis.perf = benchStarted;
      persistReport(report);
      process.exit(1);
      return;
    }
    pushProgress('benchmark:start');

    await withTimeout('benchmark_wait', waitFor(page, () => {
      const state = window.__MTRACK_PERF_PROBE_STATE__ || null;
      return state?.status === 'done' || state?.status === 'error';
    }, 45000, 250), 46000);

    const perf = await safeEval(page, () => {
      const state = window.__MTRACK_PERF_PROBE_STATE__ || null;
      return state?.result || { ok: false, error: 'perf_probe_result_missing' };
    }, null, { ok: false, error: 'perf_eval_failed' });
    pushProgress('benchmark:done', {
      ok: !!perf?.ok,
      has_zoom_horizontal: !!perf?.benchmark?.zoom_horizontal,
      has_zoom_vertical: !!perf?.benchmark?.zoom_vertical
    });

    report.ok = !!perf?.ok;
    report.analysis.perf = perf;
    persistReport(report);
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
    analysis: {
      error: error?.message || String(error),
      stack: error?.stack || null
    }
  };
  persistReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
});
