import { test, expect, vi } from 'vitest';
import { dashboardAtomNeighbours, dashboardEveHomeCellVisible, dashboardHomeCell, dashboardMysticCellRef, DASHBOARD_HOME_VARIANTS } from '../../eVe/domains/dashboard/dashboard_mystic_grid.js';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { resolveHomeTemplateKey, takeDashboardEveEntry, rememberDashboardConnection, forgetDashboardEveEntry, rememberDashboardEveMode } from '../../eVe/domains/dashboard/dashboard_home_style.js';
import { eveAtomBreath } from '../../eVe/domains/dashboard/dashboard_eve_tokens.js';
import { normalizeDashboardStyle } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
import { createMusicMysticItem } from '../../eVe/domains/music/music_mystic_items.js';
import { createDashboardMysticStage } from '../../eVe/domains/dashboard/dashboard_mystic_stage.js';

const tv = vi.hoisted(() => ({ byId: vi.fn(), favorites: vi.fn(), gateway: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../eVe/intuition/tools/tv_catalog_client.js', () => ({ readTvChannelsById: tv.byId }));
vi.mock('../../eVe/intuition/tools/tv_favorites_preference.js', () => ({ loadTvFavorites: tv.favorites }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: tv.gateway }));
vi.mock('../../eVe/domains/dashboard/dashboard_contact_items.js', async (importOriginal) => ({
    ...(await importOriginal()), waitForPublishedFavorites: async () => true }));

test('eVe Basic composes the same home and hides every other tile without changing the legacy homes', () => {
    expect(normalizeDashboardStyle('eve_basic')).toBe('eve_basic');
    expect(resolveHomeTemplateKey({ style: 'eve_basic' })).toBe(resolveHomeTemplateKey({ style: 'eve' }));
    expect(resolveHomeTemplateKey({ style: 'basic' })).toBe('dashboard_basic');
    expect(resolveHomeTemplateKey({ style: 'pro' })).toBe('');
    const refs = [...DASHBOARD_HOME_VARIANTS.dashboard_eve.tileRefs, 'atom', 'clock', 'weather', 'search'];
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { mode: 'solo', basic: true }))).toEqual(['atom']);
    expect(refs.filter(ref => dashboardEveHomeCellVisible(ref, { basic: true })).sort()).toEqual(
        ['objectives', 'contacts', 'next_event', 'monitor_0', 'atom', 'clock', 'weather', 'search'].sort());
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

test('a slow provider cannot delay its root tile or other providers', async () => {
    const command = vi.fn(() => new Promise(() => {}));
    const root = await createMusicMysticItem({ provider: 'spotify', supported: () => true, makeItem: input => input, command });
    expect(root.key).toBe('fun_spotify'); expect(command).not.toHaveBeenCalled();
    void root.loadChildren(); expect(command).toHaveBeenCalledWith('music.get_state', { provider: 'spotify' });
});

test('the TV rubric lists only the favourites, with fresh streams, then the tile that opens the TV selector', async () => {
    tv.favorites.mockResolvedValue([{ id: 'BFMTV.fr', name: 'BFM TV', country: 'FR', logo: 'stored.png' },
        { id: 'gone.fr', name: 'Gone', country: 'FR', logo: '' }]);
    tv.byId.mockResolvedValue([{ id: 'BFMTV.fr', name: 'BFM TV', logo: 'fresh.png', streams: [{ url: 'https://live' }] }]);
    const stage = createDashboardMysticStage({ projectId: 'home', readStageRect: () => null, readLastProjectId: async () => '' });
    const items = await stage.funItems();
    expect(items.map(item => item.key)).toEqual(expect.arrayContaining(['fun_tv', 'fun_youtube', 'fun_spotify', 'fun_deezer']));
    const rubric = items.find(item => item.key === 'fun_tv');
    expect(tv.byId).toHaveBeenCalledWith(['BFMTV.fr', 'gone.fr']);
    expect(rubric.children.map(item => item.key)).toEqual(['tv_BFMTV.fr', 'tv_gone.fr', 'add_tv_channel']);
    expect((await rubric.loadChildren()).map(item => item.key)).toEqual(['tv_BFMTV.fr', 'tv_gone.fr', 'add_tv_channel']);
    const add = rubric.children.at(-1);
    expect(add.closeOnSelect).not.toBe(false);
    await add.onSelect();
    expect(tv.gateway).toHaveBeenCalledWith(expect.objectContaining({ tool_id: 'ui.tv', action: 'pointer.click' }));
});

test('an emptied favourite list leaves only the add tile', async () => {
    tv.favorites.mockResolvedValue([]); tv.byId.mockResolvedValue([]);
    const stage = createDashboardMysticStage({ projectId: 'home', readStageRect: () => null, readLastProjectId: async () => '' });
    const rubric = (await stage.funItems()).find(item => item.key === 'fun_tv');
    expect(rubric.children.map(item => item.key)).toEqual(['add_tv_channel']);
});
