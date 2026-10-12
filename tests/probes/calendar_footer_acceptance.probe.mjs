import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { waitFor, waitForStableScene, sceneRecords, awaitBevyUiNodeTarget, clickCanvasTarget } from './molecule_ui_acceptance_support.mjs';

const output = path.resolve('temp/calendar-footer'); fs.mkdirSync(output, { recursive: true });
const report = { steps: [], errors: [], warnings: [], network: [] };
const browser = await chromium.launch({ headless: false, args: ['--window-position=-32000,-32000', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', error => { report.errors.push(error.message); console.log('ERROR', error.message); });
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
page.on('requestfailed', request => report.network.push({ url: request.url(), error: request.failure()?.errorText }));
const step = value => { report.steps.push(value); console.log(value); };
const click = async nodeId => {
    const target = await awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs: 15000 });
    assert.ok(target, `node_not_actionable:${nodeId}`); await clickCanvasTarget(page, target);
};
const stage = name => waitFor(page, async value => {
    const { getFirstLaunchRuntime } = await import('/eVe/domains/user/first_launch_runtime.js');
    return getFirstLaunchRuntime()?.state.stage === value && getFirstLaunchRuntime()?.state.busy !== true;
}, name, 45000);
const templateControl = async (operation, value = '') => {
    const id = await page.evaluate(async ({ operation, value }) => {
        const records = await window.Atome.listStateCurrent(null, { limit: 4000 });
        const handlers = window.eveBevyUiRuntime.state.handlers;
        for (const record of records) {
            const control = record.properties?.template_control;
            const id = record.id || record.atome_id;
            const nodeId = `__eve_dashboard_card_template_controls_${id}`;
            const direct = handlers.has(`eve_bevy_panel_first_launch:${id}:activate`) ? id : nodeId;
            if (control?.operation === operation && (!value || control.value === value)
                && handlers.has(`eve_bevy_panel_first_launch:${direct}:activate`)) return direct;
        }
        return null;
    }, { operation, value });
    assert.ok(id, `template_control_missing:${operation}`); await click(id);
};
try {
    await page.goto(process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001', { waitUntil: 'commit' });
    await waitFor(page, () => !!window.__DEBUG__ || !!document.getElementById('intuition'), null, 30000);
    await waitFor(page, () => window.eveBevyUiRuntime?.state?.trees?.has('eve_bevy_panel_first_launch'), null, 45000);
    await click('__eve_dashboard_card_template_controls___first_launch_first_launch_access_free');
    await stage('goals'); step('Guest entered through the real access card');
    await templateControl('goal', 'journal');
    await waitFor(page, async () => !(await import('/eVe/domains/user/first_launch_runtime.js')).getFirstLaunchRuntime()?.state.active, null, 45000);
    step('QA guest setup complete');
    const initialState = await page.evaluate(async () => ({ workspace: window.__eveWorkspaceMode, dashboard: window.eveDashboardBevyUiRuntime?.state?.active, menu: (await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js')).getMainMenuRuntime()?.measure(), trees:[...window.eveBevyUiRuntime.state.trees.keys()] }));
    console.log(JSON.stringify(initialState));
    // QA setup uses the public panel API; every behavior under test uses real pointer actions.
    const opened = await page.evaluate(async () => (await import('/eVe/intuition/tools/calendar.js')).openCalendarPanel());
    assert.equal(opened.ok, true, JSON.stringify(opened));
    await waitFor(page, () => window.eveBevyUiRuntime.state.trees.has('eve_bevy_panel_calendar'), null, 20000);
    step('Calendar prepared through its public API for QA');
    await click('calendar_impex');
    await waitFor(page, () => window.eveBevyUiRuntime.state.trees.has('eve_bevy_panel_impex_calendar'), null, 20000);
    assert.ok(await awaitBevyUiNodeTarget(page, { nodeId: 'calendar_transfer_import' }));
    assert.ok(await awaitBevyUiNodeTarget(page, { nodeId: 'calendar_transfer_export' }));
    await page.screenshot({ path: path.join(output, 'impex-web.png') });
    step('Impex opens both actionable ICS options');
    const fixture = path.join(output, 'acceptance.ics');
    fs.writeFileSync(fixture, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Atome QA//Calendar//FR\r\nBEGIN:VEVENT\r\nUID:calendar-footer-acceptance\r\nDTSTART:20261012T090000\r\nDTEND:20261012T100000\r\nSUMMARY:Calendar footer QA\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
    const chooser = page.waitForEvent('filechooser'); await click('calendar_transfer_import');
    await (await chooser).setFiles(fixture);
    await waitFor(page, async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarTransferSurface.readState().notice !== '', null, 20000);
    assert.equal(await page.evaluate(async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarTransferSurface.readState().error), true);
    step('The real ICS picker runs; canonical import retains authenticated-owner protection for this guest');
    await click('eve_bevy_panel_impex_calendar_footer_close');
    await click('calendar_display');
    await click('calendar_view_selector_segment_1');
    await waitFor(page, async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().view === 'week', null, 15000);
    step('Week applies before viewport changes');
    for (const width of [390, 320, 1440]) {
        await page.setViewportSize({ width, height: width > 500 ? 1100 : 844 });
        await waitFor(page, async width => {
            const surface = document.getElementById('eve_surface_project');
            const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
            const { bevyPanelRuntimeState } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
            const geometry = bevyPanelRuntimeState.geometryBySurfaceKey.get('calendar');
            return Math.abs(readRenderSurfaceSize(surface).width - width) < 1 && geometry?.width <= width;
        }, width, 20000);
        await waitForStableScene(page, initialState.workspace.projectId);
        await waitFor(page, async () => {
            const { calendarSurface } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js');
            return calendarSurface.readState().displayOpen;
        }, null, 10000);
        const modes = [];
        for (let index = 0; index < 4; index++) modes.push(await awaitBevyUiNodeTarget(page, { nodeId: `calendar_view_selector_segment_${index}` }, { timeoutMs: 15000 }));
        assert.ok(modes.every(Boolean), `display_modes_not_actionable:${width}`);
        assert.ok(modes.every(target => target.hit.box.x >= 0 && target.hit.box.x + target.hit.box.width <= width), `display_modes_clipped:${width}`);
        const labels = await page.evaluate(async () => {
            const { createTextEditingLayout } = await import('/eVe/domains/rendering/text_editing_layout.js');
            const entry = window.eveBevyUiRuntime.state.trees.get('eve_bevy_panel_calendar');
            const find = node => node.id === 'calendar_view_selector' ? node : (node.children || []).map(find).find(Boolean);
            return find(entry.tree.root).children.map(segment => {
                const label = segment.children.at(-1);
                return { text: label.text, width: segment.style.size[0], measured: createTextEditingLayout({ value: label.text, style: label.style }).measuredWidth };
            });
        });
        assert.ok(labels.every(label => label.measured <= label.width), `display_labels_clipped:${width}:${JSON.stringify(labels)}`);
        await page.screenshot({ path: path.join(output, `display-web-${width}.png`) });
        step(`All four modes are actionable at ${width}px`);
    }
    await click('calendar_view_selector_segment_0');
    await waitFor(page, async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().view === 'month', null, 15000);
    const view = await page.evaluate(async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().view);
    assert.equal(view, 'month'); step('Month selection updates the real panel');
    // Horizontal scroll brings the retained Affichage command back for folding.
    const modeTarget = await awaitBevyUiNodeTarget(page, { nodeId: 'calendar_view_selector_segment_0' });
    await page.mouse.move(modeTarget.x, modeTarget.y); await page.mouse.wheel(-500, 0);
    await click('calendar_display');
    await waitFor(page, async () => !(await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().displayOpen, null, 10000);
    step('Affichage folds through its retained standard command');
    await click('calendar_add');
    await waitFor(page, async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().editorMode === 'new', null, 10000);
    step('Nouveau opens the existing draft editor');
    const previousVersion = await page.evaluate(() => window.eveBevyUiRuntime.state.renderVersions.get('eve_bevy_panel_calendar'));
    await click('calendar_impex');
    await waitFor(page, version => window.eveBevyUiRuntime.state.renderVersions.get('eve_bevy_panel_calendar') >= version + 2, previousVersion, 10000);
    assert.ok((await sceneRecords(page, initialState.workspace.projectId)).some(record => record.id.startsWith('__eve_bevy_ui_eve_bevy_panel_impex_calendar_')),
        'impex_records_removed_by_calendar_refresh');
    await page.screenshot({ path: path.join(output, 'impex-web-editor-refresh.png') });
    await click('eve_bevy_panel_impex_calendar_footer_close');
    step('Impex remains projected through periodic editor refreshes');
    const title = await awaitBevyUiNodeTarget(page, { nodeId: 'calendar_editor_title' });
    await clickCanvasTarget(page, title); await page.keyboard.insertText('Web rendez-vous QA');
    await click('calendar_editor_save');
    await waitFor(page, async () => {
        const state = (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState();
        return !state.editorOpen && state.events.some(event => event.title === 'Web rendez-vous QA');
    }, null, 20000);
    step('The new appointment persists only after validation');
    const cell = await awaitBevyUiNodeTarget(page, { nodeId: 'calendar_month_day_15' });
    await page.mouse.dblclick(cell.x, cell.y);
    await waitFor(page, async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().editorMode === 'new', null, 10000);
    const draft = await page.evaluate(async () => (await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().draft);
    assert.equal(draft.allDay, true); assert.equal(draft.id, '');
    await click('calendar_editor_cancel');
    await waitFor(page, async () => !(await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js')).calendarSurface.readState().editorOpen, null, 10000);
    step('Double-click opens a prefilled all-day draft; cancellation closes it');
    report.status = 'passed';

} catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
    await page.screenshot({ path: path.join(output, 'failed-web.png') });
    console.log('FAILED', error.message);
} finally {
    fs.writeFileSync(path.join(output, 'web-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); await browser.close();
}
