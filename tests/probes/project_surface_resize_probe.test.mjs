import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    APP_URL,
    clickMainHandle,
    enterGuestWorkspace,
    waitFrames
} from './dashboard_workspace_stress/support.mjs';

const OUT_DIR = path.resolve('temp/probe_reports/project_surface_resize');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const VIEWPORTS = [
    { width: 1440, height: 920 },
    { width: 900, height: 700 },
    { width: 1680, height: 950 },
    { width: 1100, height: 760 },
    { width: 1000, height: 760, refresh: true },
    { width: 1600, height: 960 },
    { width: 800, height: 600 },
    { width: 1600, height: 960 },
    { width: 1440, height: 920 }
];

const report = {
    ok: false,
    appUrl: APP_URL,
    frames: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    screenshots: []
};

const saveReport = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const captureScreenshot = async (page, name) => {
    const file = path.join(OUT_DIR, `${String(name).replace(/[^a-z0-9._-]+/gi, '_')}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
    return file;
};

const surfaceSnapshot = async (page, label) => page.evaluate(async (snapshotLabel) => {
    const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
    const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const currentProjectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || '';
    const view = document.getElementById('view');
    const layer = currentProjectId ? document.getElementById(`project_view_${currentProjectId}`) : null;
    const canvas = document.getElementById('eve_surface_project');
    const rectOf = (node) => {
        const rect = node?.getBoundingClientRect?.();
        return rect ? {
            x: Number(rect.x || 0),
            y: Number(rect.y || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0)
        } : null;
    };
    const bevy = canvas ? readBevyWebRendererState(canvas) : null;
    const surface = canvas ? readRenderSurfaceSize(canvas) : null;
    const viewport = {
        width: Number(window.visualViewport?.width || window.innerWidth || 0),
        height: Number(window.visualViewport?.height || window.innerHeight || 0)
    };
    const canvasRect = rectOf(canvas);
    const backingOk = !!canvas
        && Number(canvas.width || 0) === Math.round(Number(surface?.pixelWidth || 0))
        && Number(canvas.height || 0) === Math.round(Number(surface?.pixelHeight || 0));
    const bevyWidth = Number(bevy?.width || 0);
    const bevyHeight = Number(bevy?.height || 0);
    const bevyOk = !bevy?.started
        || (
            Math.abs(bevyWidth - viewport.width) <= 2
            && Math.abs(bevyHeight - viewport.height) <= 2
        );
    const sizeOk = !!canvasRect
        && Math.abs(canvasRect.width - viewport.width) <= 2
        && Math.abs(canvasRect.height - viewport.height) <= 2
        && Math.abs(Number(surface?.width || 0) - viewport.width) <= 2
        && Math.abs(Number(surface?.height || 0) - viewport.height) <= 2
        && backingOk
        && bevyOk;
    return {
        ok: sizeOk,
        label: snapshotLabel,
        currentProjectId,
        viewport,
        view: rectOf(view),
        layer: rectOf(layer),
        canvas: canvasRect,
        backing: canvas ? { width: canvas.width, height: canvas.height } : null,
        surface,
        bevySurface: bevy ? { width: bevy.width || null, height: bevy.height || null } : null,
        backingOk,
        bevyOk,
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        dashboardActive: window.eveDashboardRuntime?.state?.active === true,
        visibleDashboardIds: Array.from(window.eveToolBase?.getProjectSceneState?.(currentProjectId)?.records || [])
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
            .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0)
            .map((record) => record.id)
    };
}, label);

const captureSettled = async (page, label) => {
    await waitFrames(page, 8);
    const snapshot = await surfaceSnapshot(page, label);
    report.frames.push(snapshot);
    if (!snapshot.ok) {
        report.screenshots.push(await captureScreenshot(page, `${label}_failed`));
    }
    saveReport();
    return snapshot;
};

const assertSettled = async (page, label) => {
    const snapshot = await captureSettled(page, label);
    if (!snapshot.ok) throw new Error(`project_surface_resize_failed:${JSON.stringify(snapshot)}`);
    return snapshot;
};

const assertDashboardClosed = (snapshot, reason) => {
    if (snapshot.dashboardActive === true || snapshot.visibleDashboardIds.length) {
        throw new Error(`dashboard_reopened_or_residue:${reason}:${JSON.stringify({
            active: snapshot.dashboardActive,
            visibleDashboardIds: snapshot.visibleDashboardIds
        })}`);
    }
};

const waitWorkspaceOverlayGone = async (page) => {
    await page.waitForFunction(() => {
        const login = document.getElementById('eve_login_sequence');
        if (!login) return true;
        const rect = login.getBoundingClientRect();
        const style = window.getComputedStyle(login);
        return style.pointerEvents === 'none'
            || style.display === 'none'
            || style.visibility === 'hidden'
            || rect.width <= 0
            || rect.height <= 0;
    }, null, { timeout: 30000 });
};

const closeDashboardIfActive = async (page) => {
    await page.evaluate(async () => {
        if (window.eveDashboardRuntime?.state?.active === true) {
            await window.eveDashboardRuntime.close();
        }
    });
    const snapshot = await captureSettled(page, 'dashboard_initial_closed');
    assertDashboardClosed(snapshot, 'initial_close');
};

const attachDiagnostics = (page) => {
    page.on('console', (message) => {
        if (message.type() === 'error') report.console.push(message.text());
    });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText || '';
        const url = request.url();
        if (/favicon|apple-touch-icon/i.test(url)) return;
        report.requestFailures.push({ url, failure });
    });
};

const run = async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: process.env.ATOME_PLAYWRIGHT_HEADLESS !== '0' });
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    attachDiagnostics(page);
    try {
        await enterGuestWorkspace(page);
        await waitWorkspaceOverlayGone(page);
        await assertSettled(page, 'workspace_ready');
        await closeDashboardIfActive(page);
        await clickMainHandle(page);
        const opened = await assertSettled(page, 'dashboard_open');
        if (opened.dashboardActive !== true || !opened.visibleDashboardIds.length) throw new Error('dashboard_open_failed');
        await clickMainHandle(page);
        const closed = await assertSettled(page, 'dashboard_closed');
        assertDashboardClosed(closed, 'after_close');
        for (let index = 1; index < VIEWPORTS.length; index += 1) {
            await page.setViewportSize(VIEWPORTS[index]);
            if (VIEWPORTS[index].refresh) {
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => (
                    (!!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'))
                    && !!document.getElementById('eve_surface_project')
                ), null, { timeout: 45000 });
            }
            const resized = await assertSettled(page, `resize_${index}_${VIEWPORTS[index].width}x${VIEWPORTS[index].height}`);
            assertDashboardClosed(resized, `resize_${index}`);
        }
        if (report.console.length || report.pageErrors.length || report.requestFailures.length) {
            throw new Error(`project_surface_resize_console_failure:${JSON.stringify({
                console: report.console,
                pageErrors: report.pageErrors,
                requestFailures: report.requestFailures
            })}`);
        }
        report.ok = true;
        saveReport();
    } finally {
        await browser.close();
    }
};

await run();
