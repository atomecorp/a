// Lyrics import on the real Web interface (isolated server): where the file lands decides what it becomes.
// 1. An LRC dropped on the Dashboard: a new project named after it opens, holding one prompteur (vault).
// 2. In that project, the import panel's « Ouvrir » tool (real touch on the canvas, the system file window answered
//    with an SRT): the prompteur joins THIS project.
// 2b. A drop on the open project's canvas: the same project.
// 3. In the Timeline view, the same import with a VTT: the prompteur joins the project and is laid as a clip.
// 3b. A file dropped on the canvas in the Timeline view: a clip as well.
// 4. A refused file (VTT without header): nothing is created, no project left behind.
// PROBE_PREBUILT_SERVER=1 node tests/probes/prompter/prompter_lyrics_import_ui.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openHome } from '../../helpers/probe_home.mjs';
import { clickCanvasTarget, wait } from '../molecule_ui_acceptance_support.mjs';

const FIX = path.resolve('tests/fixtures/lyrics');
const OUT = path.resolve('temp/probe_reports/prompter/prompter_lyrics_import_ui');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let failed = 0;
const check = (name, ok, detail) => {
    report.checks.push({ name, ok: !!ok, detail }); write();
    console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail ?? '').slice(0, 600));
    if (!ok) failed += 1;
    return !!ok;
};
const note = (k, v) => { report.notes[k] = v; write(); };
const { page, close } = await openHome({ report, write, check, view: 'desktop' });
await page.setViewportSize({ width: 1280, height: 860 });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const findNode = (source) => page.evaluate((test) => {
    const match = new Function('id', `return (${test})(id);`);
    const surface = document.getElementById('eve_surface_project');
    const rect = surface.getBoundingClientRect();
    for (let y = 0; y < rect.height; y += 5) {
        for (let x = 0; x < rect.width; x += 5) {
            const id = String(window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: rect.left + x, clientY: rect.top + y })?.nodeId || '');
            if (id && match(id)) {
                const on = (cx, cy) => String(window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: rect.left + cx, clientY: rect.top + cy })?.nodeId || '') === id;
                let right = x; while (on(right + 2, y + 2)) right += 2;
                let bottom = y; while (on(Math.round((x + right) / 2), bottom + 2)) bottom += 2;
                return { ok: true, id, x: rect.left + (x + right) / 2, y: rect.top + (y + bottom) / 2 };
            }
        }
    }
    return { ok: false };
}, source.toString());
const tap = (found) => clickCanvasTarget(page, { x: found.x, y: found.y, coordinate_source: 'scene', hit: { nodeId: found.id } });
// The person's projects (Fastify answers under `fastify`, Tauri under `tauri`).
const projectNames = () => page.evaluate(async () => {
    const listed = await window.AdoleAPI.projects.list();
    return [...(listed?.tauri?.projects || []), ...(listed?.fastify?.projects || [])]
        .map((p) => String(p.name || p.properties?.name || p.data?.name || ''));
});
const currentProject = () => page.evaluate(() => String(window.__currentProject?.id || ''));
// The prompteurs of a project, read from the vault (never the view).
const prompteurs = (pid) => page.evaluate(async (id) => {
    const records = (window.eveToolBase?.getProjectSceneState?.(id)?.records || []).filter((r) => !String(r.id).startsWith('__eve_'));
    const out = [];
    for (const r of records) {
        const props = (await window.Atome.getStateCurrent(r.id))?.properties || {};
        if (props.prompter) out.push({ id: r.id, name: props.name, text: props.text, cues: props.prompter.cues, dwell: props.playback_dwell_seconds, parent: props.parent_id || r.parent_id || null });
    }
    return out;
}, pid);
const dropOnSurface = (name, content) => page.evaluate(async ({ name, content }) => {
    const canvas = document.getElementById('eve_surface_project');
    const rect = canvas.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.items.add(new File([content], name, { type: '' }));
    const at = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + 500, clientY: rect.top + 300, dataTransfer: dt };
    const target = document.elementFromPoint(at.clientX, at.clientY) || canvas;
    target.dispatchEvent(new DragEvent('dragenter', at));
    for (let i = 0; i < 15; i += 1) { await new Promise((r) => setTimeout(r, 100)); target.dispatchEvent(new DragEvent('dragover', at)); }
    target.dispatchEvent(new DragEvent('drop', at));
    return `${target.tagName}#${target.id}`;
}, { name, content });
// The import panel opened, then its « Ouvrir » tool touched; the system window answered with `file`.
const importThroughPanel = async (file) => {
    await page.evaluate(() => import('/eVe/intuition/tools/media.js').then((m) => m.openMediaPanel({})));
    let open = { ok: false };
    for (let i = 0; i < 20 && !open.ok; i += 1) { await wait(500); open = await findNode((id) => /_footer_media_import_system$/.test(id)); }
    if (!open.ok) return { ok: false, error: 'open_tool_not_found' };
    const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
    await tap(open);
    (await chooser).setFiles(path.join(FIX, file));
    return { ok: true, tool: open.id };
};
const until = async (read, test, ms = 20000) => {
    const end = Date.now() + ms; let value = await read();
    while (!test(value) && Date.now() < end) { await wait(500); value = await read(); }
    return value;
};

try {
    // 1. Dashboard drop → its own project.
    const before = await projectNames();
    note('dash_drop_target', await dropOnSurface('simple.lrc', fs.readFileSync(path.join(FIX, 'simple.lrc'), 'utf8')));
    const pid = await until(currentProject, (id) => !!id, 30000);
    const names = await projectNames();
    check('dashboard drop: a new project named after the file opens', !!pid && names.includes('simple') && names.length === before.length + 1, { pid, names });
    await wait(3000);
    const first = await until(() => prompteurs(pid), (list) => list.length >= 1);
    check('dashboard drop: one prompteur with the LRC cues (vault)', first.length === 1 && first[0].cues.length === 3 && first[0].dwell === 12
        && first[0].text === 'Première ligne\nDeuxième ligne\nTroisième ligne' && first[0].name === 'Chanson simple', first);
    await shot('1_dashboard_drop');

    // 2. Import panel in the project → the same project.
    const imported = await importThroughPanel('basic.srt');
    check('project: import panel « Ouvrir » touched', imported.ok, imported);
    const second = await until(() => prompteurs(pid), (list) => list.length >= 2);
    const srt = second.find((p) => p.name === 'basic');
    check('project: the SRT prompteur joins this project', second.length === 2 && srt?.cues.length === 5 && srt?.dwell === 14 && await currentProject() === pid, second);
    await shot('2_project_import');

    // 2b. A drop on the canvas of the open project → this project too (R-205's drop zone).
    const beforeDrop = (await prompteurs(pid)).length;
    note('project_drop_target', await dropOnSurface('multi_timestamp.lrc', fs.readFileSync(path.join(FIX, 'multi_timestamp.lrc'), 'utf8')));
    const dropped = await until(() => prompteurs(pid), (list) => list.length > beforeDrop);
    const refrain = dropped.find((p) => p.name === 'Refrain'); // its [ti:] tag
    check('project drop: the LRC joins this project, its repeated line twice', !!refrain && refrain.cues.length === 4 && await currentProject() === pid
        && (await projectNames()).length === names.length, { dropped: dropped.map((p) => p.name), current: await currentProject() });

    // 3. Timeline view → the prompteur becomes a clip.
    await page.evaluate((id) => import('/eVe/domains/rendering/project_view_mode_state.js').then((m) => m.setProjectViewMode('timeline', { projectId: id })), pid);
    await wait(3000);
    const third = await importThroughPanel('basic.vtt');
    check('timeline: import panel « Ouvrir » touched', third.ok, third);
    const all = await until(() => prompteurs(pid), (list) => list.length >= 4);
    const vtt = all.find((p) => p.name === 'basic' && p.id !== srt?.id);
    // The project's own timeline (the Timeline view's owner) lists its clips by their source atome.
    const clips = await until(() => page.evaluate((id) => {
        const read = window.eveMoleculeTimelineApi?.readGroupTimeline?.({ group_id: id });
        return (read?.timeline?.clips || []).map((c) => ({ atome: c.source?.atome_id || '', kind: c.kind, start: c.start_seconds, duration: c.duration_seconds }));
    }, pid), (list) => list.some((c) => c.atome === vtt?.id), 15000);
    note('timeline_clips', clips);
    check('timeline: the VTT prompteur is imported', !!vtt && vtt.dwell === 12, all);
    check('timeline: laid as a clip', clips.some((c) => c.atome === vtt?.id), { clips, vtt: vtt?.id });
    await shot('3_timeline_import');

    // 3b. A file dropped on the canvas in the Timeline view: imported and laid as a clip too.
    const beforeTimelineDrop = await prompteurs(pid);
    await dropOnSurface('unicode.lrc', fs.readFileSync(path.join(FIX, 'unicode.lrc'), 'utf8'));
    const afterTimelineDrop = await until(() => prompteurs(pid), (list) => list.length > beforeTimelineDrop.length);
    const unicode = afterTimelineDrop.find((p) => !beforeTimelineDrop.some((q) => q.id === p.id));
    const dropClips = await until(() => page.evaluate((id) => (window.eveMoleculeTimelineApi?.readGroupTimeline?.({ group_id: id })?.timeline?.clips || [])
        .map((c) => c.source?.atome_id || ''), pid), (list) => list.includes(unicode?.id), 15000);
    check('timeline drop: the LRC is imported and laid as a clip', !!unicode && unicode.name === 'Ünïcødé 🎵' && dropClips.includes(unicode.id), { unicode, dropClips });
    await shot('3b_timeline_drop');

    // 4. A refused file leaves nothing.
    await page.evaluate((id) => import('/eVe/domains/rendering/project_view_mode_state.js').then((m) => m.setProjectViewMode('natural', { projectId: id })), pid);
    const count = (await prompteurs(pid)).length;
    const refused = await importThroughPanel('no_header.vtt');
    await wait(5000);
    check('refused file: nothing created', refused.ok && (await prompteurs(pid)).length === count, { refused, count });
    await shot('4_refused');
} catch (error) {
    report.errors.push(String(error?.stack || error)); failed += 1; console.log(error);
} finally {
    write();
    console.log(`${report.checks.length - failed}/${report.checks.length} PASS`);
    await close();
    process.exit(failed ? 1 : 0);
}
