import { test, expect, vi, afterEach } from 'vitest';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';

afterEach(() => { delete globalThis.window; vi.useRealTimers(); });
const categories = ['calendar', 'news', 'contacts', 'monitor', 'projects'].map((id, order) => ({ id, order, dock: 'top', label_key: id, icon_id: id, color_family: 'blue' }));
const upcoming = count => Array.from({ length: count }, (_, index) => ({ id: `occurrence-${index}`, category_id: 'calendar', title: `Event ${index}`,
    payload: { id: `canonical-${index}`, occurrenceId: `occurrence-${index}`, start: new Date(Date.now() + (index + 1) * 86400000) } }));
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
});

test.each([0, 2, 3, 10, 15])('compact caps %i occurrences at three and calendar filter caps at ten', count => {
    const source = new Map([['calendar', upcoming(count)]]);
    expect(itemsForRender(categories, '', source).get('calendar')).toHaveLength(Math.min(3, count));
    const filtered = itemsForRender(categories, 'calendar', source);
    expect([...filtered.values()].flat()).toHaveLength(Math.min(10, count));
    expect(source.get('calendar')).toHaveLength(count);
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

test('a dashboard occurrence click opens its canonical event and passes the selected date', async () => {
    const openPanel = vi.fn(async () => ({ ok: true }));
    const item = upcoming(1)[0];
    await createDashboardActionRuntime({ openPanel }).activateItemAction({ category: { id: 'calendar' }, item });
    expect(openPanel).toHaveBeenCalledWith('calendar', { eventId: 'canonical-0', occurrenceStart: item.payload.start, source: { type: 'dashboard_calendar_item' } });
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
