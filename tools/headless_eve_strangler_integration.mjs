import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'eve_strangler_integration.json');

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250) => {
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
    checks: []
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

    const runtimeReady = await waitFor(
      page,
      () => !!(window.atome?.tools?.v2Runtime && window.atome?.tools?.v2CommandBus),
      30000
    );
    report.checks.push({
      name: 'runtime_bootstrap',
      ok: runtimeReady
    });
    if (!runtimeReady) throw new Error('runtime_not_ready');

    const integration = await page.evaluate(async () => {
      const out = {
        flags: null,
        circle: null,
        matrix: null,
        matrixClose: null,
        runtimeDisabled: null,
        continuous: null,
        routingLogHasLegacyFallback: null,
        errors: []
      };
      try {
        const tools = window.atome?.tools || {};
        const setFlags = typeof tools.setStranglerFlags === 'function'
          ? tools.setStranglerFlags
          : null;
        const getFlags = typeof tools.getStranglerFlags === 'function'
          ? tools.getStranglerFlags
          : null;
        if (setFlags) {
          setFlags({
            runtimeV2: true,
            gatewayStrict: true,
            uiInstanceV2: true
          });
        }
        out.flags = getFlags ? getFlags() : null;

        const gateway = window.atome?.tools && window.atome.tools.v2Runtime
          ? (await import('/application/eVe/intuition/runtime/tool_gateway.js')).invokeToolGateway
          : null;
        if (!gateway) throw new Error('gateway_unavailable');

        const bus = window.atome.tools.v2CommandBus;
        if (bus && typeof bus.clear === 'function') bus.clear();

        out.circle = await gateway({
          tool_id: 'ui.circle',
          action: 'pointer.click',
          input: { x: 180, y: 180, radius: 18 },
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });
        out.matrix = await gateway({
          tool_id: 'ui.matrix.view',
          action: 'open',
          input: {},
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });
        out.matrixClose = await gateway({
          tool_id: 'ui.matrix.view',
          action: 'close',
          input: {},
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });

        out.runtimeDisabled = await gateway({
          tool_id: 'ui.play',
          action: 'pointer.click',
          input: {},
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui',
          flags: { runtimeV2: false }
        });

        if (setFlags) {
          setFlags({
            runtimeV2: true,
            gatewayStrict: true,
            uiInstanceV2: true
          });
        }

        const moveStart = await gateway({
          tool_id: 'ui.move',
          action: 'drag.start',
          input: { atome_id: 'atome_headless_move_1', left: 10, top: 10 },
          meta: { tx_id: 'headless_tx_1' },
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });
        const moveFrame = await gateway({
          tool_id: 'ui.move',
          action: 'drag.frame',
          input: { atome_id: 'atome_headless_move_1', left: 30, top: 32 },
          meta: { tx_id: 'headless_tx_1' },
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });
        const moveEnd = await gateway({
          tool_id: 'ui.move',
          action: 'drag.end',
          input: { atome_id: 'atome_headless_move_1', left: 45, top: 47 },
          meta: { tx_id: 'headless_tx_1' },
          source: { type: 'headless_integration', layer: 'strangler' },
          presentation: 'ui'
        });
        const closed = typeof bus?.listEvents === 'function'
          ? bus.listEvents({ kind: 'continuous_closed' })
          : [];
        out.continuous = {
          moveStart,
          moveFrame,
          moveEnd,
          closedEvents: Array.isArray(closed) ? closed.length : 0
        };

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
    });

    report.checks.push({
      name: 'gateway_flags_runtimeV2',
      ok: !!integration?.flags?.runtimeV2
    });
    report.checks.push({
      name: 'gateway_flags_gatewayStrict',
      ok: !!integration?.flags?.gatewayStrict
    });
    report.checks.push({
      name: 'ui_circle_runtime_path',
      ok: integration?.circle?.tool_key === 'circle'
        && integration?.circle?.error !== 'tool_runtime_v2_disabled',
      details: integration?.circle || null
    });
    report.checks.push({
      name: 'ui_matrix_runtime_path',
      ok: integration?.matrix?.tool_key === 'matrix_view'
        && integration?.matrix?.ok === true,
      details: integration?.matrix || null
    });
    report.checks.push({
      name: 'ui_matrix_close_runtime_path',
      ok: integration?.matrixClose?.tool_key === 'matrix_view'
        && integration?.matrixClose?.ok === true,
      details: integration?.matrixClose || null
    });
    report.checks.push({
      name: 'runtime_disabled_explicit_error',
      ok: integration?.runtimeDisabled?.error === 'tool_runtime_v2_disabled',
      details: integration?.runtimeDisabled || null
    });
    report.checks.push({
      name: 'continuous_close_event',
      ok: Number(integration?.continuous?.closedEvents || 0) >= 1,
      details: integration?.continuous || null
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
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        url,
        ok: false,
        fatal: error?.message || String(error)
      },
      null,
      2
    )
  );
  console.error(error?.message || String(error));
  process.exit(1);
});
