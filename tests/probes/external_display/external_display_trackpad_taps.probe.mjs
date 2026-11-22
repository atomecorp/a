// R-212 — the Trackpad's taps on a project's text (user, 19 Nov. 2026: « deux fois pour sélectionner et déplacer, trois
// fois pour entrer dedans, comme tout trackpad »): a tap then a finger that slides moves the text, without opening it;
// three taps open it; two texts lassoed move together and stay selected (the Trackpad drops the first tap's click when
// the finger comes back to drag: ExternalDisplayTrackpad.swift). A finger held keeps the button down (« clic long maintenu, je drague, quand je relâche, ça lance
// l'outil »): the Mystic opens under it, the pointer slides onto a tool, the release opens it. The device's Trackpad is stood in for by its presses (`pad`) handed to the page's pointer.
// Run: node tests/probes/external_display/external_display_trackpad_taps.probe.mjs   (HEADLESS=0 to watch)
import { closeRubric, createReport, mysticPlates, openHome, sleep, waitMystic, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_trackpad_taps');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'desktop' });
const pad = (phase, x, y) => page.evaluate(e => window.__eveVirtualPointer(e), { phase, x, y, pad: true });
const tap = async (x, y) => { await pad('down', x, y); await sleep(40); await pad('up', x, y); await sleep(60); };

try {
    const projectId = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Trackpad taps');
        const id = String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
        await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id });
        return id;
    });
    await waitOn(page, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 30_000, 300);
    await page.evaluate(async () => (await import('/eVe/domains/rendering/project_work_mode_state.js')).setProjectWorkMode('edit'));
    const textId = await page.evaluate(async (pid) => {
        const result = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'PAD TEXT',
            text: 'Bonjour', left: 300, top: 260, width: 240, height: 80 });
        await window.eveToolBase.loadProjectAtomes(pid, { force: true, staleFirst: false });
        return String(result?.id || result?.atome_id || result?.ids?.[0] || '');
    }, projectId);
    check('texte créé', !!textId, textId);
    await page.evaluate(async () => (await import('/eVe/domains/rendering/external_display_pointer.js')).installExternalDisplayPointer(window));
    await sleep(2000);
    const place = () => page.evaluate(({ pid, id }) => {
        const node = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(n => String(n.id) === id);
        const r = document.getElementById('eve_surface_project').getBoundingClientRect();
        const b = node?.bounds || node?.frame || null;
        return b ? { x: r.left + Number(b.x ?? b.left) + Number(b.width) / 2, y: r.top + Number(b.y ?? b.top) + Number(b.height) / 2, b } : { node: node ? Object.keys(node) : null };
    }, { pid: projectId, id: textId });
    const editing = () => page.evaluate(async () => (await import('/eVe/domains/rendering/project_scene_text_edit_state.js')).getActiveProjectTextEdit()?.atomeId || '');

    // A finger held: the button stays down (the pad sends its press, and its release once the finger lifts).
    const ground = await page.evaluate(() => { const r = document.getElementById('eve_surface_project').getBoundingClientRect(); return { x: r.left + 150, y: r.top + 480, l: r.left, t: r.top }; });
    await pad('move', ground.x, ground.y);
    await pad('down', ground.x, ground.y);
    const heldOpen = await waitMystic(page, true);
    check('appui maintenu : le Mystic s’ouvre, le bouton toujours tenu', heldOpen.ok, heldOpen);
    const plates = await mysticPlates(page);
    const tool = plates.find(p => p.id === 'eve_bevy_ui_mystic_item_capture_0');
    const before = plates.map(p => p.id).join();
    if (tool) {
        const to = { x: ground.l + tool.x + tool.width / 2, y: ground.t + tool.y + tool.height / 2 };
        for (let i = 1; i <= 10; i += 1) { await pad('move', ground.x + (to.x - ground.x) * i / 10, ground.y + (to.y - ground.y) * i / 10); await sleep(30); }
        await pad('up', to.x, to.y);
    } else await pad('up', ground.x, ground.y);
    const picked = await waitOn(page, async (was) => { const root = window.eveBevyUiRuntime.state.trees.get('eve_bevy_ui_mystic')?.tree?.root;
        const ids = (root?.children || []).map(n => n.id).join(); return { ok: !!ids && ids !== was, ids }; }, before, 5000, 150);
    check('glisser sur Enregistrer puis relâcher : son outil s’ouvre', !!tool && picked.ok, { tool: tool?.id, picked });
    check('le Mystic se referme', await closeRubric(page));
    await sleep(800);

    const start = await place();
    note('texte', start);

    // A tap, then the finger back that slides: the text moves, it does not open (the pad sends no click for that tap).
    await pad('down', start.x, start.y);
    for (let i = 1; i <= 8; i += 1) { await pad('move', start.x + i * 15, start.y); await sleep(20); }
    await pad('up', start.x + 120, start.y);
    await sleep(800);
    const moved = await place();
    note('après le glisser', moved);
    check('un toucher puis glisser : le texte ne s’ouvre pas', !(await editing()));
    check('un toucher puis glisser : le texte se déplace', Number.isFinite(moved.x) && moved.x - start.x > 60, { from: start.x, to: moved.x });

    // Three taps: the text opens.
    await sleep(800);
    await tap(moved.x, moved.y); await tap(moved.x, moved.y); await tap(moved.x, moved.y);
    const opened = await waitOn(page, async (id) => { const a = (await import('/eVe/domains/rendering/project_scene_text_edit_state.js')).getActiveProjectTextEdit()?.atomeId; return { ok: a === id, a }; }, textId, 5000, 150);
    check('trois touchers : le texte s’ouvre', opened.ok, opened);

    // Two texts lassoed on the ground, then one dragged: both move, both stay selected.
    await page.mouse.click(ground.x + 400, ground.y); await sleep(800);
    const secondId = await page.evaluate(async (pid) => {
        const result = await window.eveToolBase.createAtome({ projectId: pid, parentId: pid, type: 'text', kind: 'text', name: 'PAD TEXT 2',
            text: 'Salut', left: 420, top: 380, width: 240, height: 80 });
        await window.eveToolBase.loadProjectAtomes(pid, { force: true, staleFirst: false });
        return String(result?.id || result?.atome_id || result?.ids?.[0] || '');
    }, projectId);
    await sleep(1500);
    const boxOf = (id) => page.evaluate(({ pid, id }) => { const n = (window.eveToolBase.getProjectSceneState(pid)?.projection?.virtual_scene?.nodes || []).find(x => String(x.id) === id); return n ? { x: n.bounds.x, y: n.bounds.y, width: n.bounds.width, height: n.bounds.height } : null; }, { pid: projectId, id });
    const selection = () => page.evaluate(async () => (await import('/eVe/intuition/runtime/selection_snapshot.js')).readSelectionSnapshot({ includeDom: true, filterToolLike: true })?.ids || []);
    const [one, two] = [await boxOf(textId), await boxOf(secondId)];
    const from = { x: ground.l + Math.min(one.x, two.x) - 40, y: ground.t + Math.min(one.y, two.y) - 40 };
    const to = { x: ground.l + Math.max(one.x + one.width, two.x + two.width) + 40, y: ground.t + Math.max(one.y + one.height, two.y + two.height) + 40 };
    await pad('move', from.x, from.y); await pad('down', from.x, from.y);
    for (let i = 1; i <= 10; i += 1) { await pad('move', from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10); await sleep(25); }
    await pad('up', to.x, to.y);
    await sleep(700);
    const lassoed = await selection();
    check('lasso du trackpad : les deux textes sélectionnés', lassoed.includes(textId) && lassoed.includes(secondId), lassoed);
    const grab = { x: ground.l + one.x + one.width / 2, y: ground.t + one.y + one.height / 2 };
    await pad('move', grab.x, grab.y); await pad('down', grab.x, grab.y);
    for (let i = 1; i <= 10; i += 1) { await pad('move', grab.x + i * 6, grab.y + i * 4); await sleep(25); }
    await pad('up', grab.x + 60, grab.y + 40);
    await sleep(900);
    const [oneAfter, twoAfter] = [await boxOf(textId), await boxOf(secondId)];
    check('glisser l’un : les deux se déplacent', oneAfter.x - one.x > 30 && twoAfter.x - two.x > 30, { one, oneAfter, two, twoAfter });
    const kept = await selection();
    check('au relâcher : les deux restent sélectionnés', kept.includes(textId) && kept.includes(secondId), kept);
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
