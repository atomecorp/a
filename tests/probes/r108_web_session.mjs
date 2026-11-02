// Shared set-up of the R-108 Web probes: a Chromium page on the WebGPU app, signed in with a new phone account on an
// isolated test Fastify (SQUIRREL_AUTH_SMS_MOCK=1, test auth mode), the first launch marked done, and a check recorder.
// Headless SwiftShader loses its WebGPU device in this container (no shared-image backing for the swap chain):
// run headful under Xvfb (PW_HEADFUL=1, `xvfb-run`). PW_CHROMIUM: a Chromium executable; PW_EXTRA: more switches.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { waitFor } from './molecule_ui_acceptance_support.mjs';

export const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';

export const openR108Session = async ({ out }) => {
    fs.mkdirSync(out, { recursive: true });
    const report = { url: APP_URL, checks: [], console_errors: [], page_errors: [] };
    const browser = await chromium.launch({ headless: process.env.PW_HEADFUL !== '1', executablePath: process.env.PW_CHROMIUM || undefined, args: [
        '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader',
        '--disable-gpu-watchdog', '--disable-gpu-process-crash-limit', ...(process.env.PW_EXTRA ? process.env.PW_EXTRA.split(' ') : []),
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const page = await (await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, hasTouch: true })).newPage();
    page.on('console', (message) => { if (message.type() === 'error') report.console_errors.push(message.text().slice(0, 400)); });
    page.on('pageerror', (error) => report.page_errors.push(String(error.message).slice(0, 400)));
    report.http_errors = [];
    page.on('requestfailed', (request) => report.http_errors.push(`failed ${request.failure()?.errorText || ''} ${request.url()}`.slice(0, 300)));
    page.on('response', (response) => { if (response.status() >= 400) report.http_errors.push(`${response.status()} ${response.url()}`.slice(0, 300)); });
    let link = '';
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => { const m = String(frame.payload).match(/"developmentLink":"([^"]+)"/); if (m) link = m[1]; }));

    const check = async (name, fn) => {
        const started = Date.now();
        try {
            const details = await fn();
            report.checks.push({ name, ok: true, ms: Date.now() - started, details });
            console.log(`ok   ${name}`, JSON.stringify(details ?? null).slice(0, 300));
            return details;
        } catch (error) {
            report.checks.push({ name, ok: false, ms: Date.now() - started, error: String(error.message).slice(0, 1500) });
            console.log(`FAIL ${name}: ${String(error.message).slice(0, 600)}`);
            await page.screenshot({ path: path.join(out, `fail_${name}.png`) }).catch(() => {});
            return null;
        }
    };
    const presented = () => waitFor(page, async () => {
        const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
        return { ok: current?.logged === true && !!window.__eveWorkspaceMode?.mode && !!window.Squirrel?.SyncEngine, mode: window.__eveWorkspaceMode?.mode || null };
    }, null, 180000);
    const signIn = async () => {
        await page.goto(APP_URL, { waitUntil: 'commit', timeout: 45000 });
        await page.waitForFunction(() => !!window.AdoleAPI?.auth?.startPhoneLogin && window.__authCheckComplete === true, null, { timeout: 120000 });
        const started = await page.evaluate(async () => {
            const result = await window.AdoleAPI.auth.startPhoneLogin(`+1555${`${Date.now()}`.slice(-7)}`);
            const paid = result?.paymentRequired === true ? await window.AdoleAPI.auth.payPhoneLogin({ method: 'paypal' }) : null;
            return Boolean(paid?.session);
        });
        for (let i = 0; i < 60 && !started && !link; i += 1) await page.waitForTimeout(100);
        if (!started && (await page.evaluate(async (l) => (await window.AdoleAPI.auth.completePhoneLogin(l))?.ok === true, link)) !== true) throw new Error('login_failed');
        await page.reload({ waitUntil: 'commit' });
        await page.waitForFunction(() => window.__authCheckComplete === true && typeof window.Atome?.commit === 'function', null, { timeout: 120000 });
        const done = await page.evaluate(async () => {
            const profiles = await import('/eVe/domains/user/profile_api.js');
            const session = await window.AdoleAPI.auth.current();
            const userId = String(session?.user?.id || session?.user?.user_id || session?.user_id || '');
            const profile = (await profiles.loadUserProfile(userId))?.profile || {};
            const preferences = profile.preferences || {};
            const saved = await profiles.upsertUserProfile({ ...profile, preferences: { ...preferences,
                first_launch: { ...(preferences.first_launch || {}), version: 1, step: 'complete' } } }, { userId, allowCreate: false, eventSource: 'probe' });
            return { userId: Boolean(userId), firstLaunchDone: saved?.ok === true };
        });
        await page.reload({ waitUntil: 'commit' });
        await presented();
        return done;
    };
    // A project by the canonical tools: created by `ui.new_project` (the Dashboard's Créer › Projet), or opened by `ui.project.open`.
    const tool = (request) => page.evaluate(async (input) => {
        const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        return JSON.parse(JSON.stringify(await invokeToolGateway(input)));
    }, request);
    const inProject = (projectId = '') => waitFor(page, (pid) => ({
        ok: window.__eveWorkspaceMode?.mode === 'project' && !!window.__currentProject?.id && (!pid || window.__currentProject.id === pid)
            && JSON.parse(localStorage.getItem('squirrel_current_project_v2') || 'null')?.id === window.__currentProject.id,
        mode: window.__eveWorkspaceMode?.mode, id: window.__currentProject?.id || ''
    }), projectId, 60000);
    const toDashboard = () => page.evaluate(async () => {
        // The product menu's Dashboard tool (bevy_ui_product_runtime.js#openDashboard).
        const { openWorkspaceDashboardAndMainMenu } = await import('/eVe/intuition/tools/user_workspace_surface_runtime.js');
        return JSON.stringify(await openWorkspaceDashboardAndMainMenu({ source: 'r108_probe' })).slice(0, 200);
    }).then(async (result) => ({ result, mode: await waitFor(page, () => ({ ok: window.__eveWorkspaceMode?.mode === 'dashboard', mode: window.__eveWorkspaceMode?.mode }), null, 30000) }));
    const finish = async () => {
        report.ok = report.checks.length > 0 && report.checks.every((entry) => entry.ok);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`checks ${report.checks.filter((c) => c.ok).length}/${report.checks.length}; console errors ${report.console_errors.length}; page errors ${report.page_errors.length}`);
        report.console_errors.slice(0, 10).forEach((line) => console.log('  console:', line));
        report.page_errors.slice(0, 10).forEach((line) => console.log('  page:', line));
        report.http_errors.slice(0, 10).forEach((line) => console.log('  http:', line));
        await browser.close();
        process.exitCode = report.ok ? 0 : 1;
    };
    return { page, report, check, presented, signIn, tool, inProject, toDashboard, finish };
};
