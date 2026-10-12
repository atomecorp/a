import { test, expect, vi, afterEach } from 'vitest';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { createDashboardPostOpenHydration } from '../../eVe/domains/dashboard/dashboard_post_open_hydration.js';
import { createDashboardVisibleHydrationScope } from '../../eVe/domains/dashboard/dashboard_open_state.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';
import { createDashboardWorkspaceLifecycle } from '../../eVe/domains/dashboard/dashboard_lifecycle_runtime.js';

afterEach(() => { delete globalThis.window; vi.useRealTimers(); });
const categories = ['calendar', 'news', 'contacts', 'monitor', 'projects'].map((id, order) => ({ id, order, dock: 'top', label_key: id, icon_id: id, color_family: 'blue' }));
const upcoming = count => Array.from({ length: count }, (_, index) => ({ id: `occurrence-${index}`, category_id: 'calendar', title: `Event ${index}`,
    payload: { id: `canonical-${index}`, occurrenceId: `occurrence-${index}`, start: new Date(Date.now() + (index + 1) * 86400000) } }));
const tokens = mergeDashboardTokens();
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('Dashboard requests ten upcoming occurrences without a data project and retains occurrence versus canonical identity', async () => {
    const next = vi.fn(async () => ({ ok: true, items: [
        { id: 'series', occurrenceId: 'series-a', start: new Date(Date.now() + 10000) },
        { id: 'series', occurrenceId: 'series-b', start: new Date(Date.now() + 20000) }
    ] }));
    const adapters = createDashboardDataAdapters({ calendarApiLoader: async () => ({ next }) });
    const result = await adapters.list({ id: 'calendar', data_source: 'calendar' }, { projectId: '__eve_dashboard_workspace__' });
    expect(next.mock.calls[0][0]).toMatchObject({ limit: 10, projectId: null });
    expect(result.map(item => item.id)).toEqual(['series-a', 'series-b']);
    expect(result.every(item => item.payload.id === 'series')).toBe(true);
    const state = { categories, layout: { lanes: categories.map(category => ({ category })) }, dataProjectId: '' };
    expect(createDashboardVisibleHydrationScope({ state, data: { hasCategoryCache: () => false } })()).toContain('calendar');
});

test.each([0, 2, 3, 10, 15])('compact caps %i occurrences at three and calendar filter caps at ten', count => {
    const source = new Map([['calendar', upcoming(count)]]);
    expect(itemsForRender(categories, '', source).get('calendar')).toHaveLength(Math.min(3, count));
    const filtered = itemsForRender(categories, 'calendar', source);
    expect([...filtered.values()].flat()).toHaveLength(Math.min(10, count));
    expect(source.get('calendar')).toHaveLength(count);
});

test.each(['right', 'left'])('nearest occurrence sits opposite the rail and clock sits next to it for %s handedness', handedness => {
    const clock = { id: 'clock', category_id: 'calendar', metadata: { dashboard_module: 'clock' } };
    const layout = createDashboardLayout({ width: 900, height: 720, categories, tokens, handedness,
        itemsByCategory: new Map([['calendar', [clock, ...upcoming(3)]]]) });
    const lane = layout.lanes.find(entry => entry.category.id === 'calendar');
    const first = lane.visible_item_rects.find(entry => entry.item.id === 'occurrence-0');
    const clockRect = lane.visible_item_rects.find(entry => entry.item.id === 'clock').card_rect;
    expect(handedness === 'right' ? first.card_rect.x : first.card_rect.x + first.card_rect.width)
        .toBe(handedness === 'right' ? layout.table_rect.x : layout.table_rect.x + layout.table_rect.width);
    expect(Math.abs((handedness === 'right' ? clockRect.x + clockRect.width - lane.header_rect.x : clockRect.x - lane.header_rect.x - lane.header_rect.width)))
        .toBe(tokens.metrics.gap);
    const hit = hitTestDashboardLayout(layout, { x: first.card_rect.x + 10, y: first.card_rect.y + 10 });
    expect(hit.item.id).toBe('occurrence-0');
});

test('calendar hydration paints before blocked projects and contacts, and all independent reads survive', async () => {
    const blocked = deferred(); const state = { active: true, sceneProjectId: 'scene', dataProjectId: 'project', openGeneration: 1 };
    const data = createDashboardDataController({ state, adapters: { listMany: async requested => {
        const id = requested[0].id;
        if (id !== 'calendar') await blocked.promise;
        return new Map([[id, id === 'calendar' ? upcoming(3) : [{ id: 'project', category_id: id }]]]);
    } } });
    let calendarPainted = false;
    const hydrate = createDashboardPostOpenHydration({ state, data,
        render: async () => { calendarPainted ||= state.itemsByCategory.get('calendar')?.length === 3; },
        visibleUncachedCategoryIds: () => ['calendar', 'projects', 'contacts'] });
    const task = hydrate({ categories, projectId: 'scene', refresh: false });
    await vi.waitFor(() => expect(calendarPainted).toBe(true));
    expect(state.itemsByCategory.has('projects')).toBe(false);
    blocked.resolve(); await task;
    expect(state.itemsByCategory.get('projects')).toHaveLength(1);
    expect(state.itemsByCategory.get('contacts')).toHaveLength(1);
});

test('a superseded read cannot replace a newer Calendar result', async () => {
    const slow = deferred(); let reads = 0;
    const state = { active: true, sceneProjectId: 'project', dataProjectId: 'project', openGeneration: 1 };
    const data = createDashboardDataController({ state, adapters: { listMany: async () => ++reads === 1 ? slow.promise : new Map([['calendar', upcoming(2)]]) } });
    const first = data.loadVisibleItems(categories, { categoryIds: ['calendar'] });
    await data.loadVisibleItems(categories, { categoryIds: ['calendar'] });
    slow.resolve(new Map([['calendar', upcoming(1)]])); await first;
    expect(state.itemsByCategory.get('calendar')).toHaveLength(2);
});

test.each(['loading', 'ready', 'error'])('empty Calendar shows its canonical %s state', calendarStatus => {
    const layout = createDashboardLayout({ width: 900, height: 720, categories, tokens });
    const tree = buildDashboardBevyUiTree({ layout, tokens, calendarStatus });
    const status = tree.root.children.find(node => node.id === 'dashboard_calendar_status');
    expect(status.kind).toBe('empty_state');
    expect(status.children[1].text).toMatch(calendarStatus === 'ready' ? /upcoming|venir/ : calendarStatus === 'loading' ? /Loading|Chargement/ : /Unable|Impossible/);
});

test('a dashboard occurrence click opens its canonical event and passes the selected date', async () => {
    const openPanel = vi.fn(async () => ({ ok: true }));
    const item = upcoming(1)[0];
    await createDashboardActionRuntime({ openPanel }).activateItemAction({ category: { id: 'calendar' }, item });
    expect(openPanel).toHaveBeenCalledWith('calendar', { eventId: 'canonical-0', occurrenceStart: item.payload.start, source: { type: 'dashboard_calendar_item' } });
});

test('the existing clock timer expires an event, repaints, refills, and is released on close', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T12:00:01Z'));
    globalThis.window = { setTimeout, clearTimeout };
    const state = { active: true, itemsByCategory: new Map([['calendar', [{ payload: { start: new Date(Date.now() + 1000) } }]]]),
        environmentWatcher: { stop() {} }, hydrationSerial: 0 };
    const refresh = vi.fn(async () => state.itemsByCategory.set('calendar', []));
    const lifecycle = createDashboardWorkspaceLifecycle({ state, embedded: {}, data: { refreshCalendarProject: refresh,
        disconnectDirectoryChanges() {}, disconnectCalendarChanges() {}, disconnectProjectChanges() {} },
        uiRuntime: { cancelTreeRender() {}, setTreeSuspended: async () => ({ ok: true }) },
        readSurface: () => null, render: vi.fn(async () => {}), presentation: { cancel() {} },
        creation: { reset() {} }, scroll: { cancel() {} }, headerHold: { cancel() {} }, label: { cancel: async () => {} },
        newsModules: { stop() {} }, healthModules: { stop() {} } });
    lifecycle.scheduleClock(); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(refresh).toHaveBeenCalledTimes(1); expect(state.hydrationSerial).toBe(1); expect(vi.getTimerCount()).toBe(1);
    await lifecycle.close(); expect(vi.getTimerCount()).toBe(0);
});

test('personal mutations, imports and persisted remote updates refresh without a project and release listeners', async () => {
    const win = new EventTarget(); globalThis.window = win;
    const state = { active: true, sceneProjectId: '__eve_dashboard_workspace__', dataProjectId: '', openGeneration: 1 };
    let listener; const reads = vi.fn(async () => new Map([['calendar', upcoming(1)]]));
    const data = createDashboardDataController({ state, constants: { dashboard: { categories } }, adapters: { listMany: reads },
        calendarApiLoader: async () => ({ on: handler => { listener = handler; return () => { listener = null; }; } }), renderDashboard: async () => {} });
    await data.loadCategories(); await data.connectCalendarChanges(); data.connectDirectoryChanges();
    await listener('create', { id: 'personal', projectId: null }); expect(reads).toHaveBeenCalledTimes(1);
    for (const name of ['squirrel:import-updated', 'squirrel:atome-updated']) {
        win.dispatchEvent(new CustomEvent(name, { detail: name.includes('import') ? { domain: 'calendar_event' } : { atome_type: 'calendar_event', atome_id: 'remote' } }));
        await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(name.includes('import') ? 2 : 3));
    }
    data.disconnectDirectoryChanges(); data.disconnectCalendarChanges();
    win.dispatchEvent(new CustomEvent('squirrel:atome-updated', { detail: { atome_type: 'calendar_event' } }));
    await Promise.resolve(); expect(reads).toHaveBeenCalledTimes(3); expect(listener).toBeNull();
});
