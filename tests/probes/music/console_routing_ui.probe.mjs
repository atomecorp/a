// R-183 console on the real Web app, by real clicks: REC in every strip, VOL/PAN/REC held then moved, the + and OUT
// welded panels (no ✕), an Aux to a new bus with its face, OUT mono, the bus's IN listing the Aux received.
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, waitFor, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/console_routing_ui'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: {}, notes: {}, errors: [] };
const check = (k, ok, v) => { report.checks[k] = { ok: Boolean(ok), v }; };
const note = (k, v) => { report.notes[k] = v; };
const home = createReport('console_ui');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 1000 });
page.on('pageerror', (e) => report.errors.push(String(e?.message || e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`console: ${m.text().slice(0, 300)}`); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const nodes = (re) => page.evaluate(async (src) => { const rx = new RegExp(src); const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js'); const out = [];
    const texts = (n, acc = []) => { if (typeof n.text === 'string') acc.push(n.text); if (typeof n.style?.text === 'string') acc.push(n.style.text); (n.children || []).forEach((c) => texts(c, acc)); return acc; };
    for (const [, e] of window.eveBevyUiRuntime.state.trees) { const t = e?.tree; if (!t) continue; const w = (n) => { if (rx.test(String(n.id))) out.push({ id: n.id, texts: texts(n), box: locateBevyUiNode({ node: t.root, nodeId: n.id })?.box || null }); (n.children || []).forEach(w); }; w(t.root); } return out; }, re.source);
const cb = () => page.locator('#eve_surface_project').boundingBox();
const center = async (b) => { const c = await cb(); return [c.x + b.x + b.width / 2, c.y + b.y + b.height / 2]; };
const tap = async (n, ms = 1200) => { const [x, y] = await center(n.box); await page.mouse.click(x, y); await wait(ms); };
const holdMove = async (n, dx, dy) => { const [x, y] = await center(n.box); await page.mouse.move(x, y); await page.mouse.down(); await wait(900);
    await page.mouse.move(x + dx / 3, y + dy / 3, { steps: 5 }); await wait(150); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await wait(500); await page.mouse.up(); await wait(1500); };
const column = async (strip) => (await nodes(new RegExp(`${strip}_audio_module_\\d+$`))).sort((a, b) => a.box.y - b.box.y).map((n) => n.texts.join(' '));
try {
    const { id: pid } = await openNewProject(page, `r183_${Date.now()}`);
    await app(page, `for (let i = 0; i < 3; i += 1) await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'S' + (i + 1), projectId: arg, parentId: arg,
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: (60 + i * 40) + 'px', top: (80 + i * 120) + 'px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false });`, pid);
    await app(page, `const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('mix', { projectId: arg });`, pid);
    await waitFor(page, async () => ({ ok: true }), null, 2000, 400);
    for (let i = 0; i < 40 && !(await nodes(/_audio_add$/)).length; i += 1) await wait(500);
    await wait(2000); await shot('01_columns');
    const strips = [...new Set((await nodes(/_audio_add$/)).map((n) => n.id.replace(/_audio_add$/, '')))];
    note('strips', strips.length);
    const s1 = strips[0];
    const col0 = await column(s1);
    check('rec_first_everywhere', (await Promise.all(strips.map(column))).every((c) => /REC/.test(c[0] || '')), col0);
    const out0 = (await nodes(new RegExp(`${s1}_audio_out$`)))[0];
    check('out_reads_1_2', out0?.texts.join(' ').includes('1-2'), out0?.texts);
    // VOL (second) held then moved up one tool: over REC; then PAN up over VOL.
    let mods = (await nodes(new RegExp(`${s1}_audio_module_\\d+$`))).sort((a, b) => a.box.y - b.box.y);
    await holdMove(mods[1], 0, -mods[1].box.height);
    const colVol = await column(s1);
    check('vol_held_moved', /VOL/.test(colVol[0]) && /REC/.test(colVol[1]), colVol);
    mods = (await nodes(new RegExp(`${s1}_audio_module_\\d+$`))).sort((a, b) => a.box.y - b.box.y);
    await holdMove(mods[2], 0, -mods[2].box.height);
    const col1 = await column(s1); await shot('02_pan_moved');
    check('pan_held_moved', /PAN/.test(col1[1]) && /REC/.test(col1[2]), col1);
    // REC held then moved up two tools: on top again.
    mods = (await nodes(new RegExp(`${s1}_audio_module_\\d+$`))).sort((a, b) => a.box.y - b.box.y);
    await holdMove(mods[2], 0, -mods[2].box.height * 2);
    const col2 = await column(s1);
    check('rec_held_moved', /REC/.test(col2[0]), col2);
    // + opens its welded panel; the neighbour moves aside; no ✕ anywhere.
    const otherAdd = async () => (await nodes(/_audio_add$/)).filter((n) => !n.id.startsWith(s1)).sort((a, b) => a.box.x - b.box.x)[0];
    await tap((await nodes(new RegExp(`${s1}_audio_add$`)))[0], 1800); await shot('03_add_panel');
    const choices = await nodes(new RegExp(`${s1}_audio_panel_choice_\\d+$`));
    // R-184: Aux then the seven families on the first row, the chosen family's effects under them, VOL, PAN, MONO last.
    check('add_panel_welded', choices.length >= 11 && /Aux/.test(choices[0]?.texts.join(' ')), choices.slice(0, 4).map((c) => c.texts.join(' ')));
    const panelBody = (await nodes(new RegExp(`${s1}_audio_panel_body$`)))[0];
    check('panel_beside_tool', panelBody && panelBody.box.width >= 4 * 60, panelBody?.box);
    check('no_close_in_console', !(await nodes(/molecule_mix.*_close$/)).length, (await nodes(/molecule_mix.*_close$/)).map((n) => n.id));
    // Aux chosen: it lands in the strip and opens its panel of destinations; « Nv. bus » creates a bus and routes it.
    await tap(choices[0], 2000); await shot('04_aux_panel');
    let dest = await nodes(new RegExp(`${s1}_audio_panel_choice_\\d+$`));
    note('aux_destinations', dest.map((c) => c.texts.join(' ')));
    const newBus = dest.find((c) => /bus/i.test(c.texts.join(' ')) && /Nv|New/.test(c.texts.join(' ')));
    // The other strips are listed too (the project's clips may share one track: then « Nv. bus » alone;
    // console_aux_destinations.probe.mjs proves the list with several tracks).
    check('aux_panel_destinations', Boolean(newBus) && (strips.length < 2 || dest.length > strips.length - 1), dest.map((c) => c.texts.join(' ')));
    if (newBus) await tap(newBus, 2500);
    dest = await nodes(new RegExp(`${s1}_audio_panel_choice_\\d+$`));
    check('aux_routed_to_bus', dest.some((c) => /Bus/.test(c.texts.join(' '))), dest.map((c) => c.texts.join(' ')));
    const values = await nodes(new RegExp(`${s1}_audio_panel_value_.*[.](send|pass)$`));
    note('aux_values', values.map((v) => [v.id.split('_value_')[1], v.texts.join(' ')]));
    // Passage dragged a little: it becomes the Aux's face.
    const pass = values.find((v) => /pass$/.test(v.id));
    if (pass) { const [x, y] = await center(pass.box); await page.mouse.move(x, y); await page.mouse.down(); await wait(120); await page.mouse.move(x, y + 30, { steps: 6 }); await wait(300); await page.mouse.up(); await wait(1500); }
    await shot('05_aux_passage');
    check('aux_value_keeps_panel', (await nodes(new RegExp(`${s1}_audio_panel_body$`))).length === 1, null);
    // The Aux tool touched again folds its panel; its column shows « Passage ».
    const band = (await nodes(new RegExp(`${s1}_audio_panel_band$`)))[0];
    if (band) await tap({ box: { ...band.box, width: 60 } }, 1800);
    const col3 = await column(s1); await shot('06_aux_folded');
    check('aux_folded_shows_face', !(await nodes(new RegExp(`${s1}_audio_panel_body$`))).length && col3.some((c) => /Passage|Through/.test(c)), col3);
    // OUT: mono 1.
    await tap((await nodes(new RegExp(`${s1}_audio_out$`)))[0], 1800); await shot('07_out_panel');
    const outs = await nodes(new RegExp(`${s1}_audio_panel_choice_\\d+$`));
    note('outs', outs.map((c) => c.texts.join(' ')));
    const mono1 = outs.find((c) => c.texts.join(' ').trim().endsWith('1') && !c.texts.join(' ').includes('-'));
    if (mono1) await tap(mono1, 2000);
    const outAfter = (await nodes(new RegExp(`${s1}_audio_out$`)))[0];
    check('out_mono_1', !(await nodes(new RegExp(`${s1}_audio_panel_body$`))).length && /(^|\s)1$/.test(outAfter?.texts.join(' ').trim()), outAfter?.texts);
    // The bus's IN lists the Aux it receives, chosen.
    const busAdd = await otherAdd();
    check('bus_beside_strip', busAdd && busAdd.box.x > (await nodes(new RegExp(`${s1}_audio_add$`)))[0].box.x, busAdd?.box);
    const ins = await nodes(/_audio_in$/);
    const busIn = ins.sort((a, b) => b.box.x - a.box.x).find((n) => /Bus/.test(n.texts.join(' ')));
    const busPanel = () => (busIn ? nodes(new RegExp(`${busIn.id.replace(/_in$/, '')}_panel_choice_\\d+$`)) : []);
    // The touch that lands while the previous panel still folds only folds it: touched once more, it opens.
    if (busIn) await tap(busIn, 1800);
    if (busIn && !(await busPanel()).length) await tap(busIn, 1800);
    await shot('08_bus_in');
    const busChoices = await busPanel();
    check('bus_in_lists_aux', busChoices.some((c) => /Aux S1/.test(c.texts.join(' '))), busChoices.map((c) => c.texts.join(' ')));
} catch (e) { report.errors.push(String(e?.stack || e)); } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); await close(); process.exit(0);
}
