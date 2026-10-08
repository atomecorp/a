import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const panels = vi.hoisted(() => ({ open: new Set(),
    state: { mounted: new Map(), geometryBySurfaceKey: new Map(), detachedSurfaceKeys: new Set() } }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    bevyPanelRuntimeState: panels.state,
    isBevyPanelSurfaceOpen: key => panels.open.has(key), refreshBevyPanelSurface() {}
}));
vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({ currentProjectId: () => 'project' }));
vi.mock('../../eVe/intuition/runtime/selection.js', () => ({ getCurrentSelectionIds: () => [], applySelectionIntent() {} }));
vi.mock('../../eVe/intuition/ribbon/bevy_ui_product_registry.js', () => ({ getMainMenuRuntime: () => null }));
import { createYoutubeToolRuntime, resolveYoutubePlayerHost } from '../../eVe/intuition/tools/youtube_tool_runtime.js';

const HOST = 'https://player.test';
const setup = ({ commit = async () => ({ ok: true }) } = {}) => {
    panels.open.clear(); panels.state.mounted.clear(); panels.state.geometryBySurfaceKey.clear();
    const win = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: 'http://127.0.0.1:3001' }).window;
    win.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 10, top: 20, width: 900, height: 600 });
    const frames = new Map(); let seq = 0;
    win.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; }; win.cancelAnimationFrame = id => frames.delete(id);
    const tick = () => { const current = [...frames]; frames.clear(); for (const [, fn] of current) fn(); };
    let placement = { left: 110, top: 70, width: 480, height: 270, rotation: 0 };
    const notices = []; const history = [];
    const runtime = createYoutubeToolRuntime({ win, commit,
        readCurrent: async id => ({ id, properties: { media_source: 'youtube', youtube_video_id: 'abcDEFghi12', youtube_title: 'Saved' } }),
        playerHost: () => HOST, loadPlacement: async () => () => placement,
        notify: message => notices.push(message), recordHistory: entry => history.push(entry) });
    const iframe = () => win.document.querySelector('iframe');
    const posted = [];
    const fromHost = (payload) => win.dispatchEvent(new win.MessageEvent('message', { origin: HOST,
        source: iframe().contentWindow, data: { source: 'eve-youtube-player', videoId: 'abcDEFghi12', ...payload } }));
    const watchCommands = () => { iframe().contentWindow.postMessage = (message, origin) => posted.push({ ...message, origin }); };
    return { win, frames, tick, runtime, iframe, fromHost, watchCommands, posted, notices, history,
        movePlacement: next => { placement = next; } };
};

test('the player host is reached from an origin YouTube can identify', () => {
    expect(resolveYoutubePlayerHost('https://atome.one')).toBe('https://atome.one');
    expect(resolveYoutubePlayerHost('http://127.0.0.1:3001')).toBe('http://localhost:3001');
    expect(resolveYoutubePlayerHost('http://localhost:3001/x')).toBe('http://localhost:3001');
    expect(resolveYoutubePlayerHost('http://192.168.1.4:3001')).toBe('');
    expect(resolveYoutubePlayerHost('atome://app')).toBe('');
});

test('a chosen video plays in place over its Atome, through the host page, and follows it', async () => {
    const { win, tick, runtime, iframe, fromHost, watchCommands, posted, history, movePlacement } = setup();
    const result = await runtime.selectResult({ id: 'abcDEFghi12', name: 'Video', channel: 'C', thumbnail: 'https://i.ytimg.com/t.jpg' }, 'video');
    expect(result.ok).toBe(true);
    expect(iframe().src).toBe(`${HOST}/eve_youtube_player.html?v=abcDEFghi12`);
    watchCommands(); tick();
    // Clipped to the canvas, laid over the Atome, never taking pointer input.
    const root = iframe().parentElement;
    expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual(['10px', '20px', '900px', '600px']);
    expect([iframe().style.left, iframe().style.top, iframe().style.width, iframe().style.height]).toEqual(['100px', '50px', '480px', '270px']);
    expect(iframe().style.visibility).toBe('visible');
    expect(iframe().style.pointerEvents).toBe('none');
    // Plays once the host's player is ready; history only after it really plays.
    fromHost({ type: 'ready', state: -1, time: 0 });
    expect(posted.at(-1)).toMatchObject({ target: 'eve-youtube-player', command: 'play', origin: HOST });
    expect(history).toHaveLength(0);
    fromHost({ type: 'state', state: 1, time: 0.5 });
    expect(runtime.playerState()).toBe(1); expect(history.map(entry => entry.videoId)).toEqual(['abcDEFghi12']);
    // Moving the Atome moves the player; a panel over it hides it.
    movePlacement({ left: 210, top: 120, width: 240, height: 135, rotation: 15 }); tick();
    expect([iframe().style.left, iframe().style.width, iframe().style.transform]).toEqual(['200px', '240px', 'rotate(15deg)']);
    panels.state.mounted.set('finder', {}); panels.state.geometryBySurfaceKey.set('finder', { x: 150, y: 80, width: 300, height: 300 }); tick();
    expect(iframe().style.visibility).toBe('hidden');
    panels.state.mounted.delete('finder'); tick(); expect(iframe().style.visibility).toBe('visible');
    // Media reader transport.
    expect((await runtime.transport('toggle', 'video')).action).toBe('pause');
    expect(posted.at(-1).command).toBe('pause');
    // A foreign message is ignored.
    win.dispatchEvent(new win.MessageEvent('message', { origin: 'https://evil.test', source: iframe().contentWindow,
        data: { source: 'eve-youtube-player', videoId: 'abcDEFghi12', type: 'state', state: 5 } }));
    expect(runtime.playerState()).toBe(1);
    win.close();
});

test('an idle YouTube Atome starts in place from the media reader Play', async () => {
    const { runtime, iframe, fromHost, watchCommands, posted } = setup();
    expect(await runtime.handlesAtomeId('video')).toBe(true);
    expect((await runtime.transport('pause', 'video')).handled).toBe(true);
    expect(iframe()).toBeNull();
    const played = await runtime.transport('toggle', 'video');
    expect(played).toMatchObject({ ok: true, handled: true, action: 'play' });
    watchCommands(); fromHost({ type: 'ready' });
    expect(posted.at(-1).command).toBe('play');
});

test('iOS gesture requirement hands the next tap to the player; errors dispose it with a notice', async () => {
    const { tick, runtime, iframe, fromHost, notices, frames } = setup();
    await runtime.transport('play', 'video'); tick();
    fromHost({ type: 'autoplay_blocked', state: -1 }); tick();
    expect(iframe().style.pointerEvents).toBe('auto');
    fromHost({ type: 'state', state: 1 }); tick();
    expect(iframe().style.pointerEvents).toBe('none');
    fromHost({ type: 'error', code: 150 });
    expect(iframe()).toBeNull(); expect(frames.size).toBe(0);
    expect(notices).toHaveLength(1);
});

test('closing removes the player, its frame loop and its listener; a late commit cannot reopen it', async () => {
    let finish;
    const { win, runtime, iframe, frames } = setup({ commit: () => new Promise(resolve => { finish = resolve; }) });
    const pending = runtime.selectResult({ id: 'abcDEFghi12', name: 'Video' }, 'video');
    await runtime.setActive(false); finish({ ok: true });
    expect((await pending).error).toBe('CANCELLED');
    expect(iframe()).toBeNull(); expect(frames.size).toBe(0);
    await runtime.transport('play', 'video');
    expect(win.document.querySelectorAll('iframe')).toHaveLength(1);
    await runtime.setActive(false);
    expect(iframe()).toBeNull(); expect(frames.size).toBe(0);
    win.close();
});
