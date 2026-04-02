import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'ui_block_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const report = { created_at: new Date().toISOString(), url, ok: false, snapshot: null, errors: [] };
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1365, height: 900 });
    await sleep(1800);
    report.snapshot = await page.evaluate(() => {
      const currentId = String(window?.eveToolBase?.getCurrentProjectId?.() || window?.__currentProject?.id || '').trim() || null;
      const project = currentId ? document.getElementById(`project_view_${currentId}`) : document.querySelector('[id^="project_view_"]');
      const allAtomes = Array.from(document.querySelectorAll('[id^="project_view_"] [data-atome-id], [data-atome-id]'));
      const target = allAtomes.find((node) => {
        if (!node || !node.dataset) return false;
        const role = String(node.dataset.atomeRole || '').trim().toLowerCase();
        const kind = String(node.dataset.atomeKind || '').trim().toLowerCase();
        if (node.dataset.toolShortcut === 'true') return false;
        if (role === 'tool_shortcut' || role === 'system_root') return false;
        if (kind === 'tool' || kind === 'toolbox' || kind === 'tool_block') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8;
      }) || null;
      const rect = target?.getBoundingClientRect?.() || null;
      const x = rect ? Math.round(rect.left + Math.min(rect.width / 2, 20)) : null;
      const y = rect ? Math.round(rect.top + Math.min(rect.height / 2, 20)) : null;
      const top = Number.isFinite(x) && Number.isFinite(y) ? document.elementFromPoint(x, y) : null;
      const topStyle = top ? getComputedStyle(top) : null;
      const projectStyle = project ? getComputedStyle(project) : null;
      const intuition = document.getElementById('intuition');
      const toolLayer = document.getElementById('intuition_tool_layer');
      const panelLayer = document.getElementById('intuition_panel_layer');
      const menu = document.querySelector('#eve_intuitionx_main_ribbon, [role="eve_intuitionx-main-ribbon"]');
      const topChain = [];
      let cursor = top;
      let depth = 0;
      while (cursor && depth < 6) {
        topChain.push({
          tag: cursor.tagName || null,
          id: cursor.id || null,
          role: cursor.dataset?.role || null,
          atomeId: cursor.dataset?.atomeId || null,
          pointerEvents: getComputedStyle(cursor).pointerEvents
        });
        cursor = cursor.parentElement;
        depth += 1;
      }
      return {
        currentId,
        project: project ? {
          id: project.id,
          pointerEvents: projectStyle?.pointerEvents || null,
          display: projectStyle?.display || null,
          touchAction: projectStyle?.touchAction || null
        } : null,
        target: target ? {
          tag: target.tagName || null,
          id: target.id || null,
          atomeId: target.dataset?.atomeId || null,
          role: target.dataset?.atomeRole || null,
          kind: target.dataset?.atomeKind || null,
          x,
          y
        } : null,
        topAtPoint: top ? {
          tag: top.tagName || null,
          id: top.id || null,
          role: top.dataset?.role || null,
          atomeId: top.dataset?.atomeId || null,
          pointerEvents: topStyle?.pointerEvents || null,
          display: topStyle?.display || null
        } : null,
        topChain,
        intuition: intuition ? {
          pointerEvents: getComputedStyle(intuition).pointerEvents,
          zIndex: getComputedStyle(intuition).zIndex
        } : null,
        toolLayer: toolLayer ? {
          pointerEvents: getComputedStyle(toolLayer).pointerEvents,
          zIndex: getComputedStyle(toolLayer).zIndex
        } : null,
        panelLayer: panelLayer ? {
          pointerEvents: getComputedStyle(panelLayer).pointerEvents,
          zIndex: getComputedStyle(panelLayer).zIndex
        } : null,
        menu: menu ? {
          pointerEvents: getComputedStyle(menu).pointerEvents,
          rect: menu.getBoundingClientRect().toJSON()
        } : null
      };
    });
    report.ok = true;
  } catch (error) {
    report.errors.push(String(error?.message || error));
  }
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: report.ok, outFile, errors: report.errors, snapshot: report.snapshot }, null, 2));
  await browser.close();
};

await run();
