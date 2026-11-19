// R-178 on the real Timeline (Web, dev server 3001): a drum clip's motifs (letters, Nouveau, Rempl.), the Couloirs
// panel, the markers and signature on the ruler, the structure tools of a chosen Scene; rail definitions; page errors.
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/sequencer_ui');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? '').slice(0, 200)); };
const note = (k, v) => { report.notes[k] = v; write(); };
const home = createReport('sequencer_ui');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 820 });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`console ${m.text().slice(0, 300)}`); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const tl = (pid) => app(page, `return window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg }).timeline;`, pid);
const op = (pid, operation, command) => app(page, `return window.eveMoleculeTimelineApi.applyGroupTimelineOperation({ group_id: arg.pid, operation: arg.operation, command: arg.command });`, { pid, operation, command });
const content = (body, arg) => app(page, `const { readMountedProjectViewContent } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    const content = readMountedProjectViewContent(); ${body}`, arg);
const rail = () => content(`return content.railDefinitions().map((d) => d.key);`, null);
const invoke = (key, payload = {}) => content(`const d = content.railDefinitions().find((e) => e.key === arg.key);
    if (!d) return { ok: false, error: 'missing ' + arg.key }; const r = await content.invokeRailTool(d, { payload: arg.payload }); return JSON.parse(JSON.stringify(r ?? null));`, { key, payload });
const nodes = (src) => page.evaluate(async (s) => {
    const rx = new RegExp(s); const out = []; const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js');
    for (const [, entry] of window.eveBevyUiRuntime.state.trees) { const tree = entry?.tree; if (!tree) continue;
        const walk = (n) => { if (rx.test(String(n.id))) out.push({ id: n.id, text: n.text || n.content?.text, box: locateBevyUiNode({ node: tree.root, nodeId: n.id })?.box || null }); (n.children || []).forEach(walk); };
        walk(tree.root); }
    return out; }, src);
const gesture = (intent) => content(`return JSON.parse(JSON.stringify(await content.handleEvent(arg) ?? null));`, intent);
try {
    const opened = await openNewProject(page, `seq_${Date.now()}`);
    const pid = opened.id;
    const made = await app(page, `
        const { encodeSmfFromEvents } = await import('/eVe/domains/midi/smf.js');
        const { buildMidiFile, importMidiMedia } = await import('/eVe/intuition/tools/audio_to_midi/result_media.js');
        const out = []; for (let s = 0; s < 16; s += 1) { const at = s * 125; const p = s % 8 === 0 ? 36 : s % 8 === 4 ? 38 : 42;
            out.push({ at_ms: at, bytes: [0x99, p, 100] }, { at_ms: at + 100, bytes: [0x89, p, 0] }); }
        const r = await importMidiMedia({ file: buildMidiFile({ bytes: encodeSmfFromEvents({ events: out }), sourceName: 'Batterie' }), projectId: arg, properties: { name: 'Batterie' }, origin: 'midi' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false });
        return { ok: r.ok, id: r.atomeId, error: r.error };`, pid);
    note('made', made);
    if (!made.ok) throw new Error(`midi_import_failed: ${made.error}`);
    await wait(1500);
    await app(page, `const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });`, pid);
    await wait(3500);
    const slot = (await tl(pid)).tracks.find((t) => t.empty_slot);
    await app(page, `return window.eveMoleculeTimelineApi.applyGroupTimelineBatch({ group_id: arg.pid, operations: [
        { operation: 'molecule.clip.add', command: { clip_id: 'clip_drum', track_id: arg.track, kind: 'midi', source: { type: 'atome', atome_id: arg.id },
            timeline: { start_seconds: 0, duration_seconds: 8, source_in_seconds: 0, source_out_seconds: 8 }, next_empty_track_id: 'track_empty_d', next_empty_track_name: 'Piste' } },
        { operation: 'molecule.view.set', command: { y_zoom: 4, focus: { track_id: arg.track } } }] });`, { pid, id: made.id, track: slot.track_id });
    await wait(3500);
    // The clip chosen: its rail.
    await gesture({ type: 'project_view.timeline.gesture', target: 'clip', clipId: 'clip_drum', phase: 'press', event: { client_x: 1, client_y: 1 } });
    await gesture({ type: 'project_view.timeline.gesture', target: 'clip', clipId: 'clip_drum', phase: 'release', event: { client_x: 1, client_y: 1 } });
    await wait(1500);
    await shot('01_drum_grid');
    const keys1 = await rail();
    note('rail_clip', keys1);
    check('drum rail: brushes, motifs, Couloirs', ['timeline_step_brush_roll', 'timeline_step_motif', 'timeline_step_motif_new', 'timeline_step_motif_fill'].every((k) => keys1.includes(k)), keys1);
    note('motif_new', await invoke('timeline_step_motif_new'));
    await wait(2000);
    const letters = await nodes('_motif\\d+$');
    check('Nouveau: every bar still plays A', letters.length >= 2 && letters.every((n) => n.text === 'A'), letters.map((n) => n.text));
    const plate = (await nodes('_motif1_plate$'))[0];
    if (plate?.box) {
        const c = await page.locator('#eve_surface_project').boundingBox();
        await page.mouse.click(c.x + plate.box.x + plate.box.width / 2, c.y + plate.box.y + plate.box.height / 2);
        await wait(1500);
        const again = await nodes('_motif\\d+$');
        check('a touch on bar 2 plate passes it to B', again.find((n) => /_motif1$/.test(n.id))?.text === 'B', again.map((n) => n.text));
        check('the edited motif B bar is lit', (await nodes('_motif1_lit$')).length === 1 && (await nodes('_motif0_lit$')).length === 0, null);
    } else note('plate', 'bar 2 plate not found');
    note('motif_fill', await invoke('timeline_step_motif_fill'));
    await wait(1500);
    const keys2 = await content(`return content.railDefinitions().filter((d) => d.key.startsWith('timeline_step_motif')).map((d) => ({ key: d.key, active: d.active, values: d.rollerValues, value: d.rollerValue }));`, null);
    check('Rempl. lit on the edited motif B', keys2.find((d) => d.key === 'timeline_step_motif_fill')?.active === true && keys2.find((d) => d.key === 'timeline_step_motif')?.values?.join('') === 'AB', keys2);
    const filled = await nodes('_motif\\d+$');
    check('Rempl. on the fourth bar', filled.find((n) => /_motif3$/.test(n.id))?.text === 'Rempl.', filled.map((n) => n.text));
    await shot('02_motifs');
    // A pad held: its Son panel.
    const pad = (await nodes('_pad\\d+$')).find((n) => n.box && n.box.height > 4);
    if (pad) {
        const c = await page.locator('#eve_surface_project').boundingBox();
        await page.mouse.move(c.x + pad.box.x + pad.box.width / 2, c.y + pad.box.y + pad.box.height / 2);
        await page.mouse.down(); await wait(1100); await page.mouse.up(); await wait(1800);
        const sound = await nodes('eve_bevy_panel_timeline_step_sound');
        check('a pad held opens its Son panel', sound.length > 0, sound.slice(0, 2).map((n) => n.id));
        await shot('02b_son_panel');
        const close = await content(`const m = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_step_sound_runtime.js'); return Object.keys(m);`, null);
        note('son_exports', close);
    } else note('pad', 'no pad found');
    // Couloirs panel.
    const laneKey = keys1.find((k) => k === 'timeline_midi_lanes' || k === 'timeline_media_lanes');
    if (laneKey) {
        note('lanes_open', await invoke(laneKey));
        await wait(1500);
        const panel = await nodes('eve_bevy_panel_timeline_lanes');
        check('Couloirs panel open', panel.length > 0, panel.slice(0, 3).map((n) => n.id));
        await shot('03_couloirs');
        await invoke(laneKey);
        await wait(800);
    } else note('lanes_tool', 'not on the drum rail (piano view only)');
    // Markers and a signature change on the ruler.
    note('marker', await op(pid, 'marker.add', { marker_id: 'mk_1', name: 'Refrain', time_seconds: 4 }));
    note('tempo', await op(pid, 'transport.tempo', { tempo: 120, start_seconds: 4, beats_per_bar: 3, beat_unit: 4 }));
    await wait(2000);
    const marks = await nodes('project_view_timeline_(marker|signature)_');
    check('marker and its name on the ruler', marks.some((n) => n.text === 'Refrain'), marks.map((n) => n.text || n.id));
    check('signature 3/4 on the ruler', marks.some((n) => n.text === '3/4'), marks.map((n) => n.text || n.id));
    await shot('04_ruler_marks');
    // A Scene chosen: its structure tools.
    note('scene', await op(pid, 'scene.add', { scene_id: 'scene_a', name: 'Intro', start_frame: 0, duration_frames: 4 * 48000 }));
    await wait(1200);
    await gesture({ type: 'project_view.timeline.gesture', target: 'scene', sceneId: 'scene_a', phase: 'press', event: { client_x: 1, client_y: 1, x: 1, y: 1 } });
    await gesture({ type: 'project_view.timeline.gesture', target: 'scene', sceneId: 'scene_a', phase: 'release', event: { client_x: 1, client_y: 1, x: 1, y: 1 } });
    await wait(1200);
    const keys3 = await rail();
    note('rail_scene', keys3);
    check('structure tools on a chosen Scene', keys3.some((k) => /structure/.test(k)), keys3.filter((k) => /structure/.test(k)));
    await shot('05_scene_structure');
    const dup = keys3.find((k) => /structure.*dup/.test(k));
    if (dup) {
        const before = (await tl(pid)).scenes.length;
        note('dup', await invoke(dup));
        await wait(1500);
        const after = await tl(pid);
        check('Dupl. adds the next section with its clips', after.scenes.length === before + 1 && after.clips.length >= 2, { scenes: after.scenes.length, clips: after.clips.length });
    }
} catch (error) { report.errors.push(String(error?.stack || error)); console.log('ERROR', error); }
finally { write(); console.log('errors', report.errors.length, report.errors.slice(0, 6)); await close(); process.exit(0); }
