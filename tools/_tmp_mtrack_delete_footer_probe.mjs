import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'mtrack_delete_footer_probe.json');
const shotBefore = path.join(outDir, 'mtrack_delete_footer_before.png');
const shotAfter = path.join(outDir, 'mtrack_delete_footer_after.png');

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
      // ignore transient boot timing
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
    console: [],
    steps: {}
  };

  const assert = (name, ok, details = null) => {
    report.assertions.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
    window.__MTRACK_DELETE_FOOTER_PROBE__ = {
      footerEvents: [],
      logs: []
    };
    window.addEventListener('eve:mtrack-footer-control', (event) => {
      try {
        const probe = window.__MTRACK_DELETE_FOOTER_PROBE__;
        const list = Array.isArray(probe?.footerEvents) ? probe.footerEvents : [];
        list.push({
          type: 'footer_control',
          detail: event?.detail || null,
          at: Date.now()
        });
        probe.footerEvents = list.slice(-20);
      } catch (_) {}
    });
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
      text: String(error?.message || error)
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
        return { ok: false, error: String(error?.message || error) };
      }
    }, { phone, password }, { ok: false, error: 'login_eval_failed' });

    await sleep(900);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2400);

    report.steps.runtime = await safeEval(page, async () => {
      await import('/application/eVe/intuition/tools/mtrack.js');
      await import('/application/eVe/intuition/tools/detail.js');
      if (window.__DEBUG__?.setDeterministicTestMode) {
        window.__DEBUG__.setDeterministicTestMode(true);
      }
      return {
        has_debug: !!window.__DEBUG__,
        has_mtrack_api: !!window.eveMtrackApi,
        has_tool_base: !!window.eveToolBase,
        has_atome_commit: !!window.Atome?.commit
      };
    }, null, { ok: false, error: 'runtime_import_failed' });

    const runtimeReady = await waitFor(
      page,
      () => !!(window.__DEBUG__ && window.eveMtrackApi && window.eveToolBase && window.Atome?.commit),
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
        const probeName = `codex_mtrack_delete_probe_${Date.now()}`;
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
        const probeName = `codex_mtrack_delete_probe_${Date.now()}`;
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
      } catch (_) {}
      return { ok: true, project_id: projectId };
    }, null, { ok: false, error: 'project_eval_failed' });
    assert('project_ready', report.steps.project?.ok === true, report.steps.project);
    if (report.steps.project?.ok !== true) throw new Error('project_not_ready');

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
        return {
          ok: true,
          source: 'existing',
          atome_id: toId(existing.dataset.atomeId)
        };
      }
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
      const created = await runtime.invokeById({
        tool_id: 'ui.circle',
        event: 'touch',
        action: 'pointer.click',
        input: { x: 360, y: 280, radius: 44, fill: '#ff6b3d' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_delete_footer_probe' }
      });
      const atomeId = toId(
        created?.result?.result?.atome_id
        || created?.result?.atome_id
        || created?.atome_id
      );
      return atomeId ? { ok: true, source: 'created', atome_id: atomeId } : { ok: false, error: 'target_missing', created };
    }, null, { ok: false, error: 'target_eval_failed' });
    assert('target_ready', report.steps.target?.ok === true, report.steps.target);
    if (report.steps.target?.ok !== true) throw new Error('target_not_ready');

    const atomeId = String(report.steps.target.atome_id || '').trim();

    report.steps.select_target = await safeEval(page, async (input) => {
      const runtime = window.atome?.tools?.v2Runtime || null;
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
      const result = await runtime.invokeById({
        tool_id: 'ui.select',
        event: 'touch',
        action: 'pointer.click',
        input: {
          atome_id: input.atome_id,
          target_id: input.atome_id,
          selection_ids: [input.atome_id]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_delete_footer_probe' }
      });
      window.eveAtomeEditFooterApi?.publishSelection?.(input.atome_id);
      return { ok: true, result };
    }, { atome_id: atomeId }, { ok: false, error: 'select_eval_failed' });

    report.steps.open_mtrack = await safeEval(page, async (input) => {
      const runtime = window.atome?.tools?.v2Runtime || null;
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
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
        source: { type: 'headless_probe', layer: 'mtrack_delete_footer_probe' }
      });
    }, { atome_id: atomeId }, { ok: false, error: 'open_eval_failed' });

    const mtrackReady = await waitFor(
      page,
      () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const button = document.querySelector('.eve-atome-edit-footer-tool[data-footer-tool-key="mtrack_delete"]');
        return !!(state?.activeGroupId && button);
      },
      15000
    );
    assert(
      'mtrack_ready',
      mtrackReady,
      await safeEval(page, () => ({
        footer: window.__DEBUG__?.getFooterState?.() || null,
        timeline: window.__DEBUG__?.getTimelineState?.() || null
      }), null, null)
    );
    if (!mtrackReady) throw new Error('mtrack_not_ready');

    report.steps.append = await safeEval(page, async (input) => {
      const state = window.eveMtrackApi?.getState?.() || null;
      if (Number(state?.clipCount || 0) > 0) return { ok: true, skipped: true, clip_count: Number(state.clipCount || 0) };
      if (!window.eveMtrackApi?.appendCaptureAtomes) return { ok: false, error: 'append_api_missing' };
      return window.eveMtrackApi.appendCaptureAtomes({ atome_ids: [input.atome_id] });
    }, { atome_id: atomeId }, { ok: false, error: 'append_eval_failed' });
    assert('clip_present_or_appended', report.steps.append?.ok === true, report.steps.append);

    const clipReady = await waitFor(
      page,
      () => Number(window.eveMtrackApi?.getState?.()?.clipCount || 0) > 0,
      12000
    );
    assert('clip_ready', clipReady, await safeEval(page, () => window.eveMtrackApi?.getState?.(), null, null));
    if (!clipReady) throw new Error('clip_not_ready');

    report.steps.before = await safeEval(page, async () => {
      const clipNode = document.querySelector('#eve_mtrack_dialog .eve-mtrack-clip');
      const deleteButton = document.querySelector('.eve-atome-edit-footer-tool[data-footer-tool-key="mtrack_delete"]');
      const footerTools = Array.from(document.querySelectorAll('.eve-atome-edit-footer-tool[data-footer-tool-key]')).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          key: String(node.getAttribute('data-footer-tool-key') || ''),
          text: String(node.textContent || '').trim(),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
      const footerState = window.__DEBUG__?.getFooterState?.() || null;
      const timelineState = window.__DEBUG__?.getTimelineState?.() || null;
      const mtrackState = window.eveMtrackApi?.getState?.() || null;
      return {
        has_clip_node: !!clipNode,
        clip_class: clipNode instanceof HTMLElement ? clipNode.className : null,
        delete_button: deleteButton instanceof HTMLElement
          ? {
              text: String(deleteButton.textContent || '').trim(),
              disabled: deleteButton.getAttribute('aria-disabled'),
              latched: deleteButton.dataset.latched || null
            }
          : null,
        footer_state: footerState,
        timeline_state: timelineState,
        selected_clip_atome_ids: window.eveMtrackApi?.getSelectedClipAtomeIds?.() || [],
        mtrack_state: mtrackState,
        footer_tools: footerTools,
        footer_events: window.__MTRACK_DELETE_FOOTER_PROBE__?.footerEvents || []
      };
    }, null, null);

    const clipPoint = await safeEval(page, () => {
      const clipNode = document.querySelector('#eve_mtrack_dialog .eve-mtrack-clip');
      if (!(clipNode instanceof HTMLElement)) return null;
      const rect = clipNode.getBoundingClientRect();
      return {
        x: Math.round(rect.left + Math.max(18, rect.width * 0.5)),
        y: Math.round(rect.top + Math.max(12, rect.height * 0.5))
      };
    }, null, null);
    if (clipPoint?.x && clipPoint?.y) {
      await page.mouse.click(clipPoint.x, clipPoint.y, { delay: 40 });
      await sleep(280);
    }
    let clipSelected = await safeEval(page, async () => {
      return {
        ok: true,
        selected_clip_atome_ids: window.eveMtrackApi?.getSelectedClipAtomeIds?.() || [],
        timeline_state: window.__DEBUG__?.getTimelineState?.() || null
      };
    }, null, { ok: false, error: 'clip_select_eval_failed' });
    if (!Array.isArray(clipSelected?.selected_clip_atome_ids) || !clipSelected.selected_clip_atome_ids.length) {
      const fallbackSelection = await safeEval(page, async () => {
        const exportResult = await window.eveMtrackApi?.exportTimeline?.();
        const clips = Array.isArray(exportResult?.timeline?.clips) ? exportResult.timeline.clips : [];
        const firstAtomeId = String(clips[0]?.atome_id || '').trim();
        if (!firstAtomeId || !window.eveMtrackApi?.syncClipSelectionFromAtomeIds) {
          return { ok: false, error: 'clip_selection_fallback_unavailable', first_atome_id: firstAtomeId || null };
        }
        const synced = window.eveMtrackApi.syncClipSelectionFromAtomeIds({ atome_ids: [firstAtomeId] });
        return {
          ok: true,
          fallback: true,
          first_atome_id: firstAtomeId,
          synced,
          selected_clip_atome_ids: window.eveMtrackApi?.getSelectedClipAtomeIds?.() || [],
          timeline_state: window.__DEBUG__?.getTimelineState?.() || null
        };
      }, null, { ok: false, error: 'clip_select_fallback_eval_failed' });
      clipSelected = fallbackSelection;
      await sleep(200);
    }
    report.steps.select_clip = clipSelected;
    await sleep(350);

    await page.screenshot({ path: shotBefore, fullPage: true });

    const deleteButtonLocator = page.locator('.eve-atome-edit-footer-tool[data-footer-tool-key="mtrack_delete"]').first();
    const deleteButtonFound = await deleteButtonLocator.count();
    assert('delete_button_present', deleteButtonFound > 0, { count: deleteButtonFound });
    if (!deleteButtonFound) throw new Error('delete_button_missing');

    const domClickResult = await safeEval(page, () => {
      const button = document.querySelector('.eve-atome-edit-footer-tool[data-footer-tool-key="mtrack_delete"]');
      if (!(button instanceof HTMLElement)) return { ok: false, error: 'delete_button_missing' };
      button.click();
      return {
        ok: true,
        rect: button.getBoundingClientRect().toJSON?.() || null
      };
    }, null, { ok: false, error: 'delete_button_dom_click_failed' });
    report.steps.dom_delete_click = domClickResult;
    await sleep(900);

    report.steps.after_click = await safeEval(page, async () => {
      return {
        footer_state: window.__DEBUG__?.getFooterState?.() || null,
        timeline_state: window.__DEBUG__?.getTimelineState?.() || null,
        mtrack_state: window.eveMtrackApi?.getState?.() || null,
        selected_clip_atome_ids: window.eveMtrackApi?.getSelectedClipAtomeIds?.() || [],
        footer_events: window.__MTRACK_DELETE_FOOTER_PROBE__?.footerEvents || [],
        clip_node_count: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip').length
      };
    }, null, null);

    const clipCountBefore = Number(report.steps.before?.mtrack_state?.clipCount || 0);
    const clipCountAfterClick = Number(report.steps.after_click?.mtrack_state?.clipCount || 0);
    const footerDeleteWorked = clipCountAfterClick < clipCountBefore;

    let apiDelete = null;
    if (!footerDeleteWorked && Number(report.steps.after_click?.mtrack_state?.clipCount || 0) > 0) {
      apiDelete = await safeEval(page, async () => {
        if (!window.eveMtrackApi?.setFooterControl) return { ok: false, error: 'setFooterControl_missing' };
        return window.eveMtrackApi.setFooterControl({ control: 'delete' });
      }, null, { ok: false, error: 'api_delete_eval_failed' });
      await sleep(900);
    }
    report.steps.api_delete = apiDelete;

    report.steps.after_api = await safeEval(page, async () => {
      return {
        footer_state: window.__DEBUG__?.getFooterState?.() || null,
        timeline_state: window.__DEBUG__?.getTimelineState?.() || null,
        mtrack_state: window.eveMtrackApi?.getState?.() || null,
        selected_clip_atome_ids: window.eveMtrackApi?.getSelectedClipAtomeIds?.() || [],
        footer_events: window.__MTRACK_DELETE_FOOTER_PROBE__?.footerEvents || [],
        clip_node_count: document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip').length
      };
    }, null, null);

    await page.screenshot({ path: shotAfter, fullPage: true });

    const clipCountAfterApi = Number(report.steps.after_api?.mtrack_state?.clipCount || 0);
    const footerDeleteEventSeen = Array.isArray(report.steps.after_click?.footer_events)
      && report.steps.after_click.footer_events.some((entry) => String(entry?.detail?.control || '').trim().toLowerCase() === 'delete');

    assert('footer_delete_event_seen', footerDeleteEventSeen, report.steps.after_click?.footer_events || null);
    assert('footer_click_deleted_clip', clipCountAfterClick < clipCountBefore, {
      before: clipCountBefore,
      after_click: clipCountAfterClick
    });
    assert('api_delete_deleted_clip', footerDeleteWorked || clipCountAfterApi < clipCountAfterClick || clipCountAfterApi < clipCountBefore, {
      before: clipCountBefore,
      after_click: clipCountAfterClick,
      after_api: clipCountAfterApi,
      api_delete: apiDelete
    });

    report.ok = report.assertions.every((entry) => entry.ok);
  } catch (error) {
    report.error = String(error?.message || error || 'probe_failed');
  } finally {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    await browser.close();
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  fs.writeFileSync(outFile, JSON.stringify({
    created_at: new Date().toISOString(),
    ok: false,
    fatal: String(error?.message || error || 'probe_failed')
  }, null, 2));
  process.exit(1);
});
