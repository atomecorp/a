// R-183: a strip's REC lights in the recording red while its take runs, through the real path — the Molecule
// runtime's generic recording (fake Chromium microphone), its takes event, the console laid again — and goes out at the stop.
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/console_rec_light'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const checks = {}; const errors = [];
const home = createReport('rec_light');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 1000 });
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 300)));
// The REC tool's subtree, and whether it carries the recording red's glyph light.
const rec = () => page.evaluate(async () => {
    const { BEVY_MENU_TOKENS } = await import('/eVe/intuition/ribbon/bevy_ui_menu_surface.js');
    const red = JSON.stringify(BEVY_MENU_TOKENS.recordingGlow.glyph.color);
    const found = [];
    for (const [, e] of window.eveBevyUiRuntime.state.trees) { const t = e?.tree; if (!t) continue;
        const w = (n) => { if (/_audio_module_\d+$/.test(String(n.id)) && JSON.stringify(n).includes('"REC"')) found.push(JSON.stringify(n)); (n.children || []).forEach(w); }; w(t.root); }
    return { count: found.length, red: found.map((s) => s.includes(red)) };
});
try {
    const { id: pid } = await openNewProject(page, `r183_rec_${Date.now()}`);
    await app(page, `await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'S1', projectId: arg, parentId: arg,
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '80px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false });`, pid);
    await app(page, `const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('mix', { projectId: arg });`, pid);
    for (let i = 0; i < 40 && !(await rec()).count; i += 1) await wait(500);
    await wait(1500);
    const before = await rec();
    checks.rec_unlit_at_rest = { ok: before.count > 0 && before.red.every((r) => !r), v: before };
    const started = await app(page, `const api = window.eveMoleculeTimelineApi; const group_id = api.getActiveGroupTimelineId();
        const tl = api.readGroupTimeline({ group_id }).timeline; const track = tl.tracks.find((t) => t.role === 'content');
        window.__probeTake = { group_id }; return api.startGroupTimelineGenericRecording({ group_id, track_id: track.track_id, source_kind: 'audio', record_source: 'audio' });`);
    await wait(1500);
    await page.screenshot({ path: path.join(OUT, '01_taking.png') });
    const during = await rec();
    checks.rec_red_while_taking = { ok: during.red.some(Boolean), v: { started, during } };
    const stopped = await app(page, `return window.eveMoleculeTimelineApi.stopGroupTimelineGenericRecording({ group_id: window.__probeTake.group_id });`);
    await wait(1500);
    await page.screenshot({ path: path.join(OUT, '02_stopped.png') });
    const after = await rec();
    checks.rec_out_after_stop = { ok: after.count > 0 && after.red.every((r) => !r), v: { ok: stopped?.ok, after } };
} catch (error) { errors.push(String(error?.stack || error)); }
fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify({ checks, errors }, null, 2)}\n`);
for (const [k, c] of Object.entries(checks)) console.log(`${c.ok ? 'OK' : 'NO'} ${k}`);
if (errors.length) console.log('errors', errors.slice(0, 5));
await close();
