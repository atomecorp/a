import { beforeEach, describe, expect, it } from 'vitest';
import { createDashboardLayout, hitTestDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { createDashboardBevyUiRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_runtime.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { DASHBOARD_WORKSPACE_PROJECT_ID } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { EVE_COMMON_SKIN_TOKENS } from '../../eVe/elements/skin/tokens.js';
import { mapVirtualSceneNodeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const tokens = mergeDashboardTokens({ metrics: { blockUnitSizePx: 112 } });
const categories = [
    { id: 'news', label_key: 'eve.dashboard.category.news', icon_id: 'news', color: '#9f2f2f' },
    { id: 'calendar', label_key: 'eve.dashboard.category.calendar', icon_id: 'calendar', color: '#245f94' },
    { id: 'projects', label_key: 'eve.dashboard.category.projects', icon_id: 'projects', color: '#357245' },
    { id: 'contacts', label_key: 'eve.dashboard.category.contacts', icon_id: 'contacts', color: '#673071' },
    { id: 'monitor', label_key: 'eve.dashboard.category.monitor', icon_id: 'monitor', color: '#2f6f78' }
];

const weather = {
    id: 'dashboard_module_weather', category_id: 'news', span: 2,
    metadata: { dashboard_module: 'weather', weather: {
        status: 'ready', temperature: 18, city: 'Clermont-Ferrand', condition: 'clear', condition_label: 'Ciel dégagé'
    } }
};
const items = () => new Map([
    ['news', [weather, { id: 'news-one', category_id: 'news', title: 'Une actualité' }]],
    ['calendar', [{ id: 'event-one', category_id: 'calendar', title: 'Rendez-vous', payload: { start: '2026-09-16T10:00:00Z' } }]],
    ['projects', [{ id: 'project-one', category_id: 'projects', title: 'Projet', metadata: {
        project_preview_source: 'data:image/png;base64,AA==', project_preview_width: 1600, project_preview_height: 900
    } }]],
    ['contacts', [{ id: 'contact-one', category_id: 'contacts', title: 'Ada', metadata: { user_face: 'data:image/png;base64,BB==' } }]],
    ['monitor', []]
]);
const layout = (options = {}) => createDashboardLayout({
    width: 900, height: 720, categories, itemsByCategory: items(), handedness: 'right', tokens, ...options
});

const record = (records, suffix) => records.find((entry) => entry.id === dashboardRecordId(suffix));

beforeEach(() => {
    globalThis.window = {
        devicePixelRatio: 2,
        __eveSurfaceBackground: { color: [0.1, 0.2, 0.3, 1], sourceUrl: 'blob:profile-background', signature: 'profile' }
    };
});

describe('Dashboard WebGPU records', () => {
    it('projects an opaque full-screen base before the cover profile image', () => {
        const target = layout();
        const records = buildDashboardRecords({ layout: target, tokens });
        expect(record(records, 'surface_base').properties).toMatchObject({
            left: 0, top: 0, width: 900, height: 720, opacity: 1
        });
        expect(record(records, 'surface_image').properties).toMatchObject({
            source: 'blob:profile-background', fit: 'cover', media_fit: 'cover', object_fit: 'cover'
        });
        expect(record(records, 'surface_base').properties.z_index)
            .toBeLessThan(record(records, 'surface_image').properties.z_index);
    });

    it('falls back to a fully opaque canonical color without an image', () => {
        globalThis.window.__eveSurfaceBackground = { color: [0.2, 0.3, 0.4, 1], signature: 'color' };
        const records = buildDashboardRecords({ layout: layout(), tokens });
        expect(record(records, 'surface_base').properties.color).toBe('rgba(51,77,102,1)');
        expect(record(records, 'surface_image')).toBeUndefined();
    });

    it('has no obsolete veil, bands, shadows, focus spread or plus records', () => {
        const records = buildDashboardRecords({ layout: layout(), tokens });
        expect(records.some((entry) => /project_veil|bottom_shadow|header_side_shadow|focus_spread|create_bg|__eve_dashboard_lane_|__eve_dashboard_table/.test(entry.id))).toBe(false);
    });

    it('uses the styled frozen-glass material on every content card without double paint', () => {
        const records = buildDashboardRecords({ layout: layout({ activeCategoryId: 'projects' }), tokens });
        const header = record(records, 'header_bg_projects');
        const cards = [
            record(records, 'card_news_dashboard_module_weather'),
            record(records, 'card_news_news-one'),
            record(records, 'card_calendar_event-one'),
            record(records, 'card_projects_project-one'),
            record(records, 'card_contacts_contact-one')
        ];
        expect(header.properties.material.backdrop.blurPx).toBeGreaterThan(0);
        for (const card of cards) {
            expect(card.properties.color).toBe(tokens.contentGlass.fillColor);
            expect(card.properties.material.backdrop.blurPx).toBe(tokens.contentGlass.blurPx);
            expect(card.properties.material.backdrop.tint[3]).toBe(tokens.contentGlass.tintAlpha);
            expect(card.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
        }
        expect(header.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
        expect(records.filter((entry) => entry.properties?.material?.shadow).every((entry) => (
            entry.id.includes('header_bg_') || /^__eve_dashboard_card_[^_]+_/.test(entry.id)
        ))).toBe(true);
    });

    it('renders weather as a two-unit glass card with icon and four data fields', () => {
        const target = layout();
        const records = buildDashboardRecords({ layout: target, tokens });
        const box = target.projection_lanes[0].visible_item_rects[0].card_rect;
        expect(record(records, 'card_news_dashboard_module_weather').properties.width).toBe(target.unit_width * 2);
        expect(record(records, 'card_weather_icon_news_dashboard_module_weather').properties.source).toContain('data:image/svg+xml');
        expect(record(records, 'card_weather_temperature_news_dashboard_module_weather').properties.text).toBe('18°');
        expect(record(records, 'card_weather_city_news_dashboard_module_weather').properties.text).toBe('Clermont-Ferrand');
        expect(box.width).toBe(target.unit_width * 2);
    });

    it('enlarges and lowers header icons while removing the Calendar label', () => {
        for (const blockUnitSizePx of [80, 112, 144]) {
            const surfaceTokens = mergeDashboardTokens({ metrics: { blockUnitSizePx } });
            const target = layout({ width: blockUnitSizePx * 8, height: blockUnitSizePx * 6, tokens: surfaceTokens });
            const records = buildDashboardRecords({ layout: target, tokens: surfaceTokens, now: new Date('2026-09-16T19:24:00+02:00') });
            const calendarLane = target.projection_lanes.find((lane) => lane.category.id === 'calendar');
            for (const lane of target.projection_lanes) {
                const icon = record(records, `header_icon_${lane.category.id}`);
                const baseSize = Math.max(20, Math.min(48, lane.header_rect.width * (lane.category.id === 'calendar' ? 0.25 : 0.34)));
                expect(icon.properties.width).toBe(baseSize * 1.5);
                expect(icon.properties.height).toBe(baseSize * 1.5);
                expect(icon.properties.top).toBe(lane.header_rect.y + Math.max(7, lane.header_rect.height * 0.1) + 5);
                expect(icon.properties.material).toBeUndefined();
            }
            expect(calendarLane.header_rect.width).toBe(target.unit_width);
            expect(record(records, 'header_calendar')).toBeUndefined();
            expect(record(records, 'header_calendar_time').properties.text).toMatch(/19|17|07/);
            expect(record(records, 'header_calendar_time').properties.text_style.font_size)
                .toBe(Math.max(16, calendarLane.header_rect.width * 0.19));
            expect(record(records, 'header_calendar_date').properties.text.length).toBeGreaterThan(3);
            expect(record(records, 'header_calendar_date').properties.text_style.font_size)
                .toBe(Math.max(10, calendarLane.header_rect.width * 0.1));
            const time = record(records, 'header_calendar_time').properties;
            const date = record(records, 'header_calendar_date').properties;
            expect(time.top).toBe(Math.round(calendarLane.header_rect.y + calendarLane.header_rect.height * 0.55));
            expect(time.height).toBe(Math.round(calendarLane.header_rect.height * 0.2));
            expect(date.top).toBe(Math.round(calendarLane.header_rect.y + calendarLane.header_rect.height * 0.8));
            expect(date.height).toBe(Math.round(calendarLane.header_rect.height * 0.13));
            expect(date.top - (time.top + time.height)).toBeGreaterThanOrEqual(Math.floor(calendarLane.header_rect.height * 0.05));
            expect(record(records, 'header_projects')).toBeTruthy();
        }
    });

    it('keeps partial rows square and clips them without deforming their records', () => {
        const target = layout({
            height: 280,
            verticalScrollOffset: 100,
            allowPartialLanes: true
        });
        const records = buildDashboardRecords({ layout: target, tokens, now: new Date('2026-09-17T11:22:00+02:00') });
        const partialLanes = target.lanes.filter((lane) => lane.visible_rect.height < target.block_unit_size);
        expect(partialLanes.length).toBe(2);
        for (const lane of target.projection_lanes) {
            expect(lane.lane_rect.height).toBe(target.block_unit_size);
            expect(lane.header_rect.height).toBe(target.block_unit_size);
            for (const entry of lane.visible_item_rects) {
                expect(entry.card_rect.height).toBe(target.block_unit_size);
            }
        }
        for (const lane of partialLanes) {
            const background = record(records, `header_bg_${lane.category.id}`);
            const icon = record(records, `header_icon_${lane.category.id}`);
            expect(icon.properties.width).toBe(icon.properties.height);
            expect(background.properties.height).toBe(target.block_unit_size);
            expect(background.properties.clip).toEqual(target.vertical_viewport_rect);
            expect(icon.properties.clip).toEqual(lane.header_visible_rect);
            expect(lane.header_visible_rect.height).toBeLessThan(lane.header_rect.height);
        }
        const tree = buildDashboardBevyUiTree({ layout: target, tokens });
        const projected = projectBevyUiTreeRecords({ tree, treeId: 'dashboard_bevy_ui', workspaceLayer: 'dashboard' });
        const projectedIcon = projected.find((entry) => entry.id.endsWith('__eve_dashboard_header_icon_projects'));
        const virtualIcon = createVirtualSceneTree([projectedIcon]).nodes[0];
        const projectLane = target.lanes.find((lane) => lane.category.id === 'projects');
        expect(projectedIcon.properties.clip).toEqual(projectLane.header_visible_rect);
        expect(mapVirtualSceneNodeToBevyPayload(virtualIcon).clip_rect).toEqual([
            projectLane.header_visible_rect.x,
            projectLane.header_visible_rect.y,
            projectLane.header_visible_rect.width,
            projectLane.header_visible_rect.height
        ]);
        const top = partialLanes.find((lane) => lane.header_rect.y < target.vertical_viewport_rect.y);
        const hiddenPoint = { x: top.header_rect.x + 2, y: top.header_rect.y + 2 };
        expect(hitTestDashboardLayout(target, hiddenPoint).kind).toBe('outside');
        expect(hitTestDashboardLayout(target, {
            x: top.header_visible_rect.x + 2,
            y: top.header_visible_rect.y + 2
        }).kind).toBe('header');
    });

    it('derives Calendar time and date from every render timestamp', () => {
        const target = layout();
        const before = buildDashboardRecords({ layout: target, tokens, now: new Date('2026-09-16T23:59:00') });
        const after = buildDashboardRecords({ layout: target, tokens, now: new Date('2026-09-17T00:00:00') });
        expect(record(before, 'header_calendar_time').properties.text)
            .not.toBe(record(after, 'header_calendar_time').properties.text);
        expect(record(before, 'header_calendar_date').properties.text)
            .not.toBe(record(after, 'header_calendar_date').properties.text);
    });

    it('keeps one minute-aligned clock timer and clears it on close and destroy', async () => {
        const previousWindow = globalThis.window;
        const previousDocument = globalThis.document;
        const NativeDate = globalThis.Date;
        const browser = installMockBrowserEnv();
        globalThis.window = browser.window;
        globalThis.document = browser.document;
        const view = browser.document.createElement('div');
        view.id = 'view';
        browser.document.body.appendChild(view);
        const canvas = browser.document.createElement('canvas');
        canvas.id = 'eve_surface_project';
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 720, width: 900, height: 720 });
        view.appendChild(canvas);
        let currentTime = '2026-09-17T10:00:59.900';
        globalThis.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : [currentTime])); }
            static now() { return new NativeDate(currentTime).getTime(); }
        };
        const timers = new Map();
        let timerId = 0;
        browser.window.setTimeout = (callback, delay) => {
            timerId += 1;
            timers.set(timerId, { callback, delay });
            return timerId;
        };
        browser.window.clearTimeout = (id) => timers.delete(id);
        const trees = new Map();
        const runtime = createDashboardBevyUiRuntime({
            constants: { dashboard: { categories: [{
                ...categories[1], color_family: 'blue', data_source: 'calendar', order: 1
            }] } },
            adapters: { listMany: async () => new Map([['calendar', []]]) },
            calendarApiLoader: async () => ({ on: () => () => {} }),
            uiRuntime: {
                state: { trees },
                mountTree: async ({ id, tree }) => { trees.set(id, { tree }); return { ok: true }; },
                unmountTree: async (id) => { trees.delete(id); return { ok: true }; },
                setTreeOpacity: async () => ({ ok: true }),
                setTreeSuspended: async () => ({ ok: true }),
                cancelTreeRender: () => {},
                readDiagnostics: () => ({ mounted_nodes: trees.size })
            }
        });
        try {
            await runtime.open({ sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: 'clock_project' });
            expect(timers.size).toBe(1);
            const firstTimer = [...timers.values()][0];
            expect(firstTimer.delay).toBe(125);
            const before = runtime.state.tree.root.children.find((node) => node.id === '__eve_dashboard_header_calendar_time')?.text;
            timers.clear();
            currentTime = '2026-09-17T10:01:00.010';
            firstTimer.callback();
            for (let attempt = 0; attempt < 10 && timers.size === 0; attempt += 1) await Promise.resolve();
            const after = runtime.state.tree.root.children.find((node) => node.id === '__eve_dashboard_header_calendar_time')?.text;
            expect(after).not.toBe(before);
            expect(timers.size).toBe(1);
            await runtime.close();
            expect(timers.size).toBe(0);
            await runtime.open({ sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: 'clock_project' });
            expect(timers.size).toBe(1);
            await runtime.destroy();
            expect(timers.size).toBe(0);
        } finally {
            globalThis.Date = NativeDate;
            globalThis.window = previousWindow;
            globalThis.document = previousDocument;
        }
    });

    it('keeps card media opaque above the transparent frozen-glass support', () => {
        const records = buildDashboardRecords({ layout: layout(), tokens });
        const projectCard = record(records, 'card_projects_project-one');
        const projectMedia = record(records, 'card_media_projects_project-one');
        const contactMedia = record(records, 'card_media_contacts_contact-one');
        expect(projectCard.properties.color).toBe('rgba(0,0,0,0)');
        expect(projectCard.properties.material.backdrop.blurPx).toBe(tokens.contentGlass.blurPx);
        expect(projectMedia.properties.opacity).toBe(1);
        expect(contactMedia.properties.opacity).toBe(1);
        expect(projectMedia.properties.media_fit).toBe('contain');
        expect(contactMedia.properties.media_fit).toBe('cover');
        expect(record(records, 'card_label_backdrop_projects_project-one')).toBeTruthy();
    });

    it('keeps calendar event title and date as independent projected text records', () => {
        const records = buildDashboardRecords({ layout: layout(), tokens });
        expect(record(records, 'card_title_calendar_event-one').properties.text).toBe('Rendez-vous');
        expect(record(records, 'card_date_calendar_event-one').properties.text).toMatch(/09|16/);
    });

    it('projects backdrop material into BevyUI node style and keeps only card roots actionable', () => {
        const handlers = { activate: () => {}, wheel: () => {} };
        const tree = buildDashboardBevyUiTree({ layout: layout(), tokens, handlers });
        const children = tree.root.children;
        const header = children.find((node) => node.id === dashboardRecordId('header_bg_news'));
        const weatherRoot = children.find((node) => node.id === dashboardRecordId('card_news_dashboard_module_weather'));
        const weatherIcon = children.find((node) => node.id === dashboardRecordId('card_weather_icon_news_dashboard_module_weather'));
        expect(header.style.backdrop.blur_px).toBeGreaterThan(0);
        expect(weatherRoot.on.activate).toBeTypeOf('function');
        expect(weatherIcon.on).toBeUndefined();
    });

    it('offsets the complete Dashboard record band without changing geometry', () => {
        const target = layout();
        const base = buildDashboardRecords({ layout: target, tokens });
        const shifted = buildDashboardRecords({ layout: target, tokens, layerOffset: 50 });
        expect(shifted[0].properties.z_index - base[0].properties.z_index).toBe(50);
        expect(shifted[0].properties.width).toBe(base[0].properties.width);
    });
});
