import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    APP_URL,
    OUT_DIR,
    dashboardSnapshot,
    nowId,
    sceneSnapshot,
    waitFor,
    waitFrames
} from './dashboard_workspace_stress/support.mjs';
import {
    assertProjectLoaded,
    createBasicAtomes,
    ensureProject,
    importProjectMedia
} from './dashboard_workspace_stress/product_actions.mjs';

const USER_COUNT = 2;
const PROJECTS_PER_USER = 3;
const MEDIA_FIXTURES = [
    path.resolve('tests/fixtures/media/0000.png'),
    path.resolve('tests/fixtures/media/test.m4a'),
    path.resolve('tests/fixtures/media/recorded.webm')
];
const REPORT_FILE = path.join(OUT_DIR, 'multi_user_media_report.json');

const writeReport = (report) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const createReport = () => ({
    ok: false,
    appUrl: APP_URL,
    users: [],
    console: [],
    pageErrors: []
});

const attachPageDiagnostics = (page, report, userLabel) => {
    page.on('console', (message) => {
        if (message.type() === 'error') report.console.push({ user: userLabel, text: message.text() });
    });
    page.on('pageerror', (error) => {
        report.pageErrors.push({ user: userLabel, text: error?.message || String(error) });
    });
};

const loginOrCreateUser = async (page, prefix, index) => page.evaluate(async ({ key, order }) => {
    const phone = `+1555${String(Date.now()).slice(-7)}${order}`;
    const password = `probe_${key}_${order}_password`;
    const username = `probe_${key}_${order}`;
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login || !api?.auth?.create) return { ok: false, error: 'auth_api_missing' };
    const created = await api.auth.create(phone, password, username, { autoLogin: true });
    const createOk = !!(
        created?.fastify?.success
        || created?.tauri?.success
        || created?.login?.fastify?.success
        || created?.login?.tauri?.success
    );
    if (createOk) return { ok: true, phone, username, created };
    const logged = await api.auth.login(phone, password, username);
    const loginOk = !!(logged?.fastify?.success || logged?.tauri?.success);
    return { ok: loginOk, phone, username, created, logged };
}, { key: prefix, order: index });

const ensureDashboardClosed = async (page) => {
    await page.evaluate(() => window.eveDashboardRuntime?.close?.({ honorLabelEditorKeyboardGuard: false }));
    const closed = await waitFor(page, () => ({ ok: window.eveDashboardRuntime?.state?.active !== true }), 15000, 50);
    if (!closed.ok) throw new Error(`dashboard_close_failed:${JSON.stringify(closed.last)}`);
    await waitFrames(page, 6);
};

const cleanupProjects = async (page, projects) => page.evaluate(async (items) => {
    const deleted = [];
    for (const project of items || []) {
        const id = String(project?.id || '');
        if (!id) continue;
        await window.AdoleAPI?.projects?.delete?.(id).catch(() => null);
        deleted.push(id);
    }
    return { ok: true, deleted };
}, projects).catch((error) => ({ ok: false, error: error?.message || String(error) }));

const exerciseUserWorkspace = async ({ browser, report, prefix, userIndex }) => {
    const context = await browser.newContext({ viewport: { width: 1320, height: 860 } });
    const page = await context.newPage();
    const userLabel = `user_${userIndex}`;
    attachPageDiagnostics(page, report, userLabel);
    const userReport = { label: userLabel, projects: [] };
    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ready = await waitFor(page, () => ({
            ok: !!window.AdoleAPI && window.__authCheckComplete === true
        }), 45000, 100);
        if (!ready.ok) throw new Error(`api_not_ready:${JSON.stringify(ready.last)}`);
        const login = await loginOrCreateUser(page, prefix, userIndex);
        if (!login?.ok) throw new Error(`login_or_create_failed:${JSON.stringify(login)}`);
        userReport.login = { phone: login.phone, username: login.username };
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        const boot = await waitFor(page, () => ({
            ok: !!window.AdoleAPI && window.__authCheckComplete === true && !!window.eveDashboardRuntime
        }), 45000, 100);
        if (!boot.ok) throw new Error(`post_login_boot_failed:${JSON.stringify(boot.last)}`);
        await ensureDashboardClosed(page);
        for (let projectIndex = 0; projectIndex < PROJECTS_PER_USER; projectIndex += 1) {
            const project = await ensureProject(page, `${prefix} ${userLabel} project ${projectIndex + 1}`);
            if (!project?.ok) throw new Error(`project_create_failed:${JSON.stringify(project)}`);
            const basic = await createBasicAtomes(page, project.id, prefix, userIndex * 10 + projectIndex);
            const media = await importProjectMedia(page, project.id, userIndex * 10 + projectIndex, MEDIA_FIXTURES);
            if (!media?.ok) throw new Error(`media_import_failed:${project.id}:${JSON.stringify(media)}`);
            const mediaIds = (media.results || []).map((entry) => entry.atomeId).filter(Boolean);
            const expectedIds = [...basic.ids, ...mediaIds];
            await assertProjectLoaded(page, { ...project, expectedIds, mediaIds });
            const scene = await sceneSnapshot(page, project.id);
            if (scene.dashboardVisibleIds.length) {
                throw new Error(`dashboard_records_in_project_scene:${project.id}:${scene.dashboardVisibleIds.join(',')}`);
            }
            userReport.projects.push({ ...project, expectedIds, mediaIds });
        }
        const listed = await page.evaluate(() => window.AdoleAPI?.projects?.list?.());
        userReport.listedProjectIds = [
            ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : []),
            ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
            ...(Array.isArray(listed?.projects) ? listed.projects : [])
        ].map((project) => String(project?.id || project?.project_id || project?.atome_id || '')).filter(Boolean);
        const missingOwnProjects = userReport.projects
            .map((project) => project.id)
            .filter((id) => !userReport.listedProjectIds.includes(id));
        if (missingOwnProjects.length) throw new Error(`own_projects_missing_from_list:${missingOwnProjects.join(',')}`);
        await page.evaluate(() => window.eveDashboardRuntime?.open?.({ projectId: '__eve_dashboard_workspace__', dataProjectId: '__eve_dashboard_workspace__' }));
        const dashboardOpen = await waitFor(page, () => {
            const state = window.eveDashboardRuntime?.state || {};
            return { ok: state.active === true && state.projectId === '__eve_dashboard_workspace__' };
        }, 20000, 50);
        if (!dashboardOpen.ok) throw new Error(`dashboard_neutral_open_failed:${JSON.stringify(dashboardOpen.last)}`);
        const dashboard = await dashboardSnapshot(page);
        if (!dashboard.active || dashboard.runtimeProjectId !== '__eve_dashboard_workspace__') {
            throw new Error(`dashboard_not_neutral:${JSON.stringify(dashboard)}`);
        }
        await ensureDashboardClosed(page);
        userReport.cleanup = await cleanupProjects(page, userReport.projects);
        return userReport;
    } finally {
        if (!userReport.cleanup) userReport.cleanup = await cleanupProjects(page, userReport.projects);
        await context.close();
    }
};

const run = async () => {
    MEDIA_FIXTURES.forEach((file) => {
        if (!fs.existsSync(file)) throw new Error(`missing_media_fixture:${file}`);
    });
    const report = createReport();
    const browser = await chromium.launch({
        headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '0' ? false : process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu']
    });
    const prefix = `dashboard_multi_user_${nowId()}`;
    try {
        for (let index = 0; index < USER_COUNT; index += 1) {
            const userReport = await exerciseUserWorkspace({ browser, report, prefix, userIndex: index + 1 });
            report.users.push(userReport);
            writeReport(report);
        }
        const projectSets = report.users.map((user) => new Set(user.projects.map((project) => project.id)));
        const overlap = [...projectSets[0]].filter((id) => projectSets[1].has(id));
        if (overlap.length) throw new Error(`project_id_overlap_between_users:${overlap.join(',')}`);
        report.ok = true;
    } catch (error) {
        report.ok = false;
        report.error = error?.message || String(error);
        report.stack = error?.stack || null;
    } finally {
        writeReport(report);
        await browser.close();
    }
    if (!report.ok) throw new Error(report.error || 'dashboard_multi_user_media_failed');
    process.stdout.write(`${JSON.stringify({ ok: true, reportFile: REPORT_FILE, users: report.users.length }, null, 2)}\n`);
};

await run();
