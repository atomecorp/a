import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';

test('a shared generic-source failure keeps successful Dashboard categories and reports only failed sources', async () => {
    const adapters = createDashboardDataAdapters({
        stateCurrentLoader: async () => { throw new Error('restore_in_progress'); },
        projectsLoader: async () => [{ id: 'visible-project', name: 'Available' }]
    });
    const loaded = await adapters.listMany([
        { id: 'monitor', data_source: 'generic_record' }, { id: 'projects', data_source: 'projects' }
    ]);
    assert.equal(loaded.get('projects')[0].id, 'visible-project');
    assert.equal(loaded.has('monitor'), false);
    assert.equal(loaded.errors[0].categoryId, 'monitor');
});

test('Dashboard clears a recovered source error but preserves another failed category', async () => {
    const { createDashboardDataController } = await import('../../eVe/domains/dashboard/dashboard_data_controller.js');
    const state = { active: true, sceneProjectId: 'project', dataProjectId: 'project', postOpenHydrationError: '' };
    const failed = new Set(['contacts', 'projects']);
    const data = createDashboardDataController({ state, adapters: { listMany: async categories => {
        const result = new Map(categories.filter(category => !failed.has(category.id)).map(category => [category.id, []]));
        result.errors = categories.filter(category => failed.has(category.id))
            .map(category => Object.assign(new Error(`unavailable:${category.id}`), { categoryId: category.id }));
        return result;
    } } });
    const categories = [{ id: 'contacts' }, { id: 'projects' }];
    await data.loadVisibleItems(categories);
    assert.equal(state.lastLoadErrors.length, 2);
    failed.delete('projects');
    await data.loadVisibleItems(categories, { force: true, categoryIds: ['projects'] });
    assert.equal(state.postOpenHydrationError, 'unavailable:contacts');
    failed.delete('contacts');
    await data.loadVisibleItems(categories, { force: true, categoryIds: ['contacts'] });
    assert.equal(state.postOpenHydrationError, '');
    assert.deepEqual(state.lastLoadErrors, []);
});

test('persisted native replay invalidates cached empty rows and clears the Dashboard error after a canonical read', async () => {
    const { createDashboardDataController } = await import('../../eVe/domains/dashboard/dashboard_data_controller.js');
    const previousWindow = globalThis.window;
    const env = new EventTarget();
    globalThis.window = env;
    try {
        let restored = false, painted;
        const state = { active: true, dataProjectId: 'project', sceneProjectId: 'project', postOpenHydrationError: '' };
        const categories = [{ id: 'projects', order: 1, data_source: 'projects' }, { id: 'contacts', order: 2, data_source: 'contacts' }]
            .map(category => ({ ...category, color_family: 'blue', label_key: category.id, icon_id: category.id }));
        const data = createDashboardDataController({ state, constants: { dashboard: { categories } },
            renderDashboard: async () => { painted = state.itemsByCategory.get('projects'); },
            adapters: { listMany: async requested => {
                if (!restored) throw new Error('restoration_not_ready');
                const result = new Map(requested.map(category => [category.id, category.id === 'projects'
                    ? [{ id: 'restored-project', category_id: 'projects', title: 'Restored' }] : []]));
                result.errors = [];
                return result;
            } } });
        await data.loadCategories();
        await data.loadVisibleItems(state.categories);
        assert.match(state.postOpenHydrationError, /restoration_not_ready/);
        data.connectProjectChanges();
        restored = true;
        env.dispatchEvent(new CustomEvent('squirrel:sync:projection-ready', { detail: { replay: true } }));
        for (let tick = 0; tick < 30 && !painted; tick++) await Promise.resolve();
        assert.equal(painted?.[0]?.id, 'restored-project');
        assert.equal(state.postOpenHydrationError, '');
        data.disconnectProjectChanges();
        painted = undefined;
        env.dispatchEvent(new CustomEvent('squirrel:sync:projection-ready', { detail: { replay: true } }));
        await Promise.resolve();
        assert.equal(painted, undefined);
    } finally { globalThis.window = previousWindow; }
});
