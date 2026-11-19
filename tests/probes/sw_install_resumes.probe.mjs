// The Web shell's install resumes (atome/src/sw.js, R-189, 17 Nov. 2026): a first install cut short (the browser ends a
// service worker event past five minutes, and under load the whole shell does not fit) keeps the files it verified, and
// the next install downloads only the rest. Real Chromium, persistent profile, isolated server (ADOLE_TEST_URL), never 3001.
// Run: ADOLE_TEST_URL=http://127.0.0.1:3311 node tests/probes/sw_install_resumes.probe.mjs
import fs from 'node:fs';
import path from 'node:path';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('playwright');

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3311';
const profile = path.resolve('temp/probe_reports/sw_install_resumes/profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });

const manifestSource = await (await fetch(`${APP_URL}/offline-manifest.js`)).text();
const offline = JSON.parse(manifestSource.slice(manifestSource.indexOf('=') + 1).replace(/;\s*$/, ''));
const assetUrls = new Set(offline.assets.map((asset) => asset.url));
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };

const open = async () => {
    const context = await chromium.launchPersistentContext(profile, { headless: true, args: ['--enable-unsafe-webgpu'] });
    opened.push(context);
    const fetched = new Set();
    context.on('request', (request) => {
        if (!request.serviceWorker()) return;
        const { pathname } = new URL(request.url());
        if (assetUrls.has(pathname)) fetched.add(pathname);
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(APP_URL, { waitUntil: 'load', timeout: 120_000 });
    return { context, page, fetched };
};
// The shell being installed: the version served may change while the probe runs (the tree is edited), so the largest
// shell cache is read, whatever its version.
const storedIn = (page) => page.evaluate(async () => {
    let most = 0;
    for (const name of (await caches.keys()).filter((key) => key.startsWith('atome-shell-'))) {
        most = Math.max(most, (await (await caches.open(name)).keys()).length);
    }
    return most;
});
const waitStored = async (page, atLeast, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    let stored = 0;
    while (Date.now() < deadline) {
        stored = await storedIn(page).catch(() => stored);
        if (stored >= atLeast) return stored;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return stored;
};

// A probe that hangs ends in an explicit failure, its browsers closed, never holding the machine.
const opened = [];
const PROBE_DEADLINE_MS = 20 * 60_000;
setTimeout(() => {
    console.log(`FAIL probe_deadline ${JSON.stringify({ afterMs: PROBE_DEADLINE_MS, checks })}`);
    Promise.allSettled(opened.map((context) => context.close())).finally(() => process.exit(1));
}, PROBE_DEADLINE_MS).unref();

try {
    // First install, cut short: the browser closes once a quarter of the shell is stored.
    const first = await open();
    const quarter = Math.ceil(assetUrls.size / 4);
    const keptAtCut = await waitStored(first.page, quarter, 300_000);
    await first.context.close();
    check('first_install_cut_after_a_quarter', keptAtCut >= quarter && keptAtCut < assetUrls.size, { keptAtCut, total: assetUrls.size });

    // Next visit: the install resumes; it downloads only what the cut install had not verified.
    const second = await open();
    await second.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 600_000 });
    // The version that installed is the one served now: its shell holds its whole manifest.
    const served = await second.page.evaluate(async () => {
        const name = `atome-shell-${await (await (await caches.open('atome-active-version')).match('/__atome_active_version')).text()}`;
        return { name, stored: (await (await caches.open(name)).keys()).length, total: self.__ATOME_OFFLINE_ASSETS__?.assets?.length ?? null };
    });
    const manifestNow = await (await fetch(`${APP_URL}/offline-manifest.js`)).text();
    const totalNow = JSON.parse(manifestNow.slice(manifestNow.indexOf('=') + 1).replace(/;\s*$/, '')).assets.length;
    check('second_install_completes', served.stored >= totalNow - 12 && served.stored > keptAtCut, { ...served, totalNow });
    const refetched = [...second.fetched].length;
    check('second_install_fetches_only_the_rest', refetched <= assetUrls.size - keptAtCut + 12, { refetched, keptAtCut, total: assetUrls.size });
    await second.context.close();
} catch (error) {
    check('probe_ran', false, String(error?.stack || error).slice(0, 400));
} finally {
    await Promise.allSettled(opened.map((context) => context.close()));
    fs.rmSync(profile, { recursive: true, force: true });
}
const failed = checks.filter((entry) => !entry.ok).length;
console.log(`sw_install_resumes: ${checks.length - failed}/${checks.length}`);
process.exitCode = failed ? 1 : 0;
