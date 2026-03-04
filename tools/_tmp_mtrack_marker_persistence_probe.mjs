import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
const outFile = path.join(outDir, 'mtrack_marker_persistence_probe.json');
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 15000, intervalMs = 180) => {
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

const readMarkerState = async (page, groupId) => safeEval(page, async (gid) => {
  const parseObj = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  };
  const parseMarkers = (value) => {
    if (Array.isArray(value)) return value;
    const obj = parseObj(value);
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj.markers)) return obj.markers;
    if (Array.isArray(obj.items)) return obj.items;
    return Object.values(obj).filter((entry) => !!entry && typeof entry === 'object');
  };
  const resolveProps = (record) => {
    if (!record || typeof record !== 'object') return {};
    if (record.properties && typeof record.properties === 'object') return record.properties;
    if (record.data && typeof record.data === 'object') {
      if (record.data.properties && typeof record.data.properties === 'object') return record.data.properties;
      if (record.data.particles && typeof record.data.particles === 'object') return record.data.particles;
      return record.data;
    }
    if (record.particles && typeof record.particles === 'object') return record.particles;
    return {};
  };
  const getTimelineMarkerCount = (timelineValue) => {
    const timeline = parseObj(timelineValue);
    if (!timeline || typeof timeline !== 'object') return 0;
    const ui = (timeline.ui && typeof timeline.ui === 'object') ? timeline.ui : {};
    return parseMarkers(ui.ruler_markers ?? ui.rulerMarkers ?? []).length;
  };
  const readDomMarkerCount = () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    if (!panel) return 0;
    return panel.querySelectorAll('.eve-mtrack-zone[data-zone-type="marker"]').length;
  };

  const stateApi = window.Atome?.getStateCurrent || window.__atomeCommitApi?.getStateCurrent;
  const state = (typeof stateApi === 'function' && gid) ? await stateApi(String(gid)) : null;
  const props = resolveProps(state);

  const groupDirect = parseMarkers(props.group_timeline_markers ?? props.groupTimelineMarkers ?? []);
  const mtraxDirect = parseMarkers(props.mtrax_timeline_markers ?? props.mtraxTimelineMarkers ?? []);
  const groupTimelineCount = getTimelineMarkerCount(props.group_timeline ?? props.groupTimeline ?? null);
  const mtraxTimelineCount = getTimelineMarkerCount(props.mtrax_timeline ?? props.mtraxTimeline ?? null);
  const maxPersisted = Math.max(groupDirect.length, mtraxDirect.length, groupTimelineCount, mtraxTimelineCount);

  return {
    group_id: String(gid || ''),
    dom_markers: readDomMarkerCount(),
    persisted: {
      group_direct: groupDirect.length,
      mtrax_direct: mtraxDirect.length,
      group_timeline_ui: groupTimelineCount,
      mtrax_timeline_ui: mtraxTimelineCount,
      max: maxPersisted
    }
  };
}, groupId, null);

const openGroupTimeline = async (page, groupId) => {
  const invoked = await safeEval(page, async (gid) => {
    const runtime = window.atome?.tools?.v2Runtime || null;
    if (runtime && typeof runtime.invokeById === 'function') {
      try {
        const runtimeResult = await runtime.invokeById({
          tool_id: 'tool.main.mtrack',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: 'open',
            toggle: false,
            group_id: String(gid || ''),
            selection_ids: [String(gid || '')],
            target_id: '_intuition_v2_mtrack'
          },
          presentation: 'ui',
          source: { type: 'headless_probe', layer: 'marker_persistence' }
        });
        if (runtimeResult?.ok) {
          return { route: 'runtime', ok: true, res: runtimeResult };
        }
        return { route: 'runtime', ok: false, res: runtimeResult };
      } catch (error) {
        return { route: 'runtime', ok: false, error: String(error?.message || error || 'runtime_open_failed') };
      }
    }
    const open = window.eVeGroupTimeline?.openGroupTimeline;
    if (typeof open === 'function') {
      try {
        const res = await open({
          group_id: String(gid || ''),
          source: { type: 'headless_probe', layer: 'marker_persistence' }
        });
        if (res?.ok) {
          return { route: 'bridge', ok: true, res };
        }
        const host = document.querySelector(`[data-atome-id="${String(gid || '').replace(/"/g, '\\"')}"]`);
        if (host instanceof HTMLElement) {
          const rect = host.getBoundingClientRect();
          return {
            route: 'bridge_fallback_dblclick',
            ok: false,
            res,
            click: {
              x: Math.round(rect.left + rect.width * 0.5),
              y: Math.round(rect.top + rect.height * 0.5)
            }
          };
        }
        return { route: 'bridge', ok: false, res };
      } catch (error) {
        return { route: 'bridge', ok: false, error: String(error?.message || error || 'open_failed') };
      }
    }
    const host = document.querySelector(`[data-atome-id="${String(gid || '').replace(/"/g, '\\"')}"]`);
    if (!(host instanceof HTMLElement)) return { route: 'dblclick', ok: false, error: 'group_host_missing' };
    const rect = host.getBoundingClientRect();
    return {
      route: 'dblclick',
      ok: true,
      click: {
        x: Math.round(rect.left + rect.width * 0.5),
        y: Math.round(rect.top + rect.height * 0.5)
      }
    };
  }, groupId, null);
  if (
    (invoked?.route === 'dblclick' && invoked?.ok && invoked?.click)
    || (invoked?.route === 'bridge_fallback_dblclick' && invoked?.click)
  ) {
    await page.mouse.dblclick(invoked.click.x, invoked.click.y, { delay: 55 });
  }
  const ready = await waitFor(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    if (!panel) return false;
    const style = window.getComputedStyle(panel);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const lane = panel.querySelector('.eve-mtrack-zone-lane-markers');
    return !!lane;
  }, 12000);
  return { invoked, ready };
};

const closeGroupTimeline = async (page) => {
  await safeEval(page, async () => {
    if (typeof window.close_mtrack_panel === 'function') {
      await window.close_mtrack_panel();
    }
    return true;
  }, null, null);
  return waitFor(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    if (!panel) return true;
    const style = window.getComputedStyle(panel);
    return style.display === 'none' || style.visibility === 'hidden';
  }, 12000);
};

const pickMarkerDrag = async (page) => safeEval(page, () => {
  const lane = document.querySelector('#eve_mtrack_dialog .eve-mtrack-zone-lane-markers');
  if (!(lane instanceof HTMLElement)) return null;
  const rect = lane.getBoundingClientRect();
  const existing = Array.from(lane.querySelectorAll('.eve-mtrack-zone[data-zone-type="marker"]'))
    .map((node) => node.getBoundingClientRect());
  const span = Math.max(90, Math.min(180, Math.floor(rect.width * 0.16)));
  for (let x = rect.left + 24; x + span < rect.right - 24; x += 24) {
    const end = x + span;
    const overlap = existing.some((r) => !(end <= (r.left - 4) || x >= (r.right + 4)));
    if (!overlap) {
      return {
        x1: Math.round(x),
        x2: Math.round(end),
        y: Math.round(rect.top + rect.height * 0.5)
      };
    }
  }
  return {
    x1: Math.round(rect.left + 30),
    x2: Math.round(rect.left + Math.min(rect.width - 30, 160)),
    y: Math.round(rect.top + rect.height * 0.5)
  };
}, null, null);

const dragCreateMarker = async (page) => {
  const drag = await pickMarkerDrag(page);
  if (!drag) return { ok: false, error: 'markers_lane_missing' };
  await page.mouse.move(drag.x1, drag.y);
  await page.mouse.down();
  await page.mouse.move(drag.x2, drag.y, { steps: 12 });
  await page.mouse.up();
  await sleep(380);
  return { ok: true, drag };
};

const resolveOrCreateTargetGroup = async (page) => {
  const fromDom = await safeEval(page, () => {
    const candidates = Array.from(document.querySelectorAll('[data-atome-kind="group"], [data-group-atome="true"]'));
    const host = candidates.find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 120 || rect.height <= 80) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
    if (!(host instanceof HTMLElement)) return null;
    return {
      route: 'dom_group',
      group_id: String(host.dataset.atomeId || host.dataset.groupId || '').trim()
    };
  }, null, null);
  if (fromDom?.group_id) return fromDom;

  const probe = await safeEval(page, async () => {
    const normalizeId = (value) => String(value || '').trim();
    const pickTarget = () => {
      const nodes = Array.from(document.querySelectorAll('[data-atome-id]'));
      return nodes.find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const kind = String(node.dataset?.atomeKind || '').trim().toLowerCase();
        if (kind === 'group' || kind === 'mtrack' || kind === 'tool_shortcut') return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 16) return false;
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }) || null;
    };
    let target = pickTarget();
    let createdAtomeId = '';
    if (!(target instanceof HTMLElement)) {
      const toolBase = window.eveToolBase || null;
      if (toolBase && typeof toolBase.createAtome === 'function') {
        try {
          const created = await toolBase.createAtome({
            kind: 'video',
            type: 'video',
            name: 'probe_video',
            src: '/assets/videos/video_missing.mp4',
            left: '260px',
            top: '220px',
            width: '240px',
            height: '150px'
          });
          createdAtomeId = String(created?.id || (Array.isArray(created?.ids) ? created.ids[0] : '') || '').trim();
          if (createdAtomeId) {
            await new Promise((resolve) => setTimeout(resolve, 360));
            target = document.querySelector(`[data-atome-id="${createdAtomeId.replace(/"/g, '\\"')}"]`);
          }
        } catch (_) { }
      }
    }
    if (!(target instanceof HTMLElement)) {
      return { ok: false, error: 'no_non_group_target', created_atome_id: createdAtomeId || null };
    }
    const rect = target.getBoundingClientRect();
    const runtime = window.atome?.tools?.v2Runtime || null;
    let invoke = null;
    if (runtime && typeof runtime.invokeById === 'function') {
      try {
        invoke = await runtime.invokeById({
          tool_id: 'tool.main.mtrack',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: 'open',
            toggle: false,
            target_id: '_intuition_v2_mtrack'
          },
          presentation: 'ui',
          source: { type: 'headless_probe', layer: 'marker_persistence' }
        });
      } catch (error) {
        invoke = { ok: false, error: String(error?.message || error || 'invoke_failed') };
      }
    }
    return {
      ok: true,
      target: {
        atome_id: normalizeId(target.dataset?.atomeId || ''),
        x: Math.round(rect.left + rect.width * 0.5),
        y: Math.round(rect.top + rect.height * 0.5)
      },
      created_atome_id: createdAtomeId || null,
      invoke
    };
  }, null, null);
  if (!probe?.ok || !probe?.target?.x || !probe?.target?.y) {
    return { route: 'create_group', ok: false, error: probe?.error || 'probe_target_missing' };
  }

  await page.mouse.click(probe.target.x, probe.target.y, { delay: 55 });
  await sleep(260);
  if (!probe?.invoke || probe.invoke?.ok === false) {
    await safeEval(page, async () => {
      const bridge = window.eVeGroupTimeline?.openGroupTimeline;
      if (typeof bridge === 'function') {
        try {
          await bridge({ source: { type: 'headless_probe', layer: 'marker_persistence' } });
        } catch (_) { }
      }
    }, null, null);
  }

  const ready = await waitFor(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    if (!panel) return false;
    const style = window.getComputedStyle(panel);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const state = (window.eveMtrackApi && typeof window.eveMtrackApi.getState === 'function')
      ? window.eveMtrackApi.getState()
      : null;
    return !!String(state?.activeGroupId || '').trim();
  }, 14000);
  if (!ready) {
    return { route: 'create_group', ok: false, error: 'mtrack_open_after_create_failed' };
  }
  const active = await safeEval(page, () => {
    const state = (window.eveMtrackApi && typeof window.eveMtrackApi.getState === 'function')
      ? window.eveMtrackApi.getState()
      : null;
    return {
      group_id: String(state?.activeGroupId || '').trim()
    };
  }, null, null);
  if (!active?.group_id) {
    return { route: 'create_group', ok: false, error: 'active_group_missing_after_create' };
  }
  return {
    route: 'create_group',
    group_id: active.group_id,
    created: true,
    invoke: probe.invoke || null
  };
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    steps: [],
    errors: [],
    console: []
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 980 } });
  await context.addInitScript(() => {
    window.__EVE_MTRACK_DEBUG__ = true;
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[eVe:mtrack]') || text.includes('persist verify:loop+markers')) {
      report.console.push({ type: msg.type(), text });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(900);

    await safeEval(page, async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.login) return null;
      try { return await api.auth.login(creds.phone, creds.password, creds.phone); } catch (_) { return null; }
    }, { phone, password }, null);
    await sleep(700);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);

    await safeEval(page, () => window.__DEBUG__?.setDeterministicTestMode?.(true), null, null);

    const target = await resolveOrCreateTargetGroup(page);
    const targetDebug = await safeEval(page, () => {
      const atomes = Array.from(document.querySelectorAll('[data-atome-id]'));
      const groups = atomes.filter((node) => {
        const kind = String(node?.dataset?.atomeKind || '').trim().toLowerCase();
        return kind === 'group' || node?.dataset?.groupAtome === 'true';
      });
      return {
        atome_count: atomes.length,
        group_count: groups.length,
        has_tool_base: !!window.eveToolBase,
        has_runtime: !!window.atome?.tools?.v2Runtime,
        mtrack_panel_present: !!document.getElementById('eve_mtrack_dialog')
      };
    }, null, null);
    report.steps.push({ step: 'resolve_target_group', target, debug: targetDebug });
    if (!target?.group_id) throw new Error('group_target_missing');
    report.group_id = target.group_id;

    const open1 = await openGroupTimeline(page, target.group_id);
    report.steps.push({ step: 'open_initial', ...open1 });
    if (!open1.ready) throw new Error('open_initial_failed');

    const before = await readMarkerState(page, target.group_id);
    report.steps.push({ step: 'before_create', state: before });

    const creation = await dragCreateMarker(page);
    report.steps.push({ step: 'create_marker', ...creation });
    if (!creation.ok) throw new Error(creation.error || 'create_marker_failed');

    const markerCreated = await waitFor(page, async () => {
      const count = document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-zone[data-zone-type="marker"]').length;
      return count >= 1;
    }, 8000);
    report.steps.push({ step: 'marker_created_wait', ok: markerCreated });
    if (!markerCreated) throw new Error('marker_not_created');

    const afterCreate = await readMarkerState(page, target.group_id);
    report.steps.push({ step: 'after_create', state: afterCreate });
    if ((afterCreate?.dom_markers || 0) < 1) throw new Error('dom_marker_missing_after_create');

    const closed1 = await closeGroupTimeline(page);
    report.steps.push({ step: 'close_after_create', ok: closed1 });
    if (!closed1) throw new Error('close_after_create_failed');

    await sleep(900);
    const persistedAfterClose = await readMarkerState(page, target.group_id);
    report.steps.push({ step: 'persisted_after_close', state: persistedAfterClose });
    if ((persistedAfterClose?.persisted?.max || 0) < 1) throw new Error('persisted_marker_missing_after_close');

    const open2 = await openGroupTimeline(page, target.group_id);
    report.steps.push({ step: 'open_after_close', ...open2 });
    if (!open2.ready) throw new Error('open_after_close_failed');

    const afterReopen = await readMarkerState(page, target.group_id);
    report.steps.push({ step: 'after_reopen', state: afterReopen });
    if ((afterReopen?.dom_markers || 0) < 1) throw new Error('marker_missing_after_reopen');

    const closed2 = await closeGroupTimeline(page);
    report.steps.push({ step: 'close_before_refresh', ok: closed2 });
    if (!closed2) throw new Error('close_before_refresh_failed');

    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);
    await safeEval(page, () => window.__DEBUG__?.setDeterministicTestMode?.(true), null, null);

    const open3 = await openGroupTimeline(page, target.group_id);
    report.steps.push({ step: 'open_after_refresh', ...open3 });
    if (!open3.ready) throw new Error('open_after_refresh_failed');

    const afterRefresh = await readMarkerState(page, target.group_id);
    report.steps.push({ step: 'after_refresh_reopen', state: afterRefresh });
    if ((afterRefresh?.dom_markers || 0) < 1) throw new Error('marker_missing_after_refresh');
    if ((afterRefresh?.persisted?.max || 0) < 1) throw new Error('persisted_marker_missing_after_refresh');

    report.ok = true;
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, outFile, group_id: target.group_id }, null, 2));
    await browser.close();
    process.exit(0);
  } catch (error) {
    report.ok = false;
    report.errors.push(String(error?.message || error || 'probe_failed'));
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.error(JSON.stringify({ ok: false, outFile, errors: report.errors }, null, 2));
    await browser.close();
    process.exit(1);
  }
};

run();
