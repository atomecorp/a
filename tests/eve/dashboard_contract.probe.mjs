import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBootstrapDefsB } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js';
import { EVE_EN_CORE_MESSAGES } from '../../eVe/i18n/languages_en_core.js';
import { EVE_FR_CORE_MESSAGES } from '../../eVe/i18n/languages_fr_core.js';
import { EVE_SEMANTIC_COLOR_FAMILIES } from '../../eVe/elements/skin/index.js';
import { readDashboardDefaults } from '../../eVe/domains/dashboard/dashboard_defaults.js';
import { normalizeDashboardCategories } from '../../eVe/domains/dashboard/dashboard_model.js';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import { CORE_ATOME_TYPE_IDS, listCoreAtomeTypeDefinitions } from '../../atome/src/shared/core_atome_types.js';

const buildDefaultToolDef = ({ tool_id, tool_key, label, visibility = 'visible' }) => ({
    id: tool_id,
    tool_key,
    ui: { label_key: `eve.tool.${tool_key}.label`, label_fallback: label },
    visibility
});
const buildRegisteredToggleToolDef = buildDefaultToolDef;

test('dashboard defaults declare the required categories from JSON', async () => {
    const raw = await readFile(new URL('../../eVe/default_values/constants.json', import.meta.url), 'utf8');
    const rawConstants = JSON.parse(raw);
    const defaults = readDashboardDefaults(rawConstants);
    const categories = normalizeDashboardCategories(defaults.categories);
    assert.deepEqual(categories.map((category) => category.id), [
        'calendar',
        'news',
        'contacts',
        'monitor',
        'projects'
    ]);
    assert.deepEqual(Object.fromEntries(categories.map((category) => [category.id, category.color])), {
        news: '#9f2f2f',
        calendar: '#245f94',
        projects: '#357245',
        contacts: '#673071',
        monitor: '#2f6f78'
    });
    assert.deepEqual(Object.fromEntries(rawConstants.dashboard.categories.map((category) => [category.id, category.color_family])), {
        news: 'red',
        calendar: 'blue',
        projects: 'green',
        contacts: 'violet',
        monitor: 'cyan'
    });
    categories.forEach((category) => {
        const rawCategory = rawConstants.dashboard.categories.find((entry) => entry.id === category.id);
        assert.equal(category.color, EVE_SEMANTIC_COLOR_FAMILIES[rawCategory.color_family].surface);
        assert.equal(Object.prototype.hasOwnProperty.call(rawCategory, 'color'), false);
    });
    assert.throws(
        () => readDashboardDefaults({ dashboard: { categories: [{ id: 'invalid', color_family: 'missing' }] } }),
        /dashboard_category_color_family_unknown:invalid:missing/
    );
});

test('dashboard category and tool labels exist in both locales', async () => {
    const raw = await readFile(new URL('../../eVe/default_values/constants.json', import.meta.url), 'utf8');
    const categories = normalizeDashboardCategories(readDashboardDefaults(JSON.parse(raw)).categories);
    const keys = categories.map((category) => category.label_key).concat([
        'eve.dashboard.editor.generic.title',
        'eve.tool.dashboard_news.label',
        'eve.tool.dashboard_monitor.label',
        'eve.tool.dashboard_goals.label',
        'eve.tool.dashboard_store.label'
    ]);
    for (const key of keys) {
        assert.equal(typeof EVE_EN_CORE_MESSAGES[key], 'string', `missing en key ${key}`);
        assert.equal(typeof EVE_FR_CORE_MESSAGES[key], 'string', `missing fr key ${key}`);
    }
});

test('dashboard News Monitor Goals and Store tools are registered in bootstrap defs', () => {
    const defs = buildBootstrapDefsB(
        buildDefaultToolDef,
        buildRegisteredToggleToolDef,
        'calendar_mode',
        'registered_mode'
    );
    const ids = new Set(defs.map((def) => def.id));
    assert.ok(ids.has('tool.dashboard.news'));
    assert.ok(ids.has('tool.dashboard.monitor'));
    assert.ok(ids.has('tool.dashboard.goals'));
    assert.ok(ids.has('tool.dashboard.store'));
});

test('main home tool stays on the user panel and the Atom handle owns dashboard toggling', async () => {
    const previousWindow = globalThis.window;
    const previousAdole = globalThis.AdoleAPI;
    try {
        delete globalThis.window;
        delete globalThis.AdoleAPI;

        const source = await readFile(new URL('../../eVe/intuition/tools/core/tool_runtime.js', import.meta.url), 'utf8');
        assert.match(source, /'tool\.main\.home': \{ kind: 'panel', panel_tool_id: 'ui\.home\.panel' \}/);
        assert.match(source, /'tool\.main\.home': \(payload = \{\}\) => executeBootstrapMainToolHandler\(payload, MAIN_TOOL_RUNTIME_CONFIG_BY_TOOL_ID\['tool\.main\.home'\]\)/);
        assert.doesNotMatch(source, /dashboard_home/);
        const mainMenuRuntimeSource = await readFile(new URL('../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js', import.meta.url), 'utf8');
        assert.match(mainMenuRuntimeSource, /item\.id === BEVY_MAIN_MENU_ATOME_ID/);
        assert.match(mainMenuRuntimeSource, /toggleDashboard\?\.\(\{ source: 'bevy_ui_main_menu_atome' \}\)/);
        const intuitionSource = await readFile(new URL('../../eVe/intuition/eVeIntuition.js', import.meta.url), 'utf8');
        assert.match(intuitionSource, /toggleDashboardRuntime/);
        assert.match(intuitionSource, /trigger === 'tap' && isWorkspaceActiveForMainMenu\(\)/);
        assert.doesNotMatch(intuitionSource, /triggerMainToolInteraction\('home', 'touch'/);
        const menuContentSource = await readFile(new URL('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js', import.meta.url), 'utf8');
        assert.match(menuContentSource, /home: \{[^\n]+active: openCanonicalHomePanel, inactive: closeCanonicalHomePanel/);
        assert.doesNotMatch(menuContentSource, /openDashboardRuntime|closeDashboardRuntime/);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousAdole === undefined) delete globalThis.AdoleAPI;
        else globalThis.AdoleAPI = previousAdole;
    }
});

test('dashboard generic domains use the open record Atome type', () => {
    assert.ok(CORE_ATOME_TYPE_IDS.includes('record'));
    const recordType = listCoreAtomeTypeDefinitions().find((definition) => definition.type === 'record');
    assert.equal(recordType.kind, 'data_model');
    assert.equal(recordType.schema.category_id.type, 'string');
    assert.equal(recordType.schema.source_domain.type, 'string');
    assert.equal(recordType.schema.created_iso.type, 'string');
    assert.equal(recordType.schema.updated_iso.type, 'string');
});

test('dashboard generic adapters read records from canonical state_current properties', async () => {
    const adapters = createDashboardDataAdapters({
        stateCurrentLoader: async () => [
            {
                atome_id: 'record_news_1',
                properties: {
                    source_domain: 'eve.dashboard',
                    category_id: 'news',
                    title_key: 'eve.dashboard.item.new.news',
                    preview: 'Breaking',
                    created_iso: '2026-06-21T10:00:00.000Z',
                    updated_iso: '2026-06-21T10:01:00.000Z'
                }
            },
            {
                atome_id: 'record_other_1',
                properties: {
                    source_domain: 'eve.dashboard',
                    category_id: 'monitor'
                }
            }
        ]
    });
    const items = await adapters.list({ id: 'news', data_source: 'generic_record' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'record_news_1');
    assert.equal(items[0].category_id, 'news');
    assert.equal(items[0].title_key, 'eve.dashboard.item.new.news');
    assert.equal(items[0].created_at, '2026-06-21T10:00:00.000Z');
    assert.equal(items[0].updated_at, '2026-06-21T10:01:00.000Z');
});

test('dashboard generic adapters batch state_current reads across categories', async () => {
    let reads = 0;
    const adapters = createDashboardDataAdapters({
        stateCurrentLoader: async () => {
            reads += 1;
            return [
                { atome_id: 'record_news_1', properties: { source_domain: 'eve.dashboard', category_id: 'news' } },
                { atome_id: 'record_monitor_1', properties: { source_domain: 'eve.dashboard', category_id: 'monitor' } }
            ];
        }
    });
    const items = await adapters.listMany([
        { id: 'news', data_source: 'generic_record' },
        { id: 'monitor', data_source: 'generic_record' }
    ]);

    assert.equal(reads, 1);
    assert.equal(items.get('news')?.[0]?.id, 'record_news_1');
    assert.equal(items.get('monitor')?.[0]?.id, 'record_monitor_1');
});

test('dashboard calendar adapter reads CalendarAPI item lists explicitly', async () => {
    const adapters = createDashboardDataAdapters({
        calendarApiLoader: async () => ({
            next: async () => ({
                ok: true,
                items: [{
                    id: 'calendar_1',
                    title: 'Calendar item',
                    location: 'Studio',
                    start: '2026-06-21T10:00:00.000Z',
                    createdAt: '2026-06-21T10:00:00.000Z'
                }]
            })
        })
    });
    const items = await adapters.list({ id: 'calendar', data_source: 'calendar' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'calendar_1');
    assert.match(items[0].title, /Calendar item/);
    assert.equal(items[0].preview, 'Studio');
});

test('dashboard calendar adapter renders only dated unique events', async () => {
    const adapters = createDashboardDataAdapters({
        calendarApiLoader: async () => ({
            next: async () => ({
                ok: true,
                items: [
                    { id: 'event_1', title: 'No date' },
                    { id: 'event_2', title: 'Deleted', start: '2026-06-21T10:00:00.000Z', deleted: true },
                    { id: 'event_3', title: 'One real event', start: '2026-06-21T11:00:00.000Z' },
                    { id: 'event_3', title: 'One real event', start: '2026-06-21T11:00:00.000Z' }
                ]
            })
        })
    });
    const items = await adapters.list({ id: 'calendar', data_source: 'calendar' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'event_3');
});

test('dashboard calendar adapter rejects invalid CalendarAPI list responses', async () => {
    const adapters = createDashboardDataAdapters({
        calendarApiLoader: async () => ({
            next: async () => ({ ok: false, error: 'calendar_unavailable' })
        })
    });
    await assert.rejects(
        () => adapters.list({ id: 'calendar', data_source: 'calendar' }),
        /calendar_unavailable/
    );
});

test('dashboard adapters reject invalid generic and contacts list responses explicitly', async () => {
    await assert.rejects(
        () => createDashboardDataAdapters({
            stateCurrentLoader: async () => ({ rows: [] })
        }).list({ id: 'news', data_source: 'generic_record' }),
        /dashboard_state_current_list_invalid/
    );
    await assert.rejects(
        () => createDashboardDataAdapters({
            contactsApiLoader: async () => ({ list: async () => ({ rows: [] }) })
        }).list({ id: 'contacts', data_source: 'contacts' }),
        /dashboard_contacts_list_invalid/
    );
    await assert.rejects(
        () => createDashboardDataAdapters().list({ id: 'unknown', data_source: 'unknown_source' }),
        /dashboard_data_source_unsupported:unknown_source/
    );
});

test('dashboard contacts adapter reads the canonical contact directory first', async () => {
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [{
            id: 'contact_1',
            name: 'Ada Lovelace',
            user_face: ''
        }]
    });
    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'contact_1');
    assert.equal(items[0].title, 'Ada Lovelace');
    assert.equal(items[0].preview, '');
});

test('dashboard data adapters are read-only', async () => {
    const adapters = createDashboardDataAdapters();
    assert.equal(Object.prototype.hasOwnProperty.call(adapters, 'create'), false);
});
