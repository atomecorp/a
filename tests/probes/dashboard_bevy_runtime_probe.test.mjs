import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    clickCanvasRectCenter,
    enterGuestWorkspace,
    resolveAtomHandle,
    sleep,
    waitFor,
    waitForPresentationFrames
} from './dashboard_bevy_runtime/runtime_support.mjs';
import { dashboardSnapshot } from './dashboard_bevy_runtime/snapshot_support.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/dashboard_bevy_runtime');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const DASHBOARD_OPEN_SCREENSHOT = path.join(OUT_DIR, 'dashboard_open.png');
const DASHBOARD_MONITOR_SCREENSHOT = path.join(OUT_DIR, 'dashboard_monitor.png');
const DASHBOARD_PROJECTS_SCREENSHOT = path.join(OUT_DIR, 'dashboard_projects.png');
const CATEGORY_COLORS = Object.freeze({
    news: '#9f2f2f',
    calendar: '#245f94',
    projects: '#357245',
    contacts: '#673071',
    store: '#a65f1f',
    monitor: '#2f6f78',
    goals: '#6f5b24'
});

fs.mkdirSync(OUT_DIR, { recursive: true });

const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

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

const laneIsActive = (snapshot, categoryId) => (
    snapshot.layout?.lanes?.some((lane) => lane.categoryId === categoryId && lane.active === true) === true
);

const dashboardFocusSettled = (snapshot) => (
    !snapshot.focusTransitionActive
    && !(snapshot.dashboardRecordIds || []).some((id) => String(id || '').includes('focus_spread'))
);

const clampColor = (value) => Math.max(0, Math.min(255, value));

const shadeHex = (hex, percent) => {
    const value = String(hex || '#000000').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex || '#000000';
    const amount = Math.round(2.55 * percent);
    const red = clampColor(Number.parseInt(value.slice(0, 2), 16) + amount);
    const green = clampColor(Number.parseInt(value.slice(2, 4), 16) + amount);
    const blue = clampColor(Number.parseInt(value.slice(4, 6), 16) + amount);
    return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
};

const fillRecordMap = (snapshot) => new Map((snapshot.dashboardFillRecords || []).map((record) => [record.id, record]));

const assertRecordColor = (records, id, expectedColor) => {
    const record = records.get(id);
    if (!record?.visible) throw new Error(`dashboard_fill_record_missing:${id}`);
    const actual = String(record.color || '').toLowerCase();
    const expected = String(expectedColor || '').toLowerCase();
    if (actual !== expected) throw new Error(`dashboard_fill_color_mismatch:${JSON.stringify({ id, actual, expected })}`);
    return { id, color: actual };
};

const assertOverviewRecordColors = (snapshot) => {
    const records = fillRecordMap(snapshot);
    const checked = [];
    checked.push(assertRecordColor(records, '__eve_dashboard_background', '#101010'));
    checked.push(assertRecordColor(records, '__eve_dashboard_table', '#101010'));
    for (const lane of snapshot.layout?.lanes || []) {
        const color = CATEGORY_COLORS[lane.categoryId];
        if (!color) continue;
        checked.push(assertRecordColor(records, `__eve_dashboard_lane_${lane.categoryId}`, shadeHex(color, -10)));
        checked.push(assertRecordColor(records, `__eve_dashboard_header_bg_${lane.categoryId}`, color));
    }
    return { checked };
};

const assertFocusedRecordColors = (snapshot, activeCategoryId) => {
    const activeColor = CATEGORY_COLORS[activeCategoryId];
    if (!activeColor) throw new Error(`dashboard_active_color_missing:${activeCategoryId}`);
    const records = fillRecordMap(snapshot);
    const checked = [];
    checked.push(assertRecordColor(records, '__eve_dashboard_background', activeColor));
    checked.push(assertRecordColor(records, '__eve_dashboard_table', activeColor));
    for (const lane of snapshot.layout?.lanes || []) {
        checked.push(assertRecordColor(records, `__eve_dashboard_lane_${lane.categoryId}`, activeColor));
        checked.push(assertRecordColor(records, `__eve_dashboard_header_bg_${lane.categoryId}`, activeColor));
    }
    return { activeCategoryId, activeColor, checked };
};

const dashboardHasNoPlusSurface = (snapshot) => (
    (snapshot.dashboardRecordIds || []).every((id) => !String(id || '').includes('plus'))
    && (snapshot.dashboardVisibleRecordIds || []).every((id) => !String(id || '').includes('plus'))
    && (snapshot.layout?.lanes || []).every((lane) => (
        lane.plus_rect === undefined
        && lane.plus_strip_rect === undefined
        && lane.active_plus_rect === undefined
    ))
);

const dashboardOpenReady = (snapshot) => (
    snapshot.active
    && snapshot.dashboardRecordIds.includes('__eve_dashboard_background')
    && snapshot.dashboardRecordIds.includes('__eve_dashboard_table')
    && dashboardHasNoPlusSurface(snapshot)
    && snapshot.dashboardDomCount === 0
    && snapshot.toolboxHeight > 0
    && snapshot.layout?.toolbox_reserved_rect?.height >= snapshot.toolboxHeight
    && snapshot.recordOverReservedBand.length === 0
);

const activateDashboardCategory = async (page, categoryId, snapshot = null) => {
    let current = snapshot || await dashboardSnapshot(page);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (current.activeCategoryId === categoryId && laneIsActive(current, categoryId) && dashboardFocusSettled(current)) return { ok: true, snapshot: current };
        const lane = current.layout?.lanes?.find((entry) => entry.categoryId === categoryId);
        if (!lane?.header_rect) return { ok: false, snapshot: current };
        await clickCanvasRectCenter(page, lane.header_rect);
        const active = await waitForDashboardSnapshot(page, (candidate) => (
            candidate.activeCategoryId === categoryId && laneIsActive(candidate, categoryId) && !candidate.editorOpen && dashboardFocusSettled(candidate)
        ), 8000);
        if (active.ok) return active;
        current = active.snapshot || await dashboardSnapshot(page);
    }
    return { ok: false, snapshot: current };
};

const runScenario = async () => {
    const report = {
        ok: false,
        appUrl: APP_URL,
        checks: [],
        console: [],
        pageErrors: [],
        requestFailures: [],
        responseFailures: []
    };
    const browser = await chromium.launch({
        headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '0' ? false : process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu']
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await context.newPage();
    page.on('console', (message) => {
        if (message.type() === 'error') {
            report.console.push({ text: message.text(), location: message.location?.() || null });
        }
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
    page.on('response', (response) => {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        if (/\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(url)) return;
        report.responseFailures.push({ url, status });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        report.checks.push({ name: 'guest_project_ready', ok: true, snapshot: await enterGuestWorkspace(page) });

        let atomHandle = await resolveAtomHandle(page);
        let opened = await waitForDashboardSnapshot(page, dashboardOpenReady, 12000);
        if (!opened.ok) {
            await atomHandle.click({ timeout: 10000 });
            opened = await waitForDashboardSnapshot(page, dashboardOpenReady, 30000);
        }
        if (!opened.ok) throw new Error('dashboard_open_failed');
        const openedReady = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.dashboardDomCount === 0
            && dashboardHasNoPlusSurface(snapshot)
            && snapshot.dashboardVisibleRecordIds.includes('__eve_dashboard_background')
        ), 60000);
        if (!openedReady.ok) throw new Error('dashboard_open_ready_records_missing');
        report.checks.push({ name: 'atom_opens_dashboard_without_dom_renderer', ok: true, snapshot: openedReady.snapshot });
        await waitForPresentationFrames(page, 12);
        await page.screenshot({ path: DASHBOARD_OPEN_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'records_open_match_category_bands_and_toolbox_exclusion',
            ok: true,
            records: assertOverviewRecordColors(openedReady.snapshot)
        });
        report.checks.push({
            name: 'dashboard_layout_exposes_no_plus_surface_or_records',
            ok: dashboardHasNoPlusSurface(openedReady.snapshot),
            snapshot: openedReady.snapshot
        });

        const monitorLane = openedReady.snapshot.layout.lanes.find((lane) => lane.categoryId === 'monitor');
        if (!monitorLane) throw new Error('dashboard_monitor_lane_missing');
        await clickCanvasRectCenter(page, monitorLane.header_rect);
        const monitorActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'monitor' && laneIsActive(snapshot, 'monitor') && !snapshot.editorOpen && dashboardFocusSettled(snapshot)
        ), 30000);
        if (!monitorActive.ok) throw new Error('dashboard_monitor_header_click_failed');
        report.checks.push({ name: 'canvas_header_click_activates_monitor', ok: true, snapshot: monitorActive.snapshot });
        await waitForPresentationFrames(page, 12);
        await page.screenshot({ path: DASHBOARD_MONITOR_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'records_monitor_focus_uses_uniform_active_color',
            ok: true,
            records: assertFocusedRecordColors(monitorActive.snapshot, 'monitor')
        });
        if (!dashboardHasNoPlusSurface(monitorActive.snapshot)) throw new Error('dashboard_monitor_plus_surface_present');

        const calendarLane = monitorActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'calendar');
        await clickCanvasRectCenter(page, calendarLane.header_rect);
        const calendarActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'calendar' && laneIsActive(snapshot, 'calendar') && !snapshot.editorOpen && dashboardFocusSettled(snapshot)
        ), 30000);
        if (!calendarActive.ok) throw new Error('dashboard_calendar_header_click_failed');
        if (!dashboardHasNoPlusSurface(calendarActive.snapshot)) throw new Error('dashboard_calendar_plus_surface_present');
        report.checks.push({ name: 'calendar_header_activates_without_plus_surface', ok: true, snapshot: calendarActive.snapshot });

        const contactsLane = calendarActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'contacts');
        await clickCanvasRectCenter(page, contactsLane.header_rect);
        const contactsActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'contacts' && laneIsActive(snapshot, 'contacts') && !snapshot.editorOpen && dashboardFocusSettled(snapshot)
        ), 30000);
        if (!contactsActive.ok) throw new Error('dashboard_contacts_header_click_failed');
        if (!dashboardHasNoPlusSurface(contactsActive.snapshot)) throw new Error('dashboard_contacts_plus_surface_present');
        report.checks.push({ name: 'contacts_header_activates_without_plus_surface', ok: true, snapshot: contactsActive.snapshot });

        const projectsLane = contactsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects');
        await clickCanvasRectCenter(page, projectsLane.header_rect);
        let projectsActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects' && laneIsActive(snapshot, 'projects') && !snapshot.editorOpen && dashboardFocusSettled(snapshot)
        ), 30000);
        if (!projectsActive.ok) throw new Error('dashboard_projects_header_click_failed');
        const projectsWithItem = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects'
            && laneIsActive(snapshot, 'projects')
            && !snapshot.editorOpen
            && dashboardFocusSettled(snapshot)
            && dashboardHasNoPlusSurface(snapshot)
        ), 10000);
        if (projectsWithItem.ok) projectsActive = projectsWithItem;
        if (!dashboardHasNoPlusSurface(projectsActive.snapshot)) throw new Error('dashboard_projects_plus_surface_present');
        await waitForPresentationFrames(page, 12);
        await page.screenshot({ path: DASHBOARD_PROJECTS_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'records_projects_focus_uses_uniform_active_color',
            ok: true,
            records: assertFocusedRecordColors(projectsActive.snapshot, 'projects')
        });
        report.checks.push({ name: 'projects_header_activates_without_plus_surface', ok: true, snapshot: projectsActive.snapshot });

        await page.evaluate(() => {
            window.localStorage?.setItem?.('eve_handedness', 'left');
            window.__eveProfilePreferences = {
                ...(window.__eveProfilePreferences || {}),
                visual: { ...(window.__eveProfilePreferences?.visual || {}), handedness: 'left' }
            };
            window.__eveIntuitionXState = { ...(window.__eveIntuitionXState || {}), handedness: 'left' };
            window.dispatchEvent(new CustomEvent('eve:profile-preferences-updated', {
                detail: { preferences: window.__eveProfilePreferences }
            }));
        });
        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const closed = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active && snapshot.dashboardVisibleRecordIds.length === 0
        ), 30000);
        if (!closed.ok) throw new Error('dashboard_close_failed');
        report.checks.push({ name: 'atom_click_closes_dashboard_and_removes_records', ok: true, snapshot: closed.snapshot });
        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const leftOpened = await waitForDashboardSnapshot(page, (snapshot) => {
            const lane = snapshot.layout?.lanes?.[0];
            return snapshot.active
                && snapshot.layout?.handedness === 'left'
                && lane
                && lane.header_rect.x < lane.lane_rect.x
                && lane.header_rect.x + lane.header_rect.width === lane.lane_rect.x
                && dashboardHasNoPlusSurface(snapshot);
        }, 30000);
        if (!leftOpened.ok) throw new Error('dashboard_left_handed_open_failed');
        report.checks.push({ name: 'left_handed_dashboard_mirrors_headers_without_plus_strip', ok: true, snapshot: leftOpened.snapshot });

        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const leftClosed = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active && snapshot.dashboardVisibleRecordIds.length === 0
        ), 30000);
        if (!leftClosed.ok) throw new Error('dashboard_left_handed_close_failed');
        await page.evaluate(() => {
            window.localStorage?.removeItem?.('eve_handedness');
            window.__eveProfilePreferences = {
                ...(window.__eveProfilePreferences || {}),
                visual: { ...(window.__eveProfilePreferences?.visual || {}), handedness: 'right' }
            };
            window.__eveIntuitionXState = { ...(window.__eveIntuitionXState || {}), handedness: 'right' };
            window.dispatchEvent(new CustomEvent('eve:profile-preferences-updated', {
                detail: { preferences: window.__eveProfilePreferences }
            }));
        });

        if (report.console.length || report.pageErrors.length || report.requestFailures.length || report.responseFailures.length) {
            throw new Error('dashboard_probe_browser_errors_detected');
        }
        report.screenshots = {
            open: DASHBOARD_OPEN_SCREENSHOT,
            monitor: DASHBOARD_MONITOR_SCREENSHOT,
            projects: DASHBOARD_PROJECTS_SCREENSHOT
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
