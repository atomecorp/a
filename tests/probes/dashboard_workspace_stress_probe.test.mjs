import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    APP_URL,
    OUT_DIR,
    REPORT_FILE,
    analyzeImage,
    clickCanvasRect,
    clickMainHandle,
    dashboardResidue,
    dashboardSnapshot,
    enterGuestWorkspace,
    nowId,
    sceneSnapshot,
    screenshot,
    waitFor,
    waitFrames,
    writeReport
} from './dashboard_workspace_stress/support.mjs';
import {
    assertProjectLoaded,
    createBasicAtomes,
    ensureProject,
    exerciseDynamicData,
    importProjectMedia
} from './dashboard_workspace_stress/product_actions.mjs';

const PROJECT_COUNT = 10;
const HEADER_CLICK_COUNT = 30;
const MEDIA_FIXTURES = [
    path.resolve('tests/fixtures/media/0000.png'),
    path.resolve('tests/fixtures/media/test.m4a'),
    path.resolve('tests/fixtures/media/recorded.webm')
];

const createReport = () => ({
    ok: false,
    appUrl: APP_URL,
    checks: [],
    console: [],
    pageErrors: [],
    requestFailures: [],
    ignoredRequestFailures: [],
    projects: [],
    progress: []
});

const resetReportArtifacts = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const entry of fs.readdirSync(OUT_DIR)) {
        if (!/^(report\.json|.*\.png)$/i.test(entry)) continue;
        fs.unlinkSync(path.join(OUT_DIR, entry));
    }
};

const markProgress = (report, phase, extra = {}) => {
    report.progress.push({ phase, at: new Date().toISOString(), ...extra });
    writeReport(report);
};

const assertDashboardFocusedColors = async (page, categoryId) => page.evaluate(async (id) => {
    const { DASHBOARD_VISUAL_TOKENS } = await import('/eVe/domains/dashboard/dashboard_tokens.js');
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const state = window.eveDashboardRuntime?.state || {};
    const category = (state.categories || []).find((entry) => String(entry.id) === String(id));
    const activeColor = category?.color || '';
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const shadeHex = (hex, percent) => {
        const value = String(hex || '#000000').replace('#', '');
        const amount = Math.round(2.55 * percent);
        const red = clamp(Number.parseInt(value.slice(0, 2), 16) + amount, 0, 255);
        const green = clamp(Number.parseInt(value.slice(2, 4), 16) + amount, 0, 255);
        const blue = clamp(Number.parseInt(value.slice(4, 6), 16) + amount, 0, 255);
        return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
    };
    const byId = new Map(records.map((record) => [String(record.id || ''), record]));
    const readColor = (suffix) => byId.get(`__eve_dashboard_${suffix}`)?.properties?.color || '';
    const failures = [];
    const expect = (name, actual, expected) => {
        if (String(actual).toLowerCase() !== String(expected).toLowerCase()) failures.push({ name, actual, expected });
    };
    expect('background', readColor('background'), activeColor);
    expect('table', readColor('table'), activeColor);
    expect('plus_strip_active', readColor('plus_strip_active'), activeColor);
    for (const lane of state.layout?.lanes || []) {
        const laneId = String(lane.category?.id || '');
        expect(`lane_${laneId}`, readColor(`lane_${laneId}`), activeColor);
        expect(
            `header_bg_${laneId}`,
            readColor(`header_bg_${laneId}`),
            laneId === id ? activeColor : shadeHex(activeColor, -18)
        );
    }
    const cardShade = shadeHex(activeColor, -26);
    const isVisible = (record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0;
    const cards = records.filter((record) => (
        record.type === 'shape'
        && String(record.id || '').startsWith('__eve_dashboard_card_')
        && isVisible(record)
    ));
    for (const card of cards) expect(card.id, card.properties?.color, cardShade);
    return {
        ok: !!activeColor && failures.length === 0,
        activeColor,
        cardShade,
        cardCount: cards.length,
        failures,
        tokenBackground: DASHBOARD_VISUAL_TOKENS.background
    };
}, categoryId);

const assertDashboardOverviewColors = async (page) => page.evaluate(async () => {
    const { DASHBOARD_VISUAL_TOKENS } = await import('/eVe/domains/dashboard/dashboard_tokens.js');
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    const scene = projectId ? window.eveToolBase?.getProjectSceneState?.(projectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const state = window.eveDashboardRuntime?.state || {};
    const byId = new Map(records.map((record) => [String(record.id || ''), record]));
    const readColor = (suffix) => byId.get(`__eve_dashboard_${suffix}`)?.properties?.color || '';
    const failures = [];
    const expect = (name, actual, expected) => {
        if (String(actual).toLowerCase() !== String(expected).toLowerCase()) failures.push({ name, actual, expected });
    };
    expect('background', readColor('background'), DASHBOARD_VISUAL_TOKENS.background);
    expect('table', readColor('table'), DASHBOARD_VISUAL_TOKENS.table);
    for (const lane of state.layout?.lanes || []) {
        const laneId = String(lane.category?.id || '');
        const laneColor = lane.category?.color || '';
        expect(`lane_${laneId}`, readColor(`lane_${laneId}`), laneColor);
        expect(`header_bg_${laneId}`, readColor(`header_bg_${laneId}`), laneColor);
    }
    return { ok: failures.length === 0 && !state.activeCategoryId, failures };
});

const attachPageDiagnostics = (page, report) => {
    page.on('console', (message) => { if (message.type() === 'error') report.console.push(message.text()); });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        const url = request.url();
        const failure = request.failure()?.errorText || '';
        if (/favicon|apple-touch-icon/i.test(url)) return;
        if (failure === 'net::ERR_ABORTED' && (/^blob:/i.test(url) || /\/api\/uploads\/recorded_\d+\.webm/i.test(url))) {
            report.ignoredRequestFailures.push({ url, failure, reason: 'media_source_replaced_or_context_closed' });
            return;
        }
        report.requestFailures.push({ url, failure });
    });
};

const createStressProjects = async (page, report, prefix) => {
    for (let index = 0; index < PROJECT_COUNT; index += 1) {
        markProgress(report, 'project:create:start', { index: index + 1 });
        const atomeOnly = index === 0;
        const project = await ensureProject(page, `${prefix} ${atomeOnly ? 'atome-only' : 'media'} project ${index + 1}`);
        if (!project.ok) throw new Error(`project_create_failed:${JSON.stringify(project)}`);
        const basic = await createBasicAtomes(page, project.id, prefix, index);
        const media = atomeOnly ? { ok: true, results: [] } : await importProjectMedia(page, project.id, index, MEDIA_FIXTURES);
        if (!media?.ok) throw new Error(`project_media_import_failed:${project.id}:${JSON.stringify(media)}`);
        const mediaIds = (media.results || []).map((entry) => entry.atomeId).filter(Boolean);
        const expectedIds = [...basic.ids, ...mediaIds];
        const entry = { ...project, expectedIds, mediaIds, atomeOnly };
        report.projects.push(entry);
        report.checks.push({ name: `project_${index + 1}_created`, ok: true, project: entry });
        markProgress(report, 'project:create:loaded', { index: index + 1, projectId: project.id });
        await assertProjectLoaded(page, entry);
        markProgress(report, 'project:create:validated', { index: index + 1, projectId: project.id });
    }
    for (const project of report.projects) {
        markProgress(report, 'project:revalidate:start', { projectId: project.id });
        await assertProjectLoaded(page, project);
        markProgress(report, 'project:revalidate:done', { projectId: project.id });
    }
    report.checks.push({ name: 'all_project_atomes_loaded', ok: true, count: report.projects.length });
    writeReport(report);
};

const exerciseDashboardOpenClose = async (page, report) => {
    const initial = await dashboardSnapshot(page);
    if (initial.active) {
        await clickMainHandle(page);
        const initialClosed = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
        if (!initialClosed.ok) throw new Error(`dashboard_initial_close_failed:${JSON.stringify(initialClosed.last)}`);
        await waitFrames(page, 4);
    }
    const measurements = [];
    for (let index = 0; index < 5; index += 1) {
        const beforeOpen = await page.evaluate(() => performance.now());
        await clickMainHandle(page);
        const opened = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active === true }), 15000, 50);
        if (!opened.ok) throw new Error(`dashboard_open_cycle_failed:${index + 1}:${JSON.stringify(opened.last)}`);
        const openDone = await page.evaluate(() => performance.now());
        const layout = (await dashboardSnapshot(page)).layout;
        await clickMainHandle(page);
        const closedWait = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
        if (!closedWait.ok) throw new Error(`dashboard_close_cycle_failed:${index + 1}:${JSON.stringify(closedWait.last)}`);
        await waitFrames(page, 8);
        const closeDone = await page.evaluate(() => performance.now());
        const file = await screenshot(page, `after_close_${index + 1}`);
        const residue = dashboardResidue(file, layout);
        if (!residue.pass) throw new Error(`dashboard_pixel_residue_after_close:${JSON.stringify(residue)}`);
        const closed = await dashboardSnapshot(page);
        if (closed.visibleDashboardIds.length) throw new Error(`dashboard_records_visible_after_close:${closed.visibleDashboardIds.join(',')}`);
        measurements.push({ openMs: openDone - beforeOpen, closeMs: closeDone - openDone, residue, file });
    }
    report.checks.push({ name: 'dashboard_open_close_cycles_clean', ok: true, measurements });
};

const exerciseDashboardHeaders = async (page, report) => {
    await clickMainHandle(page);
    const opened = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active === true }), 15000, 50);
    if (!opened.ok) throw new Error('dashboard_reopen_before_headers_failed');
    const headerTimes = [];
    const sequence = Array.from({ length: HEADER_CLICK_COUNT }, (_value, index) => ['projects', 'contacts', 'calendar', 'monitor', 'goals', 'news'][index % 6]);
    for (let index = 0; index < sequence.length; index += 1) {
        const categoryId = sequence[index];
        markProgress(report, 'dashboard:headers:click:start', { index: index + 1, categoryId });
        const snap = await dashboardSnapshot(page);
        const lane = snap.layout?.lanes?.find((entry) => entry.categoryId === categoryId);
        const before = await page.evaluate(() => performance.now());
        const clickTarget = await clickCanvasRect(page, lane?.header_rect);
        const activated = await waitFor(page, (id) => ({ ok: window.eveDashboardRuntime?.state?.activeCategoryId === id }), 15000, 16, categoryId);
        if (!activated.ok) throw new Error(`dashboard_header_activate_failed:${categoryId}:${JSON.stringify({ last: activated.last, clickTarget })}`);
        const after = await page.evaluate(() => performance.now());
        const colorProjection = await assertDashboardFocusedColors(page, categoryId);
        if (!colorProjection.ok) throw new Error(`dashboard_focused_color_projection_failed:${categoryId}:${JSON.stringify(colorProjection)}`);
        headerTimes.push(after - before);
        markProgress(report, 'dashboard:headers:click:done', { index: index + 1, categoryId, ms: Math.round((after - before) * 10) / 10, clickTarget });
    }
    const sortedHeaders = headerTimes.slice().sort((a, b) => a - b);
    const p95 = sortedHeaders[Math.floor((sortedHeaders.length - 1) * 0.95)];
    if (p95 > 100) throw new Error(`dashboard_header_p95_too_slow:${Math.round(p95 * 10) / 10}`);
    const current = await dashboardSnapshot(page);
    const activeLane = current.layout?.lanes?.find((entry) => entry.categoryId === current.activeCategoryId);
    await clickCanvasRect(page, activeLane?.header_rect);
    const restored = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.activeCategoryId === '' }), 15000, 50);
    if (!restored.ok) throw new Error(`dashboard_overview_restore_failed:${JSON.stringify(restored.last)}`);
    await waitFrames(page, 3);
    const overviewColors = await assertDashboardOverviewColors(page);
    if (!overviewColors.ok) throw new Error(`dashboard_overview_color_restore_failed:${JSON.stringify(overviewColors)}`);
    report.checks.push({ name: 'dashboard_header_clicks_fast', ok: true, p95Ms: Math.round(p95 * 10) / 10 });
    report.checks.push({ name: 'dashboard_focus_color_projection', ok: true, overviewColors });
};

const assertDashboardReopensAfterProjectSwitch = async (page, report, project) => {
    const closedSnap = await dashboardSnapshot(page);
    if (closedSnap.active) throw new Error(`dashboard_still_active_after_project_switch:${JSON.stringify(closedSnap)}`);
    if (closedSnap.visibleDashboardIds.length) throw new Error(`dashboard_records_visible_before_reopen:${closedSnap.visibleDashboardIds.join(',')}`);
    if (closedSnap.projectId !== project.id) throw new Error(`current_project_after_switch_mismatch:${closedSnap.projectId}:${project.id}`);
    if (closedSnap.runtimeProjectId && closedSnap.runtimeProjectId !== project.id) {
        throw new Error(`dashboard_runtime_project_stale_after_switch:${closedSnap.runtimeProjectId}:${project.id}`);
    }

    const beforeResize = await sceneSnapshot(page, project.id);
    if (beforeResize.foregroundProjectId !== project.id || beforeResize.surfaceOwnerProjectId !== project.id) {
        throw new Error(`project_scene_owner_mismatch_after_switch:${JSON.stringify(beforeResize)}`);
    }

    await page.setViewportSize({ width: 1280, height: 860 });
    let resized = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
        await waitFrames(page, 3);
        resized = await sceneSnapshot(page, project.id);
        const expectedPresent = project.expectedIds.every((id) => resized.recordIds.includes(id) && resized.virtualIds.includes(id));
        const sizeChanged = resized.canvasSize
            && beforeResize.canvasSize
            && (
                resized.canvasSize.cssWidth !== beforeResize.canvasSize.cssWidth
                || resized.canvasSize.cssHeight !== beforeResize.canvasSize.cssHeight
                || resized.canvasSize.pixelWidth !== beforeResize.canvasSize.pixelWidth
                || resized.canvasSize.pixelHeight !== beforeResize.canvasSize.pixelHeight
            );
        if (sizeChanged && expectedPresent && resized.dashboardVisibleIds.length === 0) break;
        resized = null;
    }
    if (!resized) throw new Error(`project_resize_after_dashboard_switch_failed:${JSON.stringify(await sceneSnapshot(page, project.id))}`);

    await page.setViewportSize({ width: 1440, height: 920 });
    await waitFrames(page, 6);
    await clickMainHandle(page);
    const reopened = await waitFor(page, (projectId) => {
        const currentProjectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
        const runtime = window.eveDashboardRuntime || null;
        const state = runtime?.state || {};
        const scene = currentProjectId ? window.eveToolBase?.getProjectSceneState?.(currentProjectId) : null;
        const visible = (scene?.records || [])
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
            .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0)
            .map((record) => record.id);
        return {
            ok: currentProjectId === projectId && state.active === true && state.projectId === projectId && visible.length > 0,
            currentProjectId,
            runtimeProjectId: state.projectId || '',
            active: state.active === true,
            visibleCount: visible.length
        };
    }, 20000, 50, project.id);
    if (!reopened.ok) throw new Error(`dashboard_reopen_after_project_switch_failed:${JSON.stringify(reopened.last)}`);
    const reopenShot = await screenshot(page, 'after_project_switch_dashboard_reopen');
    await clickMainHandle(page);
    const closedAgain = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
    if (!closedAgain.ok) throw new Error(`dashboard_close_after_reopen_failed:${JSON.stringify(closedAgain.last)}`);
    await waitFrames(page, 8);
    const finalClosed = await dashboardSnapshot(page);
    if (finalClosed.visibleDashboardIds.length) throw new Error(`dashboard_records_visible_after_reopen_close:${finalClosed.visibleDashboardIds.join(',')}`);
    report.checks.push({
        name: 'dashboard_reopens_after_atome_project_switch',
        ok: true,
        projectId: project.id,
        resizedCanvas: resized.canvasSize,
        screenshot: reopenShot,
        analysis: analyzeImage(reopenShot)
    });
};

const switchProjectFromDashboard = async (page, report, preferredTarget = null) => {
    await page.evaluate(() => window.eveDashboardRuntime?.activateCategory?.('projects'));
    await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.activeCategoryId === 'projects' }), 15000, 50);
    const projectSnap = await dashboardSnapshot(page);
    const target = preferredTarget?.id !== projectSnap.projectId
        ? preferredTarget
        : report.projects.find((project) => project.id !== projectSnap.projectId);
    const card = await waitFor(page, (projectId) => {
        const lanes = window.eveDashboardRuntime?.state?.layout?.lanes || [];
        const item = lanes.flatMap((lane) => lane.visible_item_rects || [])
            .find((entry) => String(entry?.item?.id || '') === String(projectId));
        return { ok: !!item?.rect, rect: item?.rect || null };
    }, 20000, 50, target?.id || '');
    if (!card.ok) throw new Error(`project_dashboard_card_not_visible:${target?.id}:${JSON.stringify(card.last)}`);
    await clickCanvasRect(page, card.last.rect);
    const switched = await waitFor(page, (id) => ({
        ok: window.__currentProject?.id === id && window.eveDashboardRuntime?.state?.active !== true
    }), 30000, 100, target.id);
    if (!switched.ok) throw new Error(`project_switch_from_dashboard_failed:${JSON.stringify(switched.last)}`);
    await assertProjectLoaded(page, target);
    const switchShot = await screenshot(page, 'after_project_card_switch');
    report.checks.push({ name: 'dashboard_project_card_switches_project', ok: true, screenshot: switchShot, analysis: analyzeImage(switchShot) });
    await assertDashboardReopensAfterProjectSwitch(page, report, target);
    return target;
};

const cleanupStressData = async (page, report, prefix) => page.evaluate(async ({ projects, prefix: key }) => {
    const deletedProjects = [];
    for (const project of projects || []) {
        const id = String(project?.id || '');
        if (!id) continue;
        await window.AdoleAPI?.projects?.delete?.(id).catch(() => null);
        deletedProjects.push(id);
    }
    await window.CalendarAPI?.deleteEvent?.(`${key}_calendar_a`).catch(() => null);
    await window.CalendarAPI?.deleteEvent?.(`${key}_calendar_b`).catch(() => null);
    await window.atome?.contacts?.deleteLocalContact?.(`${key}_contact`).catch(() => null);
    document.getElementById('dashboard_workspace_stress_files')?.remove?.();
    return { ok: true, deletedProjects };
}, { projects: report.projects, prefix }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

const run = async () => {
    MEDIA_FIXTURES.forEach((file) => {
        if (!fs.existsSync(file)) throw new Error(`missing_media_fixture:${file}`);
    });
    resetReportArtifacts();
    const report = createReport();
    const browser = await chromium.launch({
        headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '0' ? false : process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu']
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const page = await context.newPage();
    attachPageDiagnostics(page, report);
    const prefix = `dashboard_stress_${nowId()}`;
    try {
        markProgress(report, 'workspace:enter:start');
        report.workspace = await enterGuestWorkspace(page);
        markProgress(report, 'workspace:enter:done', { projectId: report.workspace?.projectId || null });
        await page.evaluate(() => window.__EVE_BEVY_PERF__?.reset?.());
        markProgress(report, 'projects:create:start');
        await createStressProjects(page, report, prefix);
        markProgress(report, 'projects:create:done', { count: report.projects.length });
        const activeProject = report.projects.find((project) => !project.atomeOnly) || report.projects[0];
        const atomeOnlyProject = report.projects.find((project) => project.atomeOnly) || report.projects.find((project) => project.id !== activeProject.id);
        markProgress(report, 'active_project:set:start', { projectId: activeProject.id });
        await page.evaluate((project) => window.AdoleAPI.projects.setCurrent(project.id, project.name, null, true), activeProject);
        await assertProjectLoaded(page, activeProject);
        markProgress(report, 'active_project:set:done', { projectId: activeProject.id });
        markProgress(report, 'dashboard:prewarm_close:start', { projectId: activeProject.id });
        await page.evaluate(() => window.eveDashboardRuntime?.close?.());
        await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
        await waitFrames(page, 6);
        markProgress(report, 'dashboard:prewarm_close:done', { projectId: activeProject.id });
        markProgress(report, 'dashboard:warmup:start', { projectId: activeProject.id });
        const warmup = await page.evaluate((projectId) => window.eveDashboardRuntime?.warmup?.({ projectId }), activeProject.id);
        if (warmup?.ok !== true) throw new Error(`dashboard_warmup_failed:${JSON.stringify(warmup)}`);
        await page.evaluate(() => window.__EVE_BEVY_PERF__?.reset?.());
        markProgress(report, 'dashboard:warmup:done', { projectId: activeProject.id, warmed: warmup.warmed || 0 });
        markProgress(report, 'dashboard:open_close:start');
        await exerciseDashboardOpenClose(page, report);
        markProgress(report, 'dashboard:open_close:done');
        markProgress(report, 'dashboard:headers:start');
        await exerciseDashboardHeaders(page, report);
        markProgress(report, 'dashboard:headers:done');
        markProgress(report, 'dashboard:project_switch:start');
        const switchedProject = await switchProjectFromDashboard(page, report, atomeOnlyProject);
        markProgress(report, 'dashboard:project_switch:done', { projectId: switchedProject.id });
        markProgress(report, 'dynamic_data:start', { projectId: switchedProject.id });
        await exerciseDynamicData(page, switchedProject.id, prefix);
        markProgress(report, 'dynamic_data:done', { projectId: switchedProject.id });
        await page.evaluate(() => window.eveDashboardRuntime?.close?.());
        await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
        await waitFrames(page, 10);
        const finalSnap = await dashboardSnapshot(page);
        if (finalSnap.visibleDashboardIds.length) throw new Error(`dashboard_visible_after_dynamic_close:${finalSnap.visibleDashboardIds.join(',')}`);
        const finalShot = await screenshot(page, 'after_dynamic_close');
        report.checks.push({ name: 'dynamic_calendar_contact_project_dashboard_clean', ok: true, screenshot: finalShot, analysis: analyzeImage(finalShot) });
        report.finalPerf = (await dashboardSnapshot(page)).perf;
        report.ok = true;
    } catch (error) {
        report.ok = false;
        report.error = error?.message || String(error);
        report.stack = error?.stack || null;
        report.failureSnapshot = await dashboardSnapshot(page).catch((snapshotError) => ({ error: snapshotError?.message || String(snapshotError) }));
        report.failureScreenshot = await screenshot(page, 'failure_full_page').catch(() => null);
    } finally {
        report.cleanup = await cleanupStressData(page, report, prefix);
        writeReport(report);
        await browser.close();
    }
    if (!report.ok) throw new Error(report.error || 'dashboard_workspace_stress_failed');
    process.stdout.write(`${JSON.stringify({ ok: true, reportFile: REPORT_FILE, checks: report.checks.length, finalPerf: report.finalPerf?.counters || null }, null, 2)}\n`);
};

await run();
