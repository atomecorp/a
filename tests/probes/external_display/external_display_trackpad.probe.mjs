// R-212 — the Trackpad of a connected screen (design validated by the user, 19 Nov. 2026): its case is in the rail
// only while a screen is connected, right above Play; it opens the host's pad, telling it the two cells the page keeps
// (the logo bottom left, a panel's own Close bottom right, on the pad's plain ground); the usual Close of Atome closes it; the host closing it (the
// screen gone) takes the Close away. The host is stood in for by a recorder of its messages.
// Run: node tests/probes/external_display/external_display_trackpad.probe.mjs   (HEADLESS=0 to watch)
import { createReport, openHome, sleep, waitOn } from '../../helpers/probe_home.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget } from '../molecule_ui_acceptance_support.mjs';

const R = createReport('external_display_trackpad');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });
const RAIL = 'eve_bevy_panel_atome_contextual_edit';
const CLOSE_TREE = 'eve_bevy_panel_external_display_trackpad_close';
const rail = (nodeId, timeoutMs = 8000) => awaitBevyUiNodeTarget(page, { nodeId, treeId: RAIL }, { timeoutMs });
const sent = () => page.evaluate(() => window.__trackpadSent.slice());
const closeTree = () => page.evaluate((id) => window.eveBevyUiRuntime?.state?.trees?.has(id) === true, CLOSE_TREE);

const ANCHOR = 'eve_bevy_panel_external_display_trackpad_anchor';
try {
    // The home: no rail; a screen connected, the case is there all the same, in the rail's column right above the band.
    await page.evaluate(async () => {
        window.__trackpadSent = [];
        window.webkit = { messageHandlers: { swiftBridge: { postMessage: (m) => window.__trackpadSent.push(JSON.parse(JSON.stringify(m))) } } };
        (await import('/eVe/domains/rendering/external_display_screen.js')).installExternalDisplayScreen(window);
        (await import('/eVe/domains/rendering/external_display_trackpad.js')).installExternalDisplayTrackpad(window);
    });
    await sleep(800);
    check('accueil, sans écran : pas de case Trackpad', !(await page.evaluate((id) => window.eveBevyUiRuntime?.state?.trees?.has(id) === true, ANCHOR)));
    await page.evaluate(() => window.__eveExternalDisplayScreen({ connected: true, trackpad: true }));
    const homeCase = await awaitBevyUiNodeTarget(page, { nodePrefix: `${ANCHOR}_tool`, treeId: ANCHOR }, { timeoutMs: 8000 });
    const homeBox = await page.evaluate((id) => { const p = window.eveBevyUiRuntime.state.trees.get(id)?.tree?.root?.style; return p && { x: p.position[0], y: p.position[1], width: p.size[0] }; }, ANCHOR);
    const surfaceWidth = await page.evaluate(() => document.getElementById('eve_surface_project').getBoundingClientRect().width);
    note('case de l’accueil', homeBox);
    check('accueil, écran branché : la case Trackpad est là, touchable, à droite', !!homeCase && !!homeBox && homeBox.x > surfaceWidth / 2, { homeBox });
    await clickCanvasTarget(page, homeCase);
    const homeOpen = await waitOn(page, () => { const m = window.__trackpadSent.at(-1)?.message; return { ok: m?.type === 'trackpad' && m.open === true }; }, null, 8000, 150);
    check('accueil : la case ouvre le trackpad', homeOpen.ok);
    await page.evaluate(() => { window.__eveExternalDisplayTrackpad({ open: false }); window.__eveExternalDisplayScreen({ connected: false }); });
    check('écran débranché : la case de l’accueil s’en va', (await waitOn(page, (id) => ({ ok: window.eveBevyUiRuntime?.state?.trees?.has(id) !== true }), ANCHOR, 8000, 150)).ok);

    const projectId = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Trackpad');
        const id = String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
        await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id });
        return id;
    });
    await waitOn(page, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 30_000, 300);
    await page.evaluate(async () => (await import('/eVe/domains/rendering/project_work_mode_state.js')).setProjectWorkMode('edit'));
    // The Timeline, where Play leads the rail's base (as on the user's iPhone).
    await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_mode_state.js')).setProjectViewMode('timeline'));
    await sleep(2500);
    const play = await rail('atome_contextual_tool_container_play', 15_000);
    check('Lecture dans la bande latérale', !!play, play);
    check('sans écran branché : pas de case Trackpad', !(await rail('atome_contextual_tool_external_display_trackpad', 1500)));

    // The host says a screen is connected and offers its pad.
    await page.evaluate(() => window.__eveExternalDisplayScreen({ connected: true, trackpad: true }));
    const pad = await rail('atome_contextual_tool_external_display_trackpad');
    check('écran branché : la case Trackpad paraît', !!pad, pad);
    await sleep(1200);
    check('la bande la montre : pas de seconde case par-dessus', !(await page.evaluate((id) => window.eveBevyUiRuntime?.state?.trees?.has(id) === true, ANCHOR)));
    const playBox = (await rail('atome_contextual_tool_container_play'))?.hit?.box;
    const padBox = pad?.hit?.box;
    note('cases', { play: playBox, trackpad: padBox });
    const step = playBox && padBox ? playBox.y - padBox.y : NaN;
    check('juste au-dessus de Lecture (même colonne, la case d’au-dessus)', !!playBox && !!padBox
        && Math.abs(playBox.x - padBox.x) < 2 && step > 0 && step < playBox.height * 1.5, { step });

    // The case: the host is asked to open its pad, with the two cells the page keeps; the usual Close is laid.
    await clickCanvasTarget(page, pad);
    const opened = await waitOn(page, () => { const m = window.__trackpadSent.at(-1)?.message; return { ok: m?.type === 'trackpad' && m.open === true, m }; }, null, 8000, 150);
    check('la case ouvre le trackpad de l’app', opened.ok, opened);
    const holes = opened.m?.holes || [];
    const width = await page.evaluate(() => document.getElementById('eve_surface_project').getBoundingClientRect().width);
    check('deux cases laissées à la page : le logo en bas à gauche, le Fermer en bas à droite, sans voile', holes.length === 2
        && holes[0].x < width / 2 && holes[1].x > width / 2 && holes[0].veil === 0 && holes[1].veil === 0
        && Math.abs(holes[0].y - holes[1].y) < 1, holes);
    check('le Fermer d’Atome est posé', (await waitOn(page, async (id) => ({ ok: window.eveBevyUiRuntime?.state?.trees?.has(id) === true }), CLOSE_TREE, 8000, 150)).ok);
    const lit = await waitOn(page, async () => { const t = await import('/eVe/domains/rendering/external_display_trackpad.js'); return { ok: t.isExternalDisplayTrackpadOpen() === true }; }, null, 4000, 150);
    check('ouvert', lit.ok);

    // The Close, drawn in the bottom right cell; the pad takes its touch (in that cell the band's own tool answers the
    // page), so the host is told the cell closes it.
    const closeBox = await page.evaluate((id) => { const p = window.eveBevyUiRuntime.state.trees.get(id)?.tree?.root?.style; return p && { x: p.position[0], y: p.position[1], width: p.size[0], height: p.size[1] }; }, CLOSE_TREE);
    const surfaceAt = await page.evaluate(() => { const r = document.getElementById('eve_surface_project').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    check('le Fermer est dessiné dans la case laissée en bas à droite', !!closeBox && Math.abs(surfaceAt.x + closeBox.x - holes[1].x) < 1
        && Math.abs(surfaceAt.y + closeBox.y - holes[1].y) < 1 && Math.abs(closeBox.width - holes[1].width) < 1, { closeBox, hole: holes[1] });
    check('cette case, l’app la prend pour fermer ; celle du logo va à la page', holes[1].close === true && holes[0].close === false, holes);
    // A panel's own Close (the band's Back cell), on the pad's plain ground: nothing of the band shows through its glass.
    const closeKinds = await page.evaluate((id) => {
        const root = window.eveBevyUiRuntime.state.trees.get(id)?.tree?.root;
        const ground = root?.children?.find(n => /_ground$/.test(n.id));
        const ids = []; const visit = (n) => { if (!n) return; ids.push(n.id); (n.children || []).forEach(visit); }; visit(root);
        return { ground: ground?.style?.background || null, ids };
    }, CLOSE_TREE);
    check('le Fermer est l’outil Fermer des panneaux, sur le fond plein du trackpad', Array.isArray(closeKinds.ground) && closeKinds.ground[3] === 1
        && closeKinds.ids.some(id => /_close/.test(id) && /_icon$/.test(id)), closeKinds);
    await page.screenshot({ path: `${process.env.SHOT_DIR || '/tmp'}/trackpad_close.png`, clip: { x: holes[1].x - 80, y: holes[1].y - 80, width: holes[1].width + 80, height: holes[1].height + 80 } }).catch(() => {});

    // The case again: the pad closes, the host is told.
    await clickCanvasTarget(page, await rail('atome_contextual_tool_external_display_trackpad'));
    const shut = await waitOn(page, () => { const m = window.__trackpadSent.at(-1)?.message; return { ok: m?.type === 'trackpad' && m.open === false, m }; }, null, 8000, 150);
    check('la case refermée : l’app ferme son trackpad', shut.ok, shut);
    check('refermé : le Fermer s’en va', (await waitOn(page, (id) => ({ ok: window.eveBevyUiRuntime?.state?.trees?.has(id) !== true }), CLOSE_TREE, 8000, 150)).ok);

    // Opened again, then closed by the host (its Close touched, or the screen gone): the page follows, without telling
    // the host back.
    await clickCanvasTarget(page, await rail('atome_contextual_tool_external_display_trackpad'));
    await waitOn(page, (id) => ({ ok: window.eveBevyUiRuntime?.state?.trees?.has(id) === true }), CLOSE_TREE, 8000, 150);
    const before = (await sent()).length;
    await page.evaluate(() => { window.__eveExternalDisplayTrackpad({ open: false }); window.__eveExternalDisplayScreen({ connected: false }); });
    check('fermé par l’app : le Fermer s’en va', (await waitOn(page, (id) => ({ ok: window.eveBevyUiRuntime?.state?.trees?.has(id) !== true }), CLOSE_TREE, 8000, 150)).ok);
    check('fermé par l’app : rien ne lui est renvoyé', (await sent()).length === before);
    await sleep(800);
    check('écran débranché : la case Trackpad s’en va', !(await rail('atome_contextual_tool_external_display_trackpad', 1500)));
    check('Lecture reste', !!(await rail('atome_contextual_tool_container_play')));

    // The project's ground (natural view), a screen connected: the case is in that rail too, at its base.
    await page.evaluate(async () => {
        await (await import('/eVe/domains/rendering/project_view_mode_state.js')).setProjectViewMode('natural');
        window.__eveExternalDisplayScreen({ connected: true, trackpad: true });
    });
    await sleep(2000);
    const r = await page.locator('#eve_surface_project').boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + 200);
    const ground = await rail('atome_contextual_tool_external_display_trackpad', 10_000);
    const lowest = await page.evaluate((treeId) => {
        let low = null;
        const visit = (n) => { if (!n) return; if (/^atome_contextual_tool_[a-z_]+$/.test(n.id) && !/_(background|label|icon|corner)$/.test(n.id)) {
            const y = Number(n.style?.position?.[1]); if (Number.isFinite(y) && (!low || y > low.y)) low = { id: n.id, y }; }
            (n.children || []).forEach(visit); };
        visit(window.eveBevyUiRuntime.state.trees.get(treeId)?.tree?.root);
        return low;
    }, RAIL);
    check('vue naturelle : la case Trackpad est dans la bande, à sa base', !!ground && lowest?.id === 'atome_contextual_tool_external_display_trackpad', { lowest });
    check('pas de Fermer orphelin', !(await closeTree()));
    const railBox = ground?.hit?.box;

    // Back to the Dashboard (the product menu's Dashboard tool): the project's rail stays mounted behind it, hidden; the
    // case is there all the same, in the very cell it takes at the rail's base (user: « la même position… dans le
    // dashboard »).
    await page.evaluate(async () => {
        const { openWorkspaceDashboardAndMainMenu } = await import('/eVe/intuition/tools/user_workspace_surface_runtime.js');
        await openWorkspaceDashboardAndMainMenu({ source: 'r212_probe' });
    });
    await waitOn(page, () => ({ ok: window.__eveWorkspaceMode?.mode === 'dashboard' }), null, 30_000, 300);
    const dashCase = await awaitBevyUiNodeTarget(page, { nodePrefix: `${ANCHOR}_tool`, treeId: ANCHOR }, { timeoutMs: 8000 });
    const dashBox = dashCase?.hit?.box;
    note('cases', { rail: railBox, dashboard: dashBox });
    check('Dashboard, après un projet : la case Trackpad est là, touchable', !!dashCase);
    check('Dashboard : à la même place que dans la bande du projet', !!railBox && !!dashBox
        && Math.abs(railBox.x - dashBox.x) < 2 && Math.abs(railBox.y - dashBox.y) < 2, { railBox, dashBox });
    const hitBefore = await page.evaluate(({ x, y }) => { const h = window.eveBevyUiRuntime.hitTestAtClientPoint({ surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y }); return h && { nodeId: h.nodeId, treeId: h.treeId }; }, dashCase);
    await clickCanvasTarget(page, dashCase);
    const dashOpen = await waitOn(page, async () => { const m = window.__trackpadSent.map(e => e.message).filter(e => e?.type === 'trackpad').at(-1);
        return { ok: m?.open === true, m }; }, null, 8000, 150);
    check('Dashboard : la case ouvre le trackpad', dashOpen.ok, { ...dashOpen, hitBefore });
    // A panel over the rail's column (the band's Projects): the rail hides behind it, the case does not take its place
    // over the panel's own tool (user, 19 Nov. 2026: « je peux pas fermer la fenêtre… le bouton trackpad est devant »).
    const cellAt = (box) => page.evaluate((b) => { const r = document.getElementById('eve_surface_project').getBoundingClientRect();
        const h = window.eveBevyUiRuntime.hitTestAtClientPoint({ surface: document.getElementById('eve_surface_project'), clientX: r.left + b.x + b.width / 2, clientY: r.top + b.y + b.height / 2 });
        return h && { treeId: h.treeId, nodeId: h.nodeId, layer: h.layer }; }, box);
    // From the project again.
    await page.evaluate(async (id) => (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: id }), projectId);
    await waitOn(page, (id) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === id }), projectId, 30_000, 300);
    await sleep(1500);
    // The band's Organize opens the projects' list (the Mystic), over the rail's column.
    const organize = await awaitBevyUiNodeTarget(page, { nodeId: 'eve_bevy_ui_main_menu_tool_organize', treeId: 'eve_bevy_ui_main_menu' }, { timeoutMs: 8000 });
    check('la bande a son outil Organiser', !!organize);
    await clickCanvasTarget(page, organize);
    const panelOver = await waitOn(page, async (args) => { const r = document.getElementById('eve_surface_project').getBoundingClientRect();
        const h = window.eveBevyUiRuntime.hitTestAtClientPoint({ surface: document.getElementById('eve_surface_project'), clientX: r.left + args.x, clientY: r.top + args.y });
        return { ok: !!h && h.treeId !== args.rail && !String(h.treeId).startsWith(args.anchor.replace(/_anchor$/, '')), h: h && { treeId: h.treeId, nodeId: h.nodeId } }; },
        { x: railBox.x + railBox.width / 2, y: railBox.y + railBox.height / 2, rail: RAIL, anchor: ANCHOR }, 8000, 200);
    check('liste des projets ouverte : une de ses cases est dans la cellule de la case Trackpad', panelOver.ok, panelOver);
    await sleep(1200);
    check('liste ouverte : pas de case Trackpad par-dessus', !(await page.evaluate((id) => window.eveBevyUiRuntime?.state?.trees?.has(id) === true, ANCHOR)));
    note('sous la cellule de la case, panneau ouvert', await cellAt(railBox));
    check('la case de la liste, dans cette cellule, est touchable (rien devant elle)', /^eve_bevy_ui_mystic/.test(String((await cellAt(railBox))?.treeId)));
    // The list closed (as the Mystic closes), the case comes back to its cell (we are on the Dashboard).
    await page.evaluate(async () => (await import('/eVe/intuition/mystic/index.js')).closeMysticMenu());
    const listGone = await waitOn(page, () => ({ ok: !window.eveBevyUiRuntime.state.trees.has('eve_bevy_ui_mystic') || window.eveBevyUiRuntime.state.suspendedTrees?.has?.('eve_bevy_ui_mystic') }), null, 8000, 200);
    note('liste refermée', { ok: listGone.ok, mode: await page.evaluate(() => window.__eveWorkspaceMode?.mode) });
    const caseBack = await awaitBevyUiNodeTarget(page, { nodePrefix: `${ANCHOR}_tool`, treeId: ANCHOR }, { timeoutMs: 8000 });
    check('liste fermée : la case Trackpad revient, à la même cellule', !!caseBack && Math.abs(caseBack.hit.box.x - railBox.x) < 2 && Math.abs(caseBack.hit.box.y - railBox.y) < 2, caseBack?.hit?.box);

} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
