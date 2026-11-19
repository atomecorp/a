// A deleted project takes its Timeline session with it (found on the iPad in AUM, 16 Nov. 2026: the active Timeline,
// the host's transport and the mixer graph stayed on a deleted project). A shows its Timeline, B is created and shows
// its own, B is deleted through the canonical projects.delete tool: no session of B remains and none is active; A
// shown again in the Timeline is the active one. Test PE-09 of tests/parcours_musique/10_persistance_plateformes.md.
// node tests/probes/music/project_delete_timeline.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { app, openNewProject } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/project_delete_timeline');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const home = createReport('project_delete_timeline');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.stack || e?.message || e).slice(0, 900)}`));
// The Timeline view of a project, as its tool shows it (the view mounts the project's Timeline session).
const showTimeline = (pid) => app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
const active = () => app(page, 'return window.eveMoleculeTimelineApi.getActiveGroupTimelineId();');
// A Timeline session of the group, open or not (readGroupTimeline refuses a group without one).
const hasSession = (pid) => app(page, 'try { return !!window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg })?.timeline; } catch { return false; }', pid);
const until = async (test, timeoutMs = 15000) => { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await test()) return true; await wait(250); } return false; };
const reopen = (pid) => app(page, `const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
    const activation = await projectRuntime.activateProjectWorkspace({ id: arg }, { force: true, staleFirst: false });
    workspaceMode.markProjectWorkspaceMode?.(arg); return activation?.ok === true;`, pid);

try {
    const a = await openNewProject(page, `delete_tl_A_${Date.now()}`);
    check('PE-09 project A opened', a.ok === true, a);
    await showTimeline(a.id);
    check('PE-09 A shown in its Timeline is the active Timeline', await until(async () => (await active()) === a.id), { active: await active() });
    const b = await openNewProject(page, `delete_tl_B_${Date.now()}`);
    check('PE-09 project B opened', b.ok === true, b);
    await showTimeline(b.id);
    check('PE-09 B shown in its Timeline is the active Timeline', await until(async () => (await active()) === b.id), { active: await active() });
    // The changes the view hears during the delete (atome:changed, project_view_surface_events.js#onRecordsChanged).
    await app(page, `const eventBus = (await import('/eVe/core/event_bus.js')).default;
        window.__deleteProbeEvents = [];
        eventBus.on('atome:changed', (p) => { const e = p?.event || {}; window.__deleteProbeEvents.push({ id: e.atome_id || e.atomeId || e.id, kind: e.kind, deleted: (e.payload?.props || e.props || e.properties || {}).__deleted, keys: Object.keys(e).slice(0, 8) }); });
        return true;`);
    const deleted = await app(page, `const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        const r = await invokeToolGateway({ action: 'pointer.click', tool_id: 'projects.delete', input: { project_id: arg }, source: { type: 'ui', layer: 'probe' } });
        return { ok: r?.ok === true && r?.result?.ok !== false, error: r?.error || r?.result?.error || null };`, b.id);
    check('PE-09 B deleted through projects.delete', deleted.ok, deleted);
    report.notes.surface_after_delete = await app(page, `const s = (await import('/eVe/domains/rendering/project_view_surface_runtime.js')).readProjectViewSurfaceState();
        return { mode: s?.mode, projectId: s?.projectId, mounted: s?.mounted, errorsSoFar: 0 };`);
    report.notes.errors_at_delete = report.errors.length; write();
    check('PE-09 no Timeline session of the deleted B remains', await until(async () => !(await hasSession(b.id))), { session: await hasSession(b.id) });
    check('PE-09 the active Timeline is no longer the deleted B', (await active()) !== b.id, { active: await active() });
    // Who opens a Timeline session from here on (a deleted project's must never come back).
    await app(page, `const api = window.eveMoleculeTimelineApi; const original = api.openGroupTimeline; window.__deleteProbeOpens = [];
        api.openGroupTimeline = function (detail) { window.__deleteProbeOpens.push({ group: detail?.group_id, stack: String(new Error().stack).split('\\n').slice(2, 9).join(' | ') }); return original.call(this, detail); };
        return true;`);
    check('PE-09 reopening A succeeds', (await reopen(a.id)) === true);
    await showTimeline(a.id);
    check('PE-09 A shown again in its Timeline is the active Timeline', await until(async () => (await active()) === a.id), { active: await active() });
    report.notes.events_during_delete = await app(page, 'return (window.__deleteProbeEvents || []).slice(0, 12);');
    report.notes.opens_after_delete = await app(page, 'return window.__deleteProbeOpens;'); write();
    check('PE-09 the deleted B is never opened again', !report.notes.opens_after_delete.some((o) => o.group === b.id), report.notes.opens_after_delete.filter((o) => o.group === b.id).slice(0, 3));
    await page.screenshot({ path: path.join(OUT, 'a_back.png') });
} catch (error) {
    check('exception', false, String(error?.stack || error).slice(0, 900));
} finally {
    check('PE-09 no page error', report.errors.length === 0, report.errors.slice(0, 8));
    await close();
    const failed = report.checks.filter((c) => !c.ok);
    console.log(`project_delete_timeline: ${report.checks.length - failed.length}/${report.checks.length}`);
    process.exitCode = failed.length ? 1 : 0;
}
