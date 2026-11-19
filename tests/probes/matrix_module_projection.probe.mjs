// A project's Matrix modules follow its scene projection (project_scene_state.js#subscribeProjectSceneProjection),
// with no polling: placed in project A, gone when project B is opened, back when A is reopened.
import fs from 'node:fs';
import path from 'node:path';
import { app, openNewProject, waitFor } from '../helpers/probe_app.mjs';
import { createReport, openHome } from '../helpers/probe_home.mjs';

const OUT = path.resolve('temp/probe_reports/matrix_module_projection');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const checks = {};
const errors = [];
const home = createReport('matrix_projection');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
const shown = async (atomeId) => (await waitFor(page, (id) => (window.eveMatrixModules?.list() || [])
    .some((m) => m.atome_id === id && !m.workspace_home && !m.error), atomeId, 20000)) === true;
const gone = async (atomeId) => (await waitFor(page, (id) => !(window.eveMatrixModules?.list() || [])
    .some((m) => m.atome_id === id && !m.workspace_home), atomeId, 20000)) === true;
const reopen = (project) => app(page, `const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
    const activation = await projectRuntime.activateProjectWorkspace(arg, { force: true, staleFirst: false });
    workspaceMode.markProjectWorkspaceMode?.(arg.id);
    return activation?.ok === true;`, project);
try {
    const a = await openNewProject(page, `matrix_a_${Date.now()}`);
    checks.project_a_opened = { ok: a.ok === true, v: a };
    const placed = await app(page, 'return window.eveMatrixModules.place({ project_id: arg, name: "Matrix A" });', a.id);
    const atomeId = placed?.atome_id;
    checks.placed = { ok: placed?.ok === true && Boolean(atomeId), v: placed };
    checks.module_shown_in_a = { ok: await shown(atomeId) };
    // Nothing re-lays the modules by polling any more.
    checks.no_poller_left = { ok: await app(page, `const src = await (await fetch('/eVe/domains/matrix/matrix_module_runtime.js')).text();
        return !src.includes('createVisibilityAwareInterval');`) };
    const b = await openNewProject(page, `matrix_b_${Date.now()}`);
    checks.project_b_opened = { ok: b.ok === true };
    checks.module_gone_in_b = { ok: await gone(atomeId), v: await app(page, 'return window.eveMatrixModules.list();') };
    checks.reopened_a = { ok: await reopen({ id: a.id, name: a.name }) };
    checks.module_back_in_a = { ok: await shown(atomeId), v: await app(page, 'return window.eveMatrixModules.list();') };
    await page.screenshot({ path: path.join(OUT, 'a_reopened.png') });
    // The order the poll used to cover: the mode switched to A first (its modules laid then, from an empty scene), the
    // scene projected after it, with no commit and no mode change; only the projection signal brings the module.
    const c = await openNewProject(page, `matrix_c_${Date.now()}`);
    checks.project_c_opened = { ok: c.ok === true && await gone(atomeId) };
    checks.late_projection = { ok: await app(page, `const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        const scene = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
        workspaceMode.markProjectWorkspaceMode?.(arg.id);
        await new Promise((resolve) => setTimeout(resolve, 400));
        scene.claimProjectSceneForeground?.(arg.id);
        const activation = await projectRuntime.activateProjectWorkspace(arg, { force: true, staleFirst: false });
        return activation?.ok === true;`, { id: a.id, name: a.name }) };
    checks.module_back_after_late_projection = { ok: await shown(atomeId), v: await app(page, 'return window.eveMatrixModules.list();') };
} catch (error) {
    checks.exception = { ok: false, v: String(error?.stack || error).slice(0, 600) };
} finally {
    checks.no_page_error = { ok: errors.length === 0, v: errors };
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(checks, null, 2));
    for (const [name, check] of Object.entries(checks)) console.log(check.ok ? 'PASS' : 'FAIL', name, check.ok ? '' : JSON.stringify(check.v ?? '').slice(0, 300));
    await close();
    process.exitCode = Object.values(checks).every((check) => check.ok) ? 0 : 1;
}
