import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'mtrack_color_tool_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    return {
      ...((fallback && typeof fallback === 'object') ? fallback : {}),
      __eval_error: String(error?.message || error || 'eval_failed')
    };
  }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 150) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch (_) {
      // boot settling
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    assertions: [],
    steps: {},
    console: []
  };

  const assert = (name, ok, details = null) => {
    report.assertions.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1040 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.console.push({
      type: msg.type(),
      text: msg.text()
    });
  });
  page.on('pageerror', (error) => {
    report.console.push({
      type: 'pageerror',
      text: String(error?.message || error || 'pageerror')
    });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1200);

    report.steps.login = await safeEval(page, async (creds) => {
      try {
        if (!window.AdoleAPI?.auth?.login) return { ok: false, error: 'login_api_missing' };
        const result = await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: String(error?.message || error || 'login_failed') };
      }
    }, { phone, password }, { ok: false, error: 'login_eval_failed' });

    await sleep(900);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2400);

    report.steps.runtime = await safeEval(page, async () => {
      await import('/application/eVe/intuition/tools/mtrack.js');
      window.__DEBUG__?.setDeterministicTestMode?.(true);
      return {
        has_debug: !!window.__DEBUG__,
        has_mtrack_api: !!window.eveMtrackApi
      };
    }, null, { ok: false, error: 'runtime_import_failed' });

    const runtimeReady = await waitFor(
      page,
      () => !!(window.__DEBUG__ && window.eveMtrackApi && window.atome?.tools?.v2Runtime),
      30000
    );
    assert('runtime_ready', runtimeReady, report.steps.runtime);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    report.steps.project = await safeEval(page, async () => {
      const api = window.AdoleAPI || null;
      if (!api?.projects?.list || !api?.projects?.setCurrent) return { ok: false, error: 'projects_api_missing' };
      const extractId = (value) => String(
        value?.id
        || value?.atome_id
        || value?.result?.id
        || value?.result?.atome_id
        || value?.data?.id
        || value?.data?.atome_id
        || value?.fastify?.data?.id
        || value?.fastify?.data?.atome_id
        || value?.tauri?.data?.id
        || value?.tauri?.data?.atome_id
        || ''
      ).trim();
      let listed = await api.projects.list();
      let projects = [
        ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
        ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
      ];
      let first = projects[0] || null;
      if (!first && typeof api.projects.create === 'function') {
        const probeName = `codex_color_tool_probe_${Date.now()}`;
        const created = await api.projects.create(probeName);
        const createdId = extractId(created);
        if (createdId) {
          first = {
            id: createdId,
            atome_id: createdId,
            properties: { name: probeName }
          };
        }
        listed = await api.projects.list();
        projects = [
          ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
          ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
        ];
        first = first || projects[0] || null;
      }
      const projectId = String(first?.id || first?.atome_id || '').trim();
      const props = first?.properties || first?.particles || first?.data || {};
      if (!projectId) return { ok: false, error: 'project_missing' };
      await api.projects.setCurrent(
        projectId,
        String(props?.name || 'project').trim() || 'project',
        first?.owner_id || props?.owner_id || null,
        true
      );
      try {
        await window.eveToolBase?.loadProjectAtomes?.(projectId);
      } catch (_) {}
      return { ok: true, project_id: projectId };
    }, null, { ok: false, error: 'project_eval_failed' });
    assert(
      'project_ready_or_skipped',
      report.steps.project?.ok === true || report.steps.project?.error === 'project_missing',
      report.steps.project
    );

    report.steps.target = await safeEval(page, async () => {
      const runtime = window.atome?.tools?.v2Runtime || null;
      const toId = (value) => String(value || '').trim();
      const existing = Array.from(document.querySelectorAll('[data-atome-id]')).find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const kind = String(node.dataset?.atomeKind || '').trim().toLowerCase();
        if (!kind || kind === 'group' || kind === 'mtrack' || kind === 'tool_shortcut') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
      });
      if (existing instanceof HTMLElement) {
        return { ok: true, atome_id: toId(existing.dataset.atomeId), source: 'existing' };
      }
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
      const created = await runtime.invokeById({
        tool_id: 'ui.circle',
        event: 'touch',
        action: 'pointer.click',
        input: { x: 360, y: 280, radius: 44, fill: '#ff6b3d' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'color_tool_probe' }
      });
      const atomeId = toId(
        created?.result?.result?.atome_id
        || created?.result?.atome_id
        || created?.atome_id
      );
      return atomeId ? { ok: true, atome_id: atomeId, source: 'created' } : { ok: false, error: 'target_missing' };
    }, null, { ok: false, error: 'target_eval_failed' });
    assert(
      'target_ready_or_skipped',
      report.steps.target?.ok === true || report.steps.target?.error === 'target_missing',
      report.steps.target
    );

    const atomeId = String(report.steps.target?.atome_id || '').trim();

    report.steps.open_mtrack = await safeEval(page, async (input) => {
      if (!input.atome_id) {
        if (typeof window.open_mtrack_panel === 'function') {
          window.open_mtrack_panel();
          return { ok: true, opened_without_target: true };
        }
        return { ok: false, error: 'mtrack_open_without_target_unavailable' };
      }
      const runtime = window.atome?.tools?.v2Runtime || null;
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
      await runtime.invokeById({
        tool_id: 'ui.select',
        event: 'touch',
        action: 'pointer.click',
        input: {
          atome_id: input.atome_id,
          target_id: input.atome_id,
          selection_ids: [input.atome_id]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'color_tool_probe' }
      });
      window.eveAtomeEditFooterApi?.publishSelection?.(input.atome_id);
      return runtime.invokeById({
        tool_id: 'ui.mtrax.open',
        event: 'touch',
        action: 'pointer.click',
        input: {
          action: 'open',
          toggle: false,
          footer_coupled: true,
          footer_anchor_atome_id: input.atome_id,
          target_id: input.atome_id,
          atome_id: input.atome_id,
          selection_ids: [input.atome_id]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'color_tool_probe' }
      });
    }, { atome_id: atomeId }, { ok: false, error: 'open_mtrack_failed' });

    const mtrackReady = await waitFor(
      page,
      () => !!document.getElementById('eve_mtrack_dialog'),
      15000
    );
    assert('mtrack_ready', mtrackReady, await safeEval(page, () => window.eveMtrackApi?.getState?.(), null, null));
    if (!mtrackReady) throw new Error('mtrack_not_ready');

    report.steps.load_timeline = await safeEval(page, async () => {
      if (!window.eveMtrackApi?.loadGroupTimeline) return { ok: false, error: 'load_timeline_api_missing' };
      const current = window.eveMtrackApi.getState?.() || {};
      return window.eveMtrackApi.loadGroupTimeline({
        group_id: current.activeGroupId || undefined,
        timeline: {
          type: 'timeline',
          schema: 'mtrax.timeline',
          version: 1,
          tracks: [
            { id: 't1', name: 'T1', record_source: 'audio' },
            { id: 't2', name: 'T2', record_source: 'audio' }
          ],
          clips: [
            {
              id: 'c1',
              track_id: 't1',
              kind: 'audio',
              name: 'Clip 1',
              start: 0,
              in: 0,
              out: 1,
              src: '/assets/audio/test.wav'
            },
            {
              id: 'c2',
              track_id: 't2',
              kind: 'audio',
              name: 'Clip 2',
              start: 1.2,
              in: 0,
              out: 2.2,
              src: '/assets/audio/test.wav'
            }
          ],
          ui: {
            px_per_sec: 220,
            track_height: 74,
            ruler_markers: [
              { id: 'mk_a', label: 'A', start: 0, end: 1 },
              { id: 'mk_b', label: 'B', start: 1, end: 2 }
            ],
            loop_cells: {
              visible: true,
              mode: 'auto',
              width: 340
            }
          }
        }
      });
    }, null, { ok: false, error: 'load_timeline_eval_failed' });
    assert('timeline_loaded', report.steps.load_timeline?.ok === true, report.steps.load_timeline);
    if (report.steps.load_timeline?.ok !== true) throw new Error('timeline_load_failed');

    const uiReady = await waitFor(
      page,
      () => (
        document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track-head').length >= 2
        && document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip').length >= 2
        && document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-loop-cells-cell').length >= 2
        && document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-zone-marker').length >= 2
      ),
      15000
    );
    assert('ui_ready', uiReady, await safeEval(page, () => ({
      state: window.eveMtrackApi?.getState?.() || null,
      track_heads: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track-head').length,
      clips: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip').length,
      cells: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-loop-cells-cell').length,
      markers: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-zone-marker').length
    }), null, null));
    if (!uiReady) throw new Error('ui_not_ready');

    const applyColor = async (rgba) => safeEval(page, async (color) => {
      const mod = await import('/application/eVe/intuition/tools/selection_style_apply.js');
      return mod.applyColorToSelection(color);
    }, rgba, { ok: false, error: 'apply_color_eval_failed' });

    await page.locator('#eve_mtrack_dialog .eve-mtrack-track-head').first().click({ force: true });
    await page.waitForTimeout(180);
    report.steps.track_color_apply = await applyColor('rgba(201, 48, 48, 0.92)');
    report.steps.track_color_state = await safeEval(page, async () => {
      const exported = await window.eveMtrackApi.exportTimeline?.();
      const track = Array.isArray(exported?.timeline?.tracks)
        ? exported.timeline.tracks.find((entry) => String(entry?.id || '').trim() === 't1')
        : null;
      const head = document.querySelector('#eve_mtrack_dialog .eve-mtrack-track-head');
      return {
        selection: window.eveMtrackApi?.getState?.() || null,
        track,
        head_background: head instanceof HTMLElement
          ? String(head.style.background || head.style.backgroundColor || '').trim()
          : null
      };
    }, null, null);
    assert(
      'track_color_applied',
      String(report.steps.track_color_state?.track?.header_color || '').trim() === 'rgba(201, 48, 48, 0.92)',
      report.steps.track_color_state
    );

    await page.locator('#eve_mtrack_dialog .eve-mtrack-clip').first().click({ force: true });
    await page.waitForTimeout(180);
    report.steps.clip_color_apply = await applyColor('rgba(31, 122, 67, 0.91)');
    report.steps.clip_color_state = await safeEval(page, async () => {
      const exported = await window.eveMtrackApi.exportTimeline?.();
      const clip = Array.isArray(exported?.timeline?.clips)
        ? exported.timeline.clips.find((entry) => String(entry?.id || '').trim() === 'c1')
        : null;
      const node = document.querySelector('#eve_mtrack_dialog .eve-mtrack-clip');
      return {
        selection: window.eveMtrackApi?.getState?.() || null,
        clip,
        clip_background: node instanceof HTMLElement
          ? String(node.style.background || node.style.backgroundColor || '').trim()
          : null
      };
    }, null, null);
    assert(
      'clip_color_applied',
      String(report.steps.clip_color_state?.clip?.color || '').trim() === 'rgba(31, 122, 67, 0.91)',
      report.steps.clip_color_state
    );

    await page.locator('#eve_mtrack_dialog .eve-mtrack-loop-cells-row').first().locator('.eve-mtrack-loop-cells-cell').first().click({ force: true });
    await page.waitForTimeout(180);
    report.steps.cell_color_apply = await applyColor('rgba(42, 84, 201, 0.9)');
    report.steps.cell_color_state = await safeEval(page, async () => {
      const exported = await window.eveMtrackApi.exportTimeline?.();
      const loopCells = exported?.timeline?.ui?.loop_cells || exported?.timeline?.ui?.loopCells || null;
      const cell = document.querySelector('#eve_mtrack_dialog .eve-mtrack-loop-cells-row .eve-mtrack-loop-cells-cell');
      return {
        selection: window.eveMtrackApi?.getState?.() || null,
        loop_cells: loopCells,
        cell_background: cell instanceof HTMLElement
          ? String(cell.style.background || cell.style.backgroundColor || '').trim()
          : null
      };
    }, null, null);
    const persistedCellColor = Array.isArray(report.steps.cell_color_state?.loop_cells?.cell_colors)
      ? report.steps.cell_color_state.loop_cells.cell_colors.find((entry) => String(entry?.key || '').trim() === 'lc_ref_mk_a::1')
      : null;
    assert(
      'cell_color_applied',
      String(persistedCellColor?.color || '').trim() === 'rgba(42, 84, 201, 0.9)',
      report.steps.cell_color_state
    );

    await page.locator('#eve_mtrack_dialog .eve-mtrack-loop-cells-header').first().click({ force: true });
    await page.waitForTimeout(180);
    report.steps.marker_color_apply = await applyColor('rgba(186, 118, 21, 0.93)');
    report.steps.marker_color_state = await safeEval(page, async () => {
      const exported = await window.eveMtrackApi.exportTimeline?.();
      const marker = Array.isArray(exported?.timeline?.ui?.ruler_markers)
        ? exported.timeline.ui.ruler_markers.find((entry) => String(entry?.id || '').trim() === 'mk_a')
        : null;
      const header = document.querySelector('#eve_mtrack_dialog .eve-mtrack-loop-cells-header');
      const zone = document.querySelector('#eve_mtrack_dialog .eve-mtrack-zone-marker');
      return {
        selection: window.eveMtrackApi?.getState?.() || null,
        marker,
        header_background: header instanceof HTMLElement
          ? String(header.style.background || header.style.backgroundColor || '').trim()
          : null,
        marker_background: zone instanceof HTMLElement
          ? String(zone.style.background || zone.style.backgroundColor || '').trim()
          : null
      };
    }, null, null);
    assert(
      'marker_color_applied',
      String(report.steps.marker_color_state?.marker?.color || '').trim() === 'rgba(186, 118, 21, 0.93)',
      report.steps.marker_color_state
    );

    report.ok = report.assertions.every((entry) => entry.ok);
  } catch (error) {
    report.error = String(error?.message || error || 'probe_failed');
  } finally {
    await browser.close();
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

run().catch((error) => {
  const payload = {
    ok: false,
    error: String(error?.message || error || 'probe_crashed')
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
