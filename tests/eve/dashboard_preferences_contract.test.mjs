import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createDashboardBevyUiRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_runtime.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import { DASHBOARD_WORKSPACE_PROJECT_ID } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
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

test('dashboard opening does not wait for current-project preview regeneration', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'http://localhost/' });
    let releasePreview;
    const previewGate = new Promise((resolve) => { releasePreview = resolve; });
    let forcedPreviewStarted = false;
    const openCategories = Object.freeze([{
        id: 'projects',
        label_key: 'eve.dashboard.category.projects',
        color: '#357245',
        order: 10,
        visible: true
    }]);
    await withGlobals({
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        CustomEvent: dom.window.CustomEvent,
        innerWidth: 1200,
        innerHeight: 720
    }, async () => {
        const runtime = createDashboardBevyUiRuntime({
            constants: { dashboard: { categories: openCategories } },
            adapters: {
                listMany: async (categoriesToLoad, options = {}) => {
                    if (options.forceCurrentProjectPreview) {
                        forcedPreviewStarted = true;
                        await previewGate;
                    }
                    return new Map(categoriesToLoad.map((category) => [category.id, []]));
                }
            },
            tokens: { transitions: { dashboardFadeMs: 0 } },
            uiRuntime: {
                state: { trees: new Map() },
                mountTree: async () => ({ ok: true }),
                unmountTree: async () => ({ ok: true }),
                setTreeOpacity: async () => ({ ok: true }),
                readDiagnostics: () => ({ mounted_nodes: 1 })
            }
        });
        const openPromise = runtime.open({
            projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
            dataProjectId: 'current_project',
            refreshCurrentProjectPreview: true
        });
        const outcome = await Promise.race([
            openPromise.then(() => 'opened'),
            new Promise((resolve) => setTimeout(() => resolve('blocked'), 25))
        ]);
        releasePreview();
        await openPromise;

        assert.equal(outcome, 'opened');
        assert.equal(forcedPreviewStarted, true);
        await runtime.state.postOpenHydrationPromise;
        assert.equal(runtime.state.postOpenHydrationError, '');
        await runtime.close();
    });
});

test('dashboard starts current-project preview hydration before non-critical categories', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'http://localhost/' });
    let releaseNonCritical;
    const nonCriticalGate = new Promise((resolve) => { releaseNonCritical = resolve; });
    const calls = [];
    const categories = Object.freeze([
        { id: 'projects', label_key: 'eve.dashboard.category.projects', color: '#111111', order: 10, visible: true },
        { id: 'calendar', label_key: 'eve.dashboard.category.calendar', color: '#222222', order: 20, visible: true }
    ]);
    await withGlobals({
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        CustomEvent: dom.window.CustomEvent,
        innerWidth: 1200,
        innerHeight: 720
    }, async () => {
        const runtime = createDashboardBevyUiRuntime({
            constants: { dashboard: { categories } },
            adapters: {
                listMany: async (categories, options = {}) => {
                    calls.push({ ids: categories.map((category) => category.id), forced: options.forceCurrentProjectPreview === true });
                    if (categories.some((category) => category.id === 'calendar') && !options.forceCurrentProjectPreview) {
                        await nonCriticalGate;
                    }
                    return new Map(categories.map((category) => [category.id, []]));
                }
            },
            tokens: { transitions: { dashboardFadeMs: 0 } },
            uiRuntime: {
                state: { trees: new Map() },
                mountTree: async () => ({ ok: true }),
                unmountTree: async () => ({ ok: true }),
                setTreeOpacity: async () => ({ ok: true }),
                readDiagnostics: () => ({ mounted_nodes: 1 })
            }
        });

        await runtime.open({
            projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
            dataProjectId: 'current_project',
            refreshCurrentProjectPreview: true
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const forcedIndex = calls.findIndex((call) => call.forced);
        const nonCriticalIndex = calls.findIndex((call) => call.ids.includes('calendar') && !call.forced);
        releaseNonCritical();
        await runtime.state.postOpenHydrationPromise;

        assert.ok(forcedIndex >= 0);
        assert.ok(nonCriticalIndex < 0 || forcedIndex < nonCriticalIndex);
        await runtime.close();
    });
});

test('dashboard forces preview refresh from the canonical current-project API', async () => {
    const calls = [];
    await withGlobals({
        window: { AdoleAPI: { projects: { getCurrentId: () => 'project_a' } } },
        Atome: { commit: async () => ({ ok: true }) }
    }, async () => {
        const adapters = createDashboardDataAdapters({
            projectsLoader: async () => [{ id: 'project_a', name: 'Current project' }],
            projectPreviewLoader: async (input) => {
                calls.push(input);
                return { preview_url: 'data:image/png;base64,current', width: 1280, height: 720 };
            }
        });

        await adapters.list(
            { id: 'projects', data_source: 'projects' },
            { forceCurrentProjectPreview: true }
        );

        assert.equal(calls.length, 1);
        assert.equal(calls[0].projectId, 'project_a');
        assert.equal(calls[0].forceCapture, true);
    });
});

test('dashboard opening projects overlay records without duplicate BevyUI texture hydration', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'http://localhost/' });
    const resolvedTextureNodeIds = [];
    const projectedNodeKinds = [];
    let releaseTextureResolution;
    const textureResolutionGate = new Promise((resolve) => { releaseTextureResolution = resolve; });
    await withGlobals({
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        CustomEvent: dom.window.CustomEvent,
        innerWidth: 1200,
        innerHeight: 720
    }, async () => {
        const uiRuntime = createEveBevyUiRuntime({
            nativeUiEnabled: false,
            requestFrame: () => 0,
            imageResolverFactory: () => async (node) => {
                resolvedTextureNodeIds.push(node.id);
                await textureResolutionGate;
                return { width: 1, height: 1, rgba: new Uint8ClampedArray([255, 255, 255, 255]) };
            },
            overlayProjector: {
                clear: async () => null,
                project: async ({ tree }) => {
                    projectedNodeKinds.push(tree.root.children.map((node) => node.kind));
                    return ['dashboard_overlay_root'];
                }
            }
        });
        const runtime = createDashboardBevyUiRuntime({
            constants: {
                dashboard: {
                    categories: [{
                        id: 'projects',
                        label_key: 'eve.dashboard.category.projects',
                        color: '#357245',
                        data_source: 'projects',
                        order: 10,
                        visible: true
                    }]
                }
            },
            adapters: {
                listMany: async () => new Map([['projects', [{
                    id: 'media_project',
                    category_id: 'projects',
                    title: 'Media project',
                    metadata: {
                        project_preview_source: 'data:image/png;base64,preview',
                        project_preview_width: 1280,
                        project_preview_height: 800
                    }
                }]]])
            },
            tokens: { transitions: { dashboardFadeMs: 0 } },
            uiRuntime
        });

        const openPromise = runtime.open({ projectId: DASHBOARD_WORKSPACE_PROJECT_ID });
        const outcome = await Promise.race([
            openPromise.then(() => 'opened'),
            new Promise((resolve) => setTimeout(() => resolve('blocked'), 25))
        ]);

        assert.equal(outcome, 'opened');
        assert.ok(projectedNodeKinds.length > 0);
        assert.equal(projectedNodeKinds.some((kinds) => kinds.some((kind) => kind === 'image' || kind === 'text')), false);
        assert.equal(runtime.state.active, true);
        assert.ok(runtime.readDiagnostics().mounted_nodes > 0);
        releaseTextureResolution();
        await runtime.state.postOpenHydrationPromise;
        assert.ok(resolvedTextureNodeIds.length > 0);
        assert.equal(resolvedTextureNodeIds.some((id) => id.includes('card_media_projects_media_project')), false);
        await runtime.close();
    });
});

test('BevyUI mount failures stay on the returned operation without an orphan queue rejection', async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas id="surface"></canvas></body></html>');
    const runtime = createEveBevyUiRuntime({
        nativeUiEnabled: false,
        requestFrame: () => 0,
        imageResolverFactory: () => async () => {
            throw new Error('expected_bevy_ui_mount_failure');
        }
    });

    await assert.rejects(runtime.mountTree({
        id: 'failing_tree',
        surface: dom.window.document.getElementById('surface'),
        tree: {
            id: 'failing_tree',
            root: {
                id: 'root',
                kind: 'root',
                style: { size: [100, 100] },
                children: [{
                    id: 'broken_image',
                    kind: 'image',
                    image: { source: 'broken://image' },
                    style: { size: [20, 20] }
                }]
            }
        }
    }), /expected_bevy_ui_mount_failure/);
    await Promise.resolve();
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
