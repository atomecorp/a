import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardBevyUiRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_runtime.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import {
    filterDashboardCategoriesByPreferences,
    normalizeDashboardPreferences
} from '../../eVe/domains/dashboard/dashboard_preferences.js';

const dashboardPreferenceCategories = Object.freeze([
    { id: 'news', label_key: 'eve.dashboard.category.news', color: '#111111', order: 10, visible: true },
    { id: 'calendar', label_key: 'eve.dashboard.category.calendar', color: '#222222', order: 20, visible: true }
]);

const withGlobals = async (values, fn) => {
    const previous = new Map(Object.keys(values).map((key) => [key, globalThis[key]]));
    Object.entries(values).forEach(([key, value]) => {
        globalThis[key] = value;
    });
    try {
        return await fn();
    } finally {
        previous.forEach((value, key) => {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        });
    }
};

test('dashboard preference normalization hides only explicitly disabled default categories', () => {
    assert.deepEqual(
        filterDashboardCategoriesByPreferences(dashboardPreferenceCategories, {}).map((category) => category.id),
        ['news', 'calendar']
    );
    assert.deepEqual(
        filterDashboardCategoriesByPreferences(dashboardPreferenceCategories, {
            categories: { news: false, unknown: false }
        }).map((category) => category.id),
        ['calendar']
    );
    assert.deepEqual(
        normalizeDashboardPreferences({ categories: { news: false, calendar: true, goals: 'off' } }),
        { categories: { news: false, calendar: true } }
    );
});

test('dashboard data controller does not hydrate hidden preference categories', async () => {
    const loaded = [];
    const state = { projectId: 'project_dashboard_preferences' };
    const data = createDashboardDataController({
        state,
        constants: { dashboard: { categories: dashboardPreferenceCategories } },
        adapters: {
            listMany: async (categoriesToLoad) => {
                loaded.push(categoriesToLoad.map((category) => category.id));
                return new Map(categoriesToLoad.map((category) => [
                    category.id,
                    [{ id: `${category.id}_1`, category_id: category.id }]
                ]));
            }
        },
        readDashboardPreferences: () => ({ categories: { news: false } })
    });

    const categories = await data.loadCategories();
    assert.deepEqual(categories.map((category) => category.id), ['calendar']);
    await data.loadVisibleItems(categories);
    assert.deepEqual(loaded, [['calendar']]);
    assert.equal(state.itemsByCategory.has('news'), false);
    assert.equal(state.itemsByCategory.has('calendar'), true);
});

test('dashboard hidden preference categories cannot be activated by tool handlers', async () => {
    await withGlobals({
        window: { __eveProfilePreferences: { dashboard: { categories: { news: false } } } }
    }, async () => {
        const runtime = createDashboardBevyUiRuntime({
            constants: { dashboard: { categories: dashboardPreferenceCategories } },
            adapters: {
                listMany: async () => new Map()
            },
            uiRuntime: {
                state: { trees: new Map() },
                mountTree: async () => ({ ok: true }),
                unmountTree: async () => ({ ok: true }),
                setTreeOpacity: async () => ({ ok: true }),
                readDiagnostics: () => ({ mounted_nodes: 1 })
            }
        });
        runtime.state.active = true;

        const result = await runtime.activateCategory('news');

        assert.equal(result.ignored, 'dashboard_category_hidden');
        assert.equal(runtime.state.activeCategoryId, '');
        assert.deepEqual(runtime.state.categories.map((category) => category.id), ['calendar']);
    });
});

test('user preferences cache publishes dashboard rubrique preferences', async () => {
    const events = new EventTarget();
    const received = [];
    await withGlobals({
        CustomEvent: class extends Event {
            constructor(type, options = {}) {
                super(type, options);
                this.detail = options.detail;
            }
        },
        HTMLElement: (() => {
            function HTMLElement() {}
            HTMLElement.prototype.animate = () => null;
            return HTMLElement;
        })(),
        window: {
            addEventListener: events.addEventListener.bind(events),
            removeEventListener: events.removeEventListener.bind(events),
            dispatchEvent: events.dispatchEvent.bind(events)
        }
    }, async () => {
        const { createUserPreferencesCacheRuntime } = await import('../../eVe/intuition/tools/user_preferences_cache_runtime.js');
        window.addEventListener('eve:profile-preferences-updated', (event) => received.push(event.detail));
        const runtime = createUserPreferencesCacheRuntime();
        runtime.updatePreferencesCache({
            visual: { handedness: 'left' },
            dashboard: { categories: { news: false } }
        });
        assert.equal(received.length, 1);
        assert.equal(received[0].preferences.dashboard.categories.news, false);
        assert.equal(window.__eveProfilePreferences.dashboard.categories.news, false);
    });
});
