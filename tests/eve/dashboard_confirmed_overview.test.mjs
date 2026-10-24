import { test, expect, vi, afterEach } from 'vitest';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { buildDashboardHealthCardRecords } from '../../eVe/domains/dashboard/dashboard_health_card_records.js';
import { createTextEditingLayout } from '../../eVe/domains/rendering/text_editing_layout.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { getSessionState, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
import { readRenderSurfaceSafeAreaInsets } from '../../eVe/domains/rendering/surface_size_runtime.js';

const tokens = DASHBOARD_VISUAL_TOKENS;
const categories = ['calendar', 'news', 'contacts', 'monitor', 'projects'].map((id, order) => ({ id, order, dock: order < 2 ? 'top' : '', label_key: id, icon_id: id }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('shared safe-area measurement converts native points to the actual surface bounds', () => {
    const win = { innerWidth: 804, innerHeight: 1748, __EVE_NATIVE_VIEWPORT__: {
        width: 402, height: 874, safeAreaInsets: { top: 62, right: 0, bottom: 34, left: 0 }
    } };
    const surface = { ownerDocument: { defaultView: win }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 804, height: 1748 }) };
    expect(readRenderSurfaceSafeAreaInsets(surface)).toEqual({ top: 124, right: 0, bottom: 68, left: 0 });
    surface.getBoundingClientRect = () => ({ left: 20, top: 124, width: 764, height: 1556 });
    expect(readRenderSurfaceSafeAreaInsets(surface)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    win.__EVE_NATIVE_VIEWPORT__.safeAreaInsets.top = -1;
    expect(() => readRenderSurfaceSafeAreaInsets(surface)).toThrow('native_safe_area_viewport_invalid');
});

test('long monitor labels and details fit their actual text areas', () => {
    const records = buildDashboardHealthCardRecords({ base: 'health', box: { x: 0, y: 0, width: 120, height: 120 },
        item: { metadata: { health_monitor: { label: 'Distance marche et course', value: '2,72', unit: 'km', detail: '14:39 · historique partiel' } } }, tokens });
    for (const record of records.filter(record => /health_(label|when)_/.test(record.id))) {
        const props = record.properties;
        const text = createTextEditingLayout({ value: props.text, bounds: props, style: props.text_style });
        expect(text.measuredHeight).toBeLessThanOrEqual(props.height);
        expect(text.measuredWidth).toBeLessThanOrEqual(props.width);
    }
});

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const projectItems = id => [{ id, category_id: 'projects', title: `Name ${id}` }];

test('project names survive pending and failed refresh; recovery replaces them with an empty catalogue', async () => {
    const pending = deferred();
    const state = { active: true, openGeneration: 1, sceneProjectId: 'scene', dataProjectId: 'scene' };
    let fail = true;
    const data = createDashboardDataController({ state, adapters: { listMany: async () => {
        if (fail) { await pending.promise; throw new Error('catalogue_unavailable'); }
        return new Map([['projects', []]]);
    } } });
    data.cacheItems('projects', projectItems('known'));
    data.invalidateCache({ categoryIds: ['projects'], reset: false });
    data.resetVisibleItems(); data.seedVisibleItemsFromCache(categories);
    const task = data.loadVisibleItems(categories, { categoryIds: ['projects'], force: true });
    expect(state.itemsByCategory.get('projects')[0].title).toBe('Name known');
    pending.resolve(); await task;
    expect(state.itemsByCategory.get('projects')[0].title).toBe('Name known');
    expect(data.hasCategoryCache('projects')).toBe(false);
    expect(state.postOpenHydrationError).toMatch(/catalogue_unavailable/);
    fail = false;
    await data.loadVisibleItems(categories, { categoryIds: ['projects'], force: true });
    expect(state.itemsByCategory.get('projects')).toEqual([]);
    expect(state.postOpenHydrationError).toBe('');
});

test('obsolete project responses cannot overwrite newer reads or leak into the next account', async () => {
    const initialSession = getSessionState(), pending = deferred();
    const state = { active: true, openGeneration: 1, sceneProjectId: 'scene', dataProjectId: 'scene' };
    let calls = 0;
    const data = createDashboardDataController({ state, adapters: { listMany: async () => ++calls === 1 ? pending.promise : new Map([['projects', projectItems('new')]]) } });
    const first = data.loadVisibleItems(categories, { categoryIds: ['projects'] });
    await data.loadVisibleItems(categories, { categoryIds: ['projects'] });
    pending.resolve(new Map([['projects', projectItems('old')]])); await first;
    expect(state.itemsByCategory.get('projects')[0].id).toBe('new');
    const accountRead = deferred();
    const nextData = createDashboardDataController({ state, adapters: { listMany: async () => accountRead.promise } });
    const oldAccountRead = nextData.loadVisibleItems(categories, { force: true, categoryIds: ['projects'] });
    try {
        setSessionState({ mode: 'anonymous', user: { id: 'next-account' } }, { persist: false, silent: true });
        accountRead.resolve(new Map([['projects', projectItems('private-old')]])); await oldAccountRead;
        expect(state.itemsByCategory.size).toBe(0);
        expect(state.globalItemsCache.size).toBe(0);
    } finally { setSessionState(initialSession, { persist: false, silent: true }); }
});
