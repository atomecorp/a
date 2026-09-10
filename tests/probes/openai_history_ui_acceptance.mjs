import fs from 'node:fs';
import { chromium } from 'playwright';
import { ensureProject } from './dashboard_workspace_stress/product_actions.mjs';
import { switchView } from './molecule_ui_drop_core.mjs';
import { waitFor, recordCenter, clickCanvasTarget } from './molecule_ui_acceptance_support.mjs';
const context = await chromium.launchPersistentContext('temp/openai-live-browser', { headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const report = {}; let project, original;
const page = await context.newPage();
try {
    await page.goto('http://127.0.0.1:3001', { waitUntil: 'commit' });
    await waitFor(page, async () => { const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        return getMainMenuRuntime()?.measure()?.treeMounted && typeof window.Atome?.commit === 'function'; }, null, 45000);
    original = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_view_records.js')).currentProjectId());
    project = await ensureProject(page, 'OpenAI SVG history acceptance ' + Date.now());
    if (!project.ok) throw Error(project.error);
    await switchView(page, project.id, 'natural');
    report.created = await page.evaluate(async projectId => (await import('/eVe/intuition/tools/core/svg_draw_runtime.js')).createDrawObject({ project_id: projectId, mode: 'rect', color: '#008000', fill: '#008000', width: 160, height: 160 }), project.id);
    const id = report.created.id;
    if (!id) throw Error('history_fixture_missing');
    await clickCanvasTarget(page, await recordCenter(page, project.id, r => r.id === id, { sceneCoordinates: true }));
    await page.keyboard.press('Meta+z');
    await waitFor(page, async id => (await window.Atome.getStateCurrent(id))?.properties?.__deleted === true, id, 15000);
    report.undone = true;
    await page.keyboard.press('Meta+Shift+z');
    await waitFor(page, async id => (await window.Atome.getStateCurrent(id))?.properties?.__deleted === false, id, 15000);
    report.restored = await page.evaluate(async ({ id, projectId }) => ({ canonical: await window.Atome.getStateCurrent(id),
        scene: window.eveToolBase.getProjectSceneState(projectId)?.records?.find(r => r.id === id) }), { id, projectId: project.id });
    await page.screenshot({ path: 'temp/openai-history-ui.png' });
    if (report.restored.scene?.properties?.svg_markup !== report.restored.canonical.properties.svg_markup) throw Error('restored_svg_projection_mismatch');
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
    if (original) await page.evaluate(async id => { await window.AdoleAPI.projects.setCurrent(id); await window.eveToolBase.loadProjectAtomes(id, { force: true, staleFirst: false }); }, original);
    if (project?.id) { const r = await page.evaluate(id => window.AdoleAPI.projects.delete(id), project.id); report.projectCleanup = r?.fastify?.success === true; }
    fs.writeFileSync('temp/openai-history-ui.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, error: report.error, undone: report.undone, svg: report.restored?.scene?.properties?.svg_markup, sceneKeys: Object.keys(report.restored?.scene?.properties || {}), projectCleanup: report.projectCleanup }));
    await context.close();
}
