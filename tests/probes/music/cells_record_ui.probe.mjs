// R-182 acceptance on the Web (real clicks on the canvas, real hit-test): the row above the bottom band, Réglages,
// Enr. unfolded and its medium, the metronome panel by a hold, a take into an empty cell, a new Scene from the
// empty zone, a hold raising the takes' plates (the take chosen starts), the phone's « Vue » unfolded above.
// node tests/probes/music/cells_record_ui.probe.mjs [width height tag]
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait, awaitBevyUiNodeTarget, findBevyUiNodeTarget, clickCanvasTarget } from '../molecule_ui_acceptance_support.mjs';

const [W = '1180', H = '820', TAG = 'ipad'] = process.argv.slice(2);
const OUT = path.resolve(`temp/probe_reports/music/cells_record_ui/${TAG}`);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const note = (k, v) => { report.notes[k] = v; write(); };
const home = createReport(`cells_record_ui_${TAG}`);
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: Number(W), height: Number(H) });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) report.errors.push(`console ${m.text().slice(0, 300)}`); });
page.on('response', (r) => { if (r.status() === 404) report.errors.push(`404 ${r.url().slice(0, 200)}`); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const tl = (pid) => app(page, 'return window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg }).timeline;', pid);
const cellsState = (pid) => app(page, 'return window.eveMoleculeTimelineApi.readGroupTimelineCells({ group_id: arg });', pid);
const batch = (pid, operations) => app(page, 'return window.eveMoleculeTimelineApi.applyGroupTimelineBatch({ group_id: arg.pid, operations: arg.operations });', { pid, operations });
const act = (name, args) => app(page, `const { SAMPLE_EDIT_ACTIONS, sampleEditFailure } = await import('/eVe/domains/sample_edit/sample_edit_commands.js');
    try { return await SAMPLE_EDIT_ACTIONS[arg.name](arg.args); } catch (error) { return sampleEditFailure(error); }`, { name, args });
const node = (nodeId, timeoutMs = 6000) => awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs });
const click = async (nodeId) => {
    const target = await node(nodeId);
    if (!target) throw new Error(`node_missing:${nodeId}`);
    await clickCanvasTarget(page, target);
    await wait(900);
    return target;
};
// Every node id painted on the surface (the trees as mounted), to check presence and absence.
const paintedIds = () => app(page, `
    const runtime = window.eveBevyUiRuntime; const ids = [];
    const visit = (n) => { if (!n) return; ids.push(String(n.id || '')); (n.children || []).forEach(visit); };
    for (const [, entry] of runtime.state.trees) visit(entry.tree.root);
    return ids;`);
const ROW = 'project_view_timeline_row';
// The views' selector and Réglages lie on the row (R-270, 22 Nov. 2026). The view is chosen by its canonical
// `view.set` here: the selector is not under test.
const SETTINGS = `${ROW}_timeline_settings`;
// Prises, at the row's left end, unfolds above it on every screen (R-275, 22 Nov. 2026).
const recordChoice = (medium) => `${ROW}_above_transport_record_${medium}`;

try {
    const pid = (await openNewProject(page, `r182_${Date.now()}`)).id;
    const made = await app(page, `
        const r = await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'Voix', projectId: arg, parentId: arg,
            src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '400px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false });
        return String(r?.id || r?.atome_id || r?.atome?.id || '');`, pid);
    await wait(2000);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(4000);
    const divided = await act('slice_divide', { media_atome_id: made, parts: 4 });
    const cells = await act('slices_to_cells', { media_atome_id: made, project_id: pid });
    note('setup', { divided: divided.ok, cells: cells.ok, scenes: cells.scene_ids?.length });
    // A second content track, empty, to record into.
    let timeline = await tl(pid);
    const slot = timeline.tracks.find((t) => t.empty_slot);
    await batch(pid, [{ operation: 'track.add', command: { track_id: 'track_rec', section_id: slot.section_id, name: 'Prise', role: 'content' } }]).catch(() => null);
    await wait(2500);
    timeline = await tl(pid);
    note('tracks', timeline.tracks.map((t) => ({ id: t.track_id, name: t.name, empty: !!t.empty_slot, role: t.role })));
    await shot('01_timeline');

    // 1. The row in the Timeline view (no views: they lie in the rail's Multitrack, R-253); the rail without Start, Record.
    let ids = await paintedIds();
    for (const key of ['transport_record', 'transport_start']) check(`row_has_${key}`, ids.includes(`${ROW}_${key}`));
    check('row_no_views', !ids.some((id) => id.startsWith(`${ROW}_multitrack_`)));
    check('row_no_edit_in_timeline', !ids.includes(`${ROW}_transport_edit`));
    check('row_has_settings', ids.includes(SETTINGS));
    check('rail_no_start_tool', !ids.some((id) => id.includes('timeline_start') && !id.startsWith(ROW)));
    check('rail_no_record_palette', !ids.some((id) => id.includes('timeline_record_')));

    // 2. Enr. unfolds Audio, Vidéo, MIDI inline; MIDI chosen in the Cells is kept as the medium.
    await batch(pid, [{ operation: 'view.set', command: { layout: 'cells' } }]);
    await wait(2500);
    timeline = await tl(pid);
    check('cells_view_chosen_by_row', timeline.view.layout === 'cells', timeline.view);
    check('cells_default_play_mode', (timeline.view.cells_mode || 'play') === 'play', timeline.view.cells_mode);
    ids = await paintedIds();
    check('row_has_edit_in_cells', ids.includes(`${ROW}_transport_edit`) && ids.includes(SETTINGS));
    await click(`${ROW}_transport_record`);
    ids = await paintedIds();
    check('record_unfolds_three_media', ['audio', 'video', 'midi'].every((m) => ids.includes(recordChoice(m))));
    await shot('02_record_unfolded');
    // A take touched alone arms nothing: it is carried onto its track (« Prises », user 20 Nov. 2026).
    const sourceBefore = timeline.view.record_source;
    await click(recordChoice('midi'));
    await wait(1500);
    timeline = await tl(pid);
    check('take_touch_arms_nothing', timeline.view.record_source === sourceBefore && !(timeline.record_regions || []).length, timeline.view.record_source);
    ids = await paintedIds();
    check('record_folded_after_choice', !ids.includes(recordChoice('audio')));
    await batch(pid, [{ operation: 'view.set', command: { record_source: 'audio' } }]);
    await wait(1200);

    // 3. Réglages with no selection: Longueur in the rail, the six palettes on the row (R-231 C1).
    await click(SETTINGS);
    await wait(1500);
    ids = await paintedIds();
    const lengthTool = ids.find((id) => id.includes('timeline_cells_default_length'));
    check('settings_show_defaults', Boolean(lengthTool) && ids.some((id) => id.includes(`${ROW}_cells_launch`)), ids.filter((id) => id.includes('timeline_cells_default')).slice(0, 6));
    await shot('03_settings_defaults');
    await click(SETTINGS);

    // 4. A touch on an empty cell records it, the length of Réglages (1 bar), then the take lands as its clip.
    timeline = await tl(pid);
    const recTrack = timeline.tracks.find((t) => t.track_id === 'track_rec') || timeline.tracks.find((t) => t.role === 'content' && !timeline.clips.some((c) => c.track_id === t.track_id) && !t.empty_slot);
    note('rec_track', recTrack?.track_id || null);
    const firstScene = [...timeline.scenes].sort((a, b) => a.start_frame - b.start_frame)[0];
    const cellNode = (sceneId, trackId) => `project_view_timeline_cell_${sceneId}_${trackId}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const emptyCell = await findBevyUiNodeTarget(page, { nodePrefix: 'project_view_timeline_cell_', treeId: '' });
    note('a_cell_node', emptyCell?.id || null);
    const recCellId = recTrack ? (await paintedIds()).find((id) => id.startsWith('project_view_timeline_cell') && id.includes(recTrack.track_id) && id.includes(firstScene.scene_id)) : null;
    note('rec_cell_node', { recCellId, guess: recTrack ? cellNode(firstScene.scene_id, recTrack.track_id) : null });
    if (recCellId) {
        await click(recCellId);
        await wait(600);
        const reading = await cellsState(pid);
        check('empty_cell_touch_records', reading.cells?.some((c) => c.recording), reading);
        await shot('04_cell_recording');
        // The count-in, the bar, then the take stored and laid: waited for, up to 15 s.
        let landed = [];
        for (let waited = 0; waited < 15000 && !landed.length; waited += 500) {
            await wait(500);
            timeline = await tl(pid);
            landed = timeline.clips.filter((c) => c.track_id === recTrack.track_id);
        }
        check('cell_take_landed', landed.length === 1, landed.map((c) => ({ start: c.timeline.start_seconds, dur: c.timeline.duration_seconds, loop: c.block_loop || c.loop || null })));
        await shot('05_cell_landed');
    }

    // 5. A touch on the empty zone beside the track makes a new Scene that records.
    const scenesBefore = (await tl(pid)).scenes.length;
    const cellsArea = await node('project_view_timeline_cells');
    const box = await page.locator('#eve_surface_project').boundingBox();
    const recRow = recCellId ? await node(recCellId) : null;
    if (cellsArea && recRow) {
        // The slot right after the take track's last painted cell (one cell pitch further).
        const rowCells = [];
        for (const id of (await paintedIds()).filter((id) => /^project_view_timeline_cell_/.test(id) && id.endsWith(recTrack.track_id.replace(/[^a-zA-Z0-9_]/g, '_')))) {
            const t = await node(id, 1500);
            if (t) rowCells.push(t);
        }
        rowCells.sort((a, b) => a.x - b.x);
        const pitch = rowCells.length > 1 ? rowCells[1].x - rowCells[0].x : 65;
        note('zone_click', { cells: rowCells.length, lastX: rowCells.at(-1)?.x, pitch });
        await page.mouse.click(box.x + rowCells.at(-1).x + pitch, box.y + recRow.y);
        await wait(1500);
        timeline = await tl(pid);
        const reading = await cellsState(pid);
        check('zone_touch_new_scene', timeline.scenes.length === scenesBefore + 1, { before: scenesBefore, after: timeline.scenes.length });
        check('zone_touch_records', reading.cells?.some((c) => c.recording), reading);
        await wait(5000);
    }

    // 6. A hold on an empty cell raises the takes' plates (Prise audio, vidéo, MIDI) and records nothing yet; slid onto
    // Prise audio and released there, the take starts in that medium on the grid (user, 22 Nov. 2026).
    timeline = await tl(pid);
    const ordered = [...timeline.scenes].sort((a, b) => a.start_frame - b.start_frame);
    const free = ordered.find((s) => !timeline.clips.some((c) => c.track_id === recTrack?.track_id
        && c.timeline.start_seconds * 48000 < s.start_frame + s.duration_frames && (c.timeline.start_seconds + c.timeline.duration_seconds) * 48000 > s.start_frame));
    const holdId = free ? (await paintedIds()).find((id) => id.startsWith('project_view_timeline_cell') && id.includes(recTrack.track_id) && id.includes(free.scene_id)) : null;
    note('hold_cell', holdId);
    const PLATE = (medium) => `project_view_cells_hold_take_${medium}`;
    if (holdId) {
        const target = await node(holdId);
        await page.mouse.move(target.x, target.y);
        await page.mouse.down();
        await wait(1100);
        ids = await paintedIds();
        check('hold_shows_take_plates', ['audio', 'video', 'midi'].every((m) => ids.includes(PLATE(m))), ids.filter((id) => id.startsWith('project_view_cells_hold_')));
        let reading = await cellsState(pid);
        check('hold_records_nothing_yet', !reading.cells?.some((c) => c.recording), reading);
        await shot('06_hold_take_plates');
        const audioPlate = await node(PLATE('audio'));
        if (audioPlate) {
            await page.mouse.move(audioPlate.x, audioPlate.y, { steps: 8 });
            await wait(400);
            await shot('06b_hover_audio');
        }
        await page.mouse.up();
        await wait(800);
        ids = await paintedIds();
        check('plates_fold_after_choice', !ids.includes(PLATE('audio')));
        let started = false;
        for (let waited = 0; waited < 6000 && !started; waited += 300) {
            await wait(300);
            reading = await cellsState(pid);
            started = reading.cells?.some((c) => c.recording && String(c.key).includes(free.scene_id));
        }
        check('released_on_audio_records', started, reading);
        let landed = [];
        for (let waited = 0; waited < 15000 && !landed.length; waited += 500) {
            await wait(500);
            timeline = await tl(pid);
            landed = timeline.clips.filter((c) => c.track_id === recTrack.track_id
                && Math.abs(c.timeline.start_seconds * 48000 - free.start_frame) < 4800);
        }
        check('held_take_landed_as_audio', landed.length === 1 && (landed[0].kind || 'audio') === 'audio', landed.map((c) => ({ kind: c.kind, start: c.timeline.start_seconds })));
    }

    // 6b. A hold on the empty zone raises the same plates; released off them they stay, and a touch on one chooses it.
    if (recRow) {
        const rowCells = [];
        for (const id of (await paintedIds()).filter((id) => /^project_view_timeline_cell_/.test(id) && id.endsWith(recTrack.track_id.replace(/[^a-zA-Z0-9_]/g, '_')))) {
            const t = await node(id, 1500);
            if (t) rowCells.push(t);
        }
        rowCells.sort((a, b) => a.x - b.x);
        const pitch = rowCells.length > 1 ? rowCells[1].x - rowCells[0].x : 65;
        const scenesBeforeZone = (await tl(pid)).scenes.length;
        await page.mouse.move(rowCells.at(-1).x + pitch, recRow.y);
        await page.mouse.down();
        await wait(1100);
        await page.mouse.up();
        await wait(600);
        ids = await paintedIds();
        check('zone_hold_plates_stay_after_release', ['audio', 'video', 'midi'].every((m) => ids.includes(PLATE(m))));
        let reading = await cellsState(pid);
        check('zone_hold_records_nothing', !reading.cells?.some((c) => c.recording) && (await tl(pid)).scenes.length === scenesBeforeZone, reading);
        await shot('06c_zone_hold');
        await click(PLATE('audio'));
        let started = false;
        for (let waited = 0; waited < 6000 && !started; waited += 300) {
            await wait(300);
            reading = await cellsState(pid);
            started = reading.cells?.some((c) => c.recording);
        }
        check('zone_plate_touch_records_new_scene', started && (await tl(pid)).scenes.length === scenesBeforeZone + 1, reading);
        await wait(6000);
    }

    // 7. The metronome panel by a hold on the rail's Métronome.
    ids = await paintedIds();
    const metroId = ids.find((id) => id.includes('timeline_metronome') && !id.includes('_label') && !id.includes('_icon'));
    note('metronome_node', metroId);
    if (metroId) {
        const target = await node(metroId);
        await page.mouse.move(target.x, target.y);
        await page.mouse.down();
        await wait(900);
        await page.mouse.up();
        await wait(1500);
        const open = await app(page, "const m = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js'); return m.isBevyPanelSurfaceOpen('timeline_metronome');");
        check('metronome_panel_opens_on_hold', open === true);
        await shot('07_metronome_panel');
        ids = await paintedIds();
        check('metronome_panel_lists_outputs', ids.some((id) => id.includes('timeline_metronome_output')));
        await app(page, "const m = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js'); return m.closeBevyPanelSurface('timeline_metronome');");
        await wait(800);
    }

    // 8. The inspector: Inspecteur off hides it; a selected empty cell shows its ruler.
    await click(`${ROW}_transport_edit`);
    await wait(1200);
    timeline = await tl(pid);
    check('edit_switch_sets_edit_mode', timeline.view.cells_mode === 'edit', timeline.view.cells_mode);
    // Aperçu off gives the inspector its room (mockup M7). Aperçu and Inspecteur are switches of the rail's Vue (R-253,
    // R-270), set here by their owners: the Vue palette is not under test.
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_visual_panel.js'); m.projectViewVisualPanel.setEnabled(false); return true;");
    await wait(1500);
    const previewOn = await app(page, "const m = await import('/eVe/domains/rendering/project_view_visual_panel.js'); return m.projectViewVisualPanel.isEnabled();");
    check('preview_switch_hides_preview', previewOn === false);
    const anEmpty = (await paintedIds()).find((id) => id.startsWith('project_view_timeline_cell_') && id.includes(recTrack?.track_id || '__'));
    if (anEmpty) {
        // The inspector shows once Inspecteur is lit (R-253); a cell chosen folds the views into traits.
        await batch(pid, [{ operation: 'view.set', command: { inspector: true } }]);
        await wait(1200);
        await click(anEmpty);
        await wait(1500);
        ids = await paintedIds();
        check('selected_cell_in_inspector', ids.includes('project_view_timeline_cell_detail'));
        await shot('08_cell_inspector');
        await batch(pid, [{ operation: 'view.set', command: { inspector: false } }]);
        await wait(1500);
        ids = await paintedIds();
        check('inspector_off_hides', !ids.includes('project_view_timeline_cell_detail'));
    }
} catch (error) { report.errors.push(String(error?.stack || error)); console.log('ERROR', error); }
finally {
    const passed = report.checks.filter((c) => c.ok).length;
    console.log(`RESULT ${passed}/${report.checks.length}`, 'errors', report.errors.length);
    write(); await close(); process.exit(0);
}
