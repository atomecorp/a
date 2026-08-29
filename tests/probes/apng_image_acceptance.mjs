import path from 'node:path';
import { PNG } from 'pngjs';
import { assert, clickCanvasTarget, recordCenter, wait, waitFor, waitForStableScene } from './molecule_ui_acceptance_support.mjs';
import { drag, switchView } from './molecule_ui_drop_core.mjs';
import { selectListRow } from './molecule_ui_drop_playback_support.mjs';

const APNG_PATH = path.resolve('atome/src/assets/images/ballanim.png');

const framesFor = async ({ page, project, id, outDir, name, count = 8 }) => {
    const target = await recordCenter(page, project.id, (r) => r.id === id, { sceneCoordinates: true });
    const clip = { x: target.x - target.width / 2, y: target.y - target.height / 2, width: target.width, height: target.height };
    const images = [];
    for (let index = 0; index < count; index++) {
        await wait(210);
        const file = path.join(outDir, `${name}_${index}.png`);
        const bytes = await page.screenshot({ path: file, clip });
        images.push({ file, png: PNG.sync.read(bytes) });
    }
    const changes = images.slice(1).map(({ png }, index) => {
        const before = images[index].png;
        let changed = 0;
        for (let byte = 0; byte < png.data.length; byte += 4) {
            if (Math.abs(png.data[byte] - before.data[byte]) + Math.abs(png.data[byte + 1] - before.data[byte + 1])
                + Math.abs(png.data[byte + 2] - before.data[byte + 2]) > 10) changed++;
        }
        return changed / (png.width * png.height);
    });
    return { target, images, changes };
};

export const runApngImageAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `APNG image ${Date.now()}`);
    assert(project.ok, 'apng_project_required');
    await page.evaluate(() => {
        const previous = document.getElementById('apng_acceptance_import');
        if (previous) previous.remove();
        const input = document.createElement('input');
        input.id = 'apng_acceptance_import';
        input.type = 'file';
        input.style.display = 'none';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#apng_acceptance_import', APNG_PATH);
    const ids = await page.evaluate(async (pid) => {
        const background = await window.eveToolBase.createAtome({ type: 'shape', kind: 'shape', name: 'APNG background',
            left: 100, top: 60, width: 840, height: 680, color: '#ffffff', order: 1, projectId: pid, parentId: pid }, { render: false });
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) await import('/eVe/intuition/tools/project_drop.js');
        const entries = Array.from(document.getElementById('apng_acceptance_import')?.files || []);
        const projectEl = document.querySelector(`[id="project_view_${pid}"]`) || document.querySelector('[id^="project_view_"]');
        if (!entries.length || !projectEl) throw new Error('apng_import_target_required');
        const bounds = projectEl.getBoundingClientRect();
        const imported = await window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            event: { clientX: bounds.left + 180, clientY: bounds.top + 140 },
            projectId: pid,
            projectEl,
            origin: 'apng_acceptance_import',
            sourceLayer: 'apng_acceptance_import',
            actorType: 'acceptance_probe'
        });
        const imageId = String(imported?.results?.find((entry) => entry?.atomeId)?.atomeId || '');
        if (!imported?.ok || !imageId) throw new Error(`apng_import_failed:${JSON.stringify(imported)}`);
        await window.Atome.commit({
            atome_id: imageId,
            kind: 'set',
            props: { left: 140, top: 100, width: 760, height: 600, order: 2 }
        });
        await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
        document.getElementById('apng_acceptance_import')?.remove();
        return { image: imageId, background: background.id, importResult: imported };
    }, project.id);
    report.apng_import = ids.importResult;
    await switchView(page, project.id, 'natural');
    await waitFor(page, async (id) => {
        const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
        const state = getRenderSurfaceState(document.getElementById('eve_surface_project'));
        return { ok: !!state?.scene?.byId?.get(id) };
    }, ids.image);
    const all = [];
    for (const [label, color, channel] of [['light', '#ffffff', 255], ['dark', '#111111', 17]]) {
        await check(`APNG auto animates on ${label} background and preserves transparent corners`, async () => {
            await page.evaluate(async ({ id, color }) => window.Atome.commit({ atome_id: id, kind: 'set', props: { color } }), { id: ids.background, color });
            await waitForStableScene(page, project.id);
            const frames = await framesFor({ page, project, id: ids.image, outDir, name: `apng_${label}`, count: 9 });
            assert(frames.changes.filter((ratio) => ratio > 0.01).length >= 5, `apng_frozen:${JSON.stringify(frames.changes)}`);
            for (const { png } of frames.images) {
                const corner = (2 * png.width + 2) * 4;
                for (let c = 0; c < 3; c++) assert(Math.abs(png.data[corner + c] - channel) < 6,
                    `apng_transparency:${label}:${Array.from(png.data.subarray(corner, corner + 4))}`);
            }
            all.push(...frames.images.map((f) => f.file));
            return { changes: frames.changes, frameCount: frames.images.length };
        });
    }
    await check('APNG keeps advancing across selection and a real drag', async () => {
        const target = await recordCenter(page, project.id, (r) => r.id === ids.image, { sceneCoordinates: true });
        await clickCanvasTarget(page, target);
        await drag({ page, source: target, destination: { ...target, x: target.x + 25 } });
        const frames = await framesFor({ page, project, id: ids.image, outDir, name: 'apng_selected' });
        assert(frames.changes.some((r) => r > 0.01), 'apng_stopped_after_drag');
        all.push(...frames.images.map((f) => f.file));
        return { changes: frames.changes };
    });
    await check('Visual uses the same animated image resource', async () => {
        await switchView(page, project.id, 'list');
        await selectListRow(page, ids.image);
        const visual = await waitFor(page, async (id) => {
            const { projectViewVisualPanel } = await import('/eVe/domains/rendering/project_view_visual_panel.js');
            const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
            const state = getRenderSurfaceState(document.getElementById('eve_surface_project'));
            const atom = state?.scene?.atoms?.find((a) => a.id.includes('project_view_visual_preview') && a.type === 'image');
            return { ok: projectViewVisualPanel.subjectId() === id && !!atom, id: atom?.id };
        }, ids.image);
        report.apng_visual_diagnostics = await page.evaluate(async (id) => {
            const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
            const state = readBevyWebRendererState(document.getElementById('eve_surface_project'));
            const node = state?.virtual_scene?.nodes?.find((n) => n.id === id);
            return { node, skipped: state?.skipped_nodes, deferred: state?.deferred_nodes,
                resolved: Array.from(state?.resolved_deferred_textures?.keys?.() || []),
                queue: state?.deferred_texture_queue?.map((n) => n.id) };
        }, visual.id);
        await page.screenshot({ path: path.join(outDir, 'apng_visual_full.png') });
        const frames = await framesFor({ page, project, id: visual.id, outDir, name: 'apng_visual' });
        report.apng_visual_diagnostics.target = frames.target;
        report.apng_visual_diagnostics.changes = frames.changes;
        assert(frames.changes.some((r) => r > 0.01), 'apng_visual_frozen');
        all.push(...frames.images.map((f) => f.file));
        return { changes: frames.changes, visualId: visual.id };
    });
    report.screenshots.push(...all);
};
