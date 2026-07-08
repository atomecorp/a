import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    APP_URL,
    analyzeImage,
    enterAuthenticatedWorkspace,
    waitFor,
    waitFrames
} from './dashboard_workspace_stress/support.mjs';
import { ensureProject } from './dashboard_workspace_stress/product_actions.mjs';

const MEDIA_FILE = path.resolve('tests/fixtures/media/0000.png');
const OUT_DIR = path.resolve('temp/probe_reports/browser_media_import_real_ui');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const report = {
    ok: false,
    appUrl: APP_URL,
    mediaFile: MEDIA_FILE,
    steps: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    screenshots: []
};

const writeImportReport = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const captureScreenshot = async (page, name) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${String(name).replace(/[^a-z0-9._-]+/gi, '_')}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
    return file;
};

const readScene = async (page) => page.evaluate(() => {
    const projectId = window.__currentProject?.id || '';
    const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
    const normalized = records.map((record) => ({
        id: String(record?.id || record?.atome_id || record?.atomeId || ''),
        kind: String(record?.kind || record?.type || record?.properties?.media_kind || ''),
        properties: record?.properties || {}
    })).filter((record) => record.id);
    const visibleDashboardIds = normalized
        .filter((record) => record.id.startsWith('__eve_dashboard_'))
        .filter((record) => record.properties.visible !== false && Number(record.properties.opacity ?? 1) > 0)
        .map((record) => record.id);
    return {
        projectId,
        records: normalized,
        visibleDashboardIds,
        toolIds: Array.from(document.querySelectorAll('button[data-tool-id]'))
            .filter((button) => {
                const rect = button.getBoundingClientRect();
                const style = getComputedStyle(button);
                return rect.width > 0
                    && rect.height > 0
                    && style.display !== 'none'
                    && style.visibility !== 'hidden';
            })
            .map((button) => String(button.dataset.toolId || '').trim())
            .filter(Boolean)
    };
});

const waitForWorkspace = async (page) => {
    await enterAuthenticatedWorkspace(page, { prefix: 'browser_media_import_real_ui' });
    await page.waitForFunction(() => (
        (!!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'))
        && !!document.getElementById('eve_surface_project')
    ), null, { timeout: 45000 });
    await waitFrames(page, 8);
};

const closeDashboardAndVerifyClean = async (page) => {
    await page.evaluate(async () => {
        await window.eveDashboardBevyUiRuntime?.close?.();
        window.new_menu_v2?.reveal?.();
    });
    await waitFrames(page, 8);
    const scene = await readScene(page);
    report.steps.push({ label: 'dashboard_closed', visibleDashboardIds: scene.visibleDashboardIds });
    if (scene.visibleDashboardIds.length) {
        throw new Error(`dashboard_residue_before_import:${scene.visibleDashboardIds.join(',')}`);
    }
    return scene;
};

const waitForImportButton = async (page) => {
    await page.evaluate(() => window.new_menu_v2?.reveal?.());
    const capture = page.locator('button[data-tool-id="tool.main.capture"]').first();
    await capture.waitFor({ state: 'visible', timeout: 15000 });
    await capture.click({ timeout: 10000 });
    await page.waitForFunction(() => {
        const button = document.querySelector('button[data-tool-id="ui.capture.import"]');
        if (!(button instanceof HTMLElement)) return false;
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.width > 0 && rect.height > 0 && (button === top || button.contains(top));
    }, null, { timeout: 10000 });
    return page.locator('button[data-tool-id="ui.capture.import"]').first();
};

const run = async () => {
    if (!fs.existsSync(MEDIA_FILE)) throw new Error(`media_fixture_missing:${MEDIA_FILE}`);
    const browser = await chromium.launch({ headless: process.env.ATOME_PLAYWRIGHT_HEADLESS !== '0' });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1040 } });
    page.on('console', (message) => {
        if (message.type() === 'error') report.console.push(message.text());
    });
    page.on('pageerror', (error) => report.pageErrors.push(error?.message || String(error)));
    page.on('requestfailed', (request) => {
        const url = request.url();
        if (/favicon|apple-touch-icon/i.test(url)) return;
        report.requestFailures.push({ url, failure: request.failure()?.errorText || '' });
    });
    try {
        await waitForWorkspace(page);
        await closeDashboardAndVerifyClean(page);
        const project = await ensureProject(page, `browser media import real UI ${Date.now()}`);
        if (!project?.ok) throw new Error(`browser_import_project_unavailable:${JSON.stringify(project)}`);
        const before = await readScene(page);
        report.steps.push({ label: 'workspace_ready', projectId: before.projectId, recordCount: before.records.length, toolIds: before.toolIds });
        await page.evaluate(() => {
            try { window.showOpenFilePicker = undefined; } catch (_) { }
        });
        const importButton = await waitForImportButton(page);
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 12000 });
        await importButton.click({ timeout: 10000 });
        const chooser = await chooserPromise;
        await chooser.setFiles(MEDIA_FILE);
        const beforeIds = before.records.map((record) => record.id);
        const imported = await waitFor(page, (knownIds) => {
            const projectId = window.__currentProject?.id || '';
            const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
            const known = new Set(knownIds);
            const created = records
                .map((record) => ({
                    id: String(record?.id || record?.atome_id || record?.atomeId || ''),
                    kind: String(record?.kind || record?.type || record?.properties?.media_kind || ''),
                    properties: record?.properties || {}
                }))
                .filter((record) => record.id && !known.has(record.id) && !record.id.startsWith('__eve_dashboard_'));
            return { ok: created.length > 0, projectId, created };
        }, 60000, 500, beforeIds);
        report.steps.push({ label: 'imported', imported });
        if (!imported.ok) throw new Error(`browser_import_atome_missing:${JSON.stringify(imported.last)}`);
        await waitFrames(page, 12);
        const shot = await captureScreenshot(page, 'browser_media_import_real_ui_after');
        report.screenshots.push(shot);
        const image = analyzeImage(shot);
        report.steps.push({ label: 'screenshot', image });
        if (image.nonEmptyRatio <= 0.01 || image.lumaRange <= 8) {
            throw new Error(`browser_import_canvas_pixels_empty:${JSON.stringify(image)}`);
        }
        if (report.console.length || report.pageErrors.length || report.requestFailures.length) {
            throw new Error(`browser_import_console_failure:${JSON.stringify({
                console: report.console,
                pageErrors: report.pageErrors,
                requestFailures: report.requestFailures
            })}`);
        }
        report.ok = true;
    } finally {
        writeImportReport();
        await browser.close();
    }
};

await run();
