import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'projection_toolbox_right_overflow_probe.json');

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 80, arg = null) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate, arg)) return true;
    } catch (_) {}
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const run = async () => {
  const report = { ok: false, samples: [], errors: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 640, height: 860 } });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const ready = await waitFor(page, async () => {
      try {
        const mod = await import('/application/eVe/intuition/tools/project_drop.js');
        const stateMod = await import('/application/eVe/intuition/core/state.js');
        return !!mod?.rebalanceProjectionDynamicToolboxes && !!stateMod?.setHandedness;
      } catch (_) {
        return false;
      }
    }, 30000);
    if (!ready) throw new Error('runtime_not_ready');

    const setup = await page.evaluate(async () => {
      const dropMod = await import('/application/eVe/intuition/tools/project_drop.js');
      const stateMod = await import('/application/eVe/intuition/core/state.js');
      stateMod.setHandedness('right', { source: 'probe' });
      const root = document.getElementById('intuition_tool_layer') || document.body;
      const probeProjectId = `probe_project_right_overflow_${Date.now()}`;
      for (let i = 0; i < 5; i += 1) {
        const host = document.createElement('div');
        host.dataset.toolShortcut = 'true';
        host.dataset.atomeId = `id_${Date.now()}_${i}`;
        host.dataset.projectId = probeProjectId;
        host.dataset.project_id = probeProjectId;
        host.style.position = 'absolute';
        host.style.left = `${120 + (58 * i)}px`;
        host.style.top = '180px';
        host.style.width = '52px';
        host.style.height = '52px';
        const button = document.createElement('button');
        button.dataset.eveToolProjection = 'true';
        button.dataset.eveToolFactory = 'intuitionx';
        button.style.width = '52px';
        button.style.height = '52px';
        const surface = document.createElement('div');
        surface.style.width = '52px';
        surface.style.height = '52px';
        surface.style.background = 'rgba(52,58,69,.98)';
        button.appendChild(surface);
        host.appendChild(button);
        root.appendChild(host);
      }
      dropMod.rebalanceProjectionDynamicToolboxes({ projectId: probeProjectId });
      return { projectId: probeProjectId };
    });

    const selector = `[data-eve-projection-toolbox="true"][data-project-id="${setup.projectId}"]`;
    await waitFor(page, (sel) => !!document.querySelector(sel), 12000, 80, selector);
    const handleSelector = `${selector} > .eve-intuitionx-projection-group-handle`;
    const box = await page.locator(handleSelector).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.move(638, box.y + box.height / 2 + 80, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const sample = async (label) => {
      const data = await page.evaluate((sel) => {
        const container = document.querySelector(sel);
        const cap = container?.querySelector(':scope > .eve-intuitionx-projection-group-cap');
        const rect = container?.getBoundingClientRect();
        const capRect = cap?.getBoundingClientRect();
        return {
          label: null,
          collapsed: container?.dataset?.collapsed === 'true',
          docked: container?.dataset?.screenDockedEdge || '',
          left: rect?.left ?? null,
          right: rect?.right ?? null,
          width: rect?.width ?? null,
          rightGap: rect ? Math.round(window.innerWidth - rect.right) : null,
          capDisplay: cap ? getComputedStyle(cap).display : null,
          capLeft: capRect?.left ?? null,
          capRight: capRect?.right ?? null
        };
      }, selector);
      data.label = label;
      report.samples.push(data);
    };

    await sample('after_dock');
    await page.click(handleSelector);
    await page.waitForTimeout(32);
    await sample('after_open_32ms');
    await page.waitForTimeout(120);
    await sample('after_open_152ms');
    await page.waitForTimeout(300);
    await sample('after_open_452ms');

    report.ok = true;
  } catch (error) {
    report.errors.push(String(error?.message || error));
  } finally {
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  console.log(JSON.stringify({ ok: report.ok, out_file: outFile, samples: report.samples, errors: report.errors }, null, 2));
};

await run();
