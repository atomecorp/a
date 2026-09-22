import { describe, expect, it } from 'vitest';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';

const categories = [
    ['news', '#9f2f2f'], ['calendar', '#245f94'], ['projects', '#357245'],
    ['contacts', '#673071'], ['monitor', '#2f6f78']
].map(([id, color], order) => ({ id, color, order, icon_id: id, label_key: `eve.dashboard.category.${id}` }));

const weather = {
    id: 'dashboard_module_weather', category_id: 'news', span: 2,
    metadata: { dashboard_module: 'weather', weather: { status: 'ready', temperature: 18, city: 'Paris', condition: 'clear', condition_label: 'Ciel dégagé' } }
};
const sourceItems = new Map(categories.map((category) => [category.id, [
    ...(category.id === 'news' ? [weather] : []),
    { id: `${category.id}-one`, category_id: category.id, title: category.id }
]]));
const tokens = mergeDashboardTokens({ metrics: { blockUnitSizePx: 120 } });

const layoutFor = (handedness = 'right', activeCategoryId = '') => createDashboardLayout({
    width: 760, height: 700, toolboxHeight: 74, categories, activeCategoryId,
    itemsByCategory: itemsForRender(categories, activeCategoryId, sourceItems), handedness, tokens
});

describe('Dashboard fixed grid and visual focus', () => {
    it('keeps every item on its canonical row when a header becomes active', () => {
        const rendered = itemsForRender(categories, 'projects', sourceItems);
        for (const category of categories) {
            expect(rendered.get(category.id).map((item) => item.category_id)).toEqual(
                sourceItems.get(category.id).map((item) => item.category_id)
            );
        }
    });

    it('uses five fixed rows, full-screen geometry, exact units and no creation rail', () => {
        const layout = layoutFor();
        expect(layout.surface_rect).toEqual({ x: 0, y: 0, width: 760, height: 700 });
        expect(layout.toolbox_reserved_rect.height).toBe(0);
        expect(layout.projection_lanes).toHaveLength(5);
        expect(layout.projection_lanes.every((lane) => lane.create_rect === undefined)).toBe(true);
        const news = layout.projection_lanes[0];
        const weatherRect = news.visible_item_rects.find((entry) => entry.item.id === weather.id).card_rect;
        expect(weatherRect.width).toBe(layout.unit_width * 2);
        expect(weatherRect.height).toBe(layout.block_unit_size);
        const standard = news.visible_item_rects.find((entry) => entry.item.id === 'news-one').card_rect;
        expect(standard.width).toBe(layout.unit_width);
        expect(standard.height).toBe(layout.block_unit_size);
    });

    it('mirrors the header and weather fixed edges exactly', () => {
        const right = layoutFor('right').projection_lanes[0];
        const left = layoutFor('left').projection_lanes[0];
        expect(right.header_rect.x).toBeGreaterThan(right.visible_item_rects[0].card_rect.x);
        expect(left.header_rect.x).toBeLessThan(left.visible_item_rects[0].card_rect.x);
        expect(right.visible_item_rects[0].card_rect.x).toBe(0);
        expect(left.visible_item_rects[0].card_rect.x + left.visible_item_rects[0].card_rect.width).toBe(760);
    });

    it('reserves one rail header per visible category and no settings slot', () => {
        const layout = layoutFor();
        expect(layout.settings).toBeUndefined();
        expect(layout.projection_lanes).toHaveLength(categories.length);
        expect(new Set(layout.projection_lanes.map((lane) => lane.header_rect.y)).size).toBe(categories.length);
        expect(layout.vertical_scroll_max).toBe(0);
        for (const lane of layout.projection_lanes) {
            const hit = hitTestDashboardLayout(layout, {
                x: lane.header_rect.x + lane.header_rect.width / 2,
                y: lane.header_rect.y + lane.header_rect.height / 2
            });
            expect(hit.kind).toBe('header');
            expect(hit.category.id).toBe(lane.category.id);
        }
    });

    it('renders only an active-header emphasis without lane/table/focus-spread records', () => {
        const records = buildDashboardRecords({ layout: layoutFor('right', 'projects'), tokens, now: new Date('2026-09-16T17:24:00Z') });
        expect(records.some((record) => /(?:lane_|table|focus_spread|create_bg|project_veil|bottom_shadow)/.test(record.id))).toBe(false);
        const active = records.find((record) => record.id === dashboardRecordId('header_bg_projects'));
        const inactive = records.find((record) => record.id === dashboardRecordId('header_bg_news'));
        expect(active.properties.material.backdrop.blurPx).toBeGreaterThan(0);
        expect(active.properties.material.backdrop.tint[3]).toBeGreaterThan(inactive.properties.material.backdrop.tint[3]);
    });

    it('caps the canonical unit so four columns remain available on a narrow surface', () => {
        const layout = createDashboardLayout({ width: 320, height: 640, categories, itemsByCategory: sourceItems, tokens });
        expect(layout.unit_width * 4 + tokens.metrics.gap * 3).toBeLessThanOrEqual(320);
    });
});
