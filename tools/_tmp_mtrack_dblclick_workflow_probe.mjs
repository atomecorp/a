import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const username = process.env.ADOLE_TEST_USERNAME || phone;
const projectName = process.env.ADOLE_TEST_PROJECT_NAME || 'MTrack Dblclick Workflow Probe';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'temp_import_tests');
const outDir = path.resolve('temp/probe_reports/mtrack_dblclick_workflow_probe');
const mediaPaths = [
  path.join(mediaDir, '0000.png'),
  path.join(mediaDir, 'atome.svg'),
  path.join(mediaDir, "Jeezs's fire.m4v"),
  path.join(mediaDir, 'test.m4a')
];
const expectedKinds = ['image', 'svg', 'video', 'audio'];

fs.mkdirSync(outDir, { recursive: true });

const redactSecrets = (text) => String(text || '')
  .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(outDir, name), redactSecrets(JSON.stringify(value, null, 2)));
};

const withTimeout = async (promise, timeoutMs, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs))
]);

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
    last = await safeEval(page, predicate, arg, Math.min(2500, intervalMs + 750));
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
      if (ok) return { ok: true, method: 'login' };
      return { ok: false, error: res?.fastify?.error || res?.tauri?.error || res?.error || 'login_failed' };
    } catch (error) {
      return { ok: false, error: error?.message || String(error || 'login_error') };
    }
  }, { phone, password }, 12000);

  if (apiResult?.ok) return apiResult;

  return safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.create) return { ok: false, error: 'AdoleAPI.auth.create unavailable' };
    try {
      const res = await api.auth.create(loginPhone, loginPassword, loginPhone, { autoLogin: true });
      const ok = !!(res?.fastify?.success || res?.tauri?.success || res?.login?.fastify?.success || res?.login?.tauri?.success);
      return { ok, method: 'create', prior_login: apiResult };
    } catch (error) {
      return { ok: false, error: error?.message || String(error || 'create_error'), prior_login: apiResult };
    }
  }, { phone, password }, 18000);
};

const prepareProject = async (page) => safeEval(page, async (input) => {
  const api = window.AdoleAPI || null;
  const isSuccess = (res) => !!(res?.ok || res?.success || res?.tauri?.success || res?.fastify?.success);
  const readProjectId = (entry) => String(entry?.id || entry?.projectId || entry?.project_id || entry?.atome_id || '').trim();
  const readProjectName = (entry) => {
    const props = entry?.properties || entry?.particles || entry?.data || {};
    return String(entry?.name || props.name || '').trim();
  };
  const readOwnerId = (entry) => {
    const props = entry?.properties || entry?.particles || entry?.data || {};
    return String(entry?.owner_id || entry?.ownerId || props.owner_id || props.ownerId || '').trim();
  };
  const projectList = (result) => [
    ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
    ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : []),
    ...(Array.isArray(result?.projects) ? result.projects : [])
  ];

  if (!api?.auth || !api?.projects?.list || !api?.projects?.setCurrent) {
    return { ok: false, error: 'required_project_api_unavailable' };
  }

  let authenticated = !!(api.auth.isAuthenticated?.() || api.auth.getCurrentInfo?.()?.user_id || api.auth.getCurrentInfo?.()?.id);
  let loginResult = null;
  if (!authenticated && typeof api.auth.login === 'function') {
    loginResult = await api.auth.login(input.phone, input.password, input.username);
    authenticated = isSuccess(loginResult) || !!api.auth.isAuthenticated?.();
  }
  if (!authenticated) return { ok: false, error: 'auth_failed', loginResult };

  let projectsResult = await api.projects.list();
  let projects = projectList(projectsResult);
  let targetProject = projects.find((entry) => readProjectName(entry) === input.projectName) || null;

  if (!targetProject && typeof api.projects.create === 'function') {
    const created = await api.projects.create(input.projectName);
    const createdId = readProjectId(created);
    if (createdId) {
      targetProject = {
        ...created,
        id: createdId,
        name: input.projectName
      };
    } else {
      projectsResult = await api.projects.list();
      projects = projectList(projectsResult);
      targetProject = projects.find((entry) => readProjectName(entry) === input.projectName) || null;
    }
  }

  if (!targetProject) {
    targetProject = projects[0] || null;
  }

  const projectId = readProjectId(targetProject);
  if (!projectId) return { ok: false, error: 'project_unavailable', projectsResult };

  const name = readProjectName(targetProject) || input.projectName;
  const ownerId = readOwnerId(targetProject) || null;
  await api.projects.setCurrent(projectId, name, ownerId, true);
  window.__currentProject = {
    ...(window.__currentProject || {}),
    id: projectId,
    name,
    owner_id: ownerId
  };
  if (window.eveToolBase?.ensureProjectLayer) {
    window.eveToolBase.ensureProjectLayer(projectId);
  }
  if (window.eveToolBase?.loadProjectAtomes) {
    await window.eveToolBase.loadProjectAtomes(projectId, { force: true }).catch(() => {});
  }
  let viewRoot = document.getElementById('view');
  if (!viewRoot) {
    viewRoot = document.createElement('div');
    viewRoot.id = 'view';
    viewRoot.style.position = 'fixed';
    viewRoot.style.left = '0px';
    viewRoot.style.top = '0px';
    viewRoot.style.width = '100%';
    viewRoot.style.height = '100%';
    viewRoot.style.overflow = 'hidden';
    viewRoot.style.pointerEvents = 'auto';
    document.body.appendChild(viewRoot);
  }
  let projectEl = document.getElementById(`project_view_${projectId}`)
    || document.querySelector(`[id^="project_view_"][data-project-id="${projectId}"]`)
    || document.querySelector('[id^="project_view_"]');
  if (!projectEl) {
    projectEl = document.createElement('div');
    projectEl.id = `project_view_${projectId}`;
    projectEl.style.position = 'fixed';
    projectEl.style.left = '0';
    projectEl.style.top = '0';
    projectEl.style.width = '100%';
    projectEl.style.height = '100%';
    projectEl.style.overflow = 'auto';
    projectEl.style.zIndex = '5';
    projectEl.style.pointerEvents = 'auto';
    viewRoot.appendChild(projectEl);
  }
  projectEl.dataset.projectId = projectId;
  projectEl.dataset.projectName = name;
  projectEl.dataset.parentId = 'view';
  projectEl.dataset.layerRole = 'project_view';

  return {
    ok: !!projectEl,
    project_id: projectId,
    project_name: name,
    project_el_id: projectEl?.id || null,
    owner_id: ownerId
  };
}, { phone, password, username, projectName }, 30000);

const importMedia = async (page) => {
  await page.evaluate(() => {
    const oldInput = document.getElementById('mtrack_dblclick_workflow_probe_input');
    if (oldInput) oldInput.remove();
    const input = document.createElement('input');
    input.id = 'mtrack_dblclick_workflow_probe_input';
    input.type = 'file';
    input.multiple = true;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#mtrack_dblclick_workflow_probe_input', mediaPaths);

  return safeEval(page, async () => {
    if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
      await import('/application/eVe/intuition/tools/project_drop.js');
    }
    const input = document.getElementById('mtrack_dblclick_workflow_probe_input');
    const entries = Array.from(input?.files || []);
    const projectEl = document.querySelector('[id^="project_view_"]');
    const projectId = window.__currentProject?.id
      || projectEl?.id?.replace(/^project_view_/, '')
      || null;
    if (!entries.length) return { ok: false, error: 'no_files_selected' };
    if (!projectId || !projectEl) return { ok: false, error: 'project_missing', projectId, hasProjectEl: !!projectEl };
    const rect = projectEl.getBoundingClientRect();
    return window.eveProjectDropApi.importFilesToProjectViaCreator({
      entries,
      event: {
        clientX: rect.left + Math.min(280, Math.max(60, rect.width / 3)),
        clientY: rect.top + Math.min(220, Math.max(60, rect.height / 3))
      },
      projectId,
      projectEl,
      origin: 'mtrack_dblclick_workflow_probe',
      sourceLayer: 'mtrack_dblclick_workflow_probe',
      actorType: 'headless_probe'
    });
  }, null, 180000);
};

const getClickPoint = async (page, atomeId) => safeEval(page, (id) => {
  const host = document.querySelector(`[data-atome-id="${CSS.escape(id)}"]`);
  if (!host) return { ok: false, error: 'host_missing', id };
  host.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = host.getBoundingClientRect();
  return {
    ok: rect.width > 0 && rect.height > 0,
    id,
    x: rect.left + (rect.width / 2),
    y: rect.top + (rect.height / 2),
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    }
  };
}, atomeId, 10000);

const arrangeImportedHosts = async (page, importedEntries, activeAtomeId = '') => safeEval(page, ({ importedEntries, activeAtomeId }) => {
  const layout = [
    { left: 72, top: 112, width: 360, height: 220 },
    { left: 504, top: 112, width: 320, height: 240 },
    { left: 72, top: 448, width: 420, height: 236 },
    { left: 560, top: 448, width: 420, height: 160 }
  ];
  const importedIds = new Set(importedEntries.map((entry) => String(entry.atomeId || '')));
  const firstImportedHost = importedEntries.length
    ? document.querySelector(`[data-atome-id="${CSS.escape(importedEntries[0].atomeId)}"]`)
    : null;
  const projectLayer = firstImportedHost?.closest?.('[id^="project_view_"]') || document.querySelector('[id^="project_view_"]');
  projectLayer?.querySelectorAll?.('[data-atome-id]')?.forEach((host) => {
    const id = String(host?.dataset?.atomeId || '');
    if (!id || importedIds.has(id)) return;
    host.style.pointerEvents = 'none';
    host.style.visibility = 'hidden';
    host.style.zIndex = '1';
  });
  importedEntries.forEach((entry, index) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(entry.atomeId)}"]`);
    if (!(host instanceof HTMLElement)) return;
    const box = layout[index] || layout[0];
    host.style.position = 'fixed';
    host.style.left = `${box.left}px`;
    host.style.top = `${box.top}px`;
    host.style.width = `${box.width}px`;
    host.style.height = `${box.height}px`;
    host.style.minWidth = '0px';
    host.style.minHeight = '0px';
    host.style.maxWidth = 'none';
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.style.pointerEvents = 'auto';
    host.style.visibility = 'visible';
    host.style.zIndex = String(entry.atomeId === activeAtomeId ? 500 : 100 + index);
  });
  return {
    ok: true,
    rects: importedEntries.map((entry) => {
      const host = document.querySelector(`[data-atome-id="${CSS.escape(entry.atomeId)}"]`);
      const rect = host?.getBoundingClientRect?.();
      return {
        atomeId: entry.atomeId,
        exists: host instanceof HTMLElement,
        rect: rect ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom
        } : null
      };
    })
  };
}, { importedEntries, activeAtomeId }, 10000);

const inspectDockedOpen = async (page, atomeId, kind) => safeEval(page, ({ id, kind }) => {
  const host = document.querySelector(`[data-atome-id="${CSS.escape(id)}"]`);
  const panel = document.getElementById('eve_mtrack_dialog');
  const previewSection = document.getElementById('eve_mtrack_dialog__preview_section');
  const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
  const hostRect = host?.getBoundingClientRect?.();
  const panelRect = panel?.getBoundingClientRect?.();
  const previewStyle = previewSection ? getComputedStyle(previewSection) : null;
  const baseHeight = Number.parseFloat(host?.dataset?.eveMtrackPreviewBaseHeight || '');
  const gap = Number.parseFloat(panel?.dataset?.eveMtrackDockGap || '');
  const expectedPanelTop = Number.isFinite(baseHeight) ? (baseHeight + (Number.isFinite(gap) ? gap : 8)) : null;
  const panelTopStyle = Number.parseFloat(panel?.style?.top || '');
  const toolsRowEl = panel?.querySelector('.eve-mtrack-tools-row') || null;
  const toolsRowRect = toolsRowEl?.getBoundingClientRect?.() || null;
  const viewport = {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0
  };
  const hostFullscreen = !!hostRect
    && hostRect.width >= viewport.width * 0.75
    && hostRect.height >= viewport.height * 0.75
    && hostRect.left <= viewport.width * 0.15
    && hostRect.top <= viewport.height * 0.15;
  const previewHalfOrLess = Number.isFinite(baseHeight)
    && baseHeight <= Math.ceil((hostRect?.height || viewport.height || 0) * 0.52);
  const toolsVisible = !!toolsRowRect
    && toolsRowRect.width > 20
    && toolsRowRect.height > 20
    && toolsRowRect.bottom <= viewport.height
    && toolsRowRect.top >= 0;
  const timelineSelectors = {
    controls: !!panel?.querySelector('.eve-mtrack-controls'),
    toolsShell: !!panel?.querySelector('.eve-mtrack-tools-shell'),
    toolsRow: !!panel?.querySelector('.eve-mtrack-tools-row'),
    scroll: !!panel?.querySelector('.eve-mtrack-scroll'),
    timeline: !!panel?.querySelector('.eve-mtrack-timeline'),
    ruler: !!panel?.querySelector('.eve-mtrack-ruler'),
    tracks: !!panel?.querySelector('.eve-mtrack-tracks'),
    trackRows: panel?.querySelectorAll('.eve-mtrack-track')?.length || 0,
    loopCellsPanel: !!panel?.querySelector('.eve-mtrack-loop-cells-panel'),
    loopCellsHeaders: panel?.querySelectorAll('.eve-mtrack-loop-cells-header')?.length || 0,
    trackTools: panel?.querySelectorAll('.eve-mtrack-track-tool')?.length || 0
  };
  const previewLeak = {
    internalPreviewDisplayed: !!previewSection && previewStyle?.display !== 'none',
    internalPreviewCanvasCount: previewHost?.querySelectorAll('canvas, video, img, svg')?.length || 0,
    hostWaveformCount: host?.querySelectorAll('.eve-mtrack-clip-waveform-svg')?.length || 0,
    hostMtrackClipCount: host?.querySelectorAll('.eve-mtrack-clip')?.length || 0,
    hostOverlayWaveformCount: host?.querySelectorAll('[data-role="mtrax-gpu-overlay"] .eve-mtrack-clip-waveform-svg')?.length || 0
  };
  const debug = {
    appState: window.__DEBUG__?.getAppState?.() || null,
    timelineState: window.__DEBUG__?.getTimelineState?.() || null,
    mtrackState: window.eveMtrackApi?.getState?.() || null
  };
  const invariants = {
    hostExists: host instanceof HTMLElement,
    panelExists: panel instanceof HTMLElement,
    panelVisible: !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden',
    panelParentIsHost: !!host && !!panel && panel.parentElement === host,
    panelDockedFlag: panel?.dataset?.eveMtrackDocked === 'true',
    panelPreviewExternalizedFlag: panel?.dataset?.eveMtrackPreviewExternalized === 'true',
    hostEditModeFlag: host?.dataset?.eveMtrackEditMode === 'true',
    internalPreviewHidden: !!previewSection && previewStyle?.display === 'none',
    hostFullscreen,
    previewHalfOrLess,
    toolsVisible,
    timelineStructureIntact: !!(
      timelineSelectors.controls
      && timelineSelectors.toolsShell
      && timelineSelectors.toolsRow
      && timelineSelectors.scroll
      && timelineSelectors.timeline
      && timelineSelectors.ruler
      && timelineSelectors.tracks
      && timelineSelectors.loopCellsPanel
      && timelineSelectors.trackRows > 0
      && timelineSelectors.trackTools > 0
    ),
    panelTopBelowPreview: Number.isFinite(panelTopStyle) && Number.isFinite(baseHeight) && panelTopStyle >= baseHeight,
    waveformNotInPreview: previewLeak.hostWaveformCount === 0 && previewLeak.hostOverlayWaveformCount === 0
  };
  return {
    ok: Object.values(invariants).every(Boolean),
    id,
    kind,
    hostDataset: host ? { ...host.dataset } : null,
    panelDataset: panel ? { ...panel.dataset } : null,
    hostRect: hostRect ? {
      left: hostRect.left,
      top: hostRect.top,
      width: hostRect.width,
      height: hostRect.height,
      bottom: hostRect.bottom
    } : null,
    panelRect: panelRect ? {
      left: panelRect.left,
      top: panelRect.top,
      width: panelRect.width,
      height: panelRect.height,
      bottom: panelRect.bottom
    } : null,
    baseHeight,
    expectedPanelTop,
    panelTopStyle,
    viewport,
    toolsRowRect: toolsRowRect ? {
      left: toolsRowRect.left,
      top: toolsRowRect.top,
      width: toolsRowRect.width,
      height: toolsRowRect.height,
      bottom: toolsRowRect.bottom
    } : null,
    previewSectionDisplay: previewStyle?.display || null,
    timelineSelectors,
    previewLeak,
    invariants,
    debug
  };
}, { id: atomeId, kind }, 20000);

const closeMtrack = async (page, atomeId) => {
  await safeEval(page, async () => {
    if (typeof window.close_mtrack_panel === 'function') {
      window.close_mtrack_panel();
      return { ok: true, route: 'close_mtrack_panel' };
    }
    const closeButton = document.getElementById('eve_mtrack_dialog__close');
    if (closeButton) {
      closeButton.click();
      return { ok: true, route: 'close_button' };
    }
    return { ok: false, error: 'close_unavailable' };
  }, null, 10000);
  return waitFor(page, (id) => {
    const host = document.querySelector(`[data-atome-id="${CSS.escape(id)}"]`);
    const panel = document.getElementById('eve_mtrack_dialog');
    const panelVisible = !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden';
    return {
      ok: !panelVisible
        && host instanceof HTMLElement
        && host.dataset.eveMtrackEditMode !== 'true'
        && host.dataset.eveMtrackPreviewBaseHeight == null,
      panelVisible,
      hostEditMode: host?.dataset?.eveMtrackEditMode || null,
      hostStillExists: host instanceof HTMLElement
    };
  }, 20000, 250, atomeId);
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
    targets: [],
    console: [],
    errors: []
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await context.addInitScript(() => {
    window.__CHECK_DEBUG__ = true;
    window.__EVE_MEDIA_DIAG_HEADLESS__ = true;
    window.__EVE_MTRAX_BRIDGE_LOGS__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = redactSecrets(msg.text());
    if (report.console.length < 500) report.console.push({ type: msg.type(), text });
  });
  page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => {
    const urlText = redactSecrets(request.url());
    if (!urlText.startsWith('blob:')) {
      report.errors.push({ type: 'requestfailed', url: urlText, error: request.failure()?.errorText || null });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    const apiReady = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000);
    if (!apiReady.ok) throw new Error('api_not_ready');
    const login = await tryLogin(page);
    if (!login?.ok) throw new Error(`login_failed:${login?.error || JSON.stringify(login)}`);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await waitFor(page, () => (
      window.__authCheckComplete === true
      && !!window.AdoleAPI?.projects?.list
      && !!window.AdoleAPI?.projects?.setCurrent
    ), 30000);
    report.project = await prepareProject(page);
    if (!report.project?.ok) throw new Error(`project_prepare_failed:${report.project?.error || JSON.stringify(report.project)}`);
    await safeEval(page, () => {
      window.__DEBUG__?.setDeterministicTestMode?.(true);
      window.close_mtrack_panel?.();
      return { ok: true };
    }, null, 10000);

    report.import_result = await importMedia(page);
    if (!report.import_result?.ok) {
      throw new Error(`import_failed:${report.import_result?.error || JSON.stringify(report.import_result)}`);
    }
    const importedEntries = (report.import_result.results || []).map((entry, index) => ({
      atomeId: entry.atomeId,
      kind: expectedKinds[index] || entry.type || 'unknown',
      file: path.basename(mediaPaths[index] || '')
    })).filter((entry) => entry.atomeId);

    const domReady = await waitFor(page, ({ importedEntries }) => {
      const entries = importedEntries.map((entry) => {
        const host = document.querySelector(`[data-atome-id="${CSS.escape(entry.atomeId)}"]`);
        return {
          atomeId: entry.atomeId,
          exists: host instanceof HTMLElement,
          renderer: host?.dataset?.eveMediaRenderer || null,
          ready: host?.dataset?.mediaApiReady || null,
          error: host?.dataset?.mediaApiError || null
        };
      });
      return {
        ok: entries.every((entry) => entry.exists),
        entries
      };
    }, 45000, 500, { importedEntries });
    report.dom_ready = domReady;
    if (!domReady.ok) throw new Error(`imported_dom_not_ready:${JSON.stringify(domReady.last)}`);

    const visualReady = await waitFor(page, ({ importedEntries }) => importedEntries.every((entry) => {
      const host = document.querySelector(`[data-atome-id="${CSS.escape(entry.atomeId)}"]`);
      if (!host) return false;
      if (entry.kind === 'audio') return host.dataset.eveMediaRenderer === 'webgpu+kira';
      return host.dataset.mediaApiReady === 'true' || !!host.dataset.mediaApiError;
    }), 12000, 500, { importedEntries });
    report.visual_ready = visualReady;

    await page.screenshot({ path: path.join(outDir, '01_after_import.png'), fullPage: true });

    for (const target of importedEntries) {
      await safeEval(page, () => window.close_mtrack_panel?.(), null, 10000);
      await page.waitForTimeout(350);
      target.arrange = await arrangeImportedHosts(page, importedEntries, target.atomeId);
      const point = await getClickPoint(page, target.atomeId);
      if (!point?.ok) {
        report.targets.push({ ...target, ok: false, error: point?.error || 'click_point_failed', point });
        continue;
      }
      await page.mouse.dblclick(point.x, point.y, { delay: 60 });
      const opened = await waitFor(page, (id) => {
        const host = document.querySelector(`[data-atome-id="${CSS.escape(id)}"]`);
        const panel = document.getElementById('eve_mtrack_dialog');
        const panelVisible = !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden';
        const mtrackState = window.eveMtrackApi?.getState?.() || {};
        const activeGroupId = String(mtrackState.activeGroupId || mtrackState.groupId || '').trim();
        return {
          ok: panel instanceof HTMLElement
            && host instanceof HTMLElement
            && panel.parentElement === host
            && panel.dataset?.eveMtrackDocked === 'true'
            && panel.dataset?.eveMtrackPreviewExternalized === 'true',
          panelVisible,
          activeGroupId,
          panelParentId: panel?.parentElement?.dataset?.atomeId || panel?.parentElement?.id || null,
          panelDataset: panel ? { ...panel.dataset } : null,
          hostDataset: host ? { ...host.dataset } : null
        };
      }, 15000, 200, target.atomeId);
      await page.waitForTimeout(900);
      const inspection = await inspectDockedOpen(page, target.atomeId, target.kind);
      await page.screenshot({ path: path.join(outDir, `02_${target.kind}_docked.png`), fullPage: true });
      const closed = await closeMtrack(page, target.atomeId);
      const targetReport = {
        ...target,
        ok: opened.ok && inspection.ok && closed.ok,
        point,
        opened,
        inspection,
        closed
      };
      report.targets.push(targetReport);
    }

    report.final_state = await safeEval(page, () => ({
      appState: window.__DEBUG__?.getAppState?.() || null,
      timelineState: window.__DEBUG__?.getTimelineState?.() || null,
      mtrackState: window.eveMtrackApi?.getState?.() || null
    }), null, 20000);
    report.ok = report.targets.length > 0 && report.targets.every((entry) => entry.ok === true);
  } catch (error) {
    report.errors.push({ type: 'fatal', text: error?.message || String(error || 'fatal') });
  } finally {
    await page.screenshot({ path: path.join(outDir, '99_final.png'), fullPage: true }).catch(() => {});
    await browser.close().catch(() => {});
    writeJson('report.json', report);
  }

  if (!report.ok) {
    console.error(JSON.stringify({
      ok: report.ok,
      targets: report.targets.map((entry) => ({
        kind: entry.kind,
        atomeId: entry.atomeId,
        ok: entry.ok,
        opened: entry.opened?.ok,
        inspection: entry.inspection?.ok,
        closed: entry.closed?.ok,
        invariants: entry.inspection?.invariants || null,
        error: entry.error || null
      })),
      errors: report.errors
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: report.ok,
    targets: report.targets.map((entry) => ({
      kind: entry.kind,
      atomeId: entry.atomeId,
      ok: entry.ok,
      trackRows: entry.inspection?.timelineSelectors?.trackRows || 0,
      loopCellsHeaders: entry.inspection?.timelineSelectors?.loopCellsHeaders || 0
    })),
    report: path.join(outDir, 'report.json')
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
