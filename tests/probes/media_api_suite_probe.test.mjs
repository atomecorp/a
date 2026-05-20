import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
const outDir = path.resolve('temp/probe_reports/media_api_suite_probe');
const mediaPaths = [
  path.join(mediaDir, '0000.png'),
  path.join(mediaDir, 'atome.svg'),
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
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
};

const closeBrowser = async (browser) => {
  try {
    await Promise.race([
      browser.close(),
      sleep(5000).then(() => ({ timedOut: true }))
    ]);
  } catch (error) {
    console.warn("[cleanup] operation failed", error);
    // Probe teardown must not hide the suite result already written to disk.
  }
};

const tryLogin = async (page) => {
  const loginResult = await safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
    const result = await api.auth.login(loginPhone, loginPassword, loginPhone);
    return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
  }, { phone, password }, 14000);
  if (loginResult?.ok) return loginResult;
  return safeEval(page, async ({ phone: loginPhone, password: loginPassword, prior }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable', prior };
    const result = await api.auth.create(loginPhone, loginPassword, loginPhone, { autoLogin: true });
    return {
      ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
      result,
      prior
    };
  }, { phone, password, prior: loginResult }, 22000);
};

const importMedia = async (page) => {
  const bootstrap = await safeEval(page, async () => {
    if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
      await import('/eve/application/intuition/tools/project_drop.js');
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
    const oldInput = document.getElementById('media_api_suite_probe_input');
    if (oldInput) oldInput.remove();
    const input = document.createElement('input');
    input.id = 'media_api_suite_probe_input';
    input.type = 'file';
    input.multiple = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#media_api_suite_probe_input', mediaPaths);

  return safeEval(page, async () => {
    const input = document.getElementById('media_api_suite_probe_input');
    const entries = Array.from(input?.files || []);
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
    if (!entries.length) return { ok: false, error: 'no_files_selected' };
    return window.eveProjectDropApi.importFilesToProjectViaCreator({
      entries,
      event: { clientX: 240, clientY: 180 },
      projectId,
      projectEl,
      origin: 'headless_media_api_suite_probe',
      sourceLayer: 'headless_media_api_suite_probe',
      actorType: 'headless_probe'
    });
  }, null, 180000);
};

const inspectImportedRenderers = async (page, importResult) => {
  const imported = Array.isArray(importResult?.results) ? importResult.results : [];
  return safeEval(page, ({ importedEntries }) => importedEntries.map((entry, index) => {
    const host = document.querySelector(`[data-atome-id="${entry.atomeId}"]`);
    const expected = ['image', 'svg', 'video', 'audio'][index] || entry.type;
    const videos = Array.from(host?.querySelectorAll('video') || []);
    const audios = Array.from(host?.querySelectorAll('audio') || []);
    const images = Array.from(host?.querySelectorAll('img') || []);
    const canvases = Array.from(host?.querySelectorAll('canvas[data-role="eve-media-api-webgpu-canvas"]') || []);
    const audioMarkers = Array.from(host?.querySelectorAll('[data-role="eve-media-api-audio"]') || []);
    const renderer = host?.dataset?.eveMediaRenderer || null;
    const ok = expected === 'audio'
      ? renderer === 'webgpu+kira' && canvases.length === 1 && audioMarkers.length === 1 && videos.length === 0 && audios.length === 0 && images.length === 0
      : renderer === 'webgpu' && canvases.length === 1 && videos.length === 0 && audios.length === 0 && images.length === 0;
    return {
      ok,
      index,
      expected,
      atomeId: entry.atomeId,
      renderer,
      mediaApiReady: host?.dataset?.mediaApiReady || null,
      mediaApiError: host?.dataset?.mediaApiError || null,
      canvasCount: canvases.length,
      videoCount: videos.length,
      audioCount: audios.length,
      imageCount: images.length,
      audioMarkerCount: audioMarkers.length
    };
  }), { importedEntries: imported }, 20000);
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
    suite: null,
    transport: null,
    state: null,
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
  await context.addInitScript(() => {
    window.__CHECK_DEBUG__ = true;
    window.__EVE_MEDIA_DIAG_HEADLESS__ = true;
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    report.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: error.message }));
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    const apiReady = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
    if (!apiReady.ok) throw new Error('api_not_ready');
    const login = await tryLogin(page);
    if (!login?.ok) throw new Error(`login_failed:${login?.error || JSON.stringify(login)}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitFor(page, () => window.__authCheckComplete === true, 25000);
    report.import_result = await importMedia(page);
    if (!report.import_result?.ok) throw new Error(`import_failed:${report.import_result?.error || JSON.stringify(report.import_result)}`);
    await waitFor(page, ({ importedEntries }) => importedEntries.every((entry) => {
      const host = document.querySelector(`[data-atome-id="${entry.atomeId}"]`);
      return !!host?.dataset?.eveMediaRenderer;
    }), 30000, 250, { importedEntries: report.import_result.results || [] });
    await waitFor(page, ({ importedEntries }) => importedEntries.every((entry, index) => {
      const host = document.querySelector(`[data-atome-id="${entry.atomeId}"]`);
      if (!host) return false;
      if (index === 3) return host.dataset.eveMediaRenderer === 'webgpu+kira' && host.dataset.mediaApiReady === 'true';
      return host.dataset.mediaApiReady === 'true' || !!host.dataset.mediaApiError;
    }), 30000, 250, { importedEntries: report.import_result.results || [] });
    report.dom_renderers = await inspectImportedRenderers(page, report.import_result);
    const badRenderer = Array.isArray(report.dom_renderers)
      ? report.dom_renderers.find((entry) => entry.ok !== true)
      : null;
    if (badRenderer) throw new Error(`renderer_contract_failed:${JSON.stringify(badRenderer)}`);
    await sleep(1400);
    report.suite = await safeEval(page, async () => {
      if (!window.__DEBUG__?.runMediaApiSuite) return { ok: false, error: 'debug_media_api_suite_unavailable' };
      return window.__DEBUG__.runMediaApiSuite();
    }, null, 180000);
    report.transport = await safeEval(page, async () => {
      if (!window.__DEBUG__?.runMediaTransportSuite) return { ok: false, error: 'debug_media_transport_suite_unavailable' };
      return window.__DEBUG__.runMediaTransportSuite({ logToConsole: true });
    }, null, 240000);
    report.targeted_transport = await safeEval(page, async () => {
      if (!window.__DEBUG__?.runMediaTransportSuite) return { ok: false, error: 'debug_media_transport_suite_unavailable' };
      const tests = ['play_audio', 'play_video', 'scrub_audio', 'scrub_video'];
      const results = {};
      for (const test of tests) {
        results[test] = await window.__DEBUG__.runMediaTransportSuite({
          visibleOnly: true,
          logToConsole: true,
          operationTimeoutMs: 5000,
          minAudioPlaybackMs: 4000,
          videoPlaybackMs: 1200,
          test
        });
      }
      return {
        ok: Object.values(results).every((entry) => entry?.ok === true),
        results
      };
    }, null, 480000);
    await safeEval(page, async () => {
      const runtime = window.atome?.tools?.v2Runtime || null;
      if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
      return runtime.invokeById({
        tool_id: 'ui.home.panel',
        action: 'pointer.click',
        input: {},
        source: { type: 'headless_probe', layer: 'media_api_suite_probe' },
        presentation: 'ui'
      });
    }, null, 30000);
    await waitFor(page, () => Array.from(document.querySelectorAll('button')).some((button) => String(button.textContent || '').trim() === 'Full test'), 30000);
    report.debug_buttons = await safeEval(page, () => {
      const labels = Array.from(document.querySelectorAll('button')).map((button) => String(button.textContent || '').trim());
      const expected = ['Full test', 'Test play audio', 'Test play video', 'Test scrub audio', 'Test scrub video', 'Copy log'];
      return {
        ok: expected.every((label) => labels.includes(label)),
        expected,
        found: expected.filter((label) => labels.includes(label))
      };
    }, null, 10000);
    report.state = await safeEval(page, () => window.__DEBUG__?.getMediaApiState?.() || null, null, 10000);
    await page.screenshot({ path: path.join(outDir, 'after_suite.png'), fullPage: true });
    report.ok = report.suite?.ok === true
      && report.transport?.ok === true
      && report.targeted_transport?.ok === true
      && report.debug_buttons?.ok === true;
    writeReport(report);
    process.stdout.write(`${JSON.stringify({
      ok: report.ok,
      counts: report.suite?.counts || null,
      transportCounts: report.transport?.counts || null,
      transportErrors: Array.isArray(report.transport?.errors) ? report.transport.errors.length : null,
      transportWarnings: Array.isArray(report.transport?.warnings) ? report.transport.warnings.length : null,
      targetedOk: report.targeted_transport?.ok ?? null,
      debugButtonsOk: report.debug_buttons?.ok ?? null,
      results: Array.isArray(report.suite?.results)
        ? report.suite.results.map((entry) => ({ key: entry.key, status: entry.status, error: entry.error || entry.prepare?.error || null }))
        : null,
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
