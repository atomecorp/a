import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'molecule_dblclick_probe.json');

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 150) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (_) {
      // boot is still settling
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
    console: [],
    steps: {}
  };

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--mute-audio']
    });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('console', (msg) => {
      report.console.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', (error) => {
      report.console.push({ type: 'pageerror', text: String(error?.message || error) });
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    report.steps.runtime_ready = await waitFor(page, () => !!(
      window.eveMoleculeTimelineApi
      && window.eveAtomeEditFooterApi
      && window.Atome?.moleculeStores?.projectStore
      && window.Atome?.moleculeStores?.eventStore
    ));

    report.steps.inject = await page.evaluate(() => {
      const root = document.getElementById('view') || document.getElementById('intuition') || document.body;
      const existing = document.querySelector('[data-atome-id="probe_molecule_dblclick"]');
      if (existing) existing.remove();
      const video = document.createElement('div');
      video.dataset.atomeId = 'probe_video_member';
      video.dataset.atomeKind = 'video';
      video.style.cssText = 'position:absolute;left:40px;top:40px;width:80px;height:50px;background:#345;';
      root.appendChild(video);
      const text = document.createElement('div');
      text.dataset.atomeId = 'probe_text_member';
      text.dataset.atomeKind = 'text';
      text.style.cssText = 'position:absolute;left:140px;top:40px;width:80px;height:50px;background:#543;';
      root.appendChild(text);
      const host = document.createElement('div');
      host.dataset.atomeId = 'probe_molecule_dblclick';
      host.dataset.groupId = 'probe_molecule_dblclick';
      host.dataset.atomeKind = 'group';
      host.dataset.groupAtome = 'true';
      host.dataset.groupSteps = JSON.stringify([['probe_video_member'], ['probe_text_member']]);
      host.style.cssText = 'position:absolute;left:220px;top:180px;width:220px;height:120px;background:#243b55;color:white;z-index:5000;pointer-events:auto;';
      host.textContent = 'probe molecule';
      root.appendChild(host);
      return {
        ok: true,
        host_id: host.dataset.atomeId,
        rect: host.getBoundingClientRect().toJSON?.() || {
          left: host.getBoundingClientRect().left,
          top: host.getBoundingClientRect().top,
          width: host.getBoundingClientRect().width,
          height: host.getBoundingClientRect().height
        }
      };
    });

    await page.dblclick('[data-atome-id="probe_molecule_dblclick"]', { timeout: 10000, force: true });
    await page.waitForTimeout(1000);

    report.steps.interactions = {
      playhead_drag: false,
      marker_create: false,
      marker_rename: false,
      loop_create: false,
      loop_toggle: false,
      loop_delete: false,
      clip_move: false,
      clip_trim: false,
      new_track_drop: false,
      debug: {}
    };

    const dragInBox = async (selector, fromRatio, toRatio, yRatio = 0.5) => {
      const box = await page.locator(selector).first().boundingBox();
      if (!box) return false;
      const y = box.y + (box.height * yRatio);
      await page.mouse.move(box.x + (box.width * fromRatio), y);
      await page.mouse.down();
      await page.mouse.move(box.x + (box.width * toRatio), y, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      return true;
    };

    const rulerBox = await page.locator('[data-role="ruler-lane"]').first().boundingBox();
    const playheadBox = await page.locator('[data-role="ruler-lane"] [data-role="playhead-line"]').first().boundingBox();
    report.steps.interactions.debug.ruler_box = rulerBox;
    report.steps.interactions.debug.playhead_box = playheadBox;
    if (rulerBox && playheadBox) {
      const y = playheadBox.y + Math.max(2, playheadBox.height / 2);
      await page.mouse.move(playheadBox.x + 1, y);
      await page.mouse.down();
      await page.mouse.move(rulerBox.x + (rulerBox.width * 0.65), y, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      report.steps.interactions.playhead_drag = await page.evaluate(() => {
        const lane = document.querySelector('[data-role="ruler-lane"]');
        return Number(lane?.dataset?.playheadSeconds || 0) > 0;
      });
    }

    const markersBox = await page.locator('[data-role="markers-lane"]').first().boundingBox();
    report.steps.interactions.debug.markers_box = markersBox;
    if (markersBox) {
      report.steps.interactions.debug.marker_point_role = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return {
          tag: target?.tagName || '',
          role: target?.dataset?.role || '',
          className: String(target?.className || '')
        };
      }, {
        x: markersBox.x + (markersBox.width * 0.25),
        y: markersBox.y + (markersBox.height * 0.5)
      });
    }
    if (markersBox) {
      await page.mouse.click(markersBox.x + (markersBox.width * 0.25), markersBox.y + (markersBox.height * 0.5));
      await page.waitForTimeout(500);
      report.steps.interactions.marker_create = await page.evaluate(() => (
        document.querySelectorAll('[data-marker-id]').length > 0
      ));
      if (report.steps.interactions.marker_create) {
        await page.evaluate(() => {
          window.prompt = () => 'Probe Marker';
        });
        await page.locator('[data-marker-id]').first().dblclick({ force: true });
        await page.waitForTimeout(500);
        report.steps.interactions.marker_rename = await page.evaluate(() => (
          Array.from(document.querySelectorAll('[data-marker-id] span')).some((node) => node.textContent === 'Probe Marker')
        ));
      }
    }

    report.steps.interactions.loop_create = await dragInBox('[data-role="loop-lane"]', 0.2, 0.55);
    report.steps.interactions.loop_create = report.steps.interactions.loop_create && await page.evaluate(() => (
      !!document.querySelector('[data-role="loop-region"]')
    ));
    if (report.steps.interactions.loop_create) {
      await page.locator('[data-role="loop-region"]').first().click({ force: true });
      await page.waitForTimeout(500);
      report.steps.interactions.loop_toggle = await page.evaluate(() => (
        document.querySelector('[data-role="loop-region"]')?.dataset?.enabled === 'false'
      ));
      await page.locator('[data-role="loop-region"]').first().dblclick({ force: true });
      await page.waitForTimeout(500);
      report.steps.interactions.loop_delete = await page.evaluate(() => (
        !document.querySelector('[data-role="loop-region"]')
      ));
    }

    const clipBefore = await page.locator('[data-clip-id]').first().evaluate((node) => ({
      id: node.dataset.clipId,
      start: Number(node.dataset.startSeconds || 0),
      duration: Number(node.dataset.durationSeconds || 0)
    })).catch(() => null);
    const clipBox = await page.locator('[data-clip-id]').first().boundingBox();
    if (clipBefore && clipBox) {
      await page.mouse.move(clipBox.x + (clipBox.width * 0.5), clipBox.y + (clipBox.height * 0.5));
      await page.mouse.down();
      await page.mouse.move(clipBox.x + (clipBox.width * 0.5) + 90, clipBox.y + (clipBox.height * 0.5), { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      report.steps.interactions.clip_move = await page.locator(`[data-clip-id="${clipBefore.id}"]`).evaluate((node, before) => (
        Number(node.dataset.startSeconds || 0) > before.start
      ), clipBefore).catch(() => false);

      const endHandle = await page.locator(`[data-clip-id="${clipBefore.id}"] [data-edge="end"]`).first().boundingBox();
      if (endHandle) {
        await page.mouse.move(endHandle.x + 2, endHandle.y + (endHandle.height * 0.5));
        await page.mouse.down();
        await page.mouse.move(endHandle.x - 40, endHandle.y + (endHandle.height * 0.5), { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(700);
        report.steps.interactions.clip_trim = await page.locator(`[data-clip-id="${clipBefore.id}"]`).evaluate((node, before) => (
          Number(node.dataset.durationSeconds || 0) < before.duration
        ), clipBefore).catch(() => false);
      }

      const movedBox = await page.locator(`[data-clip-id="${clipBefore.id}"]`).first().boundingBox();
      const newLaneBox = await page.locator('[data-role="new-track-lane"]').first().boundingBox();
      const tracksBefore = await page.locator('[data-track-id]').count();
      if (movedBox && newLaneBox) {
        await page.mouse.move(movedBox.x + (movedBox.width * 0.5), movedBox.y + (movedBox.height * 0.5));
        await page.mouse.down();
        await page.mouse.move(newLaneBox.x + (newLaneBox.width * 0.3), newLaneBox.y + (newLaneBox.height * 0.5), { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(900);
        const tracksAfter = await page.locator('[data-track-id]').count();
        report.steps.interactions.new_track_drop = tracksAfter > tracksBefore;
      }
    }

    report.steps.dom = await page.evaluate(() => {
      const panel = document.querySelector('.eve-molecule-panel');
      const tools = panel
        ? Array.from(panel.querySelectorAll('[data-role="eve_intuitionx-tool"]')).map((node) => node.dataset.key || '')
        : [];
      return {
        has_api: !!window.eveMoleculeTimelineApi,
        active_group_id: String(window.eveMoleculeTimelineApi?.getActiveGroupTimelineId?.() || ''),
        panel_found: !!panel,
        panel_id: panel?.id || '',
        panel_display: panel ? getComputedStyle(panel).display : '',
        timeline_id: panel?.dataset?.timelineId || '',
        tools_status: panel?.dataset?.toolsStatus || '',
        section_order: panel ? Array.from(panel.children).map((child) => child.dataset.section || '') : [],
        has_ruler: !!panel?.querySelector?.('[data-role="ruler-lane"]'),
        has_markers: !!panel?.querySelector?.('[data-role="markers-lane"]'),
        has_loop: !!panel?.querySelector?.('[data-role="loop-lane"]'),
        has_ruler_playhead: !!panel?.querySelector?.('[data-role="ruler-lane"] [data-role="playhead-line"]'),
        has_playhead_row: !!panel?.querySelector?.('[data-role="playhead-lane"]'),
        has_close: !!panel?.querySelector?.('[data-role="molecule-close"]'),
        has_zoom_x: Array.from(panel?.querySelectorAll?.('[data-section="controls"] span') || []).some((node) => node.textContent === 'Zoom X'),
        has_zoom_y: Array.from(panel?.querySelectorAll?.('[data-section="controls"] span') || []).some((node) => node.textContent === 'Zoom Y'),
        has_tempo: Array.from(panel?.querySelectorAll?.('[data-section="controls"] span') || []).some((node) => node.textContent === 'Tempo'),
        has_snap: Array.from(panel?.querySelectorAll?.('[data-section="controls"] span') || []).some((node) => node.textContent === 'Snap'),
        track_count: panel ? panel.querySelectorAll('[data-track-id]').length : 0,
        clip_count: panel ? panel.querySelectorAll('[data-clip-id]').length : 0,
        tools
      };
    });

    report.ok = report.steps.runtime_ready === true
      && report.steps.dom?.panel_found === true
      && report.steps.dom?.panel_display !== 'none'
      && report.steps.dom?.has_ruler === true
      && report.steps.dom?.has_markers === true
      && report.steps.dom?.has_loop === true
      && report.steps.dom?.has_ruler_playhead === true
      && report.steps.dom?.has_playhead_row === false
      && report.steps.dom?.has_close === true
      && report.steps.dom?.has_zoom_x === true
      && report.steps.dom?.has_zoom_y === true
      && report.steps.dom?.has_tempo === true
      && report.steps.dom?.has_snap === true
      && report.steps.dom?.track_count >= 1
      && report.steps.dom?.tools?.length >= 7
      && Object.entries(report.steps.interactions || {})
        .filter(([key]) => key !== 'debug')
        .every(([, value]) => value === true);
  } catch (error) {
    report.fatal = String(error?.stack || error?.message || error);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
};

run();
