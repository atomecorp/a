// R-212 — no echo between the two pages (user, 20 Nov. 2026: an object moved on the iPhone moved late on the monitor,
// then moved back on the iPhone by itself: « une boucle d'écho qui repositionne mal »). A drag on one page (its frames
// committed one after the other) must not make the other page write anything back, and the object must stay where
// the drag left it on both pages.
// Run: node tests/probes/external_display/external_display_echo.probe.mjs
import { createReport, openHome, sleep, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_echo');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });

const watch = (target) => target.evaluate(() => {
    window.__echoLog = [];
    for (const name of ['squirrel:atome-updated', 'squirrel:atome-deleted', 'squirrel:atome-created']) {
        window.addEventListener(name, (e) => { const d = e.detail || {}; const p = d.properties || d.props || {};
            window.__echoLog.push({ t: Math.round(performance.now()), name, origin: d.origin || d.source || null, id: String(d.atome_id || d.id || ''), left: p.left ?? null, keys: Object.keys(p).slice(0, 8) }); });
    }
});
try {
    const projectId = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Écho');
        return String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
    });
    const follower = await page.context().newPage();
    await follower.setViewportSize({ width: 1280, height: 720 });
    const url = new URL(page.url()); url.searchParams.set('display', 'follower'); url.hash = '';
    await follower.goto(url.toString());
    check('la page de l’écran démarre', (await waitOn(follower, () => ({ ok: window.__eveBootPresentationReady === true && typeof window.__eveExternalDisplayReceive === 'function' }), null, 180_000, 500)).ok);
    await page.evaluate(async (id) => { await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id }); }, projectId);
    await page.evaluate(async () => (await import('/eVe/domains/rendering/project_work_mode_state.js')).setProjectWorkMode('edit'));
    check('l’écran suit dans le projet', (await waitOn(follower, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 60_000, 300)).ok);
    await sleep(3000);
    // As on the iPhone, where the screen's page has no account socket: the account's sync cut on both pages, only the
    // pages' own link is left.
    for (const target of [page, follower]) await target.evaluate(() => { const engine = window.Squirrel?.SyncEngine; engine?.disconnect?.({ reconnect: false }); engine.connect = () => null; });
    const left = (target, id) => target.evaluate(({ pid, id }) => {
        const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
        return n ? n.bounds.x : null; }, { pid: projectId, id });

    for (const [side, actor, viewer] of [['l’appareil', page, follower], ['l’écran', follower, page]]) {
        const id = await actor.evaluate(async (pid) => {
            const r = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'E', text: 'Écho', left: 60, top: 300, width: 200, height: 60 });
            return String(r?.id || r?.atome_id || r?.ids?.[0] || ''); }, projectId);
        await waitOn(viewer, async ({ pid, id }) => ({ ok: !!(window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id) }), { pid: projectId, id }, 8000, 100);
        await sleep(1500);
        await watch(actor); await watch(viewer);
        // A drag: its frames, 40 ms apart, each committed (as the move tool does).
        const t0 = await actor.evaluate(async ({ id, pid }) => {
            const start = Math.round(performance.now());
            for (let x = 70; x <= 250; x += 12) {
                await window.Atome.commitBatch([{ kind: 'set', atome_id: id, project_id: pid, tx_id: `tx_drag_${Date.now()}_${x}`, props: { left: x } }]);
                await new Promise(r => setTimeout(r, 40));
            }
            return Date.now(); }, { id, pid: projectId });
        const last = 250 - ((250 - 70) % 12);
        const reached = await waitOn(viewer, async ({ pid, id, last }) => { const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
            return { ok: Number(n?.bounds?.x) === last, x: n?.bounds?.x, at: Date.now() }; }, { pid: projectId, id, last }, 10_000, 20);
        const delay = reached.ok ? reached.at - t0 : null;
        note(`${side} : délai entre la fin du glisser et la dernière position sur l'autre page`, { ms: delay });
        check(`glissé sur ${side} : l'autre page suit en moins de 500 ms`, delay != null && delay < 500, { ms: delay });
        await sleep(5000);
        const logs = { actor: await actor.evaluate(() => window.__echoLog), viewer: await viewer.evaluate(() => window.__echoLog) };
        const viewerWrites = logs.viewer.filter(e => e.id === id && e.origin === 'commit');
        const actorHeard = logs.actor.filter(e => e.id === id && e.origin !== 'commit');
        note(`${side} : écritures de l'autre page`, viewerWrites.slice(0, 10));
        note(`${side} : reçus en retour par la page qui glisse`, actorHeard.slice(0, 10));
        const viaLink = logs.viewer.filter(e => e.id === id && e.origin === 'external_display');
        note(`${side} : origines reçues par l'autre page`, [...new Set(logs.viewer.filter(e => e.id === id).map(e => e.origin))]);
        check(`glissé sur ${side} : l'autre page l'apprend par le lien des deux pages, sans serveur`, viaLink.length > 0, { count: viaLink.length });
        check(`glissé sur ${side} : l'autre page n'écrit rien en retour`, viewerWrites.length === 0, { count: viewerWrites.length });
        check(`glissé sur ${side} : l'autre page arrive à la dernière position`, reached.ok, reached);
        const after = { actor: await left(actor, id), viewer: await left(viewer, id) };
        check(`glissé sur ${side} : 5 s après, l'objet est resté où le glisser l'a laissé, sur les deux pages`, after.actor === last && after.viewer === last, { after, last });
    }
    // A move shows on the other page while the finger moves: the gesture's frames go over the link, before any commit.
    for (const [side, actor, viewer] of [['l’appareil', page, follower], ['l’écran', follower, page]]) {
        const id = await actor.evaluate(async (pid) => {
            const r = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'L', text: 'Direct', left: 50, top: 420, width: 200, height: 60 });
            return String(r?.id || r?.atome_id || r?.ids?.[0] || ''); }, projectId);
        await waitOn(viewer, async ({ pid, id }) => ({ ok: !!(window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id) }), { pid: projectId, id }, 8000, 100);
        await sleep(800);
        const seen = [];
        for (const x of [90, 130, 170]) {
            const t0 = await actor.evaluate(async ({ id, pid, x }) => {
                (await import('/atome/src/squirrel/apis/unified/atome_change_signal.js')).dispatchAtomeFrame(window, { atome_id: id, project_id: pid, gesture_id: 'g_live', props: { left: x } });
                return Date.now(); }, { id, pid: projectId, x });
            const r = await waitOn(viewer, async ({ pid, id, x }) => { const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(n => String(n.id) === id);
                return { ok: Number(n?.bounds?.x) === x, at: Date.now() }; }, { pid: projectId, id, x }, 2000, 10);
            seen.push(r.ok ? r.at - t0 : null);
        }
        note(`${side} : délai de chaque image du geste sur l'autre page (ms)`, seen);
        check(`geste sur ${side} : l'autre page suit chaque image en direct, avant tout commit`, seen.every(ms => ms != null && ms < 200), { seen });
    }
    // A third machine on the account (Tauri, a person sharing live): its change reaches the device's page from the
    // account (`ws/sync`); the screen's page, with no account socket (the iPhone's), gets it from the device's page.
    const remoteId = await page.evaluate(async (pid) => {
        const r = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'R', text: 'Ailleurs', left: 40, top: 500, width: 200, height: 60 });
        return String(r?.id || r?.atome_id || r?.ids?.[0] || ''); }, projectId);
    await waitOn(follower, async ({ pid, id }) => ({ ok: !!(window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id) }), { pid: projectId, id: remoteId }, 8000, 100);
    await sleep(800);
    await page.evaluate(({ id, pid }) => window.dispatchEvent(new CustomEvent('squirrel:atome-updated', { detail: { id, atome_id: id, project_id: pid, atome_type: 'text',
        properties: { left: 333 }, delete_keys: [], source: 'realtime', origin: 'ws/sync', durable: true } })), { id: remoteId, pid: projectId });
    const relayed = await waitOn(follower, async ({ pid, id }) => { const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id);
        return { ok: Number(n?.bounds?.x) === 333, x: n?.bounds?.x }; }, { pid: projectId, id: remoteId }, 3000, 50);
    check('changé sur un troisième poste du compte : l’écran le montre, par la page de l’appareil', relayed.ok, relayed);
    await sleep(1500);
    const bounced = (await page.evaluate(() => window.__echoLog)).filter(e => e.id === remoteId && e.origin === 'external_display');
    check('ce changement ne revient pas de l’écran vers l’appareil', bounced.length === 0, { count: bounced.length });
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
