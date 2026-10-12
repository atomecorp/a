import { expect, test, vi } from 'vitest';
import { civilDayRange } from '../../atome/src/squirrel/health/health_values.js';
import { healthHistoryRanges } from '../../atome/src/squirrel/health/health_history.js';
import { historyGraphNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_history_graph.js';
import { buildHealthDetailContent } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_health_detail_view.js';

const panels = vi.hoisted(() => ({ definition: null, refresh: vi.fn() }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    registerBevyPanelSurface: definition => { panels.definition = definition; }, refreshBevyPanelSurface: panels.refresh,
    bevyPanelRuntimeState: { mounted: new Map() }, getPanelRuntime: vi.fn(), treeIdFor: key => `eve_bevy_panel_${key}`,
    openBevyPanelSurface: vi.fn(), closeBevyPanelSurface: vi.fn()
}));
vi.mock('../../atome/src/squirrel/health/index.js', () => ({ getHealthOwner: () => null }));
const { createHealthDetailPanel } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_health_detail_runtime.js');
const { createDashboardHitActivation } = await import('../../eVe/domains/dashboard/dashboard_bevy_ui_action_handlers.js');
const now = new Date(2026, 9, 11, 12).getTime();
const walk = node => [node, ...(node.children || []).flatMap(walk)];
const text = nodes => nodes.flatMap(walk).filter(node => node.text).map(node => node.text).join('\n');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup({ deferred = false, at = now } = {}) {
    let changed, reading, resolve;
    const owner = { subscribe: (_id, listener) => { reading = listener; listener({ state: 'loading' }); return vi.fn(); },
        onAccessChange: listener => { changed = listener; return vi.fn(); },
        readHistory: vi.fn(async (id, { from, to, detail }) => {
            if (deferred) return new Promise(r => { resolve = r; });
            const ranges = healthHistoryRanges(from, to);
            return { ok: true, days: ranges.map(range => ({ range,
                reading: { state: 'value', value: 60, measuredTo: range.from + 1000, unit: 'bpm' },
                statistics: { count: 1, min: 60, max: 60, mean: 60 },
                points: detail && id === 'heart_rate' ? [{ start: range.from + 1000, end: range.from + 1000, value: 60 }] : [], bands: [] })) };
        }) };
    const presenter = { open: vi.fn(async () => { panels.definition.onOpen(); return { ok: true }; }),
        close: vi.fn(async () => { panels.definition.onClose(); return { ok: true }; }) };
    const panel = createHealthDetailPanel({ owner, now: () => at, locale: () => 'fr-FR', presentation: presenter });
    return { panel, owner, presenter, changed: () => changed(), reading: value => reading(value), resolve: value => resolve(value) };
}

test('a reusable standard detail panel shows 30 days and native metrics without changing selection', async () => {
    const { panel, owner, presenter } = setup();
    const rect = { x: 200, y: 200, width: 60, height: 60 };
    await panel.open('heart_rate', { rect }); await settle();
    expect(presenter.open).toHaveBeenCalledWith({ rect, context: {} });
    expect(panel.state.days).toHaveLength(30);
    expect(panel.state.detail.points).toHaveLength(1);
    const snapshot = panels.definition.readState();
    const content = panels.definition.buildContent(snapshot, { emit: () => {}, bodyWidth: 300 });
    expect(content.flatMap(walk).some(node => node.id === 'health_detail_graph')).toBe(true);
    expect(text(content)).toMatch(/60 bpm/);
    expect(text(content)).toMatch(/Moyenne|mean/i);
    expect(owner.readHistory.mock.calls.some(([id]) => id === 'workout_duration')).toBe(true);
    await panels.definition.handleEvent({ type: 'health.detail.previous' });
    expect(panel.state.day).toBe(civilDayRange(now - 86400000).from);
    await panel.close(); expect(panel.state.days).toEqual([]); expect(panel.isOpen()).toBe(false);
});

test('account/access changes immediately purge historical measures before a pending reply', async () => {
    const context = setup(); await context.panel.open('heart_rate'); await settle();
    expect(context.panel.state.days.some(day => day.reading.state === 'value')).toBe(true);
    context.owner.readHistory.mockImplementation(() => new Promise(() => {}));
    context.changed();
    expect(context.panel.state.days.every(day => day.reading.state === 'loading')).toBe(true);
    expect(context.panel.state.detail).toBeNull();
    expect(context.panel.state.currentReading).toBeNull();
    context.reading({ state: 'unsupported' });
    expect(context.panel.state.days).toEqual([]);
    expect(context.panel.state.status).toBe('unsupported');
    await context.panel.close({ animate: false });
});

test('closing a pending detail discards its late reply and leaves no measures retained', async () => {
    const context = setup({ deferred: true }); await context.panel.open('heart_rate'); await settle();
    await context.panel.close(); context.resolve({ ok: true, days: [{ reading: { state: 'value', value: 99 } }] }); await settle();
    expect(context.panel.state.days).toEqual([]);
    expect(context.panel.state.detail).toBeNull();
});

test('closing before the shell finishes mounting cannot reopen a stale monitor', async () => {
    const context = setup(); let resolve;
    context.presenter.open.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = context.panel.open('heart_rate');
    await context.panel.close({ animate: false });
    resolve({ ok: true });
    expect(await pending).toMatchObject({ superseded: true });
    expect(context.owner.readHistory).not.toHaveBeenCalled();
    expect(context.panel.isOpen()).toBe(false);
});

test('an opening exactly at midnight retains today without requesting a zero interval', async () => {
    const context = setup({ at: civilDayRange(now).from });
    await context.panel.open('heart_rate'); await settle();
    expect(context.panel.state.days).toHaveLength(30);
    expect(context.panel.state.days.at(-1).reading.state).toBe('no_data');
    expect(context.owner.readHistory.mock.calls.every(([_id, range]) => range.to > range.from)).toBe(true);
    await context.panel.close();
});

test('a direct session sensor shows its actual current value without inventing history', async () => {
    const context = setup();
    context.owner.subscribe = (_id, listener) => { listener({ state: 'value', value: 120, measuredTo: now }); return () => {}; };
    context.owner.readHistory.mockResolvedValue({ ok: false, error: 'health_history_unavailable' });
    await context.panel.open('device_steps_session'); await settle();
    const content = panels.definition.buildContent(panels.definition.readState(), { emit: () => {}, bodyWidth: 300 });
    expect(text(content)).toContain('120');
    expect(context.panel.state.days.every(day => day.reading.state === 'unavailable')).toBe(true);
    await context.panel.close();
});

test('graph places unequal time intervals proportionally, preserves gaps and shares native nodes', () => {
    const graph = historyGraphNode({ id: 'graph', width: 400, from: 0, to: 10000, locale: 'fr-FR',
        maxGapMs: 1000, series: [{ points: [{ at: 100, value: 60 }, { at: 200, value: 80 }, { at: 9000, value: 70 }] }] });
    const points = graph.children.filter(node => node.id.includes('_point_'));
    expect(points[2].style.position[0] - points[1].style.position[0]).toBeGreaterThan((points[1].style.position[0] - points[0].style.position[0]) * 50);
    expect(graph.children.filter(node => node.id.includes('_line_'))).toHaveLength(1);
    expect(walk(graph).every(node => ['panel', 'text', 'divider'].includes(node.kind))).toBe(true);
    const interrupted = historyGraphNode({ id: 'gap', width: 400, from: 0, to: 1000,
        series: [{ points: [{ at: 100, value: 60 }, { at: 200, value: null }, { at: 300, value: 70 }] }] });
    expect(interrupted.children.filter(node => node.id.includes('_line_'))).toHaveLength(0);
});

test('sleep detail exposes phases and durations without a fabricated quality score', () => {
    const range = { from: now - 86400000, to: now };
    const day = { range, reading: { state: 'value', value: { semantics: 'asleep', minutes: 400, stages: { asleep_deep: 100, asleep_rem: 120 }, awakeMinutes: 20 },
        measuredTo: now - 1000 } };
    const nodes = buildHealthDetailContent({ monitorId: 'sleep', locale: 'fr-FR', day: range.from, today: civilDayRange(now).from,
        status: 'value', days: [day], detail: { points: [], bands: [{ start: range.from, end: now, stage: 'asleep_deep' }] } }, { emit: () => {}, bodyWidth: 300 });
    expect(text(nodes)).toMatch(/Profond/); expect(text(nodes)).toMatch(/Paradoxal/); expect(text(nodes)).toMatch(/25 %/);
    expect(text(nodes)).not.toMatch(/score|excellent|mauvais/i);
});

test('daily totals draw measured interval bars and recorded progression while missing bins stay empty', () => {
    const range = { from: 1000, to: 4 * 3600000 + 1000 };
    const nodes = buildHealthDetailContent({ monitorId: 'steps', locale: 'fr-FR', day: range.from, today: range.from,
        status: 'value', days: [{ range, reading: { state: 'value', value: 170, period: range } }],
        detail: { bands: [], points: [{ start: range.from, end: range.from + 3600000, value: 120 },
            { start: range.from + 3 * 3600000, end: range.to, value: 50 }] } }, { emit: () => {}, bodyWidth: 300 });
    const graph = nodes.find(node => node.id === 'health_detail_graph');
    expect(graph.children.filter(node => node.id.includes('_bar_'))).toHaveLength(2);
    expect(graph.children.filter(node => node.id.includes('_1_line_'))).toHaveLength(0);
    const progression = graph.children.filter(node => node.id.includes('_1_point_'));
    expect(progression[1].style.position[1]).toBeLessThan(progression[0].style.position[1]);
    expect(text(nodes)).toContain('Cumul mesuré');
});

test('a lateral rubric closes the detail before selecting it; Nouveau retains its selector path', async () => {
    const calls = [];
    const state = { active: true, workspaceOpening: false, layout: {} };
    const activate = createDashboardHitActivation({ state, isInteractivePresented: () => true,
        healthModules: { isDetailOpen: () => true, closeDetail: async () => calls.push('close') },
        headerZoneForHit: () => 'filter', clearCategoryFilter: () => calls.push('clear'),
        toggleCategoryFilter: id => calls.push(id), activateCategory: id => calls.push('new_' + id) });
    await activate({ kind: 'header', category: { id: 'monitor' } });
    expect(calls).toEqual(['close', 'clear', 'monitor']);
});
