// R-212 — the pointer an iPhone's app hands to a page (external_display_pointer.js): the page's own views answer it as
// a real mouse. The probe uses no mouse of the browser: only `__eveVirtualPointer`.
// Run: node tests/probes/external_display/external_display_pointer.probe.mjs   (HEADLESS=0 to watch)
import { createReport, openHome, readHome, sleep, waitMystic, waitOn } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_pointer');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });
const pointer = (event) => page.evaluate(e => window.__eveVirtualPointer(e), event);

try {
    const installed = await page.evaluate(async () => (await import('/eVe/domains/rendering/external_display_pointer.js')).installExternalDisplayPointer(window));
    check('récepteur installé', installed === true);

    // A tile of the home, clicked by the pointer once the home has settled: its rubric opens.
    await sleep(2500);
    const box = (await readHome(page)).cells.contacts.box;
    const at = await page.evaluate(b => { const r = document.getElementById('eve_surface_project').getBoundingClientRect(); return { x: r.left + b.x + b.width / 2, y: r.top + b.y + b.height / 2 }; }, box);
    await pointer({ phase: 'move', x: at.x, y: at.y }); await pointer({ phase: 'down', x: at.x, y: at.y }); await sleep(60); await pointer({ phase: 'up', x: at.x, y: at.y });
    const opened = await waitOn(page, async () => { const r = (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime(); const i = r?.inspect?.(); return { ok: i?.shownRubric === 'contacts', shownRubric: i?.shownRubric }; }, null, 15_000);
    check('clic du pointeur : la tuile Contacts s’ouvre', opened.ok, opened);
    await page.evaluate(async () => (await import('/eVe/domains/matrix/matrix_module_runtime.js')).readWorkspaceHomeRuntime().toRoot());
    await sleep(800);

    // A project with a shape: the pointer drags it.
    const made = await page.evaluate(async () => {
        const project = await window.AdoleAPI.projects.create('Pointeur');
        const projectId = String(project?.id || project?.project_id || project?.atome_id || project?.fastify?.project?.id || '');
        const id = `ptr_shape_${projectId.slice(-6)}`;
        await window.Atome.commit({ kind: 'set', atome_id: id, project_id: projectId, type: 'shape',
            props: { type: 'shape', kind: 'shape', project_id: projectId, parent_id: projectId, left: 80, top: 260, width: 140, height: 140, color: 'rgba(230,40,40,1)' } });
        await (await import('/eVe/domains/dashboard/dashboard_mystic_sources.js')).dashboardMysticTool('ui.project.open', { project_id: projectId });
        return { projectId, id };
    });
    await waitOn(page, (projectId) => ({ ok: window.__eveWorkspaceMode?.mode === 'project' && window.__eveWorkspaceMode.projectId === projectId }), made.projectId, 30_000, 300);
    await sleep(2500);
    const screenOf = () => page.evaluate(async ({ projectId, id }) => {
        const camera = await import('/eVe/domains/rendering/project_view_camera.js');
        const scene = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const record = scene.getProjectSceneState(projectId)?.records?.find(r => String(r?.id ?? r?.atome_id) === id);
        const p = record?.properties || {}, view = camera.readProjectView(projectId);
        const r = document.getElementById('eve_surface_project').getBoundingClientRect();
        return { left: Number(p.left), top: Number(p.top), zoom: view.zoom,
            x: r.left + view.x + (Number(p.left) + Number(p.width) / 2) * view.zoom, y: r.top + view.y + (Number(p.top) + Number(p.height) / 2) * view.zoom };
    }, made);
    const before = await screenOf();
    note('objet avant', before);
    await pointer({ phase: 'move', x: before.x, y: before.y });
    await pointer({ phase: 'down', x: before.x, y: before.y });
    for (let i = 1; i <= 12; i += 1) { await pointer({ phase: 'move', x: before.x + i * 6, y: before.y + i * 4 }); await sleep(16); }
    await pointer({ phase: 'up', x: before.x + 72, y: before.y + 48 });
    const after = await waitOn(page, async ({ id, left, top }) => {
        const state = await window.Atome.getStateCurrent(id);
        const p = state?.properties || state || {};
        return { ok: Math.abs(Number(p.left) - left) > 20 || Math.abs(Number(p.top) - top) > 20, left: Number(p.left), top: Number(p.top) };
    }, { id: made.id, left: before.left, top: before.top }, 10_000, 300);
    check('glisser du pointeur : l’objet se déplace et est gardé', after.ok, { before, after });

    // The wheel: the project's view answers it.
    const zoomBefore = (await screenOf()).zoom;
    const viewBefore = await page.evaluate(async (id) => (await import('/eVe/domains/rendering/project_view_camera.js')).readProjectView(id), made.projectId);
    for (let i = 0; i < 6; i += 1) { await pointer({ phase: 'wheel', x: 200, y: 600, dx: 0, dy: 40 }); await sleep(30); }
    await sleep(600);
    const viewAfter = await page.evaluate(async (id) => (await import('/eVe/domains/rendering/project_view_camera.js')).readProjectView(id), made.projectId);
    check('molette du pointeur : la vue répond', viewAfter.zoom !== zoomBefore || viewAfter.x !== viewBefore.x || viewAfter.y !== viewBefore.y, { viewBefore, viewAfter });

    // A right click: the long press of the place under it — on the project's ground, the Mystic opens.
    const ground = await page.evaluate(() => { const r = document.getElementById('eve_surface_project').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 150 }; });
    await pointer({ phase: 'move', x: ground.x, y: ground.y });
    await pointer({ phase: 'down', x: ground.x, y: ground.y, button: 2 });
    await sleep(40);
    await pointer({ phase: 'up', x: ground.x, y: ground.y, button: 2 });
    const mystic = await waitMystic(page, true);
    check('clic droit : l’appui long ouvre le Mystic', mystic.ok, mystic);
    // Two clicks close together: a double click, as a browser counts them (user, 19 Nov. 2026: « le double clic est ignoré »).
    const counted = await page.evaluate(async () => {
        // A pad of the probe's own, above everything: the views keep their state.
        const pad = Object.assign(document.createElement('div'), { id: 'probe_click_pad' });
        Object.assign(pad.style, { position: 'fixed', left: '0px', top: '0px', width: '60px', height: '60px', zIndex: '2147483647' });
        document.body.append(pad);
        const seen = [];
        const log = event => seen.push(`${event.type}:${event.detail}`);
        pad.addEventListener('click', log); pad.addEventListener('dblclick', log);
        const click = (x, y) => { window.__eveVirtualPointer({ phase: 'down', x, y }); window.__eveVirtualPointer({ phase: 'up', x, y }); };
        click(30, 30); click(31, 30);
        await new Promise(resolve => setTimeout(resolve, 700));
        click(31, 30);
        pad.remove();
        return seen;
    });
    check('deux clics rapprochés : un double clic ; un clic plus tard repart à un', JSON.stringify(counted) === JSON.stringify(['click:1', 'click:2', 'dblclick:2', 'click:1']), counted);
    // The Trackpad's taps (`pad`) count one fewer (user, 19 Nov. 2026): two select, three enter; a tap then a finger that
    // slides is a plain press that drags (it opened the text instead of moving it).
    const padTaps = await page.evaluate(async () => {
        const pad = Object.assign(document.createElement('div'), { id: 'probe_pad_taps' });
        Object.assign(pad.style, { position: 'fixed', left: '0px', top: '0px', width: '200px', height: '60px', zIndex: '2147483647' });
        document.body.append(pad);
        const seen = [];
        const log = event => seen.push(`${event.type}:${event.detail}`);
        ['pointerdown', 'click', 'dblclick'].forEach(type => pad.addEventListener(type, log));
        const at = (phase, x) => window.__eveVirtualPointer({ phase, x, y: 30, pad: true });
        const tap = x => { at('down', x); at('up', x); };
        const pause = () => new Promise(resolve => setTimeout(resolve, 700));
        await pause();
        tap(30); tap(30); tap(30);
        const three = seen.splice(0);
        await pause();
        tap(30); at('down', 30); at('move', 60); at('move', 120); at('up', 120);
        const drag = seen.splice(0);
        pad.remove();
        return { three, drag };
    });
    check('trackpad : deux touchers = clics simples, le troisième = le double clic (une fois)', JSON.stringify(padTaps.three) === JSON.stringify(
        ['pointerdown:1', 'click:1', 'pointerdown:1', 'click:1', 'pointerdown:2', 'click:2', 'dblclick:2']), padTaps.three);
    check('trackpad : un toucher puis un doigt qui glisse = un appui simple qui glisse, sans double clic', JSON.stringify(padTaps.drag) === JSON.stringify(
        ['pointerdown:1', 'click:1', 'pointerdown:1', 'click:1']), padTaps.drag);
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs du téléphone', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
