// R-187 variant B on the real console (iPad landscape): the strip's ground one tool wide, its tools inside it by the gap,
// flat; + opened then Écho chosen, its welded panel. Real clicks on the canvas.
// node tests/probes/music/console_strip_ground.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, waitFor, app } from '../../helpers/probe_app.mjs';
import { createReport, openHome } from '../../helpers/probe_home.mjs';
import { wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/music/console_strip_ground'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], errors: [], console: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); };
const home = createReport('strip_ground');
const { page, close } = await openHome({ report: home.report, write: home.write, check: home.check, view: 'desktop' });
await page.setViewportSize({ width: 1366, height: 1366 });
page.on('pageerror', (e) => report.errors.push(String(e?.message || e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') report.console.push(m.text().slice(0, 300)); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const nodes = (src) => page.evaluate(async (s) => {
    const rx = new RegExp(s); const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js'); const out = [];
    for (const [, e] of window.eveBevyUiRuntime.state.trees) { const t = e?.tree; if (!t) continue;
        const w = (n) => { if (rx.test(String(n.id))) out.push({ id: n.id, text: JSON.stringify(n).match(/"text":"([^"]+)"/)?.[1] || '', style: n.style, bg: (n.children || []).find((c) => /_background$/.test(c.id))?.style, box: locateBevyUiNode({ node: t.root, nodeId: n.id })?.box || null }); (n.children || []).forEach(w); };
        w(t.root); }
    return out; }, src);
const canvas = () => page.locator('#eve_surface_project').boundingBox();
const tapAt = async (b, ms = 1200) => { const c = await canvas(); await page.mouse.click(c.x + b.x + b.width / 2, c.y + b.y + b.height / 2); await wait(ms); };
try {
    const { id: pid } = await openNewProject(page, `strip_${Date.now()}`);
    await app(page, `for (let i = 0; i < 3; i += 1) await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: 'S' + (i + 1), projectId: arg, parentId: arg,
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24.577, left: (60 + i * 40) + 'px', top: (80 + i * 120) + 'px', width: '320px', height: '90px' });
        await window.eveToolBase.loadProjectAtomes(arg, { staleFirst: false });`, pid);
    await app(page, `const m = await import('/eVe/domains/rendering/project_view_mode_state.js'); return m.setProjectViewMode('mix', { projectId: arg });`, pid);
    await waitFor(page, async () => ({ ok: !!(await (async () => { for (const [, e] of window.eveBevyUiRuntime.state.trees) { let f = false; const w = (n) => { if (/_audio_add$/.test(n.id)) f = true; (n.children || []).forEach(w); }; if (e?.tree) w(e.tree.root); if (f) return true; } return false; })()) }), null, 30000, 400);
    await wait(2500);
    await shot('01_rest');
    const ground = (await nodes('^molecule_mix_strip_.*_audio_background$'))[0];
    const tools = await nodes('^molecule_mix_strip_[^]*_audio_(in|add|out|name)$');
    const vol = (await nodes('^molecule_mix_strip_[^]*_audio_module_0$'))[0];
    check('ground wider than its tools', ground && tools.every((t) => t.box && t.box.width < ground.box.width - 6), { ground: ground?.box, tools: tools.map((t) => [t.id.slice(-12), t.box?.width, t.box?.x]) });
    check('tools inside the ground', tools.every((t) => t.box.x > ground.box.x && t.box.x + t.box.width < ground.box.x + ground.box.width), null);
    check('tools flat (no rest shadow)', tools.every((t) => !t.bg?.shadow), tools.map((t) => [t.id.slice(-8), t.bg?.shadow || null]));
    check('Volume slider flat and inside', vol && !JSON.stringify(vol).includes('"shadow":{') && vol.box.width === tools[0].box.width, { vol: vol?.box });
    // + opened, Écho chosen.
    const add = tools.find((t) => /_add$/.test(t.id));
    await tapAt(add.box); await shot('02_add_open');
    const choices = await nodes('_panel_choice_\\d+$');
    check('+ choices laid at the strip tool size', choices.length > 0 && choices.every((c) => c.box.width === add.box.width), choices.slice(0, 4).map((c) => [c.text, c.box?.width]));
    const echo = choices.find((c) => /^Comp/.test(c.text));
    if (echo) { await tapAt(echo.box, 3500); }
    await shot('03_after_echo');
    let band = await nodes('_panel_band$');
    const mods = await nodes('^molecule_mix_strip_[^]*_audio_module_\\d+$');
    report.mods = mods.map((m) => [m.id.slice(-10), m.text, m.box]);
    if (!band.length) {
        const rec = mods.find((m) => /REC/.test(m.text)); const c = await canvas();
        const sx = c.x + rec.box.x + 29, sy = c.y + rec.box.y + 50;
        await page.mouse.move(sx, sy); await page.mouse.down(); for (let i = 1; i <= 10; i += 1) { await page.mouse.move(sx, sy - i * 16); await wait(12); } await page.mouse.up(); await wait(1500);
        const offsets = (await page.evaluate(() => window.eveBevyUiRuntime.captureTreeScroll('eve_bevy_ui_project_view'))).offsets;
        const own = offsets.find((o) => /_column_scroll$/.test(o.nodeId));
        report.scroll = own;
        const fx = (await nodes('^molecule_mix_strip_[^]*_audio_module_\\d+$')).find((m) => /^Comp/.test(m.text));
        if (fx) { await tapAt({ ...fx.box, y: fx.box.y - (own?.y || 0) }, 1800); band = await nodes('_panel_band$'); }
    }
    await shot('04_echo_open');
    const body = await nodes('_panel_body$');
    check('Écho panel welded: band covers the strip ground width, body glued under it', band[0] && body[0] && Math.abs(band[0].box.x - tools[0].box.x) < 1 && band[0].box.height === tools[0].box.height && Math.abs(body[0].box.y - (band[0].box.y + band[0].box.height)) < 1,
        { band: band[0]?.box, body: body[0]?.box, ground: ground.box });
    const values = await nodes('_panel_value_[^_]+$');
    check('panel values at the strip tool size', values.length > 0 && values.every((v) => v.box?.width === add.box.width), values.slice(0, 4).map((v) => [v.id.slice(-20), v.box?.width])); check('_unused', values.length > 0, values.slice(0, 4).map((v) => [v.id.slice(-20), v.box?.width]));
} catch (e) { report.errors.push(String(e?.stack || e)); }
finally { check('no page error', report.errors.length === 0, report.errors); console.log(JSON.stringify(report.checks.map((c) => [c.ok ? 'OK' : 'KO', c.name, c.ok ? '' : c.detail]), null, 1)); console.log('console errors', report.console.length); await close(); process.exit(0); }
