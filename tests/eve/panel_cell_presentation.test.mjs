import { beforeEach, expect, test, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ mounted: new Map(), motion: vi.fn(), opacity: vi.fn(), onFrame: null, time: 0,
    geometry: { x: 100, y: 20, width: 600, height: 500 } }));
vi.mock('../../eVe/domains/rendering/animation_frame_runtime.js', () => ({ waitAnimationFrame: async () => {
    fixture.time += 80; fixture.onFrame?.();
} }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    treeIdFor: key => `eve_bevy_panel_${key}`,
    bevyPanelRuntimeState: { mounted: fixture.mounted },
    getPanelRuntime: () => ({ updateTreeMotion: fixture.motion, setTreeOpacity: fixture.opacity }),
    openBevyPanelSurface: async key => { fixture.mounted.set(key, { projectedGeometry: fixture.geometry }); return { ok: true }; },
    closeBevyPanelSurface: async key => { fixture.mounted.delete(key); return { ok: true }; }
}));
const { createPanelCellPresentation } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_cell_presentation.js');
beforeEach(() => {
    fixture.mounted.clear(); fixture.motion.mockReset().mockResolvedValue({ ok: true }); fixture.opacity.mockReset().mockResolvedValue({ ok: true });
    fixture.time = 0; fixture.onFrame = null;
    vi.spyOn(performance, 'now').mockImplementation(() => fixture.time);
});
const cell = { x: 380, y: 400, width: 60, height: 60 };

test('reduced motion opens and closes the same panel without interpolated frames', async () => {
    const presenter = createPanelCellPresentation('quiet', { reducedMotion: () => true });
    await presenter.open({ rect: cell });
    expect(fixture.motion).not.toHaveBeenCalled();
    expect(fixture.opacity.mock.calls.at(-1)[0].opacity).toBe(1);
    await presenter.close(); expect(fixture.motion).not.toHaveBeenCalled();
    expect(fixture.mounted.size).toBe(0);
});

test('cell expansion reaches the standard shell, then reveals its content and collapses to its source', async () => {
    const presenter = createPanelCellPresentation('fixture');
    expect(await presenter.open({ rect: cell })).toMatchObject({ ok: true, superseded: false });
    const frames = fixture.motion.mock.calls.map(([input]) => input.updates[0]);
    expect(frames[0].scale[0]).toBeLessThan(1);
    expect(frames.at(-1)).toMatchObject({ position: [100, 20], scale: [1, 1], opacity: 1, origin: [0, 0] });
    expect(fixture.opacity.mock.calls.at(-1)[0].opacity).toBe(1);
    await presenter.close();
    const last = fixture.motion.mock.calls.at(-1)[0].updates[0];
    expect(last.position).toEqual([cell.x, cell.y]);
    expect(last.scale).toEqual([cell.width / fixture.geometry.width, cell.height / fixture.geometry.height]);
    expect(fixture.mounted.size).toBe(0);
});

test('a superseding action cancels expansion and cannot revive the old content', async () => {
    const presenter = createPanelCellPresentation('fixture');
    fixture.onFrame = () => { fixture.onFrame = null; presenter.cancel(); };
    expect(await presenter.open({ rect: cell })).toMatchObject({ superseded: true });
    expect(fixture.opacity.mock.calls.some(([input]) => input.opacity === 1)).toBe(false);
    await presenter.close({ animate: false });
    expect(fixture.mounted.size).toBe(0);
});

test('a reusable panel without a cell source opens normally without guessing a rectangle', async () => {
    const presenter = createPanelCellPresentation('elsewhere');
    await presenter.open(); expect(fixture.motion).not.toHaveBeenCalled();
    expect(fixture.opacity.mock.calls.at(-1)[0].opacity).toBe(1);
    await presenter.close(); expect(fixture.mounted.size).toBe(0);
});

test('resizing during expansion uses the current standard geometry and collapse follows the current cell', async () => {
    const presenter = createPanelCellPresentation('resizing');
    fixture.onFrame = () => { fixture.mounted.get('resizing').projectedGeometry = { x: 200, y: 40, width: 300, height: 450 }; };
    await presenter.open({ rect: cell });
    expect(fixture.motion.mock.calls.at(-1)[0].updates[0]).toMatchObject({ position: [200, 40], scale: [1, 1] });
    const moved = { x: 300, y: 380, width: 80, height: 80 };
    await presenter.close({ readRect: () => moved });
    expect(fixture.motion.mock.calls.at(-1)[0].updates[0]).toMatchObject({ position: [300, 380], scale: [80 / 300, 80 / 450] });
});

test('reversing an unfinished expansion collapses from its actual frame without jumping to full size', async () => {
    const presenter = createPanelCellPresentation('reversing'); let closing;
    fixture.onFrame = () => {
        if (fixture.time < 160) return;
        fixture.onFrame = null; closing = presenter.close();
    };
    expect(await presenter.open({ rect: cell })).toMatchObject({ superseded: true });
    await closing;
    const widths = fixture.motion.mock.calls.map(([input]) => input.updates[0].scale[0]);
    expect(widths.slice(1).every(width => width <= widths[0])).toBe(true);
    expect(fixture.mounted.size).toBe(0);
});
