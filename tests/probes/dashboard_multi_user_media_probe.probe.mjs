import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    APP_URL,
    OUT_DIR,
    nowId,
    sceneSnapshot,
    waitFor
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

// A new phone account per user, through the phone link (Auth V1; `auth.login` / `auth.create` are gone since 27 Sep.):
// on a test server with the SMS mock, the link comes back in the WebSocket frame (`developmentLink`).
const loginOrCreateUser = async (page, link, index) => {
    const phone = `+1555${String(Date.now()).slice(-6)}${index}`;
    const started = await page.evaluate(async (number) => {
        const api = window.AdoleAPI?.auth;
        if (!api?.startPhoneLogin) return { ok: false, error: 'auth_phone_login_missing' };
        const result = await api.startPhoneLogin(number);
        const paid = result?.paymentRequired === true ? await api.payPhoneLogin({ method: 'paypal' }) : null;
        return { ok: true, session: Boolean(paid?.session) };
    }, phone);
    if (!started.ok) return started;
    for (let i = 0; i < 60 && !started.session && !link(); i += 1) await page.waitForTimeout(100);
    const ok = started.session || await page.evaluate(async (url) => (await window.AdoleAPI.auth.completePhoneLogin(url))?.ok === true, link());
    return { ok, phone, username: phone };
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
    // The app reaches the test server it was served by (an isolated one, tests/parcours/serveur_isole.mjs), as the
    // R-108 session does (r108_web_session.mjs).
    const appUrl = new URL(APP_URL);
    await context.route('**/server_config.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ fastify: {
        host: appUrl.hostname, port: Number(appUrl.port || 80), serverInfoPath: '/api/server-info', syncWsPath: '/ws/sync', apiWsPath: '/ws/api' } }) }));
    await context.addInitScript(() => { window.__SQUIRREL_FORCE_FASTIFY__ = true; });
    const page = await context.newPage();
    const userLabel = `user_${userIndex}`;
    attachPageDiagnostics(page, report, userLabel);
    let developmentLink = '';
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => {
        const match = String(frame.payload).match(/"developmentLink":"([^"]+)"/);
        if (match) developmentLink = match[1];
    }));
    const userReport = { label: userLabel, projects: [] };
    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ready = await waitFor(page, () => ({
            ok: !!window.AdoleAPI && window.__authCheckComplete === true
        }), 45000, 100);
        if (!ready.ok) throw new Error(`api_not_ready:${JSON.stringify(ready.last)}`);
        const login = await loginOrCreateUser(page, () => developmentLink, userIndex);
        if (!login?.ok) throw new Error(`login_or_create_failed:${JSON.stringify(login)}`);
        userReport.login = { phone: login.phone, username: login.username };
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        // Signed in, the app installs its mutation pipeline after the auth check (r108_web_session.mjs waits the same).
        const boot = await waitFor(page, () => ({
            ok: !!window.AdoleAPI && window.__authCheckComplete === true && typeof window.Atome?.commitBatch === 'function'
        }), 120000, 100);
        if (!boot.ok) throw new Error(`post_login_boot_failed:${JSON.stringify(boot.last)}`);
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
