import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const outDir = path.resolve('tools/headless_output');
const outFile = path.join(outDir, 'panel_palette_zorder_probe.json');

fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 120, arg = null) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate, arg)) return true;
    } catch (_) {
      // ignore transient boot churn
    }
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
      ok: false,
      error: String(error?.message || error || 'eval_failed')
    };
  }
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    ok: false,
    assertions: [],
    console: [],
    steps: {}
  };

  const assert = (name, ok, detail = null) => {
    report.assertions.push({ name, ok: !!ok, detail });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.console.push({
      type: msg.type(),
      text: msg.text()
    });
  });
  page.on('pageerror', (error) => {
    report.console.push({
      type: 'pageerror',
      text: String(error?.message || error)
    });
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(1200);

    const auth = await safeEval(page, async (creds) => {
      const isSuccess = (res) => !!(
        res?.ok
        || res?.success
        || res?.tauri?.success
        || res?.fastify?.success
      );
      if (!window.AdoleAPI?.auth?.login) {
        return { ok: false, error: 'login_api_missing' };
      }
      try {
        let loginResult = await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
        if (!isSuccess(loginResult) && typeof window.AdoleAPI.auth.create === 'function') {
          await window.AdoleAPI.auth.create(creds.phone, creds.password, creds.phone, 'public');
          loginResult = await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
        }
        return {
          ok: !!(window.AdoleAPI.auth.isAuthenticated?.() || isSuccess(loginResult)),
          loginResult: loginResult || null
        };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }, { phone, password }, { ok: false, error: 'auth_eval_failed' });
    report.steps.auth = auth;
    assert('auth_ok', auth?.ok === true, auth);

    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2500);

    const runtimeReady = await waitFor(
      page,
      () => !!(
        window.AdoleAPI?.projects
        && window.eveToolBase
        && window.atome?.tools?.v2Runtime
        && window.eveProjectDropApi
      ),
      30000
    );
    assert('runtime_ready', runtimeReady);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    const setup = await safeEval(page, async () => {
      const firstNonEmpty = (...values) => values.find((value) => String(value || '').trim()) || '';
      const extractId = (value) => String(
        value?.id
        || value?.atome_id
        || value?.data?.id
        || value?.data?.atome_id
        || value?.tauri?.data?.id
        || value?.tauri?.data?.atome_id
        || value?.fastify?.data?.id
        || value?.fastify?.data?.atome_id
        || ''
      ).trim();
      const listProjects = async () => {
        const listed = await window.AdoleAPI.projects.list();
        return [
          ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
          ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
        ];
      };
      const pickProject = (projects, preferredName = '') => {
        if (!Array.isArray(projects) || !projects.length) return null;
        const normalizedPreferredName = String(preferredName || '').trim().toLowerCase();
        if (normalizedPreferredName) {
          const named = projects.find((entry) => {
            const props = entry?.properties || entry?.particles || entry?.data || {};
            return String(props?.name || entry?.name || '').trim().toLowerCase() === normalizedPreferredName;
          });
          if (named) return named;
        }
        return projects[0] || null;
      };

      const probeName = 'codex_zorder_probe';
      let projects = await listProjects();
      let project = pickProject(projects, probeName);
      if (!project && typeof window.AdoleAPI.projects.create === 'function') {
        await window.AdoleAPI.projects.create(probeName).catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, 240));
        projects = await listProjects();
        project = pickProject(projects, probeName);
      }
      const projectId = String(project?.id || project?.atome_id || '').trim();
      if (!projectId) return { ok: false, error: 'project_missing' };

      await window.AdoleAPI.projects.setCurrent(
        projectId,
        String(project?.properties?.name || project?.name || 'project').trim() || 'project',
        project?.owner_id || null,
        true
      );
      await window.eveToolBase?.loadProjectAtomes?.(projectId).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const {
        buildToolShortcutCreateSpec
      } = await import('/src/application/eVe/intuition/shared/tool_shortcut_visual.js');
      const {
        rebalanceProjectionDynamicToolboxes
      } = await import('/src/application/eVe/intuition/tools/project_drop.js');

      const baseLeft = 280;
      const baseTop = 240;
      const createShortcut = async (offsetX, label, toolId, nameKey) => {
        const created = await window.eveToolBase.createAtome(buildToolShortcutCreateSpec({
          projectId,
          left: baseLeft + offsetX,
          top: baseTop,
          label,
          toolId,
          toolNameKey: nameKey
        }));
        return {
          raw: created,
          atomeId: extractId(created)
        };
      };

      const first = await createShortcut(0, 'Finder', 'ui.find.panel', 'find');
      const second = await createShortcut(78, 'Infos', 'ui.info.panel', 'info');
      if (!first.atomeId || !second.atomeId) {
        return {
          ok: false,
          error: 'tool_shortcut_create_failed',
          first,
          second
        };
      }

      const hostSelector = `[data-tool-shortcut="true"][data-atome-id="${first.atomeId}"], [data-tool-shortcut="true"][data-atome-id="${second.atomeId}"]`;
      const waitStart = Date.now();
      while ((Date.now() - waitStart) < 6000) {
        const count = document.querySelectorAll(hostSelector).length;
        if (count >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      await rebalanceProjectionDynamicToolboxes({ projectId });
      await new Promise((resolve) => setTimeout(resolve, 120));

      const toolbox = Array.from(document.querySelectorAll('[data-eve-projection-toolbox="true"]'))
        .find((node) => String(node?.dataset?.projectId || node?.dataset?.project_id || '').trim() === projectId)
        || null;

      const runtime = window.atome?.tools?.v2Runtime || null;
      if (!runtime?.invokeById) {
        return { ok: false, error: 'runtime_invoke_missing', projectId };
      }
      const panelResult = await runtime.invokeById({
        tool_id: 'ui.find.panel',
        action: 'pointer.click',
        input: {},
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'panel_palette_zorder_probe' }
      });

      await new Promise((resolve) => setTimeout(resolve, 250));

      const panelCandidates = Array.from(document.querySelectorAll('#intuition_panel_layer > [data-eve-panel="true"], #intuition_panel_layer > [id^="eve_"][id$="_dialog"]'))
        .filter((node) => node instanceof HTMLElement)
        .filter((node) => !String(node.id || '').includes('atome_editor'));
      const panel = document.getElementById('eve_finder_dialog')
        || panelCandidates.find((node) => String(node.id || '').trim() !== '')
        || panelCandidates[0]
        || null;

      const toolboxRect = toolbox?.getBoundingClientRect?.() || null;
      if (toolbox instanceof HTMLElement && panel instanceof HTMLElement && toolboxRect) {
        panel.style.left = `${Math.max(120, Math.round(toolboxRect.left - 20))}px`;
        panel.style.top = `${Math.max(80, Math.round(toolboxRect.top - 16))}px`;
        panel.style.width = '420px';
        panel.style.height = '340px';
      }

      const describeNode = (node) => {
        if (!(node instanceof Element)) return null;
        return {
          tag: String(node.tagName || '').toLowerCase(),
          id: String(node.id || ''),
          className: String(node.className || ''),
          role: String(node.getAttribute?.('data-role') || ''),
          evePanel: String(node.getAttribute?.('data-eve-panel') || ''),
          eveSystemLayer: String(node.getAttribute?.('data-eve-system-layer') || ''),
          requiredLayer: String(node.getAttribute?.('data-eve-required-layer') || ''),
          projectionToolbox: String(node.getAttribute?.('data-eve-projection-toolbox') || ''),
          zIndex: String(node.style?.zIndex || ''),
          computedZIndex: (() => {
            try { return String(window.getComputedStyle(node).zIndex || ''); } catch (_) { return ''; }
          })()
        };
      };

      const resolveProbePoint = () => {
        const freshToolboxRect = toolbox?.getBoundingClientRect?.() || null;
        const panelRect = panel?.getBoundingClientRect?.() || null;
        if (!freshToolboxRect || !panelRect) return { x: 340, y: 280 };
        const left = Math.max(freshToolboxRect.left + 24, panelRect.left + 24);
        const right = Math.min(freshToolboxRect.right - 24, panelRect.right - 24);
        const top = Math.max(freshToolboxRect.top + 24, panelRect.top + 24);
        const bottom = Math.min(freshToolboxRect.bottom - 24, panelRect.bottom - 24);
        if (right > left && bottom > top) {
          return {
            x: Math.round((left + right) / 2),
            y: Math.round((top + bottom) / 2)
          };
        }
        return {
          x: Math.round(panelRect.left + Math.min(80, panelRect.width / 2)),
          y: Math.round(panelRect.top + Math.min(80, panelRect.height / 2))
        };
      };

      const attachLayerWatch = () => {
        const targets = [
          document.getElementById('intuition_panel_layer'),
          document.getElementById('intuition_floating_group_layer'),
          document.getElementById('intuition-floating-layer'),
          toolbox,
          panel
        ].filter((node) => node instanceof Element);
        const logs = [];
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (!(mutation.target instanceof Element)) return;
            logs.push({
              type: mutation.type,
              target: describeNode(mutation.target),
              attributeName: mutation.attributeName || '',
              style: String(mutation.target.getAttribute('style') || '')
            });
          });
        });
        targets.forEach((target) => {
          observer.observe(target, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true
          });
        });
        window.__codexZOrderProbeObserver = { observer, logs };
      };

      const readSnapshot = (label) => {
        const point = resolveProbePoint();
        const stack = typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(point.x, point.y)
          : [];
        return {
          label,
          point,
          panelLayer: describeNode(document.getElementById('intuition_panel_layer')),
          floatingGroupLayer: describeNode(document.getElementById('intuition_floating_group_layer')),
          legacyFloatingLayer: describeNode(document.getElementById('intuition-floating-layer')),
          toolbox: describeNode(toolbox),
          panel: describeNode(panel),
          stack: stack.slice(0, 8).map(describeNode)
        };
      };

      attachLayerWatch();

      return {
        ok: !!(toolbox && panel),
        projectId,
        first,
        second,
        panelResult,
        toolbox: describeNode(toolbox),
        panel: describeNode(panel),
        initial: readSnapshot('initial')
      };
    }, null, { ok: false, error: 'setup_eval_failed' });
    report.steps.setup = setup;
    assert('setup_ok', setup?.ok === true, setup);
    if (setup?.ok !== true) throw new Error(setup?.error || 'setup_failed');

    await sleep(150);

    const afterResize = await safeEval(page, async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => setTimeout(resolve, 180));
      const probe = window.__codexZOrderProbeObserver || { logs: [] };
      const point = (() => {
        const panel = document.getElementById('eve_finder_dialog') || document.querySelector('#intuition_panel_layer > [data-eve-panel="true"]');
        const toolbox = document.querySelector('[data-eve-projection-toolbox="true"]');
        const panelRect = panel?.getBoundingClientRect?.() || null;
        const toolboxRect = toolbox?.getBoundingClientRect?.() || null;
        if (panelRect && toolboxRect) {
          const x = Math.round(Math.max(toolboxRect.left + 24, panelRect.left + 24));
          const y = Math.round(Math.max(toolboxRect.top + 24, panelRect.top + 24));
          return { x, y };
        }
        return { x: 340, y: 280 };
      })();
      const describeNode = (node) => {
        if (!(node instanceof Element)) return null;
        return {
          tag: String(node.tagName || '').toLowerCase(),
          id: String(node.id || ''),
          className: String(node.className || ''),
          role: String(node.getAttribute?.('data-role') || ''),
          evePanel: String(node.getAttribute?.('data-eve-panel') || ''),
          eveSystemLayer: String(node.getAttribute?.('data-eve-system-layer') || ''),
          requiredLayer: String(node.getAttribute?.('data-eve-required-layer') || ''),
          projectionToolbox: String(node.getAttribute?.('data-eve-projection-toolbox') || ''),
          zIndex: String(node.style?.zIndex || ''),
          computedZIndex: (() => {
            try { return String(window.getComputedStyle(node).zIndex || ''); } catch (_) { return ''; }
          })()
        };
      };
      return {
        point,
        stack: document.elementsFromPoint(point.x, point.y).slice(0, 8).map(describeNode),
        logs: Array.isArray(probe.logs) ? probe.logs.slice(-20) : []
      };
    }, null, { ok: false, error: 'after_resize_failed' });
    report.steps.after_resize = afterResize;

    if (afterResize?.point?.x && afterResize?.point?.y) {
      await page.mouse.move(afterResize.point.x, afterResize.point.y);
      await page.mouse.move(afterResize.point.x + 8, afterResize.point.y + 6);
    } else {
      await page.mouse.move(340, 280);
      await page.mouse.move(348, 286);
    }
    await sleep(180);

    const afterMove = await safeEval(page, async () => {
      const probe = window.__codexZOrderProbeObserver || { logs: [] };
      const panel = document.getElementById('eve_finder_dialog') || document.querySelector('#intuition_panel_layer > [data-eve-panel="true"]');
      const toolbox = document.querySelector('[data-eve-projection-toolbox="true"]');
      const panelRect = panel?.getBoundingClientRect?.() || null;
      const toolboxRect = toolbox?.getBoundingClientRect?.() || null;
      const x = panelRect && toolboxRect
        ? Math.round(Math.max(toolboxRect.left + 24, panelRect.left + 24))
        : 348;
      const y = panelRect && toolboxRect
        ? Math.round(Math.max(toolboxRect.top + 24, panelRect.top + 24))
        : 286;
      const describeNode = (node) => {
        if (!(node instanceof Element)) return null;
        return {
          tag: String(node.tagName || '').toLowerCase(),
          id: String(node.id || ''),
          className: String(node.className || ''),
          role: String(node.getAttribute?.('data-role') || ''),
          evePanel: String(node.getAttribute?.('data-eve-panel') || ''),
          eveSystemLayer: String(node.getAttribute?.('data-eve-system-layer') || ''),
          requiredLayer: String(node.getAttribute?.('data-eve-required-layer') || ''),
          projectionToolbox: String(node.getAttribute?.('data-eve-projection-toolbox') || ''),
          zIndex: String(node.style?.zIndex || ''),
          computedZIndex: (() => {
            try { return String(window.getComputedStyle(node).zIndex || ''); } catch (_) { return ''; }
          })()
        };
      };
      return {
        point: { x, y },
        stack: document.elementsFromPoint(x, y).slice(0, 8).map(describeNode),
        logs: Array.isArray(probe.logs) ? probe.logs.slice(-60) : []
      };
    }, null, { ok: false, error: 'after_move_failed' });
    report.steps.after_move = afterMove;

    const topAfterResize = afterResize?.stack?.[0] || null;
    const topAfterMove = afterMove?.stack?.[0] || null;
    assert('panel_top_after_resize', topAfterResize?.evePanel === 'true' || topAfterResize?.requiredLayer === 'intuition_panel_layer', topAfterResize);
    assert('panel_top_after_move', topAfterMove?.evePanel === 'true' || topAfterMove?.requiredLayer === 'intuition_panel_layer', topAfterMove);

    report.ok = report.assertions.every((entry) => entry.ok === true);
  } catch (error) {
    report.error = String(error?.message || error || 'probe_failed');
  } finally {
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await browser.close();
  }

  console.log(JSON.stringify({
    ok: report.ok,
    out_file: outFile,
    assertions: report.assertions,
    error: report.error || null
  }, null, 2));
};

await run();
