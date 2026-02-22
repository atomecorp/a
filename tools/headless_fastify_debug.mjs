import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const forceTauri = process.env.ADOLE_FORCE_TAURI === '1';
const clearStorage = process.env.ADOLE_CLEAR_STORAGE === '1';
const lightSnapshot = process.env.ADOLE_LIGHT_SNAPSHOT !== '0';
const switchToTauriOnRefresh = process.env.ADOLE_SWITCH_TAURI_ON_REFRESH === '1';
const forceDataTauri = process.env.ADOLE_FORCE_DATA_TAURI === '1';
const probeMtrackOpen = process.env.ADOLE_PROBE_MTRACK_OPEN === '1';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });

const logFile = path.join(outDir, 'run.log');
const log = (msg, obj) => {
  const line = `[${new Date().toISOString()}] ${msg}${obj ? ' ' + JSON.stringify(obj) : ''}`;
  fs.appendFileSync(logFile, line + '\n');
  console.log(line);
};

const safeEval = async (page, fn, arg = null, fallback = null, timeoutMs = 8000) => {
  try {
    const result = await Promise.race([
      page.evaluate(fn, arg),
      new Promise((_, reject) => setTimeout(() => reject(new Error('eval_timeout')), timeoutMs))
    ]);
    return result;
  } catch (e) {
    return fallback;
  }
};

const waitFor = async (page, predicate, timeoutMs = 15000, intervalMs = 300) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch {
      // ignore
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const getAuthSnapshot = async (page, label) => {
  const snapshot = await safeEval(page, async (light) => {
    const api = window.AdoleAPI || null;
    const authCheck = {
      complete: window.__authCheckComplete ?? null,
      result: window.__authCheckResult ?? null
    };
    const currentInfo = api?.auth?.getCurrentInfo ? api.auth.getCurrentInfo() : null;
    let currentUser = null;
    let projectList = null;
    if (!light) {
      try {
        if (api?.auth?.current) {
          const res = await api.auth.current();
          currentUser = res?.user || null;
        }
      } catch {
        currentUser = null;
      }
      try {
        if (api?.projects?.list) {
          const res = await api.projects.list();
          projectList = {
            tauriCount: Array.isArray(res?.tauri?.projects) ? res.tauri.projects.length : null,
            fastifyCount: Array.isArray(res?.fastify?.projects) ? res.fastify.projects.length : null
          };
        }
      } catch {
        projectList = null;
      }
    }
    const tokens = {
      cloud_auth_token: localStorage.getItem('cloud_auth_token'),
      local_auth_token: localStorage.getItem('local_auth_token'),
      auth_token: localStorage.getItem('auth_token'),
      fastify_login_cache_v1: localStorage.getItem('fastify_login_cache_v1'),
      tauri_user_session_v1: localStorage.getItem('tauri_user_session_v1')
    };
    const anon = api?.security?.isAnonymous ? api.security.isAnonymous() : null;
    return {
      authCheck,
      currentInfo,
      currentUser,
      projectList,
      tokens,
      anon,
      currentUserWindow: window.__currentUser || null
    };
  }, lightSnapshot, null);

  log(`snapshot:${label}`, snapshot);
  fs.writeFileSync(path.join(outDir, `snapshot_${label}.json`), JSON.stringify(snapshot, null, 2));
  return snapshot;
};

const tryLogin = async (page) => {
  const inputs = await page.$$eval('input', (els) => els.map(el => ({
    id: el.id,
    name: el.name,
    type: el.type,
    placeholder: el.placeholder,
    value: el.value
  })));
  fs.writeFileSync(path.join(outDir, 'inputs.json'), JSON.stringify(inputs, null, 2));

  const phoneInput = await page.locator('input').filter({ hasText: '' }).first();
  const phoneLocator = page.locator('input[placeholder*="phone" i], input[name*="phone" i], input[id*="phone" i], input[type="tel"]').first();
  const passwordLocator = page.locator('input[placeholder*="password" i], input[name*="password" i], input[id*="password" i], input[type="password"]').first();

  const hasPhone = await phoneLocator.count();
  const hasPassword = await passwordLocator.count();

  if (hasPhone > 0 || hasPassword > 0) {
    if (hasPhone > 0) {
      await phoneLocator.fill(phone);
    } else {
      await phoneInput.fill(phone);
    }

    if (hasPassword > 0) {
      await passwordLocator.fill(password);
    }

    const loginButton = page.getByRole('button', { name: /login|log in|connexion|se connecter|sign in/i }).first();
    const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
    if (await loginButton.count()) {
      await loginButton.click();
    } else if (await submitButton.count()) {
      await submitButton.click();
    } else {
      await page.keyboard.press('Enter');
    }
    return { method: 'ui', used: true };
  }

  const apiResult = await safeEval(page, async (creds) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'AdoleAPI.auth.login not available' };
    try {
      const res = await api.auth.login(creds.phone, creds.password, creds.phone);
      const ok = !!(res?.fastify?.success || res?.tauri?.success);
      if (ok) return { ok: true, result: res };
      const err = res?.fastify?.error || res?.tauri?.error || res?.error || 'login_failed';
      return { ok: false, error: err, result: res };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }, { phone, password }, { ok: false, error: 'login_eval_failed' });

  if (!apiResult?.ok) {
    const createResult = await safeEval(page, async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.create) return { ok: false, error: 'AdoleAPI.auth.create not available' };
      try {
        const res = await api.auth.create(creds.phone, creds.password, creds.phone, { autoLogin: true });
        const ok = !!(res?.fastify?.success || res?.tauri?.success || res?.login?.fastify?.success || res?.login?.tauri?.success);
        return { ok, result: res };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }, { phone, password }, { ok: false, error: 'create_eval_failed' });
    return { method: 'api', used: true, login: apiResult, create: createResult };
  }

  return { method: 'api', used: true, login: apiResult };
};

const run = async () => {
  fs.writeFileSync(logFile, '');
  log('start', { url });

  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || null;
  const executablePath = explicitPath && fs.existsSync(explicitPath) ? explicitPath : undefined;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  const context = await browser.newContext();
  if (forceTauri) {
    await context.addInitScript(() => {
      window.__TAURI__ = window.__TAURI__ || {};
      window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
      window.__SQUIRREL_FORCE_TAURI__ = true;
      window.__SQUIRREL_AUTH_SOURCE__ = 'tauri';
    });
  }
  if (forceDataTauri) {
    await context.addInitScript(() => {
      window.__SQUIRREL_DATA_SOURCE__ = 'tauri';
    });
  }
  if (probeMtrackOpen) {
    await context.addInitScript(() => {
      window.__EVE_MTRAX_BRIDGE_LOGS__ = true;
      window.__EVE_PANEL_OPEN_DEBUG__ = true;
      window.__EVE_PROBE_EVENTS__ = [];
      const push = (name, detail) => {
        try {
          const list = Array.isArray(window.__EVE_PROBE_EVENTS__) ? window.__EVE_PROBE_EVENTS__ : [];
          list.push({ name, detail: detail || null, at: Date.now() });
          window.__EVE_PROBE_EVENTS__ = list.slice(-120);
        } catch (_) {}
      };
      window.addEventListener('eve:tool-state-changed', (event) => push('eve:tool-state-changed', event?.detail || null));
      window.addEventListener('eve:mtrack-panel-closed', (event) => push('eve:mtrack-panel-closed', event?.detail || null));
      window.addEventListener('eve:group-open-request', (event) => push('eve:group-open-request', event?.detail || null));
    });
  }
  const page = await context.newPage();

  page.on('console', msg => log('console', { type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => log('pageerror', { message: err.message }));
  page.on('requestfailed', req => log('requestfailed', { url: req.url(), error: req.failure()?.errorText }));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1280, height: 720 });
  if (clearStorage) {
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    });
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.screenshot({ path: path.join(outDir, 'step1_home.png'), fullPage: true });

  await waitFor(page, () => !!window.AdoleAPI, 15000);
  await getAuthSnapshot(page, 'before_login');

  const loginFlow = await tryLogin(page);
  fs.writeFileSync(path.join(outDir, 'login_flow.json'), JSON.stringify(loginFlow, null, 2));
  await page.waitForTimeout(2000);

  await waitFor(page, () => window.__authCheckComplete === true, 15000);
  await getAuthSnapshot(page, 'after_login');
  await page.screenshot({ path: path.join(outDir, 'step2_after_login.png'), fullPage: true });

  if (switchToTauriOnRefresh && !forceTauri) {
    await context.addInitScript(() => {
      window.__TAURI__ = window.__TAURI__ || {};
      window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
      window.__SQUIRREL_FORCE_TAURI__ = true;
      window.__SQUIRREL_AUTH_SOURCE__ = 'tauri';
    });
  }
  await page.reload({ waitUntil: 'networkidle' });
  await waitFor(page, () => window.__authCheckComplete === true, 15000);
  await page.waitForTimeout(1500);
  await getAuthSnapshot(page, 'after_refresh');
  await page.screenshot({ path: path.join(outDir, 'step3_after_refresh.png'), fullPage: true });

  // Try a simple atome creation to detect missing token (non-destructive small payload)
  const atomeResult = await safeEval(page, async () => {
    const api = window.AdoleAPI || null;
    if (!api?.atomes?.create) return { ok: false, error: 'AdoleAPI.atomes.create not available' };
    try {
      const res = await api.atomes.create({ type: 'note', particles: { name: 'headless_test', text: 'debug' } });
      return res;
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }, null, { ok: false, error: 'eval_failed' });
  fs.writeFileSync(path.join(outDir, 'atome_result.json'), JSON.stringify(atomeResult, null, 2));
  log('atome_result', atomeResult);

  if (probeMtrackOpen) {
    const probe = await safeEval(page, async () => {
      const normalizeId = (value) => String(value || '').trim();
      const normText = (value) => String(value || '').trim().toLowerCase();
      const selectedBefore = (window.AdoleAPI?.selection?.get ? window.AdoleAPI.selection.get() : [])
        .map((entry) => normalizeId(entry))
        .filter(Boolean);
      const candidate = Array.from(document.querySelectorAll('[data-atome-id]')).find((node) => {
        const kind = String(node?.dataset?.atomeKind || '').trim().toLowerCase();
        if (!kind) return true;
        return kind !== 'group' && kind !== 'tool_shortcut';
      }) || null;
      const toolCandidates = Array.from(document.querySelectorAll('#menu_container_v2 .eve-toolbox-v2-tool, [data-name-key], [data-tool-id], [id]'))
        .filter((el) => {
          const id = normText(el?.id || '');
          const nameKey = normText(el?.dataset?.nameKey || el?.dataset?.name_key || '');
          const toolId = normText(el?.dataset?.toolId || el?.dataset?.tool_id || '');
          return (
            id.includes('mtrack')
            || id.includes('mtrax')
            || nameKey === 'mtrack'
            || nameKey === 'mtrax'
            || toolId === 'tool.main.mtrack'
            || toolId === 'ui.mtrax.open'
            || toolId === 'ui.mtrack.panel'
          );
        });
      const tool = document.getElementById('_intuition_v2_mtrack')
        || document.getElementById('_intuition_mtrack')
        || document.querySelector('[data-name-key="mtrack"]')
        || document.querySelector('[data-name-key="mtrax"]')
        || toolCandidates[0]
        || null;
      if (!candidate) {
        return {
          ok: false,
          error: 'probe_candidate_missing',
          has_candidate: !!candidate,
          has_tool: !!tool,
          tool_candidates: toolCandidates.slice(0, 20).map((el) => ({
            id: normalizeId(el.id),
            name_key: normalizeId(el?.dataset?.nameKey || el?.dataset?.name_key || ''),
            tool_id: normalizeId(el?.dataset?.toolId || el?.dataset?.tool_id || '')
          }))
        };
      }
      const click = (el) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
        const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, button: 0, clientX: x, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, button: 0, clientX: x, clientY: y }));
        if (typeof el.click === 'function') el.click();
      };
      click(candidate);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (tool) click(tool);
      const runtime = window.atome?.tools?.v2Runtime || null;
      const runtimeOpenResult = (runtime && typeof runtime.invokeById === 'function')
        ? await runtime.invokeById({
          tool_id: 'ui.mtrax.open',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: 'open',
            toggle: false,
            target_id: normalizeId(tool?.id || '_intuition_v2_mtrack')
          },
          presentation: 'ui',
          source: { type: 'ui', layer: 'headless_probe' }
        })
        : { ok: false, error: 'runtime_unavailable' };
      await new Promise((resolve) => setTimeout(resolve, 2600));
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = (window.eveMtrackApi && typeof window.eveMtrackApi.getState === 'function')
        ? window.eveMtrackApi.getState()
        : null;
      const selectedAfter = (window.AdoleAPI?.selection?.get ? window.AdoleAPI.selection.get() : [])
        .map((entry) => normalizeId(entry))
        .filter(Boolean);
      const events = Array.isArray(window.__EVE_PROBE_EVENTS__) ? window.__EVE_PROBE_EVENTS__ : [];
      return {
        ok: true,
        selected_before: selectedBefore,
        selected_after: selectedAfter,
        probe_atome_id: normalizeId(candidate.dataset?.atomeId || ''),
        tool_id: normalizeId(tool.id || tool.dataset?.toolId || tool.dataset?.tool_id || ''),
        tool_candidates: toolCandidates.slice(0, 20).map((el) => ({
          id: normalizeId(el.id),
          name_key: normalizeId(el?.dataset?.nameKey || el?.dataset?.name_key || ''),
          tool_id: normalizeId(el?.dataset?.toolId || el?.dataset?.tool_id || '')
        })),
        runtime_open_result: runtimeOpenResult || null,
        panel_exists: !!panel,
        panel_display: panel ? panel.style.display : null,
        panel_parent: panel?.parentElement?.id || null,
        mtrack_state: state || null,
        probe_events: events.slice(-40)
      };
    }, null, { ok: false, error: 'probe_eval_failed' }, 16000);
    fs.writeFileSync(path.join(outDir, 'mtrack_open_probe.json'), JSON.stringify(probe, null, 2));
    log('mtrack_open_probe', probe);
  }

  await browser.close();
  log('done');
};

run().catch((e) => {
  log('fatal', { message: e?.message || String(e) });
  process.exit(1);
});
