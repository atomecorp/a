import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const username = process.env.ADOLE_TEST_USERNAME || phone;
const projectName = process.env.ADOLE_TEST_PROJECT_NAME || 'eVe Business Validation';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_business_validation.json');

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch {
      // ignore and retry
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    checks: [],
    details: null
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', (err) => {
    report.checks.push({
      name: 'pageerror',
      ok: false,
      error: err?.message || String(err)
    });
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1365, height: 900 });

    const apiReady = await waitFor(page, () => !!window.AdoleAPI, 30000);
    report.checks.push({ name: 'api_ready', ok: apiReady });
    if (!apiReady) throw new Error('adole_api_unavailable');

    const runtimeReady = await waitFor(
      page,
      () => !!(window.atome?.tools?.v2Runtime && window.atome?.tools?.v2CommandBus),
      30000
    );
    report.checks.push({ name: 'runtime_ready', ok: runtimeReady });
    if (!runtimeReady) throw new Error('runtime_v2_unavailable');

    const integration = await page.evaluate(async (payload) => {
      const { phone, password, username, projectName } = payload;
      const api = window.AdoleAPI || null;
      const tools = window.atome?.tools || {};
      const out = {
        auth: null,
        project: null,
        atomeCreate: null,
        atomeFound: null,
        circleInvoke: null,
        textInvoke: null,
        matrixInvoke: null,
        matrixCloseInvoke: null,
        commandBusCircleAccepted: false,
        commandBusTextAccepted: false,
        commandBusMatrixAccepted: false,
        commandBusContinuousClosed: false,
        routingLogHasLegacyFallback: null,
        errors: []
      };

      const isSuccess = (res) => !!(
        res?.ok
        || res?.success
        || res?.tauri?.success
        || res?.fastify?.success
      );

      const pickProjectFromList = (listResult, preferredName) => {
        const list = [
          ...(Array.isArray(listResult?.tauri?.projects) ? listResult.tauri.projects : []),
          ...(Array.isArray(listResult?.fastify?.projects) ? listResult.fastify.projects : [])
        ];
        if (!list.length) return null;
        const named = list.find((entry) => {
          const props = entry?.properties || entry?.particles || entry?.data || {};
          return String(props?.name || '').trim().toLowerCase() === String(preferredName || '').trim().toLowerCase();
        });
        return named || list[0];
      };

      try {
        if (!api?.auth?.login || !api?.projects?.list || !api?.atomes?.create) {
          throw new Error('required_api_missing');
        }

        let loginResult = await api.auth.login(phone, password, username);
        if (!isSuccess(loginResult) && typeof api.auth.create === 'function') {
          await api.auth.create(phone, password, username, 'public');
          loginResult = await api.auth.login(phone, password, username);
        }

        const authenticated = !!(api.auth.isAuthenticated?.() || false);
        const authInfo = api.auth.getCurrentInfo?.() || null;
        out.auth = {
          authenticated,
          info: authInfo,
          loginResult
        };
        if (!authenticated) throw new Error('auth_failed');

        let listProjects = await api.projects.list();
        let project = pickProjectFromList(listProjects, projectName);
        if (!project && typeof api.projects.create === 'function') {
          await api.projects.create(projectName);
          listProjects = await api.projects.list();
          project = pickProjectFromList(listProjects, projectName);
        }
        if (!project) throw new Error('project_unavailable');

        const projectProps = project?.properties || project?.particles || project?.data || {};
        const projectId = String(project?.id || project?.atome_id || '').trim();
        const ownerId = project?.owner_id || project?.ownerId || projectProps?.owner_id || null;
        const resolvedProjectName = String(projectProps?.name || projectName || 'project').trim() || 'project';
        if (!projectId) throw new Error('project_id_missing');

        if (typeof api.projects.setCurrent === 'function') {
          await api.projects.setCurrent(projectId, resolvedProjectName, ownerId || null, true);
        }
        if (window.eveToolBase?.loadProjectAtomes) {
          await window.eveToolBase.loadProjectAtomes(projectId).catch(() => {});
        }
        out.project = {
          id: projectId,
          name: resolvedProjectName
        };

        const uniqueTag = `business_validation_${Date.now()}`;
        out.atomeCreate = await api.atomes.create({
          type: 'note',
          project_id: projectId,
          particles: {
            name: uniqueTag,
            text: 'headless business validation'
          }
        });

        const listAtomes = await api.atomes.list({
          project_id: projectId,
          include_deleted: false,
          limit: 300
        });
        const atomes = [
          ...(Array.isArray(listAtomes?.tauri?.atomes) ? listAtomes.tauri.atomes : []),
          ...(Array.isArray(listAtomes?.fastify?.atomes) ? listAtomes.fastify.atomes : [])
        ];
        out.atomeFound = atomes.some((entry) => {
          const props = entry?.properties || entry?.particles || entry?.data || {};
          return String(props?.name || '').trim() === uniqueTag;
        });

        if (typeof tools.setStranglerFlags === 'function') {
          tools.setStranglerFlags({
            runtimeV2: true,
            gatewayStrict: true,
            uiInstanceV2: true
          });
        }

        const gateway = (await import('/application/eVe/intuition/runtime/tool_gateway.js')).invokeToolGateway;
        const bus = tools.v2CommandBus;
        if (bus?.clear) bus.clear();

        out.circleInvoke = await gateway({
          tool_id: 'ui.circle',
          action: 'pointer.click',
          input: {
            x: 220,
            y: 220,
            radius: 18,
            project_id: projectId
          },
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });

        out.textInvoke = await gateway({
          tool_id: 'ui.text.create',
          action: 'pointer.click',
          input: {
            x: 260,
            y: 280,
            project_id: projectId
          },
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });

        out.matrixInvoke = await gateway({
          tool_id: 'ui.matrix.view',
          action: 'open',
          input: {},
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });
        out.matrixCloseInvoke = await gateway({
          tool_id: 'ui.matrix.view',
          action: 'close',
          input: {},
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });

        await gateway({
          tool_id: 'ui.move',
          action: 'drag.start',
          input: { atome_id: 'headless_move_target', left: 10, top: 10, project_id: projectId },
          meta: { tx_id: 'biz_tx_1' },
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });
        await gateway({
          tool_id: 'ui.move',
          action: 'drag.frame',
          input: { atome_id: 'headless_move_target', left: 30, top: 34, project_id: projectId },
          meta: { tx_id: 'biz_tx_1' },
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });
        await gateway({
          tool_id: 'ui.move',
          action: 'drag.end',
          input: { atome_id: 'headless_move_target', left: 40, top: 41, project_id: projectId },
          meta: { tx_id: 'biz_tx_1' },
          source: { type: 'business_validation', layer: 'headless' },
          presentation: 'ui'
        });

        const accepted = bus?.listEvents?.({ kind: 'command_accepted' }) || [];
        const closed = bus?.listEvents?.({ kind: 'continuous_closed' }) || [];
        out.commandBusCircleAccepted = accepted.some((entry) => {
          return String(entry?.envelope?.meta?.tool_key || '').trim() === 'circle';
        });
        out.commandBusTextAccepted = accepted.some((entry) => {
          return String(entry?.envelope?.meta?.tool_key || '').trim() === 'text_create';
        });
        out.commandBusMatrixAccepted = accepted.some((entry) => {
          return String(entry?.envelope?.meta?.tool_key || '').trim() === 'matrix_view';
        });
        out.commandBusContinuousClosed = closed.length > 0;

        const routingLog = Array.isArray(window.atome?.tools?.gatewayRoutingLog)
          ? window.atome.tools.gatewayRoutingLog
          : [];
        out.routingLogHasLegacyFallback = routingLog.some((entry) => {
          const route = String(entry?.route || '').toLowerCase();
          return route.includes('legacy_fallback') || route.includes('legacy_runtime');
        });
      } catch (error) {
        out.errors.push(String(error?.message || error));
      }

      return out;
    }, { phone, password, username, projectName });

    report.details = integration;

    report.checks.push({
      name: 'auth_authenticated',
      ok: !!integration?.auth?.authenticated
    });
    report.checks.push({
      name: 'project_ready',
      ok: !!integration?.project?.id
    });
    report.checks.push({
      name: 'atome_create_success',
      ok: !!(
        integration?.atomeCreate?.ok
        || integration?.atomeCreate?.success
        || integration?.atomeCreate?.tauri?.success
        || integration?.atomeCreate?.fastify?.success
      ),
      details: integration?.atomeCreate || null
    });
    report.checks.push({
      name: 'atome_list_contains_created',
      ok: integration?.atomeFound === true
    });
    report.checks.push({
      name: 'circle_runtime_success',
      ok: integration?.circleInvoke?.ok === true
        && integration?.circleInvoke?.tool_key === 'circle',
      details: integration?.circleInvoke || null
    });
    report.checks.push({
      name: 'text_runtime_success',
      ok: integration?.textInvoke?.ok === true
        && integration?.textInvoke?.tool_key === 'text_create',
      details: integration?.textInvoke || null
    });
    report.checks.push({
      name: 'matrix_runtime_success',
      ok: integration?.matrixInvoke?.ok === true
        && integration?.matrixInvoke?.tool_key === 'matrix_view',
      details: integration?.matrixInvoke || null
    });
    report.checks.push({
      name: 'matrix_close_runtime_success',
      ok: integration?.matrixCloseInvoke?.ok === true
        && integration?.matrixCloseInvoke?.tool_key === 'matrix_view',
      details: integration?.matrixCloseInvoke || null
    });
    report.checks.push({
      name: 'command_bus_circle_accepted',
      ok: integration?.commandBusCircleAccepted === true
    });
    report.checks.push({
      name: 'command_bus_text_accepted',
      ok: integration?.commandBusTextAccepted === true
    });
    report.checks.push({
      name: 'command_bus_matrix_accepted',
      ok: integration?.commandBusMatrixAccepted === true
    });
    report.checks.push({
      name: 'continuous_closed_emitted',
      ok: integration?.commandBusContinuousClosed === true
    });
    report.checks.push({
      name: 'no_legacy_fallback_route',
      ok: integration?.routingLogHasLegacyFallback === false
    });

    if (Array.isArray(integration?.errors) && integration.errors.length) {
      report.checks.push({
        name: 'integration_errors',
        ok: false,
        details: integration.errors
      });
    }
  } catch (error) {
    report.checks.push({
      name: 'runner',
      ok: false,
      error: error?.message || String(error)
    });
  } finally {
    await browser.close();
  }

  report.ok = report.checks.every((entry) => entry.ok === true);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, ok: report.ok, checks: report.checks }, null, 2));
  process.exit(report.ok ? 0 : 1);
};

run().catch((error) => {
  const fail = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    fatal: error?.message || String(error)
  };
  fs.writeFileSync(outFile, JSON.stringify(fail, null, 2));
  console.error(error?.message || String(error));
  process.exit(1);
});
