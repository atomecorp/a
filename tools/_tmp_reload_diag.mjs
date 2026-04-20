import fs from 'fs';
import path from 'path';
import { webkit } from 'playwright';

const targetUrl = String(process.env.TARGET_URL || 'http://127.0.0.1:1430').trim();
const reloadCount = Math.max(1, Number(process.env.RELOAD_COUNT || 3));
const outDir = path.join(process.cwd(), 'logs', 'ui-tests', `reload_diag_${Date.now()}`);

fs.mkdirSync(outDir, { recursive: true });

const shouldKeepLog = (text = '') => {
    return text.includes('[eVe:kickstart]')
        || text.includes('[eVe:atomes_v2]')
        || text.includes('[eVe:persistence:temporary]')
        || text.includes('Fetch API cannot load');
};

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const logs = [];
const errors = [];

page.on('console', (msg) => {
    const text = msg.text();
    if (!shouldKeepLog(text)) return;
    const entry = { type: msg.type(), text };
    logs.push(entry);
    if (text.includes('Fetch API cannot load')) errors.push(entry);
});

page.on('pageerror', (error) => {
    const text = error?.message || String(error);
    const entry = { type: 'pageerror', text };
    logs.push(entry);
    if (text.includes('Fetch API cannot load')) errors.push(entry);
});

let loaded = false;
let lastLoadError = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
        loaded = true;
        break;
    } catch (error) {
        lastLoadError = error;
    }
}

if (!loaded) {
    await browser.close();
    throw lastLoadError || new Error('page_not_loaded');
}

for (let index = 0; index < reloadCount; index += 1) {
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
}

await page.waitForTimeout(3000);

const state = await page.evaluate(() => ({
    href: window.location.href,
    origin: window.location.origin,
    authSource: window.__SQUIRREL_AUTH_SOURCE__ || null,
    dataSource: window.__SQUIRREL_DATA_SOURCE__ || null,
    fastifyUrl: window.__SQUIRREL_FASTIFY_URL__ || null,
    tauriFastifyUrl: window.__SQUIRREL_TAURI_FASTIFY_URL__ || null,
    allowFastifyPrimaryOnLocalAxum: window.__SQUIRREL_ALLOW_FASTIFY_PRIMARY_ON_LOCAL_AXUM__ === true
}));

const report = {
    targetUrl,
    reloadCount,
    errors,
    logCount: logs.length,
    logs,
    state
};

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(reportPath);

await browser.close();