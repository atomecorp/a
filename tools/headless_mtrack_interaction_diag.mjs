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

    const groupReady = await waitFor(page, () => {
      const groups = Array.from(document.querySelectorAll('[data-atome-kind="group"], [data-group-atome="true"]'));
      return groups.some((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 80 && rect.height > 80;
      });
    }, 25000);
    if (!groupReady) {
      report.analysis.error = 'no_group_found';
      await page.screenshot({ path: path.join(outDir, 'mtrack_interaction_diag_no_group.png'), fullPage: true });
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

    const target = await safeEval(page, () => {
      const groups = Array.from(document.querySelectorAll('[data-atome-kind="group"], [data-group-atome="true"]'));
      const host = groups.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 80 && rect.height > 80;
      }) || null;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      return {
        group_id: String(host.dataset?.atomeId || host.dataset?.groupId || ''),
        x: Math.round(rect.left + rect.width * 0.5),
        y: Math.round(rect.top + rect.height * 0.5)
      };
    }, null, null);

    if (!target?.group_id) {
      report.analysis.error = 'group_target_missing';
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

    await page.mouse.dblclick(target.x, target.y, { delay: 65 });
    await sleep(2600);

    const panelOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      return !!(panel && panel.style.display !== 'none' && String(state?.activeGroupId || '').trim());
    }, 12000);
    if (!panelOpened) {
      report.analysis.error = 'panel_open_failed';
      await page.screenshot({ path: path.join(outDir, 'mtrack_interaction_diag_panel_open_failed.png'), fullPage: true });
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
      return;
    }

    const interactionPoint = await safeEval(page, () => {
      const state = window.eveMtrackApi?.getState?.() || {};
      const groupId = String(state.activeGroupId || '').trim();
      const host = groupId
        ? document.querySelector(`[data-atome-id="${groupId}"]`) || document.querySelector(`[data-group-id="${groupId}"]`)
        : null;
      const overlay = host?.querySelector?.('[data-role="mtrax-gpu-overlay"]') || null;
      const canvas = overlay?.querySelector?.('canvas') || null;
      const fallbackRect = host?.getBoundingClientRect?.();
      const rect = canvas?.getBoundingClientRect?.() || overlay?.getBoundingClientRect?.() || fallbackRect || null;
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
      group_id: target.group_id,
      interaction_point: interactionPoint,
      has_canvas_hit: snapshot?.webgpuTrace?.some?.((entry) => String(entry?.tag || '').includes('interaction_pointerdown_hit')) || false,
      has_canvas_miss: snapshot?.webgpuTrace?.some?.((entry) => String(entry?.tag || '').includes('interaction_pointerdown_miss')) || false,
      has_selection_bridge_receive: snapshot?.bridgeTrace?.some?.((entry) => String(entry?.tag || '') === 'bridge_preview_selection_received') || false,
      has_transform_bridge_apply: snapshot?.bridgeTrace?.some?.((entry) => String(entry?.tag || '') === 'bridge_preview_transform_applied') || false,
      has_preview_shield_logs: snapshot?.dockTrace?.some?.((entry) => String(entry?.tag || '').startsWith('preview_shield_')) || false
    };
    report.snapshot = snapshot;

    report.ok = !!(
      report.analysis.has_canvas_hit
      && report.analysis.has_selection_bridge_receive
      && report.analysis.has_transform_bridge_apply
    );

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
