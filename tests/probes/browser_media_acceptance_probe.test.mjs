import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {
    APP_URL,
    HEADLESS,
    LOG_FILE,
    MEDIA_DIR,
    MEDIA_CASES,
    OUT_DIR,
    REPORT_FILE,
    bootstrapImport,
    ensureFilesExist,
    importMedia,
    log,
    redactSecrets,
    resolveImportedAtomeIds,
    safeName,
    sleep,
    tryLogin,
    waitFor,
    writeJson
} from './browser_media_acceptance_probe_runtime.mjs';
import {
    buildCaseMap,
    collectDesktopInventory,
    resolveVisibleDesktopEntry
} from './browser_media_acceptance_probe_inventory.mjs';
import {
    verifyDesktopCase
} from './browser_media_acceptance_probe_desktop.mjs';

const buildSummary = (report) => {
    const desktop = Object.values(report.desktop || {});
    const desktopFailed = desktop.filter((entry) => entry.ok !== true).map((entry) => entry.media?.name || entry.media?.key || 'unknown');
    return {
        ok: desktopFailed.length === 0,
        desktop: {
            total: desktop.length,
            failed: desktopFailed.length,
            failed_cases: desktopFailed
        }
    };
};

const run = async () => {
    fs.writeFileSync(LOG_FILE, '');
    ensureFilesExist();
    log('start', { APP_URL, MEDIA_DIR, HEADLESS, files: MEDIA_CASES.map((entry) => entry.name) });
    const report = {
        ok: false,
        created_at: new Date().toISOString(),
        app_url: APP_URL,
        media_dir: MEDIA_DIR,
        import_result: null,
        login: null,
        desktop_inventory: null,
        desktop: {},
        summary: null,
        console_errors: [],
        http_errors: []
    };
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
            '--enable-features=Vulkan,UseSkiaRenderer',
            '--disable-gpu-sandbox'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const text = redactSecrets(msg.text());
        if (msg.type() === 'error' || msg.type() === 'warning') {
            report.console_errors.push({ type: msg.type(), text });
        }
        log('console', { type: msg.type(), text });
    });
    page.on('pageerror', (error) => {
        report.console_errors.push({ type: 'pageerror', text: error.message });
        log('pageerror', { message: error.message });
    });
    page.on('response', (response) => {
        if (response.status() >= 400) {
            const entry = { status: response.status(), url: redactSecrets(response.url()) };
            report.http_errors.push(entry);
            log('http_error', entry);
        }
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
        await page.screenshot({ path: path.join(OUT_DIR, '01_loaded.png'), fullPage: true });
        const ready = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true, 30000, 250);
        if (!ready.ok) throw new Error('app_not_ready');
        const login = await tryLogin(page);
        report.login = login;
        writeJson('login.json', login);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        const authReload = await waitFor(page, () => window.__authCheckComplete === true, 20000, 250);
        if (!authReload.ok) throw new Error('auth_reload_incomplete');
        await page.screenshot({ path: path.join(OUT_DIR, '02_after_login.png'), fullPage: true });
        const bootstrap = await bootstrapImport(page);
        writeJson('bootstrap.json', bootstrap);
        const importResult = await importMedia(page);
        report.import_result = importResult;
        writeJson('import_result.json', importResult);
        await sleep(2000);
        await page.screenshot({ path: path.join(OUT_DIR, '03_after_import.png'), fullPage: true });

        const inventoryReady = await waitFor(page, async () => {
            const hosts = Array.from(document.querySelectorAll('[data-atome-id]'));
            const count = hosts.filter((host) => {
                const source = String(host.dataset?.eveMediaSource || '').toLowerCase();
                return ['0000.png', 'atome.svg', 'jeezs', 'vampire', 'test.m4a'].some((token) => source.includes(token));
            }).length;
            return { ok: count >= 5, count };
        }, 45000, 400);
        writeJson('inventory_ready.json', inventoryReady);

        const importedAtomeIds = resolveImportedAtomeIds(importResult);
        const desktopInventory = await collectDesktopInventory(page, importedAtomeIds);
        report.desktop_inventory = desktopInventory;
        writeJson('desktop_inventory.json', desktopInventory);
        const caseMap = buildCaseMap(desktopInventory, importResult);

        for (const mediaCase of MEDIA_CASES) {
            const entry = caseMap.get(mediaCase.name) || null;
            if (!entry) {
                report.desktop[mediaCase.name] = {
                    ok: false,
                    media: mediaCase,
                    error: 'desktop_entry_missing'
                };
                continue;
            }
            log('desktop_case:start', { name: mediaCase.name, atome_id: entry.id, kind: mediaCase.kind });
            const desktopResult = await verifyDesktopCase(page, mediaCase, entry, report);
            writeJson(`${safeName(mediaCase.name)}_desktop.json`, desktopResult);
            log('desktop_case:done', { name: mediaCase.name, ok: desktopResult.ok });
        }

        await page.screenshot({ path: path.join(OUT_DIR, '04_final_desktop.png'), fullPage: true });
        report.summary = buildSummary(report);
        report.ok = report.summary.ok === true;
        writeJson('report.json', report);
        if (!report.ok) {
            throw new Error(`browser_media_acceptance_failed:${JSON.stringify(report.summary)}`);
        }
    } finally {
        writeJson('report.json', report);
        await browser.close();
    }
};

run().catch((error) => {
    log('fatal', { message: error?.message || String(error || 'fatal') });
    process.exit(1);
});
