import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, visibleMenuTool, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { screenshot } from './molecule_ui_drop_core.mjs';

export const runDashboardModulesAcceptance = async ({ page, report, check, outDir }) => {
    const target = (nodeId, treeId = 'dashboard_bevy_ui') => awaitBevyUiNodeTarget(page, { nodeId, treeId });
    const click = async (nodeId, treeId) => clickCanvasTarget(page, await target(nodeId, treeId));
    const projectId = await page.evaluate(() => window.eveDashboardBevyUiRuntime.state.sceneProjectId);
    const handedness = async value => {
        await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'home'));
        const header = await target('home_bio_accordion_header', 'eve_bevy_panel_home');
        await clickCanvasTarget(page, header);
        await click(`home_handedness_${value}`, 'eve_bevy_panel_home');
        await click('eve_bevy_panel_home_footer_close', 'eve_bevy_panel_home');
        await waitFor(page, value => ({ ok: window.eveDashboardBevyUiRuntime.state.layout.handedness === value }), value);
    };
    const read = () => page.evaluate(() => {
        const layout = window.eveDashboardBevyUiRuntime.state.layout;
        const lane = layout.lanes.find(lane => lane.category.id === 'news');
        return { offset: lane.scroll_offset, max: lane.horizontal_scroll_max, bounds: lane.scroll_clip_rect,
            items: lane.visible_item_rects.map(item => ({ id: item.item.id, box: item.card_rect })), hand: layout.handedness };
    });
    for (const hand of ['left', 'right']) await check(`${hand} Dashboard keeps clock and weather fixed while News scrolls`, async () => {
        await handedness(hand);
        const initial = await read();
        assert(initial.max > 0, 'dashboard_news_overflow_fixture_required');
        const { bounds } = initial;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.wheel(-2000, 0); await wait(1000);
        const before = await read();
        await screenshot({ page, report, outDir, name: `dashboard_${hand}_news_before` });
        await page.mouse.wheel(2000, 0); await wait(1000);
        const after = await read();
        assert(after.offset > before.offset + 100, 'dashboard_news_did_not_scroll');
        for (const id of ['dashboard_module_clock', 'dashboard_module_weather']) {
            assert(JSON.stringify(before.items.find(item => item.id === id)?.box)
                === JSON.stringify(after.items.find(item => item.id === id)?.box), `dashboard_fixed_module_moved:${id}`);
            assert(await target(`__eve_dashboard_card_news_${id}`), `dashboard_fixed_module_not_hittable:${id}`);
        }
        report[`news_${hand}`] = { before, after };
        await screenshot({ page, report, outDir, name: `dashboard_${hand}_news_after` });
        await click('dashboard_guided_create');
        await target('dashboard_guide_family_health', 'eve_bevy_panel_dashboard_project_guide');
        await screenshot({ page, report, outDir, name: `dashboard_${hand}_guided` });
        await click('eve_bevy_panel_dashboard_project_guide_footer_close', 'eve_bevy_panel_dashboard_project_guide');
    });
    await check('weather uses the shared city editor, attributed source and live current conditions', async () => {
        await click('__eve_dashboard_card_news_dashboard_module_weather');
        const tree = 'eve_bevy_panel_dashboard_weather';
        await target('dashboard_weather_attribution', tree);
        await click('dashboard_weather_city', tree);
        await page.keyboard.press('Meta+A'); await page.keyboard.insertText('Paris');
        await click('dashboard_weather_search', tree);
        await click('dashboard_weather_place_0', tree);
        const weather = await waitFor(page, () => {
            const root = window.eveBevyUiRuntime.state.sourceTrees.get('eve_bevy_panel_dashboard_weather')?.tree.root;
            const find = node => node?.id === 'dashboard_weather_status' ? node : (node?.children || []).map(find).find(Boolean);
            const text = find(root)?.text || '';
            return { ok: text.includes('°C'), text };
        });
        report.weather = weather;
        await screenshot({ page, report, outDir, name: 'dashboard_weather_current_attributed' });
        await click('eve_bevy_panel_dashboard_weather_footer_close', tree);
    });
};
