import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'finder_intuitionx_diag.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const evalSafe = async (page, fn, arg = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
};

const login = async (page) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.AdoleAPI, null, { timeout: 15000 });
  await evalSafe(page, async (creds) => {
    const api = window.AdoleAPI;
    try {
      const out = await api.auth.login(creds.phone, creds.password, creds.phone);
      if (out?.fastify?.success || out?.tauri?.success) return { ok: true };
    } catch {}
    try {
      const out = await api.auth.create(creds.phone, creds.password, creds.phone, { autoLogin: true });
      return {
        ok: !!(out?.fastify?.success || out?.tauri?.success || out?.login?.fastify?.success || out?.login?.tauri?.success)
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { phone, password });
  await sleep(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__authCheckComplete === true, null, { timeout: 15000 });
  await sleep(1800);
};

const readFinderState = async (page, label) => evalSafe(page, ({ label }) => {
  const describe = (node) => {
    if (!(node instanceof HTMLElement)) return null;
    const rect = node.getBoundingClientRect();
    const surface = node.querySelector?.('[data-role="tool-surface"]');
    const input = node.querySelector?.('.eve-finder-inline-input');
    const surfaceRect = surface instanceof HTMLElement ? surface.getBoundingClientRect() : null;
    const inputRect = input instanceof HTMLElement ? input.getBoundingClientRect() : null;
    const style = getComputedStyle(node);
    const inputStyle = input instanceof HTMLElement ? getComputedStyle(input) : null;
    return {
      id: node.id || null,
      role: node.getAttribute('role') || null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      inlineSearchOpen: node.dataset?.inlineSearchOpen || null,
      externalOpenWidthPx: node.dataset?.externalOpenWidthPx || null,
      cssExternalOpen: style.getPropertyValue('--tool-external-open') || null,
      styleWidth: style.width || null,
      surfaceWidth: surfaceRect ? Math.round(surfaceRect.width) : null,
      inputDisplay: inputStyle?.display || null,
      inputVisibility: inputStyle?.visibility || null,
      inputWidth: inputRect ? Math.round(inputRect.width) : null,
      inputText: input instanceof HTMLElement ? String(input.textContent || '') : null
    };
  };
  const v2 = document.getElementById('_intuition_v2_find');
  const legacy = document.getElementById('_intuition_find');
  const activeEl = window.__eveFinderUiRuntime?.isInlineOpen?.() ? (window.__eveFinderUiRuntime && (window.__eveFinderUiRuntime.__activeEl || null)) : null;
  const allCandidates = Array.from(document.querySelectorAll('[data-name-key="find"]')).map((node) => ({
    id: node.id || null,
    role: node.getAttribute('role') || null,
    visible: !!node.getClientRects().length,
    width: Math.round(node.getBoundingClientRect().width || 0)
  }));
  return {
    label,
    inlineOpen: window.__eveFinderUiRuntime?.isInlineOpen?.() === true,
    v2: describe(v2),
    legacy: describe(legacy),
    candidates: allCandidates,
    activeElId: activeEl?.id || null
  };
}, { label });

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  const page = await context.newPage();
  const report = { created_at: new Date().toISOString(), url, ok: false, before: null, afterClick: null, errors: [] };
  try {
    await login(page);
    await page.waitForSelector('#_intuition_v2_find', { timeout: 15000 });
    report.before = await readFinderState(page, 'before');
    await page.click('#_intuition_v2_find');
    await sleep(700);
    report.afterClick = await readFinderState(page, 'afterClick');
    report.ok = true;
  } catch (error) {
    report.errors.push(String(error?.message || error));
  }
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: report.ok, outFile, errors: report.errors, before: report.before, afterClick: report.afterClick }, null, 2));
  await browser.close();
};

await run();
