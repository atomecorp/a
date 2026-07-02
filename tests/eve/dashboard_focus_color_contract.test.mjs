import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardCategoryActivator } from '../../eVe/domains/dashboard/dashboard_category_activation.js';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords } from '../../eVe/domains/dashboard/dashboard_records.js';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';

const categories = Object.freeze([
    { id: 'news', color: '#9f2f2f', label_key: 'eve.dashboard.category.news', icon_id: 'news' },
    { id: 'contacts', color: '#673071', label_key: 'eve.dashboard.category.contacts', icon_id: 'contact' },
    { id: 'projects', color: '#357245', label_key: 'eve.dashboard.category.projects', icon_id: 'project' }
]);

const items = new Map([
    ['news', [{ id: 'news_a', category_id: 'news', title: 'News A' }]],
    ['contacts', [
        { id: 'contact_a', category_id: 'contacts', title: 'Contact A' },
        { id: 'contact_b', category_id: 'contacts', title: 'Contact B' },
        { id: 'contact_c', category_id: 'contacts', title: 'Contact C' }
    ]],
    ['projects', [{ id: 'project_a', category_id: 'projects', title: 'Project A' }]]
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const shadeHex = (hex, percent) => {
    const value = String(hex || '#000000').replace('#', '');
    const amount = Math.round(2.55 * percent);
    const red = clamp(Number.parseInt(value.slice(0, 2), 16) + amount, 0, 255);
    const green = clamp(Number.parseInt(value.slice(2, 4), 16) + amount, 0, 255);
    const blue = clamp(Number.parseInt(value.slice(4, 6), 16) + amount, 0, 255);
    return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
};

const layoutFor = (activeCategoryId = '', renderedItems = items) => createDashboardLayout({
    width: 1200,
    height: 720,
    toolboxHeight: 74,
    categories,
    activeCategoryId,
    itemsByCategory: renderedItems,
    tokens: DASHBOARD_VISUAL_TOKENS
});

const recordsById = (records) => new Map(records.map((record) => [record.id, record]));

const dashboardRecord = (records, suffix) => {
    const found = recordsById(records).get(`__eve_dashboard_${suffix}`);
    assert.ok(found, `Missing dashboard record ${suffix}`);
    return found;
};

test('dashboard overview keeps each rubrique color', () => {
    const records = buildDashboardRecords({
        layout: layoutFor(),
        tokens: DASHBOARD_VISUAL_TOKENS
    });

    assert.equal(DASHBOARD_VISUAL_TOKENS.laneShadePercent, -10);
    assert.equal(DASHBOARD_VISUAL_TOKENS.cardShadow.offsetY, 0);
    assert.equal(dashboardRecord(records, 'background').properties.color, DASHBOARD_VISUAL_TOKENS.background);
    assert.equal(dashboardRecord(records, 'table').properties.color, DASHBOARD_VISUAL_TOKENS.table);
    for (const category of categories) {
        assert.equal(dashboardRecord(records, `lane_${category.id}`).properties.color, shadeHex(category.color, DASHBOARD_VISUAL_TOKENS.laneShadePercent));
        assert.equal(dashboardRecord(records, `header_bg_${category.id}`).properties.color, category.color);
    }
    assert.equal(dashboardRecord(records, 'card_news_slot_0').properties.color, shadeHex(categories[0].color, 3));
    assert.equal(dashboardRecord(records, 'card_contacts_slot_0').properties.color, shadeHex(categories[1].color, 3));
    assert.deepEqual(dashboardRecord(records, 'card_news_slot_0').properties.material.shadow, DASHBOARD_VISUAL_TOKENS.cardShadow);
    assert.equal(dashboardRecord(records, 'card_news_slot_0').properties.material.shadow.offsetX, 0);
});

test('focused rubrique color floods chrome while lane cards derive from their headers', () => {
    const active = categories[1];
    const records = buildDashboardRecords({
        layout: layoutFor(active.id, itemsForRender(categories, active.id, items)),
        tokens: DASHBOARD_VISUAL_TOKENS
    });
    const inactiveHeader = shadeHex(active.color, -18);

    assert.equal(dashboardRecord(records, 'background').properties.color, active.color);
    assert.equal(dashboardRecord(records, 'table').properties.color, active.color);
    assert.equal(dashboardRecord(records, 'plus_strip_active').properties.color, active.color);
    for (const category of categories) {
        const headerColor = category.id === active.id ? active.color : inactiveHeader;
        assert.equal(dashboardRecord(records, `lane_${category.id}`).properties.color, shadeHex(headerColor, DASHBOARD_VISUAL_TOKENS.laneShadePercent));
        assert.equal(dashboardRecord(records, `header_bg_${category.id}`).properties.color, headerColor);
    }
    const cards = records.filter((record) => record.type === 'shape' && record.id.includes('__eve_dashboard_card_'));
    assert.ok(cards.length >= 3);
    assert.equal(cards.every((record) => {
        const laneId = String(record.id || '').match(/__eve_dashboard_card_([^_]+)_slot_/)?.[1];
        return record.properties.color === shadeHex(dashboardRecord(records, `header_bg_${laneId}`).properties.color, 3);
    }), true);
    assert.equal(cards.every((record) => record.properties.material?.shadow), true);
    assert.equal(cards.every((record) => record.properties.material.shadow.offsetY === 0), true);
    assert.equal(dashboardRecord(records, 'header_news').properties.opacity, DASHBOARD_VISUAL_TOKENS.inactiveHeaderOpacity);
    assert.equal(dashboardRecord(records, 'header_contacts').properties.opacity, 1);
});

test('dashboard detailed media uses the shared high-density Bevy texture contract', () => {
    const mediaItems = new Map([
        ...items,
        ['contacts', [
            { id: 'contact_a', category_id: 'contacts', title: 'Contact A', metadata: { user_face: 'data:image/png;base64,contact' } }
        ]],
        ['projects', [{
            id: 'project_a',
            category_id: 'projects',
            title: 'Project A',
            metadata: {
                project_preview_source: 'data:image/png;base64,project',
                project_preview_width: 900,
                project_preview_height: 540
            }
        }]]
    ]);
    const records = buildDashboardRecords({
        layout: layoutFor('', mediaItems),
        tokens: DASHBOARD_VISUAL_TOKENS
    });

    assert.equal(dashboardRecord(records, 'header_icon_projects').properties.texture_scale, 4);
    assert.equal(dashboardRecord(records, 'card_media_projects_slot_0').properties.texture_scale, 4);
    assert.equal(dashboardRecord(records, 'card_media_projects_slot_0').properties.media_width, 900);
    assert.equal(dashboardRecord(records, 'card_media_projects_slot_0').properties.media_height, 540);
    assert.equal(dashboardRecord(records, 'card_media_contacts_slot_0').properties.texture_scale, 4);
});

test('clicking the focused rubrique again restores overview state', async () => {
    const state = {
        active: true,
        activeCategoryId: 'contacts',
        editor: null,
        hydrationSerial: 0,
        categories: [...categories],
        itemsByCategory: new Map()
    };
    let renderCount = 0;
    const data = {
        seedVisibleItemsFromCache: () => {},
        hydrateVisibleItems: async () => {}
    };
    const activator = createDashboardCategoryActivator({
        state,
        data,
        loadCategories: async () => categories,
        render: () => {
            renderCount += 1;
            return { ok: true };
        }
    });

    const result = await activator.activateCategory('contacts');
    assert.deepEqual(result, { ok: true });
    assert.equal(state.activeCategoryId, '');
    assert.equal(renderCount, 1);
});
