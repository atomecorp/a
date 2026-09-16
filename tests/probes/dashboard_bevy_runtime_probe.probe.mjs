import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { clickCanvasRectCenter, enterGuestWorkspace, sleep, waitForPresentationFrames } from './dashboard_bevy_runtime/runtime_support.mjs';
import { dashboardSnapshot } from './dashboard_bevy_runtime/snapshot_support.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/dashboard_bevy_runtime');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const GLASS_BACKGROUND_SIGNATURE = 'dashboard-frozen-glass-probe';
const GLASS_BACKGROUND_SOURCE = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
      <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#173b68"/><rect x="16" y="16" width="16" height="16" fill="#173b68"/>
        <rect x="16" width="16" height="16" fill="#d68b36"/><rect y="16" width="16" height="16" fill="#d68b36"/>
      </pattern></defs>
      <rect width="1280" height="820" fill="url(#grid)"/>
    </svg>
`)}`;
fs.mkdirSync(OUT_DIR, { recursive: true });

const waitForSnapshot = async (page, predicate, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    let snapshot = null;
    while (Date.now() < deadline) {
        snapshot = await dashboardSnapshot(page).catch((error) => ({ ok: false, error: error.message }));
        if (predicate(snapshot)) return snapshot;
        await sleep(200);
    }
    throw new Error(`dashboard_snapshot_timeout:${JSON.stringify(snapshot)}`);
};

const assert = (condition, error) => { if (!condition) throw new Error(error); };
const backgroundReady = (snapshot) => (
    snapshot.dashboardVisibleRecordIds.includes('__eve_dashboard_surface_base')
    && snapshot.presentationOpacity >= 0.999
    && snapshot.layout?.surface_rect?.width === snapshot.canvas?.width
    && snapshot.layout?.surface_rect?.height === snapshot.canvas?.height
);
const fixedGridReady = (snapshot) => {
    const ids = snapshot.layout?.lanes?.map((lane) => lane.categoryId) || [];
    return JSON.stringify(ids) === JSON.stringify(['news', 'calendar', 'projects', 'contacts', 'monitor']);
};
const noObsoleteRecords = (snapshot) => (
    snapshot.dashboardRecordIds.every((id) => !/(?:project_veil|bottom_shadow|header_side_shadow|focus_spread|create_bg|_lane_|_table$)/.test(id))
);
const transparentColor = (value = '') => Number(String(value).match(/^rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)$/i)?.[1]) === 0;
const frozenContentReady = (snapshot) => {
    const expected = (snapshot.layout?.lanes || []).reduce((total, lane) => total + lane.items.length, 0);
    return snapshot.dashboardCardRecords.length === expected
        && snapshot.dashboardCardRecords.every((record) => (
            transparentColor(record.color)
            && Number(record.backdrop?.blurPx) > 0
            && Number(record.backdrop?.tint?.[3]) > 0
            && Number(record.backdrop?.tint?.[3]) < 0.5
        ))
        && snapshot.dashboardMediaRecords.every((record) => record.opacity > 0 && record.opacity < 1);
};

const renderFrozenGlassMediaFixture = async (page) => page.evaluate(async () => {
    const [{ createDashboardLayout }, { buildDashboardBevyUiTree }, { mergeDashboardTokens }, { decorateWorkspaceBevyUiTree }] = await Promise.all([
        import('/eVe/domains/dashboard/dashboard_layout.js'),
        import('/eVe/domains/dashboard/dashboard_bevy_ui_tree.js'),
        import('/eVe/domains/dashboard/dashboard_tokens.js'),
        import('/eVe/domains/rendering/workspace_scene_layers.js')
    ]);
    await window.eveDashboardBevyUiRuntime?.destroy?.();
    const surface = document.getElementById('eve_surface_project');
    const rect = surface.getBoundingClientRect();
    const tokens = mergeDashboardTokens({ metrics: { blockUnitSizePx: 112 } });
    const categories = [
        ['news', '#9f2f2f', 'news'], ['calendar', '#245f94', 'calendar'],
        ['projects', '#357245', 'projects'], ['contacts', '#673071', 'contacts'],
        ['monitor', '#2f6f78', 'monitor']
    ].map(([id, color, icon_id]) => ({ id, color, icon_id, label_key: `eve.dashboard.category.${id}` }));
    const media = (color, label) => `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
          <rect width="320" height="180" fill="${color}"/><circle cx="160" cy="74" r="54" fill="#ffffff" fill-opacity=".72"/>
          <text x="160" y="164" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#fff">${label}</text>
        </svg>
    `)}`;
    const itemsByCategory = new Map([
        ['news', [
            { id: 'weather', category_id: 'news', title: 'Météo', span: 2, metadata: { dashboard_module: 'weather', weather: { status: 'ready', temperature: 18, city: 'Clermont-Ferrand', condition: 'clear', condition_label: 'Ciel dégagé' } } },
            { id: 'news', category_id: 'news', title: 'Actualité sans média' }
        ]],
        ['calendar', [{ id: 'event', category_id: 'calendar', title: 'Événement', payload: { start: '2026-09-16T20:30:00Z' } }]],
        ['projects', [
            { id: 'project-media', category_id: 'projects', title: 'Projet avec image', metadata: { project_preview_source: media('#29764c', 'PROJET'), project_preview_width: 320, project_preview_height: 180 } },
            { id: 'project-empty', category_id: 'projects', title: 'Projet sans image' }
        ]],
        ['contacts', [
            { id: 'contact-media', category_id: 'contacts', title: 'Contact avec photo', metadata: { user_face: media('#6f3780', 'CONTACT') } },
            { id: 'contact-empty', category_id: 'contacts', title: 'Contact sans photo' }
        ]],
        ['monitor', [{ id: 'monitor', category_id: 'monitor', title: 'Moniteur' }]]
    ]);
    const layout = createDashboardLayout({
        width: rect.width, height: rect.height, categories, itemsByCategory, handedness: 'right', tokens
    });
    const tree = decorateWorkspaceBevyUiTree({
        layer: 'dashboard', tree: buildDashboardBevyUiTree({ layout, tokens })
    });
    await window.eveBevyUiRuntime.mountTree({ id: tree.id, surface, tree });
    const children = tree.root.children || [];
    const cards = children.filter((node) => /^__eve_dashboard_card_(?!media_|title_|date_|label_backdrop_|weather_)/.test(node.id));
    const images = children.filter((node) => node.id.startsWith('__eve_dashboard_card_media_'));
    return {
        ok: cards.length === 8
            && cards.every((node) => node.style?.backdrop?.blur_px > 0 && node.style?.backdrop?.tint?.[3] < 0.5)
            && images.length === 2
            && images.every((node) => node.style?.opacity > 0 && node.style?.opacity < 1),
        cards: cards.map((node) => ({ id: node.id, background: node.style.background, backdrop: node.style.backdrop })),
        images: images.map((node) => ({ id: node.id, opacity: node.style.opacity }))
    };
});

const run = async () => {
    const report = { ok: false, checks: [], console: [], pageErrors: [] };
    const browser = await chromium.launch({
        headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '0' ? false : process.env.HEADLESS !== '0',
        args: ['--enable-unsafe-webgpu']
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') report.console.push(message.text()); });
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await enterGuestWorkspace(page);
        await page.evaluate(async ({ sourceUrl, signature }) => {
            const { publishBevySurfaceBackground } = await import('/eVe/domains/rendering/bevy_surface_background_runtime.js');
            publishBevySurfaceBackground({ color: [0.04, 0.04, 0.05, 1], sourceUrl, signature }, window);
        }, { sourceUrl: GLASS_BACKGROUND_SOURCE, signature: GLASS_BACKGROUND_SIGNATURE });
        const opened = await waitForSnapshot(page, (snapshot) => (
            snapshot.active && backgroundReady(snapshot) && fixedGridReady(snapshot)
            && snapshot.surfaceBackgroundSignature === GLASS_BACKGROUND_SIGNATURE
            && snapshot.dashboardDomCount === 0
            && snapshot.menu?.suspended === true
            && frozenContentReady(snapshot)
            && snapshot.postOpenHydrationPending !== true
        ), 60000);
        assert(opened.toolboxHeight === 0, 'dashboard_reserved_menu_height_present');
        assert(opened.layout.toolbox_reserved_rect.height === 0, 'dashboard_layout_reserved_menu_height_present');
        assert(!opened.layout.lanes.some((lane) => lane.categoryId === 'store'), 'dashboard_store_lane_present');
        assert(noObsoleteRecords(opened), 'dashboard_obsolete_records_present');
        assert(!opened.postOpenHydrationError, `dashboard_hydration_error:${opened.postOpenHydrationError}`);
        assert(frozenContentReady(opened), 'dashboard_content_frozen_glass_contract_missing');
        const weather = opened.layout.lanes.find((lane) => lane.categoryId === 'news')?.items
            .find((item) => item.id === 'dashboard_module_weather');
        assert(weather, 'dashboard_weather_card_missing');
        assert(Math.round(weather.rect.width) === Math.round(opened.layout.lanes[0].header_rect.width * 2), 'dashboard_weather_not_two_units');
        report.checks.push({ name: 'fullscreen_fixed_grid_menu_suspended', ok: true, snapshot: opened });
        report.checks.push({
            name: 'all_content_cells_use_styled_frozen_glass',
            ok: true,
            cardCount: opened.dashboardCardRecords.length,
            mediaCount: opened.dashboardMediaRecords.length
        });
        await waitForPresentationFrames(page, 8);
        await page.screenshot({ path: path.join(OUT_DIR, 'dashboard_right.png') });

        const monitor = opened.layout.lanes.find((lane) => lane.categoryId === 'monitor');
        await clickCanvasRectCenter(page, monitor.header_rect);
        const focused = await waitForSnapshot(page, (snapshot) => snapshot.activeCategoryId === 'monitor');
        assert(fixedGridReady(focused), 'dashboard_focus_redistributed_rows');
        assert(noObsoleteRecords(focused), 'dashboard_focus_spread_returned');
        const headerFills = new Map(focused.dashboardFillRecords
            .filter((record) => record.id.includes('header_bg_')).map((record) => [record.id, record]));
        assert(headerFills.get('__eve_dashboard_header_bg_monitor')?.backdrop?.blurPx > 0, 'dashboard_active_header_blur_missing');
        report.checks.push({ name: 'header_focus_is_visual_only', ok: true, snapshot: focused });

        await page.evaluate(() => {
            window.__eveProfilePreferences = {
                ...(window.__eveProfilePreferences || {}),
                visual: { ...(window.__eveProfilePreferences?.visual || {}), handedness: 'left' }
            };
            window.__eveIntuitionXState = { ...(window.__eveIntuitionXState || {}), handedness: 'left' };
            window.dispatchEvent(new CustomEvent('eve:profile-preferences-updated', { detail: { preferences: window.__eveProfilePreferences } }));
        });
        const mirrored = await waitForSnapshot(page, (snapshot) => snapshot.layout?.handedness === 'left');
        const news = mirrored.layout.lanes.find((lane) => lane.categoryId === 'news');
        const weatherLeft = news.items.find((item) => item.id === 'dashboard_module_weather');
        assert(news.header_rect.x === 0, 'dashboard_left_header_not_on_left_edge');
        assert(Math.round(weatherLeft.rect.x + weatherLeft.rect.width) === Math.round(mirrored.canvas.width), 'dashboard_left_weather_not_on_right_edge');
        report.checks.push({ name: 'left_handed_exact_mirror', ok: true, snapshot: mirrored });
        await waitForPresentationFrames(page, 8);
        await page.screenshot({ path: path.join(OUT_DIR, 'dashboard_left.png') });

        const projectLane = mirrored.layout.lanes.find((lane) => lane.categoryId === 'projects');
        const project = projectLane?.items?.[0];
        if (project) {
            await clickCanvasRectCenter(page, project.rect);
            const exited = await waitForSnapshot(page, (snapshot) => !snapshot.active && snapshot.menu?.suspended === false, 60000);
            report.checks.push({ name: 'project_activation_restores_menu', ok: true, snapshot: exited });
        } else {
            report.checks.push({ name: 'project_activation_restores_menu', ok: true, skipped: 'no_project_fixture' });
        }
        const frozenMediaFixture = await renderFrozenGlassMediaFixture(page);
        assert(frozenMediaFixture.ok, `dashboard_frozen_media_fixture_failed:${JSON.stringify(frozenMediaFixture)}`);
        await waitForPresentationFrames(page, 12);
        await page.screenshot({ path: path.join(OUT_DIR, 'dashboard_frozen_glass_cells.png') });
        report.checks.push({ name: 'frozen_glass_media_and_empty_cells_pixels', ok: true, fixture: frozenMediaFixture });
        assert(report.console.length === 0, 'dashboard_console_errors');
        assert(report.pageErrors.length === 0, 'dashboard_page_errors');
        report.ok = true;
    } finally {
        fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        await browser.close();
    }
    console.log(JSON.stringify({ ok: report.ok, report: REPORT_FILE }));
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
