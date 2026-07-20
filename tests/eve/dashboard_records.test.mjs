import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { DASHBOARD_FONT_FAMILY, mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { createBevyMediaTextureCacheKey } from '../../eVe/domains/rendering/bevy_media_texture_cache.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const shadeHex = (hex, percent) => {
    const value = String(hex || '#000000').replace('#', '');
    const amount = Math.round(2.55 * percent);
    const red = clamp(Number.parseInt(value.slice(0, 2), 16) + amount, 0, 255);
    const green = clamp(Number.parseInt(value.slice(2, 4), 16) + amount, 0, 255);
    const blue = clamp(Number.parseInt(value.slice(4, 6), 16) + amount, 0, 255);
    return `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
};

const expectedDashboardLabelBackdropHeight = (height) => Math.min(
    Math.max(1, Number(height || 0)),
    Math.max(1, Math.min(42, Math.max(24, Math.round(Number(height || 0) * 0.24))))
);

test('dashboard fullscreen item renders only the selected item summary', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [{
            id: 'news',
            label_key: 'eve.dashboard.category.news',
            color: '#6aa6ff',
            visible: true
        }],
        activeCategoryId: 'news',
        itemsByCategory: new Map(),
        tokens
    });
    const records = buildDashboardRecords({
        layout,
        tokens,
        editor: {
            title: 'New news',
            preview: 'Preview text',
            item: {
                id: 'record_1',
                category_id: 'news',
                title: 'New news',
                payload: { id: 'record_1', hidden: 'not rendered' }
            }
        }
    });
    const ids = new Set(records.map((record) => record.id));
    assert.ok(ids.has(dashboardRecordId('editor')));
    assert.ok(ids.has(dashboardRecordId('editor_title')));
    assert.ok(ids.has(dashboardRecordId('editor_preview')));
    assert.equal([...ids].some((id) => id.includes('editor_field_')), false);
    assert.equal(records.some((record) => record.type === 'text' && record.properties.text === 'Preview text'), true);
    assert.equal(records.some((record) => String(record.properties?.text || '').includes('not rendered')), false);
});

test('dashboard records flood focused backgrounds without plus records', () => {
    const tokens = mergeDashboardTokens();
    const categories = [
        { id: 'news', label_key: 'eve.dashboard.category.news', color: '#111111', visible: true },
        { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#ff3366', visible: true }
    ];
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories,
        activeCategoryId: 'monitor',
        itemsByCategory: new Map([
            ['monitor', [{ id: 'm1', title: 'Monitor', category_id: 'monitor', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const headerNews = records.find((record) => record.id === dashboardRecordId('header_news'));
    const headerMonitor = records.find((record) => record.id === dashboardRecordId('header_monitor'));
    const laneNews = records.find((record) => record.id === dashboardRecordId('lane_news'));
    const laneMonitor = records.find((record) => record.id === dashboardRecordId('lane_monitor'));
    const table = records.find((record) => record.id === dashboardRecordId('table'));
    const card = records.find((record) => record.id === dashboardRecordId('card_monitor_m1'));
    assert.equal(records.some((record) => String(record.id || '').includes('plus')), false);
    assert.equal(table.properties.color, '#ff3366');
    assert.equal(laneNews.properties.color, '#ff3366');
    assert.equal(laneMonitor.properties.color, '#ff3366');
    assert.equal(records.find((record) => record.id === dashboardRecordId('header_bg_news')).properties.color, '#ff3366');
    assert.equal(records.find((record) => record.id === dashboardRecordId('header_bg_monitor')).properties.color, '#ff3366');
    assert.equal(card.properties.color, shadeHex('#ff3366', 3));
    assert.deepEqual(card.properties.material.shadow, tokens.cardShadow);
    assert.equal(card.properties.material.shadow.blur, 0);
    assert.equal(card.properties.material.shadow.offsetY, 0);
    assert.equal(records.find((record) => record.id === dashboardRecordId('card_title_monitor_m1')).properties.text_style.text_fit, 'shrink');
    assert.equal(headerNews.properties.opacity, tokens.inactiveHeaderOpacity);
    assert.equal(headerMonitor.properties.opacity, 1);
    assert.ok(card.properties.left > layout.visible_item_rects[0].rect.x);
    assert.ok(card.properties.top > layout.visible_item_rects[0].rect.y);
});

test('dashboard records use the layout card rect without applying a second inset', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true },
            { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#2f6f78', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['news', [{ id: 'n1', title: 'News', category_id: 'news', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const card = records.find((record) => record.id === dashboardRecordId('card_news_n1'));
    const visible = layout.visible_item_rects[0].card_rect;
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((key) => card.properties[key]),
        [visible.x, visible.y, visible.width, visible.height]
    );
});

test('dashboard card record ids stay stable when a category is focused', () => {
    const tokens = mergeDashboardTokens();
    const categories = [
        { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true },
        { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#2f6f78', visible: true }
    ];
    const itemsByCategory = new Map([
        ['news', [{ id: 'n1', title: 'News', category_id: 'news', span: 1 }]]
    ]);
    const overview = buildDashboardRecords({
        layout: createDashboardLayout({ width: 960, height: 640, toolboxHeight: 80, categories, activeCategoryId: '', itemsByCategory, tokens }),
        tokens
    });
    const focused = buildDashboardRecords({
        layout: createDashboardLayout({ width: 960, height: 640, toolboxHeight: 80, categories, activeCategoryId: 'news', itemsByCategory, tokens }),
        tokens
    });
    assert.ok(overview.find((record) => record.id === dashboardRecordId('card_news_n1')));
    assert.ok(focused.find((record) => record.id === dashboardRecordId('card_news_n1')));
    assert.equal(overview.some((record) => String(record.id || '').includes('_slot_')), false);
    assert.equal(focused.some((record) => String(record.id || '').includes('_slot_')), false);
});

test('dashboard visible records stay above the toolbox reserved band', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true },
            { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#2f6f78', visible: true }
        ],
        activeCategoryId: 'news',
        itemsByCategory: new Map([
            ['news', [
                { id: 'n1', title: 'News', category_id: 'news', span: 1 },
                { id: 'n2', title: 'Wide News', category_id: 'news', span: 2 }
            ]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const reservedTop = layout.toolbox_reserved_rect.y;
    const dashboardRecords = records.filter((record) => ![
        dashboardRecordId('project_veil'),
        dashboardRecordId('bottom_shadow')
    ].includes(record.id));
    assert.equal(records.some((record) => record.id === dashboardRecordId('reserved_band_fill')), false);
    assert.equal(dashboardRecords.every((record) => (
        Number(record.properties.top || 0) + Number(record.properties.height || 0) <= reservedTop
    )), true);
});

test('dashboard partial vertical scroll records stay clipped above the toolbox reserved band', () => {
    const tokens = mergeDashboardTokens();
    const categories = ['news', 'calendar', 'projects', 'contacts', 'store', 'monitor', 'goals']
        .map((id, index) => ({
            id,
            label_key: `eve.dashboard.category.${id}`,
            color: ['#9f2f2f', '#245f94', '#357245', '#673071', '#a65f1f', '#2f6f78', '#6f5b24'][index],
            visible: true
        }));
    const layout = createDashboardLayout({
        width: 1280,
        height: 820,
        toolboxHeight: 60,
        categories,
        activeCategoryId: '',
        allowPartialLanes: true,
        verticalScrollOffset: 20,
        itemsByCategory: new Map([
            ['projects', [{ id: 'p1', title: 'Project', category_id: 'projects', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const reservedTop = layout.toolbox_reserved_rect.y;
    const dashboardRecords = records.filter((record) => ![
        dashboardRecordId('project_veil'),
        dashboardRecordId('bottom_shadow')
    ].includes(record.id));
    assert.equal(layout.lanes.every((lane) => lane.lane_rect.y + lane.lane_rect.height <= reservedTop), true);
    assert.equal(dashboardRecords.every((record) => (
        Number(record.properties.top || 0) + Number(record.properties.height || 0) <= reservedTop
    )), true);
});

test('dashboard records keep category lanes independent before a header is focused', () => {
    const tokens = mergeDashboardTokens();
    const categories = [
        { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true },
        { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#2f6f78', visible: true }
    ];
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories,
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['news', [{ id: 'n1', title: 'News', category_id: 'news', span: 1 }]],
            ['monitor', [{ id: 'm1', title: 'Monitor', category_id: 'monitor', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    assert.equal(records.some((record) => String(record.id || '').includes('plus')), false);
    assert.equal(records.find((record) => record.id === dashboardRecordId('header_dim_dark_news')), undefined);
    assert.equal(records.find((record) => record.id === dashboardRecordId('lane_news')).properties.color, shadeHex('#9f2f2f', tokens.laneShadePercent));
    assert.equal(records.find((record) => record.id === dashboardRecordId('lane_monitor')).properties.color, shadeHex('#2f6f78', tokens.laneShadePercent));
    assert.equal(records.find((record) => record.id === dashboardRecordId('card_news_n1')).properties.color, shadeHex('#9f2f2f', 3));
    assert.deepEqual(records.find((record) => record.id === dashboardRecordId('card_news_n1')).properties.material.shadow, tokens.cardShadow);
    assert.equal(tokens.cardShadow.offsetY, 0);
    assert.equal(records.find((record) => record.id === dashboardRecordId('header_news')).properties.opacity, 1);
    assert.equal(records.find((record) => record.id === dashboardRecordId('header_monitor')).properties.opacity, 1);
});

test('dashboard contact cards render profile photos behind Bevy text', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'contacts', label_key: 'eve.dashboard.category.contacts', color: '#2f6f78', visible: true },
            { id: 'projects', label_key: 'eve.dashboard.category.projects', color: '#357245', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['contacts', [{
                id: 'contact_photo',
                title: 'Jane Doe',
                category_id: 'contacts',
                metadata: { user_face: '/api/uploads/jane.png' },
                span: 1
            }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const media = records.find((record) => record.id === dashboardRecordId('card_media_contacts_contact_photo'));
    const backdrop = records.find((record) => record.id === dashboardRecordId('card_label_backdrop_contacts_contact_photo'));
    const title = records.find((record) => record.id === dashboardRecordId('card_title_contacts_contact_photo'));
    const card = records.find((record) => record.id === dashboardRecordId('card_contacts_contact_photo'));
    assert.equal(media.type, 'image');
    assert.equal(media.properties.source, '/api/uploads/jane.png');
    assert.equal(media.properties.media_fit, 'cover');
    assert.equal(media.properties.corner_radius, tokens.metrics.contentRadius);
    assert.equal(media.properties.cornerRadius, tokens.metrics.contentRadius);
    assert.equal(media.properties.left, card.properties.left);
    assert.equal(media.properties.top, card.properties.top);
    assert.equal(media.properties.width, card.properties.width);
    assert.equal(media.properties.height, card.properties.height);
    assert.equal(backdrop.type, 'image');
    assert.match(backdrop.properties.source, /^data:image\/svg\+xml/);
    assert.equal(backdrop.properties.opacity, 0.6);
    assert.equal(backdrop.properties.width, card.properties.width);
    assert.equal(backdrop.properties.height, expectedDashboardLabelBackdropHeight(card.properties.height));
    assert.equal(backdrop.properties.left, card.properties.left);
    assert.equal(backdrop.properties.top, card.properties.top + card.properties.height - backdrop.properties.height);
    assert.equal(title.properties.left, backdrop.properties.left);
    assert.equal(title.properties.top, backdrop.properties.top);
    assert.equal(title.properties.width, backdrop.properties.width);
    assert.equal(title.properties.height, backdrop.properties.height);
    assert.equal(title.properties.text_style.baseline, 'middle');
    assert.equal(title.properties.text_style.padding_y, 0);
    assert.equal(Number(media.properties.z_index) > Number(card.properties.z_index), true);
    assert.equal(Number(backdrop.properties.z_index) > Number(media.properties.z_index), true);
    assert.equal(Number(title.properties.z_index) > Number(backdrop.properties.z_index), true);
});

test('dashboard project cards render contained renderer previews over the card color', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'contacts', label_key: 'eve.dashboard.category.contacts', color: '#2f6f78', visible: true },
            { id: 'projects', label_key: 'eve.dashboard.category.projects', color: '#357245', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['projects', [{
                id: 'project_preview',
                title: 'Scene',
                category_id: 'projects',
                metadata: { project_preview_source: 'data:image/png;base64,preview', preview_width: 320, preview_height: 200 },
                span: 1
            }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const card = records.find((record) => record.id === dashboardRecordId('card_projects_project_preview'));
    const media = records.find((record) => record.id === dashboardRecordId('card_media_projects_project_preview'));
    const backdrop = records.find((record) => record.id === dashboardRecordId('card_label_backdrop_projects_project_preview'));
    const title = records.find((record) => record.id === dashboardRecordId('card_title_projects_project_preview'));
    assert.equal(card.properties.color, shadeHex('#357245', 3));
    assert.equal(card.properties.corner_radius, 0);
    assert.equal(media.type, 'image');
    assert.equal(media.properties.source, 'data:image/png;base64,preview');
    assert.equal(media.properties.media_fit, 'contain');
    assert.equal(media.properties.object_fit, 'contain');
    assert.equal(media.properties.corner_radius, tokens.metrics.contentRadius);
    assert.equal(media.properties.cornerRadius, tokens.metrics.contentRadius);
    assert.equal(media.properties.media_width, 320);
    assert.equal(media.properties.media_height, 200);
    const scale = Math.min(card.properties.width / 320, card.properties.height / 200);
    const containedWidth = Math.round(320 * scale);
    const containedHeight = Math.round(200 * scale);
    assert.equal(media.properties.width, containedWidth);
    assert.equal(media.properties.height, containedHeight);
    assert.equal(media.properties.width < card.properties.width || media.properties.height < card.properties.height, true);
    assert.equal(media.properties.left, card.properties.left + (card.properties.width - containedWidth) / 2);
    assert.equal(media.properties.top, card.properties.top + (card.properties.height - containedHeight) / 2);
    assert.equal(Number((media.properties.width / media.properties.height).toFixed(2)), 1.6);
    assert.equal(backdrop.type, 'image');
    assert.doesNotMatch(decodeURIComponent(backdrop.properties.source), /Q/);
    assert.equal(backdrop.properties.opacity, 0.6);
    assert.equal(backdrop.properties.width, card.properties.width);
    assert.equal(backdrop.properties.height, expectedDashboardLabelBackdropHeight(card.properties.height));
    assert.equal(backdrop.properties.left, card.properties.left);
    assert.equal(backdrop.properties.top, card.properties.top + card.properties.height - backdrop.properties.height);
    assert.equal(title.properties.left, backdrop.properties.left);
    assert.equal(title.properties.top, backdrop.properties.top);
    assert.equal(title.properties.width, backdrop.properties.width);
    assert.equal(title.properties.height, backdrop.properties.height);
    assert.equal(title.properties.text_style.baseline, 'middle');
    assert.equal(title.properties.text_style.padding_y, 0);
    assert.equal(Number(backdrop.properties.z_index) > Number(media.properties.z_index), true);
    assert.equal(Number(title.properties.z_index) > Number(backdrop.properties.z_index), true);
});

test('dashboard cards without media do not render label backdrops', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'contacts', label_key: 'eve.dashboard.category.contacts', color: '#2f6f78', visible: true },
            { id: 'projects', label_key: 'eve.dashboard.category.projects', color: '#357245', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['contacts', [{ id: 'contact_plain', title: 'Jane Doe', category_id: 'contacts', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    assert.equal(records.find((record) => record.id === dashboardRecordId('card_media_contacts_contact_plain')), undefined);
    assert.equal(records.find((record) => record.id === dashboardRecordId('card_label_backdrop_contacts_contact_plain')), undefined);
    assert.ok(records.find((record) => record.id === dashboardRecordId('card_title_contacts_contact_plain')));
});

test('dashboard card labels ignore whitespace-only names and fall back to ids', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'projects', label_key: 'eve.dashboard.category.projects', color: '#357245', visible: true },
            { id: 'contacts', label_key: 'eve.dashboard.category.contacts', color: '#2f6f78', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map([
            ['projects', [{
                id: 'project_plain',
                title: '   ',
                category_id: 'projects',
                payload: { name: '   ', label: '' },
                span: 1
            }]],
            ['contacts', [{
                id: 'contact_plain',
                title: '   ',
                category_id: 'contacts',
                payload: { display_name: '   ', email: '' },
                span: 1
            }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    assert.equal(
        records.find((record) => record.id === dashboardRecordId('card_title_projects_project_plain'))?.properties?.text,
        'project_plain'
    );
    assert.equal(
        records.find((record) => record.id === dashboardRecordId('card_title_contacts_contact_plain'))?.properties?.text,
        'contact_plain'
    );
});

test('dashboard text records use the token font and invalidate text texture cache by font', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [{ id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true }],
        activeCategoryId: '',
        itemsByCategory: new Map([['news', [{ id: 'n1', title: 'News', category_id: 'news', span: 1 }]]]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const textRecords = records.filter((record) => record.type === 'text');
    assert.ok(textRecords.length > 0);
    assert.equal(textRecords.every((record) => record.properties.text_style.font_family === DASHBOARD_FONT_FAMILY), true);
    const firstStyle = textRecords[0].properties.text_style;
    const robotoKey = createBevyMediaTextureCacheKey({ kind: 'text', text: 'News', style: firstStyle });
    const systemKey = createBevyMediaTextureCacheKey({ kind: 'text', text: 'News', style: { ...firstStyle, font_family: 'system-ui' } });
    assert.notEqual(robotoKey, systemKey);
});

test('dashboard records keep layout geometry in project logical coordinates', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true },
            { id: 'monitor', label_key: 'eve.dashboard.category.monitor', color: '#2f6f78', visible: true }
        ],
        activeCategoryId: 'news',
        itemsByCategory: new Map([
            ['news', [{ id: 'n1', title: 'News', category_id: 'news', span: 1 }]]
        ]),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    const background = records.find((record) => record.id === dashboardRecordId('background'));
    const table = records.find((record) => record.id === dashboardRecordId('table'));
    const lane = records.find((record) => record.id === dashboardRecordId('lane_news'));
    const card = records.find((record) => record.id === dashboardRecordId('card_news_n1'));
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((key) => background.properties[key]),
        [layout.dashboard_rect.x, layout.dashboard_rect.y, layout.dashboard_rect.width, layout.dashboard_rect.height]
    );
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((key) => table.properties[key]),
        [layout.table_rect.x, layout.table_rect.y, layout.table_rect.width, layout.table_rect.height]
    );
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((key) => lane.properties[key]),
        [layout.lanes[0].lane_rect.x, layout.lanes[0].lane_rect.y, layout.lanes[0].lane_rect.width, layout.lanes[0].lane_rect.height]
    );
    assert.deepEqual(
        ['left', 'top'].map((key) => card.properties[key] > layout.visible_item_rects[0].rect[key === 'left' ? 'x' : 'y']),
        [true, true]
    );
});

test('dashboard records do not render placeholder cards for empty lanes', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [
            { id: 'news', label_key: 'eve.dashboard.category.news', color: '#9f2f2f', visible: true }
        ],
        activeCategoryId: '',
        itemsByCategory: new Map(),
        tokens
    });
    const records = buildDashboardRecords({ layout, tokens });
    assert.equal(records.some((record) => record.id.includes('empty_card_')), false);
    assert.equal(records.some((record) => record.id.includes('empty_cell_')), false);
});

test('dashboard fullscreen item records render directly in the detail rect', () => {
    const tokens = mergeDashboardTokens();
    const layout = createDashboardLayout({
        width: 960,
        height: 640,
        toolboxHeight: 80,
        categories: [{ id: 'goals', label_key: 'eve.dashboard.category.goals', color: '#63d471', visible: true }],
        activeCategoryId: 'goals',
        itemsByCategory: new Map(),
        tokens
    });
    const rect = layout.creation_fullscreen_rect;
    const records = buildDashboardRecords({
        layout,
        tokens,
        editor: {
            rect,
            title: 'Goal',
            item: { id: 'goal_1', title: 'Goal', category_id: 'goals' }
        }
    });
    const editor = records.find((record) => record.id === dashboardRecordId('editor'));
    assert.equal(editor.properties.left, rect.x);
    assert.equal(editor.properties.top, rect.y);
    assert.equal(editor.properties.width, rect.width);
    assert.equal(editor.properties.height, rect.height);
});
