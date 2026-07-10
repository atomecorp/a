import assert from 'node:assert/strict';
import { test } from 'vitest';

import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';
import { createDashboardFocusTransitionController } from '../../eVe/domains/dashboard/dashboard_focus_transition.js';
import { createDashboardBevyUiScrollRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_scroll_runtime.js';
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

    assert.equal(DASHBOARD_VISUAL_TOKENS.transitions.categoryFocusMs, 500);
    assert.equal(DASHBOARD_VISUAL_TOKENS.laneShadePercent, -10);
    assert.equal(DASHBOARD_VISUAL_TOKENS.cardShadow.offsetY, 0);
    assert.equal(dashboardRecord(records, 'background').properties.color, DASHBOARD_VISUAL_TOKENS.background);
    assert.equal(dashboardRecord(records, 'table').properties.color, DASHBOARD_VISUAL_TOKENS.table);
    for (const category of categories) {
        assert.equal(dashboardRecord(records, `lane_${category.id}`).properties.color, shadeHex(category.color, DASHBOARD_VISUAL_TOKENS.laneShadePercent));
        assert.equal(dashboardRecord(records, `header_bg_${category.id}`).properties.color, category.color);
    }
    assert.equal(dashboardRecord(records, 'card_news_news_a').properties.color, shadeHex(categories[0].color, 3));
    assert.equal(dashboardRecord(records, 'card_contacts_contact_a').properties.color, shadeHex(categories[1].color, 3));
    assert.deepEqual(dashboardRecord(records, 'card_news_news_a').properties.material.shadow, DASHBOARD_VISUAL_TOKENS.cardShadow);
    assert.equal(dashboardRecord(records, 'card_news_news_a').properties.material.shadow.offsetX, 0);
});

test('focused rubrique color floods chrome while lane cards derive from their headers', () => {
    const active = categories[1];
    const layout = layoutFor(active.id, itemsForRender(categories, active.id, items));
    const records = buildDashboardRecords({
        layout,
        tokens: DASHBOARD_VISUAL_TOKENS
    });
    const laneByCardId = new Map();
    for (const lane of layout.lanes) {
        for (const entry of lane.visible_item_rects) {
            laneByCardId.set(`__eve_dashboard_card_${entry.category.id}_${entry.item.id}`, lane.category.id);
        }
    }

    assert.equal(dashboardRecord(records, 'background').properties.color, active.color);
    assert.equal(dashboardRecord(records, 'table').properties.color, active.color);
    assert.equal(records.some((record) => String(record.id || '').includes('plus')), false);
    for (const category of categories) {
        assert.equal(dashboardRecord(records, `lane_${category.id}`).properties.color, active.color);
        assert.equal(dashboardRecord(records, `header_bg_${category.id}`).properties.color, active.color);
    }
    const cards = records.filter((record) => record.type === 'shape' && record.id.includes('__eve_dashboard_card_'));
    assert.ok(cards.length >= 3);
    assert.equal(cards.every((record) => {
        const laneId = laneByCardId.get(record.id);
        return record.properties.color === shadeHex(dashboardRecord(records, `header_bg_${laneId}`).properties.color, 3);
    }), true);
    assert.equal(cards.every((record) => record.properties.material?.shadow), true);
    assert.equal(cards.every((record) => record.properties.material.shadow.offsetY === 0), true);
    assert.equal(dashboardRecord(records, 'header_news').properties.opacity, DASHBOARD_VISUAL_TOKENS.inactiveHeaderOpacity);
    assert.equal(dashboardRecord(records, 'header_contacts').properties.opacity, 1);
});

test('focused rubrique transition expands the clicked row color through Bevy records', () => {
    const active = categories[1];
    const overviewLayout = layoutFor();
    const sourceLane = overviewLayout.lanes.find((lane) => lane.category.id === active.id);
    const focusedLayout = layoutFor(active.id, itemsForRender(categories, active.id, items));
    const transition = {
        categoryId: active.id,
        color: active.color,
        fromColor: '',
        progress: 0,
        contentSourceRect: sourceLane.lane_rect,
        headerSourceRect: sourceLane.header_rect
    };
    const startRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: transition
    });
    const startContent = dashboardRecord(startRecords, 'focus_spread_content');
    const startHeader = dashboardRecord(startRecords, 'focus_spread_header');

    assert.equal(dashboardRecord(startRecords, 'background').properties.color, DASHBOARD_VISUAL_TOKENS.background);
    assert.equal(dashboardRecord(startRecords, 'table').properties.color, DASHBOARD_VISUAL_TOKENS.table);
    assert.equal(startContent.properties.color, active.color);
    assert.equal(startContent.properties.left, sourceLane.lane_rect.x);
    assert.equal(startContent.properties.top, sourceLane.lane_rect.y);
    assert.equal(startContent.properties.width, sourceLane.lane_rect.width);
    assert.equal(startContent.properties.height, sourceLane.lane_rect.height);
    assert.equal(startHeader.properties.left, sourceLane.header_rect.x);
    assert.equal(startHeader.properties.top, sourceLane.header_rect.y);
    assert.equal(startHeader.properties.width, sourceLane.header_rect.width);
    assert.equal(startHeader.properties.height, sourceLane.header_rect.height);

    const midRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: { ...transition, progress: 0.5 }
    });
    const midContent = dashboardRecord(midRecords, 'focus_spread_content');
    const midHeader = dashboardRecord(midRecords, 'focus_spread_header');
    assert.ok(midContent.properties.top < startContent.properties.top);
    assert.ok(midContent.properties.height > startContent.properties.height);
    assert.ok(midContent.properties.height < focusedLayout.table_rect.height);
    assert.ok(midHeader.properties.top < startHeader.properties.top);
    assert.ok(midHeader.properties.height > startHeader.properties.height);
    assert.ok(midHeader.properties.height < focusedLayout.table_rect.height);
    assert.equal(recordsById(buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS
    })).has('__eve_dashboard_focus_spread_content'), false);
});

test('focused rubrique collapse retracts the active color back to its row', () => {
    const active = categories[1];
    const focusedLayout = layoutFor(active.id, itemsForRender(categories, active.id, items));
    const sourceLane = focusedLayout.lanes.find((lane) => lane.category.id === active.id);
    const collapse = {
        categoryId: active.id,
        color: active.color,
        fromColor: '',
        direction: 'collapse',
        progress: 0,
        contentSourceRect: sourceLane.lane_rect,
        headerSourceRect: sourceLane.header_rect
    };
    const startRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: collapse
    });
    const startContent = dashboardRecord(startRecords, 'focus_spread_content');
    assert.equal(dashboardRecord(startRecords, 'background').properties.color, DASHBOARD_VISUAL_TOKENS.background);
    assert.equal(startContent.properties.color, active.color);
    assert.equal(startContent.properties.top, focusedLayout.table_rect.y);
    assert.equal(startContent.properties.height, focusedLayout.table_rect.height);

    const midRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: { ...collapse, progress: 0.5 }
    });
    const midContent = dashboardRecord(midRecords, 'focus_spread_content');
    assert.ok(midContent.properties.top > startContent.properties.top);
    assert.ok(midContent.properties.height < startContent.properties.height);
    assert.ok(midContent.properties.height > sourceLane.lane_rect.height);
});

test('dashboard focus transition renders once after clearing collapse records', async () => {
    const previousWindow = globalThis.window;
    const callbacks = [];
    let now = 1;
    globalThis.window = {
        requestAnimationFrame: (callback) => {
            callbacks.push(callback);
            return callbacks.length;
        },
        cancelAnimationFrame: () => {},
        performance: { now: () => now }
    };
    try {
        const state = {
            tokens: { transitions: { categoryFocusMs: 100 } },
            focusAnimationSerial: 0,
            focusAnimationFrame: 0,
            focusTransition: null
        };
        const renderStates = [];
        const controller = createDashboardFocusTransitionController({
            state,
            render: async () => {
                renderStates.push(state.focusTransition ? 'transition' : 'cleared');
            }
        });
        const promise = controller.start({
            categoryId: 'contacts',
            color: '#673071',
            direction: 'collapse',
            sourceLane: {
                lane_rect: { x: 0, y: 100, width: 900, height: 120 },
                header_rect: { x: 900, y: 100, width: 120, height: 120 }
            }
        });
        await Promise.resolve();
        now = 120;
        callbacks.shift()();
        await promise;
        assert.equal(state.focusTransition, null);
        assert.equal(renderStates.at(-1), 'cleared');
        assert.ok(renderStates.includes('transition'));
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('switching focused rubrique fades the new source row before expanding it', () => {
    const previous = categories[1];
    const active = categories[2];
    const focusedLayout = layoutFor(active.id, itemsForRender(categories, active.id, items));
    const sourceLane = focusedLayout.lanes.find((lane) => lane.category.id === active.id);
    const transition = {
        categoryId: active.id,
        color: active.color,
        fromColor: previous.color,
        direction: 'switch',
        progress: 0,
        contentSourceRect: sourceLane.lane_rect,
        headerSourceRect: sourceLane.header_rect
    };
    const startRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: transition
    });
    const startContent = dashboardRecord(startRecords, 'focus_spread_content');
    assert.equal(dashboardRecord(startRecords, 'background').properties.color, previous.color);
    assert.equal(startContent.properties.color, active.color);
    assert.equal(startContent.properties.opacity, 0);
    assert.equal(startContent.properties.top, sourceLane.lane_rect.y);
    assert.equal(startContent.properties.height, sourceLane.lane_rect.height);

    const fadeRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: { ...transition, progress: 0.175 }
    });
    const fadeContent = dashboardRecord(fadeRecords, 'focus_spread_content');
    assert.ok(fadeContent.properties.opacity > 0);
    assert.ok(fadeContent.properties.opacity < 1);
    assert.equal(fadeContent.properties.top, sourceLane.lane_rect.y);
    assert.equal(fadeContent.properties.height, sourceLane.lane_rect.height);

    const spreadRecords = buildDashboardRecords({
        layout: focusedLayout,
        tokens: DASHBOARD_VISUAL_TOKENS,
        focusTransition: { ...transition, progress: 0.7 }
    });
    const spreadContent = dashboardRecord(spreadRecords, 'focus_spread_content');
    assert.equal(spreadContent.properties.opacity, 1);
    assert.ok(spreadContent.properties.top < sourceLane.lane_rect.y);
    assert.ok(spreadContent.properties.height > sourceLane.lane_rect.height);
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
    assert.equal(dashboardRecord(records, 'card_media_projects_project_a').properties.texture_scale, 2);
    assert.equal(dashboardRecord(records, 'card_media_projects_project_a').properties.media_width, 900);
    assert.equal(dashboardRecord(records, 'card_media_projects_project_a').properties.media_height, 540);
    const projectCard = dashboardRecord(records, 'card_projects_project_a').properties;
    const projectMedia = dashboardRecord(records, 'card_media_projects_project_a').properties;
    assert.equal(projectMedia.width / projectMedia.height, 900 / 540);
    assert.equal(projectMedia.left + projectMedia.width / 2, projectCard.left + projectCard.width / 2);
    assert.equal(projectMedia.top + projectMedia.height / 2, projectCard.top + projectCard.height / 2);
    assert.ok(projectMedia.width <= projectCard.width);
    assert.ok(projectMedia.height <= projectCard.height);
    assert.ok(dashboardRecord(records, 'card_title_projects_project_a').properties.text_style.min_font_size <= 7);
    assert.equal(dashboardRecord(records, 'card_media_contacts_contact_a').properties.texture_scale, 2);
});

test('wheel over an overflowing project lane scrolls projects horizontally', () => {
    const state = {
        active: true,
        layout: {
            vertical_scroll_max: 200,
            lanes: [{
                category: { id: 'projects' },
                horizontal_scroll_max: 160,
                lane_rect: { width: 100 }
            }]
        },
        scrollByLane: {},
        verticalScrollOffset: 0,
        scrollSnapTimers: new Map(),
        scrollAnimationFrames: new Map(),
        verticalScrollSnapTimer: 0,
        verticalScrollAnimationFrame: 0,
        wheelRenderScheduled: false,
        tokens: DASHBOARD_VISUAL_TOKENS
    };
    const runtime = createDashboardBevyUiScrollRuntime({
        state,
        render: () => null,
        readItemsForRender: () => new Map([['projects', []]])
    });

    const result = runtime.handleWheelNode('__eve_dashboard_lane_projects', { deltaY: 40 });

    assert.equal(result.axis, 'horizontal');
    assert.equal(state.scrollByLane.projects, 40);
    assert.equal(state.verticalScrollOffset, 0);
    runtime.cancel();
});
