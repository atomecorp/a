// R-108 / BUG-015 on the real Web app: in a project created by `ui.new_project`, the project's tools are used by real
// pointer gestures on the WebGPU canvas (the main menu's tools, found and hit-tested by the repository's canvas helpers):
// a shape created by its tool, selected by a touch on it, a property (colour) applied, the List view and back, then the
// project left for the Dashboard and reopened by `ui.project.open`, the shape still there with its colour.
// Usage: PW_HEADFUL=1 xvfb-run -a node tests/probes/r108_project_tools_web.probe.mjs (isolated test server).
import path from 'node:path';
import { awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, sceneRecords, visibleMenuTool, waitFor, waitForStableScene, wait } from './molecule_ui_acceptance_support.mjs';
import { openR108Session } from './r108_web_session.mjs';

const OUT = path.resolve(process.env.R108_OUT || 'temp/probe_reports/r108_project_tools_web');
const { page, check, signIn, tool, inProject, toDashboard, finish } = await openR108Session({ out: OUT });
const menuKeys = (projectId) => page.evaluate(async (pid) => {
    const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
    const prefix = '__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_';
    return [...new Set(records.map((record) => String(record.id || '')).filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length).replace(/_(background|icon_image|label_text)$/, '')))].sort();
}, projectId);
const userRecords = async (projectId) => (await sceneRecords(page, projectId)).filter((record) => !String(record.id).startsWith('__eve_'));
const tap = async (projectId, key) => clickCanvasTarget(page, await visibleMenuTool(page, projectId, key));

try {
    await check('sign_in', signIn);
    const project = await check('create_project', async () => {
        const result = await tool({ tool_id: 'ui.new_project', action: 'pointer.click', input: { name: 'TEST-R108-TOOLS' } });
        if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
        return inProject();
    });
    if (!project) throw new Error('no_project');
    const pid = project.id;
    await check('menu_mounted', () => waitFor(page, async () => {
        const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const m = getMainMenuRuntime()?.measure?.();
        return { ok: m?.active === true && m?.treeMounted === true, active: m?.active, mounted: m?.treeMounted };
    }, null, 60000));
    await check('menu_tools', async () => ({ keys: await menuKeys(pid) }));
    await page.screenshot({ path: path.join(OUT, 'project.png') });
    const before = (await userRecords(pid)).length;
    await check('create_shape_by_tool', async () => {
        await tap(pid, 'create');
        await wait(600);
        await tap(pid, 'shape_create');
        await wait(600);
        const found = await waitFor(page, () => {
            const ids = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .flatMap((tree) => (tree.interactiveNodes || []).map((node) => String(node?.id || node)));
            const circle = ids.find((id) => /circle/i.test(id) && !/_background$/.test(id)) || '';
            return { ok: !!circle, circle, ids: ids.filter((id) => !/_background$/.test(id)).slice(-30) };
        }, null, 10000).catch((error) => ({ ok: false, error: error.message.slice(0, 1500) }));
        console.log('  shape palette:', JSON.stringify(found).slice(0, 1500));
        await page.screenshot({ path: path.join(OUT, 'shape_palette.png') });
        const shapeKey = found.circle ? found.circle.replace(/^eve_bevy_ui_main_menu_tool_/, '').split('__').at(-1) : '';
        const keys = [found.error || ''];
        if (!shapeKey) throw new Error(`no_shape_tool:${keys.join(',')}`);
        // The shapes lie on the contextual edit rail (bevy_panel_atome_contextual_edit_rail), a tree of its own.
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodePrefix: found.circle, step: 2 }));
        // Armed (its glyph lit), the shape tool places its shape where the canvas is touched, then dragged.
        await page.mouse.click(200, 300);
        await wait(800);
        if ((await userRecords(pid)).length <= before) {
            await page.mouse.move(150, 250); await page.mouse.down(); await page.mouse.move(250, 350, { steps: 12 }); await page.mouse.up();
        }
        const created = await waitFor(page, async ({ id, count }) => {
            const records = (window.eveToolBase?.getProjectSceneState?.(id)?.records || []).filter((r) => !String(r.id).startsWith('__eve_'));
            return { ok: records.length > count, count: records.length, last: records.at(-1)?.id || '' };
        }, { id: pid, count: before }, 20000);
        return { shapeKey, ...created };
    });
    await page.screenshot({ path: path.join(OUT, 'shape.png') });
    const shape = (await userRecords(pid)).at(-1);
    if (!shape) throw new Error('no_shape');
    const selection = () => page.evaluate(async () => (await import('/eVe/intuition/tools/selection_style_context.js')).resolveSelectionIds());
    await check('disarm_shape_tool', async () => {
        // A creation tool stays armed: each touch on the canvas places another shape. The palette's slot, which stands for
        // the locked tool, turns it off (atome_contextual_edit_handlers.js, R4).
        await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { nodePrefix: 'atome_contextual_tool_shape_create', step: 2 }));
        await wait(800);
        const count = (await userRecords(pid)).length;
        await page.mouse.click(30, 120);
        await wait(1200);
        const after = (await userRecords(pid)).length;
        if (after !== count) throw new Error(`still_armed:${count}->${after}`);
        return { records: after };
    });
    await check('select_shape_by_touch', async () => {
        await waitForStableScene(page, pid);
        await clickCanvasTarget(page, await recordCenter(page, pid, (record) => record.id === shape.id));
        return waitFor(page, async (id) => {
            const ids = await (await import('/eVe/intuition/tools/selection_style_context.js')).resolveSelectionIds();
            return { ok: ids.includes(id), ids };
        }, shape.id, 10000);
    });
    await check('rail_with_selection', () => page.evaluate(() => (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
        .map((tree) => `${tree.id}:${(tree.interactiveNodes || []).filter((n) => !/_background$/.test(String(n?.id || n))).length}`)));
    await page.screenshot({ path: path.join(OUT, 'selected.png') });
    const COLOR = '#ff8800';
    await check('colour_applied_to_selection', async () => {
        const result = await tool({ tool_id: 'ui.couleur.apply', action: 'pointer.click', input: { color: COLOR } });
        if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
        return waitFor(page, async ({ id, color }) => {
            const record = (window.eveToolBase?.getProjectSceneState?.(window.__currentProject.id)?.records || []).find((r) => r.id === id);
            const props = record?.properties || {};
            const value = String(props.backgroundColor || props.background || props.fill || props.color || '').toLowerCase();
            return { ok: value.includes(color.slice(1)) || value.includes('255, 136, 0') || value.includes('255,136,0'), value };
        }, { id: shape.id, color: COLOR }, 10000);
    });
    await check('list_view_and_back', () => page.evaluate(async () => {
        const views = await import('/eVe/domains/rendering/project_view_mode_state.js');
        const toList = await views.setProjectViewMode(views.PROJECT_VIEW_MODES.LIST, { projectId: window.__currentProject.id });
        const listed = views.getProjectViewMode(window.__currentProject.id);
        const back = await views.setProjectViewMode(views.PROJECT_VIEW_MODES.NATURAL, { projectId: window.__currentProject.id });
        return { ok: toList?.ok !== false && back?.ok !== false, listed, now: views.getProjectViewMode(window.__currentProject.id) };
    }).then((r) => { if (!r.ok || r.listed !== 'list') throw new Error(JSON.stringify(r)); return r; }));
    await page.screenshot({ path: path.join(OUT, 'after_list.png') });
    await check('leave_for_dashboard', toDashboard);
    await check('reopen_project', async () => {
        const result = await tool({ tool_id: 'ui.project.open', action: 'open', input: { project_id: pid } });
        if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
        return inProject(pid);
    });
    await check('shape_kept_with_colour', () => waitFor(page, async ({ id, color }) => {
        const record = (window.eveToolBase?.getProjectSceneState?.(window.__currentProject.id)?.records || []).find((r) => r.id === id);
        const props = record?.properties || {};
        const value = String(props.backgroundColor || props.background || props.fill || props.color || '').toLowerCase();
        return { ok: !!record && (value.includes(color.slice(1)) || value.includes('255, 136, 0') || value.includes('255,136,0')), value, found: !!record };
    }, { id: shape.id, color: '#ff8800' }, 20000));
    await page.screenshot({ path: path.join(OUT, 'reopened.png') });
} finally {
    await finish();
}
