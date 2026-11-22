// R-212 — what one page does, the other shows, at once, both ways (user, 19 Nov. 2026: two texts deleted on the
// monitor took a minute to leave the iPhone; « faut que ce soit une réparation globale »): a creation, a move, a
// deletion (into the black hole) and a restore made on the screen's page reach the device's page, and the same made on
// the device's page reach the screen's. The device's page (a phone) and the screen's (`?display=follower`) in the same
// browser and account, on an isolated server.
// Run: node tests/probes/external_display/external_display_cross_page_changes.probe.mjs   (HEADLESS=0 to watch)
import { createReport, openHome, sleep, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_cross_page_changes');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });
// A change is "at once" under this (a move takes 0.2 s; the project's reload, which hid the bug, 30 s and more).
const AT_ONCE_MS = 4000;

try {
    const projectId = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Deux pages');
        return String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
    });
    const follower = await page.context().newPage();
    await follower.setViewportSize({ width: 1280, height: 720 });
    const url = new URL(page.url()); url.searchParams.set('display', 'follower'); url.hash = '';
    await follower.goto(url.toString());
    const booted = await waitOn(follower, () => ({ ok: window.__eveBootPresentationReady === true && typeof window.__eveExternalDisplayReceive === 'function' }), null, 180_000, 500);
    check('la page de l’écran démarre', booted.ok);
    await page.evaluate(async (id) => { await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id }); }, projectId);
    await page.evaluate(async () => (await import('/eVe/domains/rendering/project_work_mode_state.js')).setProjectWorkMode('edit'));
    const inProject = await waitOn(follower, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 60_000, 300);
    check('l’écran suit dans le projet', inProject.ok);
    await sleep(3000);
    // As on the iPhone (the screen's page has no account socket): only the two pages' own link is left.
    for (const target of [page, follower]) await target.evaluate(() => { const engine = window.Squirrel?.SyncEngine; engine?.disconnect?.({ reconnect: false }); if (engine) engine.connect = () => null; });

    const node = (target, id) => target.evaluate(({ pid, id }) => {
        const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
        return n ? { x: n.bounds.x, y: n.bounds.y } : null;
    }, { pid: projectId, id });
    const shows = (target, id, wanted) => waitOn(target, async ({ pid, id, wanted }) => {
        const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
        return { ok: wanted === 'gone' ? !n : (!!n && (wanted === true || Number(n.bounds.x) === wanted)), x: n?.bounds?.x ?? null };
    }, { pid: projectId, id, wanted }, AT_ONCE_MS, 100);

    for (const [side, actor, viewer] of [['l’écran', follower, page], ['l’appareil', page, follower]]) {
        // Created on one page.
        const id = await actor.evaluate(async (pid) => {
            const r = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'X', text: 'Deux pages', left: 60, top: 140, width: 200, height: 60 });
            return String(r?.id || r?.atome_id || r?.ids?.[0] || '');
        }, projectId);
        const created = await shows(viewer, id, true);
        check(`créé sur ${side} : l’autre page le montre aussitôt`, created.ok, created);
        await sleep(600);
        // Moved.
        await actor.evaluate(async ({ id, pid }) => window.Atome.commitBatch([{ kind: 'set', atome_id: id, project_id: pid, tx_id: `tx_probe_${Date.now()}`, props: { left: 150 } }]), { id, pid: projectId });
        const moved = await shows(viewer, id, 150);
        check(`déplacé sur ${side} : l’autre page le déplace aussitôt`, moved.ok, moved);
        await sleep(600);
        // Other tools' changes: its size, its colour, its words.
        const record = (target) => target.evaluate(({ pid, id }) => {
            const scene = window.eveToolBase.getProjectSceneState(pid);
            const n = (scene?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
            const r = (scene?.records ? [...(scene.records.values?.() || scene.records)] : []).find(x => String(x?.id ?? x?.atome_id) === id);
            return { width: n?.bounds?.width ?? null, props: r?.properties || null };
        }, { pid: projectId, id });
        await actor.evaluate(async ({ id, pid }) => window.Atome.commitBatch([{ kind: 'set', atome_id: id, project_id: pid, tx_id: `tx_probe_${Date.now()}`,
            props: { width: 260, color: '#ff3300', text: 'Changé ailleurs' } }]), { id, pid: projectId });
        const changed = await waitOn(viewer, async ({ pid, id }) => {
            const scene = window.eveToolBase.getProjectSceneState(pid);
            const n = (scene?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
            const all = scene?.records ? [...(scene.records.values?.() || scene.records)] : [];
            const p = all.find(x => String(x?.id ?? x?.atome_id) === id)?.properties || {};
            const text = JSON.stringify(p);
            return { ok: Number(n?.bounds?.width) === 260 && /ff3300/i.test(text) && /Changé ailleurs/.test(text), width: n?.bounds?.width, color: p.color, hasText: /Changé ailleurs/.test(text) };
        }, { pid: projectId, id }, AT_ONCE_MS, 100);
        check(`taille, couleur et texte changés sur ${side} : l’autre page les montre aussitôt`, changed.ok, changed);
        await sleep(600);
        // Deleted (the Delete tool: into the black hole).
        const deleted = await actor.evaluate(async (id) => { const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
            const r = await invokeToolGateway({ tool_id: 'ui.delete.selection', action: 'pointer.click', input: { selection_ids: [id] }, source: { type: 'probe' } });
            return (r?.result?.result || r?.result || r)?.ok === true; }, id);
        check(`supprimé sur ${side}`, deleted);
        const gone = await shows(viewer, id, 'gone');
        check(`supprimé sur ${side} : l’autre page l’enlève aussitôt`, gone.ok, gone);
        await sleep(600);
        // Restored from the black hole.
        await actor.evaluate(async ({ id, pid }) => window.eveDeleteApi.restoreAtomeToProject(id, pid), { id, pid: projectId });
        const back = await shows(viewer, id, 150);
        check(`restauré sur ${side} : l’autre page le remontre aussitôt, à sa place`, back.ok, back);
        const home = await shows(actor, id, 150);
        check(`restauré sur ${side} : à sa place sur cette page aussi`, home.ok, home);
        note(`${side} : état`, { actor: await actor.evaluate(async (id) => (await window.Atome.getStateCurrent(id))?.properties?.left, id),
            viewer: await viewer.evaluate(async (id) => (await window.Atome.getStateCurrent(id))?.properties?.left, id) });
        await sleep(600);
    }
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
