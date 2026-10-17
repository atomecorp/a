import { test, expect, vi } from 'vitest';
import { dashboardAtomNeighbours, dashboardEveHomeCellVisible, dashboardHomeCell, dashboardMysticCellRef, DASHBOARD_HOME_VARIANTS } from '../../eVe/domains/dashboard/dashboard_mystic_grid.js';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { resolveHomeTemplateKey, takeDashboardEveEntry, rememberDashboardConnection, forgetDashboardEveEntry, rememberDashboardEveMode } from '../../eVe/domains/dashboard/dashboard_home_style.js';
import { eveAtomBreath } from '../../eVe/domains/dashboard/dashboard_eve_tokens.js';
import { normalizeDashboardStyle } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
import { createMusicMysticItem } from '../../eVe/domains/music/music_mystic_items.js';
import { createDashboardMysticStage } from '../../eVe/domains/dashboard/dashboard_mystic_stage.js';

const tv = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../eVe/intuition/tools/tv_catalog_client.js', () => ({ readTvChannels: tv.read }));
vi.mock('../../eVe/intuition/tools/tv.js', () => ({ defaultCountry: () => 'FR' }));
vi.mock('../../eVe/intuition/tools/tv_favorites_preference.js', () => ({ readTvFavorites: () => [] }));

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

test('the entertainment root does not await the TV catalog; only the TV selection loads it', async () => {
    let finish; tv.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const stage = createDashboardMysticStage({ projectId: 'home', readStageRect: () => null, readLastProjectId: async () => '' });
    const items = await stage.funItems();
    expect(tv.read).not.toHaveBeenCalled();
    expect(items.map(item => item.key)).toEqual(expect.arrayContaining(['fun_tv', 'fun_youtube', 'fun_spotify', 'fun_deezer']));
    const loading = items.find(item => item.key === 'fun_tv').loadChildren();
    await vi.waitFor(() => expect(tv.read).toHaveBeenCalledWith('FR'));
    finish([{ id: 'one', name: 'Available channel' }]);
    expect((await loading)[0].key).toBe('tv_one');
});
