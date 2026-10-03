import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const panels = vi.hoisted(() => ({ definitions: new Map(), open: new Set(),
    state: { mounted: new Map(), geometryBySurfaceKey: new Map(), detachedSurfaceKeys: new Set() } }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    bevyPanelRuntimeState: panels.state,
    registerBevyPanelSurface: definition => panels.definitions.set(definition.surfaceKey, definition),
    isBevyPanelSurfaceOpen: key => panels.open.has(key), refreshBevyPanelSurface() {},
    openBevyPanelSurface: async key => { panels.open.add(key); panels.state.mounted.set(key, {}); return { ok: true }; },
    closeBevyPanelSurface: async key => { panels.open.delete(key); panels.state.mounted.delete(key); await panels.definitions.get(key)?.onClose?.(); return { ok: true }; }
}));
vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({ currentProjectId: () => 'project' }));
vi.mock('../../eVe/intuition/runtime/selection.js', () => ({ getCurrentSelectionIds: () => [], applySelectionIntent() {} }));
vi.mock('../../eVe/intuition/ribbon/bevy_ui_product_registry.js', () => ({ getMainMenuRuntime: () => null }));
import { createYoutubeToolRuntime } from '../../eVe/intuition/tools/youtube_tool_runtime.js';
const setup = (withApi = true) => {
    panels.open.clear(); panels.state.mounted.clear(); panels.state.geometryBySurfaceKey.set('youtube_viewer', { x: 0, y: 0, width: 560, height: 360 });
    const win = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: 'http://127.0.0.1:3001' }).window;
    win.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600 });
    const frames = new Map(); let seq = 0; const players = [];
    win.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; }; win.cancelAnimationFrame = id => frames.delete(id);
    const tick = () => { const current = [...frames]; frames.clear(); for (const [, fn] of current) fn(); };
    const YT = { Player: class {
        constructor(iframe, config) { this.iframe = iframe; this.events = config.events; this.plays = 0; this.destroyed = false; players.push(this); }
        playVideo() { this.plays++; }
        pauseVideo() { this.paused = true; }
        stopVideo() { this.stopped = true; }
        destroy() { this.destroyed = true; }
        getPlayerState() { return this.plays ? 1 : 2; }
    } };
    if (withApi) win.YT = YT;
    const runtime = createYoutubeToolRuntime({ win, commit: async () => ({ ok: true }) });
    const choose = () => runtime.selectResult({ id: 'abcDEFghi12', name: 'Provider fixture' }, 'video');
    return { win, frames, players, runtime, choose, tick, YT };
};
test('YouTube configures iframe identity before use and starts only after readiness and visibility', async () => {
    const { win, players, choose, tick, runtime, frames } = setup();
    await choose(); const player = players[0];
    expect(player.iframe.referrerPolicy).toBe('strict-origin-when-cross-origin');
    expect(new URL(player.iframe.src).searchParams.get('origin')).toBe(win.location.origin);
    tick(); expect(player.plays).toBe(0);
    player.events.onReady(); panels.state.mounted.set('other', {}); tick(); expect(player.plays).toBe(0);
    panels.state.mounted.delete('other'); tick(); expect(player.plays).toBe(1);
    player.events.onAutoplayBlocked(); tick(); expect(player.iframe.parentElement.style.visibility).toBe('visible');
    expect(runtime.transport('play').ok).toBe(true); expect(player.plays).toBe(2);
    await runtime.setActive(false); expect(player.destroyed).toBe(true); expect(player.stopped).toBe(true);
    expect(win.document.querySelector('iframe')).toBeNull(); expect(frames.size).toBe(0);
    player.events.onReady(); player.events.onError({ data: 153 }); expect(win.document.querySelector('iframe')).toBeNull();
    win.close();
});
test('closing while the IFrame API loads cannot resurrect the player', async () => {
    const { win, players, choose, runtime, frames, YT } = setup(false);
    const pending = choose(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(win.document.head.querySelector('script').src).toBe('https://www.youtube.com/iframe_api');
    await runtime.setActive(false); win.YT = YT; win.onYouTubeIframeAPIReady(); await pending;
    expect(players).toHaveLength(0); expect(frames.size).toBe(0); expect(win.document.querySelector('iframe')).toBeNull();
    win.close();
});

test('a selection commit completing after close cannot reopen the viewer', async () => {
    const { win, players } = setup(); let finish;
    const runtime = createYoutubeToolRuntime({ win, commit: () => new Promise(resolve => { finish = resolve; }) });
    const pending = runtime.selectResult({ id: 'abcDEFghi12', name: 'Provider fixture' }, 'video');
    await runtime.setActive(false); finish({ ok: true });
    expect((await pending).error).toBe('CANCELLED'); expect(players).toHaveLength(0); expect(panels.open.size).toBe(0);
    win.close();
});
