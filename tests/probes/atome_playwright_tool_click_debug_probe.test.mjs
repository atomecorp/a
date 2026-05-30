import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ATOME_PLAYWRIGHT_DEBUG_URL || process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001/';
const TOOL_SELECTOR = String(process.env.ATOME_PLAYWRIGHT_TOOL_SELECTOR || '').trim();
const OUT_DIR = path.resolve('temp/probe_reports/atome_playwright_tool_click_debug');
const OUT_FILE = path.join(OUT_DIR, 'report.json');
const RUN_SYNTHETIC_EVENTS = process.env.ATOME_PLAYWRIGHT_RUN_SYNTHETIC_EVENTS === '1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const writeReport = (report) => {
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const safe = async (label, action) => {
  try {
    return { label, ok: true, value: await action() };
  } catch (error) {
    return { label, ok: false, error: String(error?.message || error || 'failed') };
  }
};

const waitFor = async (page, predicate, timeoutMs = 12000, intervalMs = 250) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await page.evaluate(predicate).catch(() => null);
    if (result) return result;
    await page.waitForTimeout(intervalMs);
  }
  return null;
};

const installDebugProbe = async (page) => page.evaluate(() => {
  if (window.__ATOME_PW_DEBUG_INSTALLED__) return true;
  window.__ATOME_PW_DEBUG_INSTALLED__ = true;
  window.__pwDebugEvents = [];
  let clicked = 0;

  const shortNode = (node) => {
    if (!node) return null;
    if (node === window) return 'window';
    if (node === document) return 'document';
    if (node.nodeType !== 1) return String(node.nodeName || node);
    const el = node;
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
      : '';
    const role = el.getAttribute?.('role') ? `[role="${el.getAttribute('role')}"]` : '';
    return `${el.tagName?.toLowerCase?.() || el.nodeName}${id}${cls}${role}`;
  };

  const logEvent = (phase, event) => {
    const x = event.clientX ?? null;
    const y = event.clientY ?? null;
    const top = Number.isFinite(x) && Number.isFinite(y) ? document.elementFromPoint(x, y) : null;
    window.__pwDebugEvents.push({
      phase,
      type: event.type,
      isTrusted: event.isTrusted,
      target: shortNode(event.target),
      currentTarget: shortNode(event.currentTarget),
      topAtPoint: shortNode(top),
      clientX: x,
      clientY: y,
      button: event.button,
      buttons: event.buttons,
      pointerType: event.pointerType,
      defaultPrevented: event.defaultPrevented
    });
  };

  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend']) {
    window.addEventListener(type, (event) => logEvent('window:capture', event), true);
    window.addEventListener(type, (event) => logEvent('window:bubble', event), false);
    document.addEventListener(type, (event) => logEvent('document:capture', event), true);
    document.addEventListener(type, (event) => logEvent('document:bubble', event), false);
  }

  const button = document.createElement('button');
  button.id = 'pw-debug-probe';
  button.type = 'button';
  button.textContent = 'PW DEBUG CLICK';
  button.setAttribute('aria-label', 'Playwright debug probe');
  Object.assign(button.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: '2147483647',
    pointerEvents: 'auto',
    visibility: 'visible',
    display: 'block',
    opacity: '0.97',
    minWidth: '180px',
    minHeight: '48px',
    padding: '12px 16px',
    font: '14px/1.2 monospace',
    background: '#111',
    color: '#fff',
    border: '2px solid #fff',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)',
    cursor: 'pointer'
  });
  button.addEventListener('click', (event) => {
    clicked += 1;
    button.setAttribute('aria-pressed', clicked > 0 ? 'true' : 'false');
    button.textContent = `PW DEBUG CLICK ${clicked}`;
    logEvent('probe:handler', event);
  }, true);
  document.body.appendChild(button);

  window.__pwDebugProbeClicked = () => clicked;
  window.__pwDebugDumpPoint = (x, y) => document.elementsFromPoint(x, y).map((el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      node: shortNode(el),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      position: cs.position,
      transform: cs.transform
    };
  });
  window.__pwDebugDumpElement = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const cs = getComputedStyle(el);
    return {
      node: shortNode(el),
      text: el.innerText || el.textContent || '',
      attrs: { id: el.id, role: el.getAttribute?.('role'), ariaLabel: el.getAttribute?.('aria-label'), tabindex: el.getAttribute?.('tabindex') },
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, centerX, centerY },
      style: { zIndex: cs.zIndex, pointerEvents: cs.pointerEvents, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, position: cs.position, transform: cs.transform },
      topAtCenter: shortNode(document.elementFromPoint(centerX, centerY)),
      stackAtCenter: window.__pwDebugDumpPoint(centerX, centerY)
    };
  };
  return true;
});

const discoverToolSelector = async (page) => {
  if (TOOL_SELECTOR) return { selector: TOOL_SELECTOR, source: 'env' };
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],[aria-label],[id*="tool"],[class*="tool"]'))
      .filter((el) => el.id !== 'pw-debug-probe')
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || el.id || '').trim();
        return {
          id: el.id || '',
          role: el.getAttribute('role') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          text,
          visible: rect.width > 1 && rect.height > 1,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      })
      .filter((entry) => entry.visible);
    const preferred = candidates.find((entry) => /tool|move|select|text|shape|capture|audio|video|intuition|molecule|mtrack/i.test(`${entry.id} ${entry.text} ${entry.ariaLabel}`))
      || candidates[0]
      || null;
    return {
      selector: preferred?.id ? `#${CSS.escape(preferred.id)}` : '',
      source: preferred ? 'discovered' : 'missing',
      preferred,
      candidates: candidates.slice(0, 30)
    };
  });
};

const collectDomSummary = async (page) => page.evaluate(() => ({
  title: document.title,
  url: location.href,
  readyState: document.readyState,
  bodyText: String(document.body?.innerText || '').slice(0, 1000),
  debugReady: !!window.__DEBUG__,
  squirrelReady: !!window.Squirrel,
  atomeToolsReady: !!window.atome?.tools,
  bodyChildren: Array.from(document.body?.children || []).slice(0, 40).map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      text: String(el.innerText || el.textContent || '').trim().slice(0, 160),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
  })
}));

const main = async () => {
  const report = {
    ok: false,
    created_at: new Date().toISOString(),
    url: APP_URL,
    tool_selector: TOOL_SELECTOR || null,
    checks: [],
    console: [],
    errors: []
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: process.env.ATOME_PLAYWRIGHT_HEADLESS !== '0' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    page.on('console', (message) => report.console.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => report.errors.push({ kind: 'pageerror', error: String(error?.message || error || 'pageerror') }));

    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    report.runtime_ready = await waitFor(page, () => {
      if (window.__DEBUG__?.setDeterministicTestMode) window.__DEBUG__.setDeterministicTestMode(true);
      return !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition');
    }, 30000, 250);
    report.checks.push(await safe('install_debug_probe', () => installDebugProbe(page)));
    report.checks.push(await safe('debug_probe_visible', () => page.locator('#pw-debug-probe').isVisible({ timeout: 5000 })));
    report.checks.push(await safe('debug_probe_click', async () => {
      await page.locator('#pw-debug-probe').click({ timeout: 10000 });
      return page.evaluate(() => window.__pwDebugProbeClicked?.() || 0);
    }));

    const target = await discoverToolSelector(page);
    report.target = target;
    if (!target.selector) {
      report.dom_summary = await collectDomSummary(page);
      throw new Error('canonical_tool_selector_missing');
    }

    const tool = page.locator(target.selector).first();
    report.checks.push(await safe('tool_attached', () => tool.count()));
    report.tool_dump_before = await safe('tool_dump_before', () => tool.evaluate((el) => window.__pwDebugDumpElement?.(el) || null));
    const boxResult = await safe('tool_bounding_box', () => tool.boundingBox());
    report.checks.push(boxResult);
    const box = boxResult.value;

    report.click_methods = [];
    report.click_methods.push(await safe('locator_click', () => tool.click({ timeout: 5000 })));
    report.click_methods.push(await safe('force_locator_click', () => tool.click({ force: true, timeout: 5000 })));
    if (box) {
      report.click_methods.push(await safe('coordinate_click', async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        return true;
      }));
    }
    if (RUN_SYNTHETIC_EVENTS) {
      report.click_methods.push(await safe('dispatch_click', () => tool.dispatchEvent('click', { bubbles: true, cancelable: true, composed: true })));
      report.click_methods.push(await safe('synthetic_pointer_mouse_sequence', async () => {
        await tool.dispatchEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'mouse', button: 0, buttons: 1 });
        await tool.dispatchEvent('mousedown', { bubbles: true, composed: true, button: 0, buttons: 1 });
        await tool.dispatchEvent('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', button: 0, buttons: 0 });
        await tool.dispatchEvent('mouseup', { bubbles: true, composed: true, button: 0, buttons: 0 });
        await tool.dispatchEvent('click', { bubbles: true, composed: true, button: 0 });
        return true;
      }));
    }
    report.events_tail = await page.evaluate(() => window.__pwDebugEvents?.slice(-100) || []);
    report.tool_dump_after = await safe('tool_dump_after', () => tool.evaluate((el) => window.__pwDebugDumpElement?.(el) || null));
    report.ok = report.checks.find((check) => check.label === 'debug_probe_click')?.value > 0
      && report.click_methods.some((entry) => ['locator_click', 'coordinate_click'].includes(entry.label) && entry.ok)
      && report.errors.length === 0;
  } catch (error) {
    report.errors.push({ kind: 'fatal', error: String(error?.message || error || 'probe_failed') });
  } finally {
    if (browser) await browser.close();
    writeReport(report);
  }

  if (!report.ok) {
    console.error(`Atome Playwright tool click debug failed. Report: ${OUT_FILE}`);
    process.exit(1);
  }
  console.log(`Atome Playwright tool click debug passed. Report: ${OUT_FILE}`);
};

await main();
