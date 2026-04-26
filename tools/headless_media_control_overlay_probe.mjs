import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'temp_import_tests');
const outDir = path.resolve('tools/headless_output/media_control_overlay_probe');
const mediaPaths = [
  path.join(mediaDir, "Jeezs's fire.m4v"),
  path.join(mediaDir, 'test.m4a')
];

fs.mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, 'report.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null, timeoutMs = 30000) => {
  try {
    return await Promise.race([
      page.evaluate(fn, arg),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`evaluate_timeout_${timeoutMs}ms`)), timeoutMs))
    ]);
  } catch (error) {
    return { ok: false, error: error?.message || String(error || 'eval_failed') };
  }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250, arg = null) => {
  const started = Date.now();
  let last = null;
  while ((Date.now() - started) < timeoutMs) {
    last = await safeEval(page, predicate, arg, 2500);
    if (last === true || last?.ok === true) return { ok: true, last };
    await sleep(intervalMs);
  }
  return { ok: false, last };
};

const writeReport = (report) => {
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const closeBrowser = async (browser) => {
  try {
    await Promise.race([
      browser.close(),
      sleep(5000).then(() => ({ timedOut: true }))
    ]);
  } catch (error) {
        console.warn("[cleanup] operation failed", error); }
};

const tryLogin = async (page) => {
  const loginResult = await safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
    const result = await api.auth.login(loginPhone, loginPassword, loginPhone);
    return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
  }, { phone, password }, 14000);
  if (loginResult?.ok) return loginResult;
  return safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable' };
    const result = await api.auth.create(loginPhone, loginPassword, loginPhone, { autoLogin: true });
    return {
      ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
      result
    };
  }, { phone, password }, 22000);
};

const importMedia = async (page) => {
  const bootstrap = await safeEval(page, async () => {
    if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
      await import('/application/eVe/intuition/tools/project_drop.js');
    }
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
    return {
      ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId),
      project_id: projectId
    };
  }, null, 25000);
  if (!bootstrap?.ok) throw new Error(`bootstrap_failed:${bootstrap?.error || JSON.stringify(bootstrap)}`);

  await page.evaluate(() => {
    const oldInput = document.getElementById('media_control_overlay_probe_input');
    if (oldInput) oldInput.remove();
    const input = document.createElement('input');
    input.id = 'media_control_overlay_probe_input';
    input.type = 'file';
    input.multiple = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#media_control_overlay_probe_input', mediaPaths);

  return safeEval(page, async () => {
    const input = document.getElementById('media_control_overlay_probe_input');
    const entries = Array.from(input?.files || []);
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
    if (!entries.length) return { ok: false, error: 'no_files_selected' };
    return window.eveProjectDropApi.importFilesToProjectViaCreator({
      entries,
      event: { clientX: 260, clientY: 190 },
      projectId,
      projectEl,
      origin: 'headless_media_control_overlay_probe',
      sourceLayer: 'headless_media_control_overlay_probe',
      actorType: 'headless_probe'
    });
  }, null, 180000);
};

const rectForAtome = async (page, atomeId) => safeEval(page, (id) => {
  const host = document.querySelector(`[data-atome-id="${id}"]`);
  const rect = host?.getBoundingClientRect?.();
  return rect ? { ok: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height } : { ok: false, error: 'host_missing' };
}, atomeId, 10000);

const exerciseAtome = async (page, entry) => {
  const atomeId = entry.atomeId;
  const before = await rectForAtome(page, atomeId);
  if (!before?.ok) return { ok: false, atomeId, error: before?.error || 'rect_missing' };
  await page.mouse.dblclick(before.x + before.width / 2, before.y + before.height / 2);
  const overlayReady = await waitFor(page, (id) => {
    const overlay = document.querySelector(`[data-role="eve-media-control-overlay"][data-atome-id="${id}"]`);
    return !!(overlay && !overlay.hidden && overlay.querySelector('[data-media-control="play"]'));
  }, 20000, 250, atomeId);
  const controls = await safeEval(page, (id) => {
    const overlay = document.querySelector(`[data-role="eve-media-control-overlay"][data-atome-id="${id}"]`);
    return {
      ok: !!overlay,
      buttons: Array.from(overlay?.querySelectorAll?.('button') || []).map((button) => String(button.textContent || '').trim()),
      has_scrub: !!overlay?.querySelector?.('[data-media-control="scrub"]'),
      has_play_at: !!overlay?.querySelector?.('[data-media-control="play-at-value"]')
    };
  }, atomeId, 10000);
  if (overlayReady.ok !== true || controls?.ok !== true) {
    const debug = await safeEval(page, (id) => {
      const host = document.querySelector(`[data-atome-id="${id}"]`);
      const rect = host?.getBoundingClientRect?.();
      return {
        has_overlay_api: !!window.eveMediaControlOverlay?.show,
        host: host ? {
          id: host.dataset?.atomeId || '',
          kind: host.dataset?.atomeKind || '',
          media_source: host.dataset?.eveMediaSource || '',
          media_ready: host.dataset?.mediaApiReady || '',
          controls_open: host.dataset?.eveMediaControlsOpen || '',
          rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          html: host.outerHTML.slice(0, 1200)
        } : null
      };
    }, atomeId, 10000);
    return { ok: false, atomeId, overlayReady, controls, debug };
  }
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="play"]`).click({ timeout: 10000 });
  await sleep(1300);
  const playing = await safeEval(page, (id) => window.eveMediaApi?.getAssetState?.(id) || null, atomeId, 10000);
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="stop"]`).click({ timeout: 10000 });
  await sleep(250);
  const stopped = await safeEval(page, (id) => window.eveMediaApi?.getAssetState?.(id) || null, atomeId, 10000);
  const playAtValue = entry.type === 'video' ? 1 : 0.5;
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="play-at-value"]`).fill(String(playAtValue), { timeout: 10000 });
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="play-at"]`).click({ timeout: 10000 });
  await sleep(700);
  const playAt = await safeEval(page, (id) => window.eveMediaApi?.getAssetState?.(id) || null, atomeId, 10000);
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="stop"]`).click({ timeout: 10000 });
  await sleep(250);
  await safeEval(page, ({ id, value }) => {
    const range = document.querySelector(`[data-role="eve-media-control-overlay"][data-atome-id="${id}"] [data-media-control="scrub"]`);
    if (!(range instanceof HTMLInputElement)) return { ok: false, error: 'range_missing' };
    range.value = String(value);
    range.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return { ok: true };
  }, { id: atomeId, value: playAtValue }, 10000);
  await sleep(700);
  const scrubbed = await safeEval(page, (id) => window.eveMediaApi?.getAssetState?.(id) || null, atomeId, 10000);
  await page.locator(`[data-role="eve-media-control-overlay"][data-atome-id="${atomeId}"] [data-media-control="stop"]`).click({ timeout: 10000 });
  await sleep(250);
  const stoppedAfterScrub = await safeEval(page, (id) => window.eveMediaApi?.getAssetState?.(id) || null, atomeId, 10000);
  return {
    ok: overlayReady.ok === true
      && controls?.ok === true
      && playing?.playing === true
      && stopped?.playing === false
      && playAt?.playing === true
      && (entry.type === 'video'
        ? Math.abs(Number(scrubbed?.position || 0) - playAtValue) < 0.15
        : scrubbed?.playing === true)
      && stoppedAfterScrub?.playing === false,
    atomeId,
    overlayReady,
    controls,
    playing,
    stopped,
    playAt,
    scrubbed,
    stoppedAfterScrub
  };
};

const run = async () => {
  for (const file of mediaPaths) {
    if (!fs.existsSync(file)) throw new Error(`missing test media: ${file}`);
  }
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    import_result: null,
    results: [],
    console: []
  };
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--disable-gpu-sandbox'
    ]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    report.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: error.message }));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const apiReady = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
    if (!apiReady.ok) throw new Error('api_not_ready');
    const login = await tryLogin(page);
    if (!login?.ok) throw new Error(`login_failed:${login?.error || JSON.stringify(login)}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitFor(page, () => window.__authCheckComplete === true, 25000);
    await waitFor(page, () => {
      const projectEl = document.querySelector('[id^="project_view_"]');
      const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
      return !!(projectEl && projectId && window.eveProjectDropApi?.importFilesToProjectViaCreator);
    }, 45000);
    report.import_result = await importMedia(page);
    if (!report.import_result?.ok) throw new Error(`import_failed:${report.import_result?.error || JSON.stringify(report.import_result)}`);
    await safeEval(page, ({ importedEntries }) => {
      importedEntries.forEach((entry, index) => {
        const host = document.querySelector(`[data-atome-id="${entry.atomeId}"]`);
        if (!(host instanceof HTMLElement)) return;
        host.style.left = `${260 + (index * 420)}px`;
        host.style.top = '190px';
      });
      return { ok: true };
    }, { importedEntries: report.import_result.results || [] }, 10000);
    await waitFor(page, ({ importedEntries }) => importedEntries.every((entry) => {
      const host = document.querySelector(`[data-atome-id="${entry.atomeId}"]`);
      return host?.dataset?.mediaApiReady === 'true';
    }), 40000, 250, { importedEntries: report.import_result.results || [] });
    for (const entry of report.import_result.results || []) {
      report.results.push(await exerciseAtome(page, entry));
    }
    await page.screenshot({ path: path.join(outDir, 'after_controls.png'), fullPage: true });
    report.ok = report.results.length === 2 && report.results.every((entry) => entry.ok === true);
    writeReport(report);
    process.stdout.write(`${JSON.stringify({
      ok: report.ok,
      results: report.results.map((entry) => ({
        atomeId: entry.atomeId,
        ok: entry.ok,
        buttons: entry.controls?.buttons || [],
        playing: entry.playing?.playing,
        stopped: entry.stopped?.playing === false,
        playAt: entry.playAt?.playing,
        scrubbed: entry.scrubbed?.playing
      })),
      reportFile
    }, null, 2)}\n`);
  } finally {
    await closeBrowser(browser);
  }
};

run().then(() => {
  process.exit(0);
}).catch((error) => {
  const report = {
    created_at: new Date().toISOString(),
    ok: false,
    fatal: error?.message || String(error || 'fatal'),
    stack: error?.stack || null
  };
  writeReport(report);
  process.stderr.write(`${report.fatal}\n`);
  process.exit(1);
});
