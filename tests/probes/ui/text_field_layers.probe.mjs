// A text field raised over its neighbours still shows its text and its caret (found on 17 Nov. 2026: the renderer's z
// is global, bevy-core `GlobalZIndex`, so the field of a Scene renamed in the Timeline, at z 7, covered its own text,
// selection and caret at z 1–3: an empty field while typing). The canonical field (bevy_panel_editable_text.js) takes
// `zIndex` and lays its children right above it. Through the real screens, typed « MMMM » and read in pixels: a Scene
// renamed in the Timeline (double click), and a new list named in place in Médias › Listes (its Créer tool, the
// Dashboard's in-place name field). The third caller, a template field on its own band (matrix_template_runtime.js,
// `surface: 'content'`), has no screen using it today: its layers are checked on the node it builds.
// node tests/probes/ui/text_field_layers.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { app, openNewProject } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget, openCdpPointer, wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/ui/text_field_layers');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], notes: {}, errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); write(); console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : ''); };
const home = createReport('text_field_layers');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1180, height: 820 });
page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 300)}`));

// Painted node rectangles (client px) whose id matches `test` (a function body over `id`).
await app(page, `
    const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
    window.__fieldProbe = { rects: (match) => {
        const surface = document.getElementById('eve_surface_project'); const r = surface.getBoundingClientRect(); const found = {};
        const visit = (n, parent, forced) => { if (!n) return; const box = forced || nodeBox(n, parent); const nid = String(n.id || '');
            if (match(nid)) found[nid] = { x: r.left + box.x, y: r.top + box.y, width: box.width, height: box.height };
            const boxes = layoutForNodeCached(n, box).childBoxes; (n.children || []).forEach((c, i) => visit(c, box, boxes[i])); };
        for (const [tid, entry] of window.eveBevyUiRuntime.state.trees) { if (entry.surface !== surface || window.eveBevyUiRuntime.state.suspendedTrees.has(tid)) continue; visit(entry.tree.root); }
        return found; } };
    return true;`);
const rectsWhere = (body) => app(page, `return window.__fieldProbe.rects((id) => { ${body} });`);
const until = async (read, timeoutMs = 6000) => { const end = Date.now() + timeoutMs; while (Date.now() < end) { const v = await read(); if (v) return v; await wait(200); } return null; };
// White pixels (text, caret) inside `box` on a fresh screenshot.
const brightIn = async (box, name) => {
    const shot = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: shot });
    return page.evaluate(async ({ data, box }) => {
        const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const s = img.width / window.innerWidth;
        const d = g.getImageData(Math.round(box.x * s), Math.round(box.y * s), Math.round(box.width * s), Math.round(box.height * s)).data;
        let bright = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright += 1;
        return bright;
    }, { data: fs.readFileSync(shot).toString('base64'), box });
};
const pointer = await openCdpPointer(page);

try {
    // 1. On the Dashboard, a new list named in place, Médias › Listes › Créer (the Dashboard's in-place name field).
    const opened = await app(page, `const { executeMediaListCommand } = await import('/eVe/domains/media/media_list_runtime.js');
        return executeMediaListCommand('open', { media: 'all' });`).catch((error) => ({ error: String(error?.message || error) }));
    report.notes.lists_opened = opened;
    const create = await until(async () => Object.keys(await rectsWhere("return id.endsWith('media_list_create');"))[0], 10000);
    check('Médias › Listes shows its Créer tool', !!create, create);
    if (create) {
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodeId: create }, { timeoutMs: 3000 }));
        const listField = await until(async () => (await rectsWhere("return id === 'eve_dashboard_media_lists_name_field';")).eve_dashboard_media_lists_name_field);
        check('Créer opens the in-place name field on a new row', !!listField, listField);
        await page.keyboard.insertText('MMMM'); await wait(700);
        const listBright = listField ? await brightIn(listField, 'list_field') : 0;
        check('the in-place name field shows the text typed and its caret', listBright > 40, { listBright });
        await page.keyboard.press('Escape'); await wait(400);
    }


    // 2. A Scene renamed in the Timeline.
    const project = await openNewProject(page, `field_layers_${Date.now()}`);
    await app(page, "const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('timeline', { projectId: arg });", project.id);
    const band = await until(async () => (await rectsWhere("return id === 'project_view_timeline_scenes';"))?.project_view_timeline_scenes, 15000);
    if (!band) throw new Error('scenes_band_missing');
    const y = band.y + band.height / 2, from = { x: band.x + band.width * 0.1, y };
    await pointer.move(from); await pointer.press([]); await wait(450);
    await pointer.travel({ x: from.x + band.width * 0.3, y }, 14); await wait(60); await pointer.release();
    const scene = await until(async () => Object.entries(await rectsWhere("return /^project_view_timeline_scene_scene_[^_]+$/.test(id) || /^project_view_timeline_scene_[a-z0-9_]+$/.test(id) && !id.includes('_edge') && !id.endsWith('_name') && !id.endsWith('_draft') && id !== 'project_view_timeline_scenes';"))[0]);
    check('a Scene is drawn in the Timeline', !!scene, scene);
    const sceneTarget = await awaitBevyUiNodeTarget(page, { nodeId: scene[0] }, { timeoutMs: 3000 });
    await clickCanvasTarget(page, sceneTarget, { double: true });
    const sceneField = await until(async () => Object.values(await rectsWhere("return id.startsWith('project_view_timeline_scene_') && id.endsWith('_name_field');"))[0]);
    check('its double click opens the name field', !!sceneField, sceneField);
    await page.keyboard.insertText('MMMM'); await wait(700);
    const sceneBright = sceneField ? await brightIn(sceneField, 'scene_field') : 0;
    check('the Scene name field shows the text typed and its caret', sceneBright > 40, { sceneBright });
    await page.keyboard.press('Escape'); await wait(400);

    // 3. A template field on its band: its text and caret lie above the field, the field above the band.
    const layers = await app(page, `const { textInputNode } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js');
        const f = textInputNode({ id: 'f', width: 200, height: 30, value: 'MMMM', focused: true, selection: { start: 4, end: 4, caret: 4 }, caretVisible: true, zIndex: 805 });
        const z = (id) => f.children.find((c) => c.id === id)?.style?.z_index;
        return { field: f.style.z_index, text: z('f_text'), caret: z('f_caret') };`);
    check('a field given zIndex 805 lays its text and caret above itself', layers.field === 805 && layers.text > 805 && layers.caret > layers.text, layers);
} catch (error) {
    check('exception', false, String(error?.stack || error).slice(0, 900));
} finally {
    check('no page error', report.errors.length === 0, report.errors.slice(0, 8));
    await close();
    const failed = report.checks.filter((c) => !c.ok);
    console.log(`text_field_layers: ${report.checks.length - failed.length}/${report.checks.length}`);
    process.exitCode = failed.length ? 1 : 0;
}
