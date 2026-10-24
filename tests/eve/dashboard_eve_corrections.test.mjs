import { test, expect, vi } from 'vitest';
import { dashboardAtomNeighbours, dashboardEveHomeCellVisible, dashboardHomeCell, dashboardMysticCellRef, DASHBOARD_HOME_LAYOUT } from '../../eVe/domains/dashboard/dashboard_mystic_grid.js';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { takeDashboardEveEntry, rememberDashboardConnection, forgetDashboardEveEntry, rememberDashboardEveMode } from '../../eVe/domains/dashboard/dashboard_home_style.js';
import { eveAtomBreath } from '../../eVe/domains/dashboard/dashboard_eve_tokens.js';
import { normalizeDashboardStyle } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
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

test('eVe Basic composes the same home and hides every other tile; retired styles read as eVe Basic', () => {
    expect(normalizeDashboardStyle('eve_basic')).toBe('eve_basic');
    expect(normalizeDashboardStyle('eve')).toBe('eve');
    for (const retired of ['basic', 'pro', 'mystic', 'auto']) expect(normalizeDashboardStyle(retired)).toBe('eve_basic');
    const refs = [...DASHBOARD_HOME_LAYOUT.tileRefs, 'atom', 'clock', 'weather', 'search'];
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { mode: 'solo', basic: true }))).toEqual(['atom']);
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true })).sort()).toEqual(
        ['objectives', 'contacts', 'next_event', 'atom', 'clock', 'weather', 'search'].sort());
    // A cell earned with the user's objectives (dashboard_progression_catalog.js) shows on Basic.
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true, visible: ['objectives', 'contacts', 'next_event', 'activity'] }))
        .sort()).toEqual(['objectives', 'contacts', 'next_event', 'activity', 'atom', 'clock', 'weather', 'search'].sort());
    // The monitors chosen show above the Atom, up to six; an earned cell keeps its own tile.
    const shown = options => refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true, ...options })
        && !['objectives', 'contacts', 'next_event', 'atom', 'clock', 'weather', 'search'].includes(ref));
    expect(shown({ monitors: 3 })).toEqual(['monitor_0', 'library', 'monitor_1']);
    expect(shown({ monitors: 9 }).sort()).toEqual(['monitor_0', 'monitor_1', 'library', 'shop', 'create', 'gps'].sort());
    expect(shown({ monitors: 3, visible: ['objectives', 'contacts', 'next_event', 'library'] }).sort()).toEqual(['monitor_0', 'monitor_1', 'library', 'shop'].sort());
});

test('eVe Pro reads like the decision grid and eVe Basic lays its four tiles as a cross around the Atom', () => {
    const atoms = FIRST_LAUNCH_TEMPLATES.dashboard_eve.atoms.filter(atom => atom.props.template_control);
    const placed = basic => atoms.map(atom => ({ ref: dashboardMysticCellRef(atom.props.template_control), cell: dashboardHomeCell(atom.props.matrix_cell, basic) }));
    const at = (basic, row, column) => placed(basic).find(entry => entry.cell.row === row && entry.cell.column === column)?.ref;
    expect([1, 2, 3, 4, 5].map(row => [0, 1, 2].map(column => at(false, row, column)))).toEqual([
        ['contacts', 'next_event', 'gps'], ['monitor_0', 'monitor_1', 'monitor_2'], ['activity', 'atom', 'objectives'],
        ['generator', 'fun', 'create'], ['projects', 'capture', 'last_project']]);
    expect(placed(false).some(entry => entry.ref === 'settings')).toBe(false);
    expect([at(true, 2, 1), at(true, 3, 0), at(true, 3, 2), at(true, 4, 1), at(true, 3, 1)]).toEqual(['next_event', 'contacts', 'monitor_0', 'objectives', 'atom']);
    expect(dashboardAtomNeighbours(placed(false))).toEqual({ above: 'monitor_1', below: 'fun' });
    expect(dashboardAtomNeighbours(placed(true))).toEqual({ above: 'next_event', below: 'objectives' });
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

test('the breathing halo never extinguishes and keeps scale and deformation below one percent', () => {
    const samples = Array.from({ length: 801 }, (_, i) => eveAtomBreath(i * 10));
    expect(Math.min(...samples.map(s => s.light))).toBeCloseTo(2 / 3);
    expect(Math.max(...samples.map(s => s.light))).toBeCloseTo(4 / 3);
    for (const sample of samples) for (const key of ['scale', 'x', 'y']) expect(Math.abs(sample[key] - 1)).toBeLessThan(0.01);
    expect(eveAtomBreath(2000, true)).toEqual(eveAtomBreath(0, true));
});

test('a slow provider cannot delay what this device shows at once', async () => {
    const command = vi.fn(() => new Promise(() => {}));
    expect(await resolveMusicProvider({ command, remote: false, apple: async () => false })).toBe('');
    expect(command).not.toHaveBeenCalled();
});

test('the TV and every online video service open as lists out of their plate (dashboard_video.js)', async () => {
    const stage = createDashboardMysticStage({ projectId: 'home', readStageRect: () => null, readLastProjectId: async () => '' });
    const items = await stage.funItems({ update: () => {} });
    expect(items.map(item => item.key)).toEqual(expect.arrayContaining(['fun_tv', 'fun_youtube', 'fun_peertube']));
    // Music services not entered in Passwords & keys have no tile.
    expect(items.map(item => item.key)).not.toEqual(expect.arrayContaining(['fun_spotify']));
    expect(items.map(item => item.key)).not.toEqual(expect.arrayContaining(['fun_deezer']));
    for (const key of ['fun_tv', 'fun_youtube', 'fun_peertube']) {
        const plate = items.find(item => item.key === key);
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
