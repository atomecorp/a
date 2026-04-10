import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const SCENARIOS = Object.freeze([
    {
        name: 'portrait',
        viewport: { width: 390, height: 844 }
    },
    {
        name: 'landscape',
        viewport: { width: 844, height: 390 }
    }
]);

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'panel_mobile_open_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, arg = null, timeoutMs = 25000, intervalMs = 120) => {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
        try {
            const result = await page.evaluate(predicate, arg);
            if (result) return result;
        } catch (_) {
            // ignore transient boot/eval failures
        }
        await page.waitForTimeout(intervalMs);
    }
    return null;
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

const ensureLoggedIn = async (page) => safeEval(page, async ({ phone, password }) => {
    const auth = window.AdoleAPI?.auth || null;
    if (!auth?.login) return { ok: false, skipped: true, error: 'auth_api_missing' };
    const tryLogin = async (candidatePhone, candidatePassword) => {
        const result = await auth.login(candidatePhone, candidatePassword, candidatePhone).catch((error) => ({
            ok: false,
            error: String(error?.message || error || 'login_failed')
        }));
        return {
            result,
            authenticated: !!auth.isAuthenticated?.()
        };
    };
    const attempt = await tryLogin(phone, password);
    if (attempt.authenticated) return { ok: true, authenticated: true, created: false };
    if (typeof auth.create === 'function') {
        await auth.create(phone, password, phone, 'public').catch(() => null);
        const retried = await tryLogin(phone, password);
        if (retried.authenticated) return { ok: true, authenticated: true, created: true };
    }
    return {
        ok: false,
        authenticated: !!auth.isAuthenticated?.(),
        error: 'login_failed'
    };
}, { phone, password }, { ok: false, error: 'login_eval_failed' });

const ensureProbeButton = async (page) => safeEval(page, () => {
    let button = document.getElementById('probe_flower_button');
    if (!(button instanceof HTMLElement)) {
        button = document.createElement('button');
        button.id = 'probe_flower_button';
        button.type = 'button';
        button.textContent = 'probe';
        document.body.appendChild(button);
    }
    Object.assign(button.style, {
        position: 'fixed',
        right: '8px',
        top: '320px',
        width: '44px',
        height: '44px',
        zIndex: '999999',
        border: '0',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.01)',
        color: 'transparent',
        pointerEvents: 'none'
    });
    return {
        ok: true,
        dom_id: button.id
    };
}, null, { ok: false, error: 'probe_button_eval_failed' });

const startPanelInvoke = async (page, { toolId, sourceLayer = 'flower_menu' }) => safeEval(page, async ({ toolId, sourceLayer }) => {
    const runtime = window.atome?.tools?.v2Runtime || null;
    const domId = 'probe_flower_button';
    if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
    window.__panelProbeState = {
        toolId,
        panelId: '',
        startedAt: performance.now(),
        resolved: false,
        resolvedAt: null,
        result: null,
        error: null
    };
    const promise = runtime.invokeById({
        tool_id: toolId,
        action: 'pointer.click',
        event: 'touch',
        input: {
            target_id: domId,
            dom_id: domId
        },
        presentation: 'ui',
        source: { type: 'ui', layer: sourceLayer }
    });
    window.__panelProbePromise = promise;
    promise.then((result) => {
        window.__panelProbeState.resolved = true;
        window.__panelProbeState.resolvedAt = performance.now();
        window.__panelProbeState.result = result;
    }).catch((error) => {
        window.__panelProbeState.resolved = true;
        window.__panelProbeState.resolvedAt = performance.now();
        window.__panelProbeState.error = String(error?.message || error || 'invoke_failed');
    });
    return { ok: true };
}, { toolId, sourceLayer }, { ok: false, error: 'panel_invoke_eval_failed' });

const readPanelSnapshot = async (page, panelId) => safeEval(page, (panelIdValue) => {
    const panel = document.getElementById(panelIdValue);
    const state = window.__panelProbeState || null;
    const toolbar = document.querySelector('#eve_intuitionx_main_ribbon')
        || document.querySelector('#menu_container_v2 > .eve-toolbox-v2-row')
        || document.querySelector('#menu_container .toolbox-split[data-main="true"]');
    const toolbarRect = toolbar?.getBoundingClientRect?.() || null;
    const vv = window.visualViewport
        ? {
            width: Number(window.visualViewport.width || 0),
            height: Number(window.visualViewport.height || 0),
            offsetLeft: Number(window.visualViewport.offsetLeft || 0),
            offsetTop: Number(window.visualViewport.offsetTop || 0)
        }
        : null;
    if (!(panel instanceof HTMLElement)) {
        return {
            ok: false,
            panel_present: false,
            probe_state: state
        };
    }
    const style = window.getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const visibleLeft = (vv?.offsetLeft || 0);
    const visibleRight = visibleLeft + (vv?.width || window.innerWidth || 0);
    const visibleTop = (vv?.offsetTop || 0);
    const visibleBottom = visibleTop + (vv?.height || window.innerHeight || 0);
    const toolbarTop = Number.isFinite(Number(toolbarRect?.top)) ? Math.round(Number(toolbarRect.top)) : null;
    const leftMargin = Math.round(rect.left - visibleLeft);
    const rightMargin = Math.round(visibleRight - rect.right);
    const topMargin = Math.round(rect.top - visibleTop);
    const bottomMargin = Math.round(visibleBottom - rect.bottom);
    return {
        ok: true,
        panel_present: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && panel.getClientRects().length > 0,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        dataset: {
            pending: panel.dataset.evePendingOpenLayout || null,
            prepared: panel.dataset.eveOpenLayoutPrepared || null
        },
        rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        },
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            visual: vv
        },
        margins: {
            left: leftMargin,
            right: rightMargin,
            top: topMargin,
            bottom: bottomMargin
        },
        fully_visible: rect.left >= (visibleLeft - 1)
            && rect.right <= (visibleRight + 1)
            && rect.top >= (visibleTop - 1)
            && rect.bottom <= (visibleBottom + 1),
        centered_horizontally: Math.abs(leftMargin - rightMargin) <= 1,
        fills_visible_width: Math.abs(leftMargin) <= 1 && Math.abs(rightMargin) <= 1,
        fills_toolbar_space: toolbarTop === null
            ? false
            : (Math.abs(rect.top - visibleTop) <= 1 && Math.abs(rect.bottom - toolbarTop) <= 1),
        toolbar_top: toolbarTop,
        probe_state: state
    };
}, panelId, { ok: false, error: 'panel_snapshot_eval_failed' });

const awaitInvokeResult = async (page) => safeEval(page, async () => {
    if (!window.__panelProbePromise) return { ok: false, error: 'probe_promise_missing' };
    try {
        const result = await window.__panelProbePromise;
        return {
            ok: true,
            result,
            probe_state: window.__panelProbeState || null
        };
    } catch (error) {
        return {
            ok: false,
            error: String(error?.message || error || 'invoke_failed'),
            probe_state: window.__panelProbeState || null
        };
    }
}, null, { ok: false, error: 'panel_result_eval_failed' });

const closePanel = async (page, { toolId }) => safeEval(page, async ({ toolId }) => {
    const runtime = window.atome?.tools?.v2Runtime || null;
    const domId = 'probe_flower_button';
    if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
    return runtime.invokeById({
        tool_id: toolId,
        action: 'state.off',
        event: 'inactive',
        input: {
            target_id: domId,
            dom_id: domId
        },
        presentation: 'ui',
        source: { type: 'ui', layer: 'flower_menu' }
    });
}, { toolId }, { ok: false, error: 'panel_close_eval_failed' });

const probePanel = async (page, { toolId, panelId, scenarioName = 'portrait' }) => {
    const started = await startPanelInvoke(page, { toolId });
    if (started?.ok !== true) {
        return {
            tool_id: toolId,
            panel_id: panelId,
            ok: false,
            error: started?.error || 'invoke_start_failed'
        };
    }

    const visible = await waitFor(page, (panelIdValue) => {
        const panel = document.getElementById(panelIdValue);
        if (!(panel instanceof HTMLElement)) return null;
        const style = window.getComputedStyle(panel);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;
        const rect = panel.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? true : null;
    }, panelId, 20000, 80);

    const snapshotWhileVisible = await readPanelSnapshot(page, panelId);
    const invokeResult = await awaitInvokeResult(page);
    await sleep(180);
    const finalSnapshot = await readPanelSnapshot(page, panelId);
    const closeResult = await closePanel(page, { toolId });

    const matchesScenario = scenarioName === 'portrait'
        ? snapshotWhileVisible?.fills_visible_width === true
        : snapshotWhileVisible?.fills_toolbar_space === true;

    return {
        tool_id: toolId,
        panel_id: panelId,
        scenario: scenarioName,
        ok: visible === true
            && snapshotWhileVisible?.visible === true
            && snapshotWhileVisible?.fully_visible === true
            && snapshotWhileVisible?.centered_horizontally === true
            && matchesScenario === true
            && invokeResult?.ok === true
            && invokeResult?.result?.ok === true,
        became_visible: visible === true,
        visible_before_invoke_resolved: snapshotWhileVisible?.probe_state?.resolved !== true,
        snapshot_while_visible: snapshotWhileVisible,
        invoke_result: invokeResult,
        final_snapshot: finalSnapshot,
        close_result: closeResult
    };
};

const runScenario = async (browser, engineName, scenario) => {
    const context = await browser.newContext({
        viewport: scenario.viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3
    });
    const page = await context.newPage();
    const report = {
        engine: engineName,
        scenario: scenario.name,
        ok: false,
        login: null,
        runtime_ready: false,
        probe_button: null,
        panels: []
    };

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(1400);
        report.login = await ensureLoggedIn(page);
        await sleep(900);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(1600);

        const runtimeReady = await waitFor(page, () => {
            return !!(window.atome?.tools?.v2Runtime && window.__DEBUG__);
        }, null, 30000, 150);
        report.runtime_ready = runtimeReady === true;
        if (!report.runtime_ready) {
            throw new Error('runtime_not_ready');
        }

        report.probe_button = await ensureProbeButton(page);
        report.panels.push(await probePanel(page, {
            toolId: 'tool.main.couleur',
            panelId: 'eve_couleur_dialog',
            scenarioName: scenario.name
        }));
        report.panels.push(await probePanel(page, {
            toolId: 'tool.main.communicate',
            panelId: 'eve_comm_dialog',
            scenarioName: scenario.name
        }));

        report.ok = report.panels.every((entry) => entry?.ok === true);
    } finally {
        await context.close();
    }

    return report;
};

const runEngine = async (engineName, browserType) => {
    const browser = await browserType.launch({ headless: true });
    try {
        const scenarios = [];
        for (const scenario of SCENARIOS) {
            scenarios.push(await runScenario(browser, engineName, scenario));
        }
        return {
            engine: engineName,
            ok: scenarios.every((entry) => entry?.ok === true),
            scenarios
        };
    } finally {
        await browser.close();
    }
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url,
        ok: false,
        engines: [],
        errors: []
    };

    for (const [engineName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
        try {
            report.engines.push(await runEngine(engineName, browserType));
        } catch (error) {
            report.engines.push({
                engine: engineName,
                ok: false,
                error: String(error?.message || error || 'engine_failed')
            });
            report.errors.push({
                engine: engineName,
                error: String(error?.message || error || 'engine_failed')
            });
        }
    }

    report.ok = report.engines.length > 0 && report.engines.every((entry) => entry?.ok === true);
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        engines: report.engines.map((entry) => ({
            engine: entry.engine,
            ok: entry.ok,
            scenarios: Array.isArray(entry.scenarios)
                ? entry.scenarios.map((scenario) => ({
                    scenario: scenario.scenario,
                    ok: scenario.ok,
                    panels: Array.isArray(scenario.panels)
                        ? scenario.panels.map((panel) => ({
                            tool_id: panel.tool_id,
                            panel_id: panel.panel_id,
                            ok: panel.ok,
                            visible_before_invoke_resolved: panel.visible_before_invoke_resolved
                        }))
                        : []
                }))
                : []
        })),
        errors: report.errors
    }, null, 2));
};

await run();
