import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'project_record_play_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (_) {
    return fallback;
  }
};

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 120) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch (_) {
      // ignore transient state during boot
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    ok: false,
    logs: [],
    assertions: [],
    context: {}
  };

  const assert = (name, ok, details = null) => {
    report.assertions.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.logs.push({
      type: msg.type(),
      text: msg.text()
    });
  });
  page.on('pageerror', (err) => {
    report.logs.push({
      type: 'pageerror',
      text: String(err?.message || err)
    });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1000);

    await safeEval(page, async (creds) => {
      try {
        if (window.AdoleAPI?.auth?.login) {
          await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
          return { ok: true };
        }
      } catch (_) {
        return { ok: false };
      }
      return { ok: false };
    }, { phone, password }, { ok: false });

    await sleep(500);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2500);

    const runtimeReady = await waitFor(
      page,
      () => !!(window.__DEBUG__ && window.Atome?.commit && window.eveToolBase),
      25000
    );
    assert('runtime_ready', runtimeReady);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    const created = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      const result = await mod.invokeToolGateway({
        tool_id: 'ui.circle',
        action: 'pointer.click',
        input: { x: 360, y: 320, radius: 46, fill: '#ff6b3d' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_record_only' }
      });
      const atomeId = String(
        result?.result?.result?.atome_id
        || result?.result?.atome_id
        || result?.atome_id
        || result?.id
        || ''
      ).trim();
      if (!atomeId) return { ok: false, error: 'atome_id_missing', result };
      const host = document.querySelector(`[data-atome-id="${atomeId}"]`);
      if (host instanceof HTMLElement) {
        host.style.left = '360px';
        host.style.top = '320px';
      }
      return { ok: true, atome_id: atomeId };
    }, null, { ok: false, error: 'create_failed' });
    report.context.created = created;
    assert('shape_created', created?.ok === true, created);
    if (!created?.ok) throw new Error('shape_create_failed');

    const atomeId = String(created.atome_id);

    const footerOpened = await safeEval(page, async (id) => {
      return window.__DEBUG__?.openAtomeFooter?.(id);
    }, atomeId, null);
    report.context.footer_opened = footerOpened;
    await sleep(250);

    const recordOn = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: true, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_record_only' }
      });
    }, null, null);
    report.context.record_on = recordOn;
    assert('record_on', !!recordOn, recordOn);
    await sleep(160);

    const moved = await safeEval(page, async (id) => {
      const host = document.querySelector(`[data-atome-id="${id}"]`);
      if (!(host instanceof HTMLElement)) return { ok: false, error: 'host_missing' };
      const commitPatch = async (kind, patch) => {
        Object.entries(patch).forEach(([key, value]) => {
          host.style[key] = String(value);
        });
        return window.Atome.commit({
          kind,
          atome_id: id,
          payload: { props: patch }
        }, {
          refreshState: true,
          realtimeBroadcast: true
        });
      };
      await commitPatch('gesture_start', { left: '360px', top: '320px', width: '160px', opacity: 1 });
      await new Promise((resolve) => setTimeout(resolve, 140));
      await commitPatch('gesture_frame', { left: '460px', top: '386px', width: '210px', opacity: 0.72 });
      await new Promise((resolve) => setTimeout(resolve, 180));
      await commitPatch('gesture_end', { left: '530px', top: '420px', width: '236px', opacity: 0.55 });
      return {
        ok: true,
        left: host.style.left,
        top: host.style.top,
        width: host.style.width,
        opacity: host.style.opacity
      };
    }, atomeId, null);
    report.context.moved = moved;
    assert('gesture_committed', moved?.ok === true, moved);

    const recordOff = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: false, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_record_only' }
      });
    }, null, null);
    report.context.record_off = recordOff;
    await sleep(500);

    const stateAfterRecord = await safeEval(page, async (id) => {
      const stateRecord = await window.Atome?.getStateCurrent?.(id);
      const props = stateRecord?.properties || stateRecord?.particles || {};
      const footer = window.__DEBUG__?.getFooterState?.() || null;
      return {
        has_mtrack_api: !!window.eveMtrackApi,
        has_project_timeline: !!props?.project_timeline,
        project_timeline_duration: Number(props?.project_timeline?.duration || 0),
        project_timeline_rev: props?.project_timeline_rev ?? null,
        footer,
        hostProjectTimeline: document.querySelector(`[data-atome-id="${id}"]`)?.dataset?.projectTimeline || null
      };
    }, atomeId, null);
    report.context.after_record = stateAfterRecord;
    assert('timeline_persisted', stateAfterRecord?.has_project_timeline === true, stateAfterRecord);

    const footerHasPlay = await safeEval(page, () => {
      return !!document.querySelector('.eve-atome-edit-footer-tool[data-footer-tool-key="play"]');
    }, null, false);
    report.context.footer_has_play = footerHasPlay;
    assert('footer_has_play', footerHasPlay === true, stateAfterRecord);

    report.ok = report.assertions.every((entry) => entry.ok);
  } catch (error) {
    report.error = String(error?.message || error);
  } finally {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (!report.ok) process.exitCode = 1;
};

run().catch((error) => {
  fs.writeFileSync(outFile, JSON.stringify({
    created_at: new Date().toISOString(),
    ok: false,
    fatal: String(error?.message || error)
  }, null, 2));
  process.exitCode = 1;
});
