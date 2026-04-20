import fs from 'fs';
import path from 'path';
import { chromium, webkit } from 'playwright';

const ROOT_DIR = process.cwd();
const TARGET_URL = String(process.env.TARGET_URL || 'http://127.0.0.1:3000').trim();
const RELOAD_COUNT = Math.max(1, Number(process.env.RELOAD_COUNT || 20));
const BROWSER_NAME = String(process.env.PLAYWRIGHT_BROWSER || 'webkit').trim().toLowerCase();
const HEADLESS = String(process.env.PLAYWRIGHT_HEADLESS || 'true').trim().toLowerCase() !== 'false';
const OUT_DIR = path.join(ROOT_DIR, 'logs', 'ui-tests', `cors_reload_probe_${Date.now()}`);

fs.mkdirSync(OUT_DIR, { recursive: true });

const browserType = BROWSER_NAME === 'chromium' ? chromium : webkit;

const report = {
    targetUrl: TARGET_URL,
    reloadCount: RELOAD_COUNT,
    browser: BROWSER_NAME,
    headless: HEADLESS,
    startedAt: new Date().toISOString(),
    iterations: [],
    createdAtome: null,
    failures: []
};

const currentIterationRef = { value: 'bootstrap' };

const isCors3001Error = (text = '') => {
    const normalized = String(text || '').toLowerCase();
    return normalized.includes('localhost:3001')
        && (normalized.includes('access control checks') || normalized.includes('fetch api cannot load'));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeConsoleMessage = (msg) => ({
    type: msg.type(),
    text: msg.text(),
    location: msg.location()
});

const attachConsoleCapture = (page, iterationStore) => {
    page.on('console', async (msg) => {
        const entry = {
            iteration: currentIterationRef.value,
            ...sanitizeConsoleMessage(msg)
        };
        iterationStore.push(entry);
        if (isCors3001Error(entry.text)) {
            report.failures.push(entry);
        }
    });
    page.on('pageerror', (error) => {
        const entry = {
            iteration: currentIterationRef.value,
            type: 'pageerror',
            text: error?.message || String(error)
        };
        iterationStore.push(entry);
        if (isCors3001Error(entry.text)) {
            report.failures.push(entry);
        }
    });
};

const waitForDebugSurface = async (page) => {
    await page.waitForFunction(() => {
        return !!(
            window.__DEBUG__
            && typeof window.__DEBUG__.getPersistenceState === 'function'
            && typeof window.__DEBUG__.setDeterministicTestMode === 'function'
            && window.eveToolBase
            && typeof window.eveToolBase.createAtome === 'function'
        );
    }, { timeout: 30000 });
};

const collectState = async (page, label) => {
    return page.evaluate(async ({ stepLabel }) => {
        const persistence = await window.__DEBUG__.getPersistenceState().catch((error) => ({
            ok: false,
            error: error?.message || String(error)
        }));
        return {
            label: stepLabel,
            origin: window.location.origin,
            authSource: window.__SQUIRREL_AUTH_SOURCE__ || null,
            dataSource: window.__SQUIRREL_DATA_SOURCE__ || null,
            allowFastifyPrimaryOnLocalAxum: window.__SQUIRREL_ALLOW_FASTIFY_PRIMARY_ON_LOCAL_AXUM__ === true,
            fastifyUrl: window.__SQUIRREL_FASTIFY_URL__ || null,
            tauriFastifyUrl: window.__SQUIRREL_TAURI_FASTIFY_URL__ || null,
            persistence,
            flowerLog: Array.isArray(window.__EVE_FLOWER_DEBUG_LOG__)
                ? window.__EVE_FLOWER_DEBUG_LOG__.slice(-40)
                : []
        };
    }, { stepLabel: label });
};

const createVideoAtome = async (page) => {
    return page.evaluate(async () => {
        window.__DEBUG__.setDeterministicTestMode(true);
        const persistence = await window.__DEBUG__.getPersistenceState();
        const projectId = persistence?.projectIds?.uiCurrent
            || persistence?.projectIds?.adoleCurrent
            || persistence?.currentProject?.id
            || window.__currentProject?.id
            || null;
        if (!projectId) {
            return { ok: false, error: 'project_id_missing', persistence };
        }
        const result = await window.eveToolBase.createAtome({
            kind: 'video',
            src: '/assets/videos/superman.mp4',
            name: `cors_probe_video_${Date.now()}`,
            projectId,
            parentId: projectId,
            parent_id: projectId
        });
        return { ok: !!result?.ok, result, projectId };
    });
};

const main = async () => {
    const browser = await browserType.launch({ headless: HEADLESS });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 960 }
    });
    await context.addInitScript(() => {
        window.__EVE_PERSISTENCE_DIAG__ = true;
        window.__EVE_FLOWER_DEBUG__ = true;
        window.__SYNC_DEBUG__ = true;
    });
    const page = await context.newPage();
    const consoleEntries = [];
    attachConsoleCapture(page, consoleEntries);

    currentIterationRef.value = 'initial_load';
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForDebugSurface(page);
    await wait(1500);

    const beforeCreate = await collectState(page, 'before_create');
    report.iterations.push({ index: -1, label: 'before_create', state: beforeCreate, consoleEntries: [] });

    const created = await createVideoAtome(page);
    report.createdAtome = created;
    await wait(2500);

    const afterCreate = await collectState(page, 'after_create');
    report.iterations.push({
        index: 0,
        label: 'after_create',
        state: afterCreate,
        consoleEntries: consoleEntries.splice(0, consoleEntries.length)
    });

    for (let index = 1; index <= RELOAD_COUNT; index += 1) {
        currentIterationRef.value = `reload_${index}`;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForDebugSurface(page);
        await wait(1500);
        const state = await collectState(page, `reload_${index}`);
        const iterationConsoleEntries = consoleEntries.splice(0, consoleEntries.length);
        const iteration = {
            index,
            label: `reload_${index}`,
            state,
            consoleEntries: iterationConsoleEntries
        };
        report.iterations.push(iteration);

        if (iterationConsoleEntries.some((entry) => isCors3001Error(entry.text))) {
            const screenshotPath = path.join(OUT_DIR, `reload_${index}_failure.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
            iteration.screenshot = screenshotPath;
        }
    }

    report.finishedAt = new Date().toISOString();
    report.failureCount = report.failures.length;
    const reportPath = path.join(OUT_DIR, 'report.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written to ${reportPath}`);
    console.log(`Failures: ${report.failureCount}`);

    await context.close();
    await browser.close();

    if (report.failureCount > 0) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});