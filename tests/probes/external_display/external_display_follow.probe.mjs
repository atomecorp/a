// R-212 — connected screens, the real app: the device's page (a phone, 430×932) and the page a connected screen
// shows (1920×1080, `?display=follower`) in the same browser and account, on an isolated server.
// Run: node tests/probes/external_display/external_display_follow.probe.mjs   (HEADLESS=0 to watch)
import fs from 'node:fs';
import path from 'node:path';
import { createReport, openHome, openTile, readHome, sleep, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_follow');
const { check, note, OUT, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });
const followerErrors = [];
const shoot = async (target, label) => fs.writeFileSync(path.join(OUT, `${label}.png`), await target.screenshot());
// The home's bottom band laid in its tree: every node the band draws is named after the search field
// (`${fieldId}_record`, `_microphone`, `_root`…, dashboard_footer_navigation.js), so their ids are listed.
const bandLaid = target => target.evaluate(async () => {
    const runtime = (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime();
    const instance = (window.eveMatrixModules?.list?.() || []).find(entry => entry.active && entry.tree_id);
    const tree = instance && window.eveBevyUiRuntime.state.trees.get(instance.tree_id)?.tree;
    const fieldId = runtime?.inspect?.().fieldId || '';
    const ids = [];
    const walk = node => { if (!node) return; if (fieldId && String(node.id || '').startsWith(fieldId)) ids.push(String(node.id).slice(fieldId.length) || 'field'); (node.children || []).forEach(walk); };
    walk(tree?.root);
    return { laid: ids.length > 0, ids };
});

try {
    // The follower: the same address, its role named, at a television's size.
    const follower = await page.context().newPage();
    follower.on('pageerror', error => followerErrors.push(`pageerror ${String(error?.message || error).slice(0, 300)}`));
    follower.on('console', message => { if (message.type() === 'error') followerErrors.push(message.text().slice(0, 300)); });
    await follower.setViewportSize({ width: 1920, height: 1080 });
    const url = new URL(page.url()); url.searchParams.set('display', 'follower'); url.hash = '';
    await follower.goto(url.toString());
    // Every place the screen's page receives, for the report.
    await follower.addInitScript(() => { window.__probePlaces = []; const channel = new BroadcastChannel('eve.external_display.v1');
        channel.onmessage = event => window.__probePlaces.push({ t: Math.round(performance.now()), ...event.data }); });
    await follower.reload();
    const booted = await waitOn(follower, () => ({ ok: window.__eveBootPresentationReady === true && typeof window.__eveExternalDisplayReceive === 'function' }), null, 180_000, 500);
    check('la page de l’écran démarre et suit', booted.ok, booted);
    const deviceBefore = await page.evaluate(() => localStorage.getItem('eve.dashboard.left.v1'));

    const followerHome = () => readHome(follower);
    let H = await waitOn(follower, async () => { const r = await (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime(); return { ok: !!r?.inspect?.().active }; }, null, 60_000, 500);
    check('écran : le Dashboard est ouvert', H.ok, H);
    await sleep(2500);
    H = await followerHome();
    const fBand = await bandLaid(follower), dBand = await bandLaid(page);
    check('écran : aucune bande (champ, outils, assistant au coin)', H.ok && !fBand.laid && !(H.inspect?.docked && H.cells.atom?.drawn), { fBand, atom: H.cells?.atom, docked: H.inspect?.docked });
    check('téléphone : sa bande reste', dBand.laid, dBand);
    await shoot(follower, '1_ecran_accueil'); await shoot(page, '1_telephone_accueil');

    // The device opens a rubric: the screen goes there; back home: the screen too.
    const opened = await openTile(page, 'contacts');
    check('téléphone : rubrique Contacts ouverte', opened.opened);
    const fRubric = await waitOn(follower, async () => { const r = (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime(); const i = r?.inspect?.(); return { ok: i?.shownRubric === 'contacts', shownRubric: i?.shownRubric }; }, null, 20_000);
    check('écran : même rubrique', fRubric.ok, fRubric);
    await sleep(1200); await shoot(follower, '2_ecran_contacts');
    // The rubric's field (the Mystic's filter, the band's own field) is the device's: none on the screen.
    const filterNode = target => target.evaluate(() => { const tree = window.eveBevyUiRuntime.state.trees.get('eve_bevy_ui_mystic')?.tree;
        const find = node => !!node && (String(node.id) === 'eve_bevy_ui_mystic_filter' || (node.children || []).some(find)); return find(tree?.root); });
    check('écran : la rubrique sans champ de recherche', !(await filterNode(follower)));
    // Back home as ⌂ does it (the rubric is laid in place on the home: no Mystic centre to touch).
    await page.evaluate(async () => (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime().toRoot());
    const fHome = await waitOn(follower, async () => { const r = (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime(); const i = r?.inspect?.(); return { ok: !i?.shownRubric, shownRubric: i?.shownRubric }; }, null, 20_000);
    check('écran : revenu à l’accueil', fHome.ok, fHome);

    // The device opens a project with objects: the screen opens it in the device's work mode, its tools included
    // (user, 19 Nov. 2026: « en mode dual, ils doivent être des deux côtés »).
    const created = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Écran externe');
        const projectId = String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
        const shapes = Array.from({ length: 3 }, (_u, i) => ({ kind: 'set', atome_id: `ext_shape_${projectId.slice(-6)}_${i}`, project_id: projectId, type: 'shape',
            props: { type: 'shape', kind: 'shape', project_id: projectId, parent_id: projectId, left: 40 + i * 140, top: 200, width: 120, height: 120, color: 'rgba(230,40,40,1)' } }));
        await window.Atome.commitBatch(shapes);
        const result = await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: projectId });
        return { projectId, ok: result?.ok !== false };
    });
    check('téléphone : projet ouvert', !!created.projectId && created.ok, created);
    const fProject = await waitOn(follower, async (projectId) => {
        const ws = window.__eveWorkspaceMode || {};
        const { getProjectWorkMode } = await import('/eVe/domains/rendering/project_work_mode_state.js');
        return { ok: ws.mode === 'project' && ws.projectId === projectId && getProjectWorkMode(projectId) === 'edit' && window.__eveDashboardMainMenuSuspended !== true,
            ws, mode: getProjectWorkMode(projectId), suspended: window.__eveDashboardMainMenuSuspended };
    }, created.projectId, 60_000, 400);
    check('écran : même projet, même mode (Édition), ses outils', fProject.ok, fProject);
    const devMode = await page.evaluate(async id => (await import('/eVe/domains/rendering/project_work_mode_state.js')).getProjectWorkMode(id), created.projectId);
    check('téléphone : reste en Édition, ses outils', devMode === 'edit', devMode);
    await sleep(2000);

    // The device zooms and pans: the screen keeps the same spot in its centre, at the same scale.
    await page.evaluate(async () => {
        const cam = await import('/eVe/domains/rendering/project_view_camera_runtime.js');
        cam.zoomProjectViewAt({ zoom: 1.5 }); cam.panProjectViewBy({ dx: -60, dy: 40 });
    });
    const centreOf = target => target.evaluate(async () => {
        const camera = await import('/eVe/domains/rendering/project_view_camera.js');
        const cam = await import('/eVe/domains/rendering/project_view_camera_runtime.js');
        const area = cam.readProjectViewUsableArea(), view = camera.readProjectView();
        return { zoom: view.zoom, cx: (area.x + area.width / 2 - view.x) / view.zoom, cy: (area.y + area.height / 2 - view.y) / view.zoom, area };
    });
    const devCentre = await centreOf(page);
    const fView = await waitOn(follower, async (want) => {
        const camera = await import('/eVe/domains/rendering/project_view_camera.js');
        const cam = await import('/eVe/domains/rendering/project_view_camera_runtime.js');
        const area = cam.readProjectViewUsableArea(), view = camera.readProjectView();
        const cx = (area.x + area.width / 2 - view.x) / view.zoom, cy = (area.y + area.height / 2 - view.y) / view.zoom;
        return { ok: Math.abs(view.zoom - want.zoom) < 1e-6 && Math.abs(cx - want.cx) < 0.5 && Math.abs(cy - want.cy) < 0.5, zoom: view.zoom, cx, cy, area };
    }, devCentre, 10_000);
    check('écran : même point au centre, même échelle, plus de place', fView.ok && fView.area.width > devCentre.area.width, { device: devCentre, screen: fView });
    await sleep(1500); await shoot(follower, '3_ecran_projet'); await shoot(page, '3_telephone_projet');

    // The device adds an object: the screen gets it live (its own sync source).
    const added = await page.evaluate(async (projectId) => {
        await window.Atome.commit({ kind: 'set', atome_id: `ext_live_${projectId.slice(-6)}`, project_id: projectId, type: 'shape',
            props: { type: 'shape', kind: 'shape', project_id: projectId, parent_id: projectId, left: 60, top: 420, width: 160, height: 90, color: 'rgba(40,200,90,1)' } });
        const id = `ext_live_${projectId.slice(-6)}`;
        const stored = await window.Atome.getStateCurrent(id);
        return { id, stored: !!stored && !stored.deleted };
    }, created.projectId);
    // The device's own writes go through the one pipeline unchanged.
    check('téléphone : son écriture passe et est gardée', added.stored, added);
    const fLive = await waitOn(follower, async ({ projectId, id }) => {
        const scene = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const records = scene.getProjectSceneState(projectId)?.records || [];
        return { ok: records.some(record => String(record?.id ?? record?.atome_id) === id), count: records.length };
    }, { projectId: created.projectId, id: added.id }, 20_000, 300);
    check('écran : un objet ajouté sur le téléphone y apparaît', fLive.ok, fLive);
    // The screen is a workspace too (user, 19 Nov. 2026: « c'est bidirectionnel »): an object added there is kept and
    // reaches the device.
    const fromScreen = await follower.evaluate(async (projectId) => {
        const id = `ext_screen_${projectId.slice(-6)}`;
        await window.Atome.commit({ kind: 'set', atome_id: id, project_id: projectId, type: 'shape',
            props: { type: 'shape', kind: 'shape', project_id: projectId, parent_id: projectId, left: 260, top: 420, width: 120, height: 90, color: 'rgba(40,90,230,1)' } });
        const stored = await window.Atome.getStateCurrent(id);
        return { id, stored: !!stored && !stored.deleted };
    }, created.projectId);
    check('écran : son écriture passe et est gardée', fromScreen.stored, fromScreen);
    const dLive = await waitOn(page, async ({ projectId, id }) => {
        const scene = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const records = scene.getProjectSceneState(projectId)?.records || [];
        return { ok: records.some(record => String(record?.id ?? record?.atome_id) === id), count: records.length };
    }, { projectId: created.projectId, id: fromScreen.id }, 20_000, 300);
    check('téléphone : un objet ajouté sur l’écran y apparaît', dLive.ok, dLive);
    await sleep(1200); await shoot(follower, '4_ecran_objet_ajoute');

    // The device plays a video of the project: the screen plays the same pictures, silent, from the device's time.
    await page.evaluate(() => { const input = Object.assign(document.createElement('input'), { id: 'ext_video_input', type: 'file' });
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'; document.body.appendChild(input); });
    await page.setInputFiles('#ext_video_input', path.resolve('tests/fixtures/media/recorded.webm'));
    const video = await page.evaluate(async (projectId) => {
        const entries = Array.from(document.getElementById('ext_video_input').files);
        const { importFilesToProjectViaCreator } = await import('/eVe/intuition/tools/project_drop.js');
        const imported = await importFilesToProjectViaCreator({ entries, projectId, parentId: projectId, projectPosition: { left: 60, top: 560 }, autoPlace: false,
            origin: 'external_display_probe', sourceLayer: 'external_display_probe', actorType: 'headless_probe' });
        return { ok: imported?.ok === true, id: imported?.results?.[0]?.atomeId || null, error: imported?.error };
    }, created.projectId);
    check('téléphone : vidéo importée dans le projet', video.ok && !!video.id, video);
    const fVideoNode = await waitOn(follower, async (id) => { const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const nodes = projectViewPlayback.videoNodesOf([id]); return { ok: nodes.length > 0, nodes }; }, video.id, 30_000, 400);
    check('écran : la vidéo y est', fVideoNode.ok, fVideoNode);
    const played = await page.evaluate(async ({ id, projectId }) => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const result = await projectViewPlayback.playChild({ record: await window.Atome.getStateCurrent(id), projectId });
        return { ok: result?.ok !== false, playingIds: projectViewPlayback.readState().playingIds, error: result?.error };
    }, { id: video.id, projectId: created.projectId });
    check('téléphone : la vidéo joue', played.ok && played.playingIds.includes(video.id), played);
    const fPlays = await waitOn(follower, async (id) => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const { getBevyVideoDecodeStatus } = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = getBevyVideoDecodeStatus(projectViewPlayback.videoNodesOf([id])[0] || '');
        return { ok: status.exists === true && status.paused === false && Number(status.currentTime) > 0, status: { exists: status.exists, paused: status.paused, t: status.currentTime, muted: status.muted } };
    }, video.id, 20_000, 300);
    check('écran : la même vidéo joue', fPlays.ok, fPlays);
    await sleep(800); await shoot(follower, '4b_ecran_video');
    const stopped = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_playback_runtime.js')).projectViewPlayback.stop());
    const fStops = await waitOn(follower, async (id) => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const { getBevyVideoDecodeStatus } = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = getBevyVideoDecodeStatus(projectViewPlayback.videoNodesOf([id])[0] || '');
        return { ok: status.paused === true, paused: status.paused };
    }, video.id, 15_000, 300);
    check('écran : arrêtée sur le téléphone, arrêtée ici', fStops.ok, { stopped, fStops });

    // The screen's own place (the home's rubric and page) stays the device's to keep.
    check('écran : ne touche pas la place gardée par le téléphone', await page.evaluate(() => localStorage.getItem('eve.dashboard.left.v1')) !== null || deviceBefore === null);

    // The device goes back to the Dashboard: the screen too.
    await page.evaluate(async () => (await import('/eVe/intuition/tools/user_workspace_surface_runtime.js')).openWorkspaceDashboardAndMainMenu({ source: 'probe' }));
    const fBack = await waitOn(follower, () => ({ ok: (window.__eveWorkspaceMode || {}).mode === 'dashboard', ws: window.__eveWorkspaceMode }), null, 30_000, 400);
    check('écran : revenu au Dashboard avec le téléphone', fBack.ok, fBack);
    await sleep(1500); await shoot(follower, '5_ecran_retour');

    // The device's keyboard: iOS contracts the screen's visual viewport too; the screen keeps its whole size (its band stays down).
    const keyboardOnScreen = await follower.evaluate(async () => {
        const surface = document.getElementById('eve_surface_project');
        const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
        const before = readRenderSurfaceSize(surface);
        const fake = Object.assign(new EventTarget(), { width: innerWidth, height: innerHeight - 320, scale: 1, offsetTop: 0, offsetLeft: 0 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: fake });
        window.dispatchEvent(new Event('resize'));
        await new Promise(resolve => setTimeout(resolve, 1200));
        return { before: { width: before.width, height: before.height }, after: (({ width, height }) => ({ width, height }))(readRenderSurfaceSize(surface)) };
    });
    check('clavier de l’appareil : l’écran garde toute sa hauteur', keyboardOnScreen.after.height === keyboardOnScreen.before.height && keyboardOnScreen.before.height > 900, keyboardOnScreen);

    note('places reçues par l’écran', await follower.evaluate(() => window.__probePlaces.map(m => ({ t: m.t, type: m.type, surface: m.place?.surface, rubric: m.place?.dashboard?.rubric?.rubric || null, page: !!m.place?.dashboard?.page }))));
    note('erreurs absorbées de l’écran', await follower.evaluate(() => (window.__squirrelErrors || []).map(e => `${e.context}: ${e.error?.message || e.message || ''}`).slice(-30)));
    // Unplugged: the screen's page closes; the device goes on unchanged.
    await follower.close();
    await sleep(1000);
    const after = await readHome(page);
    const afterBand = await bandLaid(page);
    check('débranché : le téléphone continue, inchangé', after.ok && afterBand.laid, { ok: after.ok, afterBand });
} finally {
    note('erreurs de la page de l’écran', followerErrors);
    note('erreurs du téléphone', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
