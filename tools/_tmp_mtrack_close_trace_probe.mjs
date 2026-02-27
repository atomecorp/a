import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_close_trace_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try { return await page.evaluate(fn, arg); } catch (_) { return fallback; }
};

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 140) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    const ok = await safeEval(page, predicate, null, false);
    if (ok) return true;
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    steps: [],
    states: {},
    traces: {}
  };
  const push = (name, ok, details = null) => {
    report.steps.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 980 } });
  await context.addInitScript(() => {
    window.__EVE_MTRAX_BRIDGE_LOGS__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRAX_TRACE__ = [];
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(900);

    await safeEval(page, async (creds) => {
      try {
        if (window.AdoleAPI?.auth?.login) {
          await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
        }
      } catch (_) {}
    }, { phone, password }, null);
    await sleep(800);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1300);

    const runtimeReady = await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 20000);
    push('runtime_ready', runtimeReady);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    const ensureTarget = await safeEval(page, async () => {
      const toId = (v) => String(v || '').trim();
      const all = Array.from(document.querySelectorAll('[data-atome-id]'));
      const host = all.find((el) => {
        const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
        if (!kind || kind === 'tool_shortcut' || kind === 'group' || kind === 'mtrack') return false;
        const r = el.getBoundingClientRect();
        return r.width > 30 && r.height > 30 && r.bottom > 0 && r.right > 0;
      }) || null;
      if (host) {
        const rect = host.getBoundingClientRect();
        return {
          atome_id: toId(host.dataset?.atomeId || ''),
          kind: String(host.dataset?.atomeKind || '').trim().toLowerCase(),
          center: { x: Math.round(rect.left + rect.width * 0.5), y: Math.round(rect.top + rect.height * 0.5) }
        };
      }
      let synthetic = document.getElementById('__headless_probe_close_trace_video');
      if (!(synthetic instanceof Element)) {
        synthetic = document.createElement('div');
        synthetic.id = '__headless_probe_close_trace_video';
        synthetic.style.position = 'fixed';
        synthetic.style.left = '200px';
        synthetic.style.top = '220px';
        synthetic.style.width = '220px';
        synthetic.style.height = '120px';
        synthetic.style.zIndex = '9999';
        synthetic.style.borderRadius = '8px';
        synthetic.style.background = 'linear-gradient(135deg, #30465c, #283544)';
        synthetic.style.border = '1px solid rgba(255,255,255,0.28)';
        synthetic.style.pointerEvents = 'auto';
        document.body.appendChild(synthetic);
      }
      const sid = toId(synthetic.dataset?.atomeId || `headless_probe_close_trace_${Date.now()}`);
      synthetic.dataset.atomeId = sid;
      synthetic.dataset.atomeKind = 'video';
      synthetic.dataset.kind = 'video';
      const rect = synthetic.getBoundingClientRect();
      return {
        atome_id: sid,
        kind: 'video',
        synthetic: true,
        center: { x: Math.round(rect.left + rect.width * 0.5), y: Math.round(rect.top + rect.height * 0.5) }
      };
    }, null, null);
    push('target_found', !!ensureTarget?.atome_id, ensureTarget);
    if (!ensureTarget?.atome_id) throw new Error('target_not_found');

    const openFooter = await safeEval(page, (input) => {
      const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
      if (!(host instanceof Element)) return false;
      const rect = host.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width * 0.5);
      const y = Math.round(rect.top + rect.height * 0.5);
      host.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      return true;
    }, { atome_id: ensureTarget.atome_id }, false);
    push('footer_dblclick_dispatched', openFooter);

    const footerOpen = await waitFor(page, () => {
      const root = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      return !!(root && root.dataset?.open === 'true');
    }, 9000);
    push('footer_open_probe', true, { opened: footerOpen });

    const invokeMtrack = await safeEval(page, async (input) => {
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
          footer_anchor_atome_id: input.atome_id,
          footerAnchorAtomeId: input.atome_id,
          footer_coupled: true,
          selection_ids: [input.atome_id]
        },
        presentation: 'ui',
        source: { type: 'ui', layer: 'headless_trace_probe' }
      });
    }, { atome_id: ensureTarget.atome_id }, { ok: false, error: 'eval_failed' });
    push('invoke_mtrack_open', !!invokeMtrack?.ok, invokeMtrack);

    const mtrackOpen = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      if (!(panel && footer)) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && footer.dataset?.open === 'true' && footer.dataset?.mtrackOpen === 'true';
    }, 12000);
    push('mtrack_open', mtrackOpen);
    if (!mtrackOpen) throw new Error('mtrack_not_open');

    const ensureClip = await safeEval(page, async () => {
      const api = window.eveMtrackApi;
      const hasExistingClip = !!document.querySelector('#eve_mtrack_dialog .eve-mtrack-clip');
      if (!api?.createClipFromSelection) {
        return hasExistingClip
          ? { ok: true, reused_existing_clip: true }
          : { ok: false, error: 'create_clip_api_missing' };
      }
      const state = api.getState?.() || {};
      if (!String(state.activeGroupId || '').trim()) return { ok: false, error: 'active_group_missing' };
      try {
        const created = await api.createClipFromSelection({
          kind: 'shape',
          name: 'probe_clip',
          start_seconds: 0,
          duration_seconds: 2.5,
          track_id: 1
        });
        return { ok: true, created };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }, null, { ok: false, error: 'eval_failed' });
    push('ensure_clip', !!ensureClip?.ok, ensureClip);

    await sleep(500);

    const points = await safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const clip = panel?.querySelector('.eve-mtrack-clip');
      const lane2 = panel?.querySelector('.eve-mtrack-lane[data-track-id="2"]') || panel?.querySelectorAll('.eve-mtrack-lane')?.[1] || null;
      const hZoom = document.querySelector('#eve_atome_editor [data-footer-tool-key="mtrack_hzoom"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_hzoom"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_hzoom"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_hzoom"] input[type="range"]');
      const vZoom = document.querySelector('#eve_atome_editor [data-footer-tool-key="mtrack_vzoom"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_vzoom"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_vzoom"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_vzoom"] input[type="range"]');
      const snap = document.querySelector('#eve_atome_editor [data-footer-tool-key="mtrack_snap"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_snap"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_snap"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_snap"]');
      const tempo = document.querySelector('#eve_atome_editor [data-footer-tool-key="mtrack_tempo"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_tempo"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_tempo"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_tempo"] input[type="range"]');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      const mtrackState = window.eveMtrackApi?.getState?.() || {};
      const panelRect = panel?.getBoundingClientRect?.() || null;
      const pt = (el, rx = 0.5, ry = 0.5) => {
        if (!(el instanceof Element)) return null;
        const r = el.getBoundingClientRect();
        if (!(r.width > 2 && r.height > 2)) return null;
        return { x: Math.round(r.left + r.width * rx), y: Math.round(r.top + r.height * ry) };
      };
      const clipPt = pt(clip, 0.4, 0.5);
      const lane2Pt = pt(lane2, 0.55, 0.5);
      return {
        clip_pt: clipPt,
        lane2_pt: lane2Pt,
        has_hzoom: !!hZoom,
        has_vzoom: !!vZoom,
        has_snap: !!snap,
        has_tempo: !!tempo,
        mtrack_open: !!panel && window.getComputedStyle(panel).display !== 'none',
        footer_open: footer?.dataset?.open === 'true',
        footer_mtrack_open: footer?.dataset?.mtrackOpen === 'true',
        active_group_id: String(mtrackState.activeGroupId || ''),
        panel_left: panelRect ? Math.round(Number(panelRect.left || 0)) : null,
        panel_parent_role: String(panel?.parentElement?.dataset?.role || ''),
        panel_embedded: panel?.dataset?.eveMtrackEmbeddedInFooter === 'true'
      };
    }, null, null);
    report.states.before_interactions = points;

    if (points?.clip_pt && points?.lane2_pt) {
      await page.mouse.move(points.clip_pt.x, points.clip_pt.y);
      await page.mouse.down();
      await page.mouse.move(points.lane2_pt.x, points.lane2_pt.y, { steps: 10 });
      await page.mouse.up();
      await sleep(500);
      push('clip_drag_executed', true, { from: points.clip_pt, to: points.lane2_pt });
    } else {
      push('clip_drag_executed', false, points);
    }

    const afterDrag = await safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      const cs = panel ? window.getComputedStyle(panel) : null;
      const open = !!(panel && cs && cs.display !== 'none' && cs.visibility !== 'hidden');
      const state = window.eveMtrackApi?.getState?.() || {};
      const panelRect = panel?.getBoundingClientRect?.() || null;
      return {
        mtrack_open: open,
        footer_open: footer?.dataset?.open === 'true',
        footer_mtrack_open: footer?.dataset?.mtrackOpen === 'true',
        active_group_id: String(state.activeGroupId || ''),
        panel_left: panelRect ? Math.round(Number(panelRect.left || 0)) : null,
        panel_parent_role: String(panel?.parentElement?.dataset?.role || ''),
        panel_embedded: panel?.dataset?.eveMtrackEmbeddedInFooter === 'true'
      };
    }, null, null);
    report.states.after_drag = afterDrag;
    push('after_drag_mtrack_open', !!afterDrag?.mtrack_open, afterDrag);
    push('after_drag_footer_open', !!(afterDrag?.footer_open && afterDrag?.footer_mtrack_open), afterDrag);

    await safeEval(page, () => {
      const setSlider = (selector, nextValue) => {
        const input = document.querySelector(selector);
        if (!(input instanceof HTMLInputElement)) return false;
        input.value = String(nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      setSlider('#eve_atome_editor [data-footer-tool-key="mtrack_hzoom"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_hzoom"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_hzoom"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_hzoom"] input[type="range"]', 130);
      setSlider('#eve_atome_editor [data-footer-tool-key="mtrack_vzoom"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_vzoom"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_vzoom"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_vzoom"] input[type="range"]', 46);
      setSlider('#eve_atome_editor [data-footer-tool-key="mtrack_tempo"] input[type="range"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_tempo"] input[type="range"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_tempo"] input[type="range"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_tempo"] input[type="range"]', 142);
      const snapBtn = document.querySelector('#eve_atome_editor [data-footer-tool-key="mtrack_snap"], #eve_atome_edit_footer [data-footer-tool-key="mtrack_snap"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack_snap"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack_snap"]');
      if (snapBtn instanceof Element) {
        const rect = snapBtn.getBoundingClientRect();
        const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width * 0.5));
        const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height * 0.5));
        snapBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 122, button: 0, clientX: x, clientY: y }));
        snapBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 122, button: 0, clientX: x, clientY: y }));
        snapBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }
      return true;
    }, null, false);

    await sleep(650);

    const afterControls = await safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      const cs = panel ? window.getComputedStyle(panel) : null;
      const panelRect = panel?.getBoundingClientRect?.() || null;
      return {
        mtrack_open: !!(panel && cs && cs.display !== 'none' && cs.visibility !== 'hidden'),
        footer_open: footer?.dataset?.open === 'true',
        footer_mtrack_open: footer?.dataset?.mtrackOpen === 'true',
        panel_left: panelRect ? Math.round(Number(panelRect.left || 0)) : null,
        panel_parent_role: String(panel?.parentElement?.dataset?.role || ''),
        panel_embedded: panel?.dataset?.eveMtrackEmbeddedInFooter === 'true'
      };
    }, null, null);
    report.states.after_controls = afterControls;
    push('after_controls_mtrack_open', !!afterControls?.mtrack_open, afterControls);
    push('after_controls_footer_open', !!(afterControls?.footer_open && afterControls?.footer_mtrack_open), afterControls);
    const leftValues = [points?.panel_left, afterDrag?.panel_left, afterControls?.panel_left]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const leftDrift = leftValues.length
      ? (Math.max(...leftValues) - Math.min(...leftValues))
      : Number.POSITIVE_INFINITY;
    push('panel_embedded_in_footer_after_interactions', !!(afterControls?.panel_embedded && afterControls?.panel_parent_role === 'mtrack-host'), {
      before: {
        parent_role: points?.panel_parent_role || null,
        embedded: points?.panel_embedded === true
      },
      after: {
        parent_role: afterControls?.panel_parent_role || null,
        embedded: afterControls?.panel_embedded === true
      }
    });
    push('panel_left_drift_bounded_after_interactions', leftDrift <= 220, { left_values: leftValues, drift_px: leftDrift });

    const explicitCloseClicked = await safeEval(page, () => {
      const closeBtn = document.getElementById('eve_mtrack_dialog__close')
        || document.querySelector('[data-role="eve-mtrack-dock-close-button"]');
      if (!(closeBtn instanceof Element)) return false;
      const rect = closeBtn.getBoundingClientRect();
      const x = rect.left + Math.max(3, Math.min(rect.width - 3, rect.width * 0.5));
      const y = rect.top + Math.max(3, Math.min(rect.height - 3, rect.height * 0.5));
      closeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 199, button: 0, clientX: x, clientY: y }));
      closeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 199, button: 0, clientX: x, clientY: y }));
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      return true;
    }, null, false);
    push('explicit_close_button_clicked', explicitCloseClicked);
    await sleep(500);
    const closedState = await safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      const cs = panel ? window.getComputedStyle(panel) : null;
      return {
        panel_visible: !!(panel && cs && cs.display !== 'none' && cs.visibility !== 'hidden'),
        footer_open: footer?.dataset?.open === 'true',
        footer_mtrack_open: footer?.dataset?.mtrackOpen === 'true'
      };
    }, null, null);
    report.states.after_explicit_close = closedState;
    push('explicit_close_hides_mtrack_panel', closedState?.panel_visible === false, closedState);
    push('explicit_close_collapses_coupled_footer', !!closedState && (closedState.footer_open === false || closedState.footer_mtrack_open === false), closedState);

    const trace = await safeEval(page, () => {
      const list = Array.isArray(window.__EVE_MTRAX_TRACE__) ? window.__EVE_MTRAX_TRACE__ : [];
      return list.slice(-250);
    }, null, []);
    report.traces.tail = trace;

    report.ok = report.steps.every((s) => s.ok === true);
  } catch (error) {
    push('runner_no_error', false, String(error?.message || error));
    report.error = String(error?.stack || error?.message || error);
    report.ok = false;
  } finally {
    await browser.close();
  }

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, ok: report.ok, steps: report.steps, states: report.states }, null, 2));
  process.exit(report.ok ? 0 : 1);
};

run().catch((error) => {
  fs.writeFileSync(outFile, JSON.stringify({ ok: false, error: String(error?.stack || error) }, null, 2));
  console.error(String(error?.message || error));
  process.exit(1);
});
