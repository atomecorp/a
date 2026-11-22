// The music views hold their design and answer quickly (tests DS-01, DS-02, DS-04 of
// tests/parcours_musique/04_cellules_scenes.md): Timeline → Cells → Scene → Console and back, five rounds, through the
// real tool row on the canvas. Every round, the row's tools and the contextual rail lie at the same place and size
// as in the first round (rule 12: sizes never change), every tool of the row lies inside the screen, and each switch
// is painted within PROBE_RESPONSE_MS of its click, the page staying responsive. Then the same at four screens
// (1180×820, 1440×900, 390×844 standing, 844×390 lying).
// node tests/probes/music/views_stability.probe.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, openNewProject } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget, wait, waitForResponsivePage } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/views_stability');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], timings: {}, notes: {}, errors: [] };
// The machine's load beside the timings: a slow answer on a loaded machine reads as such (rerun calm to judge).
report.notes.load_average = os.loadavg().map((v) => Math.round(v));
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const RESPONSE_MS = Number(process.env.PROBE_RESPONSE_MS) || 400;
const ROUNDS = Number(process.env.PROBE_ROUNDS) || 5;
const SCREENS = [[1180, 820, 'ipad'], [1440, 900, 'desktop'], [390, 844, 'phone_standing'], [844, 390, 'phone_lying']];
// The row of views lies in the Timeline's footer, or in the Console's (project_view_molecule_mix_content.js#footerTools).
const rowOf = (mode) => (mode === 'mix' ? 'project_view_mix_row' : 'project_view_timeline_row');
let ROW = rowOf('timeline');
const RAIL = 'eve_bevy_panel_atome_contextual_edit';
// The view each row tool opens, read on the state it reaches (Timeline layout, project view mode): an empty project
// paints no cell, so a painted marker would not tell.
// A view tool is a switch (project_view_multitrack_tool.js#invokeMultitrackTool): touched while its view shows, it
// leaves the multitrack views. The round therefore starts from the Timeline shown and never touches the view on screen.
const VIEWS = [
    { key: 'cells', layout: 'cells', mode: 'timeline' },
    { key: 'mix', layout: null, mode: 'mix' },
    { key: 'timeline', layout: 'timeline', mode: 'timeline' }
];
const home = createReport('views_stability');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) report.errors.push(`console ${m.text().slice(0, 300)}`); });
// Painted rectangles (client px) of the nodes whose id starts with one of `prefixes`, rounded to the half pixel.
const painted = (prefixes) => app(page, `
    const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
    const surface = document.getElementById('eve_surface_project'); const r = surface.getBoundingClientRect();
    const runtime = window.eveBevyUiRuntime; const found = {}; const half = (v) => Math.round(v * 2) / 2;
    const visit = (n, parent, forced) => { if (!n) return; const box = forced || nodeBox(n, parent); const id = String(n.id || '');
        if (arg.some((p) => id.startsWith(p))) found[id] = { x: half(r.left + box.x), y: half(r.top + box.y), w: half(box.width), h: half(box.height) };
        const boxes = layoutForNodeCached(n, box).childBoxes; (n.children || []).forEach((c, i) => visit(c, box, boxes[i])); };
    for (const [tid, entry] of runtime.state.trees) { if (entry.surface !== surface || runtime.state.suspendedTrees.has(tid)) continue; visit(entry.tree.root); }
    return found;`, prefixes);
// The row's own tools (`<row>_<group>_<key>`), not their inner glyphs and labels.
const rowTools = async () => Object.fromEntries(Object.entries(await painted([`${ROW}_`]))
    .filter(([id]) => /^project_view_(timeline|mix)_row_(multitrack|views|transport)_[a-z]+$/.test(id)));
// The state a view switch reaches, waited for on the page's frames.
const reached = (pid, view) => app(page, `const m = await import('/eVe/domains/rendering/project_view_mode_state.js');
    const started = performance.now();
    const ok = () => m.getProjectViewMode(arg.pid) === arg.mode
        && (!arg.layout || window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: arg.pid }).timeline.view?.layout === arg.layout);
    const since = () => Math.round(performance.now() - (window.__viewsProbeInput || started));
    return new Promise((resolve) => { const step = () => (ok() ? resolve({ ok: true, ms: since() }) : performance.now() - started > 8000 ? resolve({ ok: false, ms: since() }) : requestAnimationFrame(step)); step(); });`,
{ pid, mode: view.mode, layout: view.layout });
// The views lie in the rail's Multitrack palette (R-253; Timeline, Cells, Mix since R-258): opened, then its choice.
const switchTo = async (pid, view) => {
    const since = Date.now();
    const opener = await awaitBevyUiNodeTarget(page, { nodeId: 'atome_contextual_tool_container_multitrack' }, { timeoutMs: 4000 });
    if (!opener) return { ok: false, error: 'rail_multitrack_missing' };
    await clickCanvasTarget(page, opener);
    const target = await awaitBevyUiNodeTarget(page, { nodeId: `atome_contextual_tool_container_multitrack_multitrack_${view.key}` }, { timeoutMs: 4000 });
    if (!target) return { ok: false, error: `rail_view_missing:${view.key}` };
    await clickCanvasTarget(page, target);
    const { ok, ms } = await reached(pid, view);
    if (ok) ROW = rowOf(view.mode);
    return { ok, ms, total: Date.now() - since };
};
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((id) => JSON.stringify(a[id]) !== JSON.stringify(b[id]))
    .map((id) => ({ id, before: a[id] || null, after: b[id] || null }));

try {
    // The pointer's release, stamped on the page's clock: a switch's delay is read from it.
    await app(page, "window.addEventListener('pointerup', () => { window.__viewsProbeInput = performance.now(); }, true); return true;");
    const pid = (await openNewProject(page, `views_${Date.now()}`)).id;
    await app(page, `
        await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'Voix', projectId: arg, parentId: arg,
            src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: '60px', top: '400px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false }); return true;`, pid);
    await wait(2000);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", pid);
    await wait(4000);
    for (const [width, height, tag] of SCREENS) {
        await page.setViewportSize({ width, height });
        await wait(2500);
        const reference = {};
        const times = [];
        let failures = 0;
        for (let round = 0; round < ROUNDS; round += 1) {
            for (const view of VIEWS) {
                const switched = await switchTo(pid, view);
                if (!switched.ok) { failures += 1; check(`DS-02 ${tag} ${view.key} opens`, false, switched); continue; }
                times.push(switched.ms);
                await wait(300);
                const now = { row: await rowTools(), rail: await painted([RAIL]) };
                if (!reference[view.key]) {
                    reference[view.key] = now;
                    const outside = Object.entries(now.row).filter(([, r]) => r.x < -0.5 || r.y < -0.5 || r.x + r.w > width + 0.5 || r.y + r.h > height + 0.5);
                    check(`DS-01 ${tag} ${view.key}: every tool of the row inside the screen`, outside.length === 0, outside.slice(0, 4));
                    const sizes = [...new Set(Object.values(now.row).map((r) => `${r.w}x${r.h}`))];
                    check(`DS-01 ${tag} ${view.key}: the row's tools share one size`, sizes.length <= 1, sizes);
                    await page.screenshot({ path: path.join(OUT, `${tag}_${view.key}.png`) });
                } else {
                    const moved = [...diff(reference[view.key].row, now.row), ...diff(reference[view.key].rail, now.rail)];
                    if (moved.length) { failures += 1; check(`DS-04 ${tag} ${view.key} round ${round + 1}: nothing moved or resized`, false, moved.slice(0, 4)); }
                }
            }
        }
        check(`DS-04 ${tag}: ${ROUNDS} rounds, row and rail identical every time`, failures === 0, { failures });
        const sorted = [...times].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? null;
        const worst = sorted.at(-1) ?? null;
        report.timings[tag] = { median, worst, all: times };
        check(`DS-02 ${tag}: switching views answers in ≤ ${RESPONSE_MS} ms (median)`, median !== null && median <= RESPONSE_MS, { median, worst });
        let responsive = null;
        try { responsive = await waitForResponsivePage(page, { timeoutMs: 20000 }); } catch (error) { responsive = String(error?.message || error); }
        check(`DS-02 ${tag}: the page stays responsive after the switches`, responsive === true, responsive);
    }
} catch (error) {
    check('exception', false, String(error?.stack || error).slice(0, 900));
} finally {
    check('DS no page error', report.errors.length === 0, report.errors.slice(0, 8));
    await close();
    const failed = report.checks.filter((c) => !c.ok);
    console.log(`views_stability: ${report.checks.length - failed.length}/${report.checks.length}`, JSON.stringify(Object.fromEntries(Object.entries(report.timings).map(([k, v]) => [k, { median: v.median, worst: v.worst }]))));
    process.exitCode = failed.length ? 1 : 0;
}
