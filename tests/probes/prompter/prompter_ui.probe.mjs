// The existing prompteur on the real Web interface (isolated server, real clicks on the canvas): lyrics created with
// the Text tool, edited in place, then made a prompteur by the rail's « Prompt » palette and recorded by a glide (Rec,
// the finger sliding down its time socle while it plays). Each step reads the vault, never the view.
// PROBE_PREBUILT_SERVER=1 node tests/probes/prompter/prompter_ui.probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openNewProject, waitFor } from '../../helpers/probe_app.mjs';
import { openHome } from '../../helpers/probe_home.mjs';
import { clickCanvasTarget, recordCenter, visibleMenuTool, wait } from '../molecule_ui_acceptance_support.mjs';

const OUT = path.resolve('temp/probe_reports/prompter/prompter_ui');
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
// The first BevyUI node whose id passes `source` under the pointer, scanning the canvas (what a finger would find).
const findNode = (source) => page.evaluate((test) => {
    const match = new Function('id', `return (${test})(id);`);
    const surface = document.getElementById('eve_surface_project');
    const rect = surface.getBoundingClientRect();
    for (let y = 0; y < rect.height; y += 5) {
        for (let x = 0; x < rect.width; x += 5) {
            const hit = window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: rect.left + x, clientY: rect.top + y });
            const id = String(hit?.nodeId || '');
            if (id && match(id)) {
                // The node's centre when the hit gives its box (a finger lands in the middle), else the point found.
                // The node's middle, found by walking right and down while the hit stays on it.
                const on = (cx, cy) => String(window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: rect.left + cx, clientY: rect.top + cy })?.nodeId || '') === id;
                let right = x; while (on(right + 2, y + 2)) right += 2;
                let bottom = y; while (on(Math.round((x + right) / 2), bottom + 2)) bottom += 2;
                return { ok: true, id, x: rect.left + (x + right) / 2, y: rect.top + (y + bottom) / 2, top: rect.top + y, bottom: rect.top + bottom };
            }
        }
    }
    return { ok: false };
}, source.toString());
// A touch on a found node through the canvas helper (press and release queued together: never read as a hold).
const tap = (found) => clickCanvasTarget(page, { x: found.x, y: found.y, coordinate_source: 'scene', hit: { nodeId: found.id } });
const textRecords = (pid) => page.evaluate((id) => (window.eveToolBase?.getProjectSceneState?.(id)?.records || [])
    .filter((r) => String(r?.type || r?.kind || '').includes('text') && !String(r.id).startsWith('__eve_')).map((r) => String(r.id)), pid);

const LYRICS = ['Sous le ciel de Paris', "s'envole une chanson", 'elle est née d’aujourd’hui'];
try {
    const project = await openNewProject(page, `prompteur_ui_${Date.now()}`);
    check('project opened', project?.ok === true, project);
    const pid = project.id;
    await wait(3000);

    // 1. Lyrics created with the Text tool (Créer › Texte), typed line by line. A touch on the palette's tool while
    // the ribbon still settles can miss it (the palette then folds): the whole gesture is tried again, at most 3 times.
    const armText = async () => {
        let createOpen = { ok: false };
        for (let attempt = 0; attempt < 4 && !createOpen.ok; attempt += 1) {
            await clickCanvasTarget(page, await visibleMenuTool(page, pid, 'create'));
            createOpen = await waitFor(page, async () => {
                const measure = (await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js')).getMainMenuRuntime().measure();
                return { ok: measure.activePaletteKey === 'create' && measure.paletteMotionActive === false };
            }, null, 3000);
        }
        await wait(2000);
        const textTool = await findNode((id) => id.startsWith('eve_bevy_ui_main_menu_tool_create__text_create'));
        if (!textTool.ok) return { ok: false, createOpen, textTool };
        await tap(textTool);
        await wait(800);
        // In the scene the Text tool is armed: a touch on the ground places the text there.
        if (!(await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))) {
            const ground = await page.locator('#eve_surface_project').boundingBox();
            await page.mouse.click(ground.x + 360, ground.y + 220);
        }
        return waitFor(page, () => ({ ok: document.activeElement?.tagName === 'TEXTAREA' }), null, 6000);
    };
    let typing = { ok: false };
    for (let attempt = 0; attempt < 3 && !typing.ok; attempt += 1) typing = await armText();
    check('Créer › Texte opens a text being typed', typing.ok, typing);
    for (const [index, line] of LYRICS.entries()) {
        if (index) await page.keyboard.press('Enter');
        await page.keyboard.insertText(line);
    }
    await page.keyboard.press('Tab');
    const created = await waitFor(page, async ({ id, value }) => {
        const records = (window.eveToolBase?.getProjectSceneState?.(id)?.records || []).filter((r) => String(r?.type || r?.kind || '').includes('text') && !String(r.id).startsWith('__eve_'));
        for (const r of records) {
            const props = (await window.Atome.getStateCurrent(r.id))?.properties || {};
            if (String(props.text || '') === value) return { ok: true, id: String(r.id) };
        }
        return { ok: false, count: records.length };
    }, { id: pid, value: LYRICS.join('\n') }, 15000);
    check('lyrics created by the Text tool (vault)', created.ok, created);
    const textId = created.id;
    await shot('01_lyrics_created');

    // 2. Edited in place: a double touch on the text, a fourth line typed at its end.
    const centre = await recordCenter(page, pid, (r) => r.id === textId, { sceneCoordinates: true });
    await clickCanvasTarget(page, centre, { double: true });
    const editing = await waitFor(page, () => ({ ok: document.activeElement?.tagName === 'TEXTAREA' }), null, 10000);
    check('double touch opens the text editor', editing.ok, editing);
    await page.keyboard.press('Control+End'); await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('et Paris chante');
    await page.keyboard.press('Tab');
    const EDITED = [...LYRICS, 'et Paris chante'].join('\n');
    const edited = await waitFor(page, async ({ id, value }) => {
        const text = String((await window.Atome.getStateCurrent(id))?.properties?.text || '');
        return { ok: text === value, text };
    }, { id: textId, value: EDITED }, 10000);
    check('the edit reaches the vault', edited.ok, edited);
    await wait(800);

    // 3. Selected (one touch), the rail's Prompt palette, then Rec: the text becomes a prompteur and plays.
    await clickCanvasTarget(page, await recordCenter(page, pid, (r) => r.id === textId, { sceneCoordinates: true }));
    await wait(1500);
    const palette = await findNode((id) => id === 'atome_contextual_tool_prompter');
    check('rail shows the Prompt palette on the selected text', palette.ok, palette);
    // The rail is laid again once the text's own tools are read (its first selection): a touch during that
    // re-lay is lost, so the touch is given again until the palette unfolds (at most 4 times, each counted).
    let rec = { ok: false }, touches = 0;
    for (; touches < 4 && palette.ok && !rec.ok; touches += 1) {
        await tap(await findNode((id) => id === 'atome_contextual_tool_prompter'));
        await wait(1200);
        rec = await findNode((id) => id === 'atome_contextual_tool_prompter_prompter_record');
    }
    note('prompt_touches', touches);
    check('Prompt unfolds Rec', rec.ok, rec);
    await shot('02_prompt_palette');
    if (rec.ok) await tap(rec);
    const enabled = await waitFor(page, async (id) => {
        const props = (await window.Atome.getStateCurrent(id))?.properties || {};
        return { ok: !!props.prompter && Number(props.playback_dwell_seconds) > 0, prompter: props.prompter, dwell: props.playback_dwell_seconds };
    }, textId, 10000);
    check('Rec makes the text a prompteur (prompter property, estimated duration)', enabled.ok, enabled);
    note('enabled', enabled);
    // 4. The glide: the finger slides down the socle's gauge while the text plays.
    // The gauge's box in the canvas, read on its tree (the socle is laid in screen px), then proved by a hit test at
    // its middle: what the finger presses there is the gauge or its fill.
    const gauge = await waitFor(page, async () => {
        const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js');
        const surface = document.getElementById('eve_surface_project');
        const rect = surface.getBoundingClientRect();
        for (const [, entry] of window.eveBevyUiRuntime.state.trees) {
            const root = entry?.tree?.root; if (!root) continue;
            let found = null;
            const walk = (n) => { if (found || !n) return; if (/^prompter_socle_.*_gauge$/.test(String(n.id))) found = n; (n.children || []).forEach(walk); };
            walk(root);
            const box = found ? locateBevyUiNode({ node: root, nodeId: found.id })?.box : null;
            if (!box || box.height < 10) continue;
            const x = rect.left + box.x + box.width / 2, top = rect.top + box.y, bottom = rect.top + box.y + box.height;
            // The glide starts at the gauge's top, on the gauge or on the first line's bead lying on it (while a take
            // runs a bead is the glide too).
            for (let y = top + 1; y < bottom - 1; y += 1) {
                const hit = String(window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: x, clientY: y })?.nodeId || '');
                if (/^prompter_socle_.*_(gauge|fill|bead_\d+)$/.test(hit)) return { ok: true, id: found.id, hit, x, start: y, top, bottom };
            }
            return { ok: false, id: found.id, x, top, bottom, box };
        }
        return { ok: false };
    }, null, 6000);
    check('the time socle shows its gauge while recording', gauge.ok, gauge);
    const playing = await waitFor(page, async (id) => {
        const reading = (await import('/eVe/intuition/tools/prompter/prompter_reading_runtime.js')).readPrompterReading(id);
        return { ok: reading?.recording === true && reading.clock.playing === true, clock: reading?.clock };
    }, textId, 10000);
    check('Rec plays the prompteur (its clock runs)', playing.ok, playing);
    await shot('03_recording_socle');
    if (gauge.ok) {
        const x = gauge.x;
        const top = gauge.start;
        const span = gauge.bottom - gauge.start - 2;
        const steps = 20;
        await page.mouse.move(x, top);
        await page.mouse.down();
        for (let step = 1; step <= steps; step += 1) {
            await page.mouse.move(x, top + (span * step / steps));
            await wait(120);
        }
        await page.mouse.up();
    }
    const recAgain = await findNode((id) => id === 'atome_contextual_tool_prompter_prompter_record');
    if (recAgain.ok) await tap(recAgain);
    const recorded = await waitFor(page, async (id) => {
        const cues = (await window.Atome.getStateCurrent(id))?.properties?.prompter?.cues || [];
        return { ok: cues.length >= 2, cues };
    }, textId, 12000);
    check('the glide take writes line instants (prompter.cues)', recorded.ok, recorded);
    const ordered = (recorded.cues || []).map((cue) => cue.at_seconds);
    check('recorded instants rise line after line', ordered.every((at, i) => i === 0 || at >= ordered[i - 1]), ordered);
    await shot('04_recorded');
    await page.evaluate(async (id) => (await import('/eVe/intuition/runtime/tool_gateway.js')).invokeToolGateway({
        tool_id: 'prompter.transport', action: 'pointer.click', input: { atome_id: id, operation: 'stop' }, source: { type: 'probe' } }), textId);
    // The existing export still answers (not changed by the import work).
    const srt = await page.evaluate(async (id) => (await import('/eVe/intuition/tools/prompter/prompter_actions.js')).exportPrompterSubtitles({ atome_id: id, format: 'srt', download: false }), textId);
    check('the prompteur exports as SRT', srt?.ok === true && /^1\n\d\d:\d\d:\d\d,\d{3} --> /.test(srt.text), srt);
    note('text_records', await textRecords(pid));
} catch (error) { report.errors.push(String(error?.stack || error)); console.log('ERROR', error); failed += 1; }
finally {
    write();
    console.log(`checks ${report.checks.length}, failed ${failed}, errors ${report.errors.length}`, report.errors.slice(0, 5));
    await close();
    process.exit(failed ? 1 : 0);
}
