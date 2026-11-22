// R-212 — the side rail lost after a relaunch (user, 19 Nov. 2026: « un problème récurrent… doit être résolu une fois
// pour toutes »): the project came back in Consultation, its mode written only at a close the app killed never made.
// The real app, on an isolated server: a mode chosen is on the project's record at once; a page reopened without a
// clean close opens in that mode; an old close note gives way to a later choice.
// Run: node tests/probes/external_display/work_mode_kept_on_change.probe.mjs   (HEADLESS=0 to watch)
import { createReport, openHome, sleep, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('work_mode_kept_on_change');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });
const recordMode = (projectId) => page.evaluate(async (id) => (await import('/eVe/domains/rendering/project_work_mode_persistence.js')).readPersistedProjectWorkMode(id), projectId);
const setMode = (mode) => page.evaluate(async (m) => (await import('/eVe/domains/rendering/project_work_mode_state.js')).setProjectWorkMode(m), mode);
const liveMode = (projectId) => page.evaluate(async (id) => (await import('/eVe/domains/rendering/project_work_mode_state.js')).getProjectWorkMode(id), projectId);
const openProject = (projectId) => page.evaluate(async (id) => (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id }), projectId);
const waitProject = (projectId) => waitOn(page, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 60_000, 300);

try {
    const projectId = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Mode gardé');
        return String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
    });
    await openProject(projectId);
    check('projet ouvert', (await waitProject(projectId)).ok);
    await sleep(1500);

    // Consultation chosen, then Edition: each is on the record at once, no close needed.
    note('consultation', await setMode('consultation'));
    const c = await waitOn(page, async (id) => { const m = await (await import('/eVe/domains/rendering/project_work_mode_persistence.js')).readPersistedProjectWorkMode(id); return { ok: m === 'consultation', m }; }, projectId, 8_000, 200);
    check('Consultation choisie : écrite aussitôt sur le projet', c.ok, c);
    note('edit', await setMode('edit'));
    const e = await waitOn(page, async (id) => { const m = await (await import('/eVe/domains/rendering/project_work_mode_persistence.js')).readPersistedProjectWorkMode(id); return { ok: m === 'edit', m }; }, projectId, 8_000, 200);
    check('Édition choisie : écrite aussitôt sur le projet', e.ok, e);

    // An old close note (the app hidden while in Consultation earlier), then the page back on screen: the note goes.
    await page.evaluate((id) => localStorage.setItem('eve_work_mode_pending_close', JSON.stringify({ [id]: 'consultation' })), projectId);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const cleared = await waitOn(page, (id) => ({ ok: !(id in JSON.parse(localStorage.getItem('eve_work_mode_pending_close') || '{}')) }), projectId, 8_000, 200);
    check('page revenue à l’écran : la vieille note « Consultation » s’efface', cleared.ok, cleared);

    // A relaunch without a clean close: no page-close handler runs (as when iOS or Xcode kills the app).
    await page.evaluate(() => { window.addEventListener('pagehide', (event) => event.stopImmediatePropagation(), true); });
    await page.reload();
    await waitOn(page, () => ({ ok: window.__eveBootPresentationReady === true && typeof window.Atome?.commit === 'function' }), null, 120_000, 500);
    await openProject(projectId);
    check('rouvert après une relance brutale', (await waitProject(projectId)).ok);
    await sleep(2500);
    const after = await liveMode(projectId);
    check('rouvert en Édition (le mode choisi), pas en Consultation', after === 'edit', { after, record: await recordMode(projectId) });
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
