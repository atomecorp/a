import fs from 'node:fs';
import { PNG } from 'pngjs';
import { ensureProject } from './dashboard_workspace_stress/product_actions.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, waitFor } from './molecule_ui_acceptance_support.mjs';
import { switchView } from './molecule_ui_drop_core.mjs';

// Called only by the opt-in authenticated assistant campaign. No provider calls.
export const runOpenAiRetouchAcceptance = async ({ page, report, directory }) => {
    let project, sourceId;
    try {
        project = await ensureProject(page, 'OpenAI mask acceptance ' + Date.now());
        if (!project?.ok) throw new Error(project?.error || 'mask_project_setup_failed');
        await switchView(page, project.id, 'natural');
        sourceId = await page.evaluate(async projectId => {
            const source = await window.eveToolBase.createAtome({ type: 'shape', kind: 'shape', name: 'Explicit mask test source',
                left: 120, top: 140, width: 400, height: 300, color: '#237ac4', shape_variant: 'box',
                projectId, parentId: projectId }, { render: false });
            if (!source?.id) throw new Error('mask_source_setup_failed');
            await window.eveToolBase.loadProjectAtomes(projectId, { force: true, staleFirst: false });
            return source.id;
        }, project.id);
        const before = await page.evaluate(id => window.Atome.getStateCurrent(id), sourceId);
        const target = await recordCenter(page, project.id, record => record.id === sourceId, { sceneCoordinates: true });
        await clickCanvasTarget(page, target);
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'assistant_retouch' }));
        await waitFor(page, id => ({ ok: window.__eveDrawTool?.retouch?.snapshot()?.atomeId === id && window.__eveDrawTool.isActive(),
            assistant: window.eveAssistantApi?.getState()?.image }), sourceId, 30000);
        report.checks.push('real_retouch_action_exports_explicit_source');
        for (const [index, modifier] of [null, 'Alt', 'Meta'].entries()) {
            const x = target.x - 140 + index * 80, y = target.y - 60;
            if (modifier) await page.keyboard.down(modifier);
            await page.mouse.move(x, y); await page.mouse.down();
            try { await page.mouse.move(x + 55, y + 85, { steps: 14 }); }
            finally { await page.mouse.up(); if (modifier) await page.keyboard.up(modifier); }
            await waitFor(page, count => ({ ok: window.__eveDrawTool.retouch.snapshot()?.strokes === count,
                mask: window.__eveDrawTool.retouch.snapshot() }), index + 1, 10000);
        }
        await page.screenshot({ path: directory + '/retouch-strokes.png' });
        const outputs = await page.evaluate(async () => {
            const mask = window.__eveDrawTool.retouch;
            return { source: [...new Uint8Array(await (await mask.exportSource()).arrayBuffer())],
                mask: [...new Uint8Array(await (await mask.exportMask()).arrayBuffer())] };
        });
        for (const [name, bytes] of Object.entries(outputs)) fs.writeFileSync(directory + '/retouch-' + name + '.png', Buffer.from(bytes));
        const png = PNG.sync.read(Buffer.from(outputs.mask));
        let transparent = 0, opaque = 0;
        for (let i = 3; i < png.data.length; i += 4) { if (png.data[i] === 0) transparent++; if (png.data[i] === 255) opaque++; }
        if (!transparent || !opaque) throw new Error('mask_export_requires_opaque_and_transparent_regions');
        const after = await page.evaluate(id => window.Atome.getStateCurrent(id), sourceId);
        if (JSON.stringify(before.properties) !== JSON.stringify(after.properties)) throw new Error('retouch_changed_original');
        report.retouch = { width: png.width, height: png.height, transparent, opaque, original_unchanged: true };
        report.checks.push('real_brush_rectangle_ellipse_mask_and_shared_png_export');
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'assistant_mask_undo' }));
        await waitFor(page, () => window.__eveDrawTool.retouch.snapshot()?.strokes === 2);
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'assistant_mask_clear' }));
        await waitFor(page, () => window.__eveDrawTool.retouch.snapshot()?.strokes === 0);
        report.checks.push('real_mask_undo_and_clear_preserve_source');
    } finally {
        await page.evaluate(() => window.eveAssistantApi?.cancelImage());
        await waitFor(page, () => !window.__eveDrawTool?.retouch?.snapshot());
        if (sourceId) await page.evaluate(async id => {
            const result = await window.AdoleAPI.atomes.delete(id);
            if (!result?.fastify?.success) throw new Error('mask_source_cleanup_failed');
        }, sourceId);
        if (project?.id) await page.evaluate(async id => {
            const result = await window.AdoleAPI.projects.delete(id);
            if (!result?.fastify?.success) throw new Error('mask_project_cleanup_failed');
        }, project.id);
    }
};
