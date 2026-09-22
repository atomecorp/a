import { describe, expect, it, vi } from 'vitest';
import {
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
    it('keeps only a valid weather location and drops the retired category flags', () => {
        expect(normalizeDashboardPreferences({
            categories: { news: false, calendar: true, invalid: 'yes' },
            weather_location: { lat: '45.77', lon: 3.08, label: 'Clermont-Ferrand', source: 'geolocation' }
        })).toEqual({
            weather_location: { lat: 45.77, lon: 3.08, label: 'Clermont-Ferrand', source: 'geolocation' }
        });
    });

    it('rejects invalid or out-of-range weather locations', () => {
        expect(normalizeDashboardWeatherLocation({ lat: 91, lon: 2, label: 'Invalid' })).toBeNull();
        expect(normalizeDashboardWeatherLocation({ lat: 48, lon: 2, label: '' })).toBeNull();
        expect(normalizeDashboardWeatherLocation(null)).toBeNull();
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

    it('cascades a filtered category from its own row and leaves no unfiltered row populated', () => {
        const categories = allCategories.filter((category) => category.id !== 'store');
        const source = new Map(categories.map((category) => [category.id, [
            { id: `${category.id}-one`, category_id: category.id }
        ]]));
        // Trois items filtres : la cascade repart de la rangee Projects puis deborde
        // sur Calendar et News, dans l'ordre du rail.
        source.set('projects', [
            { id: 'projects-one', category_id: 'projects' },
            { id: 'projects-two', category_id: 'projects' },
            { id: 'projects-three', category_id: 'projects' }
        ]);
        const filtered = itemsForRender(categories, 'projects', source);
        expect(filtered.get('projects').map((item) => item.id)).toEqual(['projects-one']);
        expect(filtered.get('calendar').map((item) => item.id)).toEqual(['projects-two']);
        expect(filtered.get('news').map((item) => item.id)).toEqual(['projects-three']);
        for (const id of ['contacts', 'monitor']) expect(filtered.get(id)).toEqual([]);
        // Retour a l'affichage de base : chaque rangee retrouve ses propres items.
        const restored = itemsForRender(categories, '', source);
        expect(restored.get('projects')).toEqual(source.get('projects'));
        expect(restored.get('calendar')).toEqual(source.get('calendar'));
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
