// The Slicer's kernel on the real page (R-181): slices → linked cells that follow the points, the Motif (order,
// seed, roll, pitch, chance) compiled in Rust and rendered, rejouable from its seed, then laid in a cell and launched.
// node tests/probes/music/slicer_motif.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/slicer_motif');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail }); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail).slice(0, 600)); };
const home = createReport('slicer_motif');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
const tl = (pid) => app(page, 'return window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg }).timeline;', pid);
const act = (name, args) => app(page, `const { SAMPLE_EDIT_ACTIONS, sampleEditFailure } = await import('/eVe/domains/sample_edit/sample_edit_commands.js');
    try { return await SAMPLE_EDIT_ACTIONS[arg.name](arg.args); } catch (error) { return sampleEditFailure(error); }`, { name, args });
try {
    const pid = (await openNewProject(page, `slicer_motif_${Date.now()}`)).id;
    const made = await app(page, `const r = await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'Voix', projectId: arg, parentId: arg,
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '400px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false }); return String(r?.id || '');`, pid);
    await wait(2000);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(3000);
    const m = made;
    check('kernel exports compileSliceMotif (new WASM served)', await app(page, "const k = await import('/atome/src/application/audio_runtime/audio_kernels.js'); await k.loadAudioKernels(); return typeof k.audioKernels().compileSliceMotif;") === 'function');
    await act('slice_tempo_set', { media_atome_id: m, bpm: 120 });
    const rate = await app(page, "const s = await import('/eVe/domains/sample_edit/sample_edit_store.js'); return s.findSampleEdit(arg).source.sample_rate;", m);
    const d8 = await act('slice_divide', { media_atome_id: m, parts: 8 });
    check('divided in 8', d8.ok && d8.slices.length === 8, d8);
    const cells = await act('slices_to_cells', { media_atome_id: m, project_id: pid });
    check('slices_to_cells: 8 linked cells', cells.ok && cells.scene_ids.length === 8, cells);
    const before = await tl(pid);
    const clip2Before = before.clips.find((c) => c.clip_id === cells.clip_ids[1]);
    // Move point 1 (between slices 1 and 2) 24000 frames earlier: slice 1 shorter, slice 2 longer.
    const p1 = d8.points[0];
    const moved = await act('slice_point_move', { media_atome_id: m, point_id: p1.id, frame: p1.frame - 24000, mode: 'cut' });
    const after = await tl(pid);
    const clip2After = after.clips.find((c) => c.clip_id === cells.clip_ids[1]);
    const scene1 = after.scenes.find((s) => s.scene_id === cells.scene_ids[0]);
    const scene2 = after.scenes.find((s) => s.scene_id === cells.scene_ids[1]);
    check('moving a point relays the linked cells (same ids, new window)', moved.ok && moved.cells_link?.ok && clip2After
        && Math.abs(clip2After.timeline.source_in_seconds - (clip2Before.timeline.source_in_seconds - 24000 / rate)) < 1e-4
        && scene2.start_frame === scene1.start_frame + scene1.duration_frames, { link: moved.cells_link, before: clip2Before?.timeline, after: clip2After?.timeline, scene1, scene2 });
    const d4 = await act('slice_divide', { media_atome_id: m, parts: 4 });
    const after4 = await tl(pid);
    const linkedScenes = after4.scenes.filter((s) => s.scene_id.startsWith('scene_slice'));
    check('redivided in 4 (the moved point stays): extra Scenes removed, cells follow', d4.ok && d4.cells_link?.ok && linkedScenes.length === d4.slices.length
        && d4.slices.length === 5, { slices: d4.slices?.length, scenes: linkedScenes.length, link: d4.cells_link });
    const read = await act('motif_read', { media_atome_id: m });
    check('default Motif: 16 steps, each its slice in order', read.ok && read.motif.steps.length === 16 && read.motif.steps[6].slice === 1, read.motif);
    const set = await act('motif_set', { media_atome_id: m, order: 'random', seed: 13, division: '1/8' });
    const step = await act('motif_step_set', { media_atome_id: m, step: 3, roll: 3, pitch: 5, chance: 89, reverse: true });
    check('motif_set + motif_step_set kept', set.ok && step.ok && step.motif.order === 'random' && step.motif.steps[3].roll === 3 && step.motif.steps[3].pitch === 5, { set, step: step.motif?.steps?.[3] });
    const bad = await act('motif_step_set', { media_atome_id: m, step: 3, roll: 9 });
    check('a step the kernel refuses is never kept', !bad.ok && bad.error === 'INVALID_ARGUMENT', bad);
    const render = (seed) => app(page, `const { motifOf, renderMotif } = await import('/eVe/domains/sample_edit/slice_motif.js');
        const { findSampleEdit } = await import('/eVe/domains/sample_edit/sample_edit_store.js');
        const { readSourcePcm } = await import('/eVe/domains/sample_edit/sample_edit_runtime.js');
        const entry = findSampleEdit(arg.m); const motif = { ...motifOf(entry), seed: arg.seed };
        const t0 = performance.now(); const pcm = await renderMotif({ ...entry, motif }, await readSourcePcm(entry.source_atome_id, entry.source));
        const ch = pcm.channels[0]; let h = 0, peak = 0; for (let i = 0; i < ch.length; i += 7) { h = (h * 31 + Math.round(ch[i] * 1e5)) | 0; peak = Math.max(peak, Math.abs(ch[i])); }
        return { frames: ch.length, hash: h, peak, ms: Math.round(performance.now() - t0) };`, { m, seed });
    const r1 = await render(13), r2 = await render(13), r3 = await render(21);
    check('render: 16 eighths at 120 bpm = 4 s exactly, audible', r1.frames === Math.round(rate * 0.25) * 16 && r1.peak > 0.01, r1);
    check('render rejouable: same seed same sound, another seed another', r1.hash === r2.hash && r1.hash !== r3.hash, { r1, r2, r3 });
    const shuffled = await act('motif_shuffle', { media_atome_id: m });
    check('Mélanger (order random): a new seed', shuffled.ok && shuffled.motif.seed !== 13, shuffled.motif?.seed);
    const play = await act('motif_play', { media_atome_id: m });
    check('motif_play', play.ok, play);
    const toCell = await act('motif_to_cell', { media_atome_id: m, project_id: pid });
    check('motif_to_cell: a media and one new cell', toCell.ok && toCell.media_atome_id && toCell.scene_ids?.length === 1, toCell);
    const launched = await app(page, 'return window.eveMoleculeTimelineApi.triggerGroupTimelineCells({ group_id: arg.pid, cells: [{ scene_id: arg.scene, track_id: arg.track }], gesture: "press" });',
        { pid, scene: toCell.scene_ids?.[0], track: toCell.track_id });
    await wait(900);
    const state = await app(page, 'return window.eveMoleculeTimelineApi.readGroupTimelineCells({ group_id: arg });', pid);
    check('the Motif cell plays when launched', launched?.ok && state?.playing && state.cells?.[0]?.started, { launched, state });
    const undo = await act('edit_undo', { media_atome_id: m });
    check('undo: the last change undone (the Motif shuffle stays the project\'s own history)', undo.ok, undo);
} catch (error) { check('no exception', false, String(error?.stack || error)); }
finally {
    check('no page error', errors.length === 0, errors);
    fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
    console.log('SUMMARY', results.filter((r) => r.ok).length, '/', results.length);
    await close(); process.exit(0);
}
