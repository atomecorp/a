import { beforeEach, describe, expect, it } from 'vitest';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import { buildDashboardRecords, dashboardRecordId } from '../../eVe/domains/dashboard/dashboard_records.js';
import { buildDashboardBevyUiTree } from '../../eVe/domains/dashboard/dashboard_bevy_ui_tree.js';
import { mergeDashboardTokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';

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
        }
        expect(header.properties.material.shadow).toBeTruthy();
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

    it('renders local time and date inside the strict one-unit Calendar header', () => {
        const target = layout();
        const records = buildDashboardRecords({ layout: target, tokens, now: new Date('2026-09-16T19:24:00+02:00') });
        const calendarLane = target.projection_lanes.find((lane) => lane.category.id === 'calendar');
        expect(calendarLane.header_rect.width).toBe(target.unit_width);
        expect(record(records, 'header_calendar_time').properties.text).toMatch(/19|17|07/);
        expect(record(records, 'header_calendar_date').properties.text.length).toBeGreaterThan(3);
    });

    it('keeps media translucent above the mandatory frozen-glass card surface', () => {
        const records = buildDashboardRecords({ layout: layout(), tokens });
        const projectCard = record(records, 'card_projects_project-one');
        const projectMedia = record(records, 'card_media_projects_project-one');
        const contactMedia = record(records, 'card_media_contacts_contact-one');
        expect(projectCard.properties.color).toBe('rgba(0,0,0,0)');
        expect(projectCard.properties.material.backdrop.blurPx).toBe(tokens.contentGlass.blurPx);
        expect(projectMedia.properties.opacity).toBe(tokens.contentGlass.mediaOpacity);
        expect(contactMedia.properties.opacity).toBe(tokens.contentGlass.mediaOpacity);
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
