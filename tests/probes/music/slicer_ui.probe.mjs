// Slicer UI (R-181): a real sound clip in its full-screen track, kept in the Découpe view then the Motif view;
// every step a real mouse gesture on the canvas (the tool row above the bottom band, the wave, a line, a step),
// read back through the sound's canonical slice_read / motif_read. node tests/probes/music/slicer_ui.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/slicer_ui');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [], console: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 200) : ''); };
const note = (k, v) => { report.notes[k] = v; write(); };
const home = createReport('slicer_ui');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 820 });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error') report.console.push(m.text().slice(0, 300)); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const tl = (pid) => app(page, 'return window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg }).timeline;', pid);
const op = (pid, operation, command) => app(page, `try { return await window.eveMoleculeTimelineApi.applyGroupTimelineOperation({ group_id: arg.pid, operation: arg.operation, command: arg.command }); }
    catch (error) { return { ok: false, error: String(error?.code || error?.message || error), reason: String(error?.message || error) }; }`, { pid, operation, command });
const read = (mediaId) => app(page, "const { executeAudioFxCommand } = await import('/eVe/domains/audio_fx/audio_fx_commands.js'); return executeAudioFxCommand('motif_read', { media_atome_id: arg });", mediaId);
// A node's box in client pixels (the real layout of the project view tree), null when it is not laid.
const boxOf = (nodeId) => page.evaluate(async (id) => {
    const surface = document.getElementById('eve_surface_project');
    const runtime = window.eveBevyUiRuntime;
    const rect = surface.getBoundingClientRect();
    const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
    let found = null;
    const visit = (node, parentBox = null, forced = null) => {
        if (!node || found) return;
        const box = forced || nodeBox(node, parentBox);
        if (node.id === id) { found = { x: rect.left + box.x, y: rect.top + box.y, width: box.width, height: box.height }; return; }
        const boxes = layoutForNodeCached(node, box).childBoxes;
        (node.children || []).forEach((child, index) => visit(child, box, boxes[index]));
    };
    for (const [, entry] of runtime.state.trees) if (entry.surface === surface && !runtime.state.suspendedTrees.has(entry.tree.id)) visit(entry.tree.root);
    return found;
}, nodeId);
const hitAt = (x, y) => page.evaluate(({ x, y }) => window.eveBevyUiRuntime.hitTestAtClientPoint({ surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y })?.nodeId || '', { x, y });
const waitBox = async (nodeId, ms = 8000) => {
    const end = Date.now() + ms;
    let box = await boxOf(nodeId);
    while (!box && Date.now() < end) { await wait(200); box = await boxOf(nodeId); }
    return box;
};
const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const clickTool = async (key) => {
    const box = await waitBox(`project_view_slicer_timeline_slice_${key}`);
    if (!box) throw new Error(`tool_missing:${key}`);
    const at = centre(box);
    note(`hit_${key}`, await hitAt(at.x, at.y));
    await page.mouse.click(at.x, at.y);
    await wait(1800);
};

try {
    const pid = (await openNewProject(page, `slicer_ui_${Date.now()}`)).id;
    const made = await app(page, `const r = await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'Voix', projectId: arg, parentId: arg,
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '400px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false }); return String(r?.id || r?.atome_id || r?.atome?.id || '');`, pid);
    await wait(2500);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(4000);
    let timeline = await tl(pid);
    const clip = timeline.clips.find((c) => c.kind === 'audio');
    check('audio clip on the timeline', clip, { kinds: timeline.clips.map((c) => c.kind) });
    const mediaId = clip.source.atome_id;
    note('ids', { pid, made, mediaId, clip: clip.clip_id, track: clip.track_id });
    // The kernel keeps an audio view and refuses a MIDI one on a sound.
    const refused = await op(pid, 'clip.view', { clip_id: clip.clip_id, view: 'piano' });
    check('a sound refuses the piano view', refused?.ok === false, refused);
    await op(pid, 'view.set', { focus: { track_id: clip.track_id } });
    const kept = await op(pid, 'clip.view', { clip_id: clip.clip_id, view: 'slice' });
    check('a sound keeps the slice view', kept?.ok !== false, kept);
    await wait(3000);
    const sliceNode = `project_view_timeline_clip_${clip.clip_id.replace(/[^a-zA-Z0-9_-]/g, '_')}_slice`;
    const wave = await waitBox(sliceNode);
    check('Découpe view laid in the full-screen track', wave, wave);
    // A real touch on the wave: selects the clip (its tools come above the band) and plays slice 1.
    await page.mouse.click(wave.x + wave.width * 0.3, wave.y + wave.height * 0.6);
    await wait(2500);
    const row = await waitBox('project_view_slicer_tools');
    check('tool row laid above the bottom band', row, row);
    await shot('01_decoupe_empty');
    const seuil = await boxOf('project_view_slicer_timeline_slice_mode_detect');
    check('Seuil tool in the row', seuil && row && Math.abs(seuil.y - row.y) < 2, { seuil, row });
    // Seuil chosen: touched again, it cuts at the attacks.
    await clickTool('mode_detect');
    let sound = await read(mediaId);
    check('Seuil cut at the attacks', sound.points.length > 0 && sound.points.every((p) => p.origin === 'dynamics'), { points: sound.points.length });
    await shot('02_seuil');
    // Diviser, then touched again: 4 equal parts (the division's own points; the attacks stay).
    await clickTool('mode_divide');
    await clickTool('mode_divide');
    sound = await read(mediaId);
    const division = sound.points.filter((p) => p.origin === 'division');
    check('Diviser in 4 parts', division.length === 3, { division: division.length, total: sound.points.length });
    check('Diviser shows Parts and Grille, Vue opens the row', await boxOf('project_view_slicer_timeline_slice_parts') && await boxOf('project_view_slicer_timeline_slice_grid')
        && await boxOf('project_view_slicer_timeline_slice_view'));
    await shot('03_diviser');
    // Main: two touches on the wave put a point.
    await clickTool('mode_hand');
    const before = sound.points.length;
    const box = await waitBox(sliceNode);
    // A place on the screen clear of every line (the clip runs past the screen's right edge).
    const clipShown = (await tl(pid)).clips.find((c) => c.clip_id === clip.clip_id);
    const rateShown = sound.source.sample_rate;
    const lineXs = sound.points.map((p) => box.x + ((p.frame - clipShown.timeline.source_in_seconds * rateShown) / ((clipShown.timeline.source_out_seconds - clipShown.timeline.source_in_seconds) * rateShown)) * box.width);
    let x = box.x + 60;
    while (lineXs.some((lx) => Math.abs(lx - x) < 50) && x < box.x + 900) x += 20;
    note('double_touch_x', { x, lineXs });
    await page.mouse.dblclick(x, box.y + box.height * 0.6);
    await wait(2500);
    sound = await read(mediaId);
    check('a double touch puts a point', sound.points.length === before + 1 && sound.points.some((p) => p.origin === 'hand'), { before, after: sound.points.length });
    // A line carried moves its point (a cut).
    const target = sound.points.find((p) => p.origin === 'division');
    const rate = sound.source.sample_rate;
    const clipNow = (await tl(pid)).clips.find((c) => c.clip_id === clip.clip_id);
    const from = clipNow.timeline.source_in_seconds * rate;
    const span = clipNow.timeline.source_out_seconds * rate - from;
    const lineX = box.x + ((target.frame - from) / span) * box.width;
    await page.mouse.move(lineX, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) { await page.mouse.move(lineX + step * 5, box.y + box.height * 0.5); await wait(30); }
    await shot('04_line_carried');
    await page.mouse.up();
    await wait(2500);
    sound = await read(mediaId);
    const moved = sound.points.find((p) => p.id === target.id);
    check('a carried line moves its point', moved && moved.frame > target.frame, { from: target.frame, to: moved?.frame, origin: moved?.origin });
    // A touch on a line picks it; Suppr. removes it.
    const pickX = box.x + ((moved.frame - from) / span) * box.width;
    await page.mouse.click(pickX, box.y + box.height * 0.5);
    await wait(1500);
    await shot('05_point_picked');
    const count = sound.points.length;
    await clickTool('remove');
    sound = await read(mediaId);
    check('Suppr. removes the point picked', sound.points.length === count - 1 && !sound.points.some((p) => p.id === moved.id), { before: count, after: sound.points.length });
    // Warp: the Tempo value shows; a line carried becomes a warp marker.
    await clickTool('mode_warp');
    check('Warp shows its Tempo', await boxOf('project_view_slicer_timeline_slice_tempo'));
    await shot('06_warp');
    // Cellules: each slice a Scene with its clip.
    const scenesBefore = ((await tl(pid)).scenes || []).length;
    await clickTool('cells');
    await wait(1500);
    timeline = await tl(pid);
    check('Cellules: one Scene per slice', (timeline.scenes || []).length - scenesBefore === sound.slices.length, { before: scenesBefore, after: (timeline.scenes || []).length, slices: sound.slices.length });
    // Motif view.
    await op(pid, 'clip.view', { clip_id: clip.clip_id, view: 'motif' });
    await wait(3000);
    const motifNode = sliceNode.replace(/_slice$/, '_motif');
    const motif = await waitBox(motifNode);
    check('Motif view laid', motif, motif);
    await waitBox('project_view_slicer_timeline_slice_shuffle');
    await shot('07_motif');
    sound = await read(mediaId);
    const steps = sound.motif.steps.length;
    const unit = await page.evaluate(async () => (await import('/eVe/elements/system_ui_tokens.js')).SYSTEM_UI_METRICS.unitPx);
    const stepX = (index) => motif.x + (index + 0.5) * (motif.width / steps);
    const stepY = motif.y + motif.height - unit / 2;
    // A step picked, then a slice touched on the strip: the step plays that slice.
    await page.mouse.click(stepX(2), stepY);
    await wait(1800);
    const slices = sound.slices;
    const xOfFrame = (frame) => motif.x + ((frame - from) / span) * motif.width;
    // A slice shown on the screen, other than the one step 2 plays.
    const lastSlice = slices.map((slice, index) => ({ index, mid: xOfFrame((slice.start + slice.end) / 2) }))
        .filter((entry) => entry.index !== sound.motif.steps[2].slice && entry.mid > motif.x + 20 && entry.mid < motif.x + 900).pop().index;
    const sliceMid = (slices[lastSlice].start + slices[lastSlice].end) / 2;
    await page.mouse.click(motif.x + ((sliceMid - from) / span) * motif.width, motif.y + unit);
    await wait(2500);
    sound = await read(mediaId);
    check('a step takes the slice touched', sound.motif.steps[2].slice === lastSlice, { step2: sound.motif.steps[2], lastSlice });
    await shot('08_step_given');
    // A hold on a step unfolds its lines.
    await page.mouse.move(stepX(4), stepY);
    await page.mouse.down();
    await wait(900);
    await page.mouse.up();
    await wait(1500);
    await shot('09_lines_unfolded');
    // A drag along the Force line (just above the steps) lowers step 4's force.
    const forceY = motif.y + motif.height - unit - unit * 0.85;
    await page.mouse.move(stepX(4), forceY);
    await page.mouse.down();
    await page.mouse.move(stepX(4) + 2, forceY + 3);
    await wait(60);
    await page.mouse.move(stepX(4) + 3, forceY + 4);
    await page.mouse.up();
    await wait(2500);
    sound = await read(mediaId);
    check('the Force line sets the step', (sound.motif.steps[4].force ?? 99) < 99, { step4: sound.motif.steps[4] });
    await shot('10_force_set');
    // Mélanger: the free order's slices dealt anew.
    const dealt = JSON.stringify(sound.motif.steps.map((s) => s.slice));
    await clickTool('shuffle');
    sound = await read(mediaId);
    check('Mélanger deals the slices anew', JSON.stringify(sound.motif.steps.map((s) => s.slice)) !== dealt);
    const length = sound.motif.steps.length;
    await clickTool('duplicate');
    sound = await read(mediaId);
    check('Dupl. doubles the Motif', sound.motif.steps.length === length * 2, { before: length, after: sound.motif.steps.length });
    await shot('11_motif_doubled');
    await clickTool('motif_listen');
    check('no page error', report.errors.length === 0, report.errors);
    check('no slice failure in the console', !report.console.some((line) => line.includes('timeline_slice_failed')), report.console.filter((l) => l.includes('slice')));
} catch (error) { report.errors.push(String(error?.stack || error)); console.log('ERROR', error); }
finally { write(); console.log('DONE', OUT); await close(); process.exit(0); }
