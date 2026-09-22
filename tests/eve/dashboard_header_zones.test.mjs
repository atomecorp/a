import { describe, expect, it } from 'vitest';
import { createDashboardLayout, dashboardHeaderBands, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { eveT } from '../../eVe/i18n/i18n.js';

const tokens = mergeDashboardTokens({ metrics: { blockUnitSizePx: 120 } });
const categories = ['news', 'calendar', 'projects', 'contacts', 'monitor']
    .map((id, order) => ({ id, color: '#245f94', order, icon_id: id, label_key: `eve.dashboard.category.${id}` }));
const sourceItems = new Map(categories.map((category) => [category.id, [
    { id: `${category.id}-one`, category_id: category.id, title: category.id },
    { id: `${category.id}-two`, category_id: category.id, title: category.id }
]]));

const layoutFor = ({ filteredCategoryId = '', activeCategoryId = '' } = {}) => createDashboardLayout({
    width: 900,
    height: 720,
    categories,
    activeCategoryId,
    filteredCategoryId,
    itemsByCategory: itemsForRender(categories, filteredCategoryId, sourceItems),
    tokens
});

const record = (records, suffix) => records.find((entry) => entry.id === dashboardRecordId(suffix));
const laneOf = (layout, categoryId) => layout.projection_lanes.find((lane) => lane.category.id === categoryId);

describe('Dashboard rail two-tier tools', () => {
    it('splits every header into a two thirds tool band and a one third new band', () => {
        const layout = layoutFor();
        for (const lane of layout.projection_lanes) {
            const bands = dashboardHeaderBands(lane.header_rect);
            expect(lane.header_filter_rect).toEqual(bands.filter);
            expect(lane.header_new_rect).toEqual(bands.new);
            expect(lane.header_filter_rect.height).toBe(Math.round(lane.header_rect.height * (2 / 3)));
            expect(lane.header_filter_rect.height + lane.header_new_rect.height).toBe(lane.header_rect.height);
            expect(lane.header_new_rect.y).toBe(lane.header_filter_rect.y + lane.header_filter_rect.height);
            expect(lane.header_filter_rect.width).toBe(lane.header_rect.width);
            expect(lane.header_new_rect.width).toBe(lane.header_rect.width);
            expect(lane.header_filter_rect.height).toBeGreaterThan(lane.header_new_rect.height);
        }
    });

    it('hits the filter band above the separator and the new band below it', () => {
        const layout = layoutFor();
        const lane = laneOf(layout, 'projects');
        const centerX = lane.header_rect.x + lane.header_rect.width / 2;
        const top = hitTestDashboardLayout(layout, { x: centerX, y: lane.header_filter_rect.y + 2 });
        expect(top.kind).toBe('header');
        expect(top.category.id).toBe('projects');
        expect(top.zone).toBe('filter');
        const separator = hitTestDashboardLayout(layout, { x: centerX, y: lane.header_new_rect.y - 1 });
        expect(separator.zone).toBe('filter');
        const boundary = hitTestDashboardLayout(layout, { x: centerX, y: lane.header_new_rect.y });
        expect(boundary.zone).toBe('new');
        const bottom = hitTestDashboardLayout(layout, { x: centerX, y: lane.header_new_rect.y + 2 });
        expect(bottom.kind).toBe('header');
        expect(bottom.category.id).toBe('projects');
        expect(bottom.zone).toBe('new');
    });

    it('paints the separator on the split line and the internationalized new label in the lower band', () => {
        const layout = layoutFor();
        const records = buildDashboardRecords({ layout, tokens });
        const newLabelText = eveT('eve.dashboard.header.new', 'Nouveau');
        expect(newLabelText.trim().length).toBeGreaterThan(0);
        for (const lane of layout.projection_lanes) {
            const separator = record(records, `header_separator_${lane.category.id}`);
            const newLabel = record(records, `header_new_${lane.category.id}`);
            expect(separator.properties.shape).toBe('rect');
            expect(separator.properties.top + separator.properties.height).toBe(lane.header_new_rect.y);
            expect(separator.properties.width).toBe(lane.header_rect.width - tokens.metrics.gap * 2);
            expect(newLabel.properties.text).toBe(newLabelText);
            expect(newLabel.properties.text_style.align).toBe('center');
            expect(newLabel.properties.top).toBeGreaterThanOrEqual(lane.header_new_rect.y);
            expect(newLabel.properties.top + newLabel.properties.height)
                .toBeLessThanOrEqual(lane.header_new_rect.y + lane.header_new_rect.height);
        }
    });

    it('keeps both rail bands non-interactive so the header node alone carries the click', () => {
        const tree = buildDashboardBevyUiTree({ layout: layoutFor(), tokens, handlers: { activate: () => null } });
        const nodes = (node, result = []) => {
            result.push(node);
            (node.children || []).forEach((child) => nodes(child, result));
            return result;
        };
        const all = nodes(tree.root);
        const header = all.find((node) => node.id === dashboardRecordId('header_bg_projects'));
        const separator = all.find((node) => node.id === dashboardRecordId('header_separator_projects'));
        const newLabel = all.find((node) => node.id === dashboardRecordId('header_new_projects'));
        expect(typeof header.on?.activate).toBe('function');
        expect(separator.on?.activate).toBeUndefined();
        expect(newLabel.kind).toBe('text');
        expect(newLabel.on?.activate).toBeUndefined();
    });

    it('keeps the tool icon and label inside the upper band at every rail height', () => {
        const category = categories[0];
        for (let height = 6; height <= 200; height += 1) {
            const headerRect = { x: 12, y: 40, width: 120, height };
            const lane = { category, header_rect: headerRect, header_clip_rect: null, header_content_clip_rect: null };
            const laneRecords = buildDashboardRecords({
                layout: {
                    surface_rect: { x: 0, y: 0, width: 900, height: 720 },
                    lanes: [lane],
                    projection_lanes: [lane],
                    visible_item_rects: []
                },
                tokens
            });
            const bands = dashboardHeaderBands(headerRect);
            const icon = record(laneRecords, `header_icon_${category.id}`);
            const label = record(laneRecords, `header_${category.id}`);
            const separator = record(laneRecords, `header_separator_${category.id}`);
            const newLabel = record(laneRecords, `header_new_${category.id}`);
            expect(icon.properties.top).toBeGreaterThanOrEqual(bands.filter.y);
            expect(icon.properties.top + icon.properties.height).toBeLessThanOrEqual(label.properties.top);
            expect(label.properties.top).toBeGreaterThanOrEqual(bands.filter.y);
            expect(label.properties.top + label.properties.height).toBeLessThanOrEqual(bands.filter.y + bands.filter.height);
            expect(separator.properties.top + separator.properties.height).toBe(bands.new.y);
            expect(newLabel.properties.top).toBeGreaterThanOrEqual(bands.new.y);
            expect(newLabel.properties.top + newLabel.properties.height).toBeLessThanOrEqual(bands.new.y + bands.new.height);
        }
    });

    it('cascades the filtered category from its own row and empties every other row', () => {
        const filtered = itemsForRender(categories, 'projects', sourceItems);
        expect(filtered.get('projects').map((item) => item.id)).toEqual(['projects-one']);
        expect(filtered.get('contacts').map((item) => item.id)).toEqual(['projects-two']);
        for (const id of ['news', 'calendar', 'monitor']) expect(filtered.get(id)).toEqual([]);
        const layout = layoutFor({ filteredCategoryId: 'projects' });
        expect(laneOf(layout, 'projects').visible_item_rects.map((entry) => entry.item.id)).toEqual(['projects-one']);
        expect(laneOf(layout, 'monitor').visible_item_rects).toEqual([]);
    });

    it('emphasizes the filtered header and restores the base display without a filter', () => {
        const filtered = layoutFor({ filteredCategoryId: 'projects' });
        expect(laneOf(filtered, 'projects').active).toBe(true);
        expect(laneOf(filtered, 'news').active).toBe(false);
        expect(filtered.active_category.id).toBe('projects');
        const base = layoutFor();
        expect(base.lanes.every((lane) => lane.active === false)).toBe(true);
        expect(base.lanes.every((lane) => lane.visible_item_rects.length > 0)).toBe(true);
    });
});
