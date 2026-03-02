import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_footer_workflow_probe.json');
const shotFile = path.join(outDir, 'mtrack_project_playback_probe.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 120) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch (_) {
      // ignore transient eval errors during boot
    }
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
    assertions: [],
    context: {}
  };
  const assert = (name, ok, details = null) => {
    report.assertions.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1640, height: 980 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    report.assertions.push({
      name: 'pageerror',
      ok: false,
      details: String(err?.message || err)
    });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1000);

    report.context.auth_attempt = await safeEval(page, async (creds) => {
      try {
        if (window.AdoleAPI?.auth?.login) {
          await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
          return { ok: true, route: 'api_login' };
        }
      } catch (error) {
        return { ok: false, route: 'api_login', error: String(error?.message || error) };
      }
      return { ok: false, route: 'api_login_missing' };
    }, { phone, password }, { ok: false, route: 'eval_failed' });

    await sleep(700);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(3200);
    await safeEval(page, async () => {
      await import('/application/eVe/intuition/tools/mtrack.js');
      await import('/application/eVe/intuition/tools/detail.js');
      return true;
    }, null, false);
    await sleep(300);

    report.context.runtime_probe = await safeEval(page, () => ({
      has_debug: !!window.__DEBUG__,
      has_mtrack_api: !!window.eveMtrackApi,
      has_tool_base: !!window.eveToolBase,
      has_atome_commit: !!window.Atome?.commit,
      ready_state: String(document.readyState || '')
    }), null, null);

    const runtimeReady = await waitFor(
      page,
      () => !!(window.eveMtrackApi && window.__DEBUG__ && window.eveToolBase && window.Atome?.commit),
      30000
    );
    assert('runtime_ready', runtimeReady, report.context.runtime_probe);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    report.context.project = await safeEval(page, async () => {
      const api = window.AdoleAPI || null;
      if (!api?.projects?.list || !api?.projects?.setCurrent) return { ok: false, error: 'projects_api_missing' };
      const listed = await api.projects.list();
      const projects = [
        ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
        ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
      ];
      const first = projects[0] || null;
      const props = first?.properties || first?.particles || first?.data || {};
      const projectId = String(first?.id || first?.atome_id || '').trim();
      if (!projectId) return { ok: false, error: 'project_missing' };
      await api.projects.setCurrent(
        projectId,
        String(props?.name || 'project').trim() || 'project',
        first?.owner_id || props?.owner_id || null,
        true
      );
      try {
        await window.eveToolBase?.loadProjectAtomes?.(projectId);
      } catch (_) {
        // ignore hydration lag
      }
      return { ok: true, project_id: projectId };
    }, null, { ok: false, error: 'project_eval_failed' });
    assert(
      'project_ready',
      report.context.project?.ok === true || report.context.project?.error === 'project_missing',
      report.context.project
    );

    const created = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      const result = await mod.invokeToolGateway({
        tool_id: 'ui.circle',
        action: 'pointer.click',
        input: { x: 340, y: 280, radius: 44, fill: '#ff6b3d' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
      const readId = (value) => String(value || '').trim();
      const atomeId = readId(
        result?.result?.result?.atome_id
        || result?.result?.atome_id
        || result?.result?.id
        || result?.atome_id
        || result?.id
      );
      if (!atomeId) {
        return { ok: false, error: 'atome_id_missing', result };
      }
      const host = document.querySelector(`[data-atome-id="${atomeId}"]`);
      if (host instanceof HTMLElement) {
        host.style.left = '340px';
        host.style.top = '280px';
      }
      return { ok: true, atome_id: atomeId };
    }, null, { ok: false, error: 'create_failed' });
    report.context.created = created;
    assert('project_atome_created', created?.ok === true, created);
    if (!created?.ok || !created?.atome_id) throw new Error('project_atome_missing');

    const atomeId = String(created.atome_id);

    const mtrackOpened = await safeEval(page, async (input) => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.mtrax.open',
        action: 'pointer.click',
        input: {
          action: 'open',
          atome_id: input.atome_id,
          selection_ids: [input.atome_id],
          footer_coupled: false
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
    }, { atome_id: atomeId }, { ok: false, error: 'mtrack_open_eval_failed' });
    report.context.mtrack_open = mtrackOpened;
    assert('mtrack_open_invoked', !!mtrackOpened, mtrackOpened);

    const mtrackReady = await waitFor(
      page,
      () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        return !!(state?.activeGroupId);
      },
      12000
    );
    assert('mtrack_group_ready', mtrackReady, await safeEval(page, () => window.eveMtrackApi?.getState?.(), null, null));
    if (!mtrackReady) throw new Error('mtrack_group_not_ready');

    const appendResult = await safeEval(page, async (input) => {
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
    }, { atome_id: atomeId }, { ok: false, error: 'append_eval_failed' });
    report.context.append = appendResult;
    assert('clip_present_or_appended', appendResult?.ok === true, appendResult);

    const clipReady = await waitFor(
      page,
      () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        return Number(state?.clipCount || 0) > 0;
      },
      12000
    );
    assert('clip_ready', clipReady, await safeEval(page, () => window.eveMtrackApi?.getState?.(), null, null));
    if (!clipReady) throw new Error('clip_not_ready');

    report.context.before_record = await safeEval(page, (input) => {
      const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
      const debugState = window.__DEBUG__?.getAppState?.() || null;
      return {
        left: host instanceof HTMLElement ? host.style.left : null,
        top: host instanceof HTMLElement ? host.style.top : null,
        debug: debugState
      };
    }, { atome_id: atomeId }, null);

    const armed = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: true, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
    }, null, { ok: false, error: 'record_arm_failed' });
    report.context.record_arm = armed;
    assert(
      'record_live_armed',
      !!(
        armed?.result?.result?.active
        || armed?.result?.result?.latched
        || armed?.result?.active
        || armed?.result?.latched
        || armed?.active
        || armed?.latched
      ),
      armed
    );

    await sleep(180);

    const recordSequence = await safeEval(page, async (input) => {
      const readPos = () => {
        const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
        if (!(host instanceof HTMLElement)) return null;
        return {
          left: Number.parseFloat(host.style.left || '0') || 0,
          top: Number.parseFloat(host.style.top || '0') || 0
        };
      };
      const pos0 = readPos();
      if (!pos0) return { ok: false, error: 'host_missing' };
      const commit = async (kind, left, top) => {
        const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
        if (host instanceof HTMLElement) {
          host.style.left = `${left}px`;
          host.style.top = `${top}px`;
        }
        return window.Atome.commit({
          kind,
          atome_id: input.atome_id,
          payload: {
            props: {
              left: `${left}px`,
              top: `${top}px`
            }
          }
        }, {
          refreshState: true,
          realtimeBroadcast: true
        });
      };
      const commitPatch = async (kind, patch) => {
        const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
        if (host instanceof HTMLElement) {
          Object.entries(patch || {}).forEach(([key, value]) => {
            if (value == null) return;
            host.style[key] = String(value);
          });
        }
        return window.Atome.commit({
          kind,
          atome_id: input.atome_id,
          payload: {
            props: patch
          }
        }, {
          refreshState: true,
          realtimeBroadcast: true
        });
      };
      await commitPatch('gesture_start', {
        left: `${pos0.left}px`,
        top: `${pos0.top}px`,
        width: '160px',
        opacity: 1
      });
      await new Promise((resolve) => setTimeout(resolve, 180));
      await commitPatch('gesture_frame', {
        left: `${pos0.left + 80}px`,
        top: `${pos0.top + 48}px`,
        width: '190px',
        opacity: 0.85
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
      await commitPatch('gesture_frame', {
        left: `${pos0.left + 150}px`,
        top: `${pos0.top + 92}px`,
        width: '220px',
        opacity: 0.68
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
      await commitPatch('gesture_end', {
        left: `${pos0.left + 190}px`,
        top: `${pos0.top + 118}px`,
        width: '240px',
        opacity: 0.52
      });
      const pos1 = readPos();
      const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
      return {
        ok: true,
        start: pos0,
        end: pos1,
        width: host instanceof HTMLElement ? host.style.width : null,
        opacity: host instanceof HTMLElement ? host.style.opacity : null
      };
    }, { atome_id: atomeId }, { ok: false, error: 'record_sequence_eval_failed' });
    report.context.record_sequence = recordSequence;
    assert('record_sequence_ok', recordSequence?.ok === true, recordSequence);

    const disarmed = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: false, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
    }, null, { ok: false, error: 'record_disarm_failed' });
    report.context.record_disarm = disarmed;
    assert('record_live_disarmed', true, disarmed);

    await safeEval(page, async () => {
      await window.eveMtrackApi?.seek?.({ time_seconds: 0 });
      return true;
    }, null, false);
    await sleep(180);

    const closeMtrack = await safeEval(page, async () => {
      if (typeof window.close_mtrack_panel === 'function') {
        return window.close_mtrack_panel();
      }
      return { ok: false, error: 'close_mtrack_panel_missing' };
    }, null, null);
    report.context.close_mtrack_before_play = closeMtrack;
    await sleep(260);

    const beforePlay = await safeEval(page, (input) => {
      const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
      return host instanceof HTMLElement
        ? {
            left: host.style.left,
            top: host.style.top,
            mtrack_active: !!window.eveMtrackApi?.isActive?.(),
            debug: window.__DEBUG__?.getAppState?.() || null
          }
        : null;
    }, { atome_id: atomeId }, null);
    report.context.before_play = beforePlay;

    const selectionResult = await safeEval(page, async (input) => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.select',
        action: 'pointer.click',
        input: {
          atome_id: input.atome_id,
          target_id: input.atome_id,
          selection_ids: [input.atome_id]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
    }, { atome_id: atomeId }, null);
    report.context.selection_before_play = selectionResult;
    assert('shape_selected_before_play', selectionResult?.ok === true, selectionResult);

    const footerSelection = await safeEval(page, (input) => {
      return window.eveAtomeEditFooterApi?.publishSelection?.(input.atome_id) || null;
    }, { atome_id: atomeId }, null);
    report.context.footer_selection_before_play = footerSelection;

    const playResult = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.play',
        action: 'pointer.click',
        input: {},
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_project_playback' }
      });
    }, null, null);
    report.context.play = playResult;
    assert('play_invoked', playResult?.ok === true, playResult);

    const playbackSamples = [];
    for (let index = 0; index < 8; index += 1) {
      await sleep(170);
      const sample = await safeEval(page, (input) => {
        const host = document.querySelector(`[data-atome-id="${input.atome_id}"]`);
        const state = window.eveMtrackApi?.getState?.() || null;
        return host instanceof HTMLElement
          ? {
              left: host.style.left,
              top: host.style.top,
              width: host.style.width,
              opacity: host.style.opacity,
              playhead: Number(state?.playhead || 0),
              playing: state?.playing === true
            }
          : null;
      }, { atome_id: atomeId }, null);
      playbackSamples.push(sample);
    }
    report.context.playback_samples = playbackSamples;

    await safeEval(page, async () => window.eveMtrackApi?.stop?.(), null, null);
    await sleep(220);

    const uniquePositions = Array.from(new Set(
      playbackSamples
        .filter(Boolean)
        .map((entry) => `${String(entry.left || '')}::${String(entry.top || '')}`)
    ));
    const playbackMoved = uniquePositions.length > 1;
    assert('project_playback_moved', playbackMoved, {
      unique_positions: uniquePositions,
      samples: playbackSamples
    });

    const uniqueWidths = Array.from(new Set(
      playbackSamples
        .filter(Boolean)
        .map((entry) => String(entry.width || ''))
        .filter(Boolean)
    ));
    const uniqueOpacities = Array.from(new Set(
      playbackSamples
        .filter(Boolean)
        .map((entry) => String(entry.opacity || ''))
        .filter(Boolean)
    ));
    assert('project_playback_replays_other_props', uniqueWidths.length > 1 || uniqueOpacities.length > 1, {
      unique_widths: uniqueWidths,
      unique_opacities: uniqueOpacities,
      samples: playbackSamples
    });

    const debugSnapshot = await safeEval(page, () => window.__DEBUG__?.getAppState?.(), null, null);
    report.context.debug_snapshot = debugSnapshot;
    await page.screenshot({ path: shotFile, fullPage: true });

    report.ok = report.assertions.every((entry) => entry.ok);
  } catch (error) {
    report.error = String(error?.message || error);
  } finally {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const fallback = {
    created_at: new Date().toISOString(),
    ok: false,
    fatal: String(error?.message || error)
  };
  fs.writeFileSync(outFile, JSON.stringify(fallback, null, 2));
  process.exitCode = 1;
});
