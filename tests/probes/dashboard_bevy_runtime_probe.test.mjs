import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/dashboard_bevy_runtime');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const DASHBOARD_OPEN_SCREENSHOT = path.join(OUT_DIR, 'dashboard_open.png');
const DASHBOARD_MONITOR_SCREENSHOT = path.join(OUT_DIR, 'dashboard_monitor.png');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeReport = (report) => {
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, arg);
            if (last === true || last?.ok === true) return { ok: true, last };
        } catch (error) {
            last = { ok: false, error: error?.message || String(error) };
        }
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const waitForRuntimeReady = async (page) => waitFor(page, () => ({
    ok: !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'),
    hasDebug: !!window.__DEBUG__,
    hasMenu: !!window.new_menu_v2,
    hasIntuition: !!document.getElementById('intuition')
}), 45000);

const waitForLoginSequenceInactive = async (page) => waitFor(page, () => {
    const sequence = document.getElementById('eve_login_sequence');
    if (!sequence) return { ok: true, state: 'missing' };
    const style = getComputedStyle(sequence);
    const rect = sequence.getBoundingClientRect();
    const hidden = style.display === 'none'
        || style.visibility === 'hidden'
        || style.pointerEvents === 'none'
        || rect.width <= 0
        || rect.height <= 0;
    return {
        ok: hidden,
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        opacity: style.opacity,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
}, 45000, 250);

const waitForGuestProject = async (page) => waitFor(page, async () => {
    const api = window.AdoleAPI || null;
    let current = null;
    try {
        current = api?.auth?.current ? await api.auth.current() : null;
    } catch (error) {
        current = { error: error?.message || String(error) };
    }
    const projectId = window.__currentProject?.id || null;
    const canvas = document.getElementById('eve_surface_project');
    const sequence = document.getElementById('eve_login_sequence');
    const sequenceHidden = !sequence || getComputedStyle(sequence).display === 'none';
    const isAnonymous = api?.security?.isAnonymous ? api.security.isAnonymous() : null;
    return {
        ok: current?.logged === true && isAnonymous === true && !!projectId && !!canvas,
        current,
        isAnonymous,
        projectId,
        hasCanvas: !!canvas,
        sequenceHidden
    };
}, 60000, 300);

const enterGuestWorkspace = async (page) => {
    await waitForRuntimeReady(page);
    const choice = page.locator('#eve_login_sequence__choice_without_account').first();
    await choice.waitFor({ state: 'visible', timeout: 30000 });
    await choice.click({ timeout: 10000 });
    const ready = await waitForGuestProject(page);
    if (!ready.ok) throw new Error('dashboard_probe_guest_project_missing');
    const loginInactive = await waitForLoginSequenceInactive(page);
    if (!loginInactive.ok) throw new Error(`dashboard_probe_login_sequence_still_interactive:${JSON.stringify(loginInactive.last)}`);
    return ready.last;
};

const resolveAtomHandle = async (page) => {
    await waitForRuntimeReady(page);
    const handle = page.locator('button[data-role="eve_intuitionx-handle"]').first();
    const visible = await handle.isVisible().catch(() => false);
    if (!visible) await page.evaluate(() => window.new_menu_v2?.reveal?.());
    await handle.waitFor({ state: 'visible', timeout: 15000 });
    const hit = await handle.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
            ok: rect.width > 0 && rect.height > 0,
            topMatches: button === top || button.contains(top),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            topTag: top?.tagName || null,
            topId: top?.id || null,
            topRole: top?.getAttribute?.('data-role') || null,
            topToolId: top?.getAttribute?.('data-tool-id') || null
        };
    });
    if (!hit.ok) throw new Error(`dashboard_probe_atom_handle_not_visible:${JSON.stringify(hit)}`);
    return handle;
};

const dashboardSnapshot = async (page) => page.evaluate(async () => {
    const runtime = window.eveDashboardRuntime || null;
    const state = runtime?.state || null;
    const projectId = window.__currentProject?.id || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const dashboardRecords = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const editorRecord = dashboardRecords.find((record) => record.id === '__eve_dashboard_editor') || null;
    const layout = state?.layout || null;
    const toolboxCandidates = [
        document.querySelector('#eve_intuitionx_main_ribbon'),
        document.querySelector('#eve_intuitionx_menu_layer #eve_intuitionx_main_ribbon'),
        document.querySelector('#menu_container_v2 > .eve-toolbox-v2-row'),
        document.querySelector('#menu_container_v2'),
        document.querySelector('#toolbox'),
        document.querySelector('#toolbox_support')
    ].filter(Boolean);
    const toolboxHeight = toolboxCandidates.reduce((height, element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(height, Number(rect.height || 0));
    }, 0);
    const dashboardDomCount = document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length;
    const canvas = document.getElementById('eve_surface_project');
    const recordOverReservedBand = dashboardRecords.filter((record) => {
        if (record.id === '__eve_dashboard_bottom_shadow') return false;
        if (record.id === '__eve_dashboard_project_veil') return false;
        if (record.id === '__eve_dashboard_reserved_band_fill') return false;
        const props = record.properties || {};
        const top = Number(props.top ?? props.y ?? 0);
        const height = Number(props.height ?? 0);
        return layout?.toolbox_reserved_rect && top + height > layout.toolbox_reserved_rect.y + 0.5;
    }).map((record) => record.id);
    return {
        ok: !!runtime && !!state,
        active: state?.active === true,
        activeCategoryId: state?.activeCategoryId || null,
        editorOpen: !!state?.editor,
        editorItemId: state?.editor?.item?.id || null,
        projectId,
        canvas: canvas ? {
            width: canvas.getBoundingClientRect().width,
            height: canvas.getBoundingClientRect().height,
            role: canvas.dataset?.role || null
        } : null,
        toolboxHeight,
        layout: layout ? {
            handedness: layout.handedness,
            dashboard_rect: layout.dashboard_rect,
            table_rect: layout.table_rect,
            toolbox_reserved_rect: layout.toolbox_reserved_rect,
            creation_fullscreen_rect: layout.creation_fullscreen_rect,
            lanes: layout.lanes.map((lane) => ({
                categoryId: lane.category.id,
                lane_rect: lane.lane_rect,
                header_rect: lane.header_rect,
                plus_rect: lane.plus_rect,
                active: lane.active,
                visibleItemCount: lane.visible_item_rects.length,
                items: lane.visible_item_rects.map((entry) => ({
                    id: entry.item?.id || null,
                    rect: entry.rect
                }))
            }))
        } : null,
        dashboardRecordIds: dashboardRecords.map((record) => record.id),
        editorRect: editorRecord ? {
            x: Number(editorRecord.properties?.left ?? editorRecord.properties?.x ?? 0),
            y: Number(editorRecord.properties?.top ?? editorRecord.properties?.y ?? 0),
            width: Number(editorRecord.properties?.width ?? 0),
            height: Number(editorRecord.properties?.height ?? 0)
        } : null,
        dashboardDomCount,
        recordOverReservedBand
    };
});

const waitForDashboardSnapshot = async (page, predicate, timeoutMs = 30000, intervalMs = 250) => {
    const startedAt = Date.now();
    let snapshot = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            snapshot = await dashboardSnapshot(page);
            if (predicate(snapshot)) return { ok: true, snapshot };
        } catch (error) {
            snapshot = { ok: false, error: error?.message || String(error) };
        }
        await sleep(intervalMs);
    }
    return { ok: false, snapshot };
};

const clickCanvasRectCenter = async (page, rect) => {
    const canvas = page.locator('#eve_surface_project').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    await canvas.click({
        position: {
            x: Math.max(1, rect.x + rect.width / 2),
            y: Math.max(1, rect.y + rect.height / 2)
        },
        timeout: 10000
    });
};

const laneIsActive = (snapshot, categoryId) => (
    snapshot.layout?.lanes?.some((lane) => lane.categoryId === categoryId && lane.active === true) === true
);

const hexToRgb = (hex) => {
    const value = String(hex || '').replace('#', '');
    return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16)
    ];
};

const pixelAt = (png, x, y) => {
    const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const index = (py * png.width + px) * 4;
    return [png.data[index], png.data[index + 1], png.data[index + 2], png.data[index + 3]];
};

const colorDistance = (left, right) => Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
);

const countPixelsInRect = (png, rect, predicate, step = 4) => {
    let count = 0;
    const left = Math.max(0, Math.floor(Number(rect?.x || 0)));
    const top = Math.max(0, Math.floor(Number(rect?.y || 0)));
    const right = Math.min(png.width - 1, Math.ceil(left + Number(rect?.width || 0)));
    const bottom = Math.min(png.height - 1, Math.ceil(top + Number(rect?.height || 0)));
    for (let y = top; y <= bottom; y += step) {
        for (let x = left; x <= right; x += step) {
            if (predicate(pixelAt(png, x, y))) count += 1;
        }
    }
    return count;
};

const brightPixel = (pixel) => pixel[0] > 205 && pixel[1] > 205 && pixel[2] > 205 && pixel[3] > 200;

const assertBrightPixels = (png, rect, label, minimum = 4) => {
    const count = countPixelsInRect(png, rect, brightPixel, 3);
    if (count < minimum) throw new Error(`${label}_bright_pixels_missing:${JSON.stringify({ count, minimum, rect })}`);
};

const assertLaneHasCardContrast = (png, lane, expectedHex, label) => {
    const sampleRect = {
        x: lane.header_rect.x > lane.lane_rect.x ? lane.lane_rect.x + 8 : lane.plus_rect.x + lane.plus_rect.width + 8,
        y: lane.lane_rect.y + Math.max(8, lane.lane_rect.height * 0.2),
        width: Math.max(20, Math.min(80, lane.lane_rect.width - 16)),
        height: Math.max(20, lane.lane_rect.height * 0.56)
    };
    const expected = hexToRgb(expectedHex);
    const contrasted = countPixelsInRect(png, sampleRect, (pixel) => colorDistance(pixel, expected) > 28 && pixel[3] > 200, 4);
    if (contrasted < 8) {
        throw new Error(`${label}_card_contrast_missing:${JSON.stringify({ contrasted, sampleRect, expectedHex })}`);
    }
};

const assertNearColor = (actual, expectedHex, label, tolerance = 12) => {
    const expected = hexToRgb(expectedHex);
    const distance = colorDistance(actual, expected);
    if (distance > tolerance) {
        throw new Error(`${label}_color_mismatch:${JSON.stringify({ actual, expected, distance, tolerance })}`);
    }
};

const analyzeDashboardVisual = (screenshotPath, snapshot, expectedHex, label) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const lane = snapshot.layout?.lanes?.find((entry) => entry.active) || snapshot.layout?.lanes?.[0];
    if (!lane) throw new Error(`${label}_visual_lane_missing`);
    const laneFillX = Math.min(
        lane.lane_rect.x + lane.lane_rect.width - 12,
        lane.lane_rect.x + lane.lane_rect.height + 12
    );
    assertNearColor(pixelAt(png, lane.header_rect.x + 7, lane.header_rect.y + 7), expectedHex, `${label}_active_header`);
    assertNearColor(pixelAt(png, lane.plus_rect.x + lane.plus_rect.width / 2, lane.plus_rect.y + lane.plus_rect.height + 12), expectedHex, `${label}_plus_strip`);
    assertNearColor(pixelAt(png, laneFillX, lane.header_rect.y + 12), expectedHex, `${label}_lane_fill`);
    assertBrightPixels(png, lane.header_rect, `${label}_header_text_or_icon`);
    const headerFlatness = assertHeaderInteriorIsFlat(png, lane, label);
    assertBrightPixels(png, lane.plus_rect, `${label}_plus_symbol`, 2);
    if (lane.visibleItemCount > 0) assertLaneHasCardContrast(png, lane, expectedHex, `${label}_lane`);
    const reserved = snapshot.layout.toolbox_reserved_rect;
    const reservedPixel = pixelAt(png, reserved.x + reserved.width / 2, reserved.y + Math.min(12, reserved.height - 1));
    if (colorDistance(reservedPixel, hexToRgb(expectedHex)) < 18) {
        throw new Error(`${label}_dashboard_leaks_into_toolbox_band:${JSON.stringify({ reservedPixel, expectedHex })}`);
    }
    return { label, expectedHex, width: png.width, height: png.height, headerFlatness };
};

const averageColumn = (png, x, y, height) => {
    const sampleX = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const y0 = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const y1 = Math.max(y0 + 1, Math.min(png.height, Math.round(y + height)));
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let yy = y0; yy < y1; yy += 1) {
        const index = (yy * png.width + sampleX) * 4;
        red += png.data[index];
        green += png.data[index + 1];
        blue += png.data[index + 2];
        count += 1;
    }
    return [red / count, green / count, blue / count];
};

const assertHeaderInteriorIsFlat = (png, lane, label) => {
    const header = lane.header_rect;
    const y = header.y + Math.max(5, Math.min(10, header.height * 0.08));
    const height = Math.max(6, Math.min(12, header.height * 0.1));
    const edgeX = header.x + Math.max(3, header.width * 0.04);
    const cleanX = header.x + Math.max(12, header.width * 0.12);
    const edge = averageColumn(png, edgeX, y, height);
    const clean = averageColumn(png, cleanX, y, height);
    const distance = colorDistance(edge, clean);
    if (distance > 8) {
        throw new Error(`${label}_header_internal_shadow_leak:${JSON.stringify({
            categoryId: lane.categoryId,
            distance,
            edge,
            clean,
            sample: { y, height, edgeX, cleanX },
            header
        })}`);
    }
    return { categoryId: lane.categoryId, edgeDistance: distance };
};

const CATEGORY_COLORS = {
    news: '#9f2f2f',
    calendar: '#245f94',
    projects: '#357245',
    contacts: '#673071',
    store: '#a65f1f',
    monitor: '#2f6f78',
    goals: '#6f5b24'
};

const analyzeDashboardOverviewVisual = (screenshotPath, snapshot) => {
    const png = PNG.sync.read(fs.readFileSync(screenshotPath));
    const headerFlatness = [];
    for (const lane of snapshot.layout?.lanes || []) {
        const expectedHex = CATEGORY_COLORS[lane.categoryId];
        if (!expectedHex) continue;
        assertNearColor(pixelAt(png, lane.header_rect.x - 24, lane.header_rect.y + 12), expectedHex, `dashboard_open_lane_${lane.categoryId}`, 18);
        assertNearColor(pixelAt(png, lane.header_rect.x + 7, lane.header_rect.y + 7), expectedHex, `dashboard_open_header_${lane.categoryId}`);
        assertBrightPixels(png, lane.header_rect, `dashboard_open_header_text_or_icon_${lane.categoryId}`);
        if (lane.visibleItemCount > 0) assertLaneHasCardContrast(png, lane, expectedHex, `dashboard_open_lane_${lane.categoryId}`);
        headerFlatness.push(assertHeaderInteriorIsFlat(png, lane, `dashboard_open_${lane.categoryId}`));
    }
    const reserved = snapshot.layout.toolbox_reserved_rect;
    const reservedPixel = pixelAt(png, reserved.x + reserved.width / 2, reserved.y + Math.min(12, reserved.height - 1));
    for (const expectedHex of Object.values(CATEGORY_COLORS)) {
        if (colorDistance(reservedPixel, hexToRgb(expectedHex)) < 18) {
            throw new Error(`dashboard_open_dashboard_leaks_into_toolbox_band:${JSON.stringify({ reservedPixel, expectedHex })}`);
        }
    }
    return { label: 'dashboard_open_overview', width: png.width, height: png.height, headerFlatness };
};

const runScenario = async () => {
    const report = {
        ok: false,
        appUrl: APP_URL,
        checks: [],
        console: [],
        pageErrors: [],
        requestFailures: []
    };
    const browser = await chromium.launch({
        headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '0' ? false : process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu']
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await context.newPage();
    page.on('console', (message) => {
        if (message.type() === 'error') report.console.push(message.text());
    });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        const url = request.url();
        if (/\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(url)) return;
        report.requestFailures.push({ url, failure: request.failure()?.errorText || null });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        report.checks.push({ name: 'guest_project_ready', ok: true, snapshot: await enterGuestWorkspace(page) });

        let atomHandle = await resolveAtomHandle(page);
        const alreadyOpen = await dashboardSnapshot(page);
        if (!alreadyOpen.active) await atomHandle.click({ timeout: 10000 });
        const opened = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.dashboardRecordIds.includes('__eve_dashboard_background')
            && snapshot.dashboardRecordIds.includes('__eve_dashboard_table')
            && snapshot.dashboardDomCount === 0
            && snapshot.toolboxHeight > 0
            && snapshot.layout?.toolbox_reserved_rect?.height >= snapshot.toolboxHeight
            && snapshot.recordOverReservedBand.length === 0
        ), 30000);
        if (!opened.ok) throw new Error('dashboard_open_failed');
        report.checks.push({ name: 'atom_opens_dashboard_without_dom_renderer', ok: true, snapshot: opened.snapshot });
        await page.screenshot({ path: DASHBOARD_OPEN_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'visual_open_matches_mockup_category_bands_and_toolbox_exclusion',
            ok: true,
            visual: analyzeDashboardOverviewVisual(DASHBOARD_OPEN_SCREENSHOT, opened.snapshot)
        });

        const monitorLane = opened.snapshot.layout.lanes.find((lane) => lane.categoryId === 'monitor');
        if (!monitorLane) throw new Error('dashboard_monitor_lane_missing');
        await clickCanvasRectCenter(page, monitorLane.header_rect);
        const monitorActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'monitor' && laneIsActive(snapshot, 'monitor') && !snapshot.editorOpen
        ), 30000);
        if (!monitorActive.ok) throw new Error('dashboard_monitor_header_click_failed');
        report.checks.push({ name: 'canvas_header_click_activates_monitor', ok: true, snapshot: monitorActive.snapshot });
        await page.screenshot({ path: DASHBOARD_MONITOR_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'visual_monitor_focus_matches_mockup_color',
            ok: true,
            visual: analyzeDashboardVisual(DASHBOARD_MONITOR_SCREENSHOT, monitorActive.snapshot, '#2f6f78', 'dashboard_monitor')
        });

        const plusLane = monitorActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'monitor');
        await clickCanvasRectCenter(page, plusLane.plus_rect);
        const monitorNoop = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.activeCategoryId === 'monitor'
            && laneIsActive(snapshot, 'monitor')
            && !snapshot.editorOpen
            && !snapshot.dashboardRecordIds.includes('__eve_dashboard_editor')
        ), 30000);
        if (!monitorNoop.ok) throw new Error('dashboard_monitor_plus_must_be_noop');
        report.checks.push({ name: 'monitor_plus_is_noop', ok: true, snapshot: monitorNoop.snapshot });

        const calendarLane = monitorNoop.snapshot.layout.lanes.find((lane) => lane.categoryId === 'calendar');
        await clickCanvasRectCenter(page, calendarLane.header_rect);
        const calendarActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'calendar' && laneIsActive(snapshot, 'calendar') && !snapshot.editorOpen
        ), 30000);
        if (!calendarActive.ok) throw new Error('dashboard_calendar_header_click_failed');
        await clickCanvasRectCenter(page, calendarActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'calendar').plus_rect);
        const calendarPanel = await waitFor(page, () => {
            const dialog = document.getElementById('eve_calendar_dialog');
            if (!dialog) return { ok: false, missing: true };
            const style = getComputedStyle(dialog);
            const rect = dialog.getBoundingClientRect();
            return { ok: style.display !== 'none' && rect.width > 0 && rect.height > 0 };
        }, 30000);
        if (!calendarPanel.ok) throw new Error('dashboard_calendar_plus_panel_failed');
        report.checks.push({ name: 'calendar_plus_opens_existing_eve_panel', ok: true, panel: calendarPanel.last });
        await page.evaluate(() => window.close_calendar_panel?.());

        const contactsLane = calendarActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'contacts');
        await clickCanvasRectCenter(page, contactsLane.header_rect);
        const contactsActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'contacts' && laneIsActive(snapshot, 'contacts') && !snapshot.editorOpen
        ), 30000);
        if (!contactsActive.ok) throw new Error('dashboard_contacts_header_click_failed');
        await clickCanvasRectCenter(page, contactsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'contacts').plus_rect);
        const contactsPanel = await waitFor(page, () => {
            const dialog = document.getElementById('eve_contact_dialog');
            if (!dialog) return { ok: false, missing: true };
            const style = getComputedStyle(dialog);
            const rect = dialog.getBoundingClientRect();
            return { ok: style.display !== 'none' && rect.width > 0 && rect.height > 0 };
        }, 30000);
        if (!contactsPanel.ok) throw new Error('dashboard_contacts_plus_panel_failed');
        report.checks.push({ name: 'contacts_plus_opens_existing_eve_panel', ok: true, panel: contactsPanel.last });
        await page.evaluate(() => window.close_contact_panel?.());

        const projectsLane = contactsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects');
        await clickCanvasRectCenter(page, projectsLane.header_rect);
        const projectsActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects' && laneIsActive(snapshot, 'projects') && !snapshot.editorOpen
        ), 30000);
        if (!projectsActive.ok) throw new Error('dashboard_projects_header_click_failed');
        const firstProjectItem = projectsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects')?.items?.[0];
        if (firstProjectItem?.rect) {
            const currentProjectBeforeItem = projectsActive.snapshot.projectId;
            await clickCanvasRectCenter(page, firstProjectItem.rect);
            const projectItemOpened = await waitForDashboardSnapshot(page, (snapshot) => (
                !snapshot.active && snapshot.dashboardRecordIds.length === 0 && snapshot.projectId === currentProjectBeforeItem
            ), 30000);
            if (!projectItemOpened.ok) throw new Error('dashboard_project_item_open_failed');
            report.checks.push({ name: 'project_item_opens_project_without_fullscreen_item', ok: true, snapshot: projectItemOpened.snapshot });
            await (await resolveAtomHandle(page)).click({ timeout: 10000 });
            const reopenedProjects = await waitForDashboardSnapshot(page, (snapshot) => snapshot.active, 30000);
            if (!reopenedProjects.ok) throw new Error('dashboard_reopen_after_project_item_failed');
            await clickCanvasRectCenter(page, reopenedProjects.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects').header_rect);
        }

        const beforeProjectCreate = (await dashboardSnapshot(page)).projectId;
        const activeProjectsForPlus = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects' && laneIsActive(snapshot, 'projects')
        ), 30000);
        if (!activeProjectsForPlus.ok) throw new Error('dashboard_projects_active_before_plus_failed');
        await clickCanvasRectCenter(page, activeProjectsForPlus.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects').plus_rect);
        const projectCreated = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active
            && snapshot.dashboardRecordIds.length === 0
            && !!snapshot.projectId
            && snapshot.projectId !== beforeProjectCreate
        ), 60000);
        if (!projectCreated.ok) throw new Error('dashboard_project_plus_create_open_failed');
        report.checks.push({ name: 'projects_plus_creates_and_opens_new_project', ok: true, snapshot: projectCreated.snapshot });

        atomHandle = await resolveAtomHandle(page);
        await atomHandle.click({ timeout: 10000 });
        const reopenedAfterProjectCreate = await waitForDashboardSnapshot(page, (snapshot) => snapshot.active, 30000);
        if (!reopenedAfterProjectCreate.ok) throw new Error('dashboard_reopen_after_project_create_failed');

        await page.evaluate(() => window.localStorage?.setItem?.('eve_handedness', 'left'));
        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const closed = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active && snapshot.dashboardRecordIds.length === 0
        ), 30000);
        if (!closed.ok) throw new Error('dashboard_close_failed');
        report.checks.push({ name: 'atom_click_closes_dashboard_and_removes_records', ok: true, snapshot: closed.snapshot });
        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const leftOpened = await waitForDashboardSnapshot(page, (snapshot) => {
            const lane = snapshot.layout?.lanes?.[0];
            return snapshot.active
                && snapshot.layout?.handedness === 'left'
                && lane
                && lane.header_rect.x < lane.plus_rect.x
                && lane.plus_rect.x < snapshot.layout.table_rect.x + snapshot.layout.table_rect.width;
        }, 30000);
        if (!leftOpened.ok) throw new Error('dashboard_left_handed_open_failed');
        report.checks.push({ name: 'left_handed_dashboard_mirrors_headers_and_plus_strip', ok: true, snapshot: leftOpened.snapshot });

        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const leftClosed = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active && snapshot.dashboardRecordIds.length === 0
        ), 30000);
        if (!leftClosed.ok) throw new Error('dashboard_left_handed_close_failed');
        await page.evaluate(() => window.localStorage?.removeItem?.('eve_handedness'));

        if (report.console.length || report.pageErrors.length || report.requestFailures.length) {
            throw new Error('dashboard_probe_browser_errors_detected');
        }
        report.screenshots = {
            open: DASHBOARD_OPEN_SCREENSHOT,
            monitor: DASHBOARD_MONITOR_SCREENSHOT
        };
        report.ok = true;
    } catch (error) {
        report.error = error?.message || String(error);
        try {
            report.failureSnapshot = await dashboardSnapshot(page);
        } catch (snapshotError) {
            report.failureSnapshotError = snapshotError?.message || String(snapshotError);
            report.failureSnapshot = null;
        }
    } finally {
        await browser.close();
        writeReport(report);
    }
    if (!report.ok) throw new Error(report.error || 'dashboard_bevy_runtime_probe_failed');
};

await runScenario();
