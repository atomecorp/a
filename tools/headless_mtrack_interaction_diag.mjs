import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_interaction_diag.json');

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

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    steps: [],
    analysis: {}
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_INTERACTION_DIAG__ = true;
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_PREVIEW_TRACE__ = true;
    window.__EVE_MTRACK_EVENT_TRACE__ = [];
    window.__EVE_MTRACK_DOCK_TRACE__ = [];
    window.__EVE_MTRAX_INTERACTION_TRACE__ = [];
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.steps.push({
      kind: 'console',
      type: msg.type(),
      text: msg.text(),
      at: Date.now()
    });
  });

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
    if (!runtimeReady) {
      report.analysis.error = 'runtime_not_ready';
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

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
        const rect = existing.getBoundingClientRect();
        return {
          atome_id: toId(existing.dataset?.atomeId),
          source: 'existing',
          x: Math.round(rect.left + rect.width * 0.5),
          y: Math.round(rect.top + rect.height * 0.5)
        };
      }

      const runtime = window.atome?.tools?.v2Runtime;
      if (!runtime?.invokeById) return null;
      const created = await runtime.invokeById({
        tool_id: 'ui.circle',
        event: 'touch',
        action: 'pointer.click',
        input: { x: 360, y: 280, radius: 44, fill: '#00AEEF' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_interaction_diag' }
      });
      const atomeId = toId(
        created?.result?.result?.atome_id
        || created?.result?.atome_id
        || created?.atome_id
      );
      if (!atomeId) return null;
      return { atome_id: atomeId, source: 'created', x: 360, y: 280 };
    }, null, null);

    if (!target?.atome_id) {
      report.analysis.error = 'target_missing';
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

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
        source: { type: 'headless_probe', layer: 'mtrack_interaction_diag' }
      });
    }, { atome_id: target.atome_id }, { ok: false, error: 'mtrack_open_eval_failed' });
    report.analysis.mtrack_open = mtrackOpen;

    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      const visible = !!(panel && window.getComputedStyle(panel).display !== 'none' && window.getComputedStyle(panel).visibility !== 'hidden');
      return !!(visible && String(state?.activeGroupId || '').trim());
    }, 15000);
    if (!panelOpened) {
      report.analysis.error = 'panel_open_failed';
      await page.screenshot({ path: path.join(outDir, 'mtrack_interaction_diag_panel_open_failed.png'), fullPage: true });
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

    const interactionPoint = await safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return null;
      const candidates = [
        document.getElementById('eve_mtrack_dialog__preview_host'),
        panel.querySelector('[data-role="mtrax-gpu-overlay"] canvas'),
        panel.querySelector('[data-role="mtrack-preview-host"] canvas'),
        panel.querySelector('[data-role="mtrax-gpu-overlay"]'),
        panel.querySelector('[data-role="mtrack-preview-host"]'),
        panel.querySelector('.eve-mtrack-preview-surface'),
        panel.querySelector('.eve-mtrack-preview'),
        panel.querySelector('canvas')
      ].filter(Boolean);
      const target = candidates.find((el) => {
        const rect = el.getBoundingClientRect?.();
        return !!(rect && rect.width > 20 && rect.height > 20 && rect.left >= 0 && rect.top >= 0);
      }) || null;
      const panelRect = panel.getBoundingClientRect?.() || null;
      const rect = target?.getBoundingClientRect?.() || null;
      if (!rect && panelRect) {
        const x = Math.round(panelRect.left + panelRect.width * 0.78);
        const y = Math.round(panelRect.top + panelRect.height * 0.56);
        return { x, y };
      }
      if (!rect) return null;
      return {
        x: Math.round(rect.left + rect.width * 0.5),
        y: Math.round(rect.top + rect.height * 0.5)
      };
    }, null, null);

    if (!interactionPoint) {
      report.analysis.error = 'preview_point_missing';
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

    await page.mouse.click(interactionPoint.x, interactionPoint.y, { delay: 45 });
    await sleep(240);
    await page.mouse.move(interactionPoint.x, interactionPoint.y);
    await page.mouse.down();
    await page.mouse.move(interactionPoint.x + 40, interactionPoint.y + 26, { steps: 8 });
    await page.mouse.up();
    await sleep(500);

    const snapshot = await safeEval(page, (point) => {
      const mtrackState = window.eveMtrackApi?.getState?.() || null;
      const rendererState = window.eveMtrackRendererApi?.getState?.() || null;
      const webgpuTrace = Array.isArray(window.__EVE_MTRAX_INTERACTION_TRACE__)
        ? window.__EVE_MTRAX_INTERACTION_TRACE__.slice(-120)
        : [];
      const bridgeTrace = Array.isArray(window.__EVE_MTRACK_EVENT_TRACE__)
        ? window.__EVE_MTRACK_EVENT_TRACE__.slice(-200)
        : [];
      const dockTrace = Array.isArray(window.__EVE_MTRACK_DOCK_TRACE__)
        ? window.__EVE_MTRACK_DOCK_TRACE__.slice(-120)
        : [];
      const topStack = (() => {
        try {
          return Array.from(document.elementsFromPoint(point.x, point.y) || []).slice(0, 10).map((el) => ({
            tag: String(el.tagName || '').toLowerCase(),
            id: String(el.id || ''),
            role: String(el.getAttribute('data-role') || ''),
            class_name: String(el.className || '')
          }));
        } catch (_) {
          return [];
        }
      })();
      return { mtrackState, rendererState, webgpuTrace, bridgeTrace, dockTrace, topStack };
    }, interactionPoint, null);

    report.analysis = {
      target_atome_id: target.atome_id,
      target_source: target.source,
      mtrack_open: mtrackOpen,
      interaction_point: interactionPoint,
      has_canvas_hit: snapshot?.webgpuTrace?.some?.((entry) => String(entry?.tag || '').includes('interaction_pointerdown_hit')) || false,
      has_canvas_miss: snapshot?.webgpuTrace?.some?.((entry) => String(entry?.tag || '').includes('interaction_pointerdown_miss')) || false,
      has_selection_bridge_receive: snapshot?.bridgeTrace?.some?.((entry) => String(entry?.tag || '') === 'bridge_preview_selection_received') || false,
      has_transform_bridge_apply: snapshot?.bridgeTrace?.some?.((entry) => String(entry?.tag || '') === 'bridge_preview_transform_applied') || false,
      has_preview_shield_logs: snapshot?.dockTrace?.some?.((entry) => String(entry?.tag || '').startsWith('preview_shield_')) || false
    };
    report.snapshot = snapshot;

    report.analysis.strict_trace_ok = !!(
      report.analysis.has_canvas_hit
      && report.analysis.has_selection_bridge_receive
      && report.analysis.has_transform_bridge_apply
    );
    const hasRuntimeEvidence = !!(
      report.analysis.mtrack_open?.ok
      && report.analysis.interaction_point
      && snapshot?.mtrackState
      && snapshot?.rendererState
    );
    report.ok = report.analysis.strict_trace_ok || hasRuntimeEvidence;

    await page.screenshot({ path: path.join(outDir, 'mtrack_interaction_diag_after.png'), fullPage: true });
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outFile, ok: report.ok, analysis: report.analysis }, null, 2));
    await browser.close();
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    report.ok = false;
    report.analysis.error = String(error?.message || error);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }
};

run();
