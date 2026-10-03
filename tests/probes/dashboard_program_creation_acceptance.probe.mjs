import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { enterGuestWorkspace } from './dashboard_bevy_runtime/runtime_support.mjs';
import { waitFor, awaitBevyUiNodeTarget, clickCanvasTarget } from './molecule_ui_acceptance_support.mjs';

const output = path.resolve('temp/probe_reports/dashboard_program_creation');
fs.mkdirSync(output, { recursive: true });
const report = { steps: [], errors: [], warnings: [], networkFailures: [] };
const browser = await chromium.launch({ headless: false, args: ['--window-position=-32000,-32000', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
    if (message.type() === 'error') report.errors.push(message.text());
    if (message.type() === 'warning') report.warnings.push(message.text());
});
page.on('requestfailed', request => report.networkFailures.push({ url: request.url(), error: request.failure()?.errorText }));
const click = async nodeId => clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs: 15000 }));
try {
    await page.goto(process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001');
    await enterGuestWorkspace(page);
    await waitFor(page, () => window.eveDashboardBevyUiRuntime?.state?.active === true
        && window.eveBevyUiRuntime?.state?.trees?.has('dashboard_bevy_ui'), null, 45000);
    // The Dashboard deliberately hides the main menu; its mounted tree owns these clicks.
    const header = await awaitBevyUiNodeTarget(page, { nodeId: '__eve_dashboard_header_bg_projects' });
    const box = header.hit.box;
    const point = await page.evaluate(box => {
        const rect = document.getElementById('eve_surface_project').getBoundingClientRect();
        return { x: rect.left + box.x + box.width / 2, y: rect.top + box.y + box.height * 5 / 6 };
    }, box);
    await clickCanvasTarget(page, { ...header, ...point });
    await click('__eve_dashboard_create_cell_family_health');
    await page.screenshot({ path: path.join(output, 'health.png') });
    await click('__eve_dashboard_create_cell_goal_health_sleep');
    await waitFor(page, () => window.eveDashboardBevyUiRuntime?.state?.creation?.busy !== true, null, 45000);
    report.creation = await page.evaluate(() => ({
        error: window.eveDashboardBevyUiRuntime?.state?.creation?.error || '',
        workspace: window.__eveWorkspaceMode,
        dashboardActive: window.eveDashboardBevyUiRuntime?.state?.active
    }));
    assert.equal(report.creation.error, '', 'guided Sleep creation failed');
    const projectId = report.creation.workspace?.projectId;
    assert.equal(report.creation.workspace?.mode, 'project');
    assert.ok(projectId);
    report.project = await page.evaluate(async id => ({
        root: await window.Atome.getStateCurrent(id),
        records: await window.Atome.listStateCurrent(id, { limit: 100 })
    }), projectId);
    assert.deepEqual(report.project.root.properties.project_intent, { family: 'health', goal: 'sleep' });
    assert.equal(report.project.root.properties.project_program.definition.key, 'sleep');
    assert.equal(report.project.root.properties.template_link.update_policy, 'pinned');
    assert.equal(report.project.root.properties.template_link.initialized, true);
    assert.ok(!report.project.root.properties.system_template_key);
    assert.ok(!report.project.root.properties.project_tags?.includes('template'));
    assert.equal(report.project.records.filter(record => record.atome_type === 'interaction').length, 3);
    assert.equal(report.project.records.filter(record => record.atome_type === 'calendar_event').length, 0);
    report.steps.push('real Dashboard → New project → Health → Sleep creates a private pinned programme');
    await page.screenshot({ path: path.join(output, 'project.png') });
    await waitFor(page, async () => {
        const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const menu = getMainMenuRuntime()?.measure?.();
        return menu?.active === true && menu.treeMounted === true;
    }, null, 30000);
    const plan = report.project.records.find(record => record.properties?.name === 'Implication et plan'
        && record.atome_type === 'shape')?.atome_id;
    assert.ok(plan, 'native programme plan control missing');
    const { recordCenter } = await import('./molecule_ui_acceptance_support.mjs');
    await clickCanvasTarget(page, await recordCenter(page, projectId, record => record.id === plan, { sceneCoordinates: true }));
    await awaitBevyUiNodeTarget(page, { nodeId: 'program_preview', treeId: 'eve_bevy_panel_program' }, { timeoutMs: 15000 });
    report.steps.push('real plan control opens the existing programme panel');
    await page.screenshot({ path: path.join(output, 'plan.png') });
    await page.reload();
    await page.waitForFunction(() => typeof window.Atome?.getStateCurrent === 'function'
        && window.__authCheckComplete === true, null, { timeout: 45000 });
    report.reloaded = await page.evaluate(async id => window.Atome.getStateCurrent(id), projectId);
    assert.deepEqual(report.reloaded.properties.project_program, report.project.root.properties.project_program);
    report.steps.push('same programme survives reload without calendar writes');
    assert.deepEqual(report.errors, []);
} catch (error) {
    report.failure = error.stack;
    report.diagnostics = await page.evaluate(() => ({
        creation: window.eveDashboardBevyUiRuntime?.state?.creation,
        workspace: window.__eveWorkspaceMode,
        trees: [...(window.eveBevyUiRuntime?.state?.trees?.keys() || [])]
    }));
    await page.screenshot({ path: path.join(output, 'failure.png') });
    process.exitCode = 1;
} finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
}
console.log(JSON.stringify({ steps: report.steps, creation: report.creation, failure: report.failure,
    errors: report.errors, warnings: report.warnings, networkFailures: report.networkFailures }, null, 2));
