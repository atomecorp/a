// Scenes of the Timeline, through the real canvas (real presses, holds, drags, double clicks, keyboard), checked on
// the kernel timeline AND on what is painted: draw a Scene by holding then dragging on the Scenes band, a second one
// beside it, a third that stops at its neighbour, a quick drag that only scrolls, resize by the right and the left
// handle, move, rename by a double click (Enter keeps, a blank name is not written), the name seen in the Cells view
// and the Scene filter of the Cells, rename from those views, delete from the rail, reopen the project (everything identical).
// Each gesture's response time is measured IN the page, from the pointer's release (or the key) to the frame that
// shows the result; the band's geometry is compared across the steps and a window change (rule 12).
// Tests SC-10 … SC-30 of tests/parcours_musique/04_cellules_scenes.md.
// node tests/probes/music/scenes_ui.probe.mjs [width height tag]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, openNewProject } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget, openCdpPointer, wait } from '../molecule_ui_acceptance_support.mjs';

const [W = '1180', H = '820', TAG = 'ipad'] = process.argv.slice(2);
const OUT = path.resolve(`temp/probe_reports/music/scenes_ui/${TAG}`);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], timings: {}, notes: {}, errors: [] };
// The machine's load beside the timings: a slow answer on a loaded machine reads as such (rerun calm to judge).
report.notes.load_average = os.loadavg().map((v) => Math.round(v));
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const note = (key, value) => { report.notes[key] = value; write(); };
// A gesture answers within this delay on the Web (release → painted frame).
const RESPONSE_MS = Number(process.env.PROBE_RESPONSE_MS) || 400;
const home = createReport(`scenes_ui_${TAG}`);
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: Number(W), height: Number(H) });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) report.errors.push(`console ${m.text().slice(0, 300)}`); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
// In-page readers: the project's Scenes (seconds, by start) and painted node rectangles (client px), by id, by prefix
// or by tree; the last input (pointer release or key) is stamped so a result's delay is read on the page's own clock.
await app(page, `
    const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
    const probe = window.__scenesProbe = { lastInput: 0 };
    window.addEventListener('pointerup', () => { probe.lastInput = performance.now(); }, true);
    window.addEventListener('keydown', () => { probe.lastInput = performance.now(); }, true);
    probe.scenes = (pid) => { const t = window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: pid }).timeline; const rate = t.timebase.sample_rate;
        return [...(t.scenes || [])].sort((a, b) => a.start_frame - b.start_frame)
            .map((s) => ({ id: s.scene_id, name: s.name, start: s.start_frame / rate, end: (s.start_frame + s.duration_frames) / rate })); };
    probe.clips = (pid) => JSON.stringify(window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: pid }).timeline.clips);
    probe.rects = ({ id = '', prefix = '', tree = '' } = {}) => {
        const surface = document.getElementById('eve_surface_project'); const r = surface.getBoundingClientRect();
        const runtime = window.eveBevyUiRuntime; const found = {};
        const visit = (n, parent, forced) => { if (!n) return; const box = forced || nodeBox(n, parent); const nid = String(n.id || '');
            if ((id && nid === id) || (prefix && nid.startsWith(prefix)) || (tree && !id && !prefix)) found[nid] = { x: r.left + box.x, y: r.top + box.y, width: box.width, height: box.height, text: n.text ?? null };
            const boxes = layoutForNodeCached(n, box).childBoxes; (n.children || []).forEach((c, i) => visit(c, box, boxes[i])); };
        for (const [tid, entry] of runtime.state.trees) { if (entry.surface !== surface || runtime.state.suspendedTrees.has(tid) || (tree && tid !== tree)) continue; visit(entry.tree.root); }
        return found; };
    probe.rect = (id) => probe.rects({ id })[id] || null;
    // Resolves when \`test()\` holds on a painted frame: { ok, ms since the last input, value }.
    probe.until = (test, timeoutMs) => new Promise((resolve) => { const started = performance.now();
        const step = () => { const value = test(); const at = performance.now();
            if (value) return resolve({ ok: true, ms: Math.round(at - (probe.lastInput || started)), value });
            if (at - started > timeoutMs) return resolve({ ok: false, ms: Math.round(at - (probe.lastInput || started)), value: null });
            requestAnimationFrame(step); };
        requestAnimationFrame(step); });
    return true;`);
const scenesOf = (pid) => app(page, 'return window.__scenesProbe.scenes(arg);', pid);
const clipsOf = (pid) => app(page, 'return window.__scenesProbe.clips(arg);', pid);
const rectOf = (id) => app(page, 'return window.__scenesProbe.rect(arg);', id);
const rects = (match) => app(page, 'return window.__scenesProbe.rects(arg);', match);
// The result `test` (a function body over `p` = the probe, `a` = arg) waited for on the page and timed there.
const answered = async (label, test, arg, timeoutMs = 8000) => {
    const result = await app(page, `const p = window.__scenesProbe; const a = arg.arg;
        return p.until(() => { ${test} }, arg.timeoutMs);`, { arg, timeoutMs });
    report.timings[label] = result.ms; write();
    return result;
};
const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
const sceneNodeId = (sceneId) => `project_view_timeline_scene_${safeId(sceneId)}`;
const sceneCellId = (sceneId) => `project_view_timeline_cell_${safeId(sceneId)}_scene`;
const node = (nodeId, timeoutMs = 6000) => awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs });
const pointer = await openCdpPointer(page);
// A hold (still finger) then a drag of `dx`, released: the band's draw, a Scene's move, a handle.
const holdDrag = async (from, dx, { holdMs = 450, steps = 14 } = {}) => {
    await pointer.move(from); await pointer.press([]); await wait(holdMs);
    await pointer.travel({ x: from.x + dx, y: from.y }, steps); await wait(60);
    await pointer.release();
};
// A quick drag (no hold): scrolls the time axis.
const quickDrag = async (from, dx) => { await pointer.move(from); await pointer.press([{ to: { x: from.x + dx, y: from.y }, steps: 8 }]); await pointer.release(); };
const BAND = 'project_view_timeline_scenes';
const RULER = 'project_view_timeline_ruler';
const RAIL = 'eve_bevy_panel_atome_contextual_edit';
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const fast = (name, result) => check(`SC-26 ${name} answers in ≤ ${RESPONSE_MS} ms`, result.ok && result.ms <= RESPONSE_MS, result.ms);
// A view: the band's Vue (user 23 Nov. 2026), its choices laid in the rail (R-294), then its choice.
const viewTool = async (key) => {
    const palette = await node('eve_bevy_ui_main_menu_tool_view', 3000);
    if (!palette) return false;
    await clickCanvasTarget(page, palette); await wait(800);
    const t = await node(`atome_contextual_tool_main_band_view_${key}`, 3000);
    if (t) { await clickCanvasTarget(page, t); await wait(1500); }
    return !!t;
};
// A double click on `nodeId` opens a name field (the canonical scene name field, `…_name_field`).
const renameFieldAfterDoubleClick = async (nodeId, label) => {
    const target = await node(nodeId, 3000);
    if (!target) return { ok: false, error: `node_missing:${nodeId}` };
    await clickCanvasTarget(page, target, { double: true });
    return answered(label, `const all = p.rects({ prefix: 'project_view_' }); return Object.keys(all).find((id) => id.endsWith('_name_field')) || null;`, null, 2500);
};

try {
    const project = await openNewProject(page, `scenes_${Date.now()}`);
    const pid = project.id;
    await app(page, `
        await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'Voix', projectId: arg, parentId: arg,
            src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '400px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false }); return true;`, pid);
    await wait(2000);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(4000);
    const clipsBefore = await clipsOf(pid);
    const band0 = await rectOf(BAND);
    const ruler0 = await rectOf(RULER);
    check('SC-10 scenes band painted, half the ruler', !!band0 && !!ruler0 && band0.width > 200 && near(band0.height * 2, ruler0.height, 1), { band0, ruler0 });
    if (!band0) throw new Error('scenes_band_missing');
    await shot('00_timeline');
    const y = band0.y + band0.height / 2;

    // SC-10 draw: hold then drag on the empty band.
    // Drawn in proportion to the band, so that the same steps fit a phone (390 px) and a desktop.
    const span = Math.round(band0.width * 0.25);
    await holdDrag({ x: band0.x + Math.round(band0.width * 0.08), y }, span);
    let got = await answered('draw_first', `const s = p.scenes(a); return s.length === 1 ? p.rect('project_view_timeline_scene_' + s[0].id.replace(/[^a-zA-Z0-9_-]/g, '_')) : null;`, pid);
    let scenes = await scenesOf(pid);
    check('SC-10 hold then drag draws a Scene', scenes.length === 1 && got.ok, { scenes, rect: got.value });
    check('SC-10 its painted width follows the drag (±1 grid step)', got.ok && near(got.value.width, span, Math.max(20, span * 0.25)), got.value);
    check('SC-10 it fills the band height', got.ok && near(got.value.height, band0.height, 1), { scene: got.value?.height, band: band0.height });
    check('SC-10 it is named (Scene 1)', scenes.length === 1 && /1$/.test(scenes[0].name || ''), scenes[0]?.name);
    fast('draw', got);
    await shot('01_drawn');
    const first = scenes[0];

    // SC-11 a second Scene beside it; SC-12 a third drawn from the gap over the first stops at its neighbour.
    const firstRect = await rectOf(sceneNodeId(first.id));
    // The gap left between them holds the third (at least a tool: a Scene is never narrower than half a tool, SC-20).
    await holdDrag({ x: firstRect.x + firstRect.width + Math.max(Math.round(band0.width * 0.06), Math.round(ruler0.height)), y }, Math.round(band0.width * 0.18));
    got = await answered('draw_second', 'return p.scenes(a).length === 2;', pid);
    scenes = await scenesOf(pid);
    check('SC-11 a second Scene beside the first', scenes.length === 2 && scenes[1].start >= scenes[0].end - 1e-6, scenes);
    fast('a second draw', got);
    const secondRect = await rectOf(sceneNodeId(scenes[1].id));
    await holdDrag({ x: (firstRect.x + firstRect.width + secondRect.x) / 2, y }, -Math.round(band0.width * 0.4));
    await answered('draw_third', 'return p.scenes(a).length === 3;', pid, 3000);
    scenes = await scenesOf(pid);
    check('SC-12 a Scene drawn over another stops at its neighbour (no overlap)', !scenes.some((s, i) => i > 0 && s.start < scenes[i - 1].end - 1e-6), scenes);
    await shot('02_three');

    // SC-13 a quick drag on the band scrolls, creates nothing.
    const count = scenes.length;
    await quickDrag({ x: band0.x + band0.width - 60, y }, -200);
    await wait(800);
    check('SC-13 a quick drag on the band creates no Scene', (await scenesOf(pid)).length === count, { count, now: (await scenesOf(pid)).length });
    await quickDrag({ x: band0.x + 60, y }, 400); await wait(800);

    // SC-14 the right handle: the last Scene (free after it) lengthens; the first, held by its neighbour, shortens.
    const last = (await scenesOf(pid)).at(-1);
    const lastRect = await rectOf(sceneNodeId(last.id));
    const right = await rectOf(`${sceneNodeId(last.id)}_edge_end`);
    check('SC-14 the Scene has a right handle', !!right, right);
    if (right) {
        await holdDrag({ x: right.x + right.width / 2, y }, Math.round(band0.width * 0.08), { holdMs: 120 });
        got = await answered('resize_end', `const s = p.scenes(a.pid).find((e) => e.id === a.id); const r = p.rect(a.node);
            return s && s.end > a.end + 1e-3 && r && r.width > a.width + 10 ? { s, r } : null;`, { pid, id: last.id, end: last.end, node: sceneNodeId(last.id), width: lastRect.width });
        check('SC-14 the right handle lengthens the Scene, painted', got.ok && near(got.value.s.start, last.start, 1e-3), { before: last, after: got.value });
        fast('a resize', got);
    }
    const firstNow = (await scenesOf(pid)).find((s) => s.id === first.id);
    const firstEnd = await rectOf(`${sceneNodeId(first.id)}_edge_end`);
    const firstBody = await rectOf(sceneNodeId(first.id));
    await holdDrag({ x: firstEnd.x + firstEnd.width / 2, y }, -Math.round(firstBody.width * 0.25), { holdMs: 120 });
    got = await answered('shorten_end', 'const s = p.scenes(a.pid).find((e) => e.id === a.id); return s && s.end < a.end - 1e-3 ? s : null;', { pid, id: first.id, end: firstNow.end });
    check('SC-14 the right handle pulled left shortens it, its start kept', got.ok && near(got.value.start, firstNow.start, 1e-3), { before: firstNow, after: got.value });
    // SC-15 the left handle.
    const target = (await scenesOf(pid)).find((s) => s.id === first.id);
    const left = await rectOf(`${sceneNodeId(first.id)}_edge_start`);
    check('SC-15 the Scene has a left handle', !!left, left);
    if (left) {
        const shortened = await rectOf(sceneNodeId(first.id));
        await holdDrag({ x: left.x + left.width / 2, y }, Math.round(shortened.width * 0.25), { holdMs: 120 });
        got = await answered('resize_start', 'const s = p.scenes(a.pid).find((e) => e.id === a.id); return s && s.start > a.start + 1e-3 ? s : null;', { pid, id: first.id, start: target.start });
        check('SC-15 the left handle moves its start, its end stays', got.ok && near(got.value.end, target.end, 1e-3), { before: target, after: got.value });
    }
    check('SC-16 resizing a Scene never moves the clips', (await clipsOf(pid)) === clipsBefore);
    await shot('03_resized');

    // SC-17 move: hold the Scene then drag; same length, content untouched.
    const moving = (await scenesOf(pid)).find((s) => s.id === first.id);
    let body = await rectOf(sceneNodeId(first.id));
    await holdDrag({ x: body.x + body.width / 2, y }, -Math.round(band0.width * 0.04));
    got = await answered('move', 'const s = p.scenes(a.pid).find((e) => e.id === a.id); return s && Math.abs(s.start - a.start) > 1e-3 ? s : null;', { pid, id: first.id, start: moving.start });
    check('SC-17 held then dragged, the Scene moves, its length kept', got.ok && near(got.value.end - got.value.start, moving.end - moving.start, 1e-3), { before: moving, after: got.value });
    check('SC-16 moving a Scene never moves the clips', (await clipsOf(pid)) === clipsBefore);
    fast('a move', got);

    // SC-18 rename by a double click: the field, all selected; typed, Enter keeps it.
    body = await rectOf(sceneNodeId(first.id));
    const field = await renameFieldAfterDoubleClick(sceneNodeId(first.id), 'rename_field');
    const fieldRect = field.ok ? await rectOf(field.value) : null;
    check('SC-18 a double click opens the name field in place', field.ok, field.value);
    check('SC-18 the field stays inside its Scene', !!fieldRect && fieldRect.x >= body.x - 1 && fieldRect.x + fieldRect.width <= body.x + body.width + 1, { field: fieldRect, scene: body });
    await page.keyboard.insertText('Couplet');
    await page.keyboard.press('Enter');
    got = await answered('rename_commit', `const s = p.scenes(a.pid).find((e) => e.id === a.id); const t = p.rect(a.node + '_name')?.text || '';
        // Painted whole, or cut with « … » when its Scene is too narrow for it (SC-20).
        return s?.name === 'Couplet' && !p.rect(a.node + '_name_field') && (t === 'Couplet' || (t.endsWith('…') && 'Couplet'.startsWith(t.slice(0, -1))));`, { pid, id: first.id, node: sceneNodeId(first.id) });
    check('SC-18 typed then Enter, the Scene is renamed and its name painted', got.ok, (await scenesOf(pid)).find((e) => e.id === first.id));
    fast('a rename', got);
    // SC-19 a blank name is not written.
    await clickCanvasTarget(page, await node(sceneNodeId(first.id)), { double: true });
    await wait(500);
    await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
    await wait(900);
    check('SC-19 a blank name is not written', (await scenesOf(pid)).find((e) => e.id === first.id)?.name === 'Couplet');
    // SC-20 a Scene is never narrower than half a tool (the ruler is one tool high): its right handle pulled far to
    // the left stops there, and every Scene drawn so far is at least that wide.
    const halfTool = ruler0.height / 2;
    const shortest = (await scenesOf(pid)).reduce((a, b) => ((b.end - b.start) < (a.end - a.start) ? b : a));
    const shortestEnd = await rectOf(`${sceneNodeId(shortest.id)}_edge_end`);
    const shortestBody = await rectOf(sceneNodeId(shortest.id));
    if (shortestEnd && shortestBody) {
        await holdDrag({ x: shortestEnd.x + shortestEnd.width / 2, y }, -Math.round(shortestBody.width + halfTool * 2), { holdMs: 120 });
        await wait(900);
    }
    const widths = await Promise.all((await scenesOf(pid)).map(async (s) => (await rectOf(sceneNodeId(s.id)))?.width ?? 0));
    // A Scene is painted a hair (2 px) less than its range, so two adjacent Scenes read as two.
    check('SC-20 a handle pulled far stops at half a tool, every Scene at least half a tool wide', widths.length > 0 && widths.every((w) => w >= halfTool - 3), { halfTool, widths });
    // SC-20 a long name never spills out of its Scene.
    const narrow = (await scenesOf(pid)).reduce((a, b) => ((b.end - b.start) < (a.end - a.start) ? b : a));
    // Its body, between its two handles, must stay reachable for a double click (else it cannot be renamed at this zoom).
    const narrowBody = await node(sceneNodeId(narrow.id), 2000);
    check('SC-20 the narrowest Scene can still be reached between its handles', !!narrowBody,
        { scene: await rectOf(sceneNodeId(narrow.id)), handles: [await rectOf(`${sceneNodeId(narrow.id)}_edge_start`), await rectOf(`${sceneNodeId(narrow.id)}_edge_end`)] });
    if (narrowBody) {
        await clickCanvasTarget(page, narrowBody, { double: true });
        await wait(500);
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.insertText('Pont instrumental très long qui ne tient pas');
        await page.keyboard.press('Enter'); await wait(900);
        const narrowRect = await rectOf(sceneNodeId(narrow.id));
        const narrowName = await rectOf(`${sceneNodeId(narrow.id)}_name`);
        check('SC-20 a long name stays inside its Scene', !!narrowRect && !!narrowName && narrowName.x >= narrowRect.x - 1 && narrowName.x + narrowName.width <= narrowRect.x + narrowRect.width + 1, { scene: narrowRect, name: narrowName });
        check('SC-20 a name too long for its Scene ends with « … »', !!narrowName?.text && narrowName.text.endsWith('…'), narrowName?.text);
    }
    await shot('04_renamed');

    // SC-21 / SC-22 the Cells view: the new name, and a rename there.
    const cellsOpened = await viewTool('cells');
    const cellName = await rectOf(`${sceneCellId(first.id)}_name`);
    check('SC-21 the Cells view shows the new name on the Scene', cellsOpened && cellName?.text === 'Couplet', { cellsOpened, cellName });
    await shot('05_cells');
    // SC-22 in Play a double touch on a Scene launches it, never opens a field; in Edit (« Édition » lit) it renames it
    // with the Timeline's field (user, 17 Nov. 2026, mockup temp/rename_mockup_2026-11-17/mockups/A_cellules.png).
    const others = (await scenesOf(pid)).filter((s) => s.id !== first.id);
    const playField = await renameFieldAfterDoubleClick(sceneCellId(others[0].id), 'rename_field_cells_play');
    check('SC-22 in Play, a double touch on a Scene opens no field', !playField.ok, playField.value || null);
    const editTool = async () => { const t = await node('project_view_timeline_row_transport_edit', 3000); if (t) { await clickCanvasTarget(page, t); await wait(900); } return !!t; };
    check('SC-22 « Édition » is lit', await editTool() && await app(page, 'return window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg }).timeline.view?.cells_mode === "edit";', pid));
    const cellField = await renameFieldAfterDoubleClick(sceneCellId(others[0].id), 'rename_field_cells');
    check('SC-22 in Edit, a double touch opens the name field on the Scene\'s cell', cellField.ok, cellField.value || cellField.error || null);
    if (cellField.ok) {
        await page.keyboard.insertText('Pont instrumental'); await page.keyboard.press('Enter');
        got = await answered('rename_commit_cells', `const s = p.scenes(a.pid).find((e) => e.id === a.id); const n = p.rect(a.node + '_name');
            return s?.name === 'Pont instrumental' && !p.rect(a.node + '_name_field') && n ? n : null;`, { pid, id: others[0].id, node: sceneCellId(others[0].id) });
        check('SC-22 typed then Enter, the Scene is renamed from the Cells view', got.ok, got.value);
        check('SC-20 a name longer than its cell ends with « … »', got.ok && got.value.text.endsWith('…') && got.value.text.length < 'Pont instrumental'.length, got.value?.text);
        await shot('05b_cells_renamed');
    }
    // SC-23 / SC-24 the Scene view (the band's Vue › Scène, a view again since R-353; Édition lit): the names in its row of
    // Scenes, and a rename there.
    const sceneOpened = await viewTool('scene');
    const strip = await rects({ prefix: 'project_view_timeline_cell_' });
    const names = Object.entries(strip).filter(([id]) => id.endsWith('_scene_name')).map(([, r]) => r.text);
    check('SC-23 the Scene filter shows the renamed Scenes', sceneOpened && names.includes('Couplet'), { sceneOpened, names });
    await shot('06_scene_filter');
    const sceneField = await renameFieldAfterDoubleClick(sceneCellId(others[1].id), 'rename_field_scene_filter');
    check('SC-24 in Edit, a double touch renames a Scene in the Scene filter', sceneField.ok, sceneField.value || sceneField.error || null);
    if (sceneField.ok) {
        await page.keyboard.insertText('Refrain'); await wait(300);
        await shot('06b_scene_filter_field');
        await page.keyboard.press('Enter');
        got = await answered('rename_commit_scene_filter', `const s = p.scenes(a.pid).find((e) => e.id === a.id); return s?.name === 'Refrain' && p.rect(a.node + '_name')?.text === 'Refrain';`,
            { pid, id: others[1].id, node: sceneCellId(others[1].id) });
        check('SC-24 typed then Enter, the Scene is renamed from the Scene filter', got.ok, (await scenesOf(pid)).find((e) => e.id === others[1].id));
    }
    // Back to Play, as the steps after expect (the Cells first).
    if (sceneOpened) await viewTool('cells');
    await editTool();
    await viewTool('timeline');
    await wait(1200);

    // SC-25 layout never deforms: the band keeps its place in the ruler through the steps and a window change.
    const bandAfter = await rectOf(BAND);
    check('SC-25 the band kept its size through the gestures', !!bandAfter && near(bandAfter.height, band0.height, 0.5) && near(bandAfter.width, band0.width, 0.5), { before: band0, after: bandAfter });
    await page.setViewportSize({ width: Number(W) - 200, height: Number(H) - 100 }); await wait(2000);
    const bandNarrow = await rectOf(BAND);
    const rulerNarrow = await rectOf(RULER);
    await shot('07_smaller_window');
    await page.setViewportSize({ width: Number(W), height: Number(H) }); await wait(2000);
    const bandBack = await rectOf(BAND);
    check('SC-25 a smaller window: the band stays half the ruler', !!bandNarrow && !!rulerNarrow && near(bandNarrow.height * 2, rulerNarrow.height, 1), { band: bandNarrow, ruler: rulerNarrow });
    check('SC-25 back to its size, the band is exactly as before', !!bandBack && near(bandBack.width, band0.width, 0.5) && near(bandBack.height, band0.height, 0.5), { before: band0, back: bandBack });
    note('band_by_window', { [`${W}x${H}`]: band0.height, [`${Number(W) - 200}x${Number(H) - 100}`]: bandNarrow?.height });

    // SC-27 delete: a tap selects the Scene, the rail's « Supprimer la Scène » removes it.
    // The widest Scene other than the first: one a finger reaches at any screen size.
    const victim = (await scenesOf(pid)).filter((s) => s.id !== first.id).reduce((a, b) => ((b.end - b.start) > (a.end - a.start) ? b : a));
    await clickCanvasTarget(page, await node(sceneNodeId(victim.id)));
    await wait(1200);
    const railIds = Object.keys(await rects({ tree: RAIL }));
    const deleteId = railIds.find((id) => id.endsWith('timeline_scene_delete'));
    check('SC-27 a selected Scene offers its deletion in the rail', !!deleteId, railIds.filter((id) => !/_(glyph|label|icon|text)/.test(id)).slice(0, 30));
    if (deleteId) {
        await clickCanvasTarget(page, await node(deleteId));
        got = await answered('delete', 'return !p.scenes(a.pid).some((s) => s.id === a.id) && !p.rect(a.node);', { pid, id: victim.id, node: sceneNodeId(victim.id) });
        check('SC-27 the Scene is deleted, its region gone', got.ok, { left: await scenesOf(pid) });
        check('SC-16 deleting a Scene never deletes the clips', (await clipsOf(pid)) === clipsBefore);
        fast('a delete', got);
    }
    await shot('08_deleted');

    // SC-28 undo / redo of the delete. First the person's own path: Cmd/Ctrl+Z (eVe/default/shortcuts.js →
    // ui.undo.action, the project's history); then the Timeline's own history tool (ui.timeline.history.undo/redo),
    // which no control of the interface reaches today: each answer is recorded apart.
    if (deleteId) {
        const afterDelete = await scenesOf(pid);
        const restored = 'return p.scenes(a.pid).some((s) => s.id === a.id) && !!p.rect(a.node);';
        await page.mouse.click(1, 1); await wait(300);
        await page.keyboard.press('ControlOrMeta+Z');
        got = await answered('undo_shortcut', restored, { pid, id: victim.id, node: sceneNodeId(victim.id) }, 3000);
        check('SC-28 Cmd/Ctrl+Z after a delete brings the Scene back', got.ok, { scenes: await scenesOf(pid) });
        let path = 'shortcut';
        if (!got.ok) {
            path = 'timeline_tool';
            const tool = (id) => app(page, `const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
                const r = await invokeToolGateway({ action: 'pointer.click', tool_id: arg.id, input: { group_id: arg.pid }, source: { type: 'probe' } });
                return { ok: r?.ok ?? null, error: r?.error || r?.result?.error || null };`, { id, pid });
            note('undo_tool_answer', await tool('ui.timeline.history.undo'));
            got = await answered('undo_tool', restored, { pid, id: victim.id, node: sceneNodeId(victim.id) }, 3000);
            check('SC-28 the Timeline history tool brings the deleted Scene back', got.ok, { scenes: await scenesOf(pid) });
            if (got.ok) {
                const back = (await scenesOf(pid)).find((s) => s.id === victim.id);
                check('SC-28 the Scene comes back exactly (start, end, name)', back && back.start === victim.start && back.end === victim.end && back.name === victim.name, { before: victim, back });
                note('redo_tool_answer', await tool('ui.timeline.history.redo'));
                const again = await answered('redo_tool', 'return !p.scenes(a.pid).some((s) => s.id === a.id) && !p.rect(a.node);', { pid, id: victim.id, node: sceneNodeId(victim.id) }, 3000);
                check('SC-28 redo deletes it again', again.ok, { scenes: await scenesOf(pid) });
            }
        } else {
            const back = (await scenesOf(pid)).find((s) => s.id === victim.id);
            check('SC-28 the Scene comes back exactly (start, end, name)', back && back.start === victim.start && back.end === victim.end && back.name === victim.name, { before: victim, back });
            await page.keyboard.press('ControlOrMeta+Shift+Z');
            const again = await answered('redo_shortcut', 'return !p.scenes(a.pid).some((s) => s.id === a.id) && !p.rect(a.node);', { pid, id: victim.id, node: sceneNodeId(victim.id) }, 3000);
            check('SC-28 Cmd/Ctrl+Shift+Z deletes it again', again.ok, { scenes: await scenesOf(pid) });
        }
        note('undo_path', path);
        check('SC-28 after undo and redo, the Scenes are as after the delete', JSON.stringify(await scenesOf(pid)) === JSON.stringify(afterDelete), { afterDelete, now: await scenesOf(pid) });
        await shot('08b_undo_redo');
    }

    // SC-29 reopen the project: Scenes, names and ranges identical.
    const kept = await scenesOf(pid);
    const other = await openNewProject(page, `scenes_other_${Date.now()}`);
    check('SC-29 another project opened', other.ok === true);
    await app(page, `const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
        const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
        const activation = await projectRuntime.activateProjectWorkspace(arg, { force: true, staleFirst: false });
        workspaceMode.markProjectWorkspaceMode?.(arg.id); return activation?.ok === true;`, { id: pid, name: project.name });
    await wait(4000);
    const reopened = await scenesOf(pid);
    check('SC-29 reopened, the Scenes are identical', JSON.stringify(reopened) === JSON.stringify(kept), { kept, reopened });
    await shot('09_reopened');
    note('scenes_final', reopened);
} catch (error) {
    check('exception', false, String(error?.stack || error).slice(0, 900));
} finally {
    check('SC-30 no page error', report.errors.length === 0, report.errors.slice(0, 8));
    await pointer.close().catch(() => null);
    await close();
    const failed = report.checks.filter((c) => !c.ok);
    console.log(`scenes_ui ${TAG}: ${report.checks.length - failed.length}/${report.checks.length}`, JSON.stringify(report.timings));
    process.exitCode = failed.length ? 1 : 0;
}
