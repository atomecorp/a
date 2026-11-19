// A real app session for probes (isolated server): a new account through the mocked SMS link and the simulated
// payment the sign-up now requires, its first launch marked done on this throwaway account (canonical profile), then
// a reload.
import { waitFor } from './probe_app.mjs';

// `phone`: an existing account to sign in again (a second device); a new one otherwise.
export const openUserPastFirstLaunch = async ({ browser, server, report = {}, write = () => {}, locale, onFrameSent = null, bootPredicate = null,
    phone = `+1555${String(Date.now()).slice(-7)}` } = {}) => {
    const origin = `http://127.0.0.1:${server.port}`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...(locale ? { locale } : {}) });
    await context.route('**/server_config.json', (route) => route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ fastify: { host: '127.0.0.1', port: server.port, serverInfoPath: '/api/server-info', syncWsPath: '/ws/sync', apiWsPath: '/ws/api' } }) }));
    await context.addInitScript(() => { window.__SQUIRREL_FORCE_FASTIFY__ = true; });
    const page = await context.newPage();
    let devLink = '';
    page.on('websocket', (ws) => {
        ws.on('framereceived', (f) => { const m = String(f.payload).match(/"developmentLink":"([^"]+)"/); if (m) devLink = m[1]; });
        if (onFrameSent) ws.on('framesent', onFrameSent);
    });
    await page.goto(origin, { timeout: 90000 });
    await waitFor(page, (port) => ({ ok: !!window.AdoleAPI?.auth?.startPhoneLogin && window.__authCheckComplete === true
        && Number(window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port) === port }), server.port, 120000, 300);
    report.phone = phone;
    const started = await page.evaluate(async (p) => window.AdoleAPI.auth.startPhoneLogin(p), phone);
    report.login = { started: JSON.stringify(started).slice(0, 200) };
    let paid = null;
    if (started?.paymentRequired) {
        paid = await page.evaluate(async () => window.AdoleAPI.auth.payPhoneLogin({ method: 'paypal' }));
        report.login.paid = JSON.stringify(paid).slice(0, 200);
    }
    if (!paid?.session) {
        for (let i = 0; i < 60 && !devLink; i += 1) await page.waitForTimeout(100);
        const done = await page.evaluate(async (link) => window.AdoleAPI.auth.completePhoneLogin(link), devLink);
        report.login.done = JSON.stringify(done).slice(0, 200);
    }
    await page.reload({ waitUntil: 'commit' });
    await waitFor(page, async () => ({ ok: typeof window.Atome?.commit === 'function'
        && (await window.AdoleAPI?.auth?.current?.().catch(() => null))?.logged === true }), null, 120000, 500);
    await page.waitForTimeout(3000);
    const skipped = await page.evaluate(async () => {
        const api = await import('/eVe/domains/user/profile_api.js');
        const current = await window.AdoleAPI.auth.current();
        const userId = String(current?.user?.id || current?.user?.user_id || '');
        if (!userId) return { ok: false, saved: JSON.stringify(current) };
        const loaded = await api.loadUserProfile(userId);
        const profile = loaded?.profile || {};
        const prefs = profile.preferences || {};
        const next = { ...profile, preferences: { ...prefs, first_launch: { ...(prefs.first_launch || {}), version: 1, step: 'complete' } } };
        const saved = await api.upsertUserProfile(next, { userId, allowCreate: false, eventSource: 'probe' });
        return { ok: saved?.ok === true, saved: JSON.stringify(saved).slice(0, 200) };
    });
    report.login.skipped = skipped;
    write();
    if (!skipped.ok) throw new Error(`first_launch_skip_failed:${skipped.saved}`);
    await page.reload({ waitUntil: 'commit' });
    const booted = await waitFor(page, bootPredicate || (() => ({ ok: window.AdoleAPI?.security?.isAnonymous?.() === false && !!window.eveNews,
        boot: window.__eveWorkspaceBootOpenError || null })), null, 180000, 500);
    if (!booted.ok) throw new Error(`boot_failed:${JSON.stringify(booted).slice(0, 400)}`);
    return page;
};

