// The Web shell's install when a served file changes under it (atome/src/sw.js, early-init.js, R-189, 17 Nov. 2026):
// the file no longer matches the manifest the install read, so a newer version is served; the page registers the worker
// again and that version installs, a media import begun meanwhile waiting for it and succeeding. A file that never matches its manifest ends in
// one failure, never in a loop. Real Chromium, isolated server (ADOLE_TEST_URL), never 3001.
// Run: ADOLE_TEST_URL=http://127.0.0.1:3311 node tests/probes/sw_install_superseded.probe.mjs
import fs from 'node:fs';
import path from 'node:path';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('playwright');

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3311';
const manifestSource = await (await fetch(`${APP_URL}/offline-manifest.js`)).text();
const offline = JSON.parse(manifestSource.slice(manifestSource.indexOf('=') + 1).replace(/;\s*$/, ''));
// One small shell file the worker fetches: its bytes are changed as a newer file would be.
const changed = offline.assets.find((asset) => asset.url.endsWith('.css'))?.url || offline.assets[0].url;
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };

const run = async (label, alterings, importing = false) => {
    const profile = path.resolve(`temp/probe_reports/sw_install_superseded/${label}`);
    fs.rmSync(profile, { recursive: true, force: true });
    fs.mkdirSync(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, { headless: true, args: ['--enable-unsafe-webgpu'] });
    let altered = 0;
    await context.route((url) => url.pathname === changed, async (route) => {
        if (altered >= alterings) return route.continue();
        altered += 1;
        const response = await route.fetch();
        return route.fulfill({ response, body: `${await response.text()}\n/* changed */` });
    });
    try {
        return await drive(context, () => altered, importing);
    } finally {
        await context.close().catch(() => {});
        fs.rmSync(profile, { recursive: true, force: true });
    }
};

const drive = async (context, alteredCount, importing) => {
    const page = context.pages()[0] || await context.newPage();
    // The isolated server is the app's own Fastify-compatible server, as for every R-108 browser probe.
    const appUrl = new URL(APP_URL);
    await page.route('**/server_config.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ fastify: {
        host: appUrl.hostname, port: Number(appUrl.port || 80), serverInfoPath: '/api/server-info', syncWsPath: '/ws/sync', apiWsPath: '/ws/api' } }) }));
    await page.addInitScript(() => { window.__SQUIRREL_FORCE_FASTIFY__ = true; });
    await page.addInitScript(() => {
        window.__offlineEvents = [];
        for (const type of ['squirrel:offline-app-ready', 'squirrel:offline-app-error']) {
            window.addEventListener(type, (event) => window.__offlineEvents.push([type, event.detail?.code]));
        }
    });
    await page.goto(APP_URL, { waitUntil: 'load', timeout: 120_000 });
    if (importing) {
        // A guest imports a picture while the worker installs: the upload waits for the version installed again.
        await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 120_000 });
        const guest = await page.evaluate(() => window.AdoleAPI.security.startGuest({ force: true }));
        if (guest?.ok !== true) throw new Error(`guest_failed:${JSON.stringify(guest)}`);
        await page.reload({ waitUntil: 'commit', timeout: 60_000 });
        await page.waitForFunction(() => window.__eveWorkspaceMode?.mode === 'dashboard', null, { timeout: 180_000 });
        await page.evaluate(() => {
            const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
            const file = new File([bytes], 'superseded_probe.png', { type: 'image/png' });
            window.__probeImport = import('/eVe/domains/media/media_store.js')
                .then((store) => store.storeMediaFile(file, { kind: 'image' }))
                .then((result) => ({ ok: result.ok === true, error: result.error || null }), (error) => ({ ok: false, error: String(error) }));
        });
    }
    const deadline = Date.now() + 600_000;
    let state = null;
    while (Date.now() < deadline) {
        state = await page.evaluate(() => ({ controlled: Boolean(navigator.serviceWorker.controller), events: window.__offlineEvents }))
            .catch(() => state);
        const failed = state?.events?.some(([type, code]) => type === 'squirrel:offline-app-error' && code === 'offline_app_install_failed');
        if (state?.controlled || failed) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const imported = importing && state?.controlled
        ? await page.evaluate(() => Promise.race([window.__probeImport, new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'import_timeout' }), 180_000))]))
        : null;
    return { ...state, altered: alteredCount(), imported };
};

// A probe that hangs (a page that never settles) ends in an explicit failure, never holds the machine.
const PROBE_DEADLINE_MS = 20 * 60_000;
setTimeout(() => {
    console.log(`FAIL probe_deadline ${JSON.stringify({ afterMs: PROBE_DEADLINE_MS, checks })}`);
    process.exit(1);
}, PROBE_DEADLINE_MS).unref();

try {
    // A file changed once during the install: the version is superseded, the page registers again, it installs.
    const once = await run('once', 1, true);
    const superseded = once.events?.filter(([, code]) => code === 'offline_app_superseded').length || 0;
    // The guest's reload may come before or after the superseded notice: the page then registers anew either way.
    check('a_superseded_install_is_installed_again', once.controlled === true && once.altered === 1 && superseded <= 1, once);
    check('an_import_during_that_install_succeeds', once.imported?.ok === true, once.imported);
    // A file that never matches: one more try, then one failure, never a loop.
    const always = await run('always', Number.POSITIVE_INFINITY);
    const failures = always.events?.filter(([, code]) => code === 'offline_app_install_failed').length || 0;
    // The tree may change meanwhile (another version, one more try); the end is one failure, never a loop.
    const last = always.events?.at(-1)?.[1];
    check('a_file_that_never_matches_fails_once', always.controlled === false && failures === 1 && last === 'offline_app_install_failed', always);
} catch (error) {
    check('probe_ran', false, String(error?.stack || error).slice(0, 400));
}
const failed = checks.filter((entry) => !entry.ok).length;
console.log(`sw_install_superseded: ${checks.length - failed}/${checks.length}`);
process.exitCode = failed ? 1 : 0;
