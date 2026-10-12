import { test, expect, vi, afterEach } from 'vitest';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { buildDashboardRecords } from '../../eVe/domains/dashboard/dashboard_records.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { buildDashboardHealthCardRecords } from '../../eVe/domains/dashboard/dashboard_health_card_records.js';
import { createTextEditingLayout } from '../../eVe/domains/rendering/text_editing_layout.js';
import { createBevyUiPointerRuntime } from '../../eVe/domains/rendering/bevy_ui_pointer_runtime.js';
import { createDashboardBevyUiScrollRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_scroll_runtime.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { createDashboardPostOpenHydration } from '../../eVe/domains/dashboard/dashboard_post_open_hydration.js';
import { createDashboardVisibleHydrationScope } from '../../eVe/domains/dashboard/dashboard_open_state.js';
import { getSessionState, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
import { readRenderSurfaceSafeAreaInsets } from '../../eVe/domains/rendering/surface_size_runtime.js';
import { createDashboardEnvironmentWatcher } from '../../eVe/domains/dashboard/dashboard_environment_watcher.js';
import { createRuntimeHarness, findNode } from './bevy_ui_main_menu_test_helpers.mjs';
import { BEVY_MAIN_MENU_ATOME_ID } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';

const tokens = mergeDashboardTokens();
const categories = ['calendar', 'news', 'contacts', 'monitor', 'projects'].map((id, order) => ({ id, order, dock: order < 2 ? 'top' : '', label_key: id, icon_id: id }));
const monitors = count => Array.from({ length: count }, (_, i) => ({ id: `health_${i}`, category_id: 'monitor', metadata: { health_monitor: { label: 'Saturation en oxygène', value: '96', unit: '%', detail: '14:39 · historique partiel' } } }));
const source = count => new Map([
    ['calendar', [{ id: 'clock', category_id: 'calendar', metadata: { dashboard_module: 'clock' } }]],
    ['news', [{ id: 'weather', category_id: 'news', span: 2, metadata: { dashboard_module: 'weather' } }]],
    ['monitor', monitors(count)]
]);
const make = (count = 0, extra = {}) => createDashboardLayout({ width: 402, height: 874, categories, tokens,
    overview: true, sidebarEnabled: true, sidebarOpen: false, itemsByCategory: source(count), ...extra });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test.each([0, 1, 4, 9])('overview exposes %i selected monitors without horizontal scrolling', count => {
    const layout = make(count);
    const cells = layout.visible_item_rects.filter(entry => entry.item.metadata?.health_monitor);
    expect(cells).toHaveLength(count);
    expect(new Set(cells.map(entry => entry.rect.y)).size).toBe(Math.ceil(count / 3));
    expect(layout.projection_lanes.find(lane => lane.category.id === 'monitor').horizontal_scroll_max).toBe(0);
    for (const entry of cells) expect(hitTestDashboardLayout(layout, { x: entry.rect.x + 5, y: entry.rect.y + 5 }).item.id).toBe(entry.item.id);
    expect(layout.project_placeholders).toHaveLength(3);
    const records = buildDashboardRecords({ layout, tokens, paintWallpaper: false });
    expect(records.filter(record => record.id.startsWith('__eve_dashboard_project_placeholder_'))).toHaveLength(3);
    const tree = buildDashboardBevyUiTree({ layout, tokens, calendarStatus: 'loading', handlers: { activate: () => {} } });
    expect(tree.root.children.some(node => node.id === 'dashboard_calendar_status')).toBe(false);
    expect(tree.root.children.filter(node => node.id.includes('project_placeholder')).every(node => !node.on?.activate)).toBe(true);
});

test.each(['left', 'right'])('top cards align and content stays outside the %s rail', handedness => {
    for (const sidebarOpen of [false, true]) {
        const layout = make(9, { handedness, sidebarOpen });
        const modules = layout.visible_item_rects.filter(entry => entry.item.metadata?.dashboard_module);
        expect(modules).toHaveLength(2);
        expect(modules[0].rect.y).toBe(modules[1].rect.y);
        expect(modules[0].rect.height).toBe(modules[1].rect.height);
        for (const entry of layout.visible_item_rects) {
            expect(entry.rect.x).toBeGreaterThanOrEqual(layout.vertical_viewport_rect.x);
            expect(entry.rect.x + entry.rect.width).toBeLessThanOrEqual(layout.vertical_viewport_rect.x + layout.vertical_viewport_rect.width + 0.001);
            if (sidebarOpen) expect(layout.header_side === 'right' ? entry.rect.x + entry.rect.width <= layout.header_band_rect.x : entry.rect.x >= layout.header_band_rect.x + layout.header_band_rect.width).toBe(true);
        }
        const clock = modules.find(entry => entry.item.id === 'clock').rect;
        const weather = modules.find(entry => entry.item.id === 'weather').rect;
        expect(weather.width).toBeCloseTo(clock.width * 2);
        expect(handedness === 'right' ? weather.x + weather.width < clock.x : clock.x + clock.width < weather.x).toBe(true);
    }
});

test('real events have their own row beneath the top cards and remain actionable', () => {
    const data = source(4);
    data.get('calendar').push({ id: 'event', category_id: 'calendar', title: 'Appointment' });
    data.set('projects', [{ id: 'project', category_id: 'projects', title: 'Project' }]);
    const layout = make(4, { itemsByCategory: data });
    const event = layout.visible_item_rects.find(entry => entry.item.id === 'event');
    const clock = layout.visible_item_rects.find(entry => entry.item.id === 'clock');
    expect(event.rect.y).toBeGreaterThanOrEqual(clock.rect.y + clock.rect.height + tokens.metrics.gap);
    expect(layout.project_placeholders).toHaveLength(2);
    expect(hitTestDashboardLayout(layout, { x: event.rect.x + 5, y: event.rect.y + 5 }).item.id).toBe('event');
});

test.each(['left', 'right'])('expert top cards and controls stay inside native safe bounds for %s users', handedness => {
    for (const [width, height, safeAreaInsets] of [
        [402, 874, { top: 62, right: 0, bottom: 34, left: 0 }],
        [874, 402, { top: 0, right: 62, bottom: 21, left: 62 }]
    ]) for (const sidebarOpen of [false, true]) {
        const layout = make(9, { width, height, handedness, sidebarOpen, safeAreaInsets });
        const modules = layout.visible_item_rects.filter(entry => entry.item.metadata?.dashboard_module);
        expect(modules).toHaveLength(2);
        expect(modules[0].rect.y).toBe(modules[1].rect.y);
        expect(modules[0].rect.height).toBe(modules[1].rect.height);
        for (const entry of modules) {
            expect(entry.rect.y).toBeGreaterThanOrEqual(safeAreaInsets.top + tokens.metrics.margin);
            expect(entry.rect.x).toBeGreaterThanOrEqual(safeAreaInsets.left + tokens.metrics.margin);
            expect(entry.rect.x + entry.rect.width).toBeLessThanOrEqual(width - safeAreaInsets.right - tokens.metrics.margin);
            expect(hitTestDashboardLayout(layout, { x: entry.rect.x + 5, y: entry.rect.y + 5 }).item.id).toBe(entry.item.id);
        }
        expect(layout.sidebar_toggle_rect.y + layout.sidebar_toggle_rect.height).toBeLessThanOrEqual(height - safeAreaInsets.bottom - tokens.metrics.margin);
        expect(layout.surface_rect).toEqual({ x: 0, y: 0, width, height });
    }
});

test('native safe-area margins leave default and embedded layouts unchanged', () => {
    const options = { overview: false };
    expect(make(4, { ...options, safeAreaInsets: { top: 62, right: 10, bottom: 34, left: 10 } })).toEqual(make(4, options));
});

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

test('native inset updates reflow a mounted Dashboard even when surface dimensions stay unchanged', () => {
    const win = new EventTarget(), frames = [];
    Object.assign(win, { innerWidth: 402, innerHeight: 874, __EVE_NATIVE_VIEWPORT__: {
        width: 402, height: 874, safeAreaInsets: { top: 62, right: 0, bottom: 34, left: 0 }
    }, requestAnimationFrame: callback => { frames.push(callback); return frames.length; } });
    vi.stubGlobal('window', win);
    const surface = { ownerDocument: { defaultView: win }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 402, height: 874 }) };
    const onChange = vi.fn();
    const watcher = createDashboardEnvironmentWatcher({ onChange, readSurface: () => surface });
    watcher.start();
    expect(watcher.readSnapshot().safeAreaInsets.top).toBe(62);
    win.__EVE_NATIVE_VIEWPORT__.safeAreaInsets.top = 70;
    win.dispatchEvent(new Event('eve:native-viewport-resize'));
    frames.shift()();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(watcher.readSnapshot().safeAreaInsets.top).toBe(70);
    watcher.stop();
    win.dispatchEvent(new Event('eve:native-viewport-resize'));
    expect(frames).toHaveLength(0);
});

test.each([[320, 480], [402, 500], [874, 402]])('short %ix%i content scrolls vertically and keeps the footer fixed', (width, height) => {
    const top = make(9, { width, height });
    expect(top.vertical_scroll_max).toBeGreaterThan(0);
    const bottom = make(9, { width, height, verticalScrollOffset: top.vertical_scroll_max });
    expect(bottom.sidebar_toggle_rect).toEqual(top.sidebar_toggle_rect);
    expect(bottom.project_placeholders.some(slot => slot.visible_rect)).toBe(true);
    expect(bottom.project_placeholders.every(slot => slot.rect.y + slot.rect.height <= bottom.sidebar_toggle_rect.y)).toBe(true);
    const ids = new Set();
    for (let offset = 0; offset <= top.vertical_scroll_max + top.vertical_scroll_step; offset += top.vertical_scroll_step) {
        make(9, { width, height, verticalScrollOffset: offset }).visible_item_rects.filter(entry => entry.item.metadata?.health_monitor).forEach(entry => ids.add(entry.item.id));
    }
    expect(ids.size).toBe(9);
    const state = { active: true, layout: top, tokens, scrollByLane: {}, verticalScrollOffset: 0, scrollSnapTimers: new Map() };
    const runtime = createDashboardBevyUiScrollRuntime({ state, render: () => {}, readItemsForRender: () => source(9) });
    runtime.pressNode('__eve_dashboard_surface_base', { x: 100, y: 200 });
    runtime.dragNode('__eve_dashboard_surface_base', { x: 100, y: 100 });
    expect(state.verticalScrollOffset).toBe(100);
    runtime.cancel();
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

test.each(['right', 'left'])('professional %s Dashboard projects its separate band disclosure', async handedness => {
    const layout = make(0, { handedness });
    const activate = vi.fn(), reveal = vi.fn();
    const tree = buildDashboardBevyUiTree({ layout, tokens, handlers: { sidebarActivate: activate, sidebarReveal: reveal } });
    const toggle = projectBevyUiTreeRecords({ tree, treeId: tree.id, workspaceLayer: 'dashboard' }).find(record => record.id.endsWith('__eve_dashboard_sidebar_toggle'));
    expect(toggle).toBeDefined();
    expect(toggle.properties.left).toBe(layout.sidebar_toggle_rect.x);
    expect(toggle.properties.width).toBe(layout.sidebar_toggle_rect.width);
    const control = findNode(tree.root, '__eve_dashboard_sidebar_toggle');
    expect(findNode(control, '__eve_dashboard_sidebar_toggle_disclosure_triangle').image.source).toContain('disclosure.svg');
    expect(control.on.palette_slide_open.paletteSlideDirection).toBe('up');
    await control.on.activate();
    await control.on.palette_slide_open();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID)).toBeNull();
    const legacy = buildDashboardBevyUiTree({ layout: make(0, { overview: false }), tokens });
    expect(legacy.root.children.some(node => node.id === '__eve_dashboard_sidebar_toggle')).toBe(true);
});

test.each(['tap', 'up', 'left', 'down', 'cancel'])('shared Atom pointer route handles %s exactly once', async gesture => {
    const reveal = vi.fn(), activate = vi.fn();
    const h = createRuntimeHarness({ professional: true, onAtomShortPress: activate, onAtomSlide: reveal });
    h.surface.setProbeRect({ width: 402, height: 874 });
    await h.runtime.showAtomOnly();
    const tree = h.calls.at(-1).payload.tree;
    const toggle = findNode(tree.root, BEVY_MAIN_MENU_ATOME_ID);
    const box = tree.itemBoxes.find(box => box.item.id === BEVY_MAIN_MENU_ATOME_ID);
    const target = { treeId: tree.id, nodeId: toggle.id, kind: 'button', box: { x: box.x + box.iconOffsetX, y: box.y, width: tree.layout.itemSize, height: tree.layout.itemSize } };
    const handlers = new Map(Object.entries(toggle.on).map(([key, handler]) => [`${tree.id}:${toggle.id}:${key}`, handler]));
    const state = { handlers, lastSurfacePoints: new Map() };
    const canvas = {};
    const runtime = createBevyUiPointerRuntime({ state, hitTestTrees: (_canvas, p) => p.y >= target.box.y ? target : null,
        localEventForTarget: (target, event) => ({ target, event }),
        emitUiEvents: events => events.forEach(e => handlers.get(`${e.target.treeId}:${e.target.nodeId}:${e.event}`)?.(e)),
        scrollRuntime: { begin() {}, drag: () => false, end: () => false, hover() {} }, schedule: () => 0, now: () => 1 });
    const start = { x: target.box.x + 30, y: target.box.y + 20 };
    const end = { x: start.x + (gesture === 'left' ? -60 : 0), y: start.y + (gesture === 'up' ? -80 : gesture === 'down' ? 80 : 0) };
    const route = (phase, point) => runtime.routePointerEvent({ canvas, phase, point, event: { pointerType: 'touch' } });
    route('pointerdown', start);
    if (gesture !== 'tap' && gesture !== 'cancel') { route('pointermove', end); route('pointermove', end); }
    if (gesture === 'up') expect(reveal).toHaveBeenCalledTimes(1);
    route(gesture === 'cancel' ? 'pointercancel' : 'pointerup', end);
    try {
        expect(reveal).toHaveBeenCalledTimes(gesture === 'up' ? 1 : 0);
        expect(activate).toHaveBeenCalledTimes(gesture === 'tap' ? 1 : 0);
    } finally { h.runtime.destroy(); h.restore(); h.dom.window.close(); }
});

test('embedded/default layout retains the existing single-row contract', () => {
    const layout = make(4, { overview: false });
    expect(layout.overview).toBeUndefined();
    expect(layout.project_placeholders).toBeUndefined();
    const monitors = layout.projection_lanes.find(lane => lane.category.id === 'monitor');
    expect(monitors.horizontal_scroll_max).toBeGreaterThan(0);
});

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const projectItems = id => [{ id, category_id: 'projects', title: `Name ${id}` }];

test('offscreen projects are read immediately and paint names before blocked previews and contacts', async () => {
    const contacts = deferred(), preview = deferred();
    const state = { active: true, openGeneration: 1, sceneProjectId: 'scene', dataProjectId: 'scene', categories,
        layout: { lanes: [{ category: categories[0] }] } };
    const data = createDashboardDataController({ state, adapters: { listMany: async (requested, options) => {
        const id = requested[0].id;
        if (id === 'contacts') await contacts.promise;
        if (options.hydratePreviews) await preview.promise;
        return new Map([[id, id === 'projects' ? projectItems('first') : []]]);
    } } });
    expect(createDashboardVisibleHydrationScope({ state, data })()).toContain('projects');
    const painted = [];
    const hydrate = createDashboardPostOpenHydration({ state, data, render: async () => painted.push(state.itemsByCategory.get('projects')?.[0]?.title),
        visibleUncachedCategoryIds: () => ['projects', 'contacts'] });
    const task = hydrate({ categories, projectId: 'scene', refreshCurrentProjectPreview: true });
    await vi.waitFor(() => expect(painted).toContain('Name first'));
    expect(state.itemsByCategory.has('contacts')).toBe(false);
    preview.resolve(); contacts.resolve(); await task;
});

test('refresh rereads a cached catalogue while retaining known names until the new response', async () => {
    const pending = deferred();
    let reads = 0;
    const state = { active: true, openGeneration: 1, sceneProjectId: 'scene', dataProjectId: 'scene', categories };
    const data = createDashboardDataController({ state, adapters: { listMany: async () => {
        reads += 1;
        return new Map([['projects', reads === 1 ? projectItems('old') : await pending.promise]]);
    } } });
    await data.loadVisibleItems(categories, { categoryIds: ['projects'], hydratePreviews: false });
    const hydrate = createDashboardPostOpenHydration({ state, data, render: async () => {}, visibleUncachedCategoryIds: () => [] });
    const task = hydrate({ categories, projectId: 'scene', refresh: true });
    await vi.waitFor(() => expect(reads).toBe(2));
    expect(state.itemsByCategory.get('projects')[0].title).toBe('Name old');
    pending.resolve(projectItems('new'));
    await task;
    expect(state.itemsByCategory.get('projects')[0].title).toBe('Name new');
});

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
