import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_panel_tools_probe.json');
const shotFile = path.join(outDir, 'mtrack_panel_tools_probe.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 150) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (_) {}
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    return {
      ...(fallback && typeof fallback === 'object' ? fallback : {}),
      __eval_error: String(error?.message || error || 'eval_failed')
    };
  }
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
const page = await context.newPage();

const report = {
  created_at: new Date().toISOString(),
  url,
  ok: false
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(1200);

  await safeEval(page, async (creds) => {
    if (!window.AdoleAPI?.auth?.login) return false;
    try {
      await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
      return true;
    } catch (_) {
      return false;
    }
  }, { phone, password }, false);

  await sleep(900);
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
  await sleep(2400);

  const runtimeReady = await waitFor(
    page,
    () => !!(window.atome?.tools?.v2Runtime && window.eveMtrackApi),
    30000
  );
  report.runtime_ready = runtimeReady;
  if (!runtimeReady) throw new Error('runtime_not_ready');

  const target = await safeEval(page, async () => {
    const existing = Array.from(document.querySelectorAll('[data-atome-id]')).find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const kind = String(node.dataset?.atomeKind || '').trim().toLowerCase();
      if (!kind || kind === 'group' || kind === 'mtrack' || kind === 'tool_shortcut') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
    });
    if (existing instanceof HTMLElement) return String(existing.dataset.atomeId || '').trim();
    const runtime = window.atome?.tools?.v2Runtime || null;
    if (!runtime?.invokeById) return '';
    const created = await runtime.invokeById({
      tool_id: 'ui.circle',
      event: 'touch',
      action: 'pointer.click',
      input: { x: 360, y: 280, radius: 44, fill: '#ff6b3d' },
      presentation: 'ui',
      source: { type: 'headless_probe', layer: 'mtrack_panel_tools_probe' }
    });
    return String(
      created?.result?.result?.atome_id
      || created?.result?.atome_id
      || created?.atome_id
      || ''
    ).trim();
  }, null, '');
  report.target_atome_id = target;
  if (!target) throw new Error('target_missing');

  await safeEval(page, async (atomeId) => {
    const runtime = window.atome?.tools?.v2Runtime || null;
    if (!runtime?.invokeById) return null;
    return runtime.invokeById({
      tool_id: 'ui.mtrax.open',
      event: 'touch',
      action: 'pointer.click',
      input: {
        action: 'open',
        toggle: false,
        atome_id: atomeId,
        target_id: atomeId,
        selection_ids: [atomeId],
        footer_coupled: false
      },
      presentation: 'ui',
      source: { type: 'headless_probe', layer: 'mtrack_panel_tools_probe' }
    });
  }, target, null);

  const panelReady = await waitFor(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    if (!panel) return false;
    const style = window.getComputedStyle(panel);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }, 15000);
  report.panel_ready = panelReady;
  if (!panelReady) throw new Error('panel_not_visible');

  await sleep(800);

  report.snapshot = await safeEval(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    const header = document.getElementById('eve_mtrack_dialog__header');
    const title = document.getElementById('eve_mtrack_dialog__title');
    const close = document.getElementById('eve_mtrack_dialog__close');
    const toolsShell = panel?.querySelector?.('.eve-mtrack-tools-shell') || null;
    const toolsRow = panel?.querySelector?.('.eve-mtrack-tools-row') || null;
    const customHost = panel?.querySelector?.('.eve-mtrack-tools-custom-host') || null;
    const describe = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        class_name: node.className || '',
        text: (node.textContent || '').trim(),
        style_attr: node.getAttribute('style') || '',
        child_count: node.children.length,
        computed: {
          display: style.display,
          position: style.position,
          flex_direction: style.flexDirection,
          justify_content: style.justifyContent,
          align_items: style.alignItems,
          text_align: style.textAlign,
          min_height: style.minHeight,
          width: style.width,
          max_width: style.maxWidth,
          padding_top: style.paddingTop,
          padding_bottom: style.paddingBottom,
          padding_left: style.paddingLeft,
          padding_right: style.paddingRight
        },
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    };
    return {
      panel: describe(panel),
      header: describe(header),
      title: describe(title),
      close: describe(close),
      tools_shell: describe(toolsShell),
      tools_row: describe(toolsRow),
      custom_host: describe(customHost),
      tools_row_html: toolsRow?.innerHTML || '',
      custom_host_html: customHost?.innerHTML || '',
      tools_row_children: Array.from(toolsRow?.children || []).map(describe),
      custom_host_children: Array.from(customHost?.children || []).map(describe)
    };
  }, null, null);

  await page.screenshot({ path: shotFile, fullPage: true });
  report.ok = true;
} catch (error) {
  report.error = String(error?.message || error);
} finally {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
