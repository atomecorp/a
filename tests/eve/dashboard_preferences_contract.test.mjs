import { describe, expect, it, vi } from 'vitest';
import {
    filterDashboardCategoriesByPreferences,
    normalizeDashboardPreferences,
    normalizeDashboardWeatherLocation
} from '../../eVe/domains/dashboard/dashboard_preferences.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';

const allCategories = [
    ['calendar', 10], ['news', 20], ['contacts', 30], ['monitor', 40], ['projects', 50], ['store', 60]
].map(([id, order]) => ({
    id, order, visible: true, label_key: id, icon_id: id === 'store' ? 'store' : id,
    color_family: id === 'store' ? 'orange' : 'blue', data_source: id === 'calendar' ? 'calendar' : 'generic_record'
}));

describe('Dashboard preferences', () => {
    it('normalizes category flags without losing a valid weather location', () => {
        expect(normalizeDashboardPreferences({
            categories: { news: false, calendar: true, invalid: 'yes' },
            weather_location: { lat: '45.77', lon: 3.08, label: 'Clermont-Ferrand', source: 'geolocation' }
        })).toEqual({
            categories: { news: false, calendar: true },
            weather_location: { lat: 45.77, lon: 3.08, label: 'Clermont-Ferrand', source: 'geolocation' }
        });
    });

    it('rejects invalid or out-of-range weather locations', () => {
        expect(normalizeDashboardWeatherLocation({ lat: 91, lon: 2, label: 'Invalid' })).toBeNull();
        expect(normalizeDashboardWeatherLocation({ lat: 48, lon: 2, label: '' })).toBeNull();
        expect(normalizeDashboardWeatherLocation(null)).toBeNull();
    });

    it('retains the generic category preference helper for non-Dashboard profile editors', () => {
        expect(filterDashboardCategoriesByPreferences(allCategories, { categories: { store: false } })
            .some((category) => category.id === 'store')).toBe(false);
    });

    it('runtime data always exposes the five product rows and excludes Store only here', async () => {
        const state = { constants: { dashboard: { categories: allCategories } } };
        const requested = [];
        const data = createDashboardDataController({
            state,
            adapters: { listMany: vi.fn(async (categories) => {
                requested.push(categories.map((category) => category.id));
                return new Map(categories.map((category) => [category.id, []]));
            }) }
        });
        const categories = await data.loadCategories();
        expect(categories.map((category) => category.id)).toEqual(['calendar', 'news', 'contacts', 'monitor', 'projects']);
        await data.loadVisibleItems(categories);
        expect(requested.flat()).not.toContain('store');
    });

    it('active visual focus never redistributes category items', () => {
        const categories = allCategories.filter((category) => category.id !== 'store');
        const source = new Map(categories.map((category) => [category.id, [
            { id: `${category.id}-one`, category_id: category.id }
        ]]));
        const rendered = itemsForRender(categories, 'projects', source);
        for (const category of categories) {
            expect(rendered.get(category.id)[0].category_id).toBe(category.id);
        }
    });

    it('keeps empty rows and integral scrolling on short mobile surfaces', () => {
        const categories = allCategories.filter((category) => category.id !== 'store');
        const tokens = mergeDashboardTokens({ metrics: { blockUnitSizePx: 120 } });
        const layout = createDashboardLayout({
            width: 320, height: 260, categories, itemsByCategory: new Map(), tokens
        });
        expect(layout.projection_lanes).toHaveLength(5);
        expect(layout.projection_lanes.every((lane) => lane.visible_item_rects.length === 0)).toBe(true);
        expect(layout.vertical_scroll_max).toBeGreaterThan(0);
        expect(layout.vertical_scroll_step).toBe(layout.block_unit_size + tokens.metrics.laneGap);
    });
});
