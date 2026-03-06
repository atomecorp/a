import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_drag_perf_probe.json');
const SYNTH_TRACK_COUNT = 24;
const SYNTH_CLIPS_PER_TRACK = 12;

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

const summarize = (samples = []) => {
  const values = Array.isArray(samples)
    ? samples.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0)
    : [];
  if (!values.length) return { count: 0, min_ms: 0, max_ms: 0, avg_ms: 0, p95_ms: 0, samples_ms: [] };
  const sorted = values.slice().sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return {
    count: values.length,
    min_ms: Math.round(sorted[0] * 1000) / 1000,
    max_ms: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
    avg_ms: Math.round((total / values.length) * 1000) / 1000,
    p95_ms: Math.round(sorted[p95Index] * 1000) / 1000,
    samples_ms: values.map((value) => Math.round(value * 1000) / 1000)
  };
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
    if (existing) return { atome_id: toId(existing.dataset?.atomeId), source: 'existing' };
    return null;
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
      source: { type: 'headless_probe', layer: 'mtrack_drag_perf_probe' }
    });
  }, target, { ok: false, error: 'mtrack_open_eval_failed' });

  return { ok: true, target, opened };
};

const mountSynthetic = async (page) => safeEval(page, () => {
  const api = window.eveMtrackApi || null;
  if (!api?.debugMountSyntheticTimeline) return { ok: false, error: 'debug_mount_missing' };
  void api.debugMountSyntheticTimeline({ track_count: 24, clips_per_track: 12 });
  return { ok: true, invoked: true };
}, null, { ok: false, error: 'mount_eval_failed' });

const restoreSynthetic = async (page) => safeEval(page, () => {
  const api = window.eveMtrackApi || null;
  if (!api?.debugRestoreSyntheticTimeline) return { ok: false, error: 'debug_restore_missing' };
  void api.debugRestoreSyntheticTimeline();
  return { ok: true, invoked: true };
}, null, { ok: false, error: 'restore_eval_failed' });

const markStart = async (page, key) => {
  await safeEval(page, (input) => {
    window.__MTRACK_DRAG_PROBE_MARKS__ = window.__MTRACK_DRAG_PROBE_MARKS__ || {};
    window.__MTRACK_DRAG_PROBE_MARKS__[input.key] = performance.now();
  }, { key }, null);
};

const resetPerfStats = async (page) => {
  await safeEval(page, () => {
    window.__EVE_MTRACK_DEBUG_PERF__ = { metrics: {} };
  }, null, null);
};

const readPerfStats = async (page) => safeEval(page, () => {
  const metrics = window.__EVE_MTRACK_DEBUG_PERF__?.metrics || {};
  return JSON.parse(JSON.stringify(metrics));
}, null, {});

const readElapsed = async (page, key) => safeEval(page, (input) => {
  const marks = window.__MTRACK_DRAG_PROBE_MARKS__ || {};
  const start = Number(marks[input.key] || 0);
  return Math.max(0, performance.now() - start);
}, { key }, null);

const readMetricTotal = (metrics, key) => {
  const value = Number(metrics?.[key]?.total_ms || 0);
  return Number.isFinite(value) ? value : 0;
};

const readMetricCount = (metrics, key) => {
  const value = Number(metrics?.[key]?.count || 0);
  return Number.isFinite(value) ? value : 0;
};

const readClipSnapshot = async (page) => safeEval(page, () => {
  const node = document.querySelector('.eve-mtrack-clip');
  if (!(node instanceof HTMLElement)) return null;
  const clipId = Number.parseInt(node.dataset.clipId || '', 10);
  const clipRef = node.__eveMtrackRefs?.clip || null;
  const rect = node.getBoundingClientRect();
  return {
    clip_id: clipId,
    width_px: Math.round(rect.width * 100) / 100,
    start: Number(clipRef?.start || 0),
    in: Number(clipRef?.in || 0),
    out: Number(clipRef?.out || 0)
  };
}, null, null);

const resolveDragGeometry = async (page) => safeEval(page, () => {
  const body = document.querySelector('.eve-mtrack-clip .eve-mtrack-clip-body');
  if (!(body instanceof HTMLElement)) return null;
  const rect = body.getBoundingClientRect();
  return {
    startX: Math.round(rect.left + rect.width * 0.5),
    startY: Math.round(rect.top + rect.height * 0.5),
    endX: Math.round(rect.left + rect.width * 0.5 + 220),
    endY: Math.round(rect.top + rect.height * 0.5 + 72)
  };
}, null, null);

const resolveCropGeometry = async (page) => safeEval(page, () => {
  const handle = document.querySelector('.eve-mtrack-clip .eve-mtrack-clip-handle:last-child');
  if (!(handle instanceof HTMLElement)) return null;
  const rect = handle.getBoundingClientRect();
  return {
    startX: Math.round(rect.left + rect.width * 0.5),
    startY: Math.round(rect.top + rect.height * 0.5),
    endX: Math.round(rect.left + rect.width * 0.5 + 160),
    endY: Math.round(rect.top + rect.height * 0.5)
  };
}, null, null);

const performDrag = async (page, geometry, options = {}) => {
  const steps = Math.max(2, Number(options.steps) || 12);
  const frameDelayMs = Math.max(0, Number(options.frameDelayMs) || 0);
  await page.mouse.move(geometry.startX, geometry.startY);
  await page.mouse.down();
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const nextX = Math.round(geometry.startX + ((geometry.endX - geometry.startX) * progress));
    const nextY = Math.round(geometry.startY + ((geometry.endY - geometry.startY) * progress));
    await page.mouse.move(nextX, nextY);
    if (frameDelayMs > 0) {
      await page.waitForTimeout(frameDelayMs);
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(70);
};

const withTimeout = async (label, promise, timeoutMs = 12000) => {
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

    const open = await openMtrack(page);
    report.analysis.open = open;
    if (!open?.ok) {
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

    const dragMountSamples = [];
    const dragSamples = [];
    const dragTotalSamples = [];
    const dragSyncRafSamples = [];
    const dragSyncPositionsSamples = [];
    const dragUpdateMaxTimeSamples = [];
    const dragLaneApplySamples = [];
    const dragSyncRafCountSamples = [];
    const cropMountSamples = [];
    const cropSamples = [];
    const cropTotalSamples = [];
    const cropSyncRafSamples = [];
    const cropSyncPositionsSamples = [];
    const cropUpdateMaxTimeSamples = [];
    const cropSyncRafCountSamples = [];
    const cropMutationFlags = [];
    for (let index = 0; index < 2; index += 1) {
      const iterationStartAt = Date.now();
      pushProgress('drag:mount:start', { iteration: index });
      const mountStartAt = Date.now();
      await withTimeout('drag_mount', mountSynthetic(page));
      const dragMounted = await waitFor(page, () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const clips = document.querySelectorAll('.eve-mtrack-clip').length;
        return Number(state?.clipCount || 0) >= 250 && clips >= 8;
      }, 12000, 120);
      if (!dragMounted) throw new Error('drag_mount_wait_failed');
      const mountElapsed = Date.now() - mountStartAt;
      dragMountSamples.push(mountElapsed);
      pushProgress('drag:mount:done', { iteration: index, elapsed_ms: mountElapsed });
      await page.waitForTimeout(40);
      const geometry = await resolveDragGeometry(page);
      if (!geometry) throw new Error('drag_geometry_missing');
      pushProgress('drag:gesture:start', { iteration: index, geometry });
      await resetPerfStats(page);
      await markStart(page, 'drag');
      await withTimeout('drag_gesture', performDrag(page, geometry, { steps: 12, frameDelayMs: 16 }));
      const elapsed = await readElapsed(page, 'drag');
      const perfMetrics = await readPerfStats(page);
      dragSamples.push(elapsed);
      dragSyncRafSamples.push(readMetricTotal(perfMetrics, 'drag_sync_raf_ms'));
      dragSyncPositionsSamples.push(readMetricTotal(perfMetrics, 'drag_sync_positions_ms'));
      dragUpdateMaxTimeSamples.push(readMetricTotal(perfMetrics, 'drag_update_max_time_ms'));
      dragLaneApplySamples.push(readMetricTotal(perfMetrics, 'drag_lane_apply_ms'));
      dragSyncRafCountSamples.push(readMetricCount(perfMetrics, 'drag_sync_raf_ms'));
      pushProgress('drag:gesture:done', { iteration: index, elapsed_ms: elapsed });
      dragTotalSamples.push(Date.now() - iterationStartAt);
    }

    for (let index = 0; index < 2; index += 1) {
      const iterationStartAt = Date.now();
      pushProgress('crop:mount:start', { iteration: index });
      const mountStartAt = Date.now();
      await withTimeout('crop_mount', mountSynthetic(page));
      const cropMounted = await waitFor(page, () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const clips = document.querySelectorAll('.eve-mtrack-clip').length;
        return Number(state?.clipCount || 0) >= 250 && clips >= 8;
      }, 12000, 120);
      if (!cropMounted) throw new Error('crop_mount_wait_failed');
      const mountElapsed = Date.now() - mountStartAt;
      cropMountSamples.push(mountElapsed);
      pushProgress('crop:mount:done', { iteration: index, elapsed_ms: mountElapsed });
      await page.waitForTimeout(40);
      const geometry = await resolveCropGeometry(page);
      if (!geometry) throw new Error('crop_geometry_missing');
      const beforeCrop = await readClipSnapshot(page);
      pushProgress('crop:gesture:start', { iteration: index, geometry });
      await resetPerfStats(page);
      await markStart(page, 'crop');
      await withTimeout('crop_gesture', performDrag(page, geometry, { steps: 12, frameDelayMs: 16 }));
      const elapsed = await readElapsed(page, 'crop');
      const perfMetrics = await readPerfStats(page);
      const afterCrop = await readClipSnapshot(page);
      const cropMutated = !!(
        beforeCrop
        && afterCrop
        && (
          Math.abs(Number(afterCrop.out || 0) - Number(beforeCrop.out || 0)) > 0.0001
          || Math.abs(Number(afterCrop.width_px || 0) - Number(beforeCrop.width_px || 0)) > 0.5
          || Math.abs(Number(afterCrop.start || 0) - Number(beforeCrop.start || 0)) > 0.0001
          || Math.abs(Number(afterCrop.in || 0) - Number(beforeCrop.in || 0)) > 0.0001
        )
      );
      cropSamples.push(elapsed);
      cropSyncRafSamples.push(readMetricTotal(perfMetrics, 'crop_sync_raf_ms'));
      cropSyncPositionsSamples.push(readMetricTotal(perfMetrics, 'crop_sync_positions_ms'));
      cropUpdateMaxTimeSamples.push(readMetricTotal(perfMetrics, 'crop_update_max_time_ms'));
      cropSyncRafCountSamples.push(readMetricCount(perfMetrics, 'crop_sync_raf_ms'));
      cropMutationFlags.push(cropMutated ? 1 : 0);
      pushProgress('crop:gesture:done', {
        iteration: index,
        elapsed_ms: elapsed,
        crop_mutated: cropMutated,
        before_crop: beforeCrop,
        after_crop: afterCrop
      });
      cropTotalSamples.push(Date.now() - iterationStartAt);
    }

    pushProgress('restore:start');
    const restored = await withTimeout('restore_synthetic', restoreSynthetic(page));
    const restoredReady = await waitFor(page, () => {
      const state = window.eveMtrackApi?.getState?.() || null;
      return Number(state?.clipCount || 0) <= 4;
    }, 12000, 120);
    if (!restoredReady) throw new Error('restore_wait_failed');
    pushProgress('restore:done', restored);
    report.ok = true;
    report.analysis.benchmark = {
      scenario: {
        track_count: SYNTH_TRACK_COUNT,
        clips_per_track: SYNTH_CLIPS_PER_TRACK,
        total_clips: SYNTH_TRACK_COUNT * SYNTH_CLIPS_PER_TRACK,
        iterations: 2
      },
      drag_mount: summarize(dragMountSamples),
      drag_clip: summarize(dragSamples),
      drag_total: summarize(dragTotalSamples),
      drag_sync_raf: summarize(dragSyncRafSamples),
      drag_sync_positions: summarize(dragSyncPositionsSamples),
      drag_update_max_time: summarize(dragUpdateMaxTimeSamples),
      drag_lane_apply: summarize(dragLaneApplySamples),
      drag_sync_raf_count: summarize(dragSyncRafCountSamples),
      crop_mount: summarize(cropMountSamples),
      crop_clip: summarize(cropSamples),
      crop_total: summarize(cropTotalSamples),
      crop_sync_raf: summarize(cropSyncRafSamples),
      crop_sync_positions: summarize(cropSyncPositionsSamples),
      crop_update_max_time: summarize(cropUpdateMaxTimeSamples),
      crop_sync_raf_count: summarize(cropSyncRafCountSamples),
      crop_mutated: summarize(cropMutationFlags),
      restored
    };
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
