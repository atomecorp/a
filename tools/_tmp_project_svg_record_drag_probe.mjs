import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const svgPath = path.resolve('src/assets/images/icons/visible_false.svg');
const svgText = fs.readFileSync(svgPath, 'utf8');

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'project_svg_record_drag_probe.json');
const shotFile = path.join(outDir, 'project_svg_record_drag_probe.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 120, arg = null) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate, arg)) return true;
    } catch (_) {
      // transient runtime churn during boot
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
    ok: false,
    assertions: [],
    console: [],
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

  page.on('console', async (msg) => {
    const text = msg.text();
    if (!/\[eVe:project_(record|playback)\]|\[eVe:record_action\]/.test(text)) return;
    report.console.push({
      type: msg.type(),
      text
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
    await sleep(1000);

    report.context.auth = await safeEval(page, async (creds) => {
      const isSuccess = (res) => !!(
        res?.ok
        || res?.success
        || res?.tauri?.success
        || res?.fastify?.success
      );
      try {
        if (window.AdoleAPI?.auth?.login) {
          let loginResult = await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
          if (!isSuccess(loginResult) && typeof window.AdoleAPI.auth.create === 'function') {
            await window.AdoleAPI.auth.create(creds.phone, creds.password, creds.phone, 'public');
            loginResult = await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
          }
          return {
            ok: !!(window.AdoleAPI.auth.isAuthenticated?.() || isSuccess(loginResult)),
            login_result: loginResult || null
          };
        }
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
      return { ok: false, error: 'login_api_missing' };
    }, { phone, password }, { ok: false, error: 'auth_eval_failed' });

    await sleep(700);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(3000);

    const runtimeReady = await waitFor(
      page,
      () => !!(window.__DEBUG__ && window.AdoleAPI?.projects && window.Atome?.commit && window.eveProjectDropApi),
      30000
    );
    assert('runtime_ready', runtimeReady);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    report.context.project = await safeEval(page, async () => {
      const extractId = (value) => String(
        value?.id
        || value?.atome_id
        || value?.data?.id
        || value?.data?.atome_id
        || value?.tauri?.data?.id
        || value?.tauri?.data?.atome_id
        || value?.fastify?.data?.id
        || value?.fastify?.data?.atome_id
        || ''
      ).trim();
      const listed = await window.AdoleAPI.projects.list();
      let projects = [
        ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
        ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
      ];
      let first = projects[0] || null;
      if (!first && typeof window.AdoleAPI.projects.create === 'function') {
        const probeName = `codex_svg_probe_${Date.now()}`;
        const created = await window.AdoleAPI.projects.create(probeName);
        const createdId = extractId(created);
        if (createdId) {
          first = {
            id: createdId,
            atome_id: createdId,
            properties: { name: probeName }
          };
        }
        const relisted = await window.AdoleAPI.projects.list();
        projects = [
          ...(Array.isArray(relisted?.tauri?.projects) ? relisted.tauri.projects : []),
          ...(Array.isArray(relisted?.fastify?.projects) ? relisted.fastify.projects : [])
        ];
        first = projects.find((entry) => {
          const props = entry?.properties || entry?.particles || entry?.data || {};
          return String(props?.name || '').trim() === probeName;
        }) || first || projects[0] || null;
      }
      if (!first && typeof window.AdoleAPI.atomes?.create === 'function') {
        const probeName = `codex_svg_probe_${Date.now()}`;
        const created = await window.AdoleAPI.atomes.create({
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
      if (!projectId) return { ok: false, error: 'project_missing' };
      const props = first?.properties || first?.particles || first?.data || {};
      await window.AdoleAPI.projects.setCurrent(
        projectId,
        String(props?.name || 'project').trim() || 'project',
        first?.owner_id || props?.owner_id || null,
        true
      );
      try {
        await window.eveToolBase?.loadProjectAtomes?.(projectId);
      } catch (_) {
        // hydration lag tolerated
      }
      return { ok: true, project_id: projectId };
    }, null, { ok: false, error: 'project_eval_failed' });
    assert('project_ready', report.context.project?.ok === true, report.context.project);
    if (report.context.project?.ok !== true) throw new Error('project_missing');

    const importResult = await safeEval(page, async (input) => {
      const file = new File([input.svgText], input.fileName, { type: 'image/svg+xml' });
      const result = await window.eveProjectDropApi.importFilesToProjectViaCreator({
        entries: [file],
        projectId: input.projectId,
        origin: 'headless_svg_probe',
        sourceLayer: 'headless_svg_probe',
        actorType: 'headless_probe'
      });
      const first = Array.isArray(result?.results) ? result.results[0] : null;
      const atomeId = String(first?.atomeId || '').trim();
      return {
        ok: !!result?.created && !!atomeId,
        result,
        atome_id: atomeId || null
      };
    }, {
      svgText,
      fileName: 'probe_record.svg',
      projectId: String(report.context.project.project_id)
    }, { ok: false, error: 'import_eval_failed' });
    report.context.import = importResult;
    assert('svg_imported', importResult?.ok === true, importResult);
    if (importResult?.ok !== true || !importResult?.atome_id) throw new Error('svg_import_failed');

    const atomeId = String(importResult.atome_id);
    const hostReady = await waitFor(
      page,
      (id) => {
        const host = document.querySelector(`[data-atome-id="${id}"]`);
        return !!(host instanceof HTMLElement && host.getBoundingClientRect().width > 0);
      },
      15000,
      100
    , atomeId);
    assert('svg_host_ready', hostReady, { atome_id: atomeId });
    if (!hostReady) throw new Error('svg_host_missing');

    await safeEval(page, (id) => {
      window.eveAtomeEditFooterApi?.publishSelection?.(id);
      window.__DEBUG__?.openAtomeFooter?.(id);
      return {
        footer: window.__DEBUG__?.getFooterState?.() || null
      };
    }, atomeId, null);
    await sleep(220);

    const bbox = await page.locator(`[data-atome-id="${atomeId}"]`).boundingBox();
    report.context.before_drag_bbox = bbox;
    assert('svg_bbox_ready', !!bbox, bbox);
    if (!bbox) throw new Error('svg_bbox_missing');

    await page.mouse.move(bbox.x + (bbox.width / 2), bbox.y + (bbox.height / 2));
    await page.mouse.down();
    await page.mouse.up();
    await sleep(120);

    const recordOn = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: true, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_svg_record_drag' }
      });
    }, null, { ok: false, error: 'record_on_failed' });
    report.context.record_on = recordOn;
    assert('record_live_on', !!recordOn, recordOn);
    await sleep(250);

    const dragStartX = bbox.x + (bbox.width / 2);
    const dragStartY = bbox.y + (bbox.height / 2);
    const dragEndX = dragStartX + 220;
    const dragEndY = dragStartY + 120;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragEndX, dragEndY, { steps: 18 });
    await page.mouse.up();
    await sleep(280);

    const recordOff = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.detail.record.toggle',
        action: 'pointer.click',
        input: { active: false, mode: 'live' },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_svg_record_drag' }
      });
    }, null, { ok: false, error: 'record_off_failed' });
    report.context.record_off = recordOff;
    await sleep(900);

    report.context.after_record = await safeEval(page, async (id) => {
      const record = await window.Atome?.getStateCurrent?.(id);
      const props = record?.properties || record?.particles || {};
      const timeline = props?.project_timeline || null;
      const host = document.querySelector(`[data-atome-id="${id}"]`);
      return {
        host: host instanceof HTMLElement ? {
          left: host.style.left || null,
          top: host.style.top || null,
          color: host.style.color || null,
          background: host.style.background || null,
          kind: host.dataset?.atomeKind || null
        } : null,
        has_timeline: !!timeline,
        duration: Number(timeline?.duration || 0),
        lanes: Array.isArray(timeline?.automation_lanes) ? timeline.automation_lanes.map((lane) => ({
          property_path: String(lane?.target?.property_path || lane?.target?.propertyPath || ''),
          keyframe_count: Array.isArray(lane?.keyframes) ? lane.keyframes.length : 0,
          first_t: Array.isArray(lane?.keyframes) && lane.keyframes.length ? Number(lane.keyframes[0]?.t || 0) : null,
          last_t: Array.isArray(lane?.keyframes) && lane.keyframes.length ? Number(lane.keyframes[lane.keyframes.length - 1]?.t || 0) : null
        })) : []
      };
    }, atomeId, null);
    assert('timeline_created', report.context.after_record?.has_timeline === true, report.context.after_record);
    assert('timeline_duration_positive', Number(report.context.after_record?.duration || 0) > 0, report.context.after_record);

    await safeEval(page, (id) => {
      window.eveAtomeEditFooterApi?.publishSelection?.(id);
      window.__DEBUG__?.openAtomeFooter?.(id);
      return true;
    }, atomeId, false);
    await sleep(120);

    const playResult = await safeEval(page, async () => {
      const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
      return mod.invokeToolGateway({
        tool_id: 'ui.play',
        action: 'pointer.click',
        input: {},
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'project_svg_record_drag' }
      });
    }, null, { ok: false, error: 'play_failed' });
    report.context.play = playResult;
    assert('play_invoked', !!playResult, playResult);

    const playbackSamples = [];
    for (let index = 0; index < 10; index += 1) {
      await sleep(160);
      playbackSamples.push(await safeEval(page, (id) => {
        const host = document.querySelector(`[data-atome-id="${id}"]`);
        const svg = host?.querySelector?.('[data-role="atome-shape-svg"] svg, svg') || null;
        return host instanceof HTMLElement ? {
          left: host.style.left || null,
          top: host.style.top || null,
          color: host.style.color || null,
          background: host.style.background || null,
          svg_color: svg instanceof SVGElement ? (svg.style.color || null) : null
        } : null;
      }, atomeId, null));
    }
    report.context.playback_samples = playbackSamples;
    const uniquePositions = Array.from(new Set(
      playbackSamples
        .filter(Boolean)
        .map((entry) => `${String(entry.left || '')}::${String(entry.top || '')}`)
    ));
    assert('playback_moves_svg', uniquePositions.length > 1, {
      unique_positions: uniquePositions,
      samples: playbackSamples
    });
    const backgrounds = Array.from(new Set(
      playbackSamples
        .filter(Boolean)
        .map((entry) => String(entry.background || ''))
        .filter(Boolean)
    ));
    assert('playback_no_white_bg', !backgrounds.includes('white') && !backgrounds.includes('rgb(255, 255, 255)'), {
      backgrounds,
      samples: playbackSamples
    });

    await page.screenshot({ path: shotFile, fullPage: true });
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
