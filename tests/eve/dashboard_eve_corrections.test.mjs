import { test, expect, vi } from 'vitest';
import { dashboardEveHomeCellVisible, dashboardHomeLayout, DASHBOARD_HOME_LAYOUT } from '../../eVe/domains/dashboard/dashboard_mystic_grid.js';
import { dashboardHomeMatrix, dashboardHomeMatrixNeighbours, dashboardHomeMatrixPlace } from '../../eVe/domains/dashboard/dashboard_home_matrix.js';
import { takeDashboardEveEntry, rememberDashboardConnection, forgetDashboardEveEntry, rememberDashboardEveMode } from '../../eVe/domains/dashboard/dashboard_home_style.js';
import { DASHBOARD_EVE_ATOM_TOKENS, eveAtomBreath } from '../../eVe/domains/dashboard/dashboard_eve_tokens.js';
import { dashboardStyleForMasteryLevel, normalizeDashboardStyle } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
import { resolveMusicProvider } from '../../eVe/domains/music/music_source.js';
import { createDashboardMysticStage } from '../../eVe/domains/dashboard/dashboard_mystic_stage.js';
import { tvSource } from '../../eVe/domains/dashboard/dashboard_video_sources.js';

const tv = vi.hoisted(() => ({ country: vi.fn(async () => []), stored: vi.fn(() => []), written: vi.fn(() => true), gateway: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../eVe/intuition/tools/tv_catalog_client.js', () => ({ readTvChannels: tv.country }));
vi.mock('../../eVe/intuition/tools/tv_favorites_preference.js', () => ({ readTvFavorites: tv.stored, isTvFavoritesWritten: tv.written,
    isTvFavorite: id => tv.stored().some(entry => entry.id === id), toggleTvFavorite: vi.fn() }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: tv.gateway }));
vi.mock('../../eVe/domains/dashboard/dashboard_contact_items.js', async (importOriginal) => ({
    ...(await importOriginal()), waitForPublishedFavorites: async () => true }));

// A retired or unknown style reads as the style of the person's level: eVe Basic for a beginner, eVe Pro otherwise.
test('eVe Basic composes the same home and hides every other tile; retired styles read as the level\'s style', () => {
    expect(normalizeDashboardStyle('eve_basic')).toBe('eve_basic');
    expect(normalizeDashboardStyle('eve')).toBe('eve');
    for (const retired of ['basic', 'pro', 'mystic', 'auto']) {
        expect(normalizeDashboardStyle(retired, 'beginner')).toBe('eve_basic');
        for (const level of ['intermediate', 'advanced']) expect(normalizeDashboardStyle(retired, level)).toBe('eve');
        expect(normalizeDashboardStyle(retired)).toBe(dashboardStyleForMasteryLevel(undefined));
    }
    const refs = [...DASHBOARD_HOME_LAYOUT.tileRefs, 'atom', 'clock', 'weather', 'search'];
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { mode: 'solo', basic: true }))).toEqual(['atom']);
    // Its three tiles around the session (the V logo at the centre), the footer's Atom and search, the time and the weather.
    const base = ['objectives', 'contacts', 'next_event', 'session', 'atom', 'clock', 'weather', 'search'];
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true })).sort()).toEqual([...base].sort());
    // The monitors chosen show above the session, up to six; no other tile ever joins eVe Basic.
    const shown = options => refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true, ...options })
        && !base.includes(ref));
    expect(shown({ monitors: 3 })).toEqual(['monitor_0', 'library', 'monitor_1']);
    expect(shown({ monitors: 9 }).sort()).toEqual(['monitor_0', 'monitor_1', 'library', 'shop', 'create', 'gps'].sort());
});

// The one home matrix (dashboard_home_matrix.js, V6.1), standing on a phone: units of a tool, a tile 2 x 2 units.
test('eVe Pro reads like the decision grid and eVe Basic lays its four tiles as a cross around the Atom', () => {
    const matrix = basic => dashboardHomeMatrix({ width: 360, height: 640, basic });
    const shown = (basic, options = {}) => [...dashboardHomeLayout(basic).tileRefs, 'clock', 'weather']
        .filter(ref => dashboardEveHomeCellVisible(ref, { basic, ...options }));
    const at = (basic, row, column) => shown(basic).find(ref => {
        const place = dashboardHomeMatrixPlace(matrix(basic), ref);
        return place[1] === row && place[0] === column && place[2] === 2;
    });
    // eVe Pro: the time and the weather, the wide Agenda, then Activity · the V logo · Média, Projects · Moniteur · Contacts, Capture.
    expect(['clock', 'weather', 'next_event'].map(ref => dashboardHomeMatrixPlace(matrix(false), ref)))
        .toEqual([[0, 0, 3, 1], [3, 0, 3, 1], [0, 1, 6, 1]]);
    expect([2, 4, 6].map(row => [0, 2, 4].map(column => at(false, row, column)))).toEqual([
        ['activity', 'session', 'media'], ['projects', 'monitor_0', 'contacts'], [undefined, 'capture', undefined]]);
    expect(dashboardHomeMatrixPlace(matrix(false), 'settings')).toBeNull();
    // eVe Basic: the chosen monitor above the V logo, Contacts left, the Agenda right, Objectives under it.
    expect(dashboardHomeMatrixNeighbours(matrix(true), shown(true, { monitors: 1 })))
        .toEqual({ above: 'monitor_0', below: 'objectives', left: 'contacts', right: 'next_event' });
    expect(dashboardHomeMatrixNeighbours(matrix(false), shown(false)))
        .toEqual({ above: '', below: 'monitor_0', left: 'activity', right: 'media' });
});

test('a restored launch starts solo, an explicit connection starts with the grid, and a home revisit retains its revealed state', () => {
    forgetDashboardEveEntry('owner');
    expect(takeDashboardEveEntry('owner')).toEqual({ mode: 'solo', arrive: true });
    rememberDashboardEveMode('owner', 'grid');
    expect(takeDashboardEveEntry('owner')).toEqual({ mode: 'grid', arrive: false });
    forgetDashboardEveEntry('owner'); rememberDashboardConnection('owner');
    expect(takeDashboardEveEntry('owner')).toEqual({ mode: 'grid', arrive: true });
    forgetDashboardEveEntry('owner');
});

// A slow heartbeat barely shrinks the Atom (at most `scale`, 1.5 %) and dims its ring by at most `halo` (18 %); the
// contour drifts out of round by less than one percent.
test('the breathing halo never extinguishes, the beat barely shrinks the Atom and deformation stays below one percent', () => {
    const { breathe } = DASHBOARD_EVE_ATOM_TOKENS;
    const samples = Array.from({ length: 801 }, (_, i) => eveAtomBreath(i * 10));
    expect(Math.min(...samples.map(s => s.light))).toBeCloseTo(1 - breathe.halo);
    expect(Math.max(...samples.map(s => s.light))).toBeCloseTo(1);
    for (const sample of samples) {
        expect(sample.light).toBeGreaterThanOrEqual(1 - breathe.halo - 1e-9);
        expect(sample.scale).toBeGreaterThanOrEqual(1 - breathe.scale - 1e-9);
        expect(sample.scale).toBeLessThanOrEqual(1);
        for (const key of ['x', 'y']) expect(Math.abs(sample[key] - 1)).toBeLessThan(0.01);
    }
    expect(eveAtomBreath(2000, true)).toEqual(eveAtomBreath(0, true));
});

test('a slow provider cannot delay what this device shows at once', async () => {
    const command = vi.fn(() => new Promise(() => {}));
    expect(await resolveMusicProvider({ command, remote: false, apple: async () => false })).toBe('');
    expect(command).not.toHaveBeenCalled();
});

test('the TV, Films & séries and Vidéos open as lists out of their plate (dashboard_video.js)', async () => {
    const stage = createDashboardMysticStage({ projectId: 'home', readStageRect: () => null, readLastProjectId: async () => '' });
    const items = await stage.funItems({ update: () => {} });
    expect(items.map(item => item.key)).toEqual(expect.arrayContaining(['fun_tv', 'fun_video']));
    // Music services not entered in Passwords & keys have no tile.
    expect(items.map(item => item.key)).not.toEqual(expect.arrayContaining(['fun_spotify']));
    expect(items.map(item => item.key)).not.toEqual(expect.arrayContaining(['fun_deezer']));
    // « Vidéo » is a level: its films and series, its online videos (user, 26 Oct. 2026).
    const video = items.find(item => item.key === 'fun_video');
    expect(video.type).toBe('palette');
    expect(video.children.map(item => item.key)).toEqual(['fun_films', 'fun_videos']);
    for (const plate of [items.find(item => item.key === 'fun_tv'), ...video.children]) {
        expect(plate.type).not.toBe('palette');
        expect(plate.closeOnSelect).toBe(false);
        expect(typeof plate.onSelect).toBe('function');
    }
});

test('the TV list opens on the favourites as stored, then the channels of the country', async () => {
    tv.stored.mockReturnValue([{ id: 'BFMTV.fr', name: 'BFM TV', country: 'FR', logo: 'stored.png' }, { id: 'gone.fr', name: 'Gone', country: 'FR', logo: '' }]);
    tv.country.mockResolvedValue([{ id: 'France24.fr', name: 'France 24', logo: 'f24.png', categories: ['news'] }]);
    const source = tvSource();
    expect((await source.local()).map(entry => entry.key)).toEqual(['tv_BFMTV.fr', 'tv_gone.fr']);
    const { entries, next } = await source.discover();
    expect(entries.map(entry => [entry.key, entry.kind, entry.image])).toEqual([['tv_France24.fr', 'tv', 'f24.png']]);
    expect(next).toBe('');
    expect(source.isFavorite({ ref: 'BFMTV.fr' })).toBe(true);
    tv.written.mockReturnValueOnce(false);
    expect(await source.local()).toEqual([]);
});
