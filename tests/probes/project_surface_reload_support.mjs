import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
    APP_URL,
    enterGuestWorkspace,
    waitFor,
    waitFrames
} from './dashboard_workspace_stress/support.mjs';

export const LARGE_RELOAD_VIEWPORT = { width: 1681, height: 960 };

const HEADER_PATTERN = /^__eve_dashboard_header_(?!bg|icon|side)/;

const safeName = (value) => String(value || 'shot').replace(/[^a-z0-9._-]+/gi, '_');

const readHeaderPixels = (file, snapshot) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    const viewport = snapshot?.viewport || {};
    const scaleX = png.width / Math.max(1, Number(viewport.width || png.width || 1));
    const scaleY = png.height / Math.max(1, Number(viewport.height || png.height || 1));
    return (snapshot?.visibleDashboardHeaderRects || []).map((entry) => {
        const rect = entry.rect || {};
        const left = Math.max(0, Math.floor(Number(rect.x || 0) * scaleX));
        const top = Math.max(0, Math.floor(Number(rect.y || 0) * scaleY));
        const right = Math.min(png.width - 1, Math.ceil((Number(rect.x || 0) + Number(rect.width || 0)) * scaleX));
        const bottom = Math.min(png.height - 1, Math.ceil((Number(rect.y || 0) + Number(rect.height || 0)) * scaleY));
        let bright = 0;
        let samples = 0;
        for (let y = top; y <= bottom; y += 3) {
            for (let x = left; x <= right; x += 3) {
                const offset = (y * png.width + x) * 4;
                const alpha = png.data[offset + 3];
                const red = png.data[offset];
                const green = png.data[offset + 1];
                const blue = png.data[offset + 2];
                if (alpha > 128 && red > 175 && green > 175 && blue > 175) bright += 1;
                samples += 1;
            }
        }
        return { id: entry.id, text: entry.text, brightRatio: Number((bright / Math.max(1, samples)).toFixed(6)), samples };
    });
};

const classifyDashboardFailure = ({ snapshot = null, headerPixels = [] } = {}) => {
    if (!snapshot?.canvas) return 'project_canvas_missing';
    if (snapshot.bevyStartError) return snapshot.bevyStartError;
    if (snapshot.projectionError) return snapshot.projectionError;
    if (snapshot.dashboardActive !== true || !snapshot.visibleDashboardIds?.length) return 'dashboard_records_absent';
    if (!snapshot.visibleDashboardHeaderTexts?.length) return 'dashboard_header_records_absent';
    if (snapshot.projectionOk !== true) return 'dashboard_projection_not_ok';
    if (snapshot.bevyStarted !== true) return 'bevy_renderer_not_started';
    if (snapshot.bevyHeaderDeferred?.length || snapshot.bevyHeaderSkipped?.length) return 'dashboard_header_resources_pending';
    if (snapshot.projectionOk === true && snapshot.headerVirtualIds?.length && headerPixels.some((entry) => entry.brightRatio < 0.02)) {
        return 'dashboard_header_pixels_missing_after_projection';
    }
    if (!snapshot.sizeOk) return 'surface_size_stale';
    return 'dashboard_state_unclassified';
};

const createReport = ({ reportDir, browserName }) => {
    const report = {
        ok: false,
        appUrl: APP_URL,
        browserName,
        viewport: LARGE_RELOAD_VIEWPORT,
        frames: [],
        console: [],
        pageErrors: [],
        requestFailures: [],
        ignoredRequestFailures: [],
        screenshots: [],
        classifications: []
    };
    const reportFile = path.join(reportDir, 'report.json');
    const save = () => {
        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    };
    const screenshot = async (page, name) => {
        const file = path.join(reportDir, `${safeName(name)}.png`);
        await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
        report.screenshots.push(file);
        return file;
    };
    return { report, reportFile, save, screenshot };
};

export const attachReloadDiagnostics = (page, report) => {
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
        if (failure === 'net::ERR_ABORTED' && (/squirrel_bevy_renderer_bg\.wasm/i.test(url) || /\/api\/state_current\//i.test(url))) {
            report.ignoredRequestFailures.push({ url, failure, reason: 'navigation_replaced_inflight_request' });
            return;
        }
        report.requestFailures.push({ url, failure });
    });
};

export const waitWorkspaceOverlayGone = async (page) => {
    const state = await waitFor(page, () => {
        const login = document.getElementById('eve_login_sequence');
        if (!login) return { ok: true, reason: 'missing' };
        const rect = login.getBoundingClientRect();
        const style = window.getComputedStyle(login);
        const ok = style.pointerEvents === 'none'
            || style.display === 'none'
            || style.visibility === 'hidden'
            || Number(style.opacity || 1) <= 0.01
            || rect.width <= 0
            || rect.height <= 0;
        return {
            ok,
            reason: ok ? 'not_blocking' : 'still_blocking',
            rect: {
                x: Number(rect.x || 0),
                y: Number(rect.y || 0),
                width: Number(rect.width || 0),
                height: Number(rect.height || 0)
            },
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            className: login.className || '',
            currentProjectId: window.__currentProject?.id || '',
            dashboardActive: window.eveDashboardRuntime?.state?.active === true
        };
    }, 30000, 150);
    return state;
};

export const captureWorkspaceOverlayState = (page) => page.evaluate(() => {
    const login = document.getElementById('eve_login_sequence');
    if (!login) return { present: false, ok: true, reason: 'missing' };
    const rect = login.getBoundingClientRect();
    const style = window.getComputedStyle(login);
    const ok = style.pointerEvents === 'none'
        || style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || 1) <= 0.01
        || rect.width <= 0
        || rect.height <= 0;
    return {
        present: true,
        ok,
        reason: ok ? 'not_blocking' : 'still_blocking',
        rect: {
            x: Number(rect.x || 0),
            y: Number(rect.y || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0)
        },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        className: login.className || ''
    };
});

export const surfaceSnapshot = async (page, label) => page.evaluate(async (snapshotLabel) => {
    const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
    const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const currentProjectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || '';
    const dashboardState = window.eveDashboardRuntime?.state || {};
    const sceneProjectId = dashboardState.active === true ? (dashboardState.projectId || '__eve_dashboard_workspace__') : currentProjectId;
    const canvas = document.getElementById('eve_surface_project');
    const scene = sceneProjectId ? window.eveToolBase?.getProjectSceneState?.(sceneProjectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const bevy = canvas ? readBevyWebRendererState(canvas) : null;
    const nodes = Array.isArray(bevy?.virtual_scene?.nodes) ? bevy.virtual_scene.nodes : [];
    const headerRecords = records.filter((record) => /^__eve_dashboard_header_(?!bg|icon|side)/.test(String(record?.id || '')));
    const visible = (record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0;
    const text = (record) => String(record?.properties?.text || '').trim();
    const rectOf = (node) => {
        const rect = node?.getBoundingClientRect?.();
        return rect ? { x: Number(rect.x || 0), y: Number(rect.y || 0), width: Number(rect.width || 0), height: Number(rect.height || 0) } : null;
    };
    const viewport = { width: Number(window.visualViewport?.width || window.innerWidth || 0), height: Number(window.visualViewport?.height || window.innerHeight || 0) };
    const surface = canvas ? readRenderSurfaceSize(canvas) : null;
    const canvasRect = rectOf(canvas);
    const backingOk = !!canvas
        && Number(canvas.width || 0) === Math.round(Number(surface?.pixelWidth || 0))
        && Number(canvas.height || 0) === Math.round(Number(surface?.pixelHeight || 0));
    const bevyOk = !bevy?.started || (
        Math.abs(Number(bevy?.width || 0) - viewport.width) <= 2
        && Math.abs(Number(bevy?.height || 0) - viewport.height) <= 2
    );
    const sizeOk = !!canvasRect
        && Math.abs(canvasRect.width - viewport.width) <= 2
        && Math.abs(canvasRect.height - viewport.height) <= 2
        && Math.abs(Number(surface?.width || 0) - viewport.width) <= 2
        && Math.abs(Number(surface?.height || 0) - viewport.height) <= 2
        && backingOk
        && bevyOk;
    const headerIds = new Set(headerRecords.map((record) => String(record?.id || '')).filter(Boolean));
    const dashboardRecords = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const visibleDashboard = dashboardRecords.filter(visible);
    const bevyPending = (entries = []) => entries
        .map((entry) => ({ id: String(entry?.id || entry || ''), reason: String(entry?.error || entry?.reason || '') }))
        .filter((entry) => headerIds.has(entry.id));
    return {
        ok: sizeOk,
        sizeOk,
        label: snapshotLabel,
        currentProjectId,
        sceneProjectId,
        viewport,
        view: rectOf(document.getElementById('view')),
        layer: rectOf(sceneProjectId ? document.getElementById(`project_view_${sceneProjectId}`) : null),
        canvas: canvasRect,
        backing: canvas ? { width: canvas.width, height: canvas.height } : null,
        surface,
        projectionOk: scene?.projection?.ok === true,
        bevySurface: bevy ? { width: bevy.width || null, height: bevy.height || null } : null,
        bevyStarted: bevy?.started === true,
        bevyStarting: bevy?.starting === true,
        bevyStartError: bevy?.start_error || null,
        projectionError: scene?.projection?.render_result?.error || null,
        backingOk,
        bevyOk,
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        dashboardActive: window.eveDashboardRuntime?.state?.active === true,
        visibleDashboardIds: visibleDashboard.map((record) => record.id),
        visibleDashboardCardCount: visibleDashboard.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_card_')).length,
        visibleDashboardTitleTexts: visibleDashboard
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_card_title_'))
            .map(text)
            .filter(Boolean),
        visibleDashboardHeaderTexts: headerRecords.filter(visible).map(text).filter(Boolean),
        visibleDashboardHeaderRects: headerRecords.filter(visible).map((record) => ({
            id: String(record?.id || ''),
            text: text(record),
            rect: { x: Number(record?.properties?.left ?? record?.properties?.x ?? 0), y: Number(record?.properties?.top ?? record?.properties?.y ?? 0), width: Number(record?.properties?.width ?? 0), height: Number(record?.properties?.height ?? 0) }
        })),
        headerVirtualIds: nodes.map((node) => String(node?.id || '')).filter((id) => headerIds.has(id)),
        bevyHeaderDeferred: bevyPending(bevy?.deferred_nodes || []),
        bevyHeaderSkipped: bevyPending(bevy?.skipped_nodes || []),
        probeErrors: Array.isArray(window.__EVE_PROBE_ERRORS__) ? window.__EVE_PROBE_ERRORS__.slice(-20) : []
    };
}, label);

export const captureSettled = async ({ page, report, save, screenshot, label }) => {
    await waitFrames(page, 8);
    const snapshot = await surfaceSnapshot(page, label);
    report.frames.push(snapshot);
    if (!snapshot.ok) await screenshot(page, `${label}_failed`);
    save();
    return snapshot;
};

export const assertDashboardOpen = (snapshot, reason) => {
    if (
        snapshot.dashboardActive !== true
        || !snapshot.visibleDashboardIds?.length
        || !snapshot.visibleDashboardCardCount
        || !snapshot.visibleDashboardTitleTexts?.length
        || !snapshot.visibleDashboardHeaderTexts?.length
        || snapshot.projectionOk !== true
        || snapshot.bevyStarted !== true
    ) {
        throw new Error(`dashboard_not_open_after_boot:${reason}:${JSON.stringify({
            active: snapshot.dashboardActive,
            sceneProjectId: snapshot.sceneProjectId,
            projectionOk: snapshot.projectionOk,
            bevyStarted: snapshot.bevyStarted,
            bevyStartError: snapshot.bevyStartError,
            projectionError: snapshot.projectionError,
            visibleDashboardIds: snapshot.visibleDashboardIds,
            visibleDashboardCardCount: snapshot.visibleDashboardCardCount,
            visibleDashboardTitleTexts: snapshot.visibleDashboardTitleTexts || [],
            visibleDashboardHeaderTexts: snapshot.visibleDashboardHeaderTexts || []
        })}`);
    }
};

export const captureHeaderPixels = async ({ page, report, save, screenshot, snapshot, label }) => {
    const file = await screenshot(page, `${label}_headers`);
    const headerPixels = readHeaderPixels(file, snapshot);
    const pass = headerPixels.length > 0 && headerPixels.every((entry) => entry.brightRatio >= 0.02);
    const frame = { label: `${label}_header_pixels`, pass, headerPixels };
    report.frames.push(frame);
    save();
    return frame;
};

export const waitForDashboardOpen = async ({ page, report, save, screenshot, label }) => {
    const ready = await waitFor(page, () => {
        const currentProjectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || '';
        const dashboardState = window.eveDashboardRuntime?.state || {};
        const sceneProjectId = dashboardState.active === true ? (dashboardState.projectId || '__eve_dashboard_workspace__') : currentProjectId;
        const scene = window.eveToolBase?.getProjectSceneState?.(sceneProjectId) || null;
        const records = Array.from(scene?.records || []);
        const visibleDashboardIds = records
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
            .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0);
        const visibleCards = visibleDashboardIds.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_card_'));
        const visibleTitles = visibleDashboardIds
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_card_title_'))
            .map((record) => String(record?.properties?.text || '').trim())
            .filter(Boolean);
        const visibleHeaders = visibleDashboardIds
            .filter((record) => /^__eve_dashboard_header_(?!bg|icon|side)/.test(String(record?.id || '')))
            .map((record) => String(record?.properties?.text || '').trim())
            .filter(Boolean);
        const ok = window.eveDashboardRuntime?.state?.active === true
            && visibleDashboardIds.length > 0
            && visibleCards.length > 0
            && visibleTitles.length > 0
            && visibleHeaders.length > 0
            && scene?.projection?.ok === true;
        return {
            ok,
            active: window.eveDashboardRuntime?.state?.active === true,
            currentProjectId,
            sceneProjectId,
            projectionOk: scene?.projection?.ok === true,
            projectionError: scene?.projection?.render_result?.error || '',
            visibleDashboardCount: visibleDashboardIds.length,
            visibleCardCount: visibleCards.length,
            visibleTitles,
            visibleHeaders
        };
    }, 30000, 150);
    const snapshot = await captureSettled({ page, report, save, screenshot, label });
    if (!ready.ok) {
        const overlay = await captureWorkspaceOverlayState(page);
        const classification = classifyDashboardFailure({ snapshot, headerPixels: [] });
        report.classifications.push({
            label,
            classification,
            waitState: ready.last,
            overlay
        });
        await screenshot(page, `${label}_not_ready`);
        save();
        throw new Error(`dashboard_not_ready:${classification}:${JSON.stringify({ waitState: ready.last, overlay })}`);
    }
    assertDashboardOpen(snapshot, label);
    return {
        snapshot,
        pixels: await captureHeaderPixels({ page, report, save, screenshot, snapshot, label })
    };
};

export const assertDashboardStable = async ({
    page,
    report,
    save,
    screenshot,
    label,
    durationMs = 6000,
    resizeAfterFailure = false
}) => {
    const deadline = Date.now() + durationMs;
    let snapshot = null;
    while (Date.now() < deadline) {
        await waitFrames(page, 4);
        snapshot = await surfaceSnapshot(page, label);
        report.frames.push(snapshot);
        if (!snapshot.ok) throw new Error(`project_surface_reload_failed:${JSON.stringify(snapshot)}`);
        assertDashboardOpen(snapshot, label);
    }
    const pixels = await captureHeaderPixels({ page, report, save, screenshot, snapshot, label });
    if (!pixels.pass) {
        const classification = classifyDashboardFailure({ snapshot, headerPixels: pixels.headerPixels });
        const afterResize = resizeAfterFailure
            ? await captureResizeComparison({ page, report, save, screenshot, label: `${label}_diagnostic` })
            : null;
        report.classifications.push({
            label,
            classification,
            beforeResize: pixels,
            afterResize: afterResize?.pixels || null
        });
        save();
        throw new Error(`dashboard_header_pixels_missing:${classification}:${label}:${JSON.stringify({
            before: pixels.headerPixels,
            after: afterResize?.pixels?.headerPixels || []
        })}`);
    }
    save();
    return { snapshot, pixels };
};

export const captureResizeComparison = async ({ page, report, save, screenshot, label, delta = 1 }) => {
    const viewport = page.viewportSize();
    await page.setViewportSize({
        width: Number(viewport?.width || LARGE_RELOAD_VIEWPORT.width) + delta,
        height: Number(viewport?.height || LARGE_RELOAD_VIEWPORT.height)
    });
    await waitFrames(page, 12);
    const snapshot = await surfaceSnapshot(page, `${label}_after_resize`);
    report.frames.push(snapshot);
    const pixels = await captureHeaderPixels({ page, report, save, screenshot, snapshot, label: `${label}_after_resize` });
    return { snapshot, pixels };
};

export const runLargeReloadProbe = async ({
    browserType,
    browserName,
    reportDir,
    headless = process.env.ATOME_PLAYWRIGHT_HEADLESS !== '0',
    resizeAfterReloadDiagnostic = false
}) => {
    const { report, save, screenshot } = createReport({ reportDir, browserName });
    fs.mkdirSync(reportDir, { recursive: true });
    const browser = await browserType.launch({ headless });
    const page = await browser.newPage({ viewport: LARGE_RELOAD_VIEWPORT });
    await page.addInitScript(() => {
        window.__EVE_PROBE_ERRORS__ = [];
        const push = (type, error) => {
            window.__EVE_PROBE_ERRORS__.push({
                type,
                message: String(error?.message || error || ''),
                stack: String(error?.stack || '')
            });
        };
        window.addEventListener('error', (event) => push('error', event.error || event.message));
        window.addEventListener('unhandledrejection', (event) => push('unhandledrejection', event.reason));
    });
    attachReloadDiagnostics(page, report);
    try {
        await enterGuestWorkspace(page);
        report.frames.push({ label: 'workspace_overlay_after_entry', overlay: await captureWorkspaceOverlayState(page) });
        await waitForDashboardOpen({ page, report, save, screenshot, label: 'large_initial_dashboard' });
        await assertDashboardStable({
            page,
            report,
            save,
            screenshot,
            label: 'large_initial_dashboard_stable',
            resizeAfterFailure: resizeAfterReloadDiagnostic
        });
        await page.reload({ timeout: 45000 });
        await page.waitForFunction(() => (
            (!!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'))
            && !!document.getElementById('eve_surface_project')
        ), null, { timeout: 45000 });
        const reload = await waitForDashboardOpen({ page, report, save, screenshot, label: 'large_reload_before_resize' });
        if (!reload.pixels.pass) {
            const classification = classifyDashboardFailure({
                snapshot: reload.snapshot,
                headerPixels: reload.pixels.headerPixels
            });
            const afterResize = resizeAfterReloadDiagnostic
                ? await captureResizeComparison({ page, report, save, screenshot, label: 'large_reload_diagnostic' })
                : null;
            report.classifications.push({ label: 'large_reload_before_resize', classification, afterResize: afterResize?.pixels || null });
            save();
            throw new Error(`dashboard_reload_before_resize_failed:${classification}:${JSON.stringify({
                before: reload.pixels.headerPixels,
                after: afterResize?.pixels?.headerPixels || []
            })}`);
        }
        await assertDashboardStable({
            page,
            report,
            save,
            screenshot,
            label: 'large_reload_before_resize_stable',
            resizeAfterFailure: resizeAfterReloadDiagnostic
        });
        if (resizeAfterReloadDiagnostic) {
            const afterResize = await captureResizeComparison({ page, report, save, screenshot, label: 'large_reload_diagnostic' });
            report.classifications.push({
                label: 'large_reload_after_resize',
                classification: afterResize.pixels.pass ? 'resize_diagnostic_headers_visible' : 'resize_diagnostic_headers_missing',
                afterResize: afterResize.pixels
            });
        }
        if (report.console.length || report.pageErrors.length || report.requestFailures.length) {
            throw new Error(`project_surface_reload_console_failure:${JSON.stringify({
                console: report.console,
                pageErrors: report.pageErrors,
                requestFailures: report.requestFailures
            })}`);
        }
        report.ok = true;
        save();
    } finally {
        await browser.close();
    }
};
