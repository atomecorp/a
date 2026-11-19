// Shared support of the real-app Playwright probes: open the app (3001 dev server with a persistent profile, or an
// isolated server with PROBE_ISOLATED=1), a pass/fail report, open a new project. One SMS sign-in per machine: the
// Playwright session is kept in its profile (the dev server's sms-daily ceiling).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const PROFILE_DIR = path.resolve(process.env.PROBE_PROFILE_DIR || 'temp/templates_interactivity/chromium_profile');

export const createReport = (lot) => {
    const out = path.resolve('temp/probe_reports/templates_interactivity', lot);
    fs.mkdirSync(out, { recursive: true });
    const report = { lot, started_at: new Date().toISOString(), checks: [], errors: [] };
    const write = () => fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    let failed = 0;
    const check = (id, ok, detail = {}) => {
        report.checks.push({ id, status: ok ? 'PASS' : 'FAIL', ...detail });
        write();
        console.log(ok ? 'OK  ' : 'FAIL', id, ok ? '' : JSON.stringify(detail).slice(0, 900));
        if (!ok) failed += 1;
    };
    const blocked = (id, reason) => { report.checks.push({ id, status: 'BLOCKED', reason }); write(); console.log('BLOCKED', id, reason); };
    const shot = async (page, name) => { await page.waitForTimeout(400); await screenshotOrStack(page, { path: path.join(out, `${name}.png`) }); };
    return { out, report, write, check, blocked, shot, failed: () => failed };
};

export const app = (page, body, arg = null) => page.evaluate(new Function('arg', `return (async () => { ${body} })();`), arg);

export const waitFor = async (page, predicate, arg = null, timeoutMs = 30000, stepMs = 150) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, arg);
            if (last === true || last?.ok === true) return last;
        } catch (error) { last = { ok: false, error: error?.message || String(error) }; }
        await page.waitForTimeout(stepMs);
    }
    return { ok: false, timeout: true, last };
};

const dashboardReady = (page) => waitFor(page, () => {
    const state = window.eveDashboardBevyUiRuntime?.state || {};
    return { ok: window.AdoleAPI?.security?.isAuthenticated?.() === true
        && ((state.active === true && (state.layout?.lanes || []).length > 0 && state.opening !== true)
            || window.__eveWorkspaceMode?.mode === 'project'
            || (window.__eveWorkspaceBootTrace || []).some((entry) => entry.stage === 'open_ok')) };
}, null, 180000, 500);

const login = async (page) => {
    console.log('  (connexion SMS de test : nouveau compte)');
    let devLink = '';
    page.on('websocket', (ws) => ws.on('framereceived', (f) => {
        const m = String(f.payload).match(/"developmentLink":"([^"]+)"/); if (m) devLink = m[1];
    }));
    const started = await page.evaluate(async () => {
        const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.replace(/\D+/g, '').slice(-10);
        return window.AdoleAPI.auth.startPhoneLogin(`+1555${suffix}`);
    });
    // New accounts pay first (simulated): the payment already returns the session.
    const newAccount = started?.paymentRequired === true;
    let paid = null;
    if (newAccount) {
        paid = await page.evaluate(async () => window.AdoleAPI.auth.payPhoneLogin({ method: 'paypal' }));
        if (paid?.session) return { firstLaunch: true };
    }
    for (let i = 0; i < 60 && !devLink && (started?.pending === true || paid?.pending === true); i += 1) await page.waitForTimeout(100);
    const result = started?.ok && started.pending !== true && !newAccount ? { ok: true }
        : devLink ? await page.evaluate(async (link) => {
            const r = await window.AdoleAPI.auth.completePhoneLogin(link);
            return { ok: r?.ok === true, r };
        }, devLink) : { ok: false, started };
    if (!result?.ok) throw new Error(`provisioned_login_failed:${JSON.stringify(result).slice(0, 600)}`);
    return { firstLaunch: newAccount };
};

// PROBE_ISOLATED=1: a throwaway Fastify instance (SMS mock) and a new account
// past its first launch, instead of the 3001 server and the persistent profile.
// `--use-angle=metal`: without it headless Chromium takes the SwiftShader WebGPU adapter (CPU): canvas read back empty
// (`bevy_project_preview_capture_empty`) and frames slow enough under load to time out a diff (17 Nov. 2026).
const openIsolatedApp = async ({ viewport, extraArgs }) => {
    const { startServer } = await import('./probe_server.mjs');
    const { openUserPastFirstLaunch } = await import('./probe_app_session.mjs');
    const server = await startServer({ env: { SQUIRREL_AUTH_SMS_MOCK: '1' } });
    const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--use-angle=metal', ...extraArgs, ...(process.env.HEADLESS === '0' ? ['--window-position=-32000,-32000'] : [])] });
    const page = await openUserPastFirstLaunch({ browser, server,
        bootPredicate: () => ({ ok: window.AdoleAPI?.security?.isAnonymous?.() === false && (window.eveMatrixModules?.list?.() || []).some((m) => m.active && /workspace_home/.test(m.tree_id)) }) });
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const context = { close: async () => { await browser.close().catch(() => null); await server.stop(); } };
    return { context, browser, page, errors, server };
};

export const openApp = async ({ viewport = { width: 1280, height: 900 }, ignoreDefaultArgs = undefined, extraArgs = [] } = {}) => {
    if (process.env.PROBE_ISOLATED === '1') return openIsolatedApp({ viewport, extraArgs });
    // A persistent Chromium profile: the device key (a non-exportable CryptoKey) survives
    // from one probe to the next, so one SMS sign-in serves every probe.
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: process.env.HEADLESS !== '0',
        viewport,
        ...(ignoreDefaultArgs ? { ignoreDefaultArgs } : {}),
        args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal', ...extraArgs, ...(process.env.HEADLESS === '0' ? ['--window-position=-32000,-32000'] : [])]
    });
    const browser = context;
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP_URL, { waitUntil: 'commit', timeout: 45000 });
    await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 60000 });
    const authenticated = await page.evaluate(async () => {
        const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
        return current?.logged === true && window.AdoleAPI?.security?.isAnonymous?.() === false;
    });
    if (!authenticated) {
        const outcome = await login(page);
        await page.reload({ waitUntil: 'commit', timeout: 45000 });
        await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 60000 });
        if (outcome?.firstLaunch) {
            // Mark the beginner first launch complete, as the validated probes do.
            const ready = await waitFor(page, async () => ({ ok: typeof window.Atome?.commit === 'function'
                && (await window.AdoleAPI?.auth?.current?.().catch(() => null))?.logged === true }), null, 120000, 500);
            if (!ready?.ok) throw new Error(`first_launch_session_not_ready:${JSON.stringify(ready).slice(0, 300)}`);
            await page.waitForTimeout(3000);
            const skipped = await page.evaluate(async () => {
                const api = await import('/eVe/domains/user/profile_api.js');
                const current = await window.AdoleAPI.auth.current();
                const info = window.AdoleAPI.auth.getCurrentInfo?.() || {};
                const userId = String(current?.user?.id || current?.user?.user_id || current?.user_id || current?.id || info.user_id || info.id || '');
                const profile = (await api.loadUserProfile(userId))?.profile || {};
                const prefs = profile.preferences || {};
                const saved = await api.upsertUserProfile({ ...profile, preferences: { ...prefs, first_launch: { ...(prefs.first_launch || {}), version: 1, step: 'complete' } } },
                    { userId, allowCreate: false, eventSource: 'probe' });
                return { ok: saved?.ok === true, userId, saved: JSON.stringify(saved).slice(0, 400), profile: JSON.stringify(profile).slice(0, 200) };
            });
            if (!skipped.ok) throw new Error(`first_launch_skip_failed:${JSON.stringify(skipped)}`);
            await page.reload({ waitUntil: 'commit', timeout: 45000 });
            await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 60000 });
        }
    }
    const ready = await dashboardReady(page);
    if (!ready.ok) {
        const diag = await page.evaluate(() => ({
            anonymous: window.AdoleAPI?.security?.isAnonymous?.(),
            mode: window.__eveWorkspaceMode || null,
            dash: { active: window.eveDashboardBevyUiRuntime?.state?.active, opening: window.eveDashboardBevyUiRuntime?.state?.opening, lanes: (window.eveDashboardBevyUiRuntime?.state?.layout?.lanes || []).length },
            bootError: JSON.stringify(window.__eveWorkspaceBootOpenError || null),
            trace: (window.__eveWorkspaceBootTrace || []).slice(-8),
            isAuth: window.AdoleAPI?.security?.isAuthenticated?.(),
            info: window.AdoleAPI?.auth?.getCurrentInfo?.() || null,
            authResult: window.__authCheckResult || null,
            canvas: (() => { const c = document.getElementById('eve_surface_project'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, disp: getComputedStyle(c).display, vis: getComputedStyle(c).visibility, op: getComputedStyle(c).opacity }; })(),
            hidden: document.hidden,
            bootSurface: document.body?.textContent?.slice(0, 300)
        })).catch((e) => ({ error: e.message }));
        throw new Error(`workspace_not_ready:${JSON.stringify({ diag, errors }).slice(0, 2500)}`);
    }
    // The main menu finishes mounting after the Dashboard: opening a project before it
    // fails with workspace_main_menu_overlay_missing (observed; not a product defect).
    await page.waitForTimeout(3000);
    return { browser, context, page, errors };
};

// Creates and opens a plain project (the same path as the Molecule acceptance probe).
export const openNewProject = async (page, name) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try { return await openNewProjectOnce(page, name); }
        catch (error) {
            if (!/workspace_main_menu_overlay_missing/.test(String(error?.message)) || attempt === 3) throw error;
            await page.waitForTimeout(2500);
        }
    }
    return { ok: false };
};
const openNewProjectOnce = (page, name) => page.evaluate(async (projectName) => {
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.beginDashboardWorkspaceTransition?.('project');
    if (window.eveDashboardBevyUiRuntime?.state?.active === true) await window.eveDashboardBevyUiRuntime.destroy();
    const created = await window.AdoleAPI.projects.create(projectName);
    const projectId = String(created?.id || created?.project_id || created?.atome_id
        || created?.fastify?.project?.id || created?.tauri?.project?.id || '');
    if (!projectId) return { ok: false, error: 'project_id_missing', created };
    const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
    const activation = await projectRuntime.activateProjectWorkspace({ id: projectId, name: projectName }, { force: true, staleFirst: false });
    workspaceMode.markProjectWorkspaceMode?.(projectId);
    return { ok: activation?.ok === true, id: projectId, name: projectName };
}, name);

// A rebuilt Wasm needs the offline app's cache purged on a long-lived origin
// (3001 profile). A fresh isolated origin has nothing to purge, and purging while
// its first install still runs leaves an active worker with an empty cache
// (lazy imports then fail with ERR_FAILED).
export const purgeOfflineApp = async (page) => {
    if (process.env.PROBE_ISOLATED === '1') return false;
    await page.evaluate(async () => {
        for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister();
        for (const n of await caches.keys()) await caches.delete(n);
    });
    return true;
};

// A screenshot that never comes means the page produced no frame for 30 s. Pause
// it through the debugger to print what its main thread is running, then rethrow.
export const screenshotOrStack = async (page, options = {}) => {
    try {
        return await page.screenshot(options);
    } catch (error) {
        if (error?.name !== 'TimeoutError') throw error;
        try {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Debugger.enable');
            const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve));
            await cdp.send('Debugger.pause');
            const event = await Promise.race([paused, new Promise((resolve) => setTimeout(() => resolve(null), 5000))]);
            const frames = (event?.callFrames || []).slice(0, 15)
                .map((frame) => `${frame.functionName || '(anonymous)'} ${String(frame.url || '').replace(/^https?:\/\/[^/]+/, '')}:${frame.location?.lineNumber + 1}`);
            console.log('FROZEN_PAGE_STACK', event ? JSON.stringify({ reason: event.reason, frames }) : 'no pause within 5 s (main thread idle: GPU/compositor stall)');
            if (event) await cdp.send('Debugger.resume');
        } catch (inspect) {
            console.log('FROZEN_PAGE_STACK unavailable', String(inspect?.message || inspect));
        }
        throw error;
    }
};
