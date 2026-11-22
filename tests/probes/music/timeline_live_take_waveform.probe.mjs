// R-247 Web probe (REC-02): while a take runs in the Timeline view (the bottom Enr., its medium Audio, real clicks on
// the canvas), its block grows on the track with the peaks heard so far; after Stop the take is a clip whose record
// carries its waveform's peaks and whose media strip is drawn (user, 21 Nov. 2026: « quand j'arrête, la forme d'onde
// est perdue »). The microphone is Chromium's fake device (its beep). Isolated server: PROBE_ISOLATED=1 PROBE_PREBUILT_SERVER=1.
// node tests/probes/music/timeline_live_take_waveform.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait, awaitBevyUiNodeTarget, clickCanvasTarget } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/timeline_live_take_waveform');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], samples: [], errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let failed = 0;
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); if (!ok) failed += 1; console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const home = createReport('timeline_live_take_waveform');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 820 });
await page.context().grantPermissions(['microphone']);
page.on('console', (m) => { const t = m.text(); if (/waveform|peaks|texture|error/i.test(t)) report.errors.push(`console.${m.type()} ${t.slice(0, 300)}`); });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const ROW = 'project_view_timeline_row';
const click = async (nodeId) => {
    const target = await awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs: 8000 });
    if (!target) throw new Error(`node_missing:${nodeId}`);
    await clickCanvasTarget(page, target);
    await wait(600);
};
// The take's block and its bars as painted (the mounted trees), with the recorder's own peaks.
const live = () => app(page, `
    const runtime = window.eveBevyUiRuntime; let block = null; let bars = 0;
    const visit = (n) => { if (!n) return; const id = String(n.id || '');
        if (id === 'project_view_timeline_live_take') block = n.size || n.style?.size || true;
        if (id.startsWith('project_view_timeline_live_take_bar_')) bars += 1;
        (n.children || []).forEach(visit); };
    for (const [, entry] of runtime.state.trees) visit(entry.tree.root);
    const { readMountedProjectViewContent } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    const content = readMountedProjectViewContent();
    const state = content?.readState?.() || {};
    const api = window.eveMoleculeTimelineApi;
    const transport = api?.readGroupTimelineTransport?.({ group_id: state.ownerId }) || null;
    let context = null;
    try { const ctx = window.Squirrel?.av?.audio?.__call_backend_method?.('shared_context'); context = ctx ? { state: ctx.state, time: ctx.currentTime } : null; } catch (_) { }
    return { block, bars, recording: content?.isRecordingOnTheFly?.() === true, playing: state.playing, playhead: state.playheadSeconds,
        transport: transport && { ok: transport.ok, playing: transport.playing, position: transport.position }, context };`);

try {
    const pid = (await openNewProject(page, `r247_${Date.now()}`)).id;
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(4000);
    await page.mouse.click(4, 4);
    await shot('01_timeline');
    const MENU = 'eve_bevy_ui_main_menu_tool_capture';
    const recNow = () => app(page, "const { readMountedProjectViewContent } = await import('/eVe/domains/rendering/project_view_surface_runtime.js'); return readMountedProjectViewContent()?.isRecordingOnTheFly?.() === true;");
    // The bottom Enr. (its medium Audio) starts the take in the Timeline view, the next touch ends it.
    await click(MENU);
    for (let tries = 0; tries < 10 && !(await recNow()); tries += 1) await wait(300);
    report.samples.push({ step: 'after_rec_touch', recording: await recNow() });
    // The take's playback starts once its input is open (seconds on a loaded machine): sampled from then on.
    for (let tries = 0; tries < 50 && !(await live()).playing; tries += 1) await wait(300);
    for (let index = 1; index <= 4; index += 1) {
        await wait(1000);
        const sample = await live();
        report.samples.push({ at_s: index, ...sample }); write();
        await shot(`0${index + 1}_during_${index}s`);
    }
    await click(MENU);
    report.samples.push({ step: 'after_stop_click', recording: await recNow() });
    await wait(2500);
    await shot('06_after_stop');
    const during = report.samples.filter((x) => x.at_s);
    check('recording while sampled', during.every((s) => s.recording));
    check('the take block is drawn during the take', during.every((s) => s.block));
    check('waveform bars drawn during the take (from the first second)', during[0].bars > 0, during.map((s) => s.bars));
    check('the waveform grows as the take runs', during.at(-1).bars > during[0].bars, during.map((s) => s.bars));
    const after = await live();
    check('the live block is gone after Stop', !after.block && !after.recording, after);

    // After Stop: the clip of the take, its record's peaks and the media strip nodes drawn for it.
    const clipState = () => app(page, `
        const { readMountedProjectViewContent } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
        const state = readMountedProjectViewContent()?.readState?.() || {};
        const timeline = window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: state.ownerId }).timeline;
        const clips = [];
        for (const clip of (timeline?.clips || [])) { const id = String(clip.source?.atome_id || '');
            const rec = id ? await window.Atome.getStateCurrent(id) : null; const p = rec?.properties || rec?.props || rec?.particles || {};
            clips.push({ clip_id: clip.clip_id, kind: clip.kind, atome_id: id, hasRecord: Boolean(rec), timeline: clip.timeline,
                peaks: Array.isArray(p.waveform_peaks) ? p.waveform_peaks.length : Array.isArray(p.peaks) ? p.peaks.length : -1,
                media_url: String(p.media_url || p.src || '').slice(0, 120) }); }
        const runtime = window.eveBevyUiRuntime; const media = [];
        const ids = new Set(clips.map((c) => c.clip_id));
        const visit = (n) => { if (!n) return; const id = String(n.id || '');
            if ([...ids].some((c) => id.includes(c.replace(/[^a-z0-9_]/gi, '_')) || id.includes(c)) && /media/.test(id)) media.push({ id, kind: n.content?.kind || n.kind || '', peaks: Array.isArray(n.content?.peaks) ? n.content.peaks.length : -1, src: String(n.content?.source || n.content?.src || '').slice(0, 120) });
            (n.children || []).forEach(visit); };
        for (const [, entry] of runtime.state.trees) visit(entry.tree.root);
        return { clips, media };`);
    await click(`${ROW}_transport_start`);
    for (const at of [1, 4, 8]) {
        await wait(at === 1 ? 0 : (at === 4 ? 3000 : 4000));
        const s = await clipState();
        report.samples.push({ after_stop_s: at + 2.5, ...s }); write();
        await shot(`07_after_stop_${at}`);
    }
    const last = report.samples.at(-1);
    const audioClip = last.clips.find((c) => c.kind === 'audio');
    check('an audio clip exists after Stop', Boolean(audioClip), last.clips);
    check('the clip record is loaded', audioClip?.hasRecord, audioClip);
    check('the clip record carries waveform peaks', audioClip?.peaks > 0, audioClip);
    check('a media strip is drawn for the clip', last.media.length > 0, last.media);
} catch (error) {
    report.errors.push(String(error?.stack || error)); write();
    console.log('FAIL', error?.message || error);
    failed += 1;
}
write();
await close();
process.exitCode = failed ? 1 : 0;
