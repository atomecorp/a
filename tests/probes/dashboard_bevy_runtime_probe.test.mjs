import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { analyzeDashboardOverviewVisual, analyzeDashboardVisual } from './dashboard_bevy_runtime/visual_support.mjs';
import {
    analyzeDashboardProjectPreviewVisual,
    ensureProjectPreviewFixture,
    projectPreviewMediaRecord
} from './dashboard_bevy_runtime/project_preview_support.mjs';
import {
    clickCanvasRectCenter,
    enterGuestWorkspace,
    longPressCanvasRectCenter,
    resolveAtomHandle,
    sleep,
    waitFor,
    waitForPresentationFrames
} from './dashboard_bevy_runtime/runtime_support.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/dashboard_bevy_runtime');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const DASHBOARD_OPEN_SCREENSHOT = path.join(OUT_DIR, 'dashboard_open.png');
const DASHBOARD_MONITOR_SCREENSHOT = path.join(OUT_DIR, 'dashboard_monitor.png');
const DASHBOARD_PROJECTS_SCREENSHOT = path.join(OUT_DIR, 'dashboard_projects.png');

fs.mkdirSync(OUT_DIR, { recursive: true });

const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const dashboardSnapshot = async (page) => page.evaluate(async () => {
    const runtime = window.eveDashboardRuntime || null;
    const state = runtime?.state || null;
    const projectId = window.__currentProject?.id || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const dashboardRecords = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const visibleDashboardRecords = dashboardRecords.filter((record) => record?.properties?.visible !== false);
    const editorRecord = dashboardRecords.find((record) => record.id === '__eve_dashboard_editor') || null;
    const layout = state?.layout || null;
    const flower = document.getElementById('eve_intuitionx_flower');
    const flowerStyle = flower ? getComputedStyle(flower) : null;
    const flowerRect = flower?.getBoundingClientRect?.() || null;
    const flowerOpen = !!flower
        && flowerStyle?.display !== 'none'
        && flowerStyle?.visibility !== 'hidden'
        && Number(flowerRect?.width || 0) > 0
        && Number(flowerRect?.height || 0) > 0;
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
        labelEditorOpen: !!state?.labelEditor,
        labelEditorItemId: state?.labelEditor?.item_id || null,
        labelEditorSelection: state?.labelEditor?.selection || null,
        flowerOpen,
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
                    title: entry.item?.title || '',
                    metadata: entry.item?.metadata || {},
                    rect: entry.rect
                }))
            }))
        } : null,
        dashboardRecordIds: dashboardRecords.map((record) => record.id),
        dashboardVisibleRecordIds: visibleDashboardRecords.map((record) => record.id),
        dashboardTitleTexts: dashboardRecords
            .filter((record) => String(record?.id || '').includes('card_title_'))
            .map((record) => String(record?.properties?.text || '')),
        dashboardMediaRecords: dashboardRecords
            .filter((record) => String(record?.id || '').includes('card_media_'))
            .map((record) => ({
                id: String(record.id || ''),
                source: String(record.properties?.source || ''),
                media_fit: String(record.properties?.media_fit || record.properties?.object_fit || ''),
                visible: record.properties?.visible !== false && Number(record.properties?.opacity ?? 1) > 0
            })),
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

const laneIsActive = (snapshot, categoryId) => (
    snapshot.layout?.lanes?.some((lane) => lane.categoryId === categoryId && lane.active === true) === true
);

const dashboardOpenReady = (snapshot) => (
    snapshot.active
    && snapshot.dashboardRecordIds.includes('__eve_dashboard_background')
    && snapshot.dashboardRecordIds.includes('__eve_dashboard_table')
    && snapshot.dashboardDomCount === 0
    && snapshot.toolboxHeight > 0
    && snapshot.layout?.toolbox_reserved_rect?.height >= snapshot.toolboxHeight
    && snapshot.recordOverReservedBand.length === 0
);

const activateDashboardCategory = async (page, categoryId, snapshot = null) => {
    let current = snapshot || await dashboardSnapshot(page);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (current.activeCategoryId === categoryId && laneIsActive(current, categoryId)) return { ok: true, snapshot: current };
        const lane = current.layout?.lanes?.find((entry) => entry.categoryId === categoryId);
        if (!lane?.header_rect) return { ok: false, snapshot: current };
        await clickCanvasRectCenter(page, lane.header_rect);
        const active = await waitForDashboardSnapshot(page, (candidate) => (
            candidate.activeCategoryId === categoryId && laneIsActive(candidate, categoryId) && !candidate.editorOpen
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
        const previewFixture = await ensureProjectPreviewFixture(page);
        if (!previewFixture.ok) throw new Error(`dashboard_project_preview_fixture_failed:${JSON.stringify(previewFixture)}`);
        report.checks.push({ name: 'project_preview_fixture_committed_through_atome', ok: true, snapshot: previewFixture });

        let atomHandle = await resolveAtomHandle(page);
        let opened = await waitForDashboardSnapshot(page, dashboardOpenReady, 12000);
        if (!opened.ok) {
            await atomHandle.click({ timeout: 10000 });
            opened = await waitForDashboardSnapshot(page, dashboardOpenReady, 30000);
        }
        if (!opened.ok) throw new Error('dashboard_open_failed');
        const openedWithProjectPreview = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.dashboardDomCount === 0
            && !!snapshot.layout?.lanes?.find((lane) => lane.categoryId === 'projects')?.items?.[0]?.rect
            && !!projectPreviewMediaRecord(snapshot)
        ), 60000);
        if (!openedWithProjectPreview.ok) {
            throw new Error(`dashboard_project_preview_media_missing:${JSON.stringify(openedWithProjectPreview.snapshot?.dashboardMediaRecords || [])}`);
        }
        report.checks.push({ name: 'atom_opens_dashboard_without_dom_renderer', ok: true, snapshot: openedWithProjectPreview.snapshot });
        await waitForPresentationFrames(page, 12);
        await page.screenshot({ path: DASHBOARD_OPEN_SCREENSHOT, fullPage: true });
        await page.screenshot({ path: DASHBOARD_PROJECTS_SCREENSHOT, fullPage: true });
        report.checks.push({
            name: 'visual_open_matches_mockup_category_bands_and_toolbox_exclusion',
            ok: true,
            visual: analyzeDashboardOverviewVisual(DASHBOARD_OPEN_SCREENSHOT, openedWithProjectPreview.snapshot)
        });
        report.checks.push({
            name: 'visual_project_card_uses_renderer_capture_pixels',
            ok: true,
            visual: analyzeDashboardProjectPreviewVisual(DASHBOARD_PROJECTS_SCREENSHOT, openedWithProjectPreview.snapshot)
        });

        const monitorLane = openedWithProjectPreview.snapshot.layout.lanes.find((lane) => lane.categoryId === 'monitor');
        if (!monitorLane) throw new Error('dashboard_monitor_lane_missing');
        await clickCanvasRectCenter(page, monitorLane.header_rect);
        const monitorActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'monitor' && laneIsActive(snapshot, 'monitor') && !snapshot.editorOpen
        ), 30000);
        if (!monitorActive.ok) throw new Error('dashboard_monitor_header_click_failed');
        report.checks.push({ name: 'canvas_header_click_activates_monitor', ok: true, snapshot: monitorActive.snapshot });
        await waitForPresentationFrames(page, 12);
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
        let projectsActive = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects' && laneIsActive(snapshot, 'projects') && !snapshot.editorOpen
        ), 30000);
        if (!projectsActive.ok) throw new Error('dashboard_projects_header_click_failed');
        const projectsWithItem = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects'
            && laneIsActive(snapshot, 'projects')
            && !snapshot.editorOpen
            && !!snapshot.layout?.lanes?.find((lane) => lane.categoryId === 'projects')?.items?.[0]?.rect
        ), 10000);
        if (projectsWithItem.ok) projectsActive = projectsWithItem;
        let firstProjectItem = projectsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects')?.items?.[0];
        if (!firstProjectItem?.rect) {
            const beforeSeedProject = projectsActive.snapshot.projectId;
            await clickCanvasRectCenter(page, projectsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects').plus_rect);
            const seededProject = await waitForDashboardSnapshot(page, (snapshot) => (
                !snapshot.active
                && snapshot.dashboardVisibleRecordIds.length === 0
                && !!snapshot.projectId
                && snapshot.projectId !== beforeSeedProject
            ), 60000);
            if (!seededProject.ok) throw new Error('dashboard_project_item_seed_create_failed');
            report.checks.push({ name: 'project_item_seed_created_for_label_probe', ok: true, snapshot: seededProject.snapshot });
            await (await resolveAtomHandle(page)).click({ timeout: 10000 });
            const reopenedForSeededItem = await waitForDashboardSnapshot(page, (snapshot) => snapshot.active, 30000);
            if (!reopenedForSeededItem.ok) throw new Error('dashboard_reopen_after_project_item_seed_failed');
            await clickCanvasRectCenter(page, reopenedForSeededItem.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects').header_rect);
            projectsActive = await waitForDashboardSnapshot(page, (snapshot) => (
                snapshot.activeCategoryId === 'projects'
                && laneIsActive(snapshot, 'projects')
                && !snapshot.editorOpen
                && !!snapshot.layout?.lanes?.find((lane) => lane.categoryId === 'projects')?.items?.[0]?.rect
            ), 30000);
            if (!projectsActive.ok) throw new Error('dashboard_projects_header_item_after_seed_failed');
            firstProjectItem = projectsActive.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects')?.items?.[0];
        }
        if (!firstProjectItem?.rect) throw new Error('dashboard_project_item_required_for_label_probe');
        const currentProjectBeforeLongPress = projectsActive.snapshot.projectId;
        await longPressCanvasRectCenter(page, firstProjectItem.rect);
        const labelEditing = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.projectId === currentProjectBeforeLongPress
            && snapshot.labelEditorOpen
            && snapshot.labelEditorItemId === firstProjectItem.id
            && snapshot.labelEditorSelection?.start === 0
            && snapshot.labelEditorSelection?.end > 0
            && snapshot.flowerOpen === false
        ), 30000);
        if (!labelEditing.ok) throw new Error('dashboard_project_long_press_label_edit_failed');
        await page.keyboard.type('Dashboard probe renamed project');
        const typedLabel = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && snapshot.labelEditorOpen
            && snapshot.projectId === currentProjectBeforeLongPress
            && snapshot.dashboardTitleTexts.includes('Dashboard probe renamed project')
            && snapshot.flowerOpen === false
        ), 30000);
        if (!typedLabel.ok) throw new Error('dashboard_project_label_typing_failed');
        await page.keyboard.press('Enter');
        const labelCommitted = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.active
            && !snapshot.labelEditorOpen
            && snapshot.projectId === currentProjectBeforeLongPress
            && snapshot.dashboardTitleTexts.includes('Dashboard probe renamed project')
            && snapshot.flowerOpen === false
        ), 30000);
        if (!labelCommitted.ok) throw new Error('dashboard_project_label_commit_failed');
        report.checks.push({ name: 'project_item_long_press_edits_label_without_opening_or_flower', ok: true, snapshot: labelCommitted.snapshot });

        await clickCanvasRectCenter(page, firstProjectItem.rect);
        const projectItemOpened = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active && snapshot.dashboardVisibleRecordIds.length === 0 && snapshot.projectId === firstProjectItem.id
        ), 30000);
        if (!projectItemOpened.ok) throw new Error('dashboard_project_item_open_failed');
        report.checks.push({ name: 'project_item_opens_project_without_fullscreen_item', ok: true, snapshot: projectItemOpened.snapshot });
        await (await resolveAtomHandle(page)).click({ timeout: 10000 });
        const reopenedProjects = await waitForDashboardSnapshot(page, (snapshot) => snapshot.active, 30000);
        if (!reopenedProjects.ok) throw new Error('dashboard_reopen_after_project_item_failed');
        const reopenedProjectsActive = await activateDashboardCategory(page, 'projects', reopenedProjects.snapshot);
        if (!reopenedProjectsActive.ok) throw new Error('dashboard_projects_active_after_project_item_failed');

        const beforeProjectCreate = (await dashboardSnapshot(page)).projectId;
        const activeProjectsForPlus = await waitForDashboardSnapshot(page, (snapshot) => (
            snapshot.activeCategoryId === 'projects' && laneIsActive(snapshot, 'projects')
        ), 30000);
        if (!activeProjectsForPlus.ok) throw new Error('dashboard_projects_active_before_plus_failed');
        await clickCanvasRectCenter(page, activeProjectsForPlus.snapshot.layout.lanes.find((lane) => lane.categoryId === 'projects').plus_rect);
        const projectCreated = await waitForDashboardSnapshot(page, (snapshot) => (
            !snapshot.active
            && snapshot.dashboardVisibleRecordIds.length === 0
            && !!snapshot.projectId
            && snapshot.projectId !== beforeProjectCreate
        ), 60000);
        if (!projectCreated.ok) throw new Error('dashboard_project_plus_create_open_failed');
        report.checks.push({ name: 'projects_plus_creates_and_opens_new_project', ok: true, snapshot: projectCreated.snapshot });

        atomHandle = await resolveAtomHandle(page);
        await atomHandle.click({ timeout: 10000 });
        const reopenedAfterProjectCreate = await waitForDashboardSnapshot(page, (snapshot) => snapshot.active, 30000);
        if (!reopenedAfterProjectCreate.ok) throw new Error('dashboard_reopen_after_project_create_failed');

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
        report.checks.push({ name: 'atom_click_closes_dashboard_and_parks_records', ok: true, snapshot: closed.snapshot });
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
