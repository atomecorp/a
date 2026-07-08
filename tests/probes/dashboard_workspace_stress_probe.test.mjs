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
    dashboardSnapshot,
    enterAuthenticatedWorkspace,
    nowId,
    sceneSnapshot,
    screenshot,
    waitFor,
    waitFrames,
    writeReport
} from './dashboard_workspace_stress/support.mjs';
import {
    assertProjectLoaded,
    assertWorkspaceInteractionInvariant,
    createBasicAtomes,
    dragProjectMediaAtomes,
    ensureProject,
    exerciseDynamicData,
    importProjectMedia
} from './dashboard_workspace_stress/product_actions.mjs';
import {
    assertDashboardFocusedColors,
    assertDashboardOverviewColors
} from './dashboard_workspace_stress/dashboard_color_assertions.mjs';
import {
    assertStartupDashboardOnly,
    attachPageDiagnostics,
    exerciseDashboardOpenClose,
    exerciseStartupDashboardOpenClose,
    waitForDashboardFadeSettled,
    waitForDashboardFadeStart
} from './dashboard_workspace_stress/dashboard_cycles.mjs';

const PROJECT_COUNT = 3;
const HEADER_CLICK_COUNT = 30;
const HEADER_STRESS_P95_LIMIT_MS = 350;
const MEDIA_FIXTURES = [
    path.resolve('atome/src/assets/images/1.png'),
    path.resolve('atome/src/assets/images/2.png'),
    path.resolve('atome/src/assets/images/3.png')
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

const createStressProjects = async (page, report, prefix) => {
    for (let index = 0; index < PROJECT_COUNT; index += 1) {
        markProgress(report, 'project:create:start', { index: index + 1 });
        if (index > 0) await page.waitForTimeout(2000);
        const atomeOnly = index === 0;
        const project = await ensureProject(page, `${prefix} ${atomeOnly ? 'atome-only' : 'media'} project ${index + 1}`);
        if (!project.ok) throw new Error(`project_create_failed:${JSON.stringify(project)}`);
        const basic = await createBasicAtomes(page, project.id, prefix, index);
        const media = atomeOnly ? { ok: true, results: [] } : await importProjectMedia(page, project.id, index, MEDIA_FIXTURES);
        if (!media?.ok) throw new Error(`project_media_import_failed:${project.id}:${JSON.stringify(media)}`);
        const mediaIds = (media.results || []).map((entry) => entry.atomeId).filter(Boolean);
        const mediaKinds = (media.results || []).map((entry) => entry.type).filter(Boolean);
        const expectedIds = [...basic.ids, ...mediaIds];
        const entry = { ...project, expectedIds, mediaIds, mediaKinds, atomeOnly };
        report.projects.push(entry);
        report.checks.push({ name: `project_${index + 1}_created`, ok: true, project: entry });
        markProgress(report, 'project:create:loaded', { index: index + 1, projectId: project.id });
        await assertProjectLoaded(page, entry);
        await assertWorkspaceInteractionInvariant(page, entry, `project_${index + 1}_after_load`);
        if (mediaIds.length) {
            const moved = await dragProjectMediaAtomes(page, entry);
            report.checks.push({ name: `project_${index + 1}_media_dragged`, ok: true, moved });
            await assertWorkspaceInteractionInvariant(page, entry, `project_${index + 1}_after_drag`);
        }
        markProgress(report, 'project:create:validated', { index: index + 1, projectId: project.id });
    }
    for (const project of report.projects) {
        markProgress(report, 'project:revalidate:start', { projectId: project.id });
        await page.evaluate(async (entry) => {
            const module = await import('/eVe/intuition/matrix/core/project_data.js');
            await module.activateProjectWorkspace?.(entry, { force: true, staleFirst: false });
        }, project);
        await assertProjectLoaded(page, project);
        await assertWorkspaceInteractionInvariant(page, project, `project_revalidate_${project.id}`);
        markProgress(report, 'project:revalidate:done', { projectId: project.id });
    }
    report.checks.push({ name: 'all_project_atomes_loaded', ok: true, count: report.projects.length });
    writeReport(report);
};

const exerciseDashboardHeaders = async (page, report) => {
    await clickMainHandle(page);
    const opened = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active === true }), 15000, 50);
    if (!opened.ok) throw new Error('dashboard_reopen_before_headers_failed');
    await waitForDashboardFadeSettled(page, 'headers_open', true);
    await waitFrames(page, 4);
    const headerTimes = [];
    const sequence = Array.from({ length: HEADER_CLICK_COUNT }, (_value, index) => ['projects', 'contacts', 'calendar', 'monitor', 'goals', 'news'][index % 6]);
    for (let index = 0; index < sequence.length; index += 1) {
        const categoryId = sequence[index];
        markProgress(report, 'dashboard:headers:click:start', { index: index + 1, categoryId });
        const snap = await dashboardSnapshot(page);
        const lane = snap.layout?.lanes?.find((entry) => entry.categoryId === categoryId);
        const before = await page.evaluate(() => performance.now());
        const clickTarget = await clickCanvasRect(page, lane?.header_rect);
        const activated = await waitFor(page, (id) => ({ ok: window.eveDashboardBevyUiRuntime?.state?.activeCategoryId === id }), 15000, 16, categoryId);
        if (!activated.ok) throw new Error(`dashboard_header_activate_failed:${categoryId}:${JSON.stringify({ last: activated.last, clickTarget })}`);
        const after = await page.evaluate(() => performance.now());
        const colorProjection = await assertDashboardFocusedColors(page, categoryId);
        if (!colorProjection.ok) throw new Error(`dashboard_focused_color_projection_failed:${categoryId}:${JSON.stringify(colorProjection)}`);
        headerTimes.push(after - before);
        markProgress(report, 'dashboard:headers:click:done', { index: index + 1, categoryId, ms: Math.round((after - before) * 10) / 10, clickTarget });
    }
    const sortedHeaders = headerTimes.slice().sort((a, b) => a - b);
    const p95 = sortedHeaders[Math.floor((sortedHeaders.length - 1) * 0.95)];
    if (p95 > HEADER_STRESS_P95_LIMIT_MS) throw new Error(`dashboard_header_p95_too_slow:${Math.round(p95 * 10) / 10}`);
    const current = await dashboardSnapshot(page);
    const activeLane = current.layout?.lanes?.find((entry) => entry.categoryId === current.activeCategoryId);
    await clickCanvasRect(page, activeLane?.header_rect);
    const restored = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.activeCategoryId === '' }), 15000, 50);
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
        const runtime = window.eveDashboardBevyUiRuntime || null;
        const state = runtime?.state || {};
        const sceneProjectId = state.active === true ? (state.projectId || '__eve_dashboard_workspace__') : currentProjectId;
        const scene = sceneProjectId ? window.eveToolBase?.getProjectSceneState?.(sceneProjectId) : null;
        const visible = (scene?.records || [])
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
            .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0)
            .map((record) => record.id);
        return {
            ok: currentProjectId === projectId && state.active === true && state.projectId === '__eve_dashboard_workspace__' && visible.length > 0,
            currentProjectId,
            runtimeProjectId: state.projectId || '',
            active: state.active === true,
            visibleCount: visible.length
        };
    }, 20000, 50, project.id);
    if (!reopened.ok) throw new Error(`dashboard_reopen_after_project_switch_failed:${JSON.stringify(reopened.last)}`);
    const reopenShot = await screenshot(page, 'after_project_switch_dashboard_reopen');
    await clickMainHandle(page);
    const closedAgain = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
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
    await page.evaluate(() => window.eveDashboardBevyUiRuntime?.activateCategory?.('projects'));
    await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.activeCategoryId === 'projects' }), 15000, 50);
    const projectSnap = await dashboardSnapshot(page);
    const target = preferredTarget?.id !== projectSnap.projectId
        ? preferredTarget
        : report.projects.find((project) => project.id !== projectSnap.projectId);
    const card = await waitFor(page, (projectId) => {
        const lanes = window.eveDashboardBevyUiRuntime?.state?.layout?.lanes || [];
        const item = lanes.flatMap((lane) => lane.visible_item_rects || [])
            .find((entry) => String(entry?.item?.id || '') === String(projectId));
        return { ok: !!item?.rect, rect: item?.rect || null };
    }, 20000, 50, target?.id || '');
    if (!card.ok) throw new Error(`project_dashboard_card_not_visible:${target?.id}:${JSON.stringify(card.last)}`);
    await clickCanvasRect(page, card.last.rect);
    const switched = await waitFor(page, (id) => ({
        ok: window.__currentProject?.id === id && window.eveDashboardBevyUiRuntime?.state?.active !== true
    }), 30000, 100, target.id);
    if (!switched.ok) throw new Error(`project_switch_from_dashboard_failed:${JSON.stringify(switched.last)}`);
    await assertProjectLoaded(page, target);
    await assertWorkspaceInteractionInvariant(page, target, `project_switch_${target.id}`);
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
        report.workspace = await enterAuthenticatedWorkspace(page, { prefix });
        markProgress(report, 'workspace:enter:done', { projectId: report.workspace?.projectId || null });
        await assertStartupDashboardOnly(page, report);
        markProgress(report, 'workspace:startup_cycles:start');
        await exerciseStartupDashboardOpenClose(page, report);
        markProgress(report, 'workspace:startup_cycles:done');
        if ((await dashboardSnapshot(page)).active === true) {
            markProgress(report, 'workspace:dashboard_close_before_project_setup:start');
            await clickMainHandle(page);
            await waitForDashboardFadeStart(page, 'close_before_project_setup', 'close');
            const closed = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
            if (!closed.ok) throw new Error(`dashboard_close_before_project_setup_failed:${JSON.stringify(closed.last)}`);
            await waitForDashboardFadeSettled(page, 'close_before_project_setup', false);
            await waitFrames(page, 6);
            markProgress(report, 'workspace:dashboard_close_before_project_setup:done');
        }
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
        await page.evaluate(() => window.eveDashboardBevyUiRuntime?.close?.());
        await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
        await waitFrames(page, 6);
        markProgress(report, 'dashboard:prewarm_close:done', { projectId: activeProject.id });
        markProgress(report, 'dashboard:warmup:start', { projectId: activeProject.id });
        const warmup = await page.evaluate((projectId) => window.eveDashboardBevyUiRuntime?.warmup?.({ projectId }), activeProject.id);
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
        await page.evaluate(() => window.eveDashboardBevyUiRuntime?.close?.());
        await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
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
