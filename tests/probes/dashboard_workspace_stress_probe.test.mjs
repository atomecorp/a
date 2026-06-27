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

const attachPageDiagnostics = (page, report) => {
    page.on('console', (message) => { if (message.type() === 'error') report.console.push(message.text()); });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        if (!/favicon|apple-touch-icon/i.test(request.url())) {
            report.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || '' });
        }
    });
};

const createStressProjects = async (page, report, prefix) => {
    for (let index = 0; index < PROJECT_COUNT; index += 1) {
        markProgress(report, 'project:create:start', { index: index + 1 });
        const project = await ensureProject(page, `${prefix} project ${index + 1}`);
        if (!project.ok) throw new Error(`project_create_failed:${JSON.stringify(project)}`);
        const basic = await createBasicAtomes(page, project.id, prefix, index);
        const media = await importProjectMedia(page, project.id, index, MEDIA_FIXTURES);
        if (!media?.ok) throw new Error(`project_media_import_failed:${project.id}:${JSON.stringify(media)}`);
        const mediaIds = (media.results || []).map((entry) => entry.atomeId).filter(Boolean);
        const expectedIds = [...basic.ids, ...mediaIds];
        const entry = { ...project, expectedIds, mediaIds };
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
        const before = await page.evaluate(() => performance.now());
        const snap = await dashboardSnapshot(page);
        const lane = snap.layout?.lanes?.find((entry) => entry.categoryId === categoryId);
        const clickTarget = await clickCanvasRect(page, lane?.header_rect);
        const activated = await waitFor(page, (id) => ({ ok: window.eveDashboardRuntime?.state?.activeCategoryId === id }), 15000, 50, categoryId);
        if (!activated.ok) throw new Error(`dashboard_header_activate_failed:${categoryId}:${JSON.stringify({ last: activated.last, clickTarget })}`);
        const after = await page.evaluate(() => performance.now());
        headerTimes.push(after - before);
        markProgress(report, 'dashboard:headers:click:done', { index: index + 1, categoryId, ms: Math.round((after - before) * 10) / 10, clickTarget });
    }
    const sortedHeaders = headerTimes.slice().sort((a, b) => a - b);
    const p95 = sortedHeaders[Math.floor((sortedHeaders.length - 1) * 0.95)];
    if (p95 > 100) throw new Error(`dashboard_header_p95_too_slow:${Math.round(p95 * 10) / 10}`);
    report.checks.push({ name: 'dashboard_header_clicks_fast', ok: true, p95Ms: Math.round(p95 * 10) / 10 });
};

const switchProjectFromDashboard = async (page, report) => {
    await page.evaluate(() => window.eveDashboardRuntime?.activateCategory?.('projects'));
    await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.activeCategoryId === 'projects' }), 15000, 50);
    const projectSnap = await dashboardSnapshot(page);
    const target = report.projects.find((project) => project.id !== projectSnap.projectId);
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
        const activeProject = report.projects[0];
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
        const switchedProject = await switchProjectFromDashboard(page, report);
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
