import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_transport_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const persist = (report) => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    return {
      ...(fallback && typeof fallback === 'object' ? fallback : {}),
      ok: false,
      error: String(error?.message || error || 'eval_failed')
    };
  }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 150) => {
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
      source: { type: 'headless_probe', layer: 'mtrack_transport_probe' }
    });
  }, target, { ok: false, error: 'mtrack_open_eval_failed' });
  return { ok: true, target, opened };
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    steps: {},
    samples: [],
    logs: []
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    report.logs.push({ type: 'pageerror', text: String(error?.message || error) });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1200);

    await safeEval(page, async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.login) return { ok: false, error: 'auth_api_missing' };
      try {
        await api.auth.login(creds.phone, creds.password, creds.phone);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error || 'auth_failed') };
      }
    }, { phone, password }, null);

    await sleep(900);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1600);

    const runtimeReady = await waitFor(
      page,
      () => !!(window.atome?.tools?.v2Runtime && window.__DEBUG__ && window.eveToolBase && window.Atome?.commit),
      25000
    );
    report.steps.runtime_ready = runtimeReady;
    if (!runtimeReady) throw new Error('runtime_not_ready');

    report.steps.open = await openMtrack(page);
    if (!report.steps.open?.ok) throw new Error(report.steps.open?.error || 'mtrack_open_failed');

    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
      return !!(visible && String(state?.activeGroupId || '').trim());
    }, 15000);
    report.steps.panel_opened = panelOpened;
    if (!panelOpened) throw new Error('panel_open_failed');

    report.steps.append = await safeEval(page, async (input) => {
      const state = window.eveMtrackApi?.getState?.() || null;
      if (!window.eveMtrackApi?.appendCaptureAtomes) {
        return { ok: false, error: 'append_api_missing', state };
      }
      if (Number(state?.clipCount || 0) > 0) {
        return { ok: true, skipped: true, state };
      }
      return window.eveMtrackApi.appendCaptureAtomes({
        atome_ids: [input.atome_id]
      });
    }, { atome_id: report.steps.open.target.atome_id }, { ok: false, error: 'append_eval_failed' });

    const clipReady = await waitFor(page, () => {
      const state = window.eveMtrackApi?.getState?.() || null;
      return Number(state?.clipCount || 0) > 0;
    }, 12000);
    report.steps.clip_ready = clipReady;
    if (!clipReady) throw new Error('clip_not_ready');

    report.steps.before_play = await safeEval(page, () => {
      const state = window.eveMtrackApi?.getState?.() || null;
      return state
        ? {
            ok: true,
            playhead: Number(state.playhead || 0),
            playing: state.isPlaying === true || state.playing === true,
            clipCount: Array.isArray(state.clips) ? state.clips.length : 0,
            maxTime: Number(state.maxTime || 0),
            audioEngine: state.audioEngine || null
          }
        : { ok: false, error: 'state_missing' };
    }, null, { ok: false, error: 'before_play_state_failed' });

    report.steps.play = await safeEval(page, async () => {
      if (!window.eveMtrackApi?.play) return { ok: false, error: 'play_api_missing' };
      return window.eveMtrackApi.play();
    }, null, { ok: false, error: 'play_eval_failed' });

    for (let index = 0; index < 10; index += 1) {
      await sleep(120);
      const sample = await safeEval(page, () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        return state
          ? {
              playhead: Number(state.playhead || 0),
              playing: state.isPlaying === true || state.playing === true,
              maxTime: Number(state.maxTime || 0),
              clipLoopMode: state.clipLoopMode === true,
              clipCount: Array.isArray(state.clips) ? state.clips.length : 0,
              lastPlaybackFrameReason: String(state.lastPlaybackFrameReason || ''),
              audioEngine: state.audioEngine || null
            }
          : null;
      }, null, null);
      report.samples.push(sample);
    }

    report.steps.after_play = await safeEval(page, () => {
      const state = window.eveMtrackApi?.getState?.() || null;
      return state
        ? {
            ok: true,
            playhead: Number(state.playhead || 0),
            playing: state.isPlaying === true || state.playing === true,
            maxTime: Number(state.maxTime || 0),
            lastPlaybackFrameReason: String(state.lastPlaybackFrameReason || ''),
            audioEngine: state.audioEngine || null
          }
        : { ok: false, error: 'state_missing' };
    }, null, { ok: false, error: 'after_play_state_failed' });

    await safeEval(page, async () => window.eveMtrackApi?.stop?.() || null, null, null);

    report.ok = report.samples.some((entry) => Number(entry?.playhead || 0) > 0.01);
    persist(report);
    process.stdout.write(`${JSON.stringify({ outFile, ok: report.ok, steps: report.steps, samples: report.samples }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    fatal: String(error?.message || error),
    stack: error?.stack || null
  };
  persist(report);
  process.stdout.write(`${JSON.stringify({ outFile, ok: false, fatal: report.fatal }, null, 2)}\n`);
  process.exit(1);
});
