import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const panels = vi.hoisted(() => ({ open: new Set(),
    state: { mounted: new Map(), geometryBySurfaceKey: new Map(), detachedSurfaceKeys: new Set() } }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    bevyPanelRuntimeState: panels.state,
    isBevyPanelSurfaceOpen: key => panels.open.has(key), refreshBevyPanelSurface() {}, treeIdFor: key => `panel_${key}`
}));
vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({ currentProjectId: () => 'project' }));
// The scene only receives re-projections (the Atome becomes / stops being a media window).
const scene = vi.hoisted(() => ({ reprojected: [], records: [] }));
vi.mock('../../eVe/domains/rendering/project_scene_runtime.js', () => ({
    updateProjectSceneRecordByAtomeId: async ({ atomeId }) => { scene.reprojected.push(atomeId); },
    updateProjectSceneRecords: async (input) => { scene.records.push(input); },
    readProjectSceneAtomClientPlacement: () => null
}));
import { isInPlaceMediaWindowOpen } from '../../eVe/domains/media/inplace_media_window.js';
import { getSelectedProjectMediaPlayback, stopSelectedProjectMediaPlayback } from '../../eVe/domains/media/selected_project_media_playback_state.js';
const surface = vi.hoisted(() => ({ layers: new Map() }));
vi.mock('../../eVe/domains/rendering/surface_runtime.js', () => ({
    subscribeRenderSurfaceSize: () => () => {},
    setRenderSurfaceInteractionInterceptorLayer: (zone, key, interceptor) => {
        if (interceptor) surface.layers.set(key, interceptor); else surface.layers.delete(key);
    }
}));
vi.mock('../../eVe/intuition/runtime/selection.js', () => ({ getCurrentSelectionIds: () => [], applySelectionIntent() {} }));
vi.mock('../../eVe/intuition/ribbon/bevy_ui_product_registry.js', async (importOriginal) => ({
    ...await importOriginal(), getMainMenuRuntime: () => null
}));
import { createYoutubeToolRuntime, resolveYoutubePlayerHost } from '../../eVe/intuition/tools/youtube_tool_runtime.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { BEVY_MAIN_MENU_TREE_ID } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { suspendGestureChrome, restoreGestureChrome } from '../../eVe/domains/rendering/gesture_chrome_suspension.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';

const HOST = 'https://player.test';
const setup = ({ commit = async () => ({ ok: true }), menuOpacity = 1 } = {}) => {
    panels.open.clear(); panels.state.mounted.clear(); panels.state.geometryBySurfaceKey.clear();
    const win = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: 'http://127.0.0.1:3001' }).window;
    win.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 10, top: 20, width: 900, height: 600 });
    const frames = new Map(); let seq = 0;
    win.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; }; win.cancelAnimationFrame = id => frames.delete(id);
    const tick = () => { const current = [...frames]; frames.clear(); for (const [, fn] of current) fn(); };
    const menu = createEveBevyUiRuntime({ overlayProjector: { project: async () => [] } });
    win.eveBevyUiRuntime = menu;
    const menuReady = menu.mountTree({ id: BEVY_MAIN_MENU_TREE_ID, opacity: menuOpacity, surface: win.document.querySelector('canvas'),
        tree: { root: { id: 'menu_tool', kind: 'button', style: { position: [0, 0], size: [60, 60] },
            on: { activate() {} }, children: [] } } });
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
    return { win, frames, tick, runtime, iframe, fromHost, watchCommands, posted, notices, history, menu, menuReady,
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
    // Under the canvas (z-index -1), over the Atome's rectangle, never taking pointer input;
    // the Atome is cut out of the canvas while it plays.
    const root = iframe().parentElement;
    expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual(['10px', '20px', '900px', '600px']);
    expect(root.style.zIndex).toBe('-1');
    expect(isInPlaceMediaWindowOpen('video')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(scene.reprojected).toContain('video');
    expect([iframe().style.left, iframe().style.top, iframe().style.width, iframe().style.height]).toEqual(['100px', '50px', '480px', '270px']);
    expect(iframe().style.visibility).toBe('visible');
    expect(iframe().style.pointerEvents).toBe('none');
    // Plays once the host's player is ready; history only after it really plays.
    fromHost({ type: 'ready', state: -1, time: 0 });
    expect(posted.at(-1)).toMatchObject({ target: 'eve-youtube-player', command: 'play', origin: HOST });
    expect(history).toHaveLength(0);
    fromHost({ type: 'state', state: 1, time: 0.5 });
    expect(runtime.playerState()).toBe(1); expect(history.map(entry => entry.videoId)).toEqual(['abcDEFghi12']);
    // Moving the Atome moves the player; a panel is drawn OVER the cut-out, so the player stays shown.
    movePlacement({ left: 210, top: 120, width: 240, height: 135, rotation: 15 }); tick();
    expect([iframe().style.left, iframe().style.width, iframe().style.transform]).toEqual(['200px', '240px', 'rotate(15deg)']);
    panels.state.mounted.set('finder', {}); panels.state.geometryBySurfaceKey.set('finder', { x: 150, y: 80, width: 300, height: 300 }); tick();
    expect(iframe().style.visibility).toBe('visible');
    panels.state.mounted.delete('finder');
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
    // Lifted above the canvas for the user's tap only.
    expect([iframe().style.pointerEvents, iframe().parentElement.style.zIndex]).toEqual(['auto', '1']);
    fromHost({ type: 'state', state: 1 }); tick();
    expect([iframe().style.pointerEvents, iframe().parentElement.style.zIndex]).toEqual(['none', '-1']);
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
    expect(isInPlaceMediaWindowOpen('video')).toBe(false);
    win.close();
});

test('a double tap on the playing Atome toggles fullscreen; the gesture layer goes with the player', async () => {
    const { runtime, tick } = setup();
    await runtime.transport('play', 'video'); tick();
    await new Promise(resolve => setTimeout(resolve, 30));
    const layer = surface.layers.get('inplace_media_window:video');
    expect(typeof layer).toBe('function');
    expect(layer({ phase: 'double_click', target: { id: 'other' } })).toBe(false);
    expect(layer({ phase: 'press', target: { id: 'video' } })).toBe(false);
    expect(layer({ phase: 'double_click', target: { id: 'video' } })).toEqual({ handled: true });
    expect(runtime.isFullscreen()).toBe(true);
    // In fullscreen the cut-out covers everything: a double tap anywhere leaves it.
    expect(layer({ phase: 'double_click', target: null })).toEqual({ handled: true });
    expect(runtime.isFullscreen()).toBe(false);
    await runtime.setActive(false);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(surface.layers.has('inplace_media_window:video')).toBe(false);
});

test('fullscreen cuts the whole canvas out on the top project layer, and restores it', async () => {
    const { runtime, tick, iframe } = setup();
    await runtime.transport('play', 'video'); tick();
    scene.records.length = 0;
    runtime.toggleFullscreen(); tick();
    await new Promise(resolve => setTimeout(resolve, 30));
    const added = scene.records.find(entry => entry.records?.length)?.records[0];
    expect(added).toMatchObject({ id: '__eve_media_window_fullscreen', properties: { left: 0, top: 0, width: 900, height: 600, z_index: 499, selectable: false } });
    expect(isInPlaceMediaWindowOpen('__eve_media_window_fullscreen')).toBe(true);
    expect([iframe().style.width, iframe().style.height]).toEqual(['900px', '600px']);
    runtime.toggleFullscreen(); tick();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(scene.records.some(entry => entry.removeAtomeIds?.includes('__eve_media_window_fullscreen'))).toBe(true);
    expect(isInPlaceMediaWindowOpen('__eve_media_window_fullscreen')).toBe(false);
});

test('the playing video is a shared playback entry; leaving the project stops it', async () => {
    const { win, runtime, iframe, fromHost, watchCommands } = setup();
    await runtime.transport('play', 'video');
    expect(getSelectedProjectMediaPlayback('video')).toMatchObject({ kind: 'video', playing: false });
    watchCommands(); fromHost({ type: 'state', state: 1 });
    expect(getSelectedProjectMediaPlayback('video').playing).toBe(true);
    fromHost({ type: 'state', state: 2 });
    expect(getSelectedProjectMediaPlayback('video').playing).toBe(false);
    win.dispatchEvent(new win.CustomEvent('eve:workspace-mode-changed', { detail: { mode: 'dashboard' } }));
    expect(iframe()).toBeNull();
    expect(getSelectedProjectMediaPlayback('video')).toBeUndefined();
    // The registry stopping it (another project) releases the player too.
    await runtime.transport('play', 'video');
    await stopSelectedProjectMediaPlayback(win, 'video');
    expect(iframe()).toBeNull();
    win.close();
});

test('YouTube fullscreen suspends the actual menu tree and its hit targets until the second double-click', async () => {
    const { runtime, iframe, menu, menuReady, win } = setup();
    await menuReady;
    await runtime.transport('play', 'video');
    await new Promise(resolve => setTimeout(resolve, 30));
    const canvas = win.document.querySelector('canvas');
    const hit = () => menu.hitTestAtClientPoint({ surface: canvas, clientX: 30, clientY: 40 });
    const layer = surface.layers.get('inplace_media_window:video');
    const originalSize = [iframe().style.width, iframe().style.height];
    expect(hit()?.treeId).toBe(BEVY_MAIN_MENU_TREE_ID);
    layer({ phase: 'double_click', target: { id: 'video' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(menu.state.treeOpacities.get(BEVY_MAIN_MENU_TREE_ID)).toBe(0);
    expect(hit()).toBeNull();
    layer({ phase: 'click', target: null });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(true);
    layer({ phase: 'double_click', target: null });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(false);
    expect(menu.state.treeOpacities.get(BEVY_MAIN_MENU_TREE_ID)).toBe(1);
    expect(hit()?.treeId).toBe(BEVY_MAIN_MENU_TREE_ID);
    expect([iframe().style.width, iframe().style.height]).toEqual(originalSize);
    await runtime.setActive(false);
    win.close();
});

test('rapid fullscreen toggles and closing restore the menu opacity without stopping playback', async () => {
    const { runtime, menu, menuReady, iframe, win } = setup({ menuOpacity: 0.6 });
    await menuReady;
    await runtime.transport('play', 'video');
    runtime.toggleFullscreen(); runtime.toggleFullscreen(); runtime.toggleFullscreen();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(true);
    expect(iframe()).not.toBeNull();
    await runtime.setActive(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(false);
    expect(menu.state.treeOpacities.get(BEVY_MAIN_MENU_TREE_ID)).toBe(0.6);
    win.close();
});

test('fullscreen preserves an existing menu suspension and does not release a Dashboard suspension', async () => {
    for (const previouslySuspended of [true, false]) {
        const { runtime, menu, menuReady, win } = setup();
        await menuReady;
        await runtime.transport('play', 'video');
        if (previouslySuspended) await menu.setTreeSuspended({ id: BEVY_MAIN_MENU_TREE_ID, suspended: true });
        runtime.toggleFullscreen();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!previouslySuspended) win.__eveDashboardMainMenuSuspended = true;
        await runtime.setActive(false);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(true);
        win.close();
    }
});

test('a held gesture leaves the fullscreen menu suspended after release', async () => {
    const { runtime, menu, menuReady, win } = setup();
    const previousWindow = globalThis.window;
    globalThis.window = win;
    try {
        await menuReady;
        await runtime.transport('play', 'video');
        runtime.toggleFullscreen();
        await new Promise(resolve => setTimeout(resolve, 0));
        await suspendGestureChrome();
        await restoreGestureChrome();
        expect(menu.state.sourceTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(true);
        expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(true);
        expect(win.__eveDashboardMainMenuSuspended).not.toBe(true);
        runtime.toggleFullscreen();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(menu.state.suspendedTrees.has(BEVY_MAIN_MENU_TREE_ID)).toBe(false);
    } finally {
        await runtime.setActive(false);
        globalThis.window = previousWindow;
        win.close();
    }
});

test('the main menu glow stops painting while YouTube fullscreen holds its suspension', async () => {
    const { runtime, menu, menuReady, win } = setup();
    const previousWindow = globalThis.window;
    globalThis.window = win;
    const patches = [];
    const menuRuntime = createBevyUiMainMenuRuntime({
        content: { toolbox: { children: ['find'] }, find: { atome_tool: true,
            tool_id: 'tool.main.find', action: 'toggle', label: 'Find', icon: 'find' } },
        surfaceResolver: () => win.document.querySelector('canvas'),
        runtimeResolver: () => ({
            state: menu.state, mountTree: async payload => payload.tree, updateTree: async payload => payload.tree,
            updateTreeMotion: async payload => { patches.push(payload); }, unmountTree: async () => null
        })
    });
    try {
        await menuReady;
        menuRuntime.setToolLatchedState({ tool_id: 'tool.main.find', latched: true });
        await menuRuntime.showFully();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(patches.length).toBeGreaterThan(0);
        await runtime.transport('play', 'video');
        runtime.toggleFullscreen();
        await new Promise(resolve => setTimeout(resolve, 0));
        const count = patches.length;
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(patches).toHaveLength(count);
        runtime.toggleFullscreen();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(patches.length).toBeGreaterThan(count);
    } finally {
        menuRuntime.destroy();
        await runtime.setActive(false);
        globalThis.window = previousWindow;
        win.close();
    }
});
