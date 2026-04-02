import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'ui_block_probe_auth.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const evalSafe = async (page, fn, arg = null) => {
  try { return await page.evaluate(fn, arg); } catch (error) { return { ok: false, error: String(error?.message || error) }; }
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
      return { ok: !!(out?.fastify?.success || out?.tauri?.success || out?.login?.fastify?.success || out?.login?.tauri?.success) };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { phone, password });
  await sleep(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__authCheckComplete === true, null, { timeout: 15000 });
  await sleep(1500);
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1500, height: 940 } });
  const report = { created_at: new Date().toISOString(), url, ok: false, snapshot: null, errors: [] };
  try {
    await login(page);
    report.snapshot = await evalSafe(page, () => {
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
      const styleOf = (node) => node ? getComputedStyle(node) : null;
      const targetStyle = styleOf(target);
      const topStyle = styleOf(top);
      return {
        currentId,
        authComplete: window.__authCheckComplete === true,
        target: target ? {
          id: target.id || null,
          atomeId: target.dataset?.atomeId || null,
          role: target.dataset?.atomeRole || null,
          kind: target.dataset?.atomeKind || null,
          pointerEvents: targetStyle?.pointerEvents || null,
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
        project: project ? {
          id: project.id,
          pointerEvents: styleOf(project)?.pointerEvents || null,
          display: styleOf(project)?.display || null
        } : null,
        selectedIds: Array.isArray(window.__selectedAtomeIds) ? window.__selectedAtomeIds.slice() : [],
        menuRect: document.querySelector('#eve_intuitionx_main_ribbon, [role=\"eve_intuitionx-main-ribbon\"]')?.getBoundingClientRect?.()?.toJSON?.() || null
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
