import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'record_cells_probe.json');

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
      // transient boot timing
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const extractClipSummary = (appState) => {
  const clips = Array.isArray(appState?.mtrack?.state?.clips) ? appState.mtrack.state.clips : [];
  return clips.map((clip) => ({
    id: String(clip?.id || '').trim(),
    trackId: String(clip?.trackId ?? clip?.track_id ?? '').trim(),
    start: Number(clip?.start || 0),
    out: Number(clip?.out || 0),
    in: Number(clip?.in || 0),
    kind: String(clip?.kind || '').trim(),
    src: String(clip?.src || '').trim()
  }));
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

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--mute-audio'
    ]
  });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1040 } });
  await context.grantPermissions(['microphone', 'camera'], { origin: url });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
    window.__RECORD_CELLS_PROBE__ = {
      logs: []
    };
  });
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
      await import('/application/eVe/intuition/tools/detail.js');
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
      const listed = await api.projects.list();
      let projects = [
        ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
        ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
      ];
      let first = projects[0] || null;
      if (!first && typeof api.projects.create === 'function') {
        const probeName = `codex_record_cells_probe_${Date.now()}`;
        const created = await api.projects.create(probeName);
        const createdId = extractId(created);
        if (createdId) {
          first = {
            id: createdId,
            atome_id: createdId,
            properties: { name: probeName }
          };
        }
        const relisted = await api.projects.list();
        projects = [
          ...(Array.isArray(relisted?.tauri?.projects) ? relisted.tauri.projects : []),
          ...(Array.isArray(relisted?.fastify?.projects) ? relisted.fastify.projects : [])
        ];
        first = projects.find((entry) => {
          const props = entry?.properties || entry?.particles || entry?.data || {};
          return String(props?.name || '').trim() === probeName;
        }) || first || projects[0] || null;
      }
      if (!first && typeof api.atomes?.create === 'function') {
        const probeName = `codex_record_cells_probe_${Date.now()}`;
        const created = await api.atomes.create({
          type: 'project',
          properties: {
            name: probeName
          }
        });
        const createdId = extractId(created);
        if (createdId) {
          first = {
            id: createdId,
            atome_id: createdId,
            properties: { name: probeName }
          };
        }
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
        source: { type: 'headless_probe', layer: 'record_cells_probe' }
      });
      const atomeId = toId(
        created?.result?.result?.atome_id
        || created?.result?.atome_id
        || created?.atome_id
      );
      return atomeId ? { ok: true, atome_id: atomeId, source: 'created' } : { ok: false, error: 'target_missing' };
    }, null, { ok: false, error: 'target_eval_failed' });
    assert('target_ready', report.steps.target?.ok === true, report.steps.target);
    if (report.steps.target?.ok !== true) throw new Error('target_not_ready');

    const atomeId = String(report.steps.target.atome_id || '').trim();

    report.steps.open_mtrack = await safeEval(page, async (input) => {
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
        source: { type: 'headless_probe', layer: 'record_cells_probe' }
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
        source: { type: 'headless_probe', layer: 'record_cells_probe' }
      });
    }, { atome_id: atomeId }, { ok: false, error: 'open_mtrack_failed' });

    const mtrackReady = await waitFor(
      page,
      () => !!window.eveMtrackApi?.getState?.()?.activeGroupId,
      15000
    );
    assert('mtrack_ready', mtrackReady, await safeEval(page, () => window.eveMtrackApi?.getState?.(), null, null));
    if (!mtrackReady) throw new Error('mtrack_not_ready');

    report.steps.load_timeline = await safeEval(page, async () => {
      if (!window.eveMtrackApi?.loadGroupTimeline) return { ok: false, error: 'load_timeline_api_missing' };
      const current = window.eveMtrackApi.getState?.() || {};
      const exported = await window.eveMtrackApi.exportTimeline?.();
      const timeline = exported?.timeline && typeof exported.timeline === 'object'
        ? structuredClone(exported.timeline)
        : null;
      if (!timeline) return { ok: false, error: 'timeline_export_missing' };
      timeline.tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
      timeline.clips = Array.isArray(timeline.clips)
        ? timeline.clips.filter((clip) => {
            const trackId = String(clip?.track_id ?? clip?.trackId ?? '').trim();
            const start = Number(clip?.start || 0);
            return !(trackId === 't1' && start < 2.1);
          })
        : [];
      if (timeline.tracks[0] && typeof timeline.tracks[0] === 'object') {
        timeline.tracks[0].record_source = 'audio';
        timeline.tracks[0].recordSource = 'audio';
      }
      timeline.ui = (timeline.ui && typeof timeline.ui === 'object') ? timeline.ui : {};
      timeline.ui.ruler_markers = [
        { id: 'mk_a', label: 'A', start: 0, end: 1 },
        { id: 'mk_b', label: 'B', start: 1, end: 2 }
      ];
      timeline.ui.loop_cells = {
        visible: true,
        mode: 'auto',
        width: 340
      };
      timeline.ui.pxPerSec = 220;
      timeline.ui.trackHeight = 74;
      return window.eveMtrackApi.loadGroupTimeline({
        group_id: current.activeGroupId || undefined,
        timeline
      });
    }, null, { ok: false, error: 'load_timeline_eval_failed' });
    assert('timeline_loaded', report.steps.load_timeline?.ok === true, report.steps.load_timeline);
    if (report.steps.load_timeline?.ok !== true) throw new Error('timeline_load_failed');

    const cellsReady = await waitFor(
      page,
      () => document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-loop-cells-row .eve-mtrack-loop-cells-cell').length >= 2,
      12000
    );
    assert('cells_ready', cellsReady, await safeEval(page, () => ({
      state: window.eveMtrackApi?.getState?.() || null,
      cell_count: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-loop-cells-row .eve-mtrack-loop-cells-cell').length
    }), null, null));
    if (!cellsReady) throw new Error('cells_not_ready');

    report.steps.arm_record = await safeEval(page, async () => {
      if (!window.eveMtrackApi?.setRecordAction) return { ok: false, error: 'record_action_api_missing' };
      return window.eveMtrackApi.setRecordAction({ active: true, mode: 'media' });
    }, null, { ok: false, error: 'arm_record_eval_failed' });
    assert('record_armed', report.steps.arm_record?.ok === true, report.steps.arm_record);
    if (report.steps.arm_record?.ok !== true) throw new Error('record_not_armed');

    const cellA = page.locator('#eve_mtrack_dialog .eve-mtrack-loop-cells-row').first().locator('.eve-mtrack-loop-cells-cell').nth(0);
    const cellB = page.locator('#eve_mtrack_dialog .eve-mtrack-loop-cells-row').first().locator('.eve-mtrack-loop-cells-cell').nth(1);
    await cellA.click({ force: true });
    await page.waitForTimeout(160);
    await cellB.click({ force: true });
    await page.waitForTimeout(220);

    report.steps.selection = await safeEval(page, () => window.eveMtrackApi?.getState?.() || null, null, null);
    const selectedLoopCellCount = Array.isArray(report.steps.selection?.selectedLoopCellKeys)
      ? report.steps.selection.selectedLoopCellKeys.length
      : 0;
    assert('two_cells_selected', selectedLoopCellCount === 2, report.steps.selection);
    if (selectedLoopCellCount !== 2) throw new Error('cell_selection_failed');

    report.steps.play_first = await safeEval(page, async () => {
      return window.eveMtrackApi?.play?.() || { ok: false, error: 'play_api_missing' };
    }, null, { ok: false, error: 'play_first_eval_failed' });
    assert('first_play_started', report.steps.play_first?.ok === true, report.steps.play_first);
    if (report.steps.play_first?.ok !== true) throw new Error('first_play_failed');

    await page.waitForTimeout(2550);
    await safeEval(page, async () => window.eveMtrackApi?.stop?.() || null, null, null);
    await page.waitForTimeout(600);

    report.steps.after_first = await safeEval(page, () => {
      const exported = window.eveMtrackApi?.exportTimeline?.() || null;
      const timeline = exported?.timeline && typeof exported.timeline === 'object' ? exported.timeline : null;
      return {
        timeline: window.eveMtrackApi?.getState?.() || null,
        clips: Array.isArray(timeline?.clips) ? timeline.clips : []
      };
    }, null, { ok: false, error: 'after_first_eval_failed' });
    const firstClips = extractClipSummary({ mtrack: { state: { clips: report.steps.after_first?.clips || [] } } })
      .filter((clip) => clip.trackId === 't1' && clip.start < 2.1)
      .sort((left, right) => left.start - right.start);
    assert('first_pass_created_two_clips', firstClips.length === 2, firstClips);
    assert(
      'first_pass_clip_positions',
      firstClips.length === 2 && Math.abs(firstClips[0].start - 0) < 0.15 && Math.abs(firstClips[1].start - 1) < 0.15,
      firstClips
    );
    if (firstClips.length !== 2) throw new Error('first_pass_record_missing');

    report.steps.play_second = await safeEval(page, async () => {
      return window.eveMtrackApi?.play?.() || { ok: false, error: 'play_api_missing' };
    }, null, { ok: false, error: 'play_second_eval_failed' });
    assert('second_play_started', report.steps.play_second?.ok === true, report.steps.play_second);
    if (report.steps.play_second?.ok !== true) throw new Error('second_play_failed');

    await page.waitForTimeout(2550);
    await safeEval(page, async () => window.eveMtrackApi?.stop?.() || null, null, null);
    await page.waitForTimeout(600);

    report.steps.after_second = await safeEval(page, () => {
      const exported = window.eveMtrackApi?.exportTimeline?.() || null;
      const timeline = exported?.timeline && typeof exported.timeline === 'object' ? exported.timeline : null;
      return {
        timeline: window.eveMtrackApi?.getState?.() || null,
        clips: Array.isArray(timeline?.clips) ? timeline.clips : []
      };
    }, null, { ok: false, error: 'after_second_eval_failed' });
    const secondClips = extractClipSummary({ mtrack: { state: { clips: report.steps.after_second?.clips || [] } } })
      .filter((clip) => clip.trackId === 't1' && clip.start < 2.1)
      .sort((left, right) => left.start - right.start);
    const sameClipIds = (
      firstClips.length === secondClips.length
      && firstClips.every((clip, index) => String(secondClips[index]?.id || '') === String(clip.id || ''))
    );
    assert('second_pass_did_not_rerecord', sameClipIds, {
      first: firstClips,
      second: secondClips
    });

    report.ok = report.assertions.every((entry) => entry.ok === true);
  } catch (error) {
    report.error = String(error?.message || error || 'probe_failed');
  } finally {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    await context.close();
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
};

run().catch((error) => {
  const fatal = {
    ok: false,
    error: String(error?.message || error || 'probe_fatal')
  };
  process.stdout.write(`${JSON.stringify(fatal, null, 2)}\n`);
  process.exit(1);
});
