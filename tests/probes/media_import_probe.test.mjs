import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
const outDir = path.resolve('temp/probe_reports/media_import_probe');
const mediaPaths = [
  path.join(mediaDir, '0000.png'),
  path.join(mediaDir, 'atome.svg'),
  path.join(mediaDir, "Jeezs's fire.m4v"),
  path.join(mediaDir, 'test.m4a')
];

fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'run.log');
const redactSecrets = (text) => String(text || '')
  .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const log = (message, details = null) => {
  const line = redactSecrets(`[${new Date().toISOString()}] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
  fs.appendFileSync(logFile, `${line}\n`);
  console.log(line);
};

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(outDir, name), redactSecrets(JSON.stringify(value, null, 2)));
};

const withTimeout = async (promise, timeoutMs, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs))
]);

const suiteSucceeded = (suite) => {
  const counts = suite?.counts || {};
  return Number(counts.ok || 0) > 0
    && Number(counts.warning || 0) === 0
    && Number(counts.error || 0) === 0
    && Number(counts.missing || 0) === 0;
};

const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
  try {
    return await withTimeout(page.evaluate(fn, arg), timeoutMs, 'page_eval');
  } catch (error) {
    return { ok: false, error: error?.message || String(error || 'eval_failed') };
  }
};

const waitFor = async (page, predicate, timeoutMs = 15000, intervalMs = 250, arg = null) => {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await safeEval(page, predicate, arg, Math.min(2000, intervalMs + 500));
    if (last === true || last?.ok === true) return { ok: true, last };
    await page.waitForTimeout(intervalMs);
  }
  return { ok: false, last };
};

const tryLogin = async (page) => {
  const apiResult = await safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'AdoleAPI.auth.login unavailable' };
    try {
      const res = await api.auth.login(loginPhone, loginPassword, loginPhone);
      const ok = !!(res?.fastify?.success || res?.tauri?.success);
      if (ok) return { ok: true, method: 'login', result: res };
      return { ok: false, error: res?.fastify?.error || res?.tauri?.error || res?.error || 'login_failed', result: res };
    } catch (error) {
      return { ok: false, error: error?.message || String(error || 'login_error') };
    }
  }, { phone, password }, 12000);

  if (apiResult?.ok) return apiResult;

  return safeEval(page, async ({ phone: loginPhone, password: loginPassword, priorLogin }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.create) return { ok: false, error: 'AdoleAPI.auth.create unavailable' };
    try {
      const res = await api.auth.create(loginPhone, loginPassword, loginPhone, { autoLogin: true });
      const ok = !!(res?.fastify?.success || res?.tauri?.success || res?.login?.fastify?.success || res?.login?.tauri?.success);
      return { ok, method: 'create', result: res, prior_login: priorLogin };
    } catch (error) {
      return { ok: false, error: error?.message || String(error || 'create_error'), prior_login: priorLogin };
    }
  }, { phone, password, priorLogin: apiResult }, 18000);
};

const run = async () => {
  fs.writeFileSync(logFile, '');
  for (const file of mediaPaths) {
    if (!fs.existsSync(file)) throw new Error(`missing test media: ${file}`);
  }

  log('start', { url, mediaDir, files: mediaPaths.map((file) => path.basename(file)) });
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 760 }
  });
  await context.addInitScript(() => {
    window.__CHECK_DEBUG__ = true;
    window.__EVE_MEDIA_DIAG_HEADLESS__ = true;
    window.__EVE_MTRAX_BRIDGE_LOGS__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
  });
  const page = await context.newPage();
  const consoleCounts = new Map();

  page.on('console', (msg) => {
    const text = msg.text();
    const key = `${msg.type()}:${redactSecrets(text)}`;
    const next = (consoleCounts.get(key) || 0) + 1;
    consoleCounts.set(key, next);
    if (next <= 5) log('console', { type: msg.type(), text: redactSecrets(text) });
  });
  page.on('pageerror', (error) => log('pageerror', { message: error.message }));
  page.on('requestfailed', (request) => log('requestfailed', { url: request.url(), error: request.failure()?.errorText || null }));
  page.on('response', (response) => {
    if (response.status() >= 400) log('http_error', { status: response.status(), url: response.url() });
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.screenshot({ path: path.join(outDir, '01_loaded.png'), fullPage: true });

  const apiReady = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 25000);
  log('api_ready', apiReady);
  if (!apiReady.ok) throw new Error('app_api_not_ready');

  const login = await tryLogin(page);
  writeJson('login.json', login);
  log('login', { ok: login?.ok, method: login?.method, error: login?.error || null });
  if (!login?.ok) throw new Error(`login_failed: ${login?.error || 'unknown'}`);

  await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
  await waitFor(page, () => window.__authCheckComplete === true, 20000);
  await page.screenshot({ path: path.join(outDir, '02_after_login.png'), fullPage: true });

  const bootstrap = await safeEval(page, async () => {
    if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
      await import('/eVe/intuition/tools/project_drop.js');
    }
    if (!window.eveMediaDiagnostics?.runFullSuite) {
      const mod = await import('/eVe/domains/media/media_diagnostics.js');
      window.eveMediaDiagnostics = mod.createMediaDiagnosticsRuntime();
    }
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id
      || projectEl?.id?.replace(/^project_view_/, '')
      || null;
    return {
      ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && window.eveMediaDiagnostics?.runFullSuite && projectId),
      has_drop_api: !!window.eveProjectDropApi?.importFilesToProjectViaCreator,
      has_media_diag: !!window.eveMediaDiagnostics?.runFullSuite,
      project_id: projectId,
      project_el_id: projectEl?.id || null
    };
  }, null, 25000);
  writeJson('bootstrap.json', bootstrap);
  log('bootstrap', bootstrap);
  if (!bootstrap?.ok) throw new Error(`bootstrap_failed: ${bootstrap?.error || JSON.stringify(bootstrap)}`);

  await page.evaluate(() => {
    const oldInput = document.getElementById('headless_media_import_input');
    if (oldInput) oldInput.remove();
    const input = document.createElement('input');
    input.id = 'headless_media_import_input';
    input.type = 'file';
    input.multiple = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#headless_media_import_input', mediaPaths);

  const importResult = await safeEval(page, async () => {
    const input = document.getElementById('headless_media_import_input');
    const entries = Array.from(input?.files || []);
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id
      || projectEl?.id?.replace(/^project_view_/, '')
      || null;
    if (!entries.length) return { ok: false, error: 'no_files_selected' };
    if (!projectId || !projectEl) return { ok: false, error: 'project_missing', projectId, hasProjectEl: !!projectEl };
    const rect = projectEl.getBoundingClientRect();
    const event = {
      clientX: rect.left + Math.min(240, Math.max(40, rect.width / 3)),
      clientY: rect.top + Math.min(180, Math.max(40, rect.height / 3))
    };
    return window.eveProjectDropApi.importFilesToProjectViaCreator({
      entries,
      event,
      projectId,
      projectEl,
      origin: 'headless_media_import_probe',
      sourceLayer: 'headless_media_import_probe',
      actorType: 'headless_probe'
    });
  }, null, 150000);
  writeJson('import_result.json', importResult);
  log('import_result', {
    ok: importResult?.ok,
    created: importResult?.created,
    results: Array.isArray(importResult?.results) ? importResult.results : null,
    error: importResult?.error || null
  });

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '03_after_import.png'), fullPage: true });

  const importedIds = Array.isArray(importResult?.results)
    ? importResult.results.map((entry) => entry?.atomeId).filter(Boolean)
    : [];
  const domReady = await waitFor(page, (ids) => {
    if (!Array.isArray(ids) || !ids.length) return { ok: false, error: 'no_imported_ids' };
    const projectId = window.__currentProject?.id
      || document.querySelector('[id^="project_view_"]')?.id?.replace(/^project_view_/, '')
      || '';
    const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const missing = ids.filter((id) => !records.some((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === String(id)));
    return { ok: missing.length === 0, missing };
  }, 30000, 500, importedIds);
  writeJson('dom_ready.json', domReady);
  log('dom_ready', domReady);

  const scan = await safeEval(page, async (atomeIds) => window.eveMediaDiagnostics.scan({ atome_ids: atomeIds }), importedIds, 30000);
  writeJson('scan.json', scan);
  log('scan_counts', {
    inventory: Array.isArray(scan?.inventory) ? scan.inventory.length : null,
    expected: Array.isArray(scan?.expected) ? scan.expected.map((entry) => ({ key: entry.key, found: entry.found, atome_id: entry.atome_id, media_tag: scan.inventory?.find((item) => item.id === entry.atome_id)?.media_tag || null })) : null
  });

  const suite = await safeEval(page, async (atomeIds) => window.eveMediaDiagnostics.runFullSuite({ atome_ids: atomeIds }), importedIds, 180000);
  writeJson('suite.json', suite);
  log('suite_counts', suite?.counts || { ok: false, error: suite?.error || null });
  if (!suiteSucceeded(suite)) {
    throw new Error(`media_suite_failed:${suite?.error || JSON.stringify(suite?.counts || {})}`);
  }
  await page.screenshot({ path: path.join(outDir, '04_after_suite.png'), fullPage: true });

  const state = await safeEval(page, async () => ({
    debug_state: window.__DEBUG__?.getAppState?.() || null,
    mtrack_state: window.eveMtrackApi?.getState?.() || null,
    media_diag_state: window.eveMediaDiagnostics?.getState?.() || null
  }), null, 30000);
  writeJson('final_state.json', state);
  writeJson('console_counts.json', Object.fromEntries(consoleCounts.entries()));

  await withTimeout(browser.close(), 8000, 'browser_close').catch((error) => {
    log('browser_close_warning', { message: error?.message || String(error || 'browser_close_failed') });
  });
  log('done');
};

run().then(() => {
  process.exit(0);
}).catch((error) => {
  log('fatal', { message: error?.message || String(error || 'fatal') });
  process.exit(1);
});
