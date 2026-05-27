import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
const outDir = path.resolve('temp/probe_reports/mtrack_media_play_ui_probe');
const mediaPaths = [
  path.join(mediaDir, '0000.png'),
  path.join(mediaDir, 'atome.svg'),
  path.join(mediaDir, "Jeezs's fire.m4v"),
  path.join(mediaDir, 'test.m4a')
];

fs.mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, 'report.json');
const logFile = path.join(outDir, 'run.log');

const redactSecrets = (text) => String(text || '')
  .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(outDir, name), redactSecrets(JSON.stringify(value, null, 2)));
};

const log = (message, detail = null) => {
  const line = redactSecrets(`[${new Date().toISOString()}] ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  fs.appendFileSync(logFile, `${line}\n`);
  console.log(line);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
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

const tryLogin = async (page) => {
  const loginResult = await safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
    const result = await api.auth.login(loginPhone, loginPassword, loginPhone);
    return {
      ok: !!(result?.fastify?.success || result?.tauri?.success),
      result
    };
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

const bootstrapImport = async (page) => {
  const bootstrap = await safeEval(page, async () => {
    window.__EVE_HMTRACKS_AUDIO_DEBUG_LOGS__ = true;
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_TRACE__ = true;
    if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
      await import('/eVe/intuition/tools/project_drop.js');
    }
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
    return {
      ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId),
      project_id: projectId,
      project_el_id: projectEl?.id || null
    };
  }, null, 25000);
  if (!bootstrap?.ok) throw new Error(`bootstrap_failed:${bootstrap?.error || JSON.stringify(bootstrap)}`);

  await page.evaluate(() => {
    const oldInput = document.getElementById('mtrack_media_play_ui_input');
    if (oldInput) oldInput.remove();
    const input = document.createElement('input');
    input.id = 'mtrack_media_play_ui_input';
    input.type = 'file';
    input.multiple = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#mtrack_media_play_ui_input', mediaPaths);

  const importResult = await safeEval(page, async () => {
    const input = document.getElementById('mtrack_media_play_ui_input');
    const entries = Array.from(input?.files || []);
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
    if (!entries.length) return { ok: false, error: 'no_files_selected' };
    const rect = projectEl.getBoundingClientRect();
    return window.eveProjectDropApi.importFilesToProjectViaCreator({
      entries,
      event: { clientX: rect.left + 240, clientY: rect.top + 180 },
      projectId,
      projectEl,
      origin: 'headless_mtrack_media_play_ui_probe',
      sourceLayer: 'headless_mtrack_media_play_ui_probe',
      actorType: 'headless_probe'
    });
  }, null, 180000);
  if (!importResult?.ok) throw new Error(`import_failed:${importResult?.error || JSON.stringify(importResult)}`);
  return importResult;
};

const collectSnapshot = async (page, label = '') => safeEval(page, async (sampleLabel) => {
  const state = window.eveMtrackApi?.getState?.() || null;
  const debugTimeline = window.__DEBUG__?.getTimelineState?.() || null;
  const debugState = debugTimeline?.state || null;
  let parsedTimeline = null;
  try {
    const hash = String(debugState?.activeTimelineHash || state?.activeTimelineHash || '').trim();
    parsedTimeline = hash ? JSON.parse(hash) : null;
  } catch (error) {
    console.warn("[cleanup] operation failed", error);
    parsedTimeline = null;
  }
  const parsedClips = Array.isArray(parsedTimeline?.clips) ? parsedTimeline.clips : [];
  const clips = Array.isArray(state?.clips) ? state.clips : parsedClips;
  const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
  const previewMedia = previewHost?.querySelector?.('[data-role="mtrax-gpu-overlay"] canvas')
    || document.querySelector('[data-role="mtrax-gpu-overlay"] canvas')
    || document.querySelector('#eve_mtrack_dialog canvas')
    || previewHost?.querySelector?.('canvas,video,img,svg,audio')
    || null;
  const summarizeRect = (node) => {
    if (!node?.getBoundingClientRect) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      on_screen: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
    };
  };
  const hashPixels = (node) => {
    try {
      let canvas = null;
      if (node?.tagName === 'CANVAS') {
        canvas = node;
      } else if (node && ['VIDEO', 'IMG'].includes(node.tagName)) {
        const width = Math.max(1, Math.min(96, Math.round(node.videoWidth || node.naturalWidth || node.clientWidth || 1)));
        const height = Math.max(1, Math.min(54, Math.round(node.videoHeight || node.naturalHeight || node.clientHeight || 1)));
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(node, 0, 0, width, height);
      }
      if (!canvas?.getContext) return null;
      const width = Math.max(1, Math.min(64, canvas.width || canvas.clientWidth || 1));
      const height = Math.max(1, Math.min(36, canvas.height || canvas.clientHeight || 1));
      const work = document.createElement('canvas');
      work.width = width;
      work.height = height;
      const context = work.getContext('2d', { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      let hash = 2166136261;
      let nonTransparent = 0;
      let lumaSum = 0;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha > 0) nonTransparent += 1;
        lumaSum += data[index] + data[index + 1] + data[index + 2];
        hash ^= data[index] + (data[index + 1] << 8) + (data[index + 2] << 16) + (alpha << 24);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return { hash, width, height, non_transparent: nonTransparent, luma_sum: lumaSum };
    } catch (error) {
      return { error: error?.message || String(error || 'pixel_hash_failed') };
    }
  };
  return {
    ok: true,
    label: sampleLabel,
    playhead: Number(state?.playhead ?? debugState?.playhead ?? 0),
    is_playing: state?.isPlaying === true || state?.playing === true || debugState?.playing === true,
    playback_start_pending: state?.playbackStartPending === true,
    max_time: Number(state?.maxTime ?? debugState?.maxTime ?? Math.max(0, ...parsedClips.map((clip) => Number(clip.start || 0) + Number(clip.duration || 0)))),
    clip_count: clips.length,
    clips: clips.map((clip) => {
      const media = clip.media || null;
      return {
        id: clip.id || clip.persistId || null,
        kind: clip.kind || null,
        start: Number(clip.start || 0),
        duration: Number(clip.duration || 0),
        runtime_active: clip.runtimeActive === true,
        runtime_last_play_error: String(clip.runtimeLastPlayError || ''),
        runtime_play_pending: clip.runtimePlayRequestPending === true,
        src: String(clip.src || clip.runtimePlaybackSource || ''),
        media_tag: media?.tagName || null,
        media_paused: media ? media.paused === true : null,
        media_ended: media ? media.ended === true : null,
        media_current_time: media && Number.isFinite(Number(media.currentTime)) ? Number(media.currentTime) : null,
        media_duration: media && Number.isFinite(Number(media.duration)) ? Number(media.duration) : null,
        media_ready_state: media && Number.isFinite(Number(media.readyState)) ? Number(media.readyState) : null,
        media_network_state: media && Number.isFinite(Number(media.networkState)) ? Number(media.networkState) : null,
        media_error_code: media?.error?.code || null,
        media_error_message: media?.error?.message || null
      };
    }),
    preview_tag: previewMedia?.tagName || null,
    preview_rect: summarizeRect(previewHost),
    preview_media_rect: summarizeRect(previewMedia),
    preview_pixels: hashPixels(previewMedia),
    renderer_state: window.eveMtrackApi?.getRendererState?.() || null,
    renderer_probe: window.__EVE_MTRAX_LAST_WEBGPU_PROBE__ || window.__EVE_MTRAX_LAST_RENDERER_VERIFY__ || null,
    debug_timeline: debugTimeline,
    audio_runtime: window.__DEBUG__?.getGPUStats?.()?.audio || window.__DEBUG__?.getAppState?.()?.mtrack?.audioEngine || null
  };
}, label, 10000);

const openMtrackForAtome = async (page, atomeId, layer) => {
  const opened = await safeEval(page, async ({ id, sourceLayer }) => {
    const mod = await import('/eve/application/intuition/runtime/group_timeline_api.js');
    return mod.openGroupTimeline({
      action: 'open',
      atome_id: id,
      target_id: id,
      selection_ids: [id],
      toggle: false,
      source: 'headless_mtrack_media_play_ui_probe',
      source_layer: sourceLayer,
      footer_coupled: false
    });
  }, { id: atomeId, sourceLayer: layer }, 30000);
  const ready = await waitFor(page, (id) => {
    const panel = document.getElementById('eve_mtrack_dialog');
    const visible = !!(panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden');
    const state = window.eveMtrackApi?.getState?.() || null;
    const clips = Array.isArray(state?.clips) ? state.clips : [];
    return {
      ok: visible
        && String(state?.activeGroupId || '') === String(id)
        && clips.length > 0
    };
  }, 30000, 300, atomeId);
  return { opened, ready };
};

const clickPlayButton = async (page) => {
  const selector = '#eve_mtrack_dialog button[data-name-key="play"], #eve_mtrack_dialog button[data-tool-id*="play"], #eve_mtrack_dialog button[data-label="play"]';
  const buttonInfo = await safeEval(page, (sel) => {
    const buttons = Array.from(document.querySelectorAll(sel));
    return buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        selector: sel,
        text: button.textContent || '',
        name_key: button.dataset?.nameKey || '',
        tool_id: button.dataset?.toolId || button.dataset?.tool_id || '',
        label: button.dataset?.label || '',
        visible: rect.width > 0 && rect.height > 0
      };
    });
  }, selector, 8000);
  const visibleCount = Array.isArray(buttonInfo) ? buttonInfo.filter((entry) => entry.visible).length : 0;
  if (visibleCount !== 1) return { ok: false, error: 'play_button_not_unique', buttonInfo };
  const clickPoint = await safeEval(page, (sel) => {
    const button = Array.from(document.querySelectorAll(sel)).find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!(button instanceof HTMLElement)) return { ok: false, error: 'play_button_missing' };
    const rect = button.getBoundingClientRect();
    const points = [
      [0.5, 0.5],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.5, 0.25],
      [0.5, 0.75]
    ].map(([xRatio, yRatio]) => ({
      x: Math.round(rect.left + (rect.width * xRatio)),
      y: Math.round(rect.top + (rect.height * yRatio))
    }));
    for (const point of points) {
      const target = document.elementFromPoint(point.x, point.y);
      const targetButton = target instanceof Element ? target.closest('button') : null;
      if (targetButton === button) {
        return {
          ok: true,
          x: point.x,
          y: point.y,
          target_tag: target?.tagName || '',
          target_role: target instanceof HTMLElement ? String(target.dataset?.role || target.getAttribute('role') || '') : '',
          target_name_key: target instanceof HTMLElement ? String(target.dataset?.nameKey || '') : ''
        };
      }
    }
    const centerTarget = document.elementFromPoint(Math.round(rect.left + (rect.width / 2)), Math.round(rect.top + (rect.height / 2)));
    return {
      ok: false,
      error: 'play_button_covered',
      center_target_tag: centerTarget?.tagName || '',
      center_target_role: centerTarget instanceof HTMLElement ? String(centerTarget.dataset?.role || centerTarget.getAttribute('role') || '') : '',
      center_target_name_key: centerTarget instanceof HTMLElement ? String(centerTarget.dataset?.nameKey || '') : '',
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }, selector, 8000);
  if (clickPoint?.ok !== true) return { ok: false, error: clickPoint?.error || 'play_click_point_missing', buttonInfo, clickPoint };
  await safeEval(page, () => {
    window.__MTRACK_UI_TRANSPORT_TRACE__ = [];
    const api = window.eveMtrackApi || null;
    if (!api || api.__mtrackProbeWrapped === true) return { ok: !!api, wrapped: api?.__mtrackProbeWrapped === true };
    ['play', 'pause', 'stop', 'seek', 'loadGroupTimeline'].forEach((method) => {
      const original = api[method];
      if (typeof original !== 'function') return;
      api[method] = async function wrappedMtrackTransport(...args) {
        const startedAt = Date.now();
        let result = null;
        let error = null;
        try {
          result = await original.apply(this, args);
          return result;
        } catch (err) {
          error = String(err?.message || err || 'error');
          throw err;
        } finally {
          window.__MTRACK_UI_TRANSPORT_TRACE__.push({
            method,
            args: args.map((arg) => {
              try { return JSON.parse(JSON.stringify(arg)); } catch (error) {
                console.warn("[cleanup] operation failed", error); return String(arg);
              }
            }),
            result: result && typeof result === 'object' ? result : { value: result },
            error,
            elapsed_ms: Date.now() - startedAt,
            state_after: typeof api.getState === 'function' ? api.getState() : null
          });
        }
      };
    });
    Object.defineProperty(api, '__mtrackProbeWrapped', { value: true, configurable: true });
    return { ok: true, wrapped: true };
  }, null, 8000);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await sleep(650);
  const trace = await safeEval(page, () => ({
    trace: window.__MTRACK_UI_TRANSPORT_TRACE__ || [],
    state: window.eveMtrackApi?.getState?.() || null,
    debugTimeline: window.__DEBUG__?.getTimelineState?.() || null
  }), null, 8000);
  return { ok: true, buttonInfo, clickPoint, trace };
};

const directMtrackTransport = async (page, action = 'play') => safeEval(page, async (transportAction) => {
  const api = window.eveMtrackApi || null;
  if (!api || typeof api[transportAction] !== 'function') {
    return { ok: false, error: 'mtrack_transport_unavailable', action: transportAction };
  }
  const result = await api[transportAction]();
  return {
    ok: result?.ok !== false,
    action: transportAction,
    result
  };
}, action, 15000);

const scrubTo = async (page, seconds) => safeEval(page, async (targetSeconds) => {
  if (!window.eveMtrackApi?.seek) return { ok: false, error: 'seek_api_missing' };
  const result = await window.eveMtrackApi.seek({ seconds: targetSeconds });
  return { ok: result?.ok !== false, result };
}, seconds, 15000);

const capturePreviewScreenshot = async (page, snapshot, name) => {
  const rect = snapshot?.preview_rect;
  if (!rect || !rect.on_screen || rect.width <= 0 || rect.height <= 0) return null;
  const clip = {
    x: Math.max(0, Number(rect.x || 0)),
    y: Math.max(0, Number(rect.y || 0)),
    width: Math.max(1, Math.min(1200, Number(rect.width || 1))),
    height: Math.max(1, Math.min(700, Number(rect.height || 1)))
  };
  try {
    const buffer = await page.screenshot({ clip });
    if (name) fs.writeFileSync(path.join(outDir, name), buffer);
    return {
      hash: hashBuffer(buffer),
      bytes: buffer.length,
      clip
    };
  } catch (error) {
    return {
      error: error?.message || String(error || 'preview_screenshot_failed'),
      clip
    };
  }
};

const runOne = async (page, target, kind) => {
  const result = {
    kind,
    atome_id: target.atomeId,
    open: null,
    before_play: null,
    play_click: null,
    samples: [],
    scrub: null,
    after_scrub: null,
    ok: false
  };
  result.open = await openMtrackForAtome(page, target.atomeId, `probe_${kind}`);
  result.webgpu_enable = await safeEval(page, async () => {
    window.__EVE_MTRAX_FORCE_WEBGPU__ = true;
    return window.eveMtrackApi?.enableWebgpuPreview?.({ iterations: 4 }) || null;
  }, null, 30000);
  await page.screenshot({ path: path.join(outDir, `${kind}_01_open.png`), fullPage: true });
  result.before_play = await collectSnapshot(page, `${kind}:before_play`);
  result.play_click = await clickPlayButton(page);
  if (process.env.ATOME_MTRACK_PROBE_DIRECT_PLAY === '1') {
    await sleep(500);
    result.direct_play = await directMtrackTransport(page, 'play');
  }
  for (let index = 0; index < 13; index += 1) {
    await sleep(1000);
    const sample = await collectSnapshot(page, `${kind}:play_${index + 1}s`);
    if (kind === 'video' && index < 6) {
      sample.preview_screenshot = await capturePreviewScreenshot(page, sample, `${kind}_play_${String(index + 1).padStart(2, '0')}.png`);
    } else if (kind === 'audio' && index === 0) {
      sample.preview_screenshot = await capturePreviewScreenshot(page, sample, `${kind}_play_01.png`);
    }
    result.samples.push(sample);
  }
  const maxTime = Math.max(0, Number(result.samples.at(-1)?.max_time || 0));
  const scrubTarget = Math.max(0.5, Math.min(maxTime > 1 ? maxTime - 0.5 : 1, 8));
  result.scrub = await scrubTo(page, scrubTarget);
  await sleep(900);
  result.after_scrub = await collectSnapshot(page, `${kind}:after_scrub_${scrubTarget}s`);
  await page.screenshot({ path: path.join(outDir, `${kind}_02_after_scrub.png`), fullPage: true });
  await safeEval(page, async () => window.eveMtrackApi?.pause?.() || null, null, 8000);

  const playheads = result.samples.map((entry) => Number(entry?.playhead || 0)).filter(Number.isFinite);
  const playheadMoved = playheads.length > 1 && Math.max(...playheads) - Math.min(...playheads) >= 8;
  const canvasPixelHashes = result.samples.map((entry) => entry?.preview_pixels?.hash).filter((hash) => Number.isFinite(Number(hash)));
  const screenshotPixelHashes = result.samples.map((entry) => entry?.preview_screenshot?.hash).filter(Boolean);
  const pixelHashes = screenshotPixelHashes.length ? screenshotPixelHashes : canvasPixelHashes;
  const uniquePixels = new Set(pixelHashes).size;
  const clipSamples = result.samples.flatMap((entry) => Array.isArray(entry?.clips) ? entry.clips : []);
  const mediaAdvanced = clipSamples.some((entry) => Number(entry?.media_current_time || 0) > 1);
  const rendererStates = result.samples.map((entry) => entry?.renderer_state).filter(Boolean);
  const rendererFrameAdvanced = rendererStates.some((state) => {
    const frame = state?.adapter_state?.last_frame_stats || null;
    return frame?.frame_presented === true
      && Number(frame?.draw_calls || 0) > 0
      && Number(frame?.textures_bound || 0) > 0;
  });
  const mediaErrors = clipSamples.filter((entry) => entry?.media_error_code || entry?.runtime_last_play_error);
  result.ok = result.play_click?.ok === true
    && playheadMoved
    && (kind === 'audio' || uniquePixels >= 3)
    && (kind === 'video' ? rendererFrameAdvanced : true)
    && mediaErrors.length === 0;
  result.summary = {
    playhead_start: playheads[0] ?? null,
    playhead_end: playheads.at(-1) ?? null,
    playhead_delta: playheads.length ? Math.max(...playheads) - Math.min(...playheads) : null,
    playhead_moved_10s_plus: playheadMoved,
    unique_pixel_hashes: uniquePixels,
    media_advanced: mediaAdvanced,
    renderer_frame_advanced: rendererFrameAdvanced,
    media_errors: mediaErrors.slice(0, 6)
  };
  return result;
};

const run = async () => {
  fs.writeFileSync(logFile, '');
  for (const file of mediaPaths) {
    if (!fs.existsSync(file)) throw new Error(`missing test media: ${file}`);
  }
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    import_result: null,
    targets: {},
    results: {},
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
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_TRACE__ = true;
    window.__EVE_HMTRACKS_AUDIO_DEBUG_LOGS__ = true;
    window.__EVE_MTRAX_FORCE_WEBGPU__ = true;
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: redactSecrets(msg.text()) };
    report.console.push(entry);
    if (/MTRACK|hmtracks|backend\.kira|playback|audio|media/i.test(entry.text)) {
      log('console', entry);
    }
  });
  page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => {
    const entry = { type: 'requestfailed', url: redactSecrets(request.url()), error: request.failure()?.errorText || null };
    report.console.push(entry);
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    const apiReady = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
    if (!apiReady.ok) throw new Error('api_not_ready');
    const login = await tryLogin(page);
    if (!login?.ok) throw new Error(`login_failed:${login?.error || JSON.stringify(login)}`);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await waitFor(page, () => window.__authCheckComplete === true, 25000);
    report.import_result = await bootstrapImport(page);
    await sleep(1600);
    await page.screenshot({ path: path.join(outDir, '00_after_import.png'), fullPage: true });

    const targets = await safeEval(page, (importResult) => {
      const rows = Array.isArray(importResult?.results) ? importResult.results : [];
      const resolve = (kind) => rows.find((entry) => String(entry?.type || '').toLowerCase() === kind) || null;
      return {
        video: resolve('video'),
        audio: resolve('sound') || resolve('audio')
      };
    }, report.import_result, 8000);
    report.targets = targets;
    if (!targets?.video?.atomeId) throw new Error('video_target_missing');
    if (!targets?.audio?.atomeId) throw new Error('audio_target_missing');

    report.results.video = await runOne(page, targets.video, 'video');
    report.results.audio = await runOne(page, targets.audio, 'audio');
    report.ok = report.results.video?.ok === true && report.results.audio?.ok === true;
    writeJson('report.json', report);
    console.log(JSON.stringify({
      ok: report.ok,
      video: report.results.video?.summary,
      audio: report.results.audio?.summary,
      reportFile
    }, null, 2));
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    fatal: error?.message || String(error || 'fatal'),
    stack: error?.stack || null
  };
  writeJson('report.json', report);
  log('fatal', { message: report.fatal });
  process.exit(1);
});
